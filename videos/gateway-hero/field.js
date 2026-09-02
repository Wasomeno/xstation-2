const NS = "http://www.w3.org/2000/svg";
const DURATION = 20;
const WHISPER_DURATION = 18;
const BASE_TILT = 58;
const DOCK_WINDOW = 0.34;
const BERTH_ANGLES = [0.72, 2.42, 3.86, 5.56];
const CAPSULE_PHASES = [0.04, 0.37, 0.71];
const TICK_COUNT = 64;

function angDist(a, b) {
  let d = Math.abs(a - b) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d;
}

function wrap01(t) {
  return t - Math.floor(t);
}

function svgEl(name, attrs) {
  const el = document.createElementNS(NS, name);
  for (const key in attrs) el.setAttribute(key, attrs[key]);
  return el;
}

function metrics() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const compact = w < 720;
  const r = Math.min(w * (compact ? 0.52 : 0.42), h * (compact ? 0.42 : 0.5), compact ? 420 : 580);
  const inner = Math.min(Math.max(w * (compact ? 0.24 : 0.22), compact ? 128 : 250), r * 0.6);
  return {
    w,
    h,
    compact,
    r,
    inner,
    tilt: compact ? 54 : BASE_TILT,
  };
}

function whisperXY(index, w, h) {
  const side = index < 2 ? -1 : 1;
  const row = index % 2 === 0 ? 0 : 2;
  return {
    x: side * (w / 2 - (w < 720 ? 28 : 52)),
    y: (row - 1) * h * 0.28,
  };
}

function poseAt(theta, r, inner) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return {
    x: c * r,
    y: s * r,
    innerX: c * inner,
    innerY: s * inner,
    rot: theta * (180 / Math.PI) + 90,
    depth: (s + 1) * 0.5,
  };
}

function noopController() {
  return {
    items: [],
    mode: "idle",
    startIdle() {},
    playEnter() {},
    setMode() {},
    setProgress() {},
    pause() {},
    resumeWhisper() {},
    layout() {},
    destroy() {},
  };
}

