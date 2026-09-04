import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const NS = "http://www.w3.org/2000/svg";

const SLAB_DURATION = 8;
const DOCK_DURATION = 36;
const WHISPER_DURATION = 18;
const ORBIT_RENDER_SCALE = 0.8;
// Give the orbit sequence a longer, quieter section of the pinned scroll.
// At six stations this makes each handoff take roughly twice as much wheel travel.
export const FOCUS_START = 0.64;
export const FOCUS_END = 0.98;
export const DOCK_READY = 0.58;
const FOCUS_ZOOM = 1.85;
// GSAP's rotation property is in degrees. Every selected station rotates to the
// left edge of its ring while the enlarged dock remains locked in place.
const FOCUS_TARGET_ANGLE = 180;
const DEG_TO_RAD = Math.PI / 180;
const FAR = -1880;
const NEAR = 620;
const TRAVEL = NEAR - FAR;
const PALETTE = ["ivory", "ivory", "steel", "peri", "gold", "gold", "dim", "peri"];
const KEEP_INDICES = [6, 14, 1, 4, 9, 12];
const SLAB_SLOTS = [
  [-3, -1],
  [-3, 0],
  [-3, 1],
  [-2, -1.5],
  [-2, -0.5],
  [-2, 0.5],
  [-2, 1.5],
  [-1, -1.5],
  [-1, -0.5],
  [-1, 0.5],
  [-1, 1.5],
  [1, -1.5],
  [1, -0.5],
  [1, 0.5],
  [1, 1.5],
  [2, -1.5],
  [2, -0.5],
  [2, 0.5],
  [2, 1.5],
  [3, -1],
  [3, 0],
  [3, 1],
];

const BASE_TILT = 0;
const RING_SPIN = { inner: 1, mid: 0.82, outer: 0.64 };
const STATION_NODES = [
  { label: "Marketing & Content", ring: "mid", angle: Math.PI / 2, accent: true },
  { label: "Prototyping", ring: "inner", angle: 0.52, accent: false },
  { label: "AI Agents", ring: "outer", angle: 0.06, accent: false },
  { label: "Customer Engagement", ring: "mid", angle: -Math.PI / 2, accent: true },
  { label: "Document Management", ring: "inner", angle: -2.45, accent: false },
  { label: "Talent Assessment", ring: "outer", angle: Math.PI, accent: false },
];

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

function slabSize(col) {
  const abs = Math.abs(col);
  const w = abs === 1 ? 22 : abs === 2 ? 18 : 14;
  return { w, h: Math.round(w * 4.08) };
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
  const r = Math.min(w * (compact ? 0.48 : 0.4), h * (compact ? 0.4 : 0.48), compact ? 380 : 540);
  return {
    w,
    h,
    compact,
    r,
    rMid: r * 0.68,
    rIn: r * 0.44,
    hub: r * 0.23,
    tilt: BASE_TILT,
  };
}

function stationPose(m) {
  if (m.compact) {
    return { x: m.w * 0.2, y: m.h * 0.2, scale: 0.62 * ORBIT_RENDER_SCALE };
  }
  return { x: m.w * 0.2, y: m.h * 0.01, scale: 0.96 * ORBIT_RENDER_SCALE };
}

function heroPose(m) {
  if (m.compact) {
    return { x: m.w * 0.2, y: m.h * 0.18, scale: 0.62 * ORBIT_RENDER_SCALE };
  }
  return { x: m.w * 0.2, y: m.h * 0.02, scale: 0.96 * ORBIT_RENDER_SCALE };
}

function focusedStationPose(m, zoom = FOCUS_ZOOM) {
  const pose = stationPose(m);
  return {
    // The dock's CSS origin is 50vw / 48vh. Keep the focused center at the
    // right edge so only the left half of the enlarged orbit remains visible.
    x: m.w * (m.compact ? 0.48 : 0.52),
    y: m.h * 0.04,
    scale: pose.scale * zoom,
  };
}

function poseAt(theta, radius) {
  return {
    x: Math.cos(theta) * radius,
    y: Math.sin(theta) * radius,
  };
}

