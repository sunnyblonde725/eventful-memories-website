(function () {
  const grid = document.querySelector(".portfolio-grid-full");
  if (!grid) return;

  const images = Array.from(grid.querySelectorAll("img"));
  let current = 0;

  // Build lightbox DOM
  const lb = document.createElement("div");
  lb.className = "lightbox";
  lb.innerHTML = `
    <button class="lightbox-close" aria-label="Close">&#x2715;</button>
    <button class="lightbox-prev" aria-label="Previous">&#8249;</button>
    <img class="lightbox-img" src="" alt="" />
    <button class="lightbox-next" aria-label="Next">&#8250;</button>
  `;
  document.body.appendChild(lb);

  const lbImg = lb.querySelector(".lightbox-img");

  function show(index) {
    current = (index + images.length) % images.length;
    lbImg.src = images[current].src;
    lbImg.alt = images[current].alt;
    lb.classList.add("lightbox--active");
    document.body.style.overflow = "hidden";
  }

  function close() {
    lb.classList.remove("lightbox--active");
    document.body.style.overflow = "";
  }

  images.forEach((img, i) => img.addEventListener("click", () => show(i)));

  lb.querySelector(".lightbox-close").addEventListener("click", close);
  lb.querySelector(".lightbox-prev").addEventListener("click", () => show(current - 1));
  lb.querySelector(".lightbox-next").addEventListener("click", () => show(current + 1));

  lb.addEventListener("click", (e) => { if (e.target === lb) close(); });

  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("lightbox--active")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
})();
