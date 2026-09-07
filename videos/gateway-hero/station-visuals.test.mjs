import assert from "node:assert/strict";
import test from "node:test";

import * as visuals from "./station-visuals.mjs";

const { advanceHoverProgress, STATION_COLORS, stationVisualScale } = visuals;

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

test("premium slab and layered orb remain clear refractive dielectrics", () => {
  const { slab, orbCore, orbShell, orbVolume } = visuals.GLASS_PROFILES;

  for (const profile of [slab, orbCore, orbShell]) {
    assert.equal(profile.metalness, 0);
    assert.ok(profile.transmission >= 0.72);
    assert.ok(profile.clearcoat >= 0.9);
  }
  assert.ok(orbVolume);
  assert.ok(orbShell.transmission >= 0.99);
  assert.ok(orbShell.roughness <= 0.02);
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
