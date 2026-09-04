(function () {
  const bumper = document.getElementById("welcome-bumper");
  if (!bumper) return;

  const params = new URLSearchParams(window.location.search);
  const forceReplay = params.get("welcome") === "1";
  const shot = params.get("shot");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;
  const storageKey = "xstation-welcome-seen";
  let seen = false;

  try {
    seen = window.sessionStorage.getItem(storageKey) === "1";
  } catch (_) {
    seen = false;
  }

  if (shot || (seen && !forceReplay) || !gsap) {
    bumper.remove();
    return;
  }

  const slots = [
    [-3, -1], [-3, 0], [-3, 1],
    [-2, -1.5], [-2, -0.5], [-2, 0.5], [-2, 1.5],
    [-1, -1.5], [-1, -0.5], [-1, 0.5], [-1, 1.5],
    [1, -1.5], [1, -0.5], [1, 0.5], [1, 1.5],
    [2, -1.5], [2, -0.5], [2, 0.5], [2, 1.5],
    [3, -1], [3, 0], [3, 1],
  ];
  const palette = ["ivory", "ivory", "steel", "peri", "gold", "gold", "dim", "peri"];
  const far = -1880;
  const near = 620;
  const travel = near - far;
  const compact = window.innerWidth < 720;
  const colPitch = compact ? 70 : 104;
  const rowPitch = compact ? 128 : 186;
  const gutter = compact ? 108 : 208;
  const rail = compact ? 260 : 460;
  const field = bumper.querySelector(".welcome-field");
  const state = { t: 0, fieldAlpha: 0, exit: 0 };

  function alphaAt(progress, peak) {
    if (progress < 0.12) return (progress / 0.12) * peak;
    if (progress > 0.84) return ((1 - progress) / 0.16) * peak;
    return peak;
  }

  const slabs = reduce ? [] : slots.map(([col, row], index) => {
    const slab = document.createElement("div");
    const color = palette[index % palette.length];
    const width = Math.abs(col) === 1 ? 22 : Math.abs(col) === 2 ? 18 : 14;
    const x = col * colPitch + Math.sign(col) * gutter;
    const y = row * rowPitch;
    slab.className = `welcome-slab${color === "ivory" ? "" : ` is-${color}`}`;
    slab.style.setProperty("--slab-w", `${compact ? width * 0.82 : width}px`);
    slab.style.setProperty("--slab-h", `${Math.round(width * (compact ? 3.65 : 4.08))}px`);
    field?.appendChild(slab);
    return {
      element: slab,
      phase: ((col + 3) * 0.11 + (row + 1.5) * 0.17 + index * 0.02) % 1,
      x,
      y,
      railX: Math.sign(col) * rail,
      peak: color === "gold" || color === "peri" ? 0.78 : 0.52,
    };
  });

  function renderField() {
    slabs.forEach((slab) => {
      const progress = (slab.phase + state.t) % 1;
      const exit = state.exit;
      gsap.set(slab.element, {
        x: slab.x + (slab.railX - slab.x) * 0.42 * exit,
        y: slab.y * (1 - 0.22 * exit),
        z: far + progress * travel + exit * 280,
        xPercent: -50,
        yPercent: -50,
        scaleX: 1 + exit * 0.08,
        scaleY: 1 + exit * 0.46,
        autoAlpha: alphaAt(progress, slab.peak) * state.fieldAlpha * (1 - exit),
        force3D: true,
      });
    });
  }

  document.documentElement.classList.add("is-welcoming");
  window.__xstationWelcomeActive = true;

  const titleLines = bumper.querySelectorAll(".welcome-title span");
  gsap.set(titleLines, {
    autoAlpha: reduce ? 1 : 0,
    y: reduce ? 0 : 28,
    scale: reduce ? 1 : 0.96,
  });
  gsap.set(".welcome-brand", {
    autoAlpha: reduce ? 1 : 0,
    y: reduce ? 0 : -12,
  });
  renderField();

  const flight = reduce ? null : gsap.to(state, {
    t: "+=1",
    duration: 8,
    repeat: -1,
    ease: "none",
    onUpdate: renderField,
  });

  let orbitReady = false;
  let finished = false;
  let holdingForOrbit = false;

  function finish() {
    if (finished) return;
    finished = true;
    flight?.kill();
    window.__xstationWelcomeActive = false;
    document.documentElement.classList.remove("is-welcoming");
    bumper.remove();
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch (_) {
      // Storage can be unavailable in privacy-restricted browsing contexts.
    }
    window.removeEventListener("xstation:orbit-ready", releaseToOrbit);
    window.removeEventListener("pointerup", accelerate);
    window.removeEventListener("wheel", accelerate);
    window.removeEventListener("touchstart", accelerate);
    window.removeEventListener("keydown", accelerate);
  }

  function waitForOrbit() {
    if (orbitReady) {
      requestAnimationFrame(() => timeline.play());
      return;
    }
    holdingForOrbit = true;
  }

  function releaseToOrbit() {
    orbitReady = true;
    if (holdingForOrbit) timeline.play();
  }

  function accelerate(event) {
    if (event.type === "wheel" || event.type === "touchstart" || event.type === "keydown") {
      event.preventDefault();
    }
    if (timeline.timeScale() < 2.8) timeline.timeScale(2.8);
  }

  const timeline = gsap.timeline({ onComplete: finish });
  if (reduce) {
    timeline
      .to({}, { duration: 0.3 })
      .addPause("ready", waitForOrbit)
      .to(bumper, { autoAlpha: 0, duration: 0.32, ease: "power2.inOut" })
      .to("#site-nav, #hero-copy", { autoAlpha: 1, duration: 0.28, ease: "power2.out" }, "<+=0.08");
  } else {
    timeline
      .to(state, { fieldAlpha: 1, duration: 0.72, ease: "power2.out", onUpdate: renderField }, 0)
      .to(titleLines, {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        duration: 0.72,
        stagger: 0.08,
        ease: "expo.out",
      }, 0.46)
      .to(".welcome-brand", { autoAlpha: 1, y: 0, duration: 0.7, ease: "power2.out" }, 0.64)
      .to({}, { duration: 0.34 })
      .addPause("ready", waitForOrbit)
      .to(titleLines, {
        autoAlpha: 0,
        y: -24,
        duration: 0.4,
        stagger: 0.05,
        ease: "power3.in",
      })
      .to(".welcome-brand", { autoAlpha: 0, y: -10, duration: 0.34, ease: "power2.in" }, "<")
      .to(flight, { timeScale: 3.4, duration: 0.3, ease: "power2.in" }, "<")
      .to(state, { exit: 1, duration: 0.72, ease: "power3.in", onUpdate: renderField }, "<")
      .to(".welcome-atmosphere", { autoAlpha: 0, duration: 0.5, ease: "power2.in" }, "<+=0.16")
      .to(bumper, { autoAlpha: 0, duration: 0.34, ease: "power2.inOut" }, "<+=0.26")
      .to("#site-nav, #hero-copy", { autoAlpha: 1, duration: 0.58, stagger: 0.06, ease: "power3.out" }, "<+=0.08");
  }

  window.addEventListener("xstation:orbit-ready", releaseToOrbit);
  window.addEventListener("pointerup", accelerate, { passive: true });
  window.addEventListener("wheel", accelerate, { passive: false });
  window.addEventListener("touchstart", accelerate, { passive: false });
  window.addEventListener("keydown", accelerate, { passive: false });
})();
