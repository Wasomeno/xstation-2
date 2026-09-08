export const STATION_COLORS = Object.freeze({
  glassIdle: 0xc8d8c8,
  glassFocused: 0x90b0a0,
  halo: 0x90b0a0,
  edge: 0x1c855c,
  bloom: 0x1c855c,
  glow: 0x084828,
  icon: 0x002010,
  iconAccent: 0x083b28,
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

// Keep the family’s major axis broad in the hero frame; depth comes from plane tilt.
export const ORBIT_ROTATION_OFFSET = 0;
export const ORBIT_ROTATION_SPEED = 0.008;
export const ORBIT_SWAY = Object.freeze({
  rotationX: 0.012,
  rotationY: 0.018,
  speed: 0.18,
});
const TAU = Math.PI * 2;

export const ORBIT_PATHS = Object.freeze([
  Object.freeze({ radiusX: 3.7, radiusY: 1.6, rotationX: 0.08, rotationY: 0.04, rotationZ: 0, opacity: 0.86, filamentOpacity: 0.34 }),
  Object.freeze({ radiusX: 3.7, radiusY: 1.6, rotationX: -0.4, rotationY: 0.28, rotationZ: 0, opacity: 0.62, filamentOpacity: 0.18 }),
  Object.freeze({ radiusX: 3.7, radiusY: 1.6, rotationX: 0.4, rotationY: -0.28, rotationZ: 0, opacity: 0.76, filamentOpacity: 0.26 }),
]);

export function orbitRotationAt(_path, time) {
  return (ORBIT_ROTATION_OFFSET + time * ORBIT_ROTATION_SPEED) % TAU;
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
  specularColor: 0xf7f8f5,
    envMapIntensity: 1.85,
  attenuationColor: 0x90b0a0,
    attenuationDistance: 1.65,
    transparent: true,
    opacity: 0.97,
  }),
  orbit: Object.freeze({
  color: 0xc8d8c8,
    roughness: 0.08,
    metalness: 0,
    transmission: 0.24,
    thickness: 0.12,
    ior: 1.38,
    dispersion: 0.006,
    clearcoat: 0.45,
    clearcoatRoughness: 0.08,
    specularIntensity: 0.72,
  specularColor: 0xf7f8f5,
    envMapIntensity: 1.25,
  attenuationColor: 0x1c855c,
    attenuationDistance: 1.45,
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
  }),
  decorationShell: Object.freeze({
  color: 0xc8d8c8,
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
  attenuationColor: 0x1c855c,
    attenuationDistance: 0.95,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
  }),
  decorationCore: Object.freeze({
  color: 0x1c855c,
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
  attenuationColor: 0x084828,
    attenuationDistance: 0.85,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  }),
  orbCore: Object.freeze({
    color: 0x084828,
    roughness: 0.018,
    metalness: 0,
    transmission: 0.965,
    thickness: 1.15,
    ior: 1.44,
    dispersion: 0.012,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
  specularColor: 0xf7f8f5,
    envMapIntensity: 2.35,
  attenuationColor: 0x1c855c,
    attenuationDistance: 3.2,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  }),
  orbShell: Object.freeze({
  color: 0xc8d8c8,
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
