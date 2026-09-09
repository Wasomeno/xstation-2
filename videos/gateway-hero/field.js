import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.181.2/examples/jsm/libs/draco/");

function createGLTFLoader() {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

const NS = "http://www.w3.org/2000/svg";
const PREPARED_ENVIRONMENT_URL = new URL(
  "assets/environment/room-pmrem-r181.bin.gz",
  import.meta.url,
);
const PREPARED_ENVIRONMENT_WIDTH = 768;
const PREPARED_ENVIRONMENT_HEIGHT = 1024;

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
const ACTIVE_CATEGORY_ZOOM = 3.75;
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
const RING_SPIN = { mid: 0.82, outer: 0.64 };
// Keep the category and model mapping together so the orbit story order and
// its visual shorthand cannot drift apart.
const STATION_NODES = [
  { label: "Marketing & Content", model: "marketing", ring: "mid", angle: Math.PI / 2, accent: true },
  { label: "Prototyping", model: "retroComputer", ring: "outer", angle: -Math.PI * 2 / 3, accent: false },
  { label: "AI Agents", model: "robot", ring: "outer", angle: 0.06, accent: false },
  { label: "Customer Engagement", model: "handshake", ring: "mid", angle: -Math.PI / 6, accent: true },
  { label: "Document Management", model: "documentManagement", ring: "mid", angle: Math.PI * 7 / 6, accent: false },
  { label: "Talent Assessment", model: "talentAssessment", ring: "outer", angle: Math.PI * 2 / 3, accent: false },
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
    hub: r * 0.23,
    tilt: BASE_TILT,
  };
}

function stationPose(m) {
  if (m.compact) {
    return { x: m.w * 0.22, y: m.h * 0.2, scale: 0.62 * ORBIT_RENDER_SCALE };
  }
  return { x: m.w * 0.22, y: m.h * 0.01, scale: 0.96 * ORBIT_RENDER_SCALE };
}

function heroPose(m) {
  if (m.compact) {
    return { x: m.w * 0.22, y: m.h * 0.18, scale: 0.62 * ORBIT_RENDER_SCALE };
  }
  return { x: m.w * 0.22, y: m.h * 0.02, scale: 0.96 * ORBIT_RENDER_SCALE };
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

function createSharedOrbitRenderer() {
  const canvas = document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    powerPreference: "high-performance",
  });
  if (!renderer.getContext()) return null;

  // Shader sources are fixed and covered by the warmup checks below. Avoid
  // synchronous driver log queries on first use; they force Chrome to wait for
  // GPU compilation and were the last large entry-time main-thread stalls.
  renderer.debug.checkShaderErrors = false;

  const pixelRatio = Math.min(window.devicePixelRatio || 1, CATEGORY_MODEL_PIXEL_RATIO);
  const renderSize = Math.round(CATEGORY_MODEL_RENDER_SIZE * pixelRatio);
  renderer.setPixelRatio(1);
  renderer.setSize(renderSize, renderSize, false);
  renderer.setClearColor(0x000000, 0);
  renderer.setClearAlpha(0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  let disposed = false;
  let environment = null;
  let compileQueue = Promise.resolve();

  async function loadPreparedEnvironment() {
    const response = await fetch(PREPARED_ENVIRONMENT_URL);
    if (!response.ok) throw new Error(`Could not load orbit environment (${response.status})`);
    const stream = typeof DecompressionStream === "function"
      ? response.body.pipeThrough(new DecompressionStream("gzip"))
      : null;
    if (!stream) throw new Error("Gzip decompression is unavailable");
    const buffer = await new Response(stream).arrayBuffer();
    const expectedBytes = PREPARED_ENVIRONMENT_WIDTH * PREPARED_ENVIRONMENT_HEIGHT * 4 * 2;
    if (buffer.byteLength !== expectedBytes) {
      throw new Error(`Orbit environment has ${buffer.byteLength} bytes; expected ${expectedBytes}`);
    }
    const texture = new THREE.DataTexture(
      new Uint16Array(buffer),
      PREPARED_ENVIRONMENT_WIDTH,
      PREPARED_ENVIRONMENT_HEIGHT,
      THREE.RGBAFormat,
      THREE.HalfFloatType,
    );
    texture.mapping = THREE.CubeUVReflectionMapping;
    texture.colorSpace = THREE.LinearSRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }

  function generateEnvironmentFallback() {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentScene = new RoomEnvironment();
    const texture = pmrem.fromScene(environmentScene, 0.04).texture;
    environmentScene.dispose();
    pmrem.dispose();
    return texture;
  }

  const ready = loadPreparedEnvironment()
    .catch((error) => {
      console.warn("Could not load the prepared orbit environment; generating it at runtime", error);
      return generateEnvironmentFallback();
    })
    .then((texture) => {
      if (disposed) {
        texture.dispose();
        return null;
      }
      environment = texture;
      return texture;
    });

  function prepareOutput(output, size) {
    if (output.width !== size) output.width = size;
    if (output.height !== size) output.height = size;
    return output.getContext("2d", { alpha: true, desynchronized: true });
  }

  function render(scene, camera, output) {
    if (disposed || !output) return;
    const outputSize = Math.max(output.width, output.height, 1);
    const context = prepareOutput(output, outputSize);
    if (!context) return;
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    context.clearRect(0, 0, output.width, output.height);
    context.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, output.width, output.height);
  }

  function compile(scene, camera) {
    const task = compileQueue.then(async () => {
      if (disposed || typeof renderer.compileAsync !== "function") return;
      const texture = await ready;
      if (texture) scene.environment = texture;
      await renderer.compileAsync(scene, camera);
    });
    compileQueue = task.catch(() => {});
    return task;
  }

  return {
    ready,
    pixelRatio,
    render,
    compile,
    dispose() {
      if (disposed) return;
      disposed = true;
      environment?.dispose();
      renderer.dispose();
    },
  };
}

function createOrbView(host, gsap, sharedRenderer) {
  if (!sharedRenderer) return null;
  const canvas = document.createElement("canvas");
  canvas.className = "dock-orbs";
  canvas.setAttribute("aria-hidden", "true");
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
  camera.position.set(1.35, 1.05, 4.2);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.HemisphereLight(0x90b0a0, 0x002010, 0.85));
  const key = new THREE.DirectionalLight(0xe8f3ea, 1.35);
  key.position.set(-2.2, 3.4, 2.8);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x1c855c, 0.45);
  fill.position.set(2.8, 0.6, 1.6);
  scene.add(fill);

  const geo = new THREE.SphereGeometry(1, 96, 64);
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x083b28,
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
  let renderActive = true;
  let lastLayout = null;

  return {
    layout(t, inner, gain, compact, pose) {
      lastLayout = { t, inner, gain, compact, pose };
      const px = Math.round(Math.max(150, Math.min(inner * 2.08, compact ? 210 : 300)));
      if (px !== lastPx) {
        lastPx = px;
        const outputSize = Math.round(px * Math.min(window.devicePixelRatio || 1, 2));
        canvas.width = outputSize;
        canvas.height = outputSize;
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

      if (renderActive && gain > 0.02) sharedRenderer.render(scene, camera, canvas);
    },
    canvas,
    setRenderActive(next) {
      const active = Boolean(next);
      if (active === renderActive) return;
      renderActive = active;
      if (renderActive && lastLayout) {
        this.layout(
          lastLayout.t,
          lastLayout.inner,
          lastLayout.gain,
          lastLayout.compact,
          lastLayout.pose,
        );
      }
    },
    async warm() {
      try {
        await sharedRenderer.compile(scene, camera);
      } catch (error) {
        console.debug("Could not asynchronously compile the orbit orb shader", error);
      }
      if (!lastLayout) return;
      const originalLayout = lastLayout;
      const wasActive = renderActive;
      renderActive = true;
      this.layout(
        originalLayout.t,
        originalLayout.inner,
        Math.max(originalLayout.gain, 0.03),
        originalLayout.compact,
        originalLayout.pose,
      );
      lastLayout = originalLayout;
      if (originalLayout.gain <= 0.02) gsap.set(canvas, { autoAlpha: originalLayout.gain });
      renderActive = wasActive;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      canvas.remove();
    },
  };
}

