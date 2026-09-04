# Orbit Motion Handoff

## Status

The orbit interaction is not resolved. Do not assume the current rotation implementation works just because syntax checks pass. The latest user screenshots still show the orbit selection failing visually.

This document is intended for the next agent or a later session. Use the screenshots and runtime behavior as the source of truth, and preserve the existing dirty worktree changes.

## User's intended interaction

The hero should behave like a character-selection menu:

- The orbit dock stays anchored on the right side of the viewport.
- When a station becomes active, the dock zooms in around its own center. Only part of the enlarged orbit may remain visible.
- The active station must be brought to a visible side of the enlarged orbit.
- If the active station is currently on the hidden side, rotate the orbital lines/system to bring it into view.
- The rotation should be a deliberate snap motion from one selected station to the next, not a camera continuously following a point during normal wheel movement.
- Station labels must remain upright. Only the orbital geometry/positions should spin.
- All six stations should use the same focused zoom level, including Marketing & Content.
- The product/content chapter must not appear until all six orbit selections have completed.

## Current user-reported failures

1. The rotation still feels stuck on the first selection and then catches up later.
2. After rotation, the orbit station nodes disappear while the ring SVG and 3D orb remain visible.
3. Earlier screenshots showed active stations missing from the visible orbit after rotation.
4. Earlier, the Products chapter appeared before the orbit sequence finished. The pin-slot height was changed, but it still needs runtime verification.
5. Earlier, station labels inherited the orbital rotation and became upside down. A counter-rotation attempt was added, then the implementation was changed again to numeric node positioning.

## Relevant files

- [`index.html`](../index.html) — owns `#pin-slot`, `#root`, the fixed field stage, hero copy, and the Products chapter.
- [`videos/gateway-hero/work.js`](../videos/gateway-hero/work.js) — owns Lenis, the GSAP `hero-pass` ScrollTrigger, snap points, and orbit copy changes.
- [`videos/gateway-hero/field.js`](../videos/gateway-hero/field.js) — owns station geometry, focus state, dock transforms, ring SVG, station nodes, and the 3D orb.
- [`videos/gateway-hero/field.css`](../videos/gateway-hero/field.css) — owns `.dock`, `.dock-svg`, `.dock-node`, and `.dock-orbs` positioning/visibility.
- [`docs/xstation-landing-unification.md`](./xstation-landing-unification.md) — broader motion architecture notes; some values are stale relative to the current code.

## Current motion values

In [`field.js`](../videos/gateway-hero/field.js):

```js
FOCUS_START = 0.64;
FOCUS_END = 0.98;
FOCUS_BLEND_START = 0.54;
FOCUS_TARGET_ANGLE = 180;
```

In [`work.js`](../videos/gateway-hero/work.js):

```js
end: () => "+=" + window.innerHeight * 7.2;
scrub: 0.8;
snapTo: snapPassProgress;
directional: true;
inertia: false;
```

The six snap points are currently calculated across `0.64 → 0.98`:

```text
0.6400, 0.7080, 0.7760, 0.8440, 0.9120, 0.9800
```

In [`index.html`](../index.html), `#pin-slot` currently reserves:

```css
height: calc(max(100svh, 720px) + 720svh);
```

## What has already been attempted

- Increased the pinned scroll distance from `5.6 × viewport height` to `7.2 × viewport height`.
- Widened the focus sequence from `0.72–0.95` to `0.64–0.98`.
- Increased ScrollTrigger scrub smoothing from `0.45` to `0.8`.
- Added directional snap points for the six stations and disabled snap inertia.
- Added a pre-focus blend from `0.54` to `0.64` to avoid an initial binary jump.
- Changed first-station zoom so Marketing should also use `1.62` focus scale.
- Tried rotating the parent `.dock` and counter-rotating station nodes. This caused bad/missing node behavior.
- Current approach rotates the ring SVG and numerically rotates each station's raw `x/y` position. The dock parent itself is no longer supposed to rotate.
- Current approach uses station-driven rotation targets rather than an interpolated camera target.

