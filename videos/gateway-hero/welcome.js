(function () {
  const bumper = document.getElementById("welcome-bumper");
  if (!bumper) return;

  const params = new URLSearchParams(window.location.search);
  const shot = params.get("shot");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gsap = window.gsap;

  if (shot || !gsap) {
    bumper.remove();
    return;
  }

  const slots = [
    [-4, -1], [-4, 0], [-4, 1],
    [-3, -1.5], [-3, -0.5], [-3, 0.5], [-3, 1.5],
    [-2, -2], [-2, -1], [-2, 0], [-2, 1], [-2, 2],
    [-1, -2], [-1, -1], [-1, 0], [-1, 1], [-1, 2],
    [1, -2], [1, -1], [1, 0], [1, 1], [1, 2],
    [2, -2], [2, -1], [2, 0], [2, 1], [2, 2],
    [3, -1.5], [3, -0.5], [3, 0.5], [3, 1.5],
    [4, -1], [4, 0], [4, 1],
  ];
  const palette = ["ivory", "ivory", "steel", "peri", "gold", "gold", "dim", "peri"];
  const far = -1880;
  const near = 620;
  const travel = near - far;
  const field = bumper.querySelector(".welcome-field");
  const state = { t: 0, fieldAlpha: 0, exit: 0 };

  function getLayoutMetrics() {
    const width = window.visualViewport?.width || window.innerWidth;
    const height = window.visualViewport?.height || window.innerHeight;
    const shortLandscape = height < 500 && width > height;
    const compact = width < 768 || shortLandscape;
    return {
      compact,
      colPitch: compact ? 70 : 104,
      rowPitch: shortLandscape ? 94 : compact ? 128 : 186,
      gutter: shortLandscape ? 90 : compact ? 108 : 208,
      rail: compact ? 260 : 460,
      entryOffset: compact ? 64 : 96,
    };
  }

  let layoutMetrics = getLayoutMetrics();

  function alphaAt(progress, peak) {
    if (progress < 0.12) return (progress / 0.12) * peak;
    if (progress > 0.84) return ((1 - progress) / 0.16) * peak;
    return peak;
  }

  const slabs = reduce ? [] : slots.map(([col, row], index) => {
    const slab = document.createElement("div");
    const color = palette[index % palette.length];
    const width = Math.abs(col) === 1 ? 22 : Math.abs(col) === 2 ? 18 : 14;
    slab.className = `welcome-slab${color === "ivory" ? "" : ` is-${color}`}`;
    field?.appendChild(slab);
    return {
      element: slab,
      phase: ((col + 4) * 0.09 + (row + 2) * 0.13 + index * 0.019) % 1,
      col,
      row,
      width,
      x: 0,
      y: 0,
      entryY: 0,
      railX: 0,
      peak: color === "gold" || color === "peri" ? 0.78 : 0.52,
      intro: 0,
    };
  });

  function updateSlabLayout() {
    layoutMetrics = getLayoutMetrics();
    slabs.forEach((slab) => {
      const renderedWidth = layoutMetrics.compact ? slab.width * 0.82 : slab.width;
      slab.x = slab.col * layoutMetrics.colPitch + Math.sign(slab.col) * layoutMetrics.gutter;
      slab.y = slab.row * layoutMetrics.rowPitch;
      slab.entryY = slab.y + layoutMetrics.entryOffset;
      slab.railX = Math.sign(slab.col) * layoutMetrics.rail;
      slab.element.style.setProperty("--slab-w", `${renderedWidth}px`);
      slab.element.style.setProperty(
        "--slab-h",
        `${Math.round(slab.width * (layoutMetrics.compact ? 3.65 : 4.08))}px`,
      );
    });
  }

  updateSlabLayout();

  const introSlabs = [...slabs].sort((a, b) =>
    b.y - a.y
    || Math.abs(b.x) - Math.abs(a.x)
    || a.x - b.x
  );

  function renderField() {
    slabs.forEach((slab) => {
      const progress = (slab.phase + state.t) % 1;
      const exit = state.exit;
      const intro = slab.intro;
      gsap.set(slab.element, {
        x: slab.x + (slab.railX - slab.x) * 0.42 * exit,
        y: slab.y + (slab.entryY - slab.y) * (1 - intro) - slab.y * 0.22 * exit,
        z: far + progress * travel - (1 - intro) * 110 + exit * 280,
        xPercent: -50,
        yPercent: -50,
        scaleX: 0.92 + intro * 0.08 + exit * 0.08,
        scaleY: 0.82 + intro * 0.18 + exit * 0.46,
        autoAlpha: alphaAt(progress, slab.peak) * state.fieldAlpha * intro * (1 - exit),
        force3D: true,
      });
    });
  }

  document.documentElement.classList.add("is-welcoming");
  window.__xstationWelcomeActive = true;
  window.__xstationWelcomeEntryComplete = false;

  const titleWords = bumper.querySelectorAll(".welcome-word");
  gsap.set(titleWords, {
    yPercent: reduce ? 0 : 115,
  });
  renderField();
  if (!reduce) gsap.ticker.add(renderField);

  const flight = reduce ? null : gsap.to(state, {
    t: "+=1",
    duration: 8,
    repeat: -1,
    ease: "none",
    paused: true,
  });

  let orbitReady = false;
  let finished = false;
  let holdingForOrbit = false;
  let entryComplete = false;
  let timelineStarted = false;
  let startupTimer = 0;

  function signalEntryComplete() {
    if (entryComplete) return;
    entryComplete = true;
    window.__xstationWelcomeEntryComplete = true;
    window.dispatchEvent(new CustomEvent("xstation:welcome-entry-complete"));
  }

  function startTimeline() {
    if (timelineStarted || finished) return;
    timelineStarted = true;
    requestAnimationFrame(() => {
      flight?.play(0);
      timeline.play(0);
    });
  }

  function finish() {
    if (finished) return;
    finished = true;
    window.clearTimeout(startupTimer);
    flight?.kill();
    if (!reduce) gsap.ticker.remove(renderField);
    window.__xstationWelcomeActive = false;
    document.documentElement.classList.remove("is-welcoming");
    bumper.remove();
    window.dispatchEvent(new CustomEvent("xstation:welcome-finished"));
    window.removeEventListener("xstation:orbit-ready", releaseToOrbit);
    window.removeEventListener("pointerup", accelerate);
    window.removeEventListener("wheel", accelerate);
    window.removeEventListener("touchstart", accelerate);
    window.removeEventListener("keydown", accelerate);
    window.removeEventListener("resize", handleViewportResize);
    window.visualViewport?.removeEventListener("resize", handleViewportResize);
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
    window.clearTimeout(startupTimer);
    if (!timelineStarted) {
      startTimeline();
      return;
    }
    if (holdingForOrbit) timeline.play();
  }

  function accelerate(event) {
    if (event.type === "wheel" || event.type === "touchstart" || event.type === "keydown") {
      event.preventDefault();
    }
    if (timeline.timeScale() < 2.8) timeline.timeScale(2.8);
  }

  function handleViewportResize() {
    updateSlabLayout();
    renderField();
  }

  const timeline = gsap.timeline({ paused: true, onComplete: finish });
  if (reduce) {
    timeline
      .to({}, { duration: 0.9 })
      .call(signalEntryComplete)
      .addPause("ready", waitForOrbit)
      .call(
        () => window.dispatchEvent(new CustomEvent("xstation:welcome-exit-start")),
        [],
        "ready+=0.001",
      )
      .to(bumper, { autoAlpha: 0, duration: 0.6, ease: "power2.inOut" });
  } else {
    timeline
      .to(state, { fieldAlpha: 1, duration: 0.46, ease: "power2.out" }, 0)
      .to(introSlabs, {
        intro: 1,
        duration: 1.05,
        stagger: 0.025,
        ease: "expo.out",
      }, 0.04)
      .to(titleWords, {
        yPercent: 0,
        duration: 1.15,
        stagger: {
          each: 0.11,
          from: "start",
        },
        ease: "power4.out",
      }, 0.46)
      .call(signalEntryComplete)
      .to({}, { duration: 1.4 })
      .addPause("ready", waitForOrbit)
      .call(
        () => window.dispatchEvent(new CustomEvent("xstation:welcome-exit-start")),
        [],
        "ready+=0.001",
      )
      .to(titleWords, {
        yPercent: 115,
        duration: 1,
        stagger: {
          each: 0.09,
          from: "end",
        },
        ease: "power4.in",
      })
      .to(flight, { timeScale: 3.4, duration: 0.5, ease: "power2.in" }, "<")
      .to(state, { exit: 1, duration: 1.25, ease: "power3.in" }, "<")
      .to(".welcome-atmosphere", { autoAlpha: 0, duration: 0.85, ease: "power2.in" }, "<+=0.24")
      .to(bumper, { autoAlpha: 0, duration: 0.7, ease: "power2.inOut" }, "<+=0.38");
  }

  window.addEventListener("xstation:orbit-ready", releaseToOrbit);
  window.addEventListener("pointerup", accelerate, { passive: true });
  window.addEventListener("wheel", accelerate, { passive: false });
  window.addEventListener("touchstart", accelerate, { passive: false });
  window.addEventListener("keydown", accelerate, { passive: false });
  window.addEventListener("resize", handleViewportResize);
  window.visualViewport?.addEventListener("resize", handleViewportResize);

  startupTimer = window.setTimeout(releaseToOrbit, 15000);
  startTimeline();
})();