const STICKMAN_ASSET_URL = new URL("assets/models/stickman/scene.gltf", import.meta.url);
let stickmanScenePromise = null;

function loadStickmanScene() {
  if (!stickmanScenePromise) {
    stickmanScenePromise = new Promise((resolve, reject) => {
      createGLTFLoader().load(STICKMAN_ASSET_URL.href, (gltf) => resolve(gltf.scene), undefined, reject);
    });
  }
  return stickmanScenePromise;
}

function makeUpperBodyAsset(source, material, side) {
  source.updateMatrixWorld(true);
  let sourceMesh = null;
  source.traverse((child) => {
    if (!sourceMesh && child.isMesh) sourceMesh = child;
  });
  if (!sourceMesh) return null;

  let geometry = sourceMesh.geometry.clone();
  geometry.applyMatrix4(sourceMesh.matrixWorld);
  if (geometry.index) geometry = geometry.toNonIndexed();
  geometry.computeBoundingBox();

  const bounds = geometry.boundingBox;
  const width = bounds.max.x - bounds.min.x;
  const height = bounds.max.y - bounds.min.y;
  const centerX = (bounds.min.x + bounds.max.x) * 0.5;
  const shoulderY = bounds.min.y + height * 0.7;
  const waistY = bounds.min.y + height * 0.47;
  const shoulderX = width * 0.115;
  const position = geometry.getAttribute("position");
  const original = new Float32Array(position.array);

  for (let index = 0; index < position.count; index += 1) {
    const x = original[index * 3];
    const y = original[index * 3 + 1];
    const z = original[index * 3 + 2];
    const relativeX = x - centerX;
    const armSide = Math.sign(relativeX);
    const sitsOnArmBand =
      Math.abs(relativeX) > shoulderX &&
      y > shoulderY - height * 0.11 &&
      y < shoulderY + height * 0.055;

    if (!sitsOnArmBand || armSide === 0) continue;

    const pivotX = centerX + armSide * shoulderX;
    const innerArm = armSide === -side;
    const angleMagnitude = THREE.MathUtils.degToRad(innerArm ? 38 : 62);
    const angle = armSide > 0 ? -angleMagnitude : angleMagnitude;
    const dx = x - pivotX;
    const dy = y - shoulderY;

    position.setXYZ(
      index,
      pivotX + dx * Math.cos(angle) - dy * Math.sin(angle),
      shoulderY + dx * Math.sin(angle) + dy * Math.cos(angle),
      z,
    );
  }

  const keptPositions = [];
  const appendTriangle = (a, b, c) => {
    keptPositions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  const clipAtWaist = (vertices) => {
    const clipped = [];
    for (let index = 0; index < vertices.length; index += 1) {
      const current = vertices[index];
      const previous = vertices[(index + vertices.length - 1) % vertices.length];
      const currentInside = current.originalY >= waistY;
      const previousInside = previous.originalY >= waistY;

      if (currentInside !== previousInside) {
        const mix = (waistY - previous.originalY) / (current.originalY - previous.originalY);
        clipped.push({
          x: THREE.MathUtils.lerp(previous.x, current.x, mix),
          y: THREE.MathUtils.lerp(previous.y, current.y, mix),
          z: THREE.MathUtils.lerp(previous.z, current.z, mix),
          originalY: waistY,
        });
      }
      if (currentInside) clipped.push(current);
    }
    return clipped;
  };

  for (let offset = 0; offset < position.array.length; offset += 9) {
    let armTriangle = false;
    const triangle = [];
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const base = offset + vertex * 3;
      const x = original[base];
      const y = original[base + 1];
      armTriangle ||=
        Math.abs(x - centerX) > shoulderX &&
        y > shoulderY - height * 0.11 &&
        y < shoulderY + height * 0.055;
      triangle.push({
        x: position.array[base],
        y: position.array[base + 1],
        z: position.array[base + 2],
        originalY: y,
      });
    }

    const polygon = armTriangle ? triangle : clipAtWaist(triangle);
    if (polygon.length < 3) continue;
    for (let vertex = 1; vertex < polygon.length - 1; vertex += 1) {
      appendTriangle(polygon[0], polygon[vertex], polygon[vertex + 1]);
    }
  }

  geometry.dispose();
  geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(keptPositions, 3));
  const unweldedGeometry = geometry;
  geometry = mergeVertices(unweldedGeometry, 0.0001);
  unweldedGeometry.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const cropped = geometry.boundingBox;
  const croppedCenterX = (cropped.min.x + cropped.max.x) * 0.5;
  const croppedCenterZ = (cropped.min.z + cropped.max.z) * 0.5;
  const croppedHeight = cropped.max.y - cropped.min.y;
  geometry.translate(-croppedCenterX, -cropped.min.y, -croppedCenterZ);

  const mesh = new THREE.Mesh(geometry, material);
  const scale = 1.34 / croppedHeight;
  mesh.scale.setScalar(scale);
  mesh.position.y = 0.16;
  return mesh;
}

function createConversationView(host, reduce, phase = 0, characterStyle = "stick") {
  const canvas = document.createElement("canvas");
  canvas.className = "orbit-conversation-canvas";
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(200, 200, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
  camera.position.set(0, 1.2, 7.5);
  camera.lookAt(0, 1.12, 0);

  scene.add(new THREE.HemisphereLight(0xf7f8f5, 0x002010, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(-3, 5, 6);
  scene.add(key);
  const edge = new THREE.DirectionalLight(0x1c855c, 2.1);
  edge.position.set(4, 2, 3);
  scene.add(edge);

  const darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x002010,
    roughness: 0.48,
    metalness: 0.04,
  });
  const greenMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c855c,
    roughness: 0.42,
    metalness: 0.03,
  });
  const paleMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f8f5,
    roughness: 0.28,
    metalness: 0.02,
  });
  const dotMaterial = new THREE.MeshStandardMaterial({
    color: 0x1c855c,
    roughness: 0.34,
  });
  const shadowMaterial = new THREE.MeshBasicMaterial({
    color: 0x002010,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
  });
