import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  advanceHoverProgress,
  GLASS_PROFILES,
  iconRenderProfile,
  orbitPointAt,
  orbitRotationAt,
  ORBIT_PATHS,
  ORBIT_ROTATION_OFFSET,
  STATION_COLORS,
  STATION_GLASS_GEOMETRY,
  stationVisualScale,
} from "./station-visuals.mjs";

export const DOCK_READY = 0.58;
export const FOCUS_START = 0.64;
export const FOCUS_END = 0.98;

const TAU = Math.PI * 2;
const FOCUS_DOCK = 2.72;
const ORB_RENDER_ORDER = 20;
const RENDER_INTERVAL = 1000 / 60 - 2;
const ORBIT_TUBULAR_SEGMENTS = 80;
const ORBIT_RADIAL_SEGMENTS = 8;
const DECORATION_SPIN_SPEED_MULTIPLIER = 1.69;
const STATION_STEP = TAU / 6;
const STATIONS = [
  { label: "Marketing & Content", icon: "megaphone", angle: FOCUS_DOCK, orbit: 2 },
  { label: "Prototyping", icon: "code", angle: FOCUS_DOCK - STATION_STEP, orbit: 1 },
  { label: "AI Agents", icon: "robot", angle: FOCUS_DOCK - STATION_STEP * 2, orbit: 0 },
  { label: "Customer Engagement", icon: "chat", angle: FOCUS_DOCK - STATION_STEP * 3, orbit: 2 },
  { label: "Document Management", icon: "document", angle: FOCUS_DOCK - STATION_STEP * 4, orbit: 1 },
  { label: "Talent Assessment", icon: "people", angle: FOCUS_DOCK - STATION_STEP * 5, orbit: 0 },
];

const DECORATIONS = [
  ["sphere", -0.4, 2.66, -2.05, 0.22, 0.2],
  ["tetra", 1.12, 2.94, -2.35, 0.42, 1.1],
  ["cube", 2.08, 2.32, -1.95, 0.38, 2.2],
  ["sphere", 3.18, 1.08, -2.2, 0.17, 0.8],
  ["capsule", 3.72, -0.6, -2.0, 0.32, 2.8],
  ["sphere", 2.24, -2.66, -1.85, 0.25, 1.6],
  ["cylinder", 0.18, -3.02, -2.25, 0.48, 0.4],
  ["sphere", -1.32, -2.52, -2.1, 0.19, 2.4],
  ["cube", -3.3, -1.06, -2.4, 0.34, 1.3],
  ["sphere", -3.24, 1.2, -1.9, 0.15, 2.05],
];

class EllipseCurve3 extends THREE.Curve {
  constructor(rx, ry) {
    super();
    this.rx = rx;
    this.ry = ry;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const angle = t * TAU;
    return target.set(Math.cos(angle) * this.rx, Math.sin(angle) * this.ry, 0);
  }
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function nearestAngle(target, current) {
  let next = target;
  while (next - current > Math.PI) next -= TAU;
  while (next - current < -Math.PI) next += TAU;
  return next;
}

function makeStroke(points, material, radius = 0.045, closed = false) {
  const vectors = points.map(([x, y]) => new THREE.Vector3(x, y, 0.27));
  const path = new THREE.CurvePath();
  for (let index = 0; index < vectors.length - 1; index += 1) {
    path.add(new THREE.LineCurve3(vectors[index], vectors[index + 1]));
  }
  if (closed) path.add(new THREE.LineCurve3(vectors[vectors.length - 1], vectors[0]));
  const geometry = new THREE.TubeGeometry(path, Math.max(16, vectors.length * 5), radius, 6, false);
  return new THREE.Mesh(geometry, material);
}

function arcPoints(cx, cy, radius, start, end, segments = 12) {
  return Array.from({ length: segments + 1 }, (_, index) => {
    const angle = start + ((end - start) * index) / segments;
    return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
  });
}

function roundedRectPoints(width, height, radius, segments = 4) {
  const left = -width * 0.5;
  const right = width * 0.5;
  const top = height * 0.5;
  const bottom = -height * 0.5;
  return [
    ...arcPoints(right - radius, top - radius, radius, 0, Math.PI * 0.5, segments),
    ...arcPoints(left + radius, top - radius, radius, Math.PI * 0.5, Math.PI, segments).slice(1),
    ...arcPoints(left + radius, bottom + radius, radius, Math.PI, Math.PI * 1.5, segments).slice(1),
    ...arcPoints(right - radius, bottom + radius, radius, Math.PI * 1.5, TAU, segments).slice(1),
  ];
}

function makeDot(x, y, radius, material) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.075, 20), material);
  mesh.rotation.x = Math.PI * 0.5;
  mesh.position.set(x, y, 0.27);
  return mesh;
}

