import assert from "node:assert/strict";
import test from "node:test";
import { occupancy, pickSpot } from "./voice-stage.js";

const width = 1440, height = 900;
const body = { w: 122, h: 109 }, bubble = { w: 384, h: 90 };
const rect = (left, top, right, bottom, weight = 1) => ({ left, top, right, bottom, weight });
const overlaps = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const boxes = (spot) => [
  rect(spot.x - body.w / 2, spot.y - body.h, spot.x + body.w / 2, spot.y),
  ...(spot.bubble ? [rect(spot.bubble.left, spot.bubble.top, spot.bubble.left + bubble.w, spot.bubble.top + bubble.h)] : []),
];
// A product space: preview on the left, copy on the right, an empty strip along the bottom.
const product = [rect(44, 106, 692, 754, 0.7), rect(748, 196, 1230, 664)];

test("occupancy marks covered cells and keeps the heaviest weight", () => {
  const grid = occupancy([rect(0, 0, 48, 24, 0.7), rect(24, 0, 72, 24)], 96, 48);
  assert.deepEqual([...grid.cells].map(value => Number(value.toFixed(1))), [0.7, 1, 1, 0, 0, 0, 0, 0]);
});

test("the mascot and its caption stand in empty space beside the content", () => {
  const spot = pickSpot({ rects: product, width, height, body, bubble });
  assert.equal(spot.blocked, 0);
  for (const box of boxes(spot)) {
    for (const info of product) assert.ok(!overlaps(box, info), "Neither the mascot nor its caption covers information");
    assert.ok(box.left >= 0 && box.right <= width && box.top >= 0 && box.bottom <= height, "Everything stays on screen");
  }
  assert.ok(Math.abs(spot.x - width / 2) > width / 4, "Free space at the side beats free space in the middle");
  assert.ok(spot.y > height - 40, "It stays on the ground when the bottom strip is free");
});

test("it climbs to a free side when the bottom of the screen is taken", () => {
  const rects = [rect(0, 600, width, height), rect(0, 0, 900, 600)];
  const spot = pickSpot({ rects, width, height, body, bubble: null });
  assert.equal(spot.blocked, 0);
  assert.ok(spot.x > 900 + body.w / 2 && spot.y <= 600);
});

test("it keeps its place until that place is needed, then moves to a clear one", () => {
  const first = pickSpot({ rects: product, width, height, body, bubble });
  const here = { x: width - first.x, y: first.y };
  const stayed = pickSpot({ rects: product, width, height, body, bubble, current: here, from: here });
  assert.deepEqual([stayed.x, stayed.y, stayed.blocked], [here.x, here.y, 0], "An equally empty spot is not worth a move");
  const covering = rect(first.x - 200, first.y - 250, first.x + 200, height);
  const moved = pickSpot({ rects: [...product, covering], width, height, body, bubble, current: first, from: first });
  assert.equal(moved.blocked, 0);
  assert.ok(!overlaps(boxes(moved)[0], covering));
});

test("a crowded screen still returns the least covered spot", () => {
  const spot = pickSpot({ rects: [rect(0, 0, width, height, 0.7), rect(0, 0, width, 700)], width, height, body, bubble });
  assert.ok(spot && spot.y > 800, "Media is covered before text");
});

test("a large screen is laid out like a small one: it leaves the middle for a free bottom corner", () => {
  for (const [wide, tall] of [[1280, 720], [1440, 810], [1680, 945], [1920, 1080], [2272, 1227], [2560, 1440], [3440, 1440]]) {
    // After its greeting it stands large in the middle of the screen; a session resumed finds it at the bottom centre.
    for (const from of [{ x: wide / 2, y: tall * 0.75 }, { x: wide / 2, y: tall - 16 }]) {
      const spot = pickSpot({ rects: [], width: wide, height: tall, body, bubble: null, from });
      assert.ok(Math.abs(spot.x - wide / 2) > wide * 0.4 && spot.y > tall - 40, `On ${wide}x${tall} it stands at ${Math.round(spot.x)}, ${Math.round(spot.y)}`);
    }
  }
});
