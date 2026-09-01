import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const IVORY = 0xf3efe6;
const GOLD = 0xd4a056;
const STEEL = 0x9aabc0;
const DIM = 0x8a93a3;

const ENTER = 1.85;
const HOLD = 3.15;
const EXIT = 1.4;

const boot = document.getElementById("boot");
const canvas = document.getElementById("boot-canvas");
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let renderer;
let composer;
let scene;
let camera;
let gate;
let plates = [];
let scan;
let fitScale = 1;
let raf = 0;
let running = false;
let revealed = false;

function revealHero() {
  if (revealed) return;
  revealed = true;
  window.__gatewayReady = true;
  window.dispatchEvent(new CustomEvent("gateway:reveal"));
}

function teardown() {
  running = false;
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", onResize);
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
  scene?.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => m.dispose());
    }
  });
  boot?.remove();
}

function finish() {
  if (!boot) {
    revealHero();
    return;
  }
  boot.classList.add("is-leaving");
  revealHero();

  if (window.gsap) {
    const tl = window.gsap.timeline({ onComplete: teardown });
    if (gate) {
      const open = fitScale * 1.38;
      tl.to(
        gate.scale,
        { x: open, y: open, z: open, duration: EXIT, ease: "power2.inOut" },
        0
      );
    }
    plates.forEach((plate, i) => {
      const mid = (plates.length - 1) / 2;
      tl.to(
        plate.position,
        { z: (i - mid) * 0.62, duration: EXIT, ease: "power2.inOut" },
        0
      );
    });
    tl.to(boot, { opacity: 0, duration: EXIT * 0.82, ease: "power2.inOut" }, 0.18);
  } else {
    boot.style.transition = "opacity 0.9s ease";
    boot.style.opacity = "0";
    window.setTimeout(teardown, 920);
  }
}

function onResize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h, false);
  composer?.setSize(w, h);
}

function glowMat(color, opacity) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function regularVerts(sides, radius, rotation) {
  const verts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i / sides) * Math.PI * 2 + Math.PI / sides;
    verts.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  return verts;
}

function roundedRectVerts(width, height, radius, segs) {
  const w = width / 2;
  const h = height / 2;
  const r = Math.min(radius, w, h);
  const verts = [];
  const corners = [
    [w - r, -h + r, -Math.PI / 2],
    [w - r, h - r, 0],
    [-w + r, h - r, Math.PI / 2],
    [-w + r, -h + r, Math.PI],
  ];
  for (let c = 0; c < corners.length; c++) {
    const [cx, cy, start] = corners[c];
    for (let i = 0; i <= segs; i++) {
      const a = start + (i / segs) * (Math.PI / 2);
      verts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  }
  return verts;
}

function frameGeometry(verts, thickness) {
  const shape = new THREE.Shape();
  shape.moveTo(verts[0][0], verts[0][1]);
  for (let i = 1; i < verts.length; i++) shape.lineTo(verts[i][0], verts[i][1]);
  shape.closePath();

  const hole = new THREE.Path();
  const inner = verts.map(([x, y]) => {
    const n = Math.hypot(x, y) || 1;
    const s = Math.max(n - thickness, n * 0.72) / n;
    return [x * s, y * s];
  });
  hole.moveTo(inner[0][0], inner[0][1]);
  for (let i = inner.length - 1; i >= 1; i--) hole.lineTo(inner[i][0], inner[i][1]);
  hole.closePath();
  shape.holes.push(hole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.02,
    bevelEnabled: false,
    curveSegments: 1,
  });
  geo.translate(0, 0, -0.01);
  return geo;
}

function makeFrame(verts, thickness, color, opacity) {
  return new THREE.Mesh(frameGeometry(verts, thickness), glowMat(color, opacity));
}

function makeTicks() {
  const group = new THREE.Group();
  const count = 24;
  const inner = 1.5;
  const outer = 1.68;
  for (let i = 0; i < count; i++) {
    const major = i % 6 === 0;
    const len = major ? outer - inner : (outer - inner) * 0.55;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(len, major ? 0.014 : 0.008, 0.008),
      glowMat(STEEL, major ? 0.42 : 0.2)
    );
    const a = (i / count) * Math.PI * 2;
    const r = inner + len / 2;
    mesh.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
    mesh.rotation.z = a;
    group.add(mesh);
  }
  return group;
}

