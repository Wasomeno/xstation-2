export const STATION_COLORS = Object.freeze({
  glassIdle: 0xbde6cf,
  glassFocused: 0xa8dabd,
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
  orbVolume: Object.freeze({
    color: 0x8fd3ad,
    roughness: 0.13,
    metalness: 0,
    transmission: 0.72,
    thickness: 3.4,
    ior: 1.35,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    specularIntensity: 0.85,
    envMapIntensity: 1.25,
    attenuationColor: 0x2d7752,
    attenuationDistance: 0.78,
  }),
  orbCore: Object.freeze({
    color: 0xbce9d2,
    roughness: 0.028,
    metalness: 0,
    transmission: 0.92,
    thickness: 2.8,
    ior: 1.46,
    dispersion: 0.018,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    specularIntensity: 1,
    specularColor: 0xf1fff8,
    envMapIntensity: 2.2,
    attenuationColor: 0x66b88e,
    attenuationDistance: 1.15,
  }),
  orbShell: Object.freeze({
    color: 0xf4fff9,
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
