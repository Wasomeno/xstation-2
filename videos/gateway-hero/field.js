const DURATION = 8;
const WHISPER_DURATION = 18;
const FAR = -1880;
const NEAR = 620;
const TRAVEL = NEAR - FAR;
const PALETTE = ["ivory", "ivory", "ivory", "ivory", "steel", "steel", "gold", "dim"];
const KEEP_INDICES = [6, 14, 1, 4, 9, 12];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function alphaAt(p, peak) {
  if (p < 0.12) return (p / 0.12) * peak;
  if (p > 0.84) return ((1 - p) / 0.16) * peak;
  return peak;
}

function makeSlab(w, h, color) {
  const el = document.createElement("div");
  el.className = "slab";
  if (color !== "ivory") el.classList.add("is-" + color);
  el.style.width = w + "px";
  el.style.height = h + "px";
  el.setAttribute("aria-hidden", "true");
  return el;
}

function whisperXY(it) {
  const { side, row, inset } = it.whisperSample;
  const x = side * (window.innerWidth / 2 - 48 - inset);
  const y = (row - 1) * (window.innerHeight * 0.28);
  return { x, y };
}

function noopController() {
  return {
    items: [],
    mode: "idle",
    startIdle() {},
    setMode() {},
    setProgress() {},
    pause() {},
    resumeWhisper() {},
    layout() {},
    destroy() {},
  };
}