function buildScene() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  fitScale = w / h < 0.8 ? 0.78 : 1;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 40);
  camera.position.set(0, 0, 5.35);

  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setClearColor(0x000000, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.34, 0.22, 0.28));
  composer.addPass(new OutputPass());

  gate = new THREE.Group();
  gate.rotation.set(0.06, 0, 0);
  scene.add(gate);

  const inner = makeFrame(regularVerts(8, 0.68, 0), 0.034, IVORY, 0.95);
  inner.userData.spinZ = 0.11;
  inner.position.z = 0.08;

  const gold = makeFrame(regularVerts(8, 0.96, Math.PI / 8), 0.028, GOLD, 0.9);
  gold.userData.spinZ = -0.16;
  gold.position.z = 0.02;

  const steel = makeFrame(regularVerts(8, 1.16, 0), 0.022, STEEL, 0.42);
  steel.userData.spinZ = 0.07;
  steel.position.z = -0.04;

  const rect = makeFrame(roundedRectVerts(2.36, 1.42, 0.14, 6), 0.026, IVORY, 0.34);
  rect.userData.spinZ = -0.02;
  rect.position.z = -0.12;

  const rectBack = makeFrame(roundedRectVerts(2.72, 1.66, 0.16, 6), 0.02, DIM, 0.16);
  rectBack.userData.spinZ = 0.012;
  rectBack.position.z = -0.32;

  plates = [inner, gold, steel, rect, rectBack];
  plates.forEach((plate) => gate.add(plate));

  gate.add(makeTicks());

  scan = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.016), glowMat(GOLD, 0.38));
  scan.position.z = 0.14;
  gate.add(scan);

  gate.scale.setScalar(0.86 * fitScale);
}

function tick(now) {
  if (!running) return;
  raf = requestAnimationFrame(tick);
  const t = now * 0.001;

  gate.rotation.x = 0.06 + Math.sin(t * 0.16) * 0.02;
  gate.rotation.y = Math.sin(t * 0.13) * 0.03;

  for (let i = 0; i < plates.length; i++) {
    const plate = plates[i];
    plate.rotation.z = t * plate.userData.spinZ;
  }

  const span = 1.42;
  const period = 2.8;
  const p = (t % period) / period;
  const ping = p < 0.5 ? p * 2 : 2 - p * 2;
  scan.position.y = -span + ping * span * 2;
  scan.material.opacity = 0.18 + Math.sin(ping * Math.PI) * 0.22;

  camera.position.x = Math.sin(t * 0.12) * 0.05;
  camera.position.y = Math.cos(t * 0.1) * 0.03;
  camera.lookAt(0, 0, 0);

  composer.render();
}

function playIntro() {
  if (!window.gsap) return;
  window.gsap.to(gate.scale, {
    x: fitScale,
    y: fitScale,
    z: fitScale,
    duration: ENTER,
    ease: "expo.out",
  });
  window.gsap.fromTo(
    "#boot-copy",
    { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 1.15, delay: 0.4, ease: "power2.out" }
  );
  window.gsap.fromTo(
    "#boot-fill",
    { scaleX: 0 },
    { scaleX: 1, duration: HOLD, ease: "power1.inOut" }
  );
}

async function waitForReady() {
  const floor = new Promise((resolve) => window.setTimeout(resolve, HOLD * 1000));
  const fonts = document.fonts?.ready?.catch?.(() => {}) || Promise.resolve();
  await Promise.all([floor, fonts]);
}

function reducedBoot() {
  if (window.gsap) {
    window.gsap.fromTo(
      "#boot-copy",
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.4, ease: "power1.out" }
    );
  }
  window.setTimeout(finish, 480);
}

async function start() {
  if (!boot || !canvas) {
    revealHero();
    return;
  }

  if (reduce) {
    reducedBoot();
    return;
  }

  try {
    buildScene();
  } catch (err) {
    console.warn("Gateway loader: WebGL unavailable", err);
    finish();
    return;
  }

  running = true;
  window.addEventListener("resize", onResize);
  playIntro();
  raf = requestAnimationFrame(tick);
  await waitForReady();
  finish();
}

start();
