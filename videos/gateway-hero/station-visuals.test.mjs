import assert from "node:assert/strict";
import test from "node:test";

import * as visuals from "./station-visuals.mjs";

const { advanceHoverProgress, orbitPointAt, orbitRotationAt, ORBIT_PATHS, ORBIT_ROTATION_SPEED, ORBIT_SWAY, STATION_COLORS, stationVisualScale } = visuals;

function relativeLuminance(hex) {
  const channels = [16, 8, 0].map((shift) => ((hex >> shift) & 0xff) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrastRatio(first, second) {
  const lighter = Math.max(relativeLuminance(first), relativeLuminance(second));
  const darker = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (lighter + 0.05) / (darker + 0.05);
}

function rgbChannels(hex) {
  return [16, 8, 0].map((shift) => (hex >> shift) & 0xff);
}

test("focused station renders 20% smaller while idle scale stays unchanged", () => {
  assert.equal(stationVisualScale({ depthScale: 1, lift: 0 }), 0.64);

  const previousFocusedScale = 0.64 * 2.56;
  assert.equal(stationVisualScale({ depthScale: 1, lift: 1 }), previousFocusedScale * 0.8);
});

test("dark icon tones remain distinct against every light-green slab surface", () => {
  const slabColors = [STATION_COLORS.glassIdle, STATION_COLORS.glassFocused];
  const iconColors = [STATION_COLORS.icon, STATION_COLORS.iconAccent];

  for (const slabColor of slabColors) {
    for (const iconColor of iconColors) {
      assert.ok(contrastRatio(slabColor, iconColor) >= 4.5);
    }
  }
});

test("slab surfaces remain visibly light green", () => {
  const slabColors = [STATION_COLORS.glassIdle, STATION_COLORS.glassFocused];

  for (const slabColor of slabColors) {
    const [red, green, blue] = rgbChannels(slabColor);
    assert.ok(green - red >= 10);
    assert.ok(green - blue >= 4);
    assert.ok(Math.min(red, green, blue) >= 0x80);
  }
});

test("green slab optics remain premium and translucent", () => {
  const { slab } = visuals.GLASS_PROFILES;

  assert.ok(slab.transmission >= 0.72 && slab.transmission <= 0.9);
  assert.ok(slab.roughness >= 0.04 && slab.roughness <= 0.1);
  assert.ok(slab.thickness >= 0.45 && slab.thickness <= 0.8);
  assert.ok(slab.attenuationDistance >= 0.8 && slab.attenuationDistance <= 3);
});

test("orbit tubes use legible mint optics", () => {
  const { orbit } = visuals.GLASS_PROFILES;
  const [red, green, blue] = rgbChannels(orbit.color);

  assert.equal(orbit.metalness, 0);
  assert.ok(green > red && green > blue);
  assert.ok(Math.min(red, green, blue) >= 0xa0);
  assert.ok(orbit.transmission >= 0.1 && orbit.transmission <= 0.35);
  assert.ok(orbit.roughness >= 0.05 && orbit.roughness <= 0.14);
  assert.ok(orbit.thickness >= 0.08 && orbit.thickness <= 0.2);
  assert.ok(orbit.opacity >= 0.75 && orbit.opacity <= 0.9);
  assert.notEqual(orbit.attenuationColor, 0xffffff);
});

test("floating decorations keep a green refractive shell with a subtle core", () => {
  const { slab, decorationShell, decorationCore } = visuals.GLASS_PROFILES;
  const [shellRed, shellGreen, shellBlue] = rgbChannels(decorationShell.color);
  const [, slabGreen] = rgbChannels(slab.color);

  assert.ok(shellGreen > shellRed && shellGreen > shellBlue);
  assert.ok(slabGreen - shellGreen < 16);
  assert.notEqual(decorationShell.attenuationColor, slab.attenuationColor);
  assert.ok(decorationShell.attenuationDistance < slab.attenuationDistance);
  assert.ok(decorationShell.transmission >= 0.9);
  assert.ok(decorationShell.roughness <= 0.02);
  assert.ok(decorationShell.clearcoatRoughness <= 0.01);
  assert.ok(decorationShell.envMapIntensity >= 3);
  assert.ok(decorationCore.transmission >= 0.72);
  assert.ok(decorationCore.roughness <= 0.06);
  assert.ok(decorationCore.opacity >= 0.4 && decorationCore.opacity <= 0.5);
});

test("orbiting station hover eases in and settles smoothly back", () => {
  const firstHoverFrame = advanceHoverProgress(0, true);
  assert.ok(firstHoverFrame > 0 && firstHoverFrame < 1);

  let settled = firstHoverFrame;
  for (let frame = 0; frame < 60; frame += 1) settled = advanceHoverProgress(settled, true);
  assert.ok(settled > 0.99 && settled <= 1);

  const firstReleaseFrame = advanceHoverProgress(settled, false);
  assert.ok(firstReleaseFrame > 0 && firstReleaseFrame < settled);
  assert.equal(advanceHoverProgress(settled, true, true), 0);
});

test("premium slab and center orb remain clear refractive dielectrics", () => {
  const { slab, orbCore, orbShell } = visuals.GLASS_PROFILES;

  for (const profile of [slab, orbCore, orbShell]) {
    assert.equal(profile.metalness, 0);
    assert.ok(profile.transmission >= 0.72);
    assert.ok(profile.clearcoat >= 0.9);
  }
  assert.ok(orbCore.transmission >= 0.96);
  assert.ok(orbCore.attenuationDistance >= 2.5);
  assert.equal(orbCore.transparent, true);
  assert.equal(orbCore.depthTest, false);
  assert.equal(orbCore.depthWrite, false);
  assert.ok(relativeLuminance(orbCore.color) < relativeLuminance(slab.color));
  const [orbRed, orbGreen, orbBlue] = rgbChannels(orbCore.color);
  assert.ok(orbGreen - (orbRed + orbBlue) * 0.5 >= 39);
  assert.ok(orbShell.transmission >= 0.99);
  assert.ok(orbShell.roughness <= 0.02);
  assert.equal(orbShell.depthTest, false);
  assert.equal(orbShell.depthWrite, false);
});

test("orbit assembly keeps its authored broad horizontal orientation", () => {
  assert.equal(visuals.ORBIT_ROTATION_OFFSET, 0);
});

test("orbit planes retain distinct depth envelopes", () => {
  const depthRanges = ORBIT_PATHS.map((path) => {
    const depths = Array.from({ length: 96 }, (_, index) => orbitPointAt(path, (Math.PI * 2 * index) / 96)[2]);
    return [Math.min(...depths), Math.max(...depths)];
  });

  assert.ok(depthRanges.every(([min, max]) => max - min > 0.3));
  assert.equal(new Set(depthRanges.map(([min, max]) => `${min.toFixed(2)}:${max.toFixed(2)}`)).size, 2);
});

test("orbit lines share one slow rotational cadence", () => {
  assert.ok(ORBIT_ROTATION_SPEED >= 0.006 && ORBIT_ROTATION_SPEED <= 0.015);
  const start = orbitRotationAt(ORBIT_PATHS[0], 0);
  const afterTwoMinutes = orbitRotationAt(ORBIT_PATHS[2], 120);
  const displacement = Math.atan2(
    Math.sin(afterTwoMinutes - start),
    Math.cos(afterTwoMinutes - start),
  );

  assert.ok(Math.abs(displacement) > 0.65);
  assert.equal(Math.sign(displacement), Math.sign(ORBIT_ROTATION_SPEED));
  assert.equal(ORBIT_SWAY.rotationX, 0.012);
  assert.equal(ORBIT_SWAY.rotationY, 0.018);
});

test("orbit paths share one geometric family", () => {
  assert.equal(new Set(ORBIT_PATHS.map((path) => path.radiusX)).size, 1);
  assert.equal(new Set(ORBIT_PATHS.map((path) => path.radiusY)).size, 1);
  assert.ok(ORBIT_PATHS.every((path) => path.radiusX >= 3.5 && path.radiusX <= 3.9));
  assert.ok(ORBIT_PATHS.every((path) => path.radiusY >= 1.45 && path.radiusY <= 1.75));
});

test("orbit planes have deliberate 3D separation", () => {
  const xTilts = ORBIT_PATHS.map((path) => path.rotationX);
  const yTilts = ORBIT_PATHS.map((path) => path.rotationY);

  assert.ok(Math.max(...xTilts) - Math.min(...xTilts) >= 0.7);
  assert.ok(Math.max(...yTilts) - Math.min(...yTilts) >= 0.5);
});

test("orbit rails use distinct visual strengths", () => {
  const tubeOpacities = ORBIT_PATHS.map((path) => path.opacity);
  const filamentOpacities = ORBIT_PATHS.map((path) => path.filamentOpacity);

  assert.ok(Math.max(...tubeOpacities) - Math.min(...tubeOpacities) >= 0.2);
  assert.ok(Math.max(...filamentOpacities) - Math.min(...filamentOpacities) >= 0.1);
});

test("orbit paths have no independent local motion", () => {
  assert.ok(ORBIT_PATHS.every((path) => path.rotationZ === 0));
  assert.ok(ORBIT_PATHS.every((path) => !("rotationSpeed" in path)));
  assert.ok(ORBIT_PATHS.every((path) => !("sway" in path)));
});

test("premium slab geometry keeps a thick shell with smooth restrained bevels", () => {
  const { depth, bevelSize, bevelSegments, curveSegments } = visuals.STATION_GLASS_GEOMETRY;

  assert.ok(depth >= 0.34);
  assert.ok(bevelSize < depth * 0.35);
  assert.ok(bevelSegments >= 5);
  assert.ok(curveSegments >= 12);
});

test("icon materials render after transmissive slabs without changing their surface styling", () => {
  const baseProfile = { color: 0x06382a, roughness: 0.16, clearcoat: 0.55 };
  const profile = visuals.iconRenderProfile(baseProfile);

  assert.equal(profile.color, baseProfile.color);
  assert.equal(profile.roughness, baseProfile.roughness);
  assert.equal(profile.clearcoat, baseProfile.clearcoat);
  assert.equal(profile.transparent, true);
  assert.equal(profile.opacity, 1);
  assert.equal(profile.depthWrite, true);
});
