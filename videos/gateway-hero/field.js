import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  advanceHoverProgress,
  GLASS_PROFILES,
  iconRenderProfile,
  STATION_COLORS,
  STATION_GLASS_GEOMETRY,
  stationVisualScale,
} from "./station-visuals.mjs";

export const DOCK_READY = 0.58;
export const FOCUS_START = 0.64;
export const FOCUS_END = 0.98;

const TAU = Math.PI * 2;
const FOCUS_DOCK = 2.72;
const STATION_STEP = TAU / 6;
const STATIONS = [
  { label: "Marketing & Content", icon: "megaphone", angle: FOCUS_DOCK, radius: 1.02 },
  { label: "Prototyping", icon: "code", angle: FOCUS_DOCK - STATION_STEP, radius: 1 },
  { label: "AI Agents", icon: "robot", angle: FOCUS_DOCK - STATION_STEP * 2, radius: 1.02 },
  { label: "Customer Engagement", icon: "chat", angle: FOCUS_DOCK - STATION_STEP * 3, radius: 0.98 },
  { label: "Document Management", icon: "document", angle: FOCUS_DOCK - STATION_STEP * 4, radius: 1.04 },
  { label: "Talent Assessment", icon: "people", angle: FOCUS_DOCK - STATION_STEP * 5, radius: 1 },
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

function createStation(spec, index, materials) {
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
    createRoundedPanelGeometry(2.02, 2.02, 0.04, 0.3, 0.02),
    new THREE.MeshBasicMaterial({ color: STATION_COLORS.glow, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }),
  );
  glow.position.z = -0.08;
  glow.renderOrder = 3;
  const halo = new THREE.Mesh(createRoundedPanelGeometry(2.1, 2.1, 0.08, 0.3, 0.035), materials.halo.clone());
  halo.position.z = -0.04;
  const slab = new THREE.Mesh(
    createRoundedPanelGeometry(
      STATION_GLASS_GEOMETRY.width,
      STATION_GLASS_GEOMETRY.height,
      STATION_GLASS_GEOMETRY.depth,
      STATION_GLASS_GEOMETRY.radius,
      STATION_GLASS_GEOMETRY.bevelSize,
      STATION_GLASS_GEOMETRY.bevelSegments,
      STATION_GLASS_GEOMETRY.curveSegments,
    ),
    materials.glass.clone(),
  );
  slab.name = `glass-slab-${index}`;
  slab.renderOrder = 4;
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry, 28), materials.edge.clone());
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

