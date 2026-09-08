import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

const QR_TEXTURE_URL = "videos/gateway-hero/media/mail-texture.png";
const BASE_ROTATION = {
  x: THREE.MathUtils.degToRad(-3),
  y: THREE.MathUtils.degToRad(4),
  z: THREE.MathUtils.degToRad(-0.75),
};
const TILT_LIMIT = THREE.MathUtils.degToRad(3.5);

export function createQrSlab({ root, gsap, ScrollTrigger, reduce = false, entryDelay = 0 } = {}) {
  if (!root) return () => {};

  const canvas = root.querySelector(".qr-slab-canvas");
  if (!canvas) return () => {};

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    return () => {};
  }

  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 20);
  camera.position.set(0, 0, 7.45);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const environmentScene = new RoomEnvironment();
  const environment = pmrem.fromScene(environmentScene, 0.04).texture;
  scene.environment = environment;
  environmentScene.dispose();
  pmrem.dispose();

  const group = new THREE.Group();
  group.rotation.set(BASE_ROTATION.x, BASE_ROTATION.y, BASE_ROTATION.z);
  scene.add(group);

  const slabGeometry = new RoundedBoxGeometry(3.58, 3.58, 0.3, 8, 0.17);
  const slabMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xb7d9c4,
    metalness: 0,
    roughness: 0.1,
    transmission: 0.9,
    thickness: 0.72,
    ior: 1.46,
    attenuationColor: new THREE.Color(0x76aa85),
    attenuationDistance: 2.2,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.15,
  });
  const slab = new THREE.Mesh(slabGeometry, slabMaterial);
  group.add(slab);

  const edgeGeometry = new THREE.EdgesGeometry(slabGeometry, 24);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xeaf7ed,
    transparent: true,
    opacity: 0.5,
  });
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
  edges.renderOrder = 3;
  group.add(edges);

  const faceGeometry = new THREE.PlaneGeometry(3.08, 3.08);
  const faceMaterial = new THREE.MeshBasicMaterial({ color: 0xf8faf6 });
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.z = 0.17;
  face.renderOrder = 1;
  group.add(face);

  const qrGeometry = new THREE.PlaneGeometry(3.08, 3.08);
  const qrMaterial = new THREE.MeshBasicMaterial({
    transparent: true,
    alphaTest: 0.02,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const qrFace = new THREE.Mesh(qrGeometry, qrMaterial);
  qrFace.position.z = 0.184;
  qrFace.renderOrder = 4;
  group.add(qrFace);

  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(-3.2, 4.2, 5);
  scene.add(key);

  const rim = new THREE.PointLight(0x70b782, 14, 9, 2);
  rim.position.set(3.4, -2.5, 2.8);
  scene.add(rim);

  const fill = new THREE.HemisphereLight(0xf7fff9, 0x244f43, 1.4);
  scene.add(fill);

  const render = () => renderer.render(scene, camera);
  const resize = () => {
    const bounds = root.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * 1.14));
    const height = Math.max(1, Math.round(bounds.height * 1.14));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(root);
  resize();

  let entryTimeline;
  const reveal = () => {
    root.classList.add("is-three-ready");
    render();

    if (!gsap || reduce) return;
    const timelineConfig = ScrollTrigger
      ? { scrollTrigger: { trigger: root, start: "top 88%", once: true } }
      : {};

    entryTimeline = gsap.timeline({ ...timelineConfig, delay: entryDelay });
    entryTimeline
      .fromTo(
        root,
        { autoAlpha: 0, y: 20, scale: 0.96 },
        { autoAlpha: 1, y: 0, scale: 1, duration: 0.95, ease: "expo.out" },
        0
      )
      .fromTo(
        group.rotation,
        {
          x: THREE.MathUtils.degToRad(7),
          y: THREE.MathUtils.degToRad(-12),
          z: THREE.MathUtils.degToRad(-2.5),
        },
        {
          x: BASE_ROTATION.x,
          y: BASE_ROTATION.y,
          z: BASE_ROTATION.z,
          duration: 1.15,
          ease: "expo.out",
          onUpdate: render,
        },
        0.02
      );
  };

  const textureLoader = new THREE.TextureLoader();
  let qrTexture;
  textureLoader.load(
    QR_TEXTURE_URL,
    (texture) => {
      qrTexture = texture;
      qrTexture.colorSpace = THREE.SRGBColorSpace;
      qrTexture.generateMipmaps = false;
      qrTexture.minFilter = THREE.LinearFilter;
      qrTexture.magFilter = THREE.LinearFilter;
      qrTexture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
      qrMaterial.map = qrTexture;
      qrMaterial.needsUpdate = true;
      reveal();
      requestAnimationFrame(() => {
        render();
        requestAnimationFrame(render);
      });
    },
    undefined,
    () => render()
  );

  const cleanupFns = [];
  if (gsap && !reduce && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
    const rotateXTo = gsap.quickTo(group.rotation, "x", {
      duration: 0.7,
      ease: "power3.out",
      onUpdate: render,
    });
    const rotateYTo = gsap.quickTo(group.rotation, "y", {
      duration: 0.7,
      ease: "power3.out",
      onUpdate: render,
    });
    const rimXTo = gsap.quickTo(rim.position, "x", {
      duration: 0.85,
      ease: "power3.out",
      onUpdate: render,
    });
    const rimYTo = gsap.quickTo(rim.position, "y", {
      duration: 0.85,
      ease: "power3.out",
      onUpdate: render,
    });

    const onPointerMove = (event) => {
      const bounds = root.getBoundingClientRect();
      const px = THREE.MathUtils.clamp((event.clientX - bounds.left) / bounds.width * 2 - 1, -1, 1);
      const py = THREE.MathUtils.clamp((event.clientY - bounds.top) / bounds.height * 2 - 1, -1, 1);
      rotateXTo(BASE_ROTATION.x - py * TILT_LIMIT);
      rotateYTo(BASE_ROTATION.y + px * TILT_LIMIT);
      rimXTo(3.4 + px * 1.2);
      rimYTo(-2.5 - py * 0.8);
    };
    const onPointerEnter = () => {
      gsap.to(group.scale, { x: 1.018, y: 1.018, z: 1.018, duration: 0.55, ease: "power3.out", onUpdate: render });
    };
    const onPointerLeave = () => {
      rotateXTo(BASE_ROTATION.x);
      rotateYTo(BASE_ROTATION.y);
      rimXTo(3.4);
      rimYTo(-2.5);
      gsap.to(group.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: "power3.out", onUpdate: render });
    };

    root.addEventListener("pointermove", onPointerMove);
    root.addEventListener("pointerenter", onPointerEnter);
    root.addEventListener("pointerleave", onPointerLeave);
    cleanupFns.push(() => {
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerenter", onPointerEnter);
      root.removeEventListener("pointerleave", onPointerLeave);
      rotateXTo.tween?.kill();
      rotateYTo.tween?.kill();
      rimXTo.tween?.kill();
      rimYTo.tween?.kill();
    });
  }

  return () => {
    cleanupFns.forEach((cleanup) => cleanup());
    resizeObserver.disconnect();
    entryTimeline?.scrollTrigger?.kill();
    entryTimeline?.kill();
    qrTexture?.dispose();
    slabGeometry.dispose();
    slabMaterial.dispose();
    edgeGeometry.dispose();
    edgeMaterial.dispose();
    faceGeometry.dispose();
    faceMaterial.dispose();
    qrGeometry.dispose();
    qrMaterial.dispose();
    environment.dispose();
    renderer.dispose();
  };
}
