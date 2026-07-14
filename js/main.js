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

  // Base package
  const baseEl = document.createElement("div");
  baseEl.className = "quote-section";
  baseEl.innerHTML = `
    <h3>${item.name}</h3>
    <p class="quote-desc">${item.description}</p>
    <div class="quote-base-price">$${(basePrice / 100).toFixed(2)} base — 3 hours, setup &amp; teardown included</div>
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
  const basePrice = catalogData.items[0]?.variations[0]?.price || 40000;

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

document.getElementById("inquiry-form")?.addEventListener("submit", (e) => {
  e.preventDefault();
  document.getElementById("inquiry-form").style.display = "none";
  document.getElementById("inquiry-success").style.display = "block";
});

loadCatalog();