function createHighlightTexture() {
  const source = document.createElement("canvas");
  source.width = 128;
  source.height = 128;
  const context = source.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, "rgba(255,255,255,0.94)");
  gradient.addColorStop(0.34, "rgba(255,255,255,0.52)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createShadowTexture() {
  const source = document.createElement("canvas");
  source.width = 256;
  source.height = 256;
  const context = source.getContext("2d");
  const gradient = context.createRadialGradient(128, 128, 8, 128, 128, 128);
  gradient.addColorStop(0, "rgba(16, 46, 36, 0.72)");
  gradient.addColorStop(0.22, "rgba(22, 58, 44, 0.42)");
  gradient.addColorStop(0.55, "rgba(36, 82, 62, 0.14)");
  gradient.addColorStop(1, "rgba(36, 82, 62, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(source);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlassEnvironment(pmrem) {
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(14, 16, 12), new THREE.MeshBasicMaterial({ color: 0xf2faf6, side: THREE.BackSide })));
  const windowPane = new THREE.Mesh(new THREE.PlaneGeometry(10, 6.5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  windowPane.position.set(-5.6, 6.6, 8.4);
  windowPane.lookAt(0, 0, 0);
  const bounce = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 8.4), new THREE.MeshBasicMaterial({ color: 0xc8f2dc }));
  bounce.position.set(7.4, 1.4, 5.8);
  bounce.lookAt(0, 0, 0);
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  strip.position.set(0.4, 7.6, 2.2);
  strip.lookAt(0, 0, 0);
  const rimPane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 8.8), new THREE.MeshBasicMaterial({ color: 0xf6fffb }));
  rimPane.position.set(5.8, 1.8, -7.2);
  rimPane.lookAt(0, 0, 0);
  const frontCard = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 1.4), new THREE.MeshBasicMaterial({ color: 0xe5f8ee }));
  frontCard.position.set(-1.2, -4.4, 8.8);
  frontCard.lookAt(0, 0, 0);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 26), new THREE.MeshBasicMaterial({ color: 0x14362b }));
  floor.rotation.x = -Math.PI * 0.5;
  floor.position.y = -5.2;
  envScene.add(windowPane, bounce, strip, rimPane, frontCard, floor);
  const target = pmrem.fromScene(envScene, 0.02);
  envScene.traverse((object) => {
    object.geometry?.dispose?.();
    if (object.material) object.material.dispose();
  });
  return target;
}

function createIcon(type, material, lightMaterial) {
  const icon = new THREE.Group();
  const stroke = (points, accent = false, radius = 0.045, closed = false) =>
    icon.add(makeStroke(points, accent ? lightMaterial : material, radius, closed));

  if (type === "megaphone") {
    stroke([[-0.5, 0.22], [-0.16, 0.22], [0.42, 0.5], [0.42, -0.34], [-0.16, -0.06], [-0.5, -0.06]], false, 0.052);
    stroke([[-0.16, -0.06], [-0.04, -0.48], [0.18, -0.48], [0.08, -0.17]], false, 0.052);
    stroke([[0.58, 0.29], [0.7, 0.18], [0.72, 0.03], [0.65, -0.09]], true, 0.035);
  }

  if (type === "code") {
    stroke([[-0.18, 0.43], [-0.54, 0], [-0.18, -0.43]], false, 0.055);
    stroke([[0.18, 0.43], [0.54, 0], [0.18, -0.43]], false, 0.055);
    stroke([[0.14, 0.55], [-0.14, -0.55]], true, 0.043);
  }

  if (type === "robot") {
    stroke(roundedRectPoints(1.02, 0.7, 0.16), false, 0.05, true);
    stroke([[0, 0.35], [0, 0.56]], false, 0.045);
    icon.add(makeDot(0, 0.61, 0.065, material));
    icon.add(makeDot(-0.26, 0.08, 0.07, lightMaterial), makeDot(0.26, 0.08, 0.07, lightMaterial));
    stroke([[-0.2, -0.18], [0, -0.25], [0.2, -0.18]], true, 0.035);
  }

  if (type === "chat") {
    const bubble = roundedRectPoints(1.05, 0.72, 0.17);
    stroke([...bubble.slice(0, -4), [0.16, -0.36], [-0.14, -0.58], [-0.1, -0.34], ...bubble.slice(-4)], false, 0.05, true);
    [-0.28, 0, 0.28].forEach((x) => icon.add(makeDot(x, 0.04, 0.06, lightMaterial)));
  }

  if (type === "document") {
    stroke(roundedRectPoints(0.82, 1.08, 0.13), false, 0.05, true);
    stroke([[-0.24, 0.25], [0.24, 0.25]], true, 0.037);
    stroke([[-0.24, 0], [0.24, 0]], true, 0.037);
    stroke([[-0.24, -0.25], [0.12, -0.25]], true, 0.037);
  }

  if (type === "people") {
    icon.add(makeDot(-0.25, 0.25, 0.17, material), makeDot(0.29, 0.22, 0.14, lightMaterial));
    stroke(arcPoints(-0.25, -0.48, 0.43, Math.PI * 0.12, Math.PI * 0.88, 14), false, 0.055);
    stroke(arcPoints(0.29, -0.39, 0.34, Math.PI * 0.12, Math.PI * 0.88, 12), true, 0.046);
  }

  const buckets = new Map([[material, []], [lightMaterial, []]]);
  [...icon.children].forEach((mesh) => {
    mesh.updateMatrix();
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrix);
    buckets.get(mesh.material).push(geometry);
    mesh.geometry.dispose();
  });
  icon.clear();
  buckets.forEach((geometries, bucketMaterial) => {
    if (!geometries.length) return;
    const geometry = mergeGeometries(geometries, false);
    geometries.forEach((item) => item.dispose());
    if (geometry) icon.add(new THREE.Mesh(geometry, bucketMaterial));
  });
  return icon;
}