const inactivePalette = {
  dark: new THREE.Color(0x3c4c49),
  light: new THREE.Color(0x90b0a0),
  bubble: new THREE.Color(0xc8d8c8),
  dot: new THREE.Color(0x3c4c49),
};
const focusedPalette = {
  dark: new THREE.Color(0x083b28),
  light: new THREE.Color(0x1c855c),
  bubble: new THREE.Color(0x083b28),
  dot: new THREE.Color(0x1c855c),
};

  const capsuleGeometry = new THREE.CapsuleGeometry(0.075, 0.5, 6, 12);
  const torsoGeometry = new THREE.CapsuleGeometry(0.11, 0.58, 6, 12);
  const headGeometry = new THREE.SphereGeometry(0.22, 24, 18);
  const dotGeometry = new THREE.SphereGeometry(0.055, 18, 12);
  const shadowGeometry = new THREE.CircleGeometry(0.42, 32);

  function limb(material, length = 0.58, geometry = capsuleGeometry, sourceLength = 0.65) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.y = length / sourceLength;
    mesh.position.y = -length * 0.5;
    pivot.add(mesh);
    return pivot;
  }

  function makePerson(material, side) {
    const person = new THREE.Group();
    person.rotation.y = side * -0.12;

    if (characterStyle === "upper-body") {
      person.position.x = side * 0.54;
      return { person, model: null };
    }

    person.position.x = side * 0.57;

    const torso = new THREE.Mesh(torsoGeometry, material);
    torso.position.y = 0.92;
    torso.rotation.z = side * 0.04;
    person.add(torso);

    const head = new THREE.Mesh(headGeometry, material);
    head.position.set(side * -0.015, 1.58, 0);
    person.add(head);

    const outerArm = limb(material, 0.62);
    outerArm.position.set(side * 0.16, 1.25, 0);
    outerArm.rotation.z = side * -0.12;
    person.add(outerArm);

    const talkingArm = limb(material, 0.56);
    talkingArm.position.set(side * -0.16, 1.25, 0.02);
    talkingArm.rotation.z = side * 0.72;
    person.add(talkingArm);

    const outerLeg = limb(material, 0.72);
    outerLeg.position.set(side * 0.095, 0.57, 0);
    outerLeg.rotation.z = side * -0.13;
    person.add(outerLeg);

    const innerLeg = limb(material, 0.72);
    innerLeg.position.set(side * -0.095, 0.57, 0);
    innerLeg.rotation.z = side * 0.13;
    person.add(innerLeg);

    const shadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    shadow.position.set(0, -0.17, -0.08);
    shadow.scale.set(0.92, 0.3, 1);
    shadow.rotation.x = -Math.PI / 2;
    person.add(shadow);

    return { person, torso, head, talkingArm };
  }

  function roundedBubbleShape() {
    const shape = new THREE.Shape();
    const left = -0.72;
    const right = 0.72;
    const bottom = -0.22;
    const top = 0.28;
    const radius = 0.16;

    shape.moveTo(left + radius, bottom);
    shape.lineTo(0.12, bottom);
    shape.lineTo(0.27, -0.42);
    shape.lineTo(0.34, bottom);
    shape.lineTo(right - radius, bottom);
    shape.quadraticCurveTo(right, bottom, right, bottom + radius);
    shape.lineTo(right, top - radius);
    shape.quadraticCurveTo(right, top, right - radius, top);
    shape.lineTo(left + radius, top);
    shape.quadraticCurveTo(left, top, left, top - radius);
    shape.lineTo(left, bottom + radius);
    shape.quadraticCurveTo(left, bottom, left + radius, bottom);
    return shape;
  }

  const conversation = new THREE.Group();
  const conversationBaseY = characterStyle === "upper-body" ? -0.48 : -0.66;
  const conversationBaseScale = characterStyle === "upper-body" ? 1.08 : 1;
  conversation.position.y = conversationBaseY;
  conversation.scale.setScalar(conversationBaseScale);
  scene.add(conversation);

  const leftPerson = makePerson(darkMaterial, -1);
  const rightPerson = makePerson(greenMaterial, 1);
  conversation.add(leftPerson.person, rightPerson.person);
  const assetGeometries = [];

  if (characterStyle === "upper-body") {
    loadStickmanScene()
      .then((asset) => {
        if (disposed) return;
        leftPerson.model = makeUpperBodyAsset(asset, darkMaterial, -1);
        rightPerson.model = makeUpperBodyAsset(asset, greenMaterial, 1);
        [leftPerson, rightPerson].forEach((figure) => {
          if (!figure.model) return;
          figure.person.add(figure.model);
          assetGeometries.push(figure.model.geometry);
        });
      })
      .catch(() => {});
  }

  const bubbleGroup = new THREE.Group();
  const bubbleBaseY = characterStyle === "upper-body" ? 1.78 : 1.98;
  bubbleGroup.position.set(0.04, bubbleBaseY, 0.05);
  conversation.add(bubbleGroup);

  const bubbleGeometry = new THREE.ExtrudeGeometry(roundedBubbleShape(), {
    depth: 0.09,
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: 0.025,
    bevelThickness: 0.025,
  });
  bubbleGeometry.center();
  const bubble = new THREE.Mesh(bubbleGeometry, paleMaterial);
  bubble.position.z = -0.03;
  bubbleGroup.add(bubble);

  const dots = [-0.24, 0, 0.24].map((x) => {
    const dot = new THREE.Mesh(dotGeometry, dotMaterial);
    dot.position.set(x, 0.035, 0.11);
    bubbleGroup.add(dot);
    return dot;
  });

  const TWO_PI = Math.PI * 2;
  const ENTRY_DURATION = 1.15;
  const EXIT_DURATION = 0.72;
  const ACTIVE_SCALE = 1.3;
  const LOOP_DURATION = 24;
  const easeOutQuart = (value) => 1 - Math.pow(1 - value, 4);

  let frame = 0;
  let disposed = false;
  let isHovered = false;
  let isFocused = host.classList.contains("is-focus");
  let wasFocused = false;
  let greenMix = isFocused ? 1 : 0;
  let focusStartedAt = 0;
  let focusStartScale = 1;
  let focusStartRotation = 0;
  let exitStartedAt = 0;
  let exitStartScale = 1;
  let exitStartRotation = 0;
  let exitTargetRotation = 0;
  let exitStartTilt = 0;
  let modelScale = 1;
  let modelRotation = 0;
  let modelTilt = 0;

  const render = (time = window.performance.now()) => {
    if (disposed) return;
    const motionTime = time * 0.001;
    const seconds = motionTime + phase;

    if (!reduce) {
      conversation.position.y = conversationBaseY + Math.sin(seconds * 1.15) * 0.025;
      if (characterStyle === "upper-body") {
        leftPerson.person.rotation.z = -0.025 + Math.sin(seconds * 1.45) * 0.018;
        rightPerson.person.rotation.z = 0.025 - Math.sin(seconds * 1.45 + 0.8) * 0.018;
      } else {
        leftPerson.torso.rotation.z = -0.04 + Math.sin(seconds * 1.35) * 0.025;
        rightPerson.torso.rotation.z = 0.04 - Math.sin(seconds * 1.35 + 0.8) * 0.025;
        leftPerson.head.rotation.z = Math.sin(seconds * 1.55) * 0.055;
        rightPerson.head.rotation.z = -Math.sin(seconds * 1.55 + 0.9) * 0.055;
        leftPerson.talkingArm.rotation.z = -0.72 - Math.sin(seconds * 2.1) * 0.18;
        rightPerson.talkingArm.rotation.z = 0.72 + Math.sin(seconds * 1.85 + 1.1) * 0.16;
      }
      bubbleGroup.position.y = bubbleBaseY + Math.sin(seconds * 1.4 + 0.35) * 0.045;
      dots.forEach((dot, index) => {
        const pulse = 0.82 + (Math.sin(seconds * 3.1 - index * 0.72) + 1) * 0.12;
        dot.scale.setScalar(pulse);
      });
    }

    if (reduce) {
      modelScale = isFocused ? ACTIVE_SCALE : 1;
      modelRotation = 0;
      modelTilt = 0;
    } else {
      if (isFocused && !wasFocused) {
        focusStartedAt = motionTime;
        focusStartScale = modelScale;
        focusStartRotation = modelRotation;
      } else if (!isFocused && wasFocused) {
        exitStartedAt = motionTime;
        exitStartScale = modelScale;
        exitStartRotation = modelRotation;
        exitTargetRotation = Math.round(modelRotation / TWO_PI) * TWO_PI;
        exitStartTilt = modelTilt;
      }

      if (isFocused) {
        const elapsed = Math.max(0, motionTime - focusStartedAt);
        const entryProgress = THREE.MathUtils.clamp(elapsed / ENTRY_DURATION, 0, 1);
        const entryEase = easeOutQuart(entryProgress);
        const loopTime = Math.max(0, elapsed - ENTRY_DURATION);
        modelScale = THREE.MathUtils.lerp(focusStartScale, ACTIVE_SCALE, entryEase);
        modelRotation =
          focusStartRotation + TWO_PI * entryEase + (loopTime / LOOP_DURATION) * TWO_PI;
        modelTilt = Math.sin((loopTime / LOOP_DURATION) * TWO_PI) * 0.09 * entryEase;
      } else if (wasFocused || modelScale !== 1 || modelRotation !== exitTargetRotation) {
        const exitProgress = THREE.MathUtils.clamp((motionTime - exitStartedAt) / EXIT_DURATION, 0, 1);
        const exitEase = easeOutQuart(exitProgress);
        modelScale = THREE.MathUtils.lerp(exitStartScale, 1, exitEase);
        modelRotation = THREE.MathUtils.lerp(exitStartRotation, exitTargetRotation, exitEase);
        modelTilt = THREE.MathUtils.lerp(exitStartTilt, 0, exitEase);
      }
    }

    wasFocused = isFocused;
    conversation.scale.setScalar(conversationBaseScale * modelScale);
    conversation.rotation.set(modelTilt, modelRotation, 0);

    const greenTarget = isHovered || isFocused ? 1 : 0;
    greenMix += (greenTarget - greenMix) * (reduce ? 1 : 0.1);
    darkMaterial.color.lerpColors(inactivePalette.dark, focusedPalette.dark, greenMix);
    greenMaterial.color.lerpColors(inactivePalette.light, focusedPalette.light, greenMix);
    paleMaterial.color.lerpColors(inactivePalette.bubble, focusedPalette.bubble, greenMix);
    dotMaterial.color.lerpColors(inactivePalette.dot, focusedPalette.dot, greenMix);

    renderer.render(scene, camera);
    if (!reduce) frame = window.requestAnimationFrame(render);
  };

  host.classList.add("is-conversation");
  render();

  return {
    setHovered(next) {
      isHovered = Boolean(next);
      if (reduce) render();
    },
    setFocused(next) {
      isFocused = Boolean(next);
      if (reduce) render();
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      renderer.dispose();
      capsuleGeometry.dispose();
      torsoGeometry.dispose();
      headGeometry.dispose();
      dotGeometry.dispose();
      shadowGeometry.dispose();
      bubbleGeometry.dispose();
      assetGeometries.forEach((geometry) => geometry.dispose());
      darkMaterial.dispose();
      greenMaterial.dispose();
      paleMaterial.dispose();
      dotMaterial.dispose();
      shadowMaterial.dispose();
    },
  };
}