export function createField({ root, gsap, reduce }) {
  if (!root || !gsap) return noopController();

  let m = metrics();
  let mode = "idle";
  let passP = 0;
  let entered = false;
  const state = { t: 0 };
  const enter = { g: reduce ? 1 : 0 };
  let lastT = 0;
  let hubFlash = 0;
  let idleTl = null;
  let whisperTl = null;
  let resizeTimer = 0;

  const dock = document.createElement("div");
  dock.className = "dock";
  dock.setAttribute("aria-hidden", "true");
  root.appendChild(dock);

  const svg = svgEl("svg", {
    class: "dock-svg",
    viewBox: "-1200 -1200 2400 2400",
    "aria-hidden": "true",
  });
  const defs = svgEl("defs", {});
  const mask = svgEl("mask", { id: "dock-deck-mask" });
  const maskOuter = svgEl("circle", { cx: "0", cy: "0", fill: "#fff" });
  const maskInner = svgEl("circle", { cx: "0", cy: "0", fill: "#000" });
  mask.append(maskOuter, maskInner);
  defs.appendChild(mask);
  const deck = svgEl("circle", {
    class: "dock-deck",
    cx: "0",
    cy: "0",
    mask: "url(#dock-deck-mask)",
  });
  const railOuter = svgEl("circle", { class: "dock-rail", cx: "0", cy: "0" });
  const railInner = svgEl("circle", { class: "dock-rail is-inner", cx: "0", cy: "0" });
  const tickGroup = svgEl("g", { class: "dock-ticks" });
  const spokeGroup = svgEl("g", { class: "dock-spokes" });
  const ticks = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const tick = svgEl("line", { class: "dock-tick" });
    tickGroup.appendChild(tick);
    ticks.push(tick);
  }
  const spokeEls = BERTH_ANGLES.map(() => {
    const line = svgEl("line", { class: "dock-spoke" });
    spokeGroup.appendChild(line);
    return line;
  });
  svg.append(defs, deck, railOuter, railInner, tickGroup, spokeGroup);
  dock.appendChild(svg);

  const capsules = CAPSULE_PHASES.map(() => {
    const el = document.createElement("div");
    el.className = "dock-capsule";
    el.setAttribute("aria-hidden", "true");
    dock.appendChild(el);
    return { el, theta: 0 };
  });

  const packets = BERTH_ANGLES.map(() => ({
    el: (() => {
      const el = document.createElement("div");
      el.className = "dock-packet";
      el.setAttribute("aria-hidden", "true");
      dock.appendChild(el);
      return el;
    })(),
    p: 1,
    armed: true,
  }));

  const berths = BERTH_ANGLES.map((theta, index) => {
    const el = document.createElement("div");
    el.className = "dock-berth";
    el.setAttribute("aria-hidden", "true");
    const plate = document.createElement("div");
    plate.className = "dock-plate";
    const port = document.createElement("div");
    port.className = "dock-port";
    plate.appendChild(port);
    el.appendChild(plate);
    dock.appendChild(el);
    return {
      el,
      plate,
      index,
      theta,
      keepWhisper: true,
      on: 0,
    };
  });

  function sizeRails(r, inner) {
    railOuter.setAttribute("r", String(r));
    railInner.setAttribute("r", String(inner));
    deck.setAttribute("r", String(r));
    maskOuter.setAttribute("r", String(r));
    maskInner.setAttribute("r", String(inner));

    for (let i = 0; i < TICK_COUNT; i++) {
      const theta = (i / TICK_COUNT) * Math.PI * 2;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const tick = ticks[i];
      tick.setAttribute("x1", (c * (r + 6)).toFixed(2));
      tick.setAttribute("y1", (s * (r + 6)).toFixed(2));
      tick.setAttribute("x2", (c * (r + 14)).toFixed(2));
      tick.setAttribute("y2", (s * (r + 14)).toFixed(2));
    }
  }

  function layoutIdle(t, u = 0) {
    const tilt = m.tilt + 14 * u;
    const spread = 1 + 0.32 * u;
    const r = m.r * spread;
    const inner = m.inner * (1 + 0.08 * u);
    const gain = enter.g;

    sizeRails(r, inner);
    gsap.set(dock, {
      rotationX: tilt,
      autoAlpha: gain,
      force3D: true,
    });
    gsap.set(svg, { autoAlpha: 1 - u * 0.12 });
    deck.style.fillOpacity = String(1 - u * 0.82);

    capsules.forEach((cap, i) => {
      if (reduce) {
        gsap.set(cap.el, { autoAlpha: 0 });
        return;
      }
      const theta = wrap01(t + CAPSULE_PHASES[i]) * Math.PI * 2;
      cap.theta = theta;
      const pose = poseAt(theta, r, inner);
      gsap.set(cap.el, {
        x: pose.x,
        y: pose.y,
        z: 0,
        xPercent: -50,
        yPercent: -50,
        rotation: pose.rot,
        autoAlpha: (0.55 + 0.4 * pose.depth) * (1 - u * 0.28),
        force3D: true,
      });
    });

    berths.forEach((berth, i) => {
      const pose = poseAt(berth.theta, r, inner);
      let heat = 0;
      if (!reduce) {
        capsules.forEach((cap) => {
          const prox = 1 - Math.min(1, angDist(cap.theta, berth.theta) / DOCK_WINDOW);
          if (prox > heat) heat = prox;
        });
      } else {
        heat = 0.2;
      }
      berth.on = heat;
      berth.el.classList.toggle("is-on", heat > 0.55);

      const packet = packets[i];
      if (reduce) packet.p = 1;

      const travel = packet.p * packet.p * (3 - 2 * packet.p);
      const px = pose.x + (pose.innerX - pose.x) * travel;
      const py = pose.y + (pose.innerY - pose.y) * travel;
      const packetAlpha = packet.p >= 1 ? 0 : packet.p < 0.12 ? packet.p / 0.12 : (1 - packet.p) / 0.18;
      gsap.set(packet.el, {
        x: px,
        y: py,
        z: 0,
        xPercent: -50,
        yPercent: -50,
        autoAlpha: reduce ? 0 : Math.max(0, Math.min(1, packetAlpha)),
        force3D: true,
      });

      spokeEls[i].setAttribute("x1", pose.innerX.toFixed(2));
      spokeEls[i].setAttribute("y1", pose.innerY.toFixed(2));
      spokeEls[i].setAttribute("x2", pose.x.toFixed(2));
      spokeEls[i].setAttribute("y2", pose.y.toFixed(2));
      spokeEls[i].setAttribute("stroke-opacity", String((0.16 + 0.5 * heat) * (1 - u * 0.4)));

      gsap.set(berth.el, {
        x: pose.x,
        y: pose.y,
        z: 1,
        xPercent: -50,
        yPercent: -50,
        rotation: 0,
        autoAlpha: 0.82 + 0.18 * pose.depth,
        force3D: true,
      });
    });

    railInner.setAttribute("stroke-opacity", String(0.2 + 0.45 * hubFlash));
  }

  function stepTraffic(dtSec) {
    if (reduce || dtSec <= 0) return;
    berths.forEach((berth, i) => {
      const packet = packets[i];
      if (berth.on > 0.78 && packet.armed) {
        packet.p = 0;
        packet.armed = false;
      }
      if (berth.on < 0.28) packet.armed = true;
      if (packet.p < 1) {
        packet.p = Math.min(1, packet.p + dtSec / 0.72);
        if (packet.p >= 1) hubFlash = 1;
      }
    });
  }

  function layoutWhisper(t, k = 1) {
    const fromU = 1;
    const r = m.r * (1 + 0.32 * fromU);
    const inner = m.inner * 1.08;
    const fromTilt = m.tilt + 14 * fromU;

    gsap.set(dock, {
      rotationX: fromTilt * (1 - k),
      autoAlpha: 1,
      force3D: true,
    });
    gsap.set(svg, { autoAlpha: 1 - k });
    capsules.forEach((cap) => gsap.set(cap.el, { autoAlpha: 0 }));
    packets.forEach((packet) => gsap.set(packet.el, { autoAlpha: 0 }));

    const pulse = 0.16 + 0.05 * Math.sin(t * Math.PI * 2);

    berths.forEach((berth) => {
      const pose = poseAt(berth.theta, r, inner);
      const to = whisperXY(berth.index, m.w, m.h);
      berth.el.classList.remove("is-on");
      gsap.set(berth.el, {
        x: pose.x + (to.x - pose.x) * k,
        y: pose.y + (to.y - pose.y) * k,
        z: 0,
        xPercent: -50,
        yPercent: -50,
        rotation: 0,
        autoAlpha: (0.82 + 0.18 * pose.depth) * (1 - k) + pulse * k,
        force3D: true,
      });
    });
  }

  function tickIdle() {
    const dt = state.t - lastT;
    const wrapped = dt < -0.5 ? dt + 1 : dt;
    lastT = state.t;
    const dtSec = Math.max(0, wrapped) * DURATION;
    hubFlash = Math.max(0, hubFlash - dtSec * 2.4);
    stepTraffic(dtSec);

    if (mode === "idle") {
      layoutIdle(state.t, 0);
      return;
    }
    if (mode === "pass" && passP < 0.78) {
      layoutIdle(state.t, gsap.utils.clamp(0, 1, (passP - 0.18) / 0.54));
    }
  }

  function corridorU(p) {
    return gsap.utils.clamp(0, 1, (p - 0.18) / 0.54);
  }

  function setProgress(p) {
    passP = p;
    if (mode === "whisper" || mode === "paused") return;
    if (p < 0.78) {
      const u = corridorU(p);
      if (idleTl) {
        idleTl.timeScale(1 + 1.6 * u);
        if (idleTl.paused()) idleTl.play();
      }
      layoutIdle(state.t, u);
      return;
    }
    if (idleTl) {
      idleTl.pause();
      idleTl.timeScale(1);
    }
    layoutWhisper(state.t, (p - 0.78) / 0.22);
  }

  function showChrome(on) {
    const vis = on ? "" : "none";
    svg.style.display = vis;
    capsules.forEach((cap) => {
      cap.el.style.display = vis;
    });
    packets.forEach((packet) => {
      packet.el.style.display = vis;
    });
    berths.forEach((berth) => {
      berth.el.style.display = "";
      berth.el.style.willChange = on ? "transform" : "auto";
    });
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    controller.mode = next;

    if (next === "pass") {
      if (whisperTl) whisperTl.pause();
      if (idleTl) {
        idleTl.timeScale(1 + 1.6 * corridorU(passP));
        if (passP < 0.78 && idleTl.paused()) idleTl.play();
      }
      showChrome(true);
      return;
    }
    if (next === "whisper") {
      if (idleTl) idleTl.pause();
      showChrome(true);
      svg.style.display = "none";
      capsules.forEach((cap) => {
        cap.el.style.display = "none";
      });
      packets.forEach((packet) => {
        packet.el.style.display = "none";
      });
      if (whisperTl) {
        whisperTl.progress(state.t);
        whisperTl.play();
      }
      layoutWhisper(state.t, 1);
      return;
    }
    if (next === "idle") {
      if (whisperTl) whisperTl.pause();
      if (idleTl) {
        idleTl.timeScale(1);
        idleTl.progress(state.t);
        idleTl.play();
      }
      showChrome(true);
      layoutIdle(state.t, 0);
      return;
    }
    if (next === "paused") {
      if (idleTl) idleTl.pause();
      if (whisperTl) whisperTl.pause();
      gsap.set(dock, { autoAlpha: 0 });
    }
  }

  function onResize() {
    m = metrics();
    if (mode === "whisper") layoutWhisper(state.t, 1);
    else if (mode === "pass") setProgress(passP);
    else if (mode !== "paused") layoutIdle(state.t, 0);
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 40);
  }

  if (!reduce) {
    idleTl = gsap.fromTo(
      state,
      { t: 0 },
      {
        t: 1,
        duration: DURATION,
        ease: "none",
        repeat: -1,
        paused: true,
        overwrite: false,
        immediateRender: false,
        onUpdate: tickIdle,
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
        overwrite: false,
        immediateRender: false,
        onUpdate: function () {
          if (mode === "whisper") layoutWhisper(state.t, 1);
        },
      }
    );
    gsap.set(dock, { autoAlpha: 0, rotationX: m.tilt, force3D: true });
  }

  layoutIdle(0, 0);
  if (reduce) {
    gsap.set(dock, { autoAlpha: 0.9, rotationX: m.tilt, force3D: true });
    capsules.forEach((cap) => gsap.set(cap.el, { autoAlpha: 0 }));
    packets.forEach((packet) => gsap.set(packet.el, { autoAlpha: 0 }));
  }

  window.addEventListener("resize", handleResize);

  const controller = {
    items: berths,
    mode,
    startIdle() {
      if (mode === "whisper" || mode === "paused") return;
      if (!entered) {
        entered = true;
        if (!reduce) {
          gsap.to(enter, {
            g: 1,
            duration: 1.2,
            ease: "power2.out",
            onUpdate: function () {
              if (mode === "idle") layoutIdle(state.t, 0);
            },
          });
        }
      }
      if (idleTl) idleTl.play();
    },
    playEnter() {
      this.startIdle();
    },
    setMode,
    setProgress,
    pause() {
      setMode("paused");
    },
    resumeWhisper() {
      setMode("whisper");
    },
    layout(t = state.t) {
      m = metrics();
      if (mode === "whisper") layoutWhisper(t, 1);
      else layoutIdle(t, mode === "pass" ? corridorU(passP) : 0);
    },
    destroy() {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
      if (idleTl) idleTl.kill();
      if (whisperTl) whisperTl.kill();
      berths.forEach((berth) => {
        berth.el.style.willChange = "auto";
      });
    },
  };

  return controller;
}
