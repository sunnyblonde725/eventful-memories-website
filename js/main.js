let catalogData = null;

async function loadCatalog() {
  try {
    const res = await fetch("/.netlify/functions/catalog");
    if (!res.ok) throw new Error("Failed to load");
    catalogData = await res.json();
    renderQuoteBuilder();
  } catch (e) {
    document.getElementById("quote-loading").style.display = "none";
    document.getElementById("quote-error").style.display = "block";
  }
}

function formatPrice(cents, name) {
  if (cents === 0) return name?.toLowerCase().includes("client") ? "Free" : "TBD";
  return `+$${(cents / 100).toFixed(2)}`;
}

const COMING_SOON = new Set(["Backdrop:Green screen", "Backdrop:We provide", "Backdrop:AI backdrop", "Props:We provide", "Guest Book:Guest book"]);

function renderQuoteBuilder() {
  const { items, modifierLists } = catalogData;
  const item = items[0];
  if (!item) return;

  const basePrice = item.variations[0]?.price || 40000;
  const container = document.getElementById("quote-items");
  container.innerHTML = "";

  // Base package — variation selector
  const baseEl = document.createElement("div");
  baseEl.className = "quote-section";
  let variationsHTML = [...item.variations].sort((a, b) => a.price - b.price).map((v, i) => `
    <label class="quote-modifier-row">
      <input type="radio" name="variation" value="${v.price}" ${i === 0 ? "checked" : ""} />
      <span>${v.name}</span>
      <span class="mod-price">$${(v.price / 100).toFixed(2)}</span>
    </label>
  `).join("");
  baseEl.innerHTML = `
    <h3>${item.name}</h3>
    <p class="quote-desc">${item.description}</p>
    ${variationsHTML}
    <p class="pricing-note" style="margin-top:0.5rem;">* Large events over 250 guests: +$100 per additional 100 guests.</p>
  `;
  container.appendChild(baseEl);

  // Additional hours stepper (skip the modifier list for this one, use stepper UI)
  const additionalTimeList = modifierLists.find((l) => l.name === "Additional Time");
  if (additionalTimeList) {
    const hourRate = additionalTimeList.modifiers[0]?.price || 7500;
    const section = document.createElement("div");
    section.className = "quote-section";
    section.innerHTML = `
      <h3>Additional Hours</h3>
      <div class="quote-stepper">
        <span>$${(hourRate / 100).toFixed(2)} per hour</span>
        <div class="stepper-controls">
          <button type="button" id="hours-minus">−</button>
          <span id="hours-count">0</span>
          <button type="button" id="hours-plus">+</button>
        </div>
      </div>
    `;
    container.appendChild(section);
  }

  // All other modifier lists
  modifierLists
    .filter((l) => l.name !== "Additional Time")
    .forEach((list) => {
      const section = document.createElement("div");
      section.className = "quote-section";

      const title = document.createElement("h3");
      title.textContent = list.name;
      section.appendChild(title);

      const isChoice = list.modifiers.some(
        (m) => m.name.toLowerCase().includes("provide") || m.name.toLowerCase().includes("client")
      );

      const defaultsToClientProvided = ["Backdrop", "Border/Overlay", "Props"].includes(list.name);

      list.modifiers.forEach((mod) => {
        const row = document.createElement("label");
        const isComingSoon = COMING_SOON.has(`${list.name}:${mod.name}`);
        row.className = "quote-modifier-row" + (isComingSoon ? " quote-modifier-row--unavailable" : "");
        const inputType = isChoice ? "radio" : "checkbox";
        const inputName = isChoice ? `mod-${list.id}` : `mod-${list.id}-${mod.id}`;
        const isDefault = defaultsToClientProvided && mod.name === "Client provides";
        const priceLabel = isComingSoon ? "Coming Soon" : formatPrice(mod.price, mod.name);
        row.innerHTML = `
          <input type="${inputType}" name="${inputName}" value="${mod.id}" data-price="${mod.price}" ${isDefault ? "checked" : ""} ${isComingSoon ? "disabled" : ""} />
          <span>${mod.name}</span>
          <span class="mod-price">${priceLabel}</span>
        `;
        section.appendChild(row);
      });

      container.appendChild(section);
    });

  document.getElementById("quote-loading").style.display = "none";
  document.getElementById("quote-builder").style.display = "block";

  // Event listeners
  container.addEventListener("change", updateTotal);
  document.getElementById("hours-minus")?.addEventListener("click", () => changeHours(-1));
  document.getElementById("hours-plus")?.addEventListener("click", () => changeHours(1));
  document.getElementById("inq-guests")?.addEventListener("input", updateTotal);

  updateTotal();
}

