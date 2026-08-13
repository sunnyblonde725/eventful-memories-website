const { google } = require("googleapis");

const SQUARE_VERSION = "2024-02-22";
const SANDBOX = process.env.SQUARE_ENVIRONMENT === "sandbox";
const SQUARE_BASE = SANDBOX
  ? "https://connect.squareupsandbox.com/v2"
  : "https://connect.squareup.com/v2";
const SQUARE_TOKEN = SANDBOX
  ? process.env.SQUARE_SANDBOX_TOKEN
  : process.env.SQUARE_PRODUCTION_TOKEN;

async function square(path, method, body) {
  const res = await fetch(`${SQUARE_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SQUARE_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": SQUARE_VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data.errors));
  return data;
}

function isoDate(d) {
  return d.toISOString().split("T")[0];
}

function friendlyDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

// Look up a promo code against Square's discount catalog (case-insensitive name match).
async function getSquareDiscount(code) {
  if (!code) return null;
  const res = await square("/catalog/list?types=DISCOUNT", "GET");
  const discounts = res.objects || [];
  const match = discounts.find(
    (d) => d.discount_data?.name?.toLowerCase() === code.trim().toLowerCase()
  );
  if (!match) return null;
  const percent = parseFloat(match.discount_data?.percentage);
  return isNaN(percent) ? null : { name: match.discount_data.name, percent };
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method not allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request." }) };
  }

  const { name, email, phone, eventDate, venue, eventType, eventDescription, message, lineItems, promoCode } = body;

  if (!name || !email || !eventDate || !lineItems?.length) {
    return { statusCode: 400, body: JSON.stringify({ error: "Please fill in all required fields." }) };
  }

  const promoDiscount = await getSquareDiscount(promoCode);
  const promoPercent = promoDiscount?.percent || null;

  const nameParts = name.trim().split(" ");
  const firstName = nameParts[0];
  const lastName = nameParts.slice(1).join(" ") || "";

  // Deposit due in 3 days, balance due 7 days before event
  const depositDue = new Date();
  depositDue.setDate(depositDue.getDate() + 3);

  const eventDay = new Date(eventDate + "T12:00:00");
  const balanceDue = new Date(eventDay);
  balanceDue.setDate(balanceDue.getDate() - 7);

  // If event is less than 7 days away, balance is due the day after deposit
  if (balanceDue <= depositDue) {
    balanceDue.setTime(depositDue.getTime());
    balanceDue.setDate(balanceDue.getDate() + 1);
  }

  const locationId = process.env.SQUARE_LOCATION_ID;
  if (!locationId) {
    return { statusCode: 500, body: JSON.stringify({ error: "Server configuration error. Please contact us directly." }) };
  }

  try {
    // 1. Create Square customer
    const customerRes = await square("/customers", "POST", {
      given_name: firstName,
      family_name: lastName,
      email_address: email,
      phone_number: phone || undefined,
      idempotency_key: `customer-${email}-${Date.now()}`,
    });
    const customerId = customerRes.customer.id;

    // 2. Create Square order with line items
    const orderRes = await square("/orders", "POST", {
      idempotency_key: `order-${email}-${Date.now()}`,
      order: {
        location_id: locationId,
        customer_id: customerId,
        line_items: lineItems.map((item) => ({
          name: item.name,
          quantity: String(item.quantity || 1),
          base_price_money: { amount: item.amountCents, currency: "USD" },
        })),
        discounts: promoDiscount
          ? [{ name: `Promo: ${promoDiscount.name}`, percentage: String(promoDiscount.percent), scope: "ORDER" }]
          : undefined,
        metadata: {
          event_date: eventDate,
          venue: venue || "",
        },
      },
    });
    const orderId = orderRes.order.id;

    // 3. Create Square invoice with 50% deposit + balance schedule
    const invoiceRes = await square("/invoices", "POST", {
      idempotency_key: `invoice-${email}-${Date.now()}`,
      invoice: {
        location_id: locationId,
        order_id: orderId,
        title: `Photo Booth Booking — ${friendlyDate(eventDate)}`,
        description: venue ? `Event at ${venue}` : undefined,
        primary_recipient: { customer_id: customerId },
        delivery_method: "EMAIL",
        accepted_payment_methods: { card: true },
        payment_requests: [
          {
            request_type: "DEPOSIT",
            percentage_requested: "50",
            due_date: isoDate(depositDue),
          },
          {
            request_type: "BALANCE",
            due_date: isoDate(balanceDue),
          },
        ],
      },
    });
    const invoiceId = invoiceRes.invoice.id;
    const invoiceVersion = invoiceRes.invoice.version ?? 0;

    // 4. Publish the invoice — this makes it payable and generates a public_url.
    // We share the link directly with the customer instead of using Square's email delivery.
    const publishRes = await square(`/invoices/${invoiceId}/publish`, "POST", {
      idempotency_key: `publish-${Date.now()}`,
      version: invoiceVersion,
    });
    const paymentUrl = publishRes.invoice?.public_url || null;

    // 5. Google Calendar — add pending event (non-fatal if this fails)
    if (process.env.GOOGLE_REFRESH_TOKEN) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET
        );
        auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
        const calendar = google.calendar({ version: "v3", auth });

        const packageName = lineItems.find((i) => i.isPackage)?.name || "Package";
        const addons = lineItems.filter((i) => !i.isPackage).map((i) => `${i.name}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join(", ");
        const totalCents = lineItems.reduce((sum, i) => sum + i.amountCents * (i.quantity || 1), 0);
        const totalDisplay = `$${(totalCents / 100).toFixed(2)}`;

        const dayAfter = new Date(eventDay);
        dayAfter.setDate(dayAfter.getDate() + 1);

        const descLines = [
          `Client: ${name}`,
          `Email: ${email}`,
          phone ? `Phone: ${phone}` : null,
          eventType ? `Event type: ${eventType}` : null,
          `Venue: ${venue || "TBD"}`,
          `Package: ${packageName}`,
          addons ? `Add-ons: ${addons}` : null,
          `Estimated Total: ${totalDisplay}`,
          promoDiscount ? `Promo code: ${promoDiscount.name} (${promoDiscount.percent}% off)` : null,
          ``,
          paymentUrl ? `💳 Payment link: ${paymentUrl}` : null,
          eventDescription ? `About the event: ${eventDescription}` : null,
          message ? `Additional notes: ${message}` : null,
          `⏳ Awaiting deposit payment.`,
          message ? `\nClient note: ${message}` : null,
        ].filter(Boolean).join("\n");

        await calendar.events.insert({
          calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
          requestBody: {
            summary: `📸 ${name} — ${packageName} [PENDING]`,
            description: descLines,
            start: { date: eventDate },
            end: { date: isoDate(dayAfter) },
            colorId: "5", // banana yellow = pending
            status: "tentative",
          },
        });
      } catch (calErr) {
        console.error("Google Calendar error (non-fatal):", calErr.message);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, paymentUrl }),
    };
  } catch (err) {
    console.error("Booking error:", err.message);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Something went wrong sending your booking. Please email us at inquiry@eventfulmemoriesco.com and we'll get you sorted." }),
    };
  }
};
