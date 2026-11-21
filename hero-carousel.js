(() => {
  const carousel = document.querySelector(".hero-carousel");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll(".hero-slide")];
  const controls = carousel.querySelector(".hero-carousel-controls");
  const toggle = controls.querySelector("[data-hero-toggle]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let timer;
  let paused = motion.matches;

  function show(index) {
    slides[active].classList.remove("is-active");
    slides[active].setAttribute("aria-hidden", "true");
    active = index;
    slides[active].classList.add("is-active");
    slides[active].removeAttribute("aria-hidden");
  }

  function advance(direction) {
    for (let offset = 1; offset < slides.length; offset++) {
      const index = (active + direction * offset + slides.length) % slides.length;
      const image = slides[index].querySelector("img");
      if (image.complete && image.naturalWidth) {
        show(index);
        return;
      }
    }
  }

  function schedule() {
    window.clearInterval(timer);
    if (!paused && !document.hidden && !carousel.matches(":hover, :focus-within")) {
      timer = window.setInterval(() => advance(1), 5000);
    }
  }

  function updateToggle() {
    toggle.textContent = paused ? "▶" : "Ⅱ";
    toggle.setAttribute("aria-label", paused ? "Start pizza slideshow" : "Pause pizza slideshow");
    schedule();
  }

  controls.querySelector("[data-hero-prev]").addEventListener("click", () => advance(-1));
  controls.querySelector("[data-hero-next]").addEventListener("click", () => advance(1));
  toggle.addEventListener("click", () => {
    paused = !paused;
    updateToggle();
  });
  motion.addEventListener("change", event => {
    paused = event.matches;
    updateToggle();
  });
  ["mouseenter", "mouseleave", "focusin", "focusout"].forEach(event => {
    carousel.addEventListener(event, () => window.setTimeout(schedule, 0));
  });
  document.addEventListener("visibilitychange", schedule);

  controls.hidden = false;
  updateToggle();
})();