function createOrbView(host, gsap) {
  const canvas = document.createElement("canvas");
  canvas.className = "dock-orbs";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) {
    canvas.remove();
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(1.35, 1.05, 4.2);
  camera.lookAt(0, 0, 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new RoomEnvironment();
  const envMap = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envMap;
  envScene.dispose();

  scene.add(new THREE.HemisphereLight(0x8bbb92, 0x092328, 0.85));
  const key = new THREE.DirectionalLight(0xe8f3ea, 1.35);
  key.position.set(-2.2, 3.4, 2.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x2a835f, 0.45);
  fill.position.set(2.8, 0.6, 1.6);
  scene.add(fill);

  const geo = new THREE.SphereGeometry(1, 96, 64);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x8bbb92,
    roughness: 0.12,
    metalness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    reflectivity: 0.9,
    envMapIntensity: 1.15,
  });
  const orb = new THREE.Mesh(geo, mat);
  scene.add(orb);

  let lastPx = 0;

  return {
    layout(t, inner, gain, compact, pose) {
      const px = Math.round(Math.max(150, Math.min(inner * 2.08, compact ? 210 : 300)));
      if (px !== lastPx) {
        lastPx = px;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(px, px, false);
        canvas.style.width = px + "px";
        canvas.style.height = px + "px";
        camera.aspect = 1;
        camera.updateProjectionMatrix();
      }

      orb.rotation.y = t * Math.PI * 2 * 0.18;
      orb.rotation.x = Math.sin(t * Math.PI * 2) * 0.08;

      const p = pose || { x: 0, y: 0, scale: 1 };
      gsap.set(canvas, {
        x: p.x,
        y: p.y,
        scale: p.scale,
        rotationX: 0,
        rotationY: 0,
        rotationZ: 0,
        xPercent: -50,
        yPercent: -50,
        autoAlpha: gain,
        force3D: true,
      });

      if (gain > 0.02) renderer.render(scene, camera);
    },
    canvas,
    dispose() {
      renderer.dispose();
      geo.dispose();
      mat.dispose();
      envMap.dispose();
      pmrem.dispose();
    },
  };
}

