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

      list.modifiers.forEach((mod) => {
        const row = document.createElement("label");
        row.className = "quote-modifier-row";
        const inputType = isChoice ? "radio" : "checkbox";
        const inputName = isChoice ? `mod-${list.id}` : `mod-${list.id}-${mod.id}`;
        row.innerHTML = `
          <input type="${inputType}" name="${inputName}" value="${mod.id}" data-price="${mod.price}" />
          <span>${mod.name}</span>
          <span class="mod-price">${formatPrice(mod.price, mod.name)}</span>
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

  updateTotal();
}

function changeHours(delta) {
  const el = document.getElementById("hours-count");
  const next = Math.max(0, parseInt(el.textContent) + delta);
  el.textContent = next;
  updateTotal();
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

  const total = basePrice + modTotal + (hours * hourRate);
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

  return items;
}

document.getElementById("inquiry-form")?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const submitBtn = document.getElementById("booking-submit-btn");
  const originalText = submitBtn.textContent;
  submitBtn.textContent = "Sending...";
  submitBtn.disabled = true;

  const lineItems = buildLineItems();

  const payload = {
    name: document.getElementById("inq-name").value.trim(),
    email: document.getElementById("inq-email").value.trim(),
    phone: document.getElementById("inq-phone")?.value.trim() || "",
    eventDate: document.getElementById("inq-date").value,
    venue: document.getElementById("inq-venue").value.trim(),
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
      e.target.style.display = "none";
      document.getElementById("inquiry-success").style.display = "block";
    } else {
      throw new Error(data.error || "Something went wrong.");
    }
  } catch (err) {
    submitBtn.textContent = originalText;
    submitBtn.disabled = false;
    alert(err.message || "Something went wrong — please try again or email us at lorenne@eventfulmemoriesco.com");
  }
});

loadCatalog();
