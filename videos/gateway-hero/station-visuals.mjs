export const STATION_COLORS = Object.freeze({
  glassIdle: 0xd9f7e8,
  glassFocused: 0xccefdc,
  halo: 0xb6e3c9,
  edge: 0x71ba94,
  bloom: 0x9fd5b8,
  glow: 0x8fcca9,
  icon: 0x06382a,
  iconAccent: 0x164f38,
});

export const STATION_GLASS_GEOMETRY = Object.freeze({
  width: 1.88,
  height: 1.88,
  depth: 0.36,
  radius: 0.3,
  bevelSize: 0.095,
  bevelSegments: 6,
  curveSegments: 14,
});

export const ORBIT_ROTATION_OFFSET = Math.PI * 0.5;

export const ORBIT_PATHS = Object.freeze([
  Object.freeze({ radiusX: 3.75, radiusY: 1.42, rotationX: 0.12, rotationY: 0.12, rotationZ: 0.15, sway: 0.035, swaySpeed: 0.32, swayPhase: 0, opacity: 0.98 }),
  Object.freeze({ radiusX: 4.2, radiusY: 1.78, rotationX: 0.42, rotationY: -0.16, rotationZ: -0.19, sway: 0.045, swaySpeed: 0.26, swayPhase: 1.9, opacity: 0.94 }),
  Object.freeze({ radiusX: 3.5, radiusY: 2.16, rotationX: -0.34, rotationY: 0.28, rotationZ: 0.22, sway: 0.04, swaySpeed: 0.29, swayPhase: 3.7, opacity: 0.9 }),
]);

export function orbitRotationAt(path, time) {
  return path.rotationZ + Math.sin(time * path.swaySpeed + path.swayPhase) * path.sway;
}

export function orbitPointAt(path, angle, rotationZ = path.rotationZ) {
  const pointX = Math.cos(angle) * path.radiusX;
  const pointY = Math.sin(angle) * path.radiusY;
  const cosX = Math.cos(path.rotationX);
  const sinX = Math.sin(path.rotationX);
  const cosY = Math.cos(path.rotationY);
  const sinY = Math.sin(path.rotationY);
  const cosZ = Math.cos(rotationZ);
  const sinZ = Math.sin(rotationZ);

  return [
    cosY * cosZ * pointX - cosY * sinZ * pointY,
    (cosX * sinZ + sinX * cosZ * sinY) * pointX + (cosX * cosZ - sinX * sinZ * sinY) * pointY,
    (sinX * sinZ - cosX * cosZ * sinY) * pointX + (sinX * cosZ + cosX * sinZ * sinY) * pointY,
  ];
}

export const GLASS_PROFILES = Object.freeze({
  slab: Object.freeze({
    color: STATION_COLORS.glassIdle,
    roughness: 0.07,
    metalness: 0,
    transmission: 0.82,
    thickness: 0.62,
    ior: 1.48,
    dispersion: 0.018,
    clearcoat: 1,
    clearcoatRoughness: 0.035,
    specularIntensity: 1,
    specularColor: 0xeafff2,
    envMapIntensity: 1.85,
    attenuationColor: 0x79bf99,
    attenuationDistance: 1.65,
    transparent: true,
    opacity: 0.97,
  }),
  orbit: Object.freeze({
    color: 0xe8fff0,
    roughness: 0.014,
    metalness: 0,
    transmission: 0.94,
    thickness: 0.2,
    ior: 1.46,
    dispersion: 0.018,
    clearcoat: 1,
    clearcoatRoughness: 0.004,
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: 3.25,
    attenuationColor: 0x58c47d,
    attenuationDistance: 2.2,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  }),
  decorationShell: Object.freeze({
    color: 0xb7efc5,
    roughness: 0.012,
    metalness: 0,
    transmission: 0.94,
    thickness: 0.62,
    ior: 1.5,
    dispersion: 0.022,
    clearcoat: 1,
    clearcoatRoughness: 0.008,
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: 3.1,
    attenuationColor: 0x46b96d,
    attenuationDistance: 0.95,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  }),
  decorationCore: Object.freeze({
    color: 0x3da866,
    roughness: 0.04,
    metalness: 0,
    transmission: 0.78,
    thickness: 0.72,
    ior: 1.46,
    dispersion: 0.016,
    clearcoat: 1,
    clearcoatRoughness: 0.018,
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: 2.1,
    attenuationColor: 0x1e7041,
    attenuationDistance: 0.85,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  }),
  orbCore: Object.freeze({
    color: 0x91e6a1,
    roughness: 0.018,
    metalness: 0,
    transmission: 0.965,
    thickness: 1.15,
    ior: 1.44,
    dispersion: 0.012,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    specularColor: 0xf1fff8,
    envMapIntensity: 2.35,
    attenuationColor: 0x59bd75,
    attenuationDistance: 3.2,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }),
  orbShell: Object.freeze({
    color: 0xb4f7bc,
    roughness: 0.008,
    metalness: 0,
    transmission: 0.998,
    thickness: 0.48,
    ior: 1.52,
    dispersion: 0.025,
    clearcoat: 1,
    clearcoatRoughness: 0.008,
    specularIntensity: 1,
    specularColor: 0xffffff,
    envMapIntensity: 2.5,
    transparent: true,
    opacity: 0.94,
    depthTest: false,
    depthWrite: false,
  }),
});

export function iconRenderProfile(baseProfile) {
  return {
    ...baseProfile,
    transparent: true,
    opacity: 1,
    depthWrite: true,
  };
}

const STATION_VISUAL_SCALE = 0.64;
const FOCUSED_SCALE_MULTIPLIER = 2.048;
const HOVER_SCALE_GAIN = 0.065;

export function stationVisualScale({ depthScale = 1, lift = 0, hoverProgress = 0 }) {
  const focusedScale = 1 + lift * (FOCUSED_SCALE_MULTIPLIER - 1);
  const hoverScale = 1 + hoverProgress * HOVER_SCALE_GAIN * (1 - lift);
  return STATION_VISUAL_SCALE * depthScale * focusedScale * hoverScale;
}

export function advanceHoverProgress(current, hovered, reduceMotion = false) {
  if (reduceMotion) return 0;
  const target = hovered ? 1 : 0;
  const easing = hovered ? 0.14 : 0.1;
  const next = current + (target - current) * easing;
  return Math.abs(target - next) < 0.0001 ? target : next;
}