function noopController() {
  return {
    items: [],
    mode: "idle",
    startIdle() {},
    playEnter() {},
    playWelcome() {},
    setMode() {},
    setProgress() {},
    getFocus() { return -1; },
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
  const state = { t: 0 };

  let idleTl = null;
  let whisperTl = null;
  let resizeTimer = 0;

  const rng = mulberry32(0xa5c11e);
  const slabs = [];

  function placeSlabs() {
    const colPitch = m.compact ? 70 : 104;
    const rowPitch = m.compact ? 128 : 186;
    const gutter = m.compact ? 108 : 208;
    const rail = m.compact ? 260 : 460;
    for (let i = 0; i < slabs.length; i++) {
      const it = slabs[i];
      const x = it.col * colPitch + Math.sign(it.col) * gutter;
      const y = it.row * rowPitch;
      it.x = x;
      it.y = y;
      it.idleX = x;
      it.idleY = y;
      it.railX = Math.sign(it.col) * rail;
    }
  }

  if (!reduce) {
    for (let i = 0; i < SLAB_SLOTS.length; i++) {
      const col = SLAB_SLOTS[i][0];
      const row = SLAB_SLOTS[i][1];
      const size = slabSize(col);
      const color = PALETTE[i % PALETTE.length];
      const el = makeSlab(size.w, size.h, color);
      root.appendChild(el);

      slabs.push({
        el,
        col,
        row,
        phase: ((col + 3) * 0.11 + (row + 1.5) * 0.17 + i * 0.02) % 1,
        x: 0,
        y: 0,
        peak: color === "gold" || color === "peri" ? 0.78 : 0.52,
        idleX: 0,
        idleY: 0,
        railX: 0,
        keepWhisper: false,
        whisperSample: null,
      });
    }

    placeSlabs();

    KEEP_INDICES.forEach((idx, keepIndex) => {
      const it = slabs[idx];
      it.keepWhisper = true;
      it.whisperSample = {
        side: keepIndex < 3 ? -1 : 1,
        row: keepIndex % 3,
        inset: rng() * 24,
      };
    });
  }

  const dock = document.createElement("div");
  dock.className = "dock";
  dock.setAttribute("aria-hidden", "true");
  root.appendChild(dock);

  const svg = svgEl("svg", {
    class: "dock-svg",
    viewBox: "-1200 -1200 2400 2400",
    "aria-hidden": "true",
  });
  const ringCore = svgEl("circle", { class: "dock-ring is-core", cx: "0", cy: "0" });
  const ringInner = svgEl("circle", { class: "dock-ring is-inner", cx: "0", cy: "0" });
  const ringMid = svgEl("circle", { class: "dock-ring is-mid", cx: "0", cy: "0" });
  const ringOuter = svgEl("circle", { class: "dock-ring is-outer", cx: "0", cy: "0" });
  const spokeGroup = svgEl("g", { class: "dock-spokes" });
  const spokes = STATION_NODES.map(() =>
    svgEl("line", {
      class: "dock-spoke",
      x1: "0",
      y1: "0",
      x2: "0",
      y2: "0",
    }),
  );
  spokeGroup.append(...spokes);
  const alignLine = svgEl("line", {
    class: "dock-align",
    x1: "0",
    y1: "0",
    x2: "0",
    y2: "0",
  });
  svg.append(spokeGroup, ringCore, ringInner, ringMid, ringOuter, alignLine);
  dock.appendChild(svg);

  const ringEls = {
    inner: ringInner,
    mid: ringMid,
    outer: ringOuter,
    core: ringCore,
  };

  const nodes = STATION_NODES.map((spec, index) => {
    const el = document.createElement("div");
    el.className = "dock-node" + (spec.accent ? " is-accent" : "");
    if (spec.label === "Products") el.setAttribute("data-dock", "products");
    const label = document.createElement("span");
    label.className = "dock-node-label";
    label.textContent = spec.label;
    el.appendChild(label);
    dock.appendChild(el);
    return { el, spec, spoke: spokes[index], x: 0, y: 0 };
  });

  let hover = null;
  let orbitFrozen = false;
  let focusIndex = -1;
  let focusStrength = 0;
  let focusLocal = 0;
  let focusZoom = 1;
  let focusRotationTarget = 0;
  let focusFrozen = false;
  let focusReturning = false;
  let focusExitTween = null;
  const productsNode = nodes.find((node) => node.el.dataset.dock === "products") || null;

  let orbView = null;
  if (!reduce) {
    try {
      orbView = createOrbView(root, gsap);
    } catch (err) {
      orbView = null;
    }
  }

  const focusMotion = {
    dockX: 0,
    dockY: 0,
    dockScale: 1,
    orbX: 0,
    orbY: 0,
    rotation: 0,
  };
  let focusMotionReady = false;
  let focusSnapTween = null;
  const focusTargets = Object.fromEntries(Object.keys(focusMotion).map((key) => [key, Number.NaN]));

  function setFocusTargets(values) {
    const changed = Object.entries(values).some(([key, value]) => {
      return Math.abs(focusTargets[key] - value) >= 0.001 || !Number.isFinite(focusTargets[key]);
    });
    if (!changed) return;

    if (focusSnapTween) focusSnapTween.kill();
    Object.assign(focusTargets, values);
    focusSnapTween = gsap.to(focusMotion, {
      ...values,
      duration: 0.92,
      ease: "power3.inOut",
      overwrite: true,
      onUpdate: renderFocusMotion,
      onComplete: () => {
        focusSnapTween = null;
        renderFocusMotion();
      },
    });
  }

  function releaseFocusMotion() {
    if (focusSnapTween) focusSnapTween.kill();
    focusSnapTween = null;
    focusMotion.rotation = 0;
    focusMotionReady = false;
    Object.keys(focusTargets).forEach((key) => {
      focusTargets[key] = Number.NaN;
    });
    gsap.set(svg, { rotation: 0, transformOrigin: "50% 50%" });
  }

  function finishFocusExit() {
    focusExitTween = null;
    focusReturning = false;
    focusStrength = 0;
    focusLocal = 0;
    setFocusIndex(-1);
    releaseFocusMotion();
    focusFrozen = false;
    if (idleTl && (mode === "idle" || mode === "pass")) idleTl.play();
    if (mode === "pass" && !orbitFrozen) layoutStation(passP);
  }

  function startFocusExit() {
    if (focusReturning || !focusMotionReady) return;

    focusReturning = true;
    focusStrength = 0;
    focusLocal = 0;
    if (focusSnapTween) focusSnapTween.kill();
    focusSnapTween = null;
    Object.keys(focusTargets).forEach((key) => {
      focusTargets[key] = Number.NaN;
    });

    const pose = stationPose(m);
    focusExitTween = gsap.to(focusMotion, {
      dockX: pose.x,
      dockY: pose.y,
      dockScale: pose.scale,
      orbX: pose.x,
      orbY: pose.y,
      rotation: nearestRotation(0, focusMotion.rotation),
      duration: 0.82,
      ease: "power3.inOut",
      overwrite: true,
      onUpdate: renderFocusMotion,
      onComplete: finishFocusExit,
    });
  }

  function cancelFocusExit() {
    if (!focusReturning) return;
    if (focusExitTween) focusExitTween.kill();
    focusExitTween = null;
    focusReturning = false;
    Object.keys(focusTargets).forEach((key) => {
      focusTargets[key] = Number.NaN;
    });
  }

  function layoutSlab(it, t, x = it.x, y = it.y, peak = it.peak) {
    const p = (it.phase + t) % 1;
    const z = FAR + p * TRAVEL;
    gsap.set(it.el, {
      x,
      y,
      z,
      xPercent: -50,
      yPercent: -50,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 0,
      autoAlpha: alphaAt(p, peak),
      force3D: true,
    });
  }

  function layoutSlabsIdle(t) {
    for (let i = 0; i < slabs.length; i++) {
      const it = slabs[i];
      it.el.style.display = "";
      layoutSlab(it, t, it.idleX, it.idleY, it.peak);
    }
  }

  function layoutSlabsPass(t, p) {
    const u = gsap.utils.clamp(0, 1, (p - 0.18) / 0.54);
    const fade = gsap.utils.clamp(0, 1, (p - 0.22) / 0.26);
    const pull = 0.4 * u;
    for (let i = 0; i < slabs.length; i++) {
      const it = slabs[i];
      if (fade >= 1) {
        gsap.set(it.el, { autoAlpha: 0 });
        it.el.style.display = "none";
        it.el.style.willChange = "auto";
        continue;
      }
      it.el.style.display = "";
      it.el.style.willChange = "transform";
      const x = it.idleX + (it.railX - it.idleX) * pull;
      const y = it.idleY * (1 - pull * 0.25);
      layoutSlab(it, t, x, y, it.peak * (1 + 0.35 * u) * (1 - fade));
    }
  }

  function hideSlabs() {
    for (let i = 0; i < slabs.length; i++) {
      const it = slabs[i];
      gsap.set(it.el, { autoAlpha: 0, scaleX: 1, scaleY: 1 });
      it.el.style.display = "none";
      it.el.style.willChange = "auto";
    }
  }

  function sizeRings() {
    ringCore.setAttribute("r", String(m.hub * 1.08));
    ringInner.setAttribute("r", String(m.rIn));
    ringMid.setAttribute("r", String(m.rMid));
    ringOuter.setAttribute("r", String(m.r));
  }

  function ringRadius(name) {
    if (name === "inner") return m.rIn;
    if (name === "mid") return m.rMid;
    return m.r;
  }

  function layoutSpokes() {
    const orbEdge = m.hub * 1.24;
    nodes.forEach((node) => {
      const length = Math.hypot(node.x, node.y) || 1;
      const inwardX = (node.x / length) * orbEdge;
      const inwardY = (node.y / length) * orbEdge;
      node.spoke.setAttribute("x1", node.x.toFixed(2));
      node.spoke.setAttribute("y1", node.y.toFixed(2));
      node.spoke.setAttribute("x2", inwardX.toFixed(2));
      node.spoke.setAttribute("y2", inwardY.toFixed(2));
    });
  }

  function layoutOrbs(t, gain, pose) {
    if (orbView) orbView.layout(t, m.hub, gain, m.compact, pose);
  }

  function clearHot() {
    dock.classList.remove("is-orb-hot");
    nodes.forEach((node) => node.el.classList.remove("is-hot"));
    nodes.forEach((node) => node.spoke.classList.remove("is-hot"));
    Object.keys(ringEls).forEach((key) => ringEls[key].classList.remove("is-hot"));
    alignLine.classList.remove("is-hot");
  }

  function applyHover() {
    clearHot();
    if (!hover) {
      alignLine.setAttribute("x2", "0");
      alignLine.setAttribute("y2", "0");
      return;
    }
    if (hover === "orb") {
      dock.classList.add("is-orb-hot");
      nodes.forEach((node) => node.el.classList.add("is-hot"));
      nodes.forEach((node) => node.spoke.classList.add("is-hot"));
      Object.keys(ringEls).forEach((key) => ringEls[key].classList.add("is-hot"));
      return;
    }
    hover.el.classList.add("is-hot");
    hover.spoke.classList.add("is-hot");
    ringEls[hover.spec.ring].classList.add("is-hot");
    ringCore.classList.add("is-hot");
    alignLine.classList.add("is-hot");
    alignLine.setAttribute("x2", hover.x.toFixed(2));
    alignLine.setAttribute("y2", hover.y.toFixed(2));
  }

  function setHover(next) {
    if (next === hover) return;
    hover = next;
    applyHover();
  }

  function bindHover() {
    nodes.forEach((node) => {
      node.el.addEventListener("pointerenter", () => setHover(node));
      node.el.addEventListener("pointerleave", () => {
        if (hover === node) setHover(null);
      });
    });
    const canvas = orbView && orbView.canvas;
    if (canvas) {
      canvas.addEventListener("pointerenter", () => setHover("orb"));
      canvas.addEventListener("pointerleave", () => {
        if (hover === "orb") setHover(null);
      });
    }
  }

  function setFocusFromProgress(p) {
    // Progress sources can settle a few floating-point ticks below the requested
    // value (for example 0.639969 instead of 0.64).
    const focusProgress = p + 0.0001;
    const sequence = gsap.utils.clamp(0, 1, (focusProgress - FOCUS_START) / (FOCUS_END - FOCUS_START));

    if (focusProgress < FOCUS_START) {
      if (focusMotionReady && focusIndex >= 0) startFocusExit();
      else if (!focusReturning) {
        focusStrength = 0;
        focusLocal = 0;
        setFocusIndex(-1);
        releaseFocusMotion();
        if (focusFrozen) {
          focusFrozen = false;
          if (idleTl && (mode === "idle" || mode === "pass")) idleTl.play();
        }
      }
      return;
    }

    cancelFocusExit();
    focusFrozen = true;
    if (idleTl) idleTl.pause();

    if (sequence >= 1) {
      setFocusIndex(STATION_NODES.length - 1);
      focusStrength = 1;
      focusLocal = 0;
      focusZoom = FOCUS_ZOOM;
      return;
    }

    // Snap points divide the focus range into N - 1 equal intervals. Mapping
    // with round() makes every exact snap resolve to one exact station.
    setFocusIndex(Math.round(sequence * (STATION_NODES.length - 1)));
    focusLocal = 0;
    focusStrength = 1;
    // The first snap should already be fully zoomed, just like every later station.
    focusZoom = FOCUS_ZOOM;
  }

  function renderFocusMotion() {
    gsap.set(dock, {
      x: focusMotion.dockX,
      y: focusMotion.dockY,
      scale: focusMotion.dockScale,
      transformOrigin: "0 0",
    });

    gsap.set(svg, {
      rotation: focusMotion.rotation,
      transformOrigin: "50% 50%",
    });

    if (orbView && orbView.canvas) {
      gsap.set(orbView.canvas, {
        x: focusMotion.orbX,
        y: focusMotion.orbY,
        scale: focusMotion.dockScale,
        transformOrigin: "50% 50%",
      });
    }

    const angle = focusMotion.rotation * DEG_TO_RAD;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    nodes.forEach((node) => {
      // Rotate node positions numerically so the labels never inherit the line spin.
      const x = node.x * cos - node.y * sin;
      const y = node.x * sin + node.y * cos;
      gsap.set(node.el, {
        x,
        y,
        rotation: 0,
        transformOrigin: "50% 50%",
      });
    });

  }

  function nearestRotation(target, current) {
    const delta = ((target - current + 180) % 360 + 360) % 360 - 180;
    return current + delta;
  }

  function stationRotation(index) {
    const station = STATION_NODES[index];
    const speed = RING_SPIN[station.ring] || 1;
    const angle = station.angle + state.t * Math.PI * 2 * speed;
    return FOCUS_TARGET_ANGLE - (angle * 180) / Math.PI;
  }

  function setFocusIndex(nextIndex) {
    if (nextIndex === focusIndex) return;
    focusIndex = nextIndex;
    if (nextIndex < 0) {
      focusRotationTarget = 0;
      return;
    }

    // Rotation is a selection event, not a continuously scrubbed value. Always
    // rotate the selected station to the same side; mere viewport visibility is
    // not enough because every selection must finish at the shared anchor.
    const target = stationRotation(nextIndex);
    focusRotationTarget = nearestRotation(target, focusMotion.rotation);
  }

  function applyFocusVisuals() {
    const focused = focusIndex >= 0 && focusStrength > 0;
    const activeRing = focused ? nodes[focusIndex]?.spec.ring : null;

    if (focused) {
      const pose = stationPose(m);
      const focusedPose = focusedStationPose(m, focusZoom);
      // Focus framing is independent from the active node. This means changing
      // stations can only rotate the orbital geometry; it cannot pan the dock.
      const dockX = focusedPose.x;
      const dockY = focusedPose.y;
      const dockScale = focusedPose.scale;
      const orbX = dockX;
      const orbY = dockY;
      const focusValues = {
        dockX,
        dockY,
        dockScale,
        orbX,
        orbY,
        rotation: focusRotationTarget,
      };

      if (!focusMotionReady) {
        const currentDockX = Number(gsap.getProperty(dock, "x"));
        const currentDockY = Number(gsap.getProperty(dock, "y"));
        const currentDockScale = Number(gsap.getProperty(dock, "scale"));
        const currentOrbX = orbView?.canvas
          ? Number(gsap.getProperty(orbView.canvas, "x"))
          : currentDockX;
        const currentOrbY = orbView?.canvas
          ? Number(gsap.getProperty(orbView.canvas, "y"))
          : currentDockY;
        Object.assign(focusMotion, {
          // Continue from the transform that is actually on screen. This also
          // keeps a fast selection change continuous instead of assigning the
          // final focused pose on its first frame.
          dockX: Number.isFinite(currentDockX) ? currentDockX : dockX,
          dockY: Number.isFinite(currentDockY) ? currentDockY : dockY,
          dockScale: Number.isFinite(currentDockScale) ? currentDockScale : pose.scale,
          orbX: Number.isFinite(currentOrbX) ? currentOrbX : orbX,
          orbY: Number.isFinite(currentOrbY) ? currentOrbY : orbY,
          rotation: focusMotion.rotation,
        });
        focusMotionReady = true;
        renderFocusMotion();
      }

      setFocusTargets(focusValues);
      renderFocusMotion();
    } else if (!focusReturning) {
      releaseFocusMotion();
    }

    nodes.forEach((node, index) => {
      node.el.classList.toggle("is-focus", focused && index === focusIndex);
    });
    Object.entries(ringEls).forEach(([name, ring]) => {
      ring.classList.toggle("is-focus", name === activeRing);
    });
    dock.classList.toggle("is-focus-mode", focused);
  }

  function layoutDock(t, gain, pose) {
    sizeRings();
    const dockProps = {
      transformOrigin: "0 0",
      rotationX: 0,
      rotation: 0,
      autoAlpha: gain,
      force3D: true,
    };
    if (!(focusIndex >= 0 && focusStrength > 0) && !focusReturning) {
      dockProps.x = pose.x;
      dockProps.y = pose.y;
      dockProps.scale = pose.scale;
    }
    gsap.set(dock, dockProps);
    if (!orbitFrozen) gsap.set(svg, { autoAlpha: 1 });

    const live = gain > 0.55 && !orbitFrozen;
    const spin = t * Math.PI * 2;
    if (!orbitFrozen) {
      nodes.forEach((node) => {
        const speed = RING_SPIN[node.spec.ring] || 1;
        const pos = poseAt(node.spec.angle + spin * speed, ringRadius(node.spec.ring));
        node.x = pos.x;
        node.y = pos.y;
        node.el.style.pointerEvents = live ? "auto" : "none";
        gsap.set(node.el, {
          x: pos.x,
          y: pos.y,
          z: 0,
          xPercent: -50,
          yPercent: -50,
          rotationX: 0,
          rotationY: 0,
          rotationZ: 0,
          autoAlpha: gain,
          force3D: true,
        });
      });
    } else {
      nodes.forEach((node) => {
        node.el.style.pointerEvents = "none";
      });
    }

    layoutSpokes();

    if (orbView && orbView.canvas) {
      orbView.canvas.style.pointerEvents = live ? "auto" : "none";
      orbView.canvas.style.cursor = live ? "pointer" : "default";
    }
    if (orbitFrozen && !layoutDock._companionsForced) {
      return;
    }

    if (hover && hover !== "orb") {
      alignLine.setAttribute("x2", hover.x.toFixed(2));
      alignLine.setAttribute("y2", hover.y.toFixed(2));
    }

    layoutOrbs(t, gain, pose);
    // layoutOrbs writes the ready canvas pose. Focus rendering runs last so
    // both active and returning snap transitions retain sole transform ownership.
    if (focusMotionReady) renderFocusMotion();
  }

  function layoutStation(p) {
    const dockIn = gsap.utils.clamp(0, 1, (p - 0.22) / 0.28);
    // The progress-driven setup ends at a stable, fully readable dock state.
    // Focus is selected later and owns its own move-and-zoom animation.
    const slide = gsap.utils.clamp(0, 1, (p - 0.36) / (DOCK_READY - 0.36));
    const easeSlide = slide * slide * (3 - 2 * slide);
    const pose = stationPose(m);
    const from = { x: 0, y: 0, scale: 1 };
    layoutDock(state.t, dockIn, {
      x: from.x + (pose.x - from.x) * easeSlide,
      y: from.y + (pose.y - from.y) * easeSlide,
      scale: from.scale + (pose.scale - from.scale) * easeSlide,
    });
    applyFocusVisuals();
    gsap.set(root, { perspective: 1100 });
    if (p < 0.48) layoutSlabsPass(state.t, p);
    else hideSlabs();
  }

  function tickIdle() {
    if (mode === "idle") {
      layoutSlabsIdle(state.t);
      gsap.set(dock, { autoAlpha: 0 });
      layoutOrbs(state.t, 0, { x: 0, y: 0, scale: 1 });
      gsap.set(root, { perspective: 1100 });
      return;
    }
    if (mode === "pass") {
      layoutStation(passP);
      return;
    }
    if (mode === "whisper") {
      hideSlabs();
      layoutDock(state.t, 1, stationPose(m));
      gsap.set(root, { perspective: 1100 });
    }
  }

  function setProgress(p) {
    passP = p;
    setFocusFromProgress(p);
    if (mode === "whisper" || mode === "paused") return;
    if (orbitFrozen) return;
    const u = gsap.utils.clamp(0, 1, (p - 0.18) / 0.54);
    if (idleTl) {
      // setMode("pass") can run before passP reaches the dock range. Keep the
      // timeline duration in sync here so the default hero orbit uses the
      // slower dock cycle instead of retaining the earlier slab duration.
      idleTl.duration(p < 0.55 ? SLAB_DURATION : DOCK_DURATION);
      idleTl.timeScale(p < 0.55 ? 1 + 2.2 * u : 1);
      if (focusFrozen) idleTl.pause();
      else if (idleTl.paused()) idleTl.play();
    }
    layoutStation(p);
  }

  function freezeOrbit() {
    if (orbitFrozen) return;
    orbitFrozen = true;
    if (idleTl) idleTl.pause();
    if (whisperTl) whisperTl.pause();
  }

  function unfreezeOrbit() {
    if (!orbitFrozen) return;
    orbitFrozen = false;
    if (mode === "pass") layoutStation(passP);
    else if (mode === "whisper") {
      if (idleTl) {
        idleTl.duration(DOCK_DURATION);
        idleTl.timeScale(1);
        idleTl.play();
      }
      layoutDock(state.t, 1, stationPose(m));
    } else if (mode === "idle") {
      if (idleTl) idleTl.play();
    }
  }

  function hideProductsNode() {
    if (productsNode) productsNode.el.style.visibility = "hidden";
  }

  function showProductsNode() {
    if (productsNode) productsNode.el.style.visibility = "";
  }

  function setCompanionsVisible(on) {
    const alpha = on ? 1 : 0;
    const dur = on ? 0.28 : 0.45;
    nodes.forEach((node) => {
      if (node === productsNode) return;
      gsap.to(node.el, { autoAlpha: alpha, duration: dur, ease: "power2.out", overwrite: true });
    });
    gsap.to(svg, { autoAlpha: alpha, duration: dur, ease: "power2.out", overwrite: true });
    if (orbView && orbView.canvas) {
      gsap.to(orbView.canvas, { autoAlpha: alpha, duration: dur, ease: "power2.out", overwrite: true });
    }
  }

  function getProductsRect() {
    if (!productsNode) return null;
    return productsNode.el.getBoundingClientRect();
  }

  function recedeDock(amount) {
    const a = gsap.utils.clamp(0, 1, amount);
    if (a > 0.002) freezeOrbit();
    else unfreezeOrbit();
    const alpha = 1 - a;
    const sc = 1 - 0.08 * a;
    nodes.forEach((node) => {
      gsap.set(node.el, { autoAlpha: alpha, scale: sc, transformOrigin: "50% 50%" });
    });
    gsap.set(svg, { autoAlpha: alpha });
    if (orbView && orbView.canvas) {
      gsap.set(orbView.canvas, { autoAlpha: alpha, scale: sc, transformOrigin: "50% 50%" });
    }
  }

  function setMode(next) {
    if (next === mode) return;
    mode = next;
    controller.mode = next;
    if (orbitFrozen && next !== "idle") {
      if (idleTl) idleTl.pause();
      if (whisperTl) whisperTl.pause();
      hideSlabs();
      if (next === "paused") return;
      layoutDock(state.t, 1, stationPose(m));
      return;
    }

    if (next === "pass") {
      if (whisperTl) whisperTl.pause();
      if (idleTl) {
        idleTl.duration(passP < 0.55 ? SLAB_DURATION : DOCK_DURATION);
        const u = gsap.utils.clamp(0, 1, (passP - 0.18) / 0.54);
        idleTl.timeScale(passP < 0.55 ? 1 + 2.2 * u : 1);
      if (focusFrozen) idleTl.pause();
      else if (idleTl.paused()) idleTl.play();
      }
      slabs.forEach((it) => {
        it.el.style.display = "";
        it.el.style.willChange = "transform";
      });
      return;
    }
    if (next === "whisper") {
      hideSlabs();
      if (idleTl) {
        idleTl.duration(DOCK_DURATION);
        idleTl.timeScale(1);
        if (idleTl.paused()) idleTl.play();
      }
      if (whisperTl) whisperTl.pause();
      layoutDock(state.t, 1, stationPose(m));
      gsap.set(root, { perspective: 1100 });
      return;
    }
    if (next === "idle") {
      if (whisperTl) whisperTl.pause();
      if (idleTl) {
        idleTl.duration(SLAB_DURATION);
        idleTl.timeScale(1);
        idleTl.play();
      }
      slabs.forEach((it) => {
        it.el.style.display = "";
        it.el.style.willChange = "transform";
      });
      gsap.set(dock, { autoAlpha: 0, x: 0, y: 0, scale: 1 });
      layoutOrbs(state.t, 0, { x: 0, y: 0, scale: 1 });
      gsap.set(root, { perspective: 1100 });
      layoutSlabsIdle(state.t);
      return;
    }
    if (next === "paused") {
      if (idleTl) idleTl.pause();
      if (whisperTl) whisperTl.pause();
      hideSlabs();
      gsap.set(dock, { autoAlpha: 0 });
      layoutOrbs(state.t, 0, { x: 0, y: 0, scale: 1 });
    }
  }

  function playWelcome() {
    if (idleTl) idleTl.pause();
    if (whisperTl) whisperTl.pause();
    hideSlabs();
    layoutDock(state.t, 1, heroPose(m));
    gsap.set(root, { perspective: 1100 });
  }

  function onResize() {
    m = metrics();
    placeSlabs();
    if (mode === "whisper") {
      hideSlabs();
      layoutDock(state.t, 1, stationPose(m));
    } else if (mode === "pass") setProgress(passP);
    else if (mode !== "paused") {
      layoutSlabsIdle(state.t);
      gsap.set(dock, { autoAlpha: 0 });
    }
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 40);
  }

  if (!reduce) {
    idleTl = gsap.to(state, {
      t: "+=1",
      duration: SLAB_DURATION,
      ease: "none",
      repeat: -1,
      repeatRefresh: true,
      paused: true,
      overwrite: false,
      immediateRender: false,
      onUpdate: tickIdle,
    });
    whisperTl = gsap.to(state, {
      t: "+=1",
      duration: WHISPER_DURATION,
      ease: "none",
      repeat: -1,
      repeatRefresh: true,
      paused: true,
      overwrite: false,
      immediateRender: false,
      onUpdate: function () {
        if (mode === "whisper") {
          hideSlabs();
          layoutDock(state.t, 1, stationPose(m));
        }
      },
    });
  }

  gsap.set(dock, { autoAlpha: 0, rotationX: 0, x: 0, y: 0, scale: 1, force3D: true });
  gsap.set(root, { perspective: 1100 });
  if (!reduce) {
    layoutSlabsIdle(0);
  } else {
    hideSlabs();
    layoutDock(0, 1, heroPose(m));
  }

  bindHover();
  window.addEventListener("resize", handleResize);

  const controller = {
    items: slabs,
    mode,
    startIdle() {
      if (mode === "whisper" || mode === "paused") return;
      if (idleTl) {
        idleTl.duration(mode === "idle" ? SLAB_DURATION : DOCK_DURATION);
        idleTl.play();
      }
    },
    playEnter() {
      this.startIdle();
    },
    playWelcome,
    setMode,
    setProgress,
    freezeOrbit,
    unfreezeOrbit,
    hideProductsNode,
    showProductsNode,
    setCompanionsVisible,
    getProductsRect,
    getFocus: () => focusStrength >= 0.9999 ? focusIndex : -1,
    recedeDock,
    pause() {
      setMode("paused");
    },
    resumeWhisper() {
      setMode("whisper");
    },
    layout(t = state.t) {
      m = metrics();
      placeSlabs();
      if (mode === "whisper") {
        hideSlabs();
        layoutDock(t, 1, stationPose(m));
      } else if (mode === "pass") layoutStation(passP);
      else layoutSlabsIdle(t);
    },
    destroy() {
      window.removeEventListener("resize", handleResize);
      window.clearTimeout(resizeTimer);
      if (idleTl) idleTl.kill();
      if (whisperTl) whisperTl.kill();
      if (focusSnapTween) focusSnapTween.kill();
      if (focusExitTween) focusExitTween.kill();
      if (orbView) orbView.dispose();
      slabs.forEach((it) => {
        it.el.style.willChange = "auto";
      });
    },
  };

  return controller;
}