const CATEGORY_MODEL_SOURCES = {
  handshake: {
    type: "fbx",
    url: new URL("assets/models/handshake/icon.fbx", import.meta.url).href,
    rotation: [-0.1, -0.18, 0.025],
    activeMaterialColors: {
    "color - red": 0x083b28,
      "color - blue": 0xb7c9b9,
    },
  },
  retroComputer: {
    type: "gltf",
    url: new URL("assets/models/prototyping/final-proto.glb", import.meta.url).href,
    // The frame needs its own fit because the square silhouette reads much
    // larger than the other station assets at the shared focus scale.
    targetSize: 1.08,
    // Elevated three-quarter view: top and side planes are visible while the
    // front opening remains the visual anchor.
    rotation: [-0.2, 0.58, -0.06],
    activeMaterialColors: {
      white: 0x083b28,
    },
  },
  talentAssessment: {
    type: "gltf",
    url: new URL(
      "assets/models/talent-assessment/user-3d-icon.glb",
      import.meta.url,
    ).href,
    // Add a restrained perspective turn so the card has visible depth while
    // its assessment controls remain easy to read.
    // Keep the three figures separated in a readable front three-quarter view.
    targetSize: 1.4,
    rotation: [0, 0, 0.025],
    // Focused user-group treatment: layered deep forest forms with natural
    // light falloff across the clustered spheres.
    activeMaterialColors: {
      none: 0x083b28,
      default: 0x083b28,
    },
  },
  robot: {
    type: "gltf",
    url: new URL(
      "assets/models/ai-agents/futuristic-flying-animated-robot.glb",
      import.meta.url,
    ).href,
    rotation: [-0.08, -0.2, -0.018],
    // Preserve the reference's pale mint shell, deep face/ear panels, and
    // brighter emerald interface details when the station is focused.
    activeMaterialColors: {
      white_glossy: 0xc8d8c8,
      blue_light: 0x1c855c,
      black_matt: 0x002010,
    },
  },
  marketing: {
    type: "gltf",
    url: new URL("assets/models/marketing/14811211-draco.glb", import.meta.url).href,
    // Hold a gentle three-quarter view so the horn, barrel, rear cap, and
    // handle all stay legible when the focused orbit model enlarges.
    rotation: [-0.1, Math.PI / 2 + 0.08, -0.04],
    // The megaphone source uses Indonesian material names. Map those parts
    // directly to the mint shell and layered forest greens in the reference.
    activeMaterialColors: {
      "biru matang": 0x06382a,
      putih: 0xc8d8c8,
      kuning: 0x0f7650,
      hitam: 0x032c20,
    },
  },
  documentManagement: {
    type: "gltf",
    url: new URL("assets/models/document-management/doc-mgmt.glb", import.meta.url).href,
    rotation: [-0.1, 0.18, -0.025],
    // Focused document tray treatment: deep forest housing and rear handle
    // plates, with warm cream trays, dividers, and handle faces.
    activeMaterialColors: {
      "biru terang": 0x0b2f23,
      "biru gelap": 0xe7e9df,
      "kuning gelap": 0x123b2d,
      "kuning terang": 0xe7e9df,
    },
  },
};

const categoryModelPromises = new Map();
let modelParseQueue = Promise.resolve();
// Keep geometry inside the WebGL frustum. CSS enlarges the complete transparent
// canvas for the remaining focus scale so wide models do not clip at its edges.
const CATEGORY_MODEL_FOCUS_SCALE = 1;
const CATEGORY_MODEL_RENDER_SIZE = 512;
const CATEGORY_MODEL_PIXEL_RATIO = 2.5;
// Orbiting models stay quiet and neutral. Focus introduces the product greens,
// ordered from broad surfaces to smaller trim so the active asset stays light.
// Category models stay quiet and neutral around the orbit; focused models
// still transition to their own active green palettes below.
const MODEL_IDLE_SWATCHES = [0xf1f2ef, 0xd4d7d3, 0xa7ada8, 0x6f7772];
const MODEL_ACTIVE_SWATCHES = [0xc8d8c8, 0x90b0a0, 0x1c855c, 0x084828];
const GEOMETRY_PREP_TOLERANCE = 1e-4;
const GEOMETRY_WORKER_URL = new URL("./orbit-geometry-worker.js", import.meta.url);
const GEOMETRY_ARRAY_TYPES = {
  Float32Array,
  Float64Array,
  Int8Array,
  Int16Array,
  Int32Array,
  Uint8Array,
  Uint8ClampedArray,
  Uint16Array,
  Uint32Array,
};
let geometryWorker = null;
let geometryWorkerTaskId = 0;
const geometryWorkerTasks = new Map();

function getGeometryWorker() {
  if (geometryWorker) return geometryWorker;
  if (typeof Worker !== "function") return null;

  try {
    geometryWorker = new Worker(GEOMETRY_WORKER_URL, { type: "module" });
    geometryWorker.addEventListener("message", (event) => {
      if (event.data?.type === "boot-error") {
        const error = new Error(event.data.error || "Orbit geometry worker failed to initialize");
        geometryWorkerTasks.forEach((task) => task.reject(error));
        geometryWorkerTasks.clear();
        geometryWorker?.terminate();
        geometryWorker = null;
        return;
      }
      const { id, geometry, error } = event.data;
      const task = geometryWorkerTasks.get(id);
      if (!task) return;
      geometryWorkerTasks.delete(id);
      if (error) task.reject(new Error(error));
      else task.resolve(geometry);
    });
    geometryWorker.addEventListener("error", (event) => {
      const error = event.error || new Error(event.message || "Orbit geometry worker failed");
      geometryWorkerTasks.forEach((task) => task.reject(error));
      geometryWorkerTasks.clear();
      geometryWorker?.terminate();
      geometryWorker = null;
    });
  } catch (error) {
    geometryWorker = null;
    return null;
  }
  return geometryWorker;
}