function createDecoration(spec, materials) {
  const [type, x, y, z, scale, phase] = spec;
  let geometry;
  if (type === "sphere") geometry = new THREE.SphereGeometry(1, 32, 22);
  if (type === "tetra") geometry = new THREE.TetrahedronGeometry(1, 0);
  if (type === "cube") geometry = new RoundedBoxGeometry(1.25, 1.25, 1.25, 4, 0.18);
  if (type === "capsule") geometry = new THREE.CapsuleGeometry(0.52, 0.68, 6, 14);
  if (type === "cylinder") geometry = new THREE.CylinderGeometry(0.72, 0.72, 1.05, 28, 1, false, 0, Math.PI * 2);
  const group = new THREE.Group();
  const shell = new THREE.Mesh(geometry, materials.decorative.clone());
  shell.renderOrder = 0;
  group.add(shell);
  if (type !== "sphere") {
    const inner = new THREE.Mesh(geometry, materials.decorativeCore.clone());
    inner.scale.setScalar(0.52);
    inner.renderOrder = 0;
    group.add(inner);
  }
  const depth = Math.min(-1.85, z);
  group.position.set(x, y, depth);
  group.scale.setScalar(scale);
  group.rotation.set(phase * 0.2, phase * 0.34, phase * 0.15);
  group.userData.base = new THREE.Vector3(x, y, depth);
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.transmissionResolutionScale = 0.88;

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
  const spec = new THREE.DirectionalLight(0xffffff, 2.4);
  spec.position.set(-3.8, 7.4, 10);
  const spark = new THREE.PointLight(0xe7fff4, 18, 16, 1.8);
  spark.position.set(-1.6, 1.8, 4.6);
  const rim = new THREE.RectAreaLight(0xd9ffeb, 7, 2.4, 7.2);
  rim.position.set(5.8, 3.2, -5.4);
  rim.lookAt(0, 0, 0);
  scene.add(key, side, spec, spark, rim, new THREE.HemisphereLight(0xf7fffb, 0x1f4b3a, 0.85));

  const materials = {
    glass: new THREE.MeshPhysicalMaterial({ ...GLASS_PROFILES.slab, side: THREE.DoubleSide }),
    halo: new THREE.MeshBasicMaterial({ color: STATION_COLORS.halo, transparent: true, opacity: 0.08, depthWrite: false }),
    edge: new THREE.LineBasicMaterial({ color: STATION_COLORS.edge, transparent: true, opacity: 0.42, depthWrite: false }),
    icon: new THREE.MeshPhysicalMaterial(iconRenderProfile({ color: STATION_COLORS.icon, roughness: 0.16, metalness: 0.04, clearcoat: 0.55, clearcoatRoughness: 0.08, specularIntensity: 0.55, envMapIntensity: 1.1 })),
    iconLight: new THREE.MeshPhysicalMaterial(iconRenderProfile({ color: STATION_COLORS.iconAccent, roughness: 0.18, metalness: 0.025, clearcoat: 0.5, clearcoatRoughness: 0.1, specularIntensity: 0.5, envMapIntensity: 1 })),
    orbit: new THREE.MeshStandardMaterial({ color: 0xdff8eb, roughness: 0.13, metalness: 0.04, transparent: true, opacity: 0.58, depthWrite: false, envMapIntensity: 1.75 }),
    decorative: new THREE.MeshPhysicalMaterial({ color: 0xf3fff8, roughness: 0.028, metalness: 0, transmission: 0.96, thickness: 0.7, ior: 1.52, dispersion: 0.018, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1, envMapIntensity: 2.1, attenuationColor: new THREE.Color(0x86d4ae), attenuationDistance: 1.6, transparent: true, opacity: 0.98 }),
    decorativeCore: new THREE.MeshPhysicalMaterial({ color: 0x6fbf97, roughness: 0.18, metalness: 0, transmission: 0.42, thickness: 1.1, ior: 1.46, clearcoat: 0.6, envMapIntensity: 1.2, attenuationColor: new THREE.Color(0x2f7a58), attenuationDistance: 0.7 }),
  };
  const glassIdle = new THREE.Color(STATION_COLORS.glassIdle);
  const glassLive = new THREE.Color(STATION_COLORS.glassFocused);

  const composition = new THREE.Group();
  scene.add(composition);
  const atmosphere = new THREE.Mesh(new THREE.CircleGeometry(3.55, 96), new THREE.MeshBasicMaterial({ color: 0xb8efd0, transparent: true, opacity: 0.075, depthWrite: false }));
  atmosphere.position.z = -2.5;
  atmosphere.scale.y = 0.8;
  composition.add(atmosphere);

  const orbGroup = new THREE.Group();
  composition.add(orbGroup);
  const orbVolume = new THREE.Mesh(new THREE.SphereGeometry(1.18, 48, 32), new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbVolume));
  const orbCore = new THREE.Mesh(new THREE.SphereGeometry(1.46, 64, 48), new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbCore));
  const orbShell = new THREE.Mesh(new THREE.SphereGeometry(1.68, 64, 48), new THREE.MeshPhysicalMaterial(GLASS_PROFILES.orbShell));
  orbVolume.renderOrder = 2;
  orbCore.renderOrder = 2;
  orbShell.renderOrder = 2;
  const orbBubble = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transmission: 0.9, thickness: 0.35, ior: 1.38, transparent: true, opacity: 0.7, envMapIntensity: 1.4 }));
  orbBubble.position.set(-0.38, 0.46, 0.42);
  orbBubble.renderOrder = 2;
  const highlightTexture = createHighlightTexture();
  const orbHighlight = new THREE.Sprite(new THREE.SpriteMaterial({ map: highlightTexture, color: 0xffffff, transparent: true, opacity: 0.72, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  orbHighlight.position.set(-0.62, 0.7, 1.62);
  orbHighlight.scale.set(0.78, 0.42, 1);
  orbHighlight.renderOrder = 3;
  const orbGlint = new THREE.Sprite(new THREE.SpriteMaterial({ map: highlightTexture, color: 0xffffff, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  orbGlint.position.set(0.58, -0.48, 1.46);
  orbGlint.scale.set(0.34, 0.2, 1);
  orbGlint.renderOrder = 3;
  orbGroup.add(orbVolume, orbCore, orbShell, orbBubble, orbHighlight, orbGlint);
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

  const orbitSpecs = [
    [3.75, 1.42, 0.12, 0.12, 0.15, 0.6],
    [4.2, 1.78, 0.42, -0.16, -0.19, 0.48],
    [3.5, 2.16, -0.34, 0.28, 0.22, 0.4],
  ];
  const orbitMeshes = orbitSpecs.map(([rx, ry, x, y, z, opacity]) => {
    const material = materials.orbit.clone();
    material.opacity = opacity;
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new EllipseCurve3(rx, ry), 64, 0.021, 5, true), material);
    mesh.rotation.set(x, y, z);
    mesh.renderOrder = 1;
    composition.add(mesh);
    return mesh;
  });

  const stations = STATIONS.map((spec, index) => {
    const station = createStation(spec, index, materials);
    composition.add(station.root);
    return station;
  });
  const decoratives = DECORATIONS.map((spec) => {
    const object = createDecoration(spec, materials);
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
  let looping = false;
  let pointerMoved = false;
  let focusTween = null;
  let resizeTimer = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(4, 4);

  function baseScale() {
    return compact ? 0.62 : Math.min(1.02, Math.max(0.82, width / 1500));
  }

  function resize() {
    width = Math.max(1, window.innerWidth);
    height = Math.max(1, window.innerHeight);
    compact = width < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1 : 1.25));
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
    render();
  }

  function stationAngle(station) {
    return station.spec.angle + state.focusRotation + state.time * 0.018;
  }

  function updateStation(station) {
    const angle = stationAngle(station);
    const lift = station.root.userData.lift || 0;
    const active = lift > 0.02;
    const hovered = station.index === state.hoverIndex;
    const hoverProgress = advanceHoverProgress(station.root.userData.hoverProgress || 0, hovered && !active, reduce);
    station.root.userData.hoverProgress = hoverProgress;
    const radius = station.spec.radius;
    const float = reduce ? 0 : Math.sin(state.time * 0.82 + station.index * 1.37) * 0.085 * (1 - lift * 0.55);
    const orbitX = Math.cos(angle) * 3.62 * radius;
    const orbitY = Math.sin(angle) * 2.82 * radius + float;
    const orbitZ = Math.cos(angle) * 0.72;
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
    const depthScale = 0.94 + (Math.cos(angle) + 1) * 0.055 * (1 - lift);
    station.root.scale.setScalar(stationVisualScale({ depthScale, lift, hoverProgress }));
    let others = 0;
    stations.forEach((item) => {
      if (item !== station) others = Math.max(others, item.root.userData.lift || 0);
    });
    const dim = 1 - others * 0.42;
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
    canvas.style.setProperty("--field-alpha", String(alpha));
    const orbFloat = reduce ? 0 : 1;
    const floatX = Math.sin(state.time * 0.41 + 0.6) * 0.09 * orbFloat;
    const floatY = (Math.sin(state.time * 0.58) * 0.18 + Math.sin(state.time * 0.27 + 1.1) * 0.07) * orbFloat;
    const floatZ = Math.cos(state.time * 0.36 + 0.4) * 0.06 * orbFloat;
    orbGroup.position.set(floatX, floatY, floatZ);
    orbGroup.rotation.y = state.time * 0.07;
    orbGroup.rotation.x = Math.sin(state.time * 0.22) * 0.05;
    orbCore.scale.setScalar(1 + Math.sin(state.time * 0.72) * 0.01);
    orbVolume.scale.setScalar(1 + Math.sin(state.time * 0.54 + 0.6) * 0.018);
    const shadowPulse = 1 + floatY * 0.35 + Math.sin(state.time * 0.72) * 0.02;
    orbShadow.position.set(0.1 + floatX, -1.78, 0.08 + floatZ * 0.25);
    orbContact.position.set(0.06 + floatX, -1.7, 0.18 + floatZ * 0.2);
    orbShadow.scale.set(shadowPulse, shadowPulse * 0.92, 1);
    orbContact.scale.set(shadowPulse * 0.96, shadowPulse * 0.9, 1);
    orbShadow.material.opacity = 0.92 - floatY * 0.55;
    orbContact.material.opacity = 0.7 - floatY * 0.4;
    orbBubble.position.set(-0.38 + Math.sin(state.time * 0.4) * 0.04, 0.46, 0.42);
    orbitMeshes[0].rotation.z = 0.15 + state.time * 0.018;
    orbitMeshes[1].rotation.z = -0.19 - state.time * 0.014;
    orbitMeshes[2].rotation.z = 0.22 + state.time * 0.011;
    stations.forEach(updateStation);
    decoratives.forEach((object) => {
      const { base, phase } = object.userData;
      const drift = reduce ? 0 : Math.sin(state.time * 0.48 + phase) * 0.1;
      object.position.set(base.x + drift * 0.18, base.y + drift, base.z);
      object.rotation.x += reduce ? 0 : 0.0014 + phase * 0.00008;
      object.rotation.y += reduce ? 0 : 0.0018 + phase * 0.00007;
    });
    if (pointerMoved && !reduce && pointer.x <= 1) {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(stations.map((station) => station.slab), false);
      state.hoverIndex = hits.length ? stations.findIndex((station) => station.slab === hits[0].object) : -1;
    }
    pointerMoved = false;
  }

  function shouldAnimate() {
    return !destroyed && !frozen && inView && state.mode !== "paused" && !reduce;
  }

  function render() {
    if (destroyed) return;
    updateScene();
    renderer.render(scene, camera);
  }

  function stopLoop() {
    looping = false;
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  function frame(now) {
    if (destroyed) {
      stopLoop();
      return;
    }
    const delta = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (shouldAnimate()) state.time += delta;
    render();
    if (shouldAnimate()) raf = window.requestAnimationFrame(frame);
    else stopLoop();
  }

  function startLoop() {
    if (destroyed || looping || !shouldAnimate()) return;
    looping = true;
    lastTime = performance.now();
    raf = window.requestAnimationFrame(frame);
  }

  function kick() {
    if (looping) return;
    render();
    if (shouldAnimate()) startLoop();
    else stopLoop();
  }

  function onTweenUpdate() {
    if (!looping) render();
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
    const target = nearestAngle(dock - STATIONS[index].angle - state.time * 0.018, state.focusRotation);
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

  const visibility = new IntersectionObserver((entries) => {
    inView = entries.some((entry) => entry.isIntersecting);
    if (inView) kick();
    else stopLoop();
  }, { threshold: 0.02 });
  visibility.observe(root);

  window.addEventListener("resize", handleResize);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave);
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
    freezeOrbit() { frozen = true; render(); stopLoop(); },
    unfreezeOrbit() { frozen = false; lastTime = performance.now(); kick(); },
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
      focusTween?.kill();
      stations.forEach((station) => gsap.killTweensOf(station.root.userData));
      scene.traverse((object) => {
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material?.dispose?.();
      });
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