function createRoundedPanelGeometry(width, height, depth, radius, bevelSize, bevelSegments = 3, curveSegments = 8) {
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + radius, -halfHeight);
  shape.lineTo(halfWidth - radius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
  shape.lineTo(halfWidth, halfHeight - radius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - radius, halfHeight);
  shape.lineTo(-halfWidth + radius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - radius);
  shape.lineTo(-halfWidth, -halfHeight + radius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    steps: 1,
    curveSegments,
    bevelEnabled: true,
    bevelSegments,
    bevelSize,
    bevelThickness: Math.min(bevelSize, depth * 0.38),
  });
  geometry.center();
  return geometry;
}

let glowSpriteTexture;

function getGlowSpriteTexture() {
  if (!glowSpriteTexture) glowSpriteTexture = createHighlightTexture();
  return glowSpriteTexture;
}

function createStation(spec, index, materials, geometries) {
  const root = new THREE.Group();
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowSpriteTexture(),
    color: STATION_COLORS.bloom,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  bloom.position.z = -0.22;
  bloom.scale.set(2.15, 2.15, 1);
  bloom.renderOrder = 3;
  const glow = new THREE.Mesh(
    geometries.glow,
    new THREE.MeshBasicMaterial({ color: STATION_COLORS.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  glow.position.z = -0.08;
  glow.renderOrder = 3;
  const halo = new THREE.Mesh(geometries.halo, materials.halo.clone());
  halo.position.z = -0.04;
  const slab = new THREE.Mesh(
    geometries.slab,
    materials.glass.clone(),
  );
  slab.name = `glass-slab-${index}`;
  slab.renderOrder = 4;
  const edge = new THREE.LineSegments(geometries.edge, materials.edge.clone());
  edge.renderOrder = 7;
  const icon = createIcon(spec.icon, materials.icon, materials.iconLight);
  icon.scale.setScalar(0.82);
  icon.position.z = 0.13;
  icon.renderOrder = 8;
  root.add(bloom, glow, halo, slab, edge, icon);
  const tilts = [
    [-0.22, 0.38, -0.16],
    [0.18, -0.32, 0.18],
    [-0.14, 0.42, -0.12],
    [0.26, -0.34, 0.14],
    [-0.22, -0.28, -0.12],
    [0.16, 0.36, 0.18],
  ];
  root.rotation.order = "YXZ";
  root.userData.baseTilt = new THREE.Vector3(...tilts[index]);
  root.userData.lift = 0;
  root.userData.hoverProgress = 0;
  return { root, slab, icon, bloom, glow, halo, edge, spec, index };
}

function createDecoration(spec, materials, geometryCache) {
  const [type, x, y, z, scale, phase] = spec;
  if (!geometryCache.has(type)) {
    let geometry;
    if (type === "sphere") geometry = new THREE.SphereGeometry(1, 20, 14);
    if (type === "tetra") geometry = new THREE.TetrahedronGeometry(1, 0);
    if (type === "cube") geometry = new RoundedBoxGeometry(1.25, 1.25, 1.25, 3, 0.18);
    if (type === "capsule") geometry = new THREE.CapsuleGeometry(0.52, 0.68, 4, 10);
    if (type === "cylinder") geometry = new THREE.CylinderGeometry(0.72, 0.72, 1.05, 18, 1, false, 0, Math.PI * 2);
    geometryCache.set(type, geometry);
  }
  const geometry = geometryCache.get(type);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(geometry, materials.decorative);
  shell.renderOrder = 0;
  group.add(shell);
  if (type !== "sphere") {
    const inner = new THREE.Mesh(geometry, materials.decorativeCore);
    inner.scale.setScalar(0.52);
    inner.renderOrder = 0;
    group.add(inner);
  }
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getGlowSpriteTexture(),
    color: 0xc8ffda,
    transparent: true,
    opacity: 0.34 + Math.cos(phase) * 0.06,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  }));
  glint.position.set(-0.3 + Math.sin(phase) * 0.05, 0.34, 0.68);
  glint.scale.set(0.52, 0.28, 1);
  glint.renderOrder = 2;
  group.add(glint);
  const depth = Math.min(-1.85, z);
  group.position.set(x, y, depth);
  group.scale.setScalar(scale);
  group.rotation.set(phase * 0.2, phase * 0.34, phase * 0.15);
  group.userData.base = new THREE.Vector3(x, y, depth);
  group.userData.baseRotation = group.rotation.clone();
  group.userData.baseScale = scale;
  group.userData.glint = glint;
  group.userData.motion = {
    radiusX: 0.07 + (phase % 0.7) * 0.045,
    radiusY: 0.08 + (phase % 0.5) * 0.06,
    radiusZ: 0.035 + (phase % 0.4) * 0.025,
    speed: 0.2 + (phase % 0.8) * 0.08,
    angularVelocity: new THREE.Vector3(
      Math.sin(phase * 3.7 + 0.4) * (0.026 + phase * 0.006) * DECORATION_SPIN_SPEED_MULTIPLIER,
      Math.cos(phase * 2.9 + 0.7) * (0.044 + phase * 0.008) * DECORATION_SPIN_SPEED_MULTIPLIER,
      Math.sin(phase * 4.3 + 1.2) * (0.018 + phase * 0.005) * DECORATION_SPIN_SPEED_MULTIPLIER,
    ),
  };
  group.userData.phase = phase;
  return group;
}