function serializeGeometryForWorker(geometry) {
  const transferables = [];

  function serializeAttribute(attribute) {
    if (!attribute || attribute.isInterleavedBufferAttribute) {
      throw new Error("Interleaved geometry attributes are not supported by the orbit worker");
    }
    const array = attribute.array;
    const buffer = array.buffer.slice(array.byteOffset, array.byteOffset + array.byteLength);
    transferables.push(buffer);
    return {
      buffer,
      arrayType: array.constructor.name,
      itemSize: attribute.itemSize,
      normalized: attribute.normalized,
    };
  }

  const attributes = Object.fromEntries(
    Object.entries(geometry.attributes).map(([name, attribute]) => [name, serializeAttribute(attribute)]),
  );
  const morphAttributes = Object.fromEntries(
    Object.entries(geometry.morphAttributes).map(([name, list]) => [
      name,
      list.map(serializeAttribute),
    ]),
  );
  const index = geometry.getIndex();

  return {
    payload: {
      attributes,
      morphAttributes,
      morphTargetsRelative: geometry.morphTargetsRelative,
      index: index ? serializeAttribute(index) : null,
      groups: geometry.groups.map((group) => ({ ...group })),
      drawRange: { ...geometry.drawRange },
    },
    transferables,
  };
}

function geometryFromWorkerPayload(payload) {
  const geometry = new THREE.BufferGeometry();

  function attributeFromPayload(attribute) {
    const ArrayType = GEOMETRY_ARRAY_TYPES[attribute.arrayType];
    if (!ArrayType) throw new Error(`Unsupported prepared geometry type: ${attribute.arrayType}`);
    return new THREE.BufferAttribute(
      new ArrayType(attribute.buffer),
      attribute.itemSize,
      attribute.normalized,
    );
  }

  Object.entries(payload.attributes).forEach(([name, attribute]) => {
    geometry.setAttribute(name, attributeFromPayload(attribute));
  });
  if (payload.index) geometry.setIndex(attributeFromPayload(payload.index));
  payload.groups.forEach((group) => geometry.addGroup(group.start, group.count, group.materialIndex));
  geometry.setDrawRange(payload.drawRange.start, payload.drawRange.count);
  Object.entries(payload.morphAttributes).forEach(([name, list]) => {
    geometry.morphAttributes[name] = list.map(attributeFromPayload);
  });
  geometry.morphTargetsRelative = Boolean(payload.morphTargetsRelative);
  return geometry;
}

function prepareGeometryInWorker(geometry) {
  const worker = getGeometryWorker();
  if (!worker) return Promise.resolve(null);

  let serialized;
  try {
    serialized = serializeGeometryForWorker(geometry);
  } catch (error) {
    return Promise.reject(error);
  }

  const id = ++geometryWorkerTaskId;
  return new Promise((resolve, reject) => {
    geometryWorkerTasks.set(id, {
      resolve: (payload) => resolve(geometryFromWorkerPayload(payload)),
      reject,
    });
    try {
      worker.postMessage({
        id,
        geometry: serialized.payload,
        tolerance: GEOMETRY_PREP_TOLERANCE,
      }, serialized.transferables);
    } catch (error) {
      geometryWorkerTasks.delete(id);
      reject(error);
    }
  });
}

function enqueueModelParse(task) {
  const run = modelParseQueue.then(() => new Promise((resolve, reject) => {
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
      Promise.resolve()
        .then(task)
        .then(resolve, reject);
    });
  }));
  modelParseQueue = run.catch(() => {});
  return run;
}

