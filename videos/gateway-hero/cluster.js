import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const PAPER = 0xf7f8f5;
const SIGNAL = 0x1c855c;
const FOREST = 0x083b28;
const PULSE = 0xb8ffd4;
const CORE = 0xeefff4;
const CHAPTERS = 5;
const BLOOM_LAYER = 1;

const MAIN_DIRS = [
  new THREE.Vector3(0.92, 0.34, 0.18),
  new THREE.Vector3(0.88, 0.06, 0.46),
  new THREE.Vector3(0.74, 0.62, 0.26),
  new THREE.Vector3(0.9, -0.38, 0.22),
  new THREE.Vector3(0.84, 0.28, -0.46),
].map((v) => v.normalize());

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function easeInOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2;
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function heartbeat(time, phase = 0) {
  const period = 2.35;
  const p = ((time + phase) % period) / period;
  const lub = Math.exp(-(((p - 0.22) / 0.16) ** 2));
  const dub = 0.38 * Math.exp(-(((p - 0.46) / 0.18) ** 2));
  const breath = 0.28 * (0.5 + 0.5 * Math.sin(((time + phase) / period) * Math.PI * 2));
  return Math.min(1, lub * 0.72 + dub + breath);
}

function basis(heading) {
  const dir = heading.clone().normalize();
  const up = Math.abs(dir.y) > 0.88 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(dir, up).normalize();
  const lift = new THREE.Vector3().crossVectors(side, dir).normalize();
  return { dir, side, lift };
}

function growCurve(origin, heading, length, rand) {
  const { dir, side, lift } = basis(heading);
  const amp = length * (0.16 + rand() * 0.12);
  const sign = rand() > 0.5 ? 1 : -1;
  const p0 = origin.clone();
  const p1 = origin.clone()
    .addScaledVector(dir, length * 0.3)
    .addScaledVector(side, sign * amp)
    .addScaledVector(lift, (rand() - 0.5) * amp * 0.45);
  const p2 = origin.clone()
    .addScaledVector(dir, length * 0.68)
    .addScaledVector(side, -sign * amp * 0.65)
    .addScaledVector(lift, (rand() - 0.42) * amp * 0.35);
  const p3 = origin.clone()
    .addScaledVector(dir, length)
    .addScaledVector(side, sign * amp * 0.12)
    .addScaledVector(lift, (rand() - 0.5) * amp * 0.18);

  return {
    curve: new THREE.CubicBezierCurve3(p0, p1, p2, p3),
    heading: p3.clone().sub(p2).normalize(),
  };
}