function createFallback(root) {
  const fallback = document.createElement("div");
  fallback.className = "glass-orbit-fallback";
  fallback.setAttribute("aria-hidden", "true");
  fallback.innerHTML = '<span class="glass-orbit-fallback-core"></span>';
  root.appendChild(fallback);
  return {
    items: [], mode: "pass", startIdle() {}, playEnter() {}, playWelcome() {}, setMode() {},
    setProgress() {}, setOrbitEntryProgress() {}, freezeOrbit() {}, unfreezeOrbit() {},
    setPresentationVisible() {},
    hideProductsNode() {}, showProductsNode() {}, setCompanionsVisible() {},
    getProductsRect() { return null; }, getFocus() { return -1; }, recedeDock() {},
    pause() {}, resumeWhisper() {}, layout() {}, destroy() { fallback.remove(); },
  };
}

export function createField({ root, gsap, reduce }) {
  if (!root || !gsap) return createFallback(root || document.body);
  const canvas = document.createElement("canvas");
  canvas.className = "dock-svg glass-orbit-canvas";
  canvas.setAttribute("aria-hidden", "true");
  root.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "high-performance", premultipliedAlpha: false });
  } catch (error) {
    canvas.remove();
    return createFallback(root);
  }
  renderer.setClearColor(0xffffff, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.transmissionResolutionScale = 0.72;

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-8, 8, 5.5, -5.5, 0.1, 100);
  camera.position.set(0, 0, 16);
  camera.lookAt(0, 0, 0);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentTarget = createGlassEnvironment(pmrem);
  scene.environment = environmentTarget.texture;
  scene.environmentIntensity = 1.5;

  RectAreaLightUniformsLib.init();
  const key = new THREE.RectAreaLight(0xffffff, 14, 6.2, 8);
  key.position.set(-5.2, 6.8, 8.5);
  key.lookAt(0, 0, 0);
  const side = new THREE.RectAreaLight(0xb5ffd4, 10, 3.4, 6.8);
  side.position.set(7, 0.2, 6.8);
  side.lookAt(0, 0, 0);
  scene.add(key, side, new THREE.HemisphereLight(0xf7fffb, 0x1f4b3a, 1.05));

  const materials = {
    glass: new THREE.MeshPhysicalMaterial({ ...GLASS_PROFILES.slab, side: THREE.DoubleSide }),
    halo: new THREE.MeshBasicMaterial({ color: STATION_COLORS.halo, transparent: true, opacity: 0.08, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: STATION_COLORS.edge, transparent: true, opacity: 0.42, depthWrite: false }),
    icon: new THREE.MeshPhysicalMaterial(iconRenderProfile({ color: STATION_COLORS.icon, roughness: 0.16, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.08, specularIntensity: 0.55, envMapIntensity: 1.1 })),
    iconLight: new THREE.MeshPhysicalMaterial(iconRenderProfile({ color: STATION_COLORS.iconAccent, roughness: 0.18, metalness: 0.025, clearcoat: 0.5, clearcoatRoughness: 0.1, specularIntensity: 0.5, envMapIntensity: 1 })),
    orbit: new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbit),
    orbitFilament: new THREE.LineBasicMaterial({
      color: 0x58b97e,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      toneMapped: false,
    }),
    decorative: new THREE.MeshPhysicalMaterial(GLASS_PROFILES.decorationShell),
    decorativeCore: new THREE.MeshPhysicalMaterial(GLASS_PROFILES.decorationCore),
  };
  const glassIdle = new THREE.Color(STATION_COLORS.glassIdle);
  const glassLive = new THREE.Color(STATION_COLORS.glassFocused);

  const composition = new THREE.Group();
  scene.add(composition);
  const atmosphere = new THREE.Mesh(new THREE.CircleGeometry(3.55, 48), new THREE.MeshBasicMaterial({ color: 0xb8efd0, transparent: true, opacity: 0.075, depthWrite: false }));
  atmosphere.position.z = -2.5;
  atmosphere.scale.y = 0.8;
  composition.add(atmosphere);

  const orbGroup = new THREE.Group();
  composition.add(orbGroup);
  const orbGeometry = new THREE.SphereGeometry(1, 40, 28);
  const orbCore = new THREE.Mesh(orbGeometry, new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbCore));
  const orbShell = new THREE.Mesh(orbGeometry, new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbShell));
  orbCore.scale.setScalar(1.46);
  orbShell.scale.setScalar(1.68);
  orbCore.renderOrder = ORB_RENDER_ORDER;
  orbShell.renderOrder = ORB_RENDER_ORDER + 1;
  const orbBubble = new THREE.Mesh(new THREE.SphereGeometry(0.26, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 0.9, thickness: 0.35, ior: 1.38, transparent: true, opacity: 0.7, envMapIntensity: 1.4, depthTest: false, depthWrite: false }));
  orbBubble.position.set(-0.38, 0.46, 0.42);
  orbBubble.renderOrder = ORB_RENDER_ORDER + 2;
  const highlightTexture = createHighlightTexture();
  const orbHighlight = new THREE.Sprite(new THREE.SpriteMaterial({ map: highlightTexture, color: 0xffffff, transparent: true, opacity: 0.72, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  orbHighlight.position.set(-0.62, 0.7, 1.62);
  orbHighlight.scale.set(0.78, 0.42, 1);
  orbHighlight.renderOrder = ORB_RENDER_ORDER + 3;
  const orbGlint = new THREE.Sprite(new THREE.SpriteMaterial({ map: highlightTexture, color: 0xffffff, transparent: true, opacity: 0.4, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  orbGlint.position.set(0.58, -0.48, 1.46);
  orbGlint.scale.set(0.34, 0.2, 1);
  orbGlint.renderOrder = ORB_RENDER_ORDER + 3;
  orbGroup.add(orbCore, orbShell, orbBubble, orbHighlight, orbGlint);
  const shadowTexture = createShadowTexture();
  const orbShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 2.35),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.92, depthWrite: false, toneMapped: false }),
  );
  orbShadow.rotation.x = -1.02;
  orbShadow.position.set(0.1, -1.78, 0.08);
  orbShadow.renderOrder = 0;
  const orbContact = new THREE.Mesh(
    new THREE.PlaneGeometry(2.35, 1.05),
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false }),
  );
  orbContact.rotation.x = -1.08;
  orbContact.position.set(0.06, -1.7, 0.18);
  orbContact.renderOrder = 0;
  composition.add(orbShadow, orbContact);

  const orbitMeshes = ORBIT_PATHS.map((path) => {
    const material = materials.orbit.clone();
    material.opacity = path.opacity;
    const curve = new EllipseCurve3(path.radiusX, path.radiusY);
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, ORBIT_TUBULAR_SEGMENTS, 0.045, ORBIT_RADIAL_SEGMENTS, true), material);
    const filamentPoints = Array.from(
      { length: ORBIT_TUBULAR_SEGMENTS },
      (_, index) => curve.getPoint(index / ORBIT_TUBULAR_SEGMENTS),
    );
    const filament = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(filamentPoints),
      materials.orbitFilament,
    );
    filament.renderOrder = 2;
    mesh.add(filament);
    mesh.rotation.set(path.rotationX, path.rotationY, path.rotationZ + ORBIT_ROTATION_OFFSET);
    mesh.renderOrder = 1;
    composition.add(mesh);
    return mesh;
  });

  const stationGeometries = {
    glow: createRoundedPanelGeometry(2.02, 2.02, 0.04, 0.3, 0.02),
    halo: createRoundedPanelGeometry(2.1, 2.1, 0.08, 0.3, 0.035),
    slab: createRoundedPanelGeometry(
      STATION_GLASS_GEOMETRY.width,
      STATION_GLASS_GEOMETRY.height,
      STATION_GLASS_GEOMETRY.depth,
      STATION_GLASS_GEOMETRY.radius,
      STATION_GLASS_GEOMETRY.bevelSize,
      STATION_GLASS_GEOMETRY.bevelSegments,
      STATION_GLASS_GEOMETRY.curveSegments,
    ),
  };
  stationGeometries.edge = new THREE.EdgesGeometry(stationGeometries.slab, 28);
  const stations = STATIONS.map((spec, index) => {
    const station = createStation(spec, index, materials, stationGeometries);
    composition.add(station.root);
    return station;
  });
  const decorationGeometries = new Map();
  const decoratives = DECORATIONS.map((spec) => {
    const object = createDecoration(spec, materials, decorationGeometries);
    composition.add(object);
    return object;
  });

  const state = { time: 0, mode: "pass", focusIndex: -1, focusRotation: 0, focusStrength: 0, entry: reduce ? 1 : 0, recede: 0, companions: 1, pointerX: 0, pointerY: 0, pointerTargetX: 0, pointerTargetY: 0, hoverIndex: -1 };
  let width = 1;
  let height = 1;
  let compact = false;
  let raf = 0;
  let lastTime = performance.now();
  let frozen = false;
  let destroyed = false;
  let inView = true;
  let pageVisible = !document.hidden;
  let presentationVisible = true;
  let looping = false;
  let pointerMoved = false;
  let focusTween = null;
  let resizeTimer = 0;
  let staticRaf = 0;
  let lastRenderTime = 0;
  let lastAlpha = -1;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(4, 4);
  const stationSlabs = stations.map((station) => station.slab);

  function baseScale() {
    return compact ? 0.62 : Math.min(1.02, Math.max(0.82, width / 1500));
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    compact = width < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 0.85 : 1));
    renderer.setSize(width, height, false);
    const viewHeight = compact ? 12.4 : 10.8;
    const viewWidth = viewHeight * (width / height);
    camera.left = -viewWidth * 0.5;
    camera.right = viewWidth * 0.5;
    camera.top = viewHeight * 0.5;
    camera.bottom = -viewHeight * 0.5;
    camera.updateProjectionMatrix();
    composition.position.set((compact ? 0.08 : 0.5) * viewWidth * 0.5, (compact ? -0.48 : -0.01) * viewHeight * 0.5, 0);
    composition.scale.setScalar(baseScale());
    kick();
  }

  function stationAngle(station) {
    return station.spec.angle + state.focusRotation;
  }

  function updateStation(station) {
    const angle = stationAngle(station);
    const lift = station.root.userData.lift || 0;
    const active = lift > 0.02;
    const hovered = station.index === state.hoverIndex;
    const hoverProgress = advanceHoverProgress(station.root.userData.hoverProgress || 0, hovered && !active, reduce);
    station.root.userData.hoverProgress = hoverProgress;
    const pathDrift = reduce ? 0 : Math.sin(state.time * 0.82 + station.index * 1.37) * 0.025 * (1 - lift * 0.55);
    const orbitPath = ORBIT_PATHS[station.spec.orbit];
    const [orbitX, orbitY, orbitZ] = orbitPointAt(orbitPath, angle + pathDrift, orbitMeshes[station.spec.orbit].rotation.z);
    const showX = compact ? -1.9 : -3.32;
    const showY = compact ? 2.65 : 2.42;
    const showZ = compact ? 2.05 : 2.35;
    station.root.position.set(
      orbitX + (showX - orbitX) * lift,
      orbitY + (showY - orbitY) * lift,
      orbitZ + (showZ - orbitZ) * lift + hoverProgress * 0.2 * (1 - lift),
    );
    const tilt = station.root.userData.baseTilt;
    const toward = lift * 0.84;
    const wobble = reduce || lift > 0.04 ? 0 : 1;
    const spin = reduce ? 0 : lift * TAU;
    station.root.rotation.x = tilt.x * (1 - toward) + Math.sin(angle) * -0.04 * (1 - lift) + state.pointerY * 0.04 + lift * 0.18;
    station.root.rotation.y = tilt.y * (1 - toward) + Math.cos(angle) * 0.05 * (1 - lift) + state.pointerX * 0.045 + spin + lift * -0.26;
    station.root.rotation.z = tilt.z * (1 - toward) * 0.35 + Math.sin(state.time * 0.55 + station.index) * 0.02 * wobble;
    const hoverTiltEase = 1 - hoverProgress * 0.28;
    station.root.rotation.x *= hoverTiltEase;
    station.root.rotation.y *= hoverTiltEase;
    station.root.rotation.z *= 1 - hoverProgress * 0.42;
    const depth = clamp01((orbitZ + 1.5) / 3);
    const orbitDepthScale = 0.9 + depth * 0.18;
    const depthScale = orbitDepthScale + (1 - orbitDepthScale) * lift;
    station.root.scale.setScalar(stationVisualScale({ depthScale, lift, hoverProgress }));
    station.root.visible = state.companions > 0.02;
    station.slab.material.color.lerpColors(glassIdle, glassLive, lift);
    station.slab.material.envMapIntensity = 2.2 - lift * 0.55;
    station.halo.material.opacity = 0.095 + lift * 0.1 + hoverProgress * 0.07;
    station.glow.material.opacity = lift * 0.14 + hoverProgress * 0.09;
    station.glow.scale.setScalar(1 + lift * 0.04 + hoverProgress * 0.025);
    station.bloom.material.opacity = lift * 0.22 + hoverProgress * 0.1;
    station.bloom.scale.set(2.05 + lift * 0.2 + hoverProgress * 0.12, 2.05 + lift * 0.2 + hoverProgress * 0.12, 1);
    station.edge.material.opacity = 0.42 + lift * 0.04 + hoverProgress * 0.16;
  }

  function updateScene() {
    state.pointerX += (state.pointerTargetX - state.pointerX) * 0.055;
    state.pointerY += (state.pointerTargetY - state.pointerY) * 0.055;
    composition.rotation.x = state.pointerY * -0.035;
    composition.rotation.y = state.pointerX * 0.055;
    composition.scale.setScalar(baseScale() * (0.86 + state.entry * 0.14) * (1 - state.recede * 0.13));
    const alpha = state.entry * (1 - state.recede);
    composition.visible = alpha > 0.002;
    if (alpha !== lastAlpha) {
      canvas.style.setProperty("--field-alpha", String(alpha));
      lastAlpha = alpha;
    }
    const orbFloat = reduce ? 0 : 1;
    const floatX = Math.sin(state.time * 0.41 + 0.6) * 0.09 * orbFloat;
    const floatY = (Math.sin(state.time * 0.58) * 0.18 + Math.sin(state.time * 0.27 + 1.1) * 0.07) * orbFloat;
    const floatZ = Math.cos(state.time * 0.36 + 0.4) * 0.06 * orbFloat;
    orbGroup.position.set(floatX, floatY, floatZ);
    orbGroup.rotation.y = state.time * 0.07;
    orbGroup.rotation.x = Math.sin(state.time * 0.22) * 0.05;
    orbCore.scale.setScalar(1.46 * (1 + Math.sin(state.time * 0.72) * 0.01));
    const shadowPulse = 1 + floatY * 0.35 + Math.sin(state.time * 0.72) * 0.02;
    orbShadow.position.set(0.1 + floatX, -1.78, 0.08 + floatZ * 0.25);
    orbContact.position.set(0.06 + floatX, -1.7, 0.18 + floatZ * 0.2);
    orbShadow.scale.set(shadowPulse, shadowPulse * 0.92, 1);
    orbContact.scale.set(shadowPulse * 0.96, shadowPulse * 0.9, 1);
    orbShadow.material.opacity = 0.92 - floatY * 0.55;
    orbContact.material.opacity = 0.7 - floatY * 0.4;
    orbBubble.position.set(-0.38 + Math.sin(state.time * 0.4) * 0.04, 0.46, 0.42);
    ORBIT_PATHS.forEach((path, index) => {
      orbitMeshes[index].rotation.z = orbitRotationAt(path, state.time);
    });
    stations.forEach(updateStation);
    decoratives.forEach((object) => {
      const { base, baseRotation, baseScale: decorationScale, glint, motion, phase } = object.userData;
      const motionAmount = reduce ? 0 : 1;
      const theta = state.time * motion.speed + phase;
      const pulse = Math.sin(theta * 1.7 + phase * 0.4);
      object.position.set(
        base.x + Math.cos(theta) * motion.radiusX * motionAmount,
        base.y + Math.sin(theta * 1.18) * motion.radiusY * motionAmount,
        base.z + Math.cos(theta * 0.83) * motion.radiusZ * motionAmount,
      );
      object.rotation.set(
        baseRotation.x + (state.time * motion.angularVelocity.x + Math.sin(theta) * 0.045) * motionAmount,
        baseRotation.y + (state.time * motion.angularVelocity.y + Math.cos(theta * 0.76) * 0.055) * motionAmount,
        baseRotation.z + (state.time * motion.angularVelocity.z + Math.sin(theta * 0.62) * 0.04) * motionAmount,
      );
      object.scale.setScalar(decorationScale * (1 + pulse * 0.035 * motionAmount));
      glint.position.set(
        -0.3 + Math.sin(theta * 1.45) * 0.12 * motionAmount,
        0.34 + Math.cos(theta * 1.2) * 0.08 * motionAmount,
        0.68,
      );
      glint.material.opacity = 0.32 + (pulse + 1) * 0.08;
    });
    if (pointerMoved && !reduce && pointer.x <= 1) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(stationSlabs, false);
      state.hoverIndex = hits.length ? stations.findIndex((station) => station.slab === hits[0].object) : -1;
    }
    pointerMoved = false;
  }

  function shouldAnimate() {
    return !destroyed && !frozen && inView && pageVisible && presentationVisible && state.mode !== "paused" && !reduce;
  }

  function syncCanvasVisibility() {
    canvas.style.display = presentationVisible && inView && pageVisible ? "block" : "none";
  }

  function render(now = performance.now()) {
    if (destroyed || !presentationVisible || !pageVisible) return;
    updateScene();
    renderer.render(scene, camera);
    lastRenderTime = now;
  }

  function stopLoop() {
    looping = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function cancelStaticRender() {
    if (staticRaf) window.cancelAnimationFrame(staticRaf);
    staticRaf = 0;
  }

  function requestRender() {
    if (destroyed || looping || staticRaf || !presentationVisible || !pageVisible) return;
    const drawWhenReady = (now) => {
      if (destroyed || looping || !presentationVisible || !pageVisible) {
        staticRaf = 0;
        return;
      }
      if (now - lastRenderTime < RENDER_INTERVAL) {
        staticRaf = window.requestAnimationFrame(drawWhenReady);
        return;
      }
      staticRaf = 0;
      render(now);
    };
    staticRaf = window.requestAnimationFrame(drawWhenReady);
  }

  function frame(now) {
    if (destroyed) {
      stopLoop();
      return;
    }
    if (!shouldAnimate()) {
      stopLoop();
      requestRender();
      return;
    }
    if (now - lastRenderTime >= RENDER_INTERVAL) {
      const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      state.time += delta;
      render(now);
    }
    raf = window.requestAnimationFrame(frame);
  }

  function startLoop() {
    if (destroyed || looping || !shouldAnimate()) return;
    looping = true;
    lastTime = performance.now();
    cancelStaticRender();
    raf = window.requestAnimationFrame(frame);
  }

  function kick() {
    if (shouldAnimate()) startLoop();
    else requestRender();
  }

  function onTweenUpdate() {
    if (!looping) requestRender();
  }

  function setPresentationVisible(visible) {
    if (presentationVisible === visible) return;
    presentationVisible = visible;
    syncCanvasVisibility();
    if (visible) {
      lastTime = performance.now();
      kick();
    } else {
      stopLoop();
      cancelStaticRender();
    }
  }

  function setFocusIndex(index) {
    if (index === state.focusIndex) return;
    state.focusIndex = index;
    focusTween?.kill();
    const duration = reduce ? 0 : 1.28;
    stations.forEach((station) => {
      gsap.to(station.root.userData, {
        lift: station.index === index ? 1 : 0,
        duration,
        ease: "power3.inOut",
        overwrite: true,
        onUpdate: onTweenUpdate,
      });
    });
    if (index < 0) {
      focusTween = gsap.to(state, { focusStrength: 0, duration, ease: "power3.inOut", overwrite: true, onUpdate: onTweenUpdate });
      return;
    }
    const dock = compact ? 2.85 : FOCUS_DOCK;
    const orbitPath = ORBIT_PATHS[STATIONS[index].orbit];
    const orbitRotation = orbitRotationAt(orbitPath, state.time);
    const target = nearestAngle(dock - STATIONS[index].angle - orbitRotation, state.focusRotation);
    focusTween = gsap.to(state, { focusRotation: target, focusStrength: 1, duration, ease: "power3.inOut", overwrite: true, onUpdate: onTweenUpdate });
  }

  function setProgress(progress) {
    if (progress < FOCUS_START) return setFocusIndex(-1);
    const sequence = clamp01((progress - FOCUS_START) / (FOCUS_END - FOCUS_START));
    setFocusIndex(Math.round(sequence * (STATIONS.length - 1)));
  }

  function setOrbitEntryProgress(progress) {
    state.entry = clamp01(progress);
    kick();
  }

  function setMode(next) {
    state.mode = next;
    controller.mode = next;
    kick();
  }

  function recedeDock(amount) {
    state.recede = clamp01(amount);
    kick();
  }

  function setCompanionsVisible(visible) {
    gsap.to(state, { companions: visible ? 1 : 0, duration: visible ? 0.42 : 0.3, ease: "power2.out", overwrite: "auto", onUpdate: onTweenUpdate });
  }

  function onPointerMove(event) {
    if (!presentationVisible || !inView) return;
    const nx = event.clientX / width * 2 - 1;
    const ny = -(event.clientY / height * 2 - 1);
    state.pointerTargetX = nx;
    state.pointerTargetY = ny;
    pointer.set(nx, ny);
    pointerMoved = true;
  }

  function onPointerLeave() {
    state.pointerTargetX = 0;
    state.pointerTargetY = 0;
    pointer.set(4, 4);
    state.hoverIndex = -1;
  }

  function handleResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 40);
  }

  function handleVisibilityChange() {
    pageVisible = !document.hidden;
    syncCanvasVisibility();
    if (pageVisible) {
      lastTime = performance.now();
      kick();
    } else {
      stopLoop();
      cancelStaticRender();
    }
  }

  const visibilityTarget = document.getElementById("pin-slot") || root;
  const visibility = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    syncCanvasVisibility();
    if (inView) kick();
    else stopLoop();
  }, { threshold: 0.02 });
  visibility.observe(visibilityTarget);

  window.addEventListener("resize", handleResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  resize();
  kick();

  const controller = {
    items: stations,
    mode: state.mode,
    startIdle() { setMode("idle"); },
    playEnter() { setMode("pass"); },
    playWelcome() { setMode("pass"); },
    setMode,
    setProgress,
    setOrbitEntryProgress,
    freezeOrbit() { frozen = true; stopLoop(); requestRender(); },
    unfreezeOrbit() { frozen = false; lastTime = performance.now(); kick(); },
    setPresentationVisible,
    hideProductsNode() {},
    showProductsNode() {},
    setCompanionsVisible,
    getProductsRect() { return null; },
    getFocus() { return state.focusIndex; },
    recedeDock,
    pause() { setMode("paused"); },
    resumeWhisper() { setMode("whisper"); },
    layout() { resize(); kick(); },
    destroy() {
      destroyed = true;
      visibility.disconnect();
      stopLoop();
      window.cancelAnimationFrame(raf);
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      cancelStaticRender();
      focusTween?.kill();
      stations.forEach((station) => gsap.killTweensOf(station.root.userData));
      const geometries = new Set();
      const sceneMaterials = new Set();
      scene.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => sceneMaterials.add(material));
        else if (object.material) sceneMaterials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose());
      sceneMaterials.forEach((material) => material.dispose());
      environmentTarget.dispose();
      highlightTexture.dispose();
      shadowTexture.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };

  return controller;
}
