(() => {
  const carousel = document.querySelector(".hero-carousel");
  if (!carousel) return;

  const slides = [...carousel.querySelectorAll(".hero-slide")];
  const controls = carousel.querySelector(".hero-carousel-controls");
  const toggle = controls.querySelector("[data-hero-toggle]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let timer;
  let gesture;
  let slideAnimations = [];
  let paused = motion.matches;

  function show(index, direction) {
    slideAnimations.forEach(animation => animation.cancel());
    slideAnimations = [];

    const outgoing = slides[active];
    const incoming = slides[index];
    outgoing.classList.remove("is-active");
    outgoing.setAttribute("aria-hidden", "true");
    active = index;
    incoming.classList.add("is-active");
    incoming.removeAttribute("aria-hidden");

    if (motion.matches || typeof incoming.animate !== "function") return;

    const timing = { duration: 550, easing: "cubic-bezier(.25,.65,.35,1)" };
    const edge = direction * 100;
    slideAnimations = [
      outgoing.animate([
        { transform: "translateX(0)", opacity: 1 },
        { transform: `translateX(${-edge}%)`, opacity: 1 }
      ], timing),
      incoming.animate([
        { transform: `translateX(${edge}%)` },
        { transform: "translateX(0)" }
      ], timing)
    ];
  }

  function advance(direction) {
    for (let offset = 1; offset < slides.length; offset++) {
      const index = (active + direction * offset + slides.length) % slides.length;
      const image = slides[index].querySelector("img");
      if (image.complete && image.naturalWidth) {
        show(index, direction);
        return;
      }
    }
  }

  function schedule() {
    window.clearInterval(timer);
    if (!paused && !gesture && !document.hidden && !carousel.matches(":hover, :focus-within")) {
      timer = window.setInterval(() => advance(1), 2000);
    }
  }

  function updateToggle() {
    toggle.textContent = paused ? "▶" : "Ⅱ";
    toggle.setAttribute("aria-label", paused ? "Start pizza slideshow" : "Pause pizza slideshow");
    schedule();
  }

  controls.querySelector("[data-hero-prev]").addEventListener("click", () => advance(-1));
  controls.querySelector("[data-hero-next]").addEventListener("click", () => advance(1));
  carousel.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest("button")) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
    carousel.setPointerCapture(event.pointerId);
    schedule();
  });
  carousel.addEventListener("pointerup", event => {
    if (gesture?.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    gesture = undefined;
    if (Math.abs(dx) >= 36 && Math.abs(dx) > 1.35 * Math.abs(dy)) {
      advance(dx > 0 ? -1 : 1);
    }
    schedule();
  });
  carousel.addEventListener("lostpointercapture", event => {
    if (gesture?.id !== event.pointerId) return;
    gesture = undefined;
    schedule();
  });
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