async function fetchModelBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load orbit model (${response.status}): ${url}`);
  return response.arrayBuffer();
}

function parseGltfBuffer(buffer, url) {
  return new Promise((resolve, reject) => {
    createGLTFLoader().parse(buffer, new URL(".", url).href, resolve, reject);
  });
}

function parseFbxBuffer(buffer, url) {
  return new FBXLoader().parse(buffer, new URL(".", url).href);
}

function loadCategoryModelSource(key) {
  if (categoryModelPromises.has(key)) return categoryModelPromises.get(key);
  const source = CATEGORY_MODEL_SOURCES[key];
  let promise;

  if (source.type === "fbx") {
    promise = Promise.all([
      fetchModelBuffer(source.url),
      source.animationUrl ? fetchModelBuffer(source.animationUrl) : Promise.resolve(null),
    ]).then(([modelBuffer, animationBuffer]) => enqueueModelParse(() => {
      const model = parseFbxBuffer(modelBuffer, source.url);
      const animation = animationBuffer
        ? parseFbxBuffer(animationBuffer, source.animationUrl)
        : null;
      return {
        scene: model,
        animations: animation?.animations?.length ? animation.animations : model.animations || [],
      };
    }));
  } else {
    promise = fetchModelBuffer(source.url)
      .then((buffer) => enqueueModelParse(() => parseGltfBuffer(buffer, source.url)))
      .then((gltf) => ({ scene: gltf.scene, animations: gltf.animations || [] }));
  }

  categoryModelPromises.set(key, promise);
  return promise;
}

function fitModel(object, targetSize = 1.75) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const largestSide = Math.max(size.x, size.y, size.z) || 1;
  const scale = targetSize / largestSide;

  object.scale.multiplyScalar(scale);
  object.position.addScaledVector(center, -scale);
  object.updateMatrixWorld(true);
}

function prepareOrbitModelGeometry(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return;

  // Imported assets often keep duplicated vertices across otherwise smooth
  // faces. Weld those copies before rebuilding normals for continuous shading.
  const smoothedGeometry = mergeVertices(geometry.clone(), GEOMETRY_PREP_TOLERANCE);
  smoothedGeometry.computeVertexNormals();
  smoothedGeometry.attributes.normal.needsUpdate = true;
  mesh.geometry = smoothedGeometry;
}

async function prepareOrbitModelGeometryAsync(mesh) {
  const geometry = mesh.geometry;
  if (!geometry?.attributes?.position) return;

  try {
    const prepared = await prepareGeometryInWorker(geometry);
    if (prepared) {
      prepared.attributes.normal.needsUpdate = true;
      mesh.geometry = prepared;
      return;
    }
  } catch (error) {
    // Keep the original synchronous path as a compatibility fallback for
    // browsers that cannot construct a module worker or for unusual geometry.
    console.warn("Orbit geometry worker unavailable; using the main-thread preparation path", error);
  }
  prepareOrbitModelGeometry(mesh);
}

async function applyOrbitModelMaterials(
  object,
  offset = 0,
  activeMaterialColors = null,
) {
  const materialMap = new Map();
  const materials = [];
  const geometryTasks = [];

  object.traverse((child) => {
    if (!child.isMesh) return;
    geometryTasks.push(prepareOrbitModelGeometryAsync(child));
    child.castShadow = true;
    child.receiveShadow = false;

    const sourceMaterials = Array.isArray(child.material) ? child.material : [child.material];
    const greenMaterials = sourceMaterials.map((sourceMaterial, sourceIndex) => {
      const cacheKey = sourceMaterial?.uuid || `${child.uuid}-${sourceIndex}`;
      if (materialMap.has(cacheKey)) return materialMap.get(cacheKey);

      const paletteIndex = (materials.length + offset) % MODEL_IDLE_SWATCHES.length;
      const materialName = sourceMaterial?.name || "";
      const normalizedMaterialName = materialName.toLowerCase();
      const hasGlow = /screen|display|emiss|part2|eye|signal/i.test(normalizedMaterialName);
      const isDarkSurface = /dark|gelap|black|shadow|body/i.test(normalizedMaterialName);
      const isAccentSurface = /accent|highlight|yellow|kuning|emerald|green/i.test(normalizedMaterialName);
      const isLightSurface = /light|terang|white|pale|ivory/i.test(normalizedMaterialName);
      const sourceMetalness = Number(sourceMaterial?.metalness ?? 0);
      const isChrome = !hasGlow && (
        sourceMetalness >= 0.25 ||
        /chrome|metal|steel|silver|hardware|rim|disc|frame|border|case/i.test(normalizedMaterialName)
      );
      const idleColor = new THREE.Color(MODEL_IDLE_SWATCHES[paletteIndex]);
      const configuredActiveColor = activeMaterialColors?.[normalizedMaterialName]
        ?? (isDarkSurface
          ? activeMaterialColors?.dark
          : isAccentSurface
            ? activeMaterialColors?.accent
            : isLightSurface
              ? activeMaterialColors?.light
              : activeMaterialColors?.default);
      const activeColor = configuredActiveColor
        ? new THREE.Color(configuredActiveColor)
        : isDarkSurface
        ? new THREE.Color(0x084828)
        : isAccentSurface
          ? new THREE.Color(0x1c855c)
          : isLightSurface
            ? new THREE.Color(0x90b0a0)
            : new THREE.Color(MODEL_ACTIVE_SWATCHES[paletteIndex]);
      const material = new THREE.MeshPhysicalMaterial({
        color: idleColor,
        roughness: hasGlow ? 0.28 : isChrome ? 0.2 : 0.74,
        metalness: hasGlow ? 0.08 : isChrome ? 0.58 : 0.04,
        clearcoat: hasGlow ? 0.42 : isChrome ? 0.9 : 0.16,
        clearcoatRoughness: hasGlow ? 0.12 : isChrome ? 0.08 : 0.34,
        specularIntensity: hasGlow ? 0.72 : isChrome ? 1 : 0.24,
        envMapIntensity: hasGlow ? 0.78 : isChrome ? 0.95 : 0.38,
        flatShading: false,
        transparent: false,
        opacity: 1,
        side: sourceMaterial?.side ?? THREE.FrontSide,
      });
      material.name = `xstation-orbit-${materialName || paletteIndex}`;
      material.emissive.copy(idleColor);
      material.emissiveIntensity = hasGlow ? 0.035 : isChrome ? 0.004 : 0.006;
      material.userData.idleColor = idleColor;
      material.userData.activeColor = activeColor;
      material.userData.idleEmissive = hasGlow ? 0.035 : 0.006;
      material.userData.activeEmissive = hasGlow ? 0.26 : 0.035;
      materialMap.set(cacheKey, material);
      materials.push(material);
      return material;
    });

    child.material = Array.isArray(child.material) ? greenMaterials : greenMaterials[0];
  });

  await Promise.all(geometryTasks);

  return materials;
}

async function buildCategoryModel(source, config) {
  const materials = [];

  if (!config.ensemble) {
    const model = cloneSkeleton(source.scene);
    materials.push(...await applyOrbitModelMaterials(model, 0, config.activeMaterialColors));
    fitModel(model, config.targetSize || 1.75);
    const orientedModel = new THREE.Group();
    orientedModel.rotation.set(...(config.rotation || [0, 0, 0]));
    orientedModel.add(model);
    return { model: orientedModel, materials };
  }

  const ensemble = new THREE.Group();
  for (const [index, x] of [-0.82, 0, 0.82].entries()) {
    const character = cloneSkeleton(source.scene);
    materials.push(...await applyOrbitModelMaterials(character));
    fitModel(character, 1.72);
    character.position.x = x;
    character.position.y = index === 1 ? 0.08 : -0.08;
    character.rotation.y = index === 1 ? 0 : index === 0 ? 0.22 : -0.22;
    character.scale.multiplyScalar(index === 1 ? 1 : 0.88);
    ensemble.add(character);
  }
  fitModel(ensemble, 1.75);
  const orientedModel = new THREE.Group();
  orientedModel.rotation.set(...(config.rotation || [0, 0, 0]));
  orientedModel.add(ensemble);
  return { model: orientedModel, materials };
}

function createCategoryModelView(host, reduce, modelKey, initiallyActive = true, sharedRenderer) {
  if (!sharedRenderer) return null;
  const config = CATEGORY_MODEL_SOURCES[modelKey];
  const canvas = document.createElement("canvas");
  canvas.className = "orbit-conversation-canvas orbit-category-model-canvas";
  canvas.setAttribute("aria-hidden", "true");
  host.classList.add("is-conversation", "is-category-model", "is-model-loading");
  host.appendChild(canvas);

  const outputSize = Math.round(CATEGORY_MODEL_RENDER_SIZE * sharedRenderer.pixelRatio);
  canvas.width = outputSize;
  canvas.height = outputSize;
  if (!canvas.getContext("2d", { alpha: true, desynchronized: true })) {
    canvas.remove();
    host.classList.remove("is-conversation", "is-category-model", "is-model-loading");
    return null;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 30);
  camera.position.set(0, 0.08, 6.2);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xf7f8f5, 0x002010, 1.55));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.65);
  keyLight.position.set(-3.2, 4.6, 5.2);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 0.1;
  keyLight.shadow.camera.far = 14;
  keyLight.shadow.camera.left = -4;
  keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 4;
  keyLight.shadow.camera.bottom = -4;
  keyLight.shadow.bias = -0.0002;
  keyLight.shadow.normalBias = 0.025;
  keyLight.shadow.radius = 4;
  scene.add(keyLight);
  scene.add(keyLight.target);
  const rimLight = new THREE.DirectionalLight(0x90b0a0, 0.85);
  rimLight.position.set(4, 1.4, 3.2);
  scene.add(rimLight);

  const shadowGeometry = new THREE.PlaneGeometry(7, 7);
  const shadowMaterial = new THREE.ShadowMaterial({
    color: 0x262626,
    opacity: 0.18,
    transparent: true,
    depthWrite: false,
  });
  const shadowReceiver = new THREE.Mesh(shadowGeometry, shadowMaterial);
  shadowReceiver.rotation.x = -Math.PI / 2;
  shadowReceiver.position.y = -0.82;
  shadowReceiver.receiveShadow = true;
  shadowReceiver.visible = host.classList.contains("is-focus");
  shadowReceiver.renderOrder = -1;
  scene.add(shadowReceiver);

  const stage = new THREE.Group();
  scene.add(stage);

  const TWO_PI = Math.PI * 2;
  const easeInOutCubic = (value) =>
    value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2;
  let model = null;
  let materials = [];
  let frame = 0;
  let disposed = false;
  let hovered = false;
  let focused = host.classList.contains("is-focus");
  let greenMix = focused ? 1 : 0;
  let floatMix = focused ? 1 : 0;
  const floatPhase = [...modelKey].reduce((sum, character) => sum + character.charCodeAt(0), 0) * 0.017;
  let rotation = 0;
  let scale = focused ? CATEGORY_MODEL_FOCUS_SCALE : 1;
  let lift = focused ? 0.1 : 0;
  let tilt = focused ? -0.025 : 0;
  let transition = null;
  let previousFrameTime = window.performance.now() * 0.001;
  let renderActive = Boolean(initiallyActive);
  let warmInProgress = false;
  let renderRequestedDuringWarm = false;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function scheduleRender() {
    if (reduce || !renderActive || frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      render();
    });
  }

  function startTransition(kind) {
    if (reduce) {
      rotation = 0;
      scale = focused ? CATEGORY_MODEL_FOCUS_SCALE : 1;
      lift = focused ? 0.1 : 0;
      tilt = focused ? -0.025 : 0;
      greenMix = focused ? 1 : 0;
      floatMix = focused ? 1 : 0;
      transition = null;
      return;
    }

    const targetScale = kind === "focus" ? CATEGORY_MODEL_FOCUS_SCALE : 1;
    let targetRotation = 0;
    if (kind === "exit") targetRotation = Math.round(rotation / TWO_PI) * TWO_PI;
    transition = {
      kind,
      startedAt: window.performance.now() * 0.001,
      duration: kind === "focus" ? 0.92 : kind === "exit" ? 0.72 : 1.15,
      fromRotation: rotation,
      targetRotation,
      fromScale: scale,
      targetScale,
      fromLift: lift,
      targetLift: kind === "focus" ? 0.1 : 0,
      fromTilt: tilt,
      targetTilt: kind === "focus" ? -0.025 : 0,
    };
  }

  function render(forceDraw = false) {
    if (disposed) return;
    if (!model) return;
    const now = window.performance.now() * 0.001;
    const delta = Math.min(Math.max(now - previousFrameTime, 0), 0.05);
    previousFrameTime = now;
    if (model && transition) {
      const progress = THREE.MathUtils.clamp((now - transition.startedAt) / transition.duration, 0, 1);
      const eased = easeInOutCubic(progress);
      if (transition.kind === "exit") {
        rotation = THREE.MathUtils.lerp(transition.fromRotation, transition.targetRotation, eased);
      }
      scale = THREE.MathUtils.lerp(transition.fromScale, transition.targetScale, eased);
      lift = THREE.MathUtils.lerp(transition.fromLift, transition.targetLift, eased);
      tilt = THREE.MathUtils.lerp(transition.fromTilt, transition.targetTilt, eased);
      if (progress >= 1) transition = null;
    }

    const floatTarget = focused ? 1 : 0;
    if (reduce) {
      floatMix = floatTarget;
    } else {
      const floatEase = 1 - Math.exp(-delta * (floatTarget > floatMix ? 4.8 : 7.2));
      floatMix = THREE.MathUtils.lerp(floatMix, floatTarget, floatEase);
      if (Math.abs(floatTarget - floatMix) < 0.001) floatMix = floatTarget;
    }

    // A restrained, phase-shifted float gives the focused model presence
    // without moving the orbit layout or making the asset feel weightless.
    const floatTime = now * 1.1 + floatPhase;
    const floatLift = Math.sin(floatTime) * 0.052 * floatMix;
    const floatPitch = Math.sin(floatTime * 0.72 + 0.8) * 0.018 * floatMix;
    const floatRoll = Math.cos(floatTime * 0.9) * 0.012 * floatMix;

    stage.rotation.y = rotation;
    stage.rotation.x = floatPitch;
    stage.rotation.z = tilt + floatRoll;
    stage.position.y = lift + floatLift;
    stage.scale.setScalar(scale);

    const colorTarget = focused ? 1 : 0;
    if (reduce) {
      greenMix = colorTarget;
    } else {
      const colorEase = 1 - Math.exp(-delta * (colorTarget > greenMix ? 5.2 : 7.5));
      greenMix = THREE.MathUtils.lerp(greenMix, colorTarget, colorEase);
      if (Math.abs(colorTarget - greenMix) < 0.001) greenMix = colorTarget;
    }
    materials.forEach((material) => {
      material.color.lerpColors(material.userData.idleColor, material.userData.activeColor, greenMix);
      material.emissive.copy(material.color);
      material.emissiveIntensity = THREE.MathUtils.lerp(
        material.userData.idleEmissive,
        material.userData.activeEmissive,
        greenMix,
      );
    });

    if (renderActive || forceDraw) sharedRenderer.render(scene, camera, canvas);
    scheduleRender();
  }

  async function warm() {
    if (!model || disposed) return;
    warmInProgress = true;
    renderRequestedDuringWarm = false;
    try {
      await sharedRenderer.compile(scene, camera);
    } catch (error) {
      // The explicit warm draw below remains the compatibility path when
      // parallel shader compilation is unavailable or rejected.
      console.debug(`Could not asynchronously compile ${modelKey} orbit shaders`, error);
    }
    const wasActive = renderActive;
    if (!wasActive) renderActive = true;
    render(true);
    warmInProgress = false;
    if (!wasActive && !renderRequestedDuringWarm && renderActive) {
      renderActive = false;
      if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    }
  }

  loadCategoryModelSource(modelKey)
    .then(async (source) => {
      if (disposed) {
        readyResolve({ status: "error", key: modelKey, reason: "disposed-before-load" });
        return;
      }
      const built = await buildCategoryModel(source, config);
      if (disposed) {
        built.model?.traverse((child) => {
          if (child.isMesh) child.geometry?.dispose();
        });
        built.materials?.forEach((material) => material.dispose());
        readyResolve({ status: "error", key: modelKey, reason: "disposed-during-build" });
        return;
      }
      model = built.model;
      materials = built.materials;
      stage.add(model);
      host.classList.remove("is-model-loading");
      host.classList.add("is-model-ready");
      if (focused) startTransition("focus");
      await warm();
      readyResolve({ status: "ready", key: modelKey });
    })
    .catch((error) => {
      console.warn(`Could not load ${modelKey} orbit model`, error);
      host.classList.remove("is-conversation", "is-category-model", "is-model-loading");
      host.classList.add("is-model-error");
      canvas.remove();
      readyResolve({ status: "error", key: modelKey, error });
    });

  if (renderActive && reduce) render();

  return {
    ready,
    canvas,
    setHovered(next) {
      hovered = Boolean(next);
      if (reduce) render();
    },
    setFocused(next) {
      const wasFocused = focused;
      focused = Boolean(next);
      shadowReceiver.visible = focused;
      if (model && focused !== wasFocused) startTransition(focused ? "focus" : "exit");
      if (reduce) render();
    },
    setRenderActive(next) {
      const active = Boolean(next);
      if (warmInProgress) renderRequestedDuringWarm = true;
      if (active === renderActive) return;
      renderActive = active;
      if (renderActive) {
        previousFrameTime = window.performance.now() * 0.001;
        render();
      } else if (frame) {
        window.cancelAnimationFrame(frame);
        frame = 0;
      }
    },
    dispose() {
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
      model?.traverse((child) => {
        if (child.isMesh) child.geometry?.dispose();
      });
      materials.forEach((material) => material.dispose());
      shadowGeometry.dispose();
      shadowMaterial.dispose();
      canvas.remove();
    },
  };
}

function noopController() {
  return {
    items: [],
    mode: "idle",
    ready: Promise.resolve({ status: "degraded", results: [], failures: [] }),
    setRenderActive() {},
    startIdle() {},
    playEnter() {},
    playWelcome() {},
    setMode() {},
    setProgress() {},
    setOrbitEntryProgress() {},
    getFocus() { return -1; },
    pause() {},
    resumeWhisper() {},
    layout() {},
    destroy() {},
  };
}

let deferredViewQueue = Promise.resolve();

function enqueueViewCreation(task) {
  const run = deferredViewQueue.then(() => new Promise((resolve) => {
    const schedule = typeof window.requestAnimationFrame === "function"
      ? window.requestAnimationFrame.bind(window)
      : (callback) => window.setTimeout(callback, 0);
    schedule(() => {
      try {
        task();
      } finally {
        resolve();
      }
    });
  }));
  deferredViewQueue = run.catch(() => {});
  return run;
}

function createCategoryModelViewSlot(host, reduce, modelKey, initiallyActive, sharedRenderer) {
  let view = null;
  let disposed = false;
  let hovered = false;
  let focused = host.classList.contains("is-focus");
  let renderActive = Boolean(initiallyActive);
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  enqueueViewCreation(() => {
    if (disposed) {
      readyResolve({ status: "error", key: modelKey, reason: "disposed-before-create" });
      return;
    }
    try {
      view = createCategoryModelView(host, reduce, modelKey, renderActive, sharedRenderer);
      if (!view) {
        readyResolve({ status: "error", key: modelKey, reason: "renderer-unavailable" });
        return;
      }
      view.setHovered(hovered);
      view.setFocused(focused);
      view.setRenderActive(renderActive);
      view.ready.then(readyResolve, (error) => {
        readyResolve({ status: "error", key: modelKey, error });
      });
    } catch (error) {
      readyResolve({ status: "error", key: modelKey, error });
    }
  });

  return {
    ready,
    get canvas() {
      return view?.canvas || null;
    },
    setHovered(next) {
      hovered = Boolean(next);
      view?.setHovered(hovered);
    },
    setFocused(next) {
      focused = Boolean(next);
      view?.setFocused(focused);
    },
    setRenderActive(next) {
      renderActive = Boolean(next);
      view?.setRenderActive(renderActive);
    },
    dispose() {
      disposed = true;
      view?.dispose();
    },
  };
}

function createOrbViewSlot(root, gsap, initiallyActive, sharedRenderer) {
  let view = null;
  let disposed = false;
  let renderActive = Boolean(initiallyActive);
  let lastLayout = null;
  let readyResolve;
  const ready = new Promise((resolve) => {
    readyResolve = resolve;
  });

  enqueueViewCreation(() => {
    if (disposed) {
      readyResolve({ status: "error", reason: "disposed-before-create" });
      return;
    }
    try {
      view = createOrbView(root, gsap, sharedRenderer);
      if (!view) {
        readyResolve({ status: "error", reason: "renderer-unavailable" });
        return;
      }
      view.setRenderActive(renderActive);
      if (lastLayout) view.layout(...lastLayout);
      Promise.resolve(view.warm?.()).then(
        () => readyResolve({ status: "ready" }),
        (error) => readyResolve({ status: "error", error }),
      );
    } catch (error) {
      readyResolve({ status: "error", error });
    }
  });

  return {
    ready,
    get canvas() {
      return view?.canvas || null;
    },
    layout(...args) {
      lastLayout = args;
      view?.layout(...args);
    },
    setRenderActive(next) {
      renderActive = Boolean(next);
      view?.setRenderActive(renderActive);
    },
    dispose() {
      disposed = true;
      view?.dispose();
    },
  };
}

export function createField({ root, gsap, reduce }) {
  if (!root || !gsap) return noopController();

  const sharedRenderer = createSharedOrbitRenderer();

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
svg.append(spokeGroup, ringCore, ringMid, ringOuter, alignLine);
  dock.appendChild(svg);

  const ringEls = {
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

  const initialRenderActive = reduce
    || !document.getElementById("welcome-bumper")
    || new URLSearchParams(window.location.search).has("shot");
  const conversationViews = nodes.map((node) => {
    node.el.setAttribute("aria-label", node.spec.label);
    return createCategoryModelViewSlot(
      node.el,
      reduce,
      node.spec.model,
      initialRenderActive,
      sharedRenderer,
    );
  });

  let hover = null;
  let orbitFrozen = false;
  let presentationVisible = true;
 let orbitEntryProgress = 1;
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
      orbView = createOrbViewSlot(root, gsap, initialRenderActive, sharedRenderer);
    } catch (err) {
      orbView = null;
    }
  }
  const fieldReady = Promise.all([
    ...conversationViews.map((view, index) => view?.ready || Promise.resolve({
      status: "error",
      key: STATION_NODES[index].model,
      error: new Error("Orbit model view could not be created"),
    })),
    ...(orbView?.ready ? [orbView.ready] : []),
  ]).then((results) => ({
    status: results.every((result) => result.status === "ready") ? "ready" : "degraded",
    results,
    failures: results.filter((result) => result.status !== "ready"),
  }));

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
const categoryAssetScales = STATION_NODES.map(() => ({ value: 1 }));
const categoryAssetScaleTargets = STATION_NODES.map(() => 1);
const categoryAssetScaleTweens = STATION_NODES.map(() => null);

function setCategoryAssetFocus(nextIndex) {
  nodes.forEach((node, index) => {
    const target = index === nextIndex ? ACTIVE_CATEGORY_ZOOM : 1;
    if (categoryAssetScaleTargets[index] === target) return;

    categoryAssetScaleTargets[index] = target;
    categoryAssetScaleTweens[index]?.kill();
    categoryAssetScaleTweens[index] = gsap.to(categoryAssetScales[index], {
      value: target,
      duration: target > categoryAssetScales[index].value ? 0.86 : 0.68,
      ease: target > categoryAssetScales[index].value ? "expo.out" : "power3.inOut",
      overwrite: true,
      onUpdate: renderFocusMotion,
      onComplete: () => {
        categoryAssetScaleTweens[index] = null;
        renderFocusMotion();
      },
    });
  });
}

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
    setCategoryAssetFocus(-1);
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
  ringMid.setAttribute("r", String(m.rMid));
    ringOuter.setAttribute("r", String(m.r));
  }

function ringRadius(name) {
  return name === "mid" ? m.rMid : m.r;
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
    nodes.forEach((node, index) => {
      node.el.classList.remove("is-hot");
      conversationViews[index]?.setHovered(false);
    });
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
      nodes.forEach((node, index) => {
        node.el.classList.add("is-hot");
        conversationViews[index]?.setHovered(true);
      });
      nodes.forEach((node) => node.spoke.classList.add("is-hot"));
      Object.keys(ringEls).forEach((key) => ringEls[key].classList.add("is-hot"));
      return;
    }
    hover.el.classList.add("is-hot");
    conversationViews[nodes.indexOf(hover)]?.setHovered(true);
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
      const baseDockScale = stationPose(m).scale;
      const categoryScale = (baseDockScale / Math.max(focusMotion.dockScale, 0.001))
        * categoryAssetScales[nodes.indexOf(node)].value;
      gsap.set(node.el, {
        x,
        y,
        scale: categoryScale,
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
    setCategoryAssetFocus(focused ? focusIndex : -1);

    if (focused) {
      const pose = stationPose(m);
    const focusedPose = focusedStationPose(m);
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
      const isActive = focused && index === focusIndex;
      node.el.classList.toggle("is-focus", isActive);
      conversationViews[index]?.setFocused(isActive);
    });
    Object.entries(ringEls).forEach(([name, ring]) => {
      ring.classList.toggle("is-focus", name === activeRing);
    });
    dock.classList.toggle("is-focus-mode", focused);
  }

  function layoutDock(t, gain, pose) {
    sizeRings();
    const entryGain = orbitEntryProgress;
    const visibleGain = presentationVisible ? gain * entryGain : 0;
    const entryPose = {
      x: pose.x,
      y: pose.y,
      scale: pose.scale * (0.84 + 0.16 * entryGain),
    };
    const dockProps = {
      transformOrigin: "0 0",
      rotationX: 0,
      rotation: -5 * (1 - entryGain),
      autoAlpha: visibleGain,
      force3D: true,
    };
    if (!(focusIndex >= 0 && focusStrength > 0) && !focusReturning) {
      dockProps.x = entryPose.x;
      dockProps.y = entryPose.y;
      dockProps.scale = entryPose.scale;
    }
    gsap.set(dock, dockProps);
    if (!orbitFrozen) gsap.set(svg, { autoAlpha: entryGain });

    const live = visibleGain > 0.55 && !orbitFrozen;
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
          scale: 1,
          autoAlpha: visibleGain,
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

    layoutOrbs(t, visibleGain, entryPose);
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

  function setOrbitEntryProgress(progress) {
    orbitEntryProgress = gsap.utils.clamp(0, 1, progress);

    if (mode === "pass") {
      layoutStation(passP);
    } else if (mode === "whisper") {
      layoutDock(state.t, 1, stationPose(m));
    }
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
    ready: fieldReady,
    setRenderActive(next) {
      conversationViews.forEach((view) => view?.setRenderActive?.(next));
      orbView?.setRenderActive?.(next);
      if (next) tickIdle();
    },
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
    setOrbitEntryProgress,
    freezeOrbit,
    unfreezeOrbit,
    hideProductsNode,
    showProductsNode,
    setCompanionsVisible,
    setPresentationVisible(on) {
      presentationVisible = Boolean(on);
      layoutDock(state.t, presentationVisible ? 1 : 0, stationPose(m));
    },
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
    categoryAssetScaleTweens.forEach((tween) => tween?.kill());
    if (orbView) orbView.dispose();
      conversationViews.forEach((view) => view?.dispose());
      sharedRenderer?.dispose();
      slabs.forEach((it) => {
        it.el.style.willChange = "auto";
      });
    },
  };

  return controller;
}