export function createField({ root, gsap, reduce }) {
  if (reduce || !root || !gsap) return noopController();

  const rng = mulberry32(0xa5c11e);
  const items = [];
  const state = { t: 0 };
  let mode = "idle";
  let passP = 0;
  let idleTl = null;
  let whisperTl = null;

  function layoutSlab(it, t, x = it.x, y = it.y, peak = it.peak) {
    const p = (it.phase + t) % 1;
    const z = FAR + p * TRAVEL;
    gsap.set(it.el, {
      x,
      y,
      z,
      xPercent: -50,
      yPercent: -50,
      rotationX: it.tiltX,
      rotationY: it.tiltY,
      autoAlpha: alphaAt(p, peak),
      force3D: true,
    });
  }

  function layout(t) {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      layoutSlab(it, t, it.idleX, it.idleY, it.peak);
    }
  }

  function layoutPass(t, u) {
    const pull = 0.4 * u;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const x = it.idleX + (it.railX - it.idleX) * pull;
      const y = it.idleY * (1 - pull * 0.25);
      layoutSlab(it, t, x, y, it.peak * (1 + 0.35 * u));
    }
  }

  function tickIdle() {
    if (mode === "idle") {
      layout(state.t);
      return;
    }
    if (mode === "pass" && passP < 0.78) {
      layoutPass(state.t, corridorU(passP));
    }
  }

  for (let i = 0; i < 22; i++) {
    const w = 14 + rng() * 36;
    const h = w * (2.8 + rng() * 1.6);
    const color = PALETTE[i % PALETTE.length];
    const el = makeSlab(w, h, color);
    root.appendChild(el);

    const ang = rng() * Math.PI * 2;
    const rad = 300 + rng() * 620;
    let x = Math.cos(ang) * rad;
    let y = Math.sin(ang) * rad * 0.56;
    if (Math.abs(x) < 340) x += x < 0 ? -360 : 360;
    if (Math.abs(y) < 80) y += y < 0 ? -160 : 160;

    items.push({
      el,
      phase: (i * 0.097 + rng() * 0.05) % 1,
      x,
      y,
      tiltX: (rng() - 0.5) * 12,
      tiltY: (rng() - 0.5) * 28,
      peak: color === "gold" ? 0.78 : 0.52,
      idleX: x,
      idleY: y,
      railX: x < 0 ? -420 : 420,
      keepWhisper: false,
      whisperSample: null,
    });
  }

  KEEP_INDICES.forEach((idx, keepIndex) => {
    const it = items[idx];
    it.keepWhisper = true;
    it.whisperSample = {
      side: keepIndex < 3 ? -1 : 1,
      row: keepIndex % 3,
      inset: rng() * 24,
    };
  });

  function corridorU(p) {
    return gsap.utils.clamp(0, 1, (p - 0.18) / (0.72 - 0.18));
  }

  function corridorEndPose(it, t) {
    const x = it.idleX + (it.railX - it.idleX) * 0.4;
    const y = it.idleY * (1 - 0.4 * 0.25);
    const peak = it.peak * 1.35;
    const autoAlpha = alphaAt((it.phase + t) % 1, peak);
    return { x, y, peak, autoAlpha };
  }

  function setProgress(p) {
    passP = p;
    if (mode === "whisper" || mode === "paused") return;

    if (p < 0.78) {
      const u = corridorU(p);
      idleTl.timeScale(1 + 2.2 * u);
      if (idleTl.paused()) idleTl.play();
      layoutPass(state.t, u);
      return;
    }

    idleTl.pause();
    idleTl.timeScale(1);
    const k = (p - 0.78) / 0.22;
    items.forEach((it) => {
      const from = corridorEndPose(it, state.t);
      if (it.keepWhisper) {
        const to = whisperXY(it);
        const x = from.x + (to.x - from.x) * k;
        const y = from.y + (to.y - from.y) * k;
        const peak = from.peak + (0.08 - from.peak) * k;
        layoutSlab(it, state.t, x, y, peak);
      } else {
        gsap.set(it.el, { autoAlpha: from.autoAlpha * (1 - k) });
        if (k >= 1) {
          it.el.style.display = "none";
          it.el.style.willChange = "auto";
        }
      }
    });
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    controller.mode = next;

    if (next === "pass") {
      whisperTl.pause();
      idleTl.timeScale(1 + 2.2 * corridorU(passP));
      if (passP < 0.78 && idleTl.paused()) idleTl.play();
      items.forEach((it) => {
        it.el.style.display = "";
        it.el.style.willChange = "transform";
      });
      return;
    }
    if (next === "whisper") {
      idleTl.pause();
      whisperTl.progress(state.t);
      whisperTl.play();
      return;
    }
    if (next === "idle") {
      whisperTl.pause();
      idleTl.timeScale(1);
      items.forEach((it) => {
        it.el.style.display = "";
        it.el.style.willChange = "transform";
      });
      idleTl.progress(state.t);
      idleTl.play();
      return;
    }
    if (next === "paused") {
      whisperTl.pause();
      items.forEach((it) => {
        if (it.keepWhisper) gsap.set(it.el, { autoAlpha: 0 });
      });
    }
  }

  layout(0);

  idleTl = gsap.fromTo(
    state,
    { t: 0 },
    {
      t: 1,
      duration: DURATION,
      ease: "none",
      repeat: -1,
      paused: true,
      onUpdate: function () {
        tickIdle();
      },
    }
  );

  whisperTl = gsap.fromTo(
    state,
    { t: 0 },
    {
      t: 1,
      duration: WHISPER_DURATION,
      ease: "none",
      repeat: -1,
      paused: true,
      onUpdate: function () {
        items.forEach((it) => {
          if (!it.keepWhisper) return;
          const pos = whisperXY(it);
          layoutSlab(it, state.t, pos.x, pos.y, 0.08);
        });
      },
    }
  );

  const controller = {
    items,
    mode,
    startIdle() {
      if (mode === "whisper" || mode === "paused") return;
      idleTl.play();
    },
    setMode,
    setProgress,
    pause() {
      setMode("paused");
    },
    resumeWhisper() {
      setMode("whisper");
    },
    layout,
    destroy() {
      idleTl.kill();
      whisperTl.kill();
      items.forEach((it) => {
        it.el.style.willChange = "auto";
      });
    },
  };

  return controller;
}