function taperedTube(curve, tubularSegments, radiusStart, radiusEnd, radialSegments) {
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const positions = new Float32Array((tubularSegments + 1) * radialSegments * 3);
  const normals = new Float32Array(positions.length);
  const indices = [];
  const point = new THREE.Vector3();

  for (let i = 0; i <= tubularSegments; i += 1) {
    const t = i / tubularSegments;
    const fall = t * t;
    const radius = radiusStart * (1 - fall) + radiusEnd * fall;
    curve.getPointAt(t, point);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j < radialSegments; j += 1) {
      const a = (j / radialSegments) * Math.PI * 2;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      const idx = (i * radialSegments + j) * 3;
      positions[idx] = point.x + radius * nx;
      positions[idx + 1] = point.y + radius * ny;
      positions[idx + 2] = point.z + radius * nz;
      normals[idx] = nx;
      normals[idx + 1] = ny;
      normals[idx + 2] = nz;
    }
  }

  for (let i = 0; i < tubularSegments; i += 1) {
    for (let j = 0; j < radialSegments; j += 1) {
      const a = i * radialSegments + j;
      const b = i * radialSegments + ((j + 1) % radialSegments);
      const c = (i + 1) * radialSegments + j;
      const d = (i + 1) * radialSegments + ((j + 1) % radialSegments);
      indices.push(a, b, c, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geo.setIndex(indices);
  return geo;
}

function radiusForGen(gen) {
  return [
    [0.019, 0.009],
    [0.009, 0.0042],
    [0.0042, 0.0018],
    [0.0018, 0.0007],
  ][gen] ?? [0.0012, 0.0005];
}

function makeRadialTexture(stops) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([t, color]) => gradient.addColorStop(t, color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function markBloom(obj) {
  obj.layers.enable(BLOOM_LAYER);
}

export function createCluster({ canvas } = {}) {
  const host = canvas || document.getElementById("nadi-cluster");
  if (!host) {
    return {
      setProgress() {},
      setActive() {},
      resize() {},
      dispose() {},
      ready: Promise.resolve(),
    };
  }

  const paperColor = new THREE.Color(PAPER);
  const blackColor = new THREE.Color(0x000000);
  const forestColor = new THREE.Color(FOREST);
  const signalColor = new THREE.Color(SIGNAL);
  const pulseColor = new THREE.Color(PULSE);
  const coreColor = new THREE.Color(CORE);

  const scene = new THREE.Scene();
  scene.background = paperColor.clone();
  scene.fog = new THREE.FogExp2(PAPER, 0.014);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.08, 80);
  camera.position.set(-1.85, 0.18, 6.9);

  const renderer = new THREE.WebGLRenderer({
    canvas: host,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(PAPER, 1);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const hemi = new THREE.HemisphereLight(0xf7f8f5, 0xc8d8c8, 0.9);
  scene.add(hemi);
  const keyLight = new THREE.DirectionalLight(0xffffff, 0.7);
  keyLight.position.set(-2.4, 1.8, 4.2);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0x90b0a0, 0.28);
  fillLight.position.set(3.2, -0.6, 1.4);
  scene.add(fillLight);
  const rimLight = new THREE.DirectionalLight(0xd9ffe8, 0.22);
  rimLight.position.set(1.2, 2.4, -3.2);
  scene.add(rimLight);

  const cluster = new THREE.Group();
  cluster.position.set(2.72, 0.06, 0.04);
  cluster.rotation.x = THREE.MathUtils.degToRad(11);
  cluster.rotation.z = THREE.MathUtils.degToRad(-8);
  scene.add(cluster);

  const mistTex = makeRadialTexture([
    [0, "rgba(200,216,200,0.42)"],
    [0.32, "rgba(144,176,160,0.18)"],
    [0.62, "rgba(247,248,245,0.08)"],
    [1, "rgba(247,248,245,0)"],
  ]);
  const mistMat = new THREE.SpriteMaterial({
    map: mistTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.85,
    toneMapped: false,
    fog: false,
  });
  const mist = new THREE.Sprite(mistMat);
  mist.scale.set(9.2, 9.2, 1);
  mist.position.set(0.15, 0.04, -1.7);
  cluster.add(mist);

  const groundTex = makeRadialTexture([
    [0, "rgba(200,216,200,0.28)"],
    [0.45, "rgba(232,239,232,0.12)"],
    [1, "rgba(247,248,245,0)"],
  ]);
  const groundMat = new THREE.MeshBasicMaterial({
    map: groundTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(8.2, 64), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0.35, -1.85, 0.15);
  cluster.add(ground);

  const glowTex = makeRadialTexture([
    [0, "rgba(238,255,244,1)"],
    [0.1, "rgba(140,255,196,0.95)"],
    [0.28, "rgba(28,133,92,0.55)"],
    [0.55, "rgba(8,59,40,0.16)"],
    [1, "rgba(8,59,40,0)"],
  ]);
  const glowSpriteMat = new THREE.SpriteMaterial({
    map: glowTex,
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 1,
    toneMapped: false,
    fog: false,
  });

  const hubLight = new THREE.PointLight(0x7dffc0, 2.4, 8, 2);
  cluster.add(hubLight);

  const hubMat = new THREE.MeshPhongMaterial({
    color: CORE,
    emissive: PULSE,
    emissiveIntensity: 1.35,
    specular: 0xffffff,
    shininess: 120,
    transparent: true,
    opacity: 1,
  });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.048, 20, 20), hubMat);
  markBloom(hub);
  cluster.add(hub);

  const hubGlow = new THREE.Sprite(glowSpriteMat.clone());
  hubGlow.scale.setScalar(1.05);
  markBloom(hubGlow);
  hub.add(hubGlow);
  const hubGlow2 = new THREE.Sprite(glowSpriteMat.clone());
  hubGlow2.material.opacity = 0.28;
  hubGlow2.scale.setScalar(1.8);
  hub.add(hubGlow2);

  const ringMat = new THREE.MeshBasicMaterial({
    color: PULSE,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const hubRing = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.184, 96), ringMat);
  hub.add(hubRing);
  const hubRing2 = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.318, 96), ringMat.clone());
  hubRing2.material.opacity = 0.2;
  hub.add(hubRing2);

  const branches = [];
  const satellites = [];
  const junctions = [];
  const accents = [];

  const junctionGeo = new THREE.SphereGeometry(1, 10, 10);
  const junctionMat = new THREE.MeshPhongMaterial({
    color: PULSE,
    emissive: SIGNAL,
    emissiveIntensity: 1.4,
    transparent: true,
    opacity: 0.8,
  });

  function addJunction(position, scale) {
    const mesh = new THREE.Mesh(junctionGeo, junctionMat);
    mesh.position.copy(position);
    mesh.scale.setScalar(scale);
    cluster.add(mesh);
    junctions.push(mesh);
  }

  function addQuietNode(position, scale, phase, bloom = false) {
    const node = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 12),
      new THREE.MeshPhongMaterial({
        color: CORE,
        emissive: PULSE,
        emissiveIntensity: 0.55,
        transparent: true,
        opacity: 0.58,
      }),
    );
    node.position.copy(position);
    node.scale.setScalar(scale);
    const sprite = new THREE.Sprite(glowSpriteMat.clone());
    sprite.scale.setScalar(0.42);
    sprite.material.opacity = 0.22;
    node.add(sprite);
    if (bloom) markBloom(node);
    cluster.add(node);
    accents.push({ mesh: node, sprite, phase, baseScale: scale });
  }

  function addBranch({
    origin,
    heading,
    length,
    generation,
    chapter,
    seed,
    decorative = false,
    maxGen = 3,
    opacityMul = 1,
  }) {
    const localRand = mulberry32(seed);
    const grown = growCurve(origin, heading, length, localRand);
    const [r0, r1] = radiusForGen(generation);
    const radial = generation === 0 ? 10 : 8;
    const tubular = generation === 0 ? 48 : generation === 1 ? 36 : 24;
    const geo = taperedTube(grown.curve, tubular, r0, r1, radial);
    const mat = new THREE.MeshPhongMaterial({
      color: signalColor.clone().lerp(pulseColor, 0.18),
      emissive: SIGNAL,
      emissiveIntensity: [1.15, 0.85, 0.5, 0.28][generation] ?? 0.18,
      specular: 0xd2ffe6,
      shininess: 90,
      transparent: true,
      opacity: ([0.38, 0.28, 0.18, 0.12][generation] ?? 0.08) * opacityMul,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    cluster.add(mesh);

    let halo = null;
    let haloMatInst = null;
    if (generation <= 1) {
      const haloGeo = taperedTube(grown.curve, tubular, r0 * 2.35, r1 * 2.8, 8);
      haloMatInst = new THREE.MeshBasicMaterial({
        color: PULSE,
        transparent: true,
        opacity: generation === 0 ? 0.12 : 0.06,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        fog: false,
      });
      halo = new THREE.Mesh(haloGeo, haloMatInst);
      cluster.add(halo);
    }

    const record = {
      curve: grown.curve,
      mesh,
      mat,
      halo,
      haloMat: haloMatInst,
      generation,
      chapter,
      ambient: decorative,
      opacityMul,
    };
    branches.push(record);

    if (generation === 0 && decorative) {
      addQuietNode(grown.curve.getPointAt(0.62), 0.85, seed * 0.0001);
    }

    if (generation === 0 && !decorative) {
      const nodeT = 0.7;
      const nodePos = grown.curve.getPointAt(nodeT);
      const nodeMat = new THREE.MeshPhongMaterial({
        color: CORE,
        emissive: PULSE,
        emissiveIntensity: 1.5,
        specular: 0xffffff,
        shininess: 140,
        transparent: true,
        opacity: 1,
      });
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.032, 18, 18), nodeMat);
      node.position.copy(nodePos);
      node.userData.base = nodePos.clone();
      node.userData.phase = chapter * 0.19;
      node.userData.azimuth = Math.atan2(MAIN_DIRS[chapter].x, MAIN_DIRS[chapter].z);
      node.userData.t = nodeT;
      markBloom(node);
      cluster.add(node);

      const sprite = new THREE.Sprite(glowSpriteMat.clone());
      sprite.scale.setScalar(0.72);
      node.add(sprite);

      const haloRingMat = new THREE.MeshBasicMaterial({
        color: PULSE,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const haloRing = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.118, 72), haloRingMat);
      node.add(haloRing);
      const haloRing2 = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.184, 72), haloRingMat.clone());
      node.add(haloRing2);

      const nodeLight = new THREE.PointLight(0x9effd0, 0.85, 2.8, 2);
      node.add(nodeLight);

      satellites.push({
        mesh: node,
        sprite,
        halo: haloRing,
        halo2: haloRing2,
        light: nodeLight,
        branch: record,
      });
    }

    if (generation <= 2) {
      addJunction(grown.curve.getPointAt(0.02), r0 * 0.95);
    }

    if (generation >= maxGen) return;

    const childCount = decorative
      ? (generation === 0 ? 3 : 1)
      : generation === 0 ? 3 : generation === 1 ? 2 : 1;
    const tangentTmp = new THREE.Vector3();
    const binormal = new THREE.Vector3();
    const worldUp = new THREE.Vector3(0, 1, 0);

    for (let c = 0; c < childCount; c += 1) {
      const t = generation === 0
        ? [0.32, 0.56, 0.78][c] + (localRand() - 0.5) * 0.03
        : 0.5 + (localRand() - 0.5) * 0.08;
      const fork = grown.curve.getPointAt(t);
      grown.curve.getTangentAt(t, tangentTmp);
      binormal.crossVectors(tangentTmp, worldUp);
      if (binormal.lengthSq() < 0.0001) binormal.set(1, 0, 0);
      binormal.normalize();
      const lift = new THREE.Vector3().crossVectors(binormal, tangentTmp).normalize();
      const axis = binormal.clone().lerp(lift, 0.28 + localRand() * 0.22).normalize();
      const angle = (c % 2 === 0 ? 1 : -1) * (0.34 + localRand() * 0.12);
      const childHeading = tangentTmp.clone().applyAxisAngle(axis, angle);
      childHeading.addScaledVector(heading, 0.82).normalize();
      addJunction(fork, r0 * 0.7);
      addBranch({
        origin: fork,
        heading: childHeading,
        length: length * (generation === 0 ? 0.5 : generation === 1 ? 0.42 : 0.32) + localRand() * 0.06,
        generation: generation + 1,
        chapter,
        seed: seed * 17 + c * 131 + generation * 19,
        decorative,
        maxGen,
        opacityMul,
      });
    }
  }

  MAIN_DIRS.forEach((dir, i) => {
    addBranch({
      origin: dir.clone().multiplyScalar(0.045),
      heading: dir,
      length: 4.15 + (i % 3) * 0.22,
      generation: 0,
      chapter: i,
      seed: 0x51ed + i * 7919,
    });
  });

  [
    {
      origin: new THREE.Vector3(0.42, 1.58, -0.28),
      dirs: [
        new THREE.Vector3(0.18, 0.96, 0.12),
        new THREE.Vector3(0.62, 0.68, -0.28),
        new THREE.Vector3(-0.28, 0.9, 0.26),
        new THREE.Vector3(0.48, 0.58, 0.46),
      ],
      length: 1.72,
      seed: 0xa101,
    },
    {
      origin: new THREE.Vector3(0.58, -1.62, 0.22),
      dirs: [
        new THREE.Vector3(0.28, -0.94, 0.14),
        new THREE.Vector3(0.72, -0.58, -0.26),
        new THREE.Vector3(-0.22, -0.9, 0.3),
        new THREE.Vector3(0.52, -0.66, 0.4),
      ],
      length: 1.78,
      seed: 0xa202,
    },
    {
      origin: new THREE.Vector3(-1.28, -1.42, 0.26),
      dirs: [
        new THREE.Vector3(-0.58, -0.76, 0.18),
        new THREE.Vector3(-0.88, -0.28, -0.22),
        new THREE.Vector3(-0.26, -0.9, 0.28),
        new THREE.Vector3(-0.7, -0.48, 0.4),
      ],
      length: 1.58,
      seed: 0xa303,
    },
    {
      origin: new THREE.Vector3(-1.62, 0.38, -0.32),
      dirs: [
        new THREE.Vector3(-0.92, 0.2, 0.18),
        new THREE.Vector3(-0.66, 0.68, -0.24),
        new THREE.Vector3(-0.74, -0.4, 0.3),
        new THREE.Vector3(-0.82, 0.06, -0.42),
      ],
      length: 1.52,
      seed: 0xa404,
    },
    {
      origin: new THREE.Vector3(-1.48, 1.08, -0.18),
      dirs: [
        new THREE.Vector3(-0.78, 0.58, 0.16),
        new THREE.Vector3(-0.52, 0.82, -0.22),
        new THREE.Vector3(-0.88, 0.12, 0.28),
      ],
      length: 1.38,
      seed: 0xa505,
    },
  ].forEach((pack, p) => {
    const stem = pack.origin.clone().normalize();
    addBranch({
      origin: stem.clone().multiplyScalar(0.05),
      heading: stem,
      length: pack.origin.length() - 0.08,
      generation: 0,
      chapter: -1,
      seed: pack.seed,
      decorative: true,
      maxGen: 0,
      opacityMul: 0.7,
    });
    addQuietNode(pack.origin, 1.2, p * 0.37, true);
    pack.dirs.forEach((raw, i) => {
      const heading = raw.clone().normalize();
      addBranch({
        origin: pack.origin.clone().addScaledVector(heading, 0.05),
        heading,
        length: pack.length + i * 0.1,
        generation: 0,
        chapter: -1,
        seed: pack.seed + i * 97,
        decorative: true,
        maxGen: 2,
        opacityMul: 0.74,
      });
    });
  });

  const pulsePaths = branches.filter((b) => b.generation <= 1);
  const pulsesPerPath = 3;
  const trail = 3;
  const pulseCount = pulsePaths.length * pulsesPerPath * trail;
  const pulseGeo = new THREE.SphereGeometry(0.012, 10, 10);
  const pulseMat = new THREE.MeshBasicMaterial({
    color: CORE,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const pulses = new THREE.InstancedMesh(pulseGeo, pulseMat, pulseCount);
  pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  markBloom(pulses);
  cluster.add(pulses);

  const pulseGlowGeo = new THREE.SphereGeometry(0.028, 8, 8);
  const pulseGlowMat = new THREE.MeshBasicMaterial({
    color: SIGNAL,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    fog: false,
  });
  const pulseGlows = new THREE.InstancedMesh(pulseGlowGeo, pulseGlowMat, pulseCount);
  pulseGlows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cluster.add(pulseGlows);

  const dummy = new THREE.Object3D();
  const pulseMeta = [];
  pulsePaths.forEach((path, pathIndex) => {
    for (let i = 0; i < pulsesPerPath; i += 1) {
      for (let k = 0; k < trail; k += 1) {
        pulseMeta.push({
          pathIndex,
          chapter: path.chapter,
          offset: i / pulsesPerPath + pathIndex * 0.017,
          trail: k,
          speed: 0.055 + (i % 5) * 0.008,
        });
      }
    }
  });

  const riders = branches.filter((b) => b.generation === 0).map((path, i) => {
    const light = new THREE.PointLight(0xa8ffd8, 0, 2.8, 2);
    cluster.add(light);
    return { light, path, offset: i * 0.18 };
  });

  const bloomLayer = new THREE.Layers();
  bloomLayer.set(BLOOM_LAYER);
  const bloomHidden = [];
  const bloomBackground = blackColor.clone();

  const renderScene = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.48, 0.28, 0.42);
  const bloomComposer = new EffectComposer(renderer);
  bloomComposer.renderToScreen = false;
  bloomComposer.addPass(renderScene);
  bloomComposer.addPass(bloomPass);

  const mixPass = new ShaderPass(
    new THREE.ShaderMaterial({
      uniforms: {
        baseTexture: { value: null },
        bloomTexture: { value: bloomComposer.renderTarget2.texture },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D baseTexture;
        uniform sampler2D bloomTexture;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(baseTexture, vUv);
          vec4 bloom = texture2D(bloomTexture, vUv);
          gl_FragColor = vec4(base.rgb + bloom.rgb * 0.7, 1.0);
        }
      `,
    }),
    "baseTexture",
  );
  mixPass.needsSwap = true;

  const finalComposer = new EffectComposer(renderer);
  finalComposer.addPass(new RenderPass(scene, camera));
  finalComposer.addPass(mixPass);

  const clock = new THREE.Clock();
  const look = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const fromPos = new THREE.Vector3();
  const toPos = new THREE.Vector3();
  const fromLook = new THREE.Vector3();
  const toLook = new THREE.Vector3();
  const pulled = new THREE.Vector3();
  const axonPoint = new THREE.Vector3();
  const worldHub = new THREE.Vector3();
  const worldSat = new THREE.Vector3();

  let progress = 0;
  let active = true;
  let raf = 0;
  let disposed = false;
  let smoothBeat = 0;
  const smoothNode = satellites.map(() => 0);
  const smoothNodeWeight = satellites.map(() => 0.35);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function size() {
    const width = host.clientWidth || window.innerWidth;
    const height = host.clientHeight || window.innerHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    bloomComposer.setSize(width, height);
    finalComposer.setSize(width, height);
    bloomPass.setSize(width, height);
    mixPass.material.uniforms.bloomTexture.value = bloomComposer.renderTarget2.texture;
  }

  function restPose() {
    camPos.set(-1.85, 0.18, 6.9);
    look.set(2.55, 0.08, 0.02);
  }

  function closePose(index) {
    const sat = satellites[index];
    sat.mesh.getWorldPosition(worldSat);
    look.set(worldSat.x - 0.22, worldSat.y + 0.04, worldSat.z * 0.15);
    camPos.set(worldSat.x - 0.95, worldSat.y + 0.2, worldSat.z + 1.72);
  }

  function applyCamera(elapsed) {
    const idleYaw = reduce ? 0 : Math.sin(elapsed * 0.06) * 0.02;
    const travel = progress * CHAPTERS;
    const index = Math.min(CHAPTERS - 1, Math.floor(travel));
    const local = reduce ? 1 : easeInOut(Math.min(1, travel - index));
    let yaw = 0;

    if (progress <= 0) {
      yaw = 0;
    } else if (index === 0) {
      yaw = THREE.MathUtils.lerp(0, -satellites[0].mesh.userData.azimuth * 0.12, local);
    } else {
      yaw = THREE.MathUtils.lerp(
        -satellites[index - 1].mesh.userData.azimuth * 0.12,
        -satellites[index].mesh.userData.azimuth * 0.12,
        local,
      );
    }

    cluster.rotation.y = yaw + idleYaw;
    cluster.updateMatrixWorld(true);
    hub.getWorldPosition(worldHub);

    if (progress <= 0 || (reduce && progress < 0.02)) {
      restPose();
    } else if (reduce) {
      closePose(index);
    } else if (index === 0) {
      restPose();
      fromPos.copy(camPos);
      fromLook.copy(look);
      closePose(0);
      toPos.copy(camPos);
      toLook.copy(look);
      camPos.copy(fromPos).lerp(toPos, local);
      look.copy(fromLook).lerp(toLook, local);
    } else {
      closePose(index - 1);
      fromPos.copy(camPos);
      fromLook.copy(look);
      closePose(index);
      toPos.copy(camPos);
      toLook.copy(look);
      pulled.copy(fromPos).lerp(toPos, 0.5);
      pulled.y += 0.12;
      if (local < 0.5) {
        const t = local * 2;
        camPos.copy(fromPos).lerp(pulled, t);
        look.copy(fromLook).lerp(toLook, t * 0.45);
      } else {
        const t = (local - 0.5) * 2;
        camPos.copy(pulled).lerp(toPos, t);
        look.copy(fromLook).lerp(toLook, 0.45 + t * 0.55);
      }
    }

    camera.position.copy(camPos);
    camera.lookAt(look);
    mist.lookAt(camera.position);
    hubRing.lookAt(camera.position);
    hubRing2.lookAt(camera.position);
    satellites.forEach((sat) => {
      sat.halo.lookAt(camera.position);
      sat.halo2.lookAt(camera.position);
    });
  }

  function applyEnergy(elapsed) {
    smoothBeat += (heartbeat(elapsed) - smoothBeat) * 0.065;
    const beat = smoothBeat;
    const restWeight = clamp01(1 - progress * 3.4);
    mist.material.opacity = 0.55 + restWeight * 0.3;
    mist.scale.setScalar(8.4 + restWeight * 0.9 + beat * 0.05);
    ground.material.opacity = 0.45 + restWeight * 0.25;

    hubMat.emissiveIntensity = 1.05 + beat * 0.55;
    hubGlow.scale.setScalar(1.02 + beat * 0.18);
    hubGlow.material.opacity = 0.48 + beat * 0.16;
    hubGlow2.scale.setScalar(1.62 + beat * 0.28);
    hubGlow2.material.opacity = 0.14 + beat * 0.1;
    hubLight.intensity = 1.5 + beat * 0.85 + restWeight * 0.35;
    hubLight.color.copy(signalColor).lerp(pulseColor, 0.22 + beat * 0.18);
    hub.scale.setScalar(1 + beat * 0.06);
    ringMat.opacity = 0.12 + beat * 0.12 + restWeight * 0.05;
    hubRing.scale.setScalar(1 + beat * 0.12);
    hubRing2.material.opacity = 0.05 + beat * 0.07;
    hubRing2.scale.setScalar(1 + beat * 0.16);

    const chapter = progress * CHAPTERS;
    const activeIndex = Math.min(CHAPTERS - 1, Math.floor(chapter));
    satellites.forEach((sat, i) => {
      const targetWeight = progress <= 0.02 ? 0.35 : (i === activeIndex ? 1 : 0.06);
      smoothNodeWeight[i] += (targetWeight - smoothNodeWeight[i]) * 0.075;
      const weight = smoothNodeWeight[i];
      smoothNode[i] += (heartbeat(elapsed, sat.mesh.userData.phase) - smoothNode[i]) * 0.06;
      const nodeBeat = smoothNode[i] * weight;
      sat.mesh.material.opacity = 0.16 + weight * 0.84;
      sat.mesh.material.emissiveIntensity = 0.12 + weight * 1.35 + nodeBeat * 0.4;
      sat.sprite.material.opacity = 0.04 + weight * 0.52 + nodeBeat * 0.12;
      sat.sprite.scale.setScalar(0.28 + weight * 0.42 + nodeBeat * 0.14);
      sat.halo.scale.setScalar(1 + nodeBeat * 0.22);
      sat.halo.material.opacity = weight * (0.08 + nodeBeat * 0.22);
      sat.halo2.scale.setScalar(1 + nodeBeat * 0.3);
      sat.halo2.material.opacity = weight * (0.03 + nodeBeat * 0.12);
      sat.light.intensity = 0.04 + weight * 1.05 + nodeBeat * 0.4;
      sat.light.color.copy(signalColor).lerp(coreColor, 0.12 + nodeBeat * 0.22);
      const bob = reduce ? 0 : Math.sin(elapsed * 0.42 + sat.mesh.userData.phase) * 0.006 * weight;
      sat.mesh.position.copy(sat.mesh.userData.base);
      sat.mesh.position.y += bob;
      sat.mesh.scale.setScalar(0.72 + weight * 0.36 + nodeBeat * 0.08);
    });

    branches.forEach((branch) => {
      const weight = branch.ambient
        ? 0.72
        : progress <= 0.02 ? 1 : branch.chapter === activeIndex ? 1 : 0.28;
      const mul = branch.opacityMul ?? 1;
      const base = ([0.38, 0.28, 0.18, 0.12][branch.generation] ?? 0.08) * mul;
      const emit = [0.7, 0.5, 0.32, 0.18][branch.generation] ?? 0.12;
      branch.mat.opacity = base * (0.7 + weight * 0.3);
      branch.mat.emissiveIntensity = emit * (0.55 + weight * 0.35 + beat * 0.1);
      branch.mat.color.copy(signalColor).lerp(pulseColor, 0.1 + weight * 0.22 + beat * 0.05);
      branch.mat.emissive.copy(forestColor).lerp(signalColor, 0.5 + weight * 0.35);
      if (branch.haloMat) {
        branch.haloMat.opacity = (branch.generation === 0 ? 0.1 : 0.05) * weight * mul * (0.7 + beat * 0.18);
        branch.haloMat.color.copy(signalColor).lerp(pulseColor, 0.32 + beat * 0.14);
      }
    });

    accents.forEach((accent) => {
      const pulse = heartbeat(elapsed, accent.phase);
      accent.mesh.material.emissiveIntensity = 0.42 + pulse * 0.28;
      accent.mesh.material.opacity = 0.42 + pulse * 0.16;
      accent.mesh.scale.setScalar(accent.baseScale * (0.92 + pulse * 0.1));
      accent.sprite.material.opacity = 0.14 + pulse * 0.12;
    });
  }

  function applyPulses(elapsed) {
    const chapter = progress * CHAPTERS;
    const activeIndex = Math.min(CHAPTERS - 1, Math.floor(chapter));
    const beat = smoothBeat;
    pulseMat.color.copy(coreColor).lerp(pulseColor, 0.14 + beat * 0.18);
    pulseGlowMat.color.copy(signalColor).lerp(pulseColor, 0.22 + beat * 0.18);
    pulseMat.opacity = 0.62 + beat * 0.16;
    pulseGlowMat.opacity = 0.24 + beat * 0.16;

    for (let i = 0; i < pulseCount; i += 1) {
      const meta = pulseMeta[i];
      const path = pulsePaths[meta.pathIndex];
      const live = progress <= 0.02 ? 1 : meta.chapter === activeIndex ? 1 : 0.14;
      const speed = (reduce ? 0 : meta.speed) * (0.85 + live * 0.2);
      const t = (elapsed * speed + meta.offset - meta.trail * 0.038 + 1) % 1;
      path.curve.getPointAt(t, axonPoint);
      const head = meta.trail === 0;
      const envelope = Math.pow(Math.sin(t * Math.PI), 1.35);
      const trailFade = head ? 1 : 0.62 ** meta.trail;
      const swell = 0.82 + beat * 0.18;
      const scale = (0.42 + envelope * 0.48) * swell * live * trailFade * (head ? 1.08 : 0.62);
      dummy.position.copy(axonPoint);
      dummy.scale.setScalar(Math.max(0.04, scale));
      dummy.updateMatrix();
      pulses.setMatrixAt(i, dummy.matrix);
      dummy.scale.setScalar(Math.max(0.04, scale * (head ? 1.7 : 1.15)));
      dummy.updateMatrix();
      pulseGlows.setMatrixAt(i, dummy.matrix);
    }
    pulses.instanceMatrix.needsUpdate = true;
    pulseGlows.instanceMatrix.needsUpdate = true;

    riders.forEach((rider, i) => {
      const live = progress <= 0.02 ? 1 : rider.path.chapter === activeIndex ? 1 : 0.12;
      const t = reduce ? 0.55 : (elapsed * 0.07 + rider.offset) % 1;
      rider.path.curve.getPointAt(t, axonPoint);
      rider.light.position.copy(axonPoint);
      rider.light.intensity = (0.4 + heartbeat(elapsed, i * 0.22) * 0.7) * live;
    });
  }

  function hideNonBloom(obj) {
    if (obj.isScene || obj.isCamera || obj.isLight) return;
    if (obj.layers.test(bloomLayer)) return;
    if ((obj.isMesh || obj.isSprite) && obj.visible) {
      obj.visible = false;
      bloomHidden.push(obj);
    }
  }

  function showNonBloom() {
    for (let i = 0; i < bloomHidden.length; i += 1) bloomHidden[i].visible = true;
    bloomHidden.length = 0;
  }

  function renderFrame() {
    scene.background.copy(bloomBackground);
    scene.fog.color.copy(bloomBackground);
    scene.traverse(hideNonBloom);
    bloomComposer.render();
    showNonBloom();
    scene.background.copy(paperColor);
    scene.fog.color.copy(paperColor);
    finalComposer.render();
  }

  function frame() {
    if (disposed) return;
    if (!active) {
      raf = requestAnimationFrame(frame);
      return;
    }
    const elapsed = clock.getElapsedTime();
    cluster.updateMatrixWorld(true);
    applyEnergy(elapsed);
    applyPulses(elapsed);
    applyCamera(elapsed);
    renderFrame();
    raf = requestAnimationFrame(frame);
  }

  function onResize() {
    size();
  }

  function onVisibility() {
    if (document.hidden) clock.getDelta();
  }

  size();
  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibility);
  raf = requestAnimationFrame(frame);

  return {
    setProgress(next) {
      progress = clamp01(Number(next) || 0);
    },
    setActive(next) {
      active = Boolean(next);
      if (active) clock.getDelta();
    },
    resize: size,
    dispose() {
      disposed = true;
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      bloomComposer.dispose();
      finalComposer.dispose();
      renderer.dispose();
      mistTex.dispose();
      mistMat.dispose();
      groundTex.dispose();
      ground.geometry.dispose();
      groundMat.dispose();
      glowTex.dispose();
      hub.geometry.dispose();
      hubMat.dispose();
      glowSpriteMat.dispose();
      hubGlow.material.dispose();
      hubGlow2.material.dispose();
      hubRing.geometry.dispose();
      ringMat.dispose();
      hubRing2.geometry.dispose();
      hubRing2.material.dispose();
      pulseGeo.dispose();
      pulseMat.dispose();
      pulseGlowGeo.dispose();
      pulseGlowMat.dispose();
      junctionGeo.dispose();
      junctionMat.dispose();
      mixPass.material.dispose();
      branches.forEach((branch) => {
        branch.mesh.geometry.dispose();
        branch.mat.dispose();
        if (branch.halo) {
          branch.halo.geometry.dispose();
          branch.haloMat.dispose();
        }
      });
      satellites.forEach((sat) => {
        sat.mesh.geometry.dispose();
        sat.mesh.material.dispose();
        sat.sprite.material.dispose();
        sat.halo.geometry.dispose();
        sat.halo.material.dispose();
        sat.halo2.geometry.dispose();
        sat.halo2.material.dispose();
      });
      accents.forEach((accent) => {
        accent.mesh.geometry.dispose();
        accent.mesh.material.dispose();
        accent.sprite.material.dispose();
      });
    },
    ready: Promise.resolve(),
  };
}
