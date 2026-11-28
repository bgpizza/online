(() => {
  const carousel = document.querySelector(".hero-carousel");
  if (!carousel) return;

  const defaultSlides = [...carousel.querySelectorAll(".hero-slide")];
  let slides = defaultSlides;
  let configVersion = 0;
  const controls = carousel.querySelector(".hero-carousel-controls");
  const toggle = controls.querySelector("[data-hero-toggle]");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let active = 0;
  let timer;
  let gesture;
  let slideAnimations = [];
  const connection = navigator.connection;
  const preferStatic = () => motion.matches || connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType || "");
  let paused = preferStatic();
  let advancing = false;

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

  async function advance(direction) {
    if (advancing) return;
    advancing = true;
    const currentSlides = slides;
    try {
      for (let offset = 1; offset < currentSlides.length; offset++) {
        const index = (active + direction * offset + currentSlides.length) % currentSlides.length;
        const image = currentSlides[index].querySelector("img");
        if (await loadImage(image) && slides === currentSlides) {
          show(index, direction);
          return;
        }
        if (slides !== currentSlides) return;
      }
    } finally {
      advancing = false;
    }
  }

  function schedule() {
    window.clearInterval(timer);
    if (!paused && !gesture && !document.hidden && !carousel.matches(":hover, :focus-within")) {
      timer = window.setInterval(() => advance(1), 4500);
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
    paused = preferStatic();
    updateToggle();
  });
  ["mouseenter", "mouseleave", "focusin", "focusout"].forEach(event => {
    carousel.addEventListener(event, () => window.setTimeout(schedule, 0));
  });
  document.addEventListener("visibilitychange", schedule);

  function replaceSlides(next, custom = false) {
    slideAnimations.forEach(animation => animation.cancel());
    slideAnimations = [];
    slides.forEach(slide => slide.remove());
    slides = next;
    active = 0;
    slides.forEach((slide, index) => {
      const visible = index === active;
      slide.classList.toggle("is-active", visible);
      if (visible) slide.removeAttribute("aria-hidden");
      else slide.setAttribute("aria-hidden", "true");
      controls.before(slide);
    });
    controls.hidden = slides.length < 2;
    carousel.toggleAttribute("data-custom-slides", custom);
    carousel.dispatchEvent(new Event("hero-slides-updated"));
    schedule();
  }

  const imageLoads = new WeakMap();

  function loadImage(image) {
    if (imageLoads.has(image)) return imageLoads.get(image);
    if (!image.dataset.heroSrc) return Promise.resolve(image.complete && image.naturalWidth > 0);
    const loading = new Promise(resolve => {
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = image.dataset.heroSrc;
      delete image.dataset.heroSrc;
    });
    imageLoads.set(image, loading);
    return loading;
  }

  function makeSlide(data) {
    if (typeof data?.title !== "string" || typeof data.url !== "string"
      || !/^(hero-images\/[a-z0-9-]+\.webp$|https:\/\/firebasestorage\.googleapis\.com\/)/.test(data.url)) return null;
    const slide = document.createElement("figure");
    slide.className = "hero-slide";
    const image = new Image(1440, 540);
    image.alt = data.title;
    image.draggable = false;
    image.decoding = "async";
    image.dataset.heroSrc = data.url;
    slide.append(image);
    return slide;
  }

  let lastConfig;
  window.db?.collection("settings").doc("storefront").onSnapshot(async snapshot => {
    const config = snapshot.data()?.heroSlides;
    const signature = JSON.stringify(config);
    if (signature === lastConfig) return;
    lastConfig = signature;
    const version = ++configVersion;
    if (!Array.isArray(config) || !config.length) {
      if (slides !== defaultSlides) replaceSlides(defaultSlides);
      return;
    }
    const next = config.slice(0, 20).map(makeSlide).filter(Boolean);
    while (next.length && !(await loadImage(next[0].querySelector("img")))) next.shift();
    if (version === configVersion) replaceSlides(next.length ? next : defaultSlides, next.length > 0);
  }, () => {});

  controls.hidden = slides.length < 2;
  updateToggle();
})();