## Important current implementation details

`field.js` currently has these layers of state:

- `focusIndex`, `focusLocal`, `focusStrength`, `focusZoom`, `focusBlend`.
- `focusRotationTarget` is updated when `setFocusIndex()` sees a new station.
- `focusMotion.rotation` is animated with `gsap.quickTo()`.
- `renderFocusMotion()` sets dock position/scale, rotates the SVG, numerically rotates node positions, and updates node alpha.
- `layoutDock()` recalculates raw node positions every render from `state.t` and the ring-specific spin speed.
- `layoutStation()` calls `layoutDock()` and then `applyFocusVisuals()`.

The key code paths are around:

- `setFocusFromProgress()`
- `renderFocusMotion()`
- `stationRotation()`
- `setFocusIndex()`
- `applyFocusVisuals()`
- `layoutDock()`

## Recommended debugging path

Do not make another visual transform change without observing the live state.

1. Add temporary diagnostics or a debug-only method to expose, for each station:
   - `focusIndex`
   - `focusRotationTarget`
   - `focusMotion.rotation`
   - `focusMotion.focusPosition`
   - `node.x`, `node.y`
   - `gsap.getProperty(node.el, "x")`, `gsap.getProperty(node.el, "y")`, `gsap.getProperty(node.el, "autoAlpha")`
   - `node.el.getBoundingClientRect()`
2. Inspect the exact frame after each snap point. Confirm whether nodes are:
   - still in the DOM but outside the viewport;
   - `autoAlpha`/opacity zero;
   - hidden by `visibility` or a parent opacity;
   - being overwritten by a later `layoutDock()` call;
   - receiving invalid/NaN transforms.
3. Verify transform ownership. There should be one owner for each property:
   - dock: fixed right-side `x/y/scale` only;
   - SVG rings/line: rotation only;
   - station nodes: rotated `x/y`, rotation `0`, readable labels;
   - 3D canvas: fixed at dock center, scale only.
4. Verify the active station mathematically. After applying the station rotation, its final angle should equal `FOCUS_TARGET_ANGLE` and its bounding box should be visible in the viewport.
5. Verify the exact first snap at progress `0.64`. Marketing must be active and focused there, not merely zoomed.
6. Verify reverse scrolling. The active index, rotation, node visibility, and labels must recover in reverse without a stuck state.
7. Verify the section gate. The Products chapter's first content should not enter the viewport before the final orbit snap/release.

## Likely areas to investigate

- `gsap.quickTo()` calls and `gsap.set()` calls may be fighting over the same node transforms during a snap.
- `layoutDock()` writes raw node transforms every frame, while `renderFocusMotion()` writes rotated node transforms. Confirm the order and whether a later call overwrites the rotated values.
- `focusRotationTarget` is derived from `state.t` when the index changes. Confirm `state.t` is frozen at the intended orbital orientation before calculating the target.
- The parent `.dock` and child `.dock-svg` have different box geometry. The SVG is `2400px` square with `margin: -1200px`; verify `transform-origin: 50% 50%` is actually the orbit center.
- `autoAlpha` is written by `layoutDock()`, `renderFocusMotion()`'s quick-to alpha calls, and `recedeDock()`. Find which call hides the nodes.
- Snap behavior with Lenis may still be allowing continuous progress before snapping. Confirm whether the visual motion is caused by raw progress, snap tween progress, or both.

## Verification checklist

- [ ] Marketing is visible and focused at the first snap.
- [ ] Every station has the same focused zoom scale.
- [ ] Dock center remains on the right.
- [ ] Active station is visible after each snap.
- [ ] Orbital lines rotate to the active station.
- [ ] Station labels stay upright.
- [ ] No station nodes disappear after rotation.
- [ ] One downward gesture advances one station.
- [ ] Reverse gesture returns one station cleanly.
- [ ] Products chapter waits until all six stations are complete.
- [ ] `node --check videos/gateway-hero/field.js` passes.
- [ ] `node --check videos/gateway-hero/work.js` passes.
- [ ] `git diff --check` passes.