function changeHours(delta) {
  const el = document.getElementById("hours-count");
  const next = Math.max(0, parseInt(el.textContent) + delta);
  el.textContent = next;
  updateTotal();
}

function getLargeSurcharge() {
  const selectedVariation = document.querySelector('input[name="variation"]:checked');
  if (!selectedVariation) return 0;
  const label = selectedVariation.closest("label");
  const name = label?.querySelector("span:nth-child(2)")?.textContent?.toLowerCase() || "";
  if (!name.includes("large")) return 0;

  const guests = parseInt(document.getElementById("inq-guests")?.value || 0);
  if (!guests || guests <= 250) return 0;

  return Math.ceil((guests - 250) / 100) * 10000; // $100 per 100 guests over 250
}

function updateTotal() {
  if (!catalogData) return;
  const selectedVariation = document.querySelector('input[name="variation"]:checked');
  const basePrice = selectedVariation ? parseInt(selectedVariation.value) : (catalogData.items[0]?.variations[0]?.price || 40000);

  let modTotal = 0;
  document.querySelectorAll("#quote-items input:checked").forEach((input) => {
    modTotal += parseInt(input.dataset.price || 0);
  });

  const hours = parseInt(document.getElementById("hours-count")?.textContent || 0);
  const additionalTimeList = catalogData.modifierLists.find((l) => l.name === "Additional Time");
  const hourRate = additionalTimeList?.modifiers[0]?.price || 7500;

  const surcharge = getLargeSurcharge();
  const surchargeRow = document.getElementById("guest-surcharge-row");
  if (surcharge > 0) {
    const guests = parseInt(document.getElementById("inq-guests")?.value || 0);
    const extraTiers = Math.ceil((guests - 250) / 100);
    document.getElementById("guest-surcharge-label").textContent = `Guest count (${extraTiers}× 100 guests over 250)`;
    document.getElementById("guest-surcharge-amount").textContent = `+$${(surcharge / 100).toFixed(2)}`;
    surchargeRow.style.display = "flex";
  } else if (surchargeRow) {
    surchargeRow.style.display = "none";
  }

  const total = basePrice + modTotal + (hours * hourRate) + surcharge;
  document.getElementById("quote-price").textContent = `$${(total / 100).toFixed(2)}`;
}

