// Availability calendar widget — booking page only

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function pad(n) { return String(n).padStart(2, "0"); }
function dayIso(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function monthKey(y, m) { return `${y}-${pad(m + 1)}`; }
function todayIso() {
  const n = new Date();
  return dayIso(n.getFullYear(), n.getMonth(), n.getDate());
}

const cal = {
  year: 0,
  month: 0,
  selected: null,
  cache: {},          // ISO date → "unavailable" | "public"
  fetched: new Set(), // "YYYY-MM" keys already loaded
  error: false,
  loading: false,
};

async function fetchWindow(y, m) {
  const key = monthKey(y, m);
  if (cal.fetched.has(key)) return;

  cal.loading = true;
  renderGrid();

  try {
    const res = await fetch(`/.netlify/functions/availability?start=${dayIso(y, m, 1)}`);
    const data = await res.json();
    if (data.error) throw new Error("error");
    Object.assign(cal.cache, data);
    for (let i = 0; i < 3; i++) {
      const d = new Date(y, m + i, 1);
      cal.fetched.add(monthKey(d.getFullYear(), d.getMonth()));
    }
    cal.error = false;
    document.getElementById("cal-error").style.display = "none";
  } catch {
    cal.error = true;
    document.getElementById("cal-error").style.display = "block";
  }

  cal.loading = false;
  renderGrid();
}

function getState(iso) {
  if (cal.error) return "available"; // fail open — don't block bookings
  return cal.cache[iso] || "available";
}

function renderGrid() {
  const grid = document.getElementById("cal-grid");
  if (!grid) return;

  const { year: y, month: m } = cal;
  const now = new Date();
  const today = todayIso();

  document.getElementById("cal-label").textContent = `${MONTHS[m]} ${y}`;

  const prevBtn = document.getElementById("cal-prev");
  const nextBtn = document.getElementById("cal-next");
  prevBtn.disabled = y < now.getFullYear() || (y === now.getFullYear() && m <= now.getMonth());
  nextBtn.disabled = new Date(y, m, 1) >= new Date(now.getFullYear(), now.getMonth() + 12, 1);

  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let html = DAYS.map(h => `<span class="cal-dh">${h}</span>`).join("");
  for (let i = 0; i < firstDow; i++) html += `<span class="cal-dc"></span>`;

  for (let d = 1; d <= daysInMonth; d++) {
    const iso = dayIso(y, m, d);
    const past = iso < today;
    const isToday = iso === today;
    const isSelected = iso === cal.selected;

    let state = "available";
    if (!past && !cal.loading) state = getState(iso);

    let cls = "cal-dc";
    if (isSelected) cls += " cal-dc--sel";
    else if (past || cal.loading) cls += past ? " cal-dc--past" : " cal-dc--loading";
    else if (state === "unavailable") cls += " cal-dc--unavail";
    else if (state === "public") cls += " cal-dc--public";
    else cls += " cal-dc--avail";
    if (isToday) cls += " cal-dc--today";

    const clickable = !past && !cal.loading && (state === "available" || state === "public");
    const data = clickable ? `data-date="${iso}" data-state="${state}"` : "";
    html += `<span class="${cls}" ${data}>${d}</span>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll("[data-date]").forEach(el => {
    el.addEventListener("click", () => handleClick(el.dataset.date, el.dataset.state));
  });
}

function handleClick(iso, state) {
  const msg = document.getElementById("cal-public-msg");
  msg.style.display = state === "public" ? "block" : "none";
  if (state !== "available") return;
  cal.selected = iso;
  const input = document.getElementById("inq-date");
  if (input) input.value = iso;
  renderGrid();
}

async function navigate(delta) {
  document.getElementById("cal-public-msg").style.display = "none";
  const d = new Date(cal.year, cal.month + delta, 1);
  cal.year = d.getFullYear();
  cal.month = d.getMonth();
  await fetchWindow(cal.year, cal.month);
}

async function initCalendar() {
  const now = new Date();
  cal.year = now.getFullYear();
  cal.month = now.getMonth();

  document.getElementById("cal-prev").addEventListener("click", () => navigate(-1));
  document.getElementById("cal-next").addEventListener("click", () => navigate(1));

  renderGrid();
  await fetchWindow(cal.year, cal.month);
}

initCalendar();
