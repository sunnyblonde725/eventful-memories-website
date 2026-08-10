document.getElementById("nav-toggle")?.addEventListener("click", () => {
  const menu = document.getElementById("nav-menu");
  const toggle = document.getElementById("nav-toggle");
  const isOpen = menu.classList.toggle("nav-open");
  toggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll("#nav-menu a").forEach((link) => {
  link.addEventListener("click", () => {
    document.getElementById("nav-menu")?.classList.remove("nav-open");
    document.getElementById("nav-toggle")?.setAttribute("aria-expanded", "false");
  });
});