function buildLineItems() {
  const items = [];

  // Selected package variation
  const selectedVariation = document.querySelector('input[name="variation"]:checked');
  if (selectedVariation && catalogData) {
    const label = selectedVariation.closest("label");
    const name = label?.querySelector("span:nth-child(2)")?.textContent?.trim() || "Package";
    items.push({ name, amountCents: parseInt(selectedVariation.value), quantity: 1, isPackage: true });
  }

  // Additional hours
  const hours = parseInt(document.getElementById("hours-count")?.textContent || 0);
  if (hours > 0 && catalogData) {
    const additionalTimeList = catalogData.modifierLists.find((l) => l.name === "Additional Time");
    const hourRate = additionalTimeList?.modifiers[0]?.price || 7500;
    items.push({ name: `Additional Hour${hours > 1 ? "s" : ""}`, amountCents: hourRate, quantity: hours, isPackage: false });
  }

  // Checked modifiers (checkboxes + radio groups excluding variation)
  document.querySelectorAll("#quote-items input:checked").forEach((input) => {
    if (input.name === "variation") return;
    const price = parseInt(input.dataset.price || 0);
    if (price === 0) return; // skip free/TBD items
    const label = input.closest("label");
    const name = label?.querySelector("span:nth-child(2)")?.textContent?.trim() || "Add-on";
    items.push({ name, amountCents: price, quantity: 1, isPackage: false });
  });

  // Large package guest surcharge
  const surcharge = getLargeSurcharge();
  if (surcharge > 0) {
    const guests = parseInt(document.getElementById("inq-guests")?.value || 0);
    const extraTiers = Math.ceil((guests - 250) / 100);
    items.push({ name: `Guest Count Surcharge (${extraTiers}× 100 guests over 250)`, amountCents: 10000, quantity: extraTiers, isPackage: false });
  }

  return items;
}

// ── Step 1 → Step 2: Continue button ──
document.getElementById("booking-continue-btn")?.addEventListener("click", () => {
  const form = document.getElementById("inquiry-form");
  const required = form.querySelectorAll("[required]");
  let valid = true;
  required.forEach((el) => {
    if (!el.value.trim()) {
      el.style.borderColor = "#c0392b";
      valid = false;
    } else {
      el.style.borderColor = "";
    }
  });
  if (!valid) {
    form.querySelector("[required]:invalid, [required]")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }

  // Load the Tally agreement form
  const frame = document.getElementById("agreement-frame");
  frame.removeAttribute("src");
  frame.setAttribute("data-tally-src", "https://tally.so/embed/2EdbXA?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=1");
  if (typeof Tally !== "undefined") Tally.loadEmbeds();

  document.getElementById("booking-step-2").style.display = "block";
  document.getElementById("booking-step-2").scrollIntoView({ behavior: "smooth", block: "start" });
});

// ── Booking submission (called automatically when agreement is signed) ──
async function submitBooking() {
  document.getElementById("booking-processing").style.display = "block";
  document.getElementById("booking-processing").scrollIntoView({ behavior: "smooth", block: "center" });

  const lineItems = buildLineItems();
  const payload = {
    name: document.getElementById("inq-name").value.trim(),
    email: document.getElementById("inq-email").value.trim(),
    phone: document.getElementById("inq-phone")?.value.trim() || "",
    eventDate: document.getElementById("inq-date").value,
    venue: document.getElementById("inq-venue").value.trim(),
    eventType: document.getElementById("inq-event-type")?.value.trim() || "",
    eventDescription: document.getElementById("inq-event-desc")?.value.trim() || "",
    promoCode: document.getElementById("inq-promo")?.value.trim() || "",
    message: document.getElementById("inq-message").value.trim(),
    lineItems,
  };

  try {
    const res = await fetch("/.netlify/functions/send-booking", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (res.ok && data.success) {
      document.getElementById("inquiry-form").style.display = "none";
      document.getElementById("booking-step-2").style.display = "none";
      const successEl = document.getElementById("inquiry-success");
      if (data.paymentUrl) {
        const linkEl = document.getElementById("deposit-pay-link");
        if (linkEl) {
          linkEl.href = data.paymentUrl;
          linkEl.style.display = "inline-block";
        }
      }
      successEl.style.display = "block";
      successEl.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      throw new Error(data.error || "Something went wrong.");
    }
  } catch {
    document.getElementById("booking-processing").style.display = "none";
    document.getElementById("booking-error").style.display = "block";
    document.getElementById("booking-error").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// ── Detect Tally form submission ──
window.addEventListener("message", (e) => {
  let data = e.data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { return; }
  }
  if (data && data.event === "Tally.FormSubmitted") {
    document.getElementById("agreement-frame").style.display = "none";
    submitBooking();
  }
});

loadCatalog();
