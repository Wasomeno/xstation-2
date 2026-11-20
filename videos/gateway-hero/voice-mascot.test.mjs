import assert from "node:assert/strict";
import test from "node:test";
import {
  BALL_RADIUS, CHIRP_LEVEL, CROUCH_SECONDS, MOODS, VOICES, blinkOpen, createChirps, createMascot, createMascotModel, drawMascot, mascotPaint, projectEyes, spring,
} from "./voice-mascot.js";

const FRAME = 1 / 60;
// A repeatable source of chance.
const chance = (seed = 11) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const scene = (mood, more = {}) => ({ index: 1, elapsed: 5, mood, gaze: null, events: [], ...more });
// Steps the model for some seconds and returns the pose after every frame.
const run = (model, seconds, input, sounds = []) => Array.from({ length: Math.round(seconds / FRAME) }, () => {
  sounds.push(...model.step(FRAME, typeof input === "function" ? input() : input));
  return model.pose();
});
const still = (pose) => pose.eyes.map((eye) => [eye.x, eye.y, eye.rx, eye.ry, eye.arc, eye.spin]);
// The farthest any part of an eye's oval reaches from the middle of the face.
const reach = (eye) => {
  let far = 0;
  for (let i = 0; i < 32; i += 1) {
    const angle = i / 32 * Math.PI * 2, x = Math.cos(angle) * eye.rx, y = Math.sin(angle) * eye.ry;
    far = Math.max(far, Math.hypot(eye.x + x * Math.cos(eye.spin) - y * Math.sin(eye.spin), eye.y + x * Math.sin(eye.spin) + y * Math.cos(eye.spin)));
  }
  return far;
};
// Where it is looking, read off its face: the middle of the pair of eyes.
const gaze = (pose) => [(pose.eyes[0].x + pose.eyes[1].x) / 2, (pose.eyes[0].y + pose.eyes[1].y) / 2];

test("a spring settles on its target, and a loose one overshoots on the way", () => {
  const tight = { x: 0, v: 0 }, loose = { x: 0, v: 0 };
  let peak = 0;
  for (let i = 0; i < 180; i += 1) {
    spring(tight, 1, 210, 29, FRAME);
    spring(loose, 1, 320, 13, FRAME);
    peak = Math.max(peak, loose.x);
    assert.ok(tight.x <= 1.001, "A critically damped spring does not pass its target");
  }
  assert.ok(peak > 1.15, "The body's spring wobbles past its target like jelly");
  assert.ok(Math.abs(tight.x - 1) < 0.001 && Math.abs(loose.x - 1) < 0.01);
});

test("a blink shuts the eyes in 70 ms and opens them by 200 ms; a double blink does it twice", () => {
  assert.equal(blinkOpen(-5), 1);
  assert.equal(blinkOpen(0), 1);
  assert.ok(Math.abs(blinkOpen(70) - 0.06) < 1e-9);
  assert.ok(blinkOpen(135) > 0.4 && blinkOpen(135) < 0.7);
  assert.equal(blinkOpen(200), 1);
  assert.equal(blinkOpen(330), 1, "A single blink is over");
  assert.ok(Math.abs(blinkOpen(330, true) - 0.06) < 1e-9, "A double blink shuts again");
  assert.equal(blinkOpen(460, true), 1);
});

test("the eyes sit as on a ball that turns: the one turning toward the viewer grows, the other shrinks", () => {
  const [left, right] = projectEyes(0, 0);
  assert.ok(Math.abs(left.x + right.x) < 1e-12 && left.y === 0 && right.y === 0 && left.x < -0.3, "Looking straight out, the eyes are a level, even pair");
  assert.ok(Math.abs(left.rx - right.rx) < 1e-12 && left.ry > left.rx * 1.7, "of tall ovals");
  assert.ok(Math.abs(left.spin + right.spin) < 1e-12 && Math.abs(left.spin) < 0.05, "leaning a little toward each other");
  const [near, far] = projectEyes(0.44, 0);
  assert.ok(near.x > left.x && far.x > right.x, "A turn to the right carries both eyes to the right");
  assert.ok(near.rx > left.rx * 1.1 && near.ry > left.ry, "The eye turning toward the viewer grows");
  assert.ok(far.rx < right.rx * 0.6 && far.ry < right.ry * 0.8, "and the one turning away shrinks");
  assert.ok(far.x - near.x < right.x - left.x, "as the pair closes up");
  const mirrored = projectEyes(-0.44, 0);
  assert.ok(Math.abs(mirrored[1].rx - near.rx) < 1e-12 && Math.abs(mirrored[0].x + far.x) < 1e-12, "A turn to the left is its mirror image");
  const down = projectEyes(0, 0.34), up = projectEyes(0, -0.34);
  assert.ok(down.every((eye) => eye.y > 0.2) && up.every((eye) => eye.y < -0.2), "Looking down or up carries both eyes with it");
  for (const yaw of [-0.7, 0, 0.7]) for (const pitch of [-0.55, 0, 0.55]) {
    for (const eye of projectEyes(yaw, pitch)) assert.ok(reach(eye) < 0.97 && eye.rx > 0.02 && eye.ry > 0.1, "However far it turns, the eyes stay on the face");
  }
});

test("every feeling keeps both eyes on the face, wherever it looks", () => {
  const looks = [null, [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
  for (const mood of Object.keys(MOODS)) {
    for (const gaze of looks) {
      const model = createMascotModel({ random: chance() });
      const input = { state: mood === "off" ? "deaf" : mood === "talking" ? "speaking" : "armed", scene: scene(mood, { gaze }), pointer: gaze };
      for (const pose of run(model, 1.5, input)) {
        for (const eye of pose.eyes) assert.ok(reach(eye) < 0.97, `An eye leaves the face while ${mood} looks at ${gaze}`);
      }
    }
  }
});

test("pointing, it looks to the bottom left, where the microphone is held out, and leans that way", () => {
  const pose = run(createMascotModel({ random: chance() }), 1.5, { state: "armed", scene: scene("pointing") }).at(-1);
  const [x, y] = gaze(pose);
  assert.ok(x < -0.15 && y > 0.15, `Its eyes have gone to the lower left of its face (${x.toFixed(2)}, ${y.toFixed(2)})`);
  assert.ok(pose.tilt < -2, "and its head leans to the left");
});

test("a hop crouches, leaves the ground stretched, lands with a squash and settles", () => {
  const model = createMascotModel({ random: chance() });
  run(model, 1, { state: "armed", scene: scene("attentive", { index: 1, elapsed: 5 }) });
  let elapsed = 0;
  const sounds = [];
  const frames = run(model, 1.6, () => ({ state: "armed", scene: scene("attentive", { index: 2, elapsed: (elapsed += FRAME), events: [[0, "hop", 1, "plip"]] }) }), sounds);
  const crouch = frames.slice(0, Math.floor(CROUCH_SECONDS / FRAME));
  assert.ok(crouch.every((pose) => pose.lift === 0), "It stays on the ground while it crouches");
  assert.ok(crouch.at(-1).tall < 0.97, "and gathers itself: lower and wider");
  const air = frames.filter((pose) => pose.lift < 0);
  assert.ok(air.length >= 9 && air.length <= 18, "It is in the air for about a fifth of a second");
  const peak = Math.min(...air.map((pose) => pose.lift));
  assert.ok(peak < -0.12 && peak > -0.25, "A full hop peaks about a sixth of its radius up");
  assert.ok(Math.max(...air.map((pose) => pose.tall)) > 1.06, "It leaves the ground stretched");
  const landed = frames.findLastIndex((pose) => pose.lift < 0) + 1;
  assert.ok(Math.min(...frames.slice(landed, landed + 9).map((pose) => pose.tall)) < 0.95, "The landing squashes it");
  for (const pose of frames) {
    assert.ok((pose.tall - 1) * (pose.wide - 1) <= 1e-9, "What it loses in height it gains in width");
    assert.ok(pose.lift <= 0 && pose.tall > 0.7 && pose.tall < 1.3);
  }
  assert.ok(air.every((pose) => pose.shadow.wide < frames[0].shadow.wide + 0.2 && pose.shadow.alpha < 1), "In the air its shadow fades");
  assert.ok(Math.min(...air.map((pose) => pose.shadow.alpha)) < 0.85);
  const rest = frames.at(-1);
  assert.ok(rest.lift === 0 && Math.abs(rest.tall - 1) < 0.02, "It comes to rest");
  assert.deepEqual(sounds, ["plip"], "Its sound is heard once, as it leaves the ground");

  const small = createMascotModel({ random: chance() });
  elapsed = 0;
  const low = run(small, 1, () => ({ state: "armed", scene: scene("attentive", { index: 2, elapsed: (elapsed += FRAME), events: [[0, "hop", 0.5]] }) }));
  assert.ok(Math.min(...low.map((pose) => pose.lift)) > peak / 2, "A weaker hop is a lower one");
});

test("one feeling springs into the next without a cut", () => {
  const model = createMascotModel({ random: chance() });
  run(model, 1, { state: "armed", scene: scene("attentive", { gaze: [0, 0] }) });
  const before = model.pose();
  assert.ok(before.eyes.every((eye) => eye.ry > eye.rx * 1.7 && eye.arc === 0), "Attentive eyes are tall, open ovals");
  assert.ok(before.eyes[0].x < 0 && before.eyes[1].x > 0);
  const frames = run(model, 1.2, { state: "armed", scene: scene("happy", { index: 2, gaze: [0, 0] }) });
  let last = before;
  for (const pose of frames) {
    // Place and size in face units, then the arch, which runs from 0 to 1.
    still(pose).forEach((eye, side) => eye.slice(0, 5).forEach((value, key) => assert.ok(Math.abs(value - still(last)[side][key]) < (key === 4 ? 0.15 : 0.03), "No part of an eye jumps")));
    last = pose;
  }
  assert.ok(frames.some((pose) => pose.eyes[0].arc > 0.2 && pose.eyes[0].arc < 0.7), "It passes through the shapes in between");
  const happy = frames.at(-1);
  assert.ok(happy.eyes.every((eye, side) => Math.abs(eye.arc - 1) < 0.02 && eye.rx > before.eyes[side].rx * 1.1 && eye.ry < before.eyes[side].ry * 0.92), "Happy eyes are arches: wider and lower");
  assert.ok(Math.min(...frames.slice(0, 12).map((pose) => pose.tall)) < before.tall - 0.01, "A new feeling goes through the body");
  assert.equal(model.mood, "happy");
  run(model, 0.5, { state: "armed", scene: scene("no such feeling", { index: 3 }) });
  assert.equal(model.mood, "attentive", "An unknown feeling is the attentive one");

  const sizes = {};
  for (const mood of ["attentive", "startled", "peek", "curious", "suspicious", "winkLeft", "winkRight"]) {
    const other = createMascotModel({ random: chance() });
    sizes[mood] = run(other, 1.2, { state: "armed", scene: scene(mood, { gaze: [0, 0] }) }).at(-1).eyes;
  }
  assert.ok(sizes.startled[0].ry > sizes.peek[0].ry && sizes.peek[0].ry > sizes.attentive[0].ry * 1.08, "A start opens the eyes widest; leaning in opens them wide");
  assert.ok(sizes.curious[0].ry > sizes.attentive[0].ry && sizes.curious[1].ry < sizes.attentive[1].ry * 0.7, "Curious, one eye opens and the other narrows");
  assert.ok(sizes.suspicious.every((eye, side) => eye.ry < sizes.attentive[side].ry * 0.6), "Suspicious, both narrow");
  assert.ok(sizes.winkLeft[0].arc > 0.98 && sizes.winkLeft[1].arc < 0.02 && sizes.winkRight[1].arc > 0.98 && sizes.winkRight[0].arc < 0.02, "A wink arches one eye and leaves the other open");
});

test("it blinks on its own, briefly, and not while its eyes are smiling shut", () => {
  const model = createMascotModel({ random: chance(5) });
  const frames = run(model, 30, { state: "armed", scene: scene("attentive", { gaze: [0, 0] }) });
  const shut = frames.map((pose) => pose.eyes[0].ry < 0.15);
  const starts = shut.flatMap((value, i) => (value && !shut[i - 1] ? [i] : []));
  // A double blink shuts the eyes twice within half a second.
  const blinks = starts.filter((at, i) => !i || at - starts[i - 1] > 40);
  assert.ok(blinks.length >= 5 && blinks.length <= 12, "It blinks every few seconds");
  blinks.slice(1).forEach((at, i) => assert.ok(at - blinks[i] >= 2.5 * 60, "with seconds between blinks"));
  assert.ok(starts.length > blinks.length, "and now and then twice in a row");
  for (const at of starts) assert.ok(!shut.slice(at, at + 20).every(Boolean), "A blink is over within a fifth of a second");
  const smiling = createMascotModel({ random: chance(5) });
  run(smiling, 1, { state: "armed", scene: scene("happy") });
  run(smiling, 1, { state: "armed", scene: scene("happy", { gaze: [0, 0] }) });
  const height = smiling.pose().eyes[0].ry;
  assert.ok(run(smiling, 20, { state: "armed", scene: scene("happy", { gaze: [0, 0] }) }).every((pose) => Math.abs(pose.eyes[0].ry - height) < 0.01), "Smiling eyes do not blink");
});

test("its gaze follows the pointer, wanders on its own, and beside the content looks at the content", () => {
  const model = createMascotModel({ random: chance() });
  const rest = run(model, 0.2, { state: "armed", pointer: [0, 0] }).at(-1);
  const right = run(model, 0.8, { state: "armed", pointer: [0.9, 0] }).at(-1);
  assert.ok(right.eyes.every((eye, side) => eye.x > rest.eyes[side].x + 0.07), "Both eyes go toward the pointer");
  assert.ok(right.eyes[0].rx > rest.eyes[0].rx * 1.1, "The eye turning toward the viewer grows");
  assert.ok(right.eyes[1].rx < right.eyes[0].rx * 0.6, "the eye turning away shrinks");
  assert.ok(right.eyes[1].x - right.eyes[0].x < rest.eyes[1].x - rest.eyes[0].x, "and the pair closes up");
  assert.ok(right.shift > 0.03 && right.tilt > 1.5, "The body leans after it");
  const down = run(model, 0.8, { state: "armed", pointer: [0, 5] }).at(-1);
  assert.ok(down.eyes.every((eye, side) => eye.y > rest.eyes[side].y + 0.2 && reach(eye) < 0.97), "A far pointer is looked at, not chased off the face");

  const alone = createMascotModel({ random: chance(3) });
  const wandering = run(alone, 30, { state: "armed" }).map(gaze);
  assert.ok(Math.max(...wandering.map(([x]) => x)) > 0.08 && Math.min(...wandering.map(([x]) => x)) < -0.08, "Left to itself it looks about, to both sides");
  assert.ok(wandering.every(([x, y]) => Math.abs(x) < 0.4 && Math.abs(y) < 0.3), "without staring off to the edge");
  assert.ok(wandering.filter(([x, y]) => Math.abs(x) < 0.01 && Math.abs(y) < 0.01).length > 60, "and now and then straight out");

  const beside = createMascotModel({ random: chance(3) });
  const presenting = run(beside, 30, { state: "speaking", look: [0.6, -0.3] }).map(gaze);
  assert.ok(presenting.filter(([x]) => x > 0.1).length > presenting.length * 0.6, "Beside the content it mostly looks at the content");
  assert.ok(presenting.some(([x], i) => i > 120 && Math.abs(x) < 0.02), "with a glance at the visitor now and then");
});

test("while it listens it follows the scrolling page; other states keep their own gaze", () => {
  const listening = createMascotModel({ random: chance() });
  run(listening, 0.5, { state: "listening", pointer: [0, 0] });
  const level = listening.pose().eyes[0].y;
  const down = run(listening, 0.4, { state: "listening", scrolling: 1 });
  assert.ok(down.at(-1).eyes[0].y > level + 0.07, "Scrolling down, it looks down");
  const up = run(listening, 0.4, { state: "listening", scrolling: -1 });
  assert.ok(up.at(-1).eyes[0].y < level - 0.07, "Scrolling up, it looks up");
  [...down, ...up].forEach((pose, i, all) => { if (i) assert.ok(Math.abs(pose.eyes[0].y - all[i - 1].eyes[0].y) < 0.08, "The turn is smooth"); });
  const moving = createMascotModel({ random: chance() }), quiet = createMascotModel({ random: chance() });
  assert.deepEqual(run(moving, 1, { state: "thinking", scrolling: 1 }).map(still), run(quiet, 1, { state: "thinking" }).map(still), "Thinking is not distracted by the page");
});

test("listening: a hop when a voice starts, nods in pairs while speech is understood", () => {
  const dips = (frames, base) => frames.map((pose) => gaze(pose)[1] - base).flatMap((value, i, all) => (value > 0.02 && value >= all[i - 1] && value > all[i + 1] ? [i] : []));
  const model = createMascotModel({ random: chance() });
  const quiet = run(model, 1, { state: "listening", pointer: [0, 0] });
  assert.ok(quiet.every((pose) => pose.lift === 0), "A quiet room does not move it");
  const voiced = run(model, 1.1, { state: "listening", pointer: [0, 0], voice: 0.5 });
  const airborne = voiced.map((pose) => pose.lift < 0);
  assert.equal(airborne.filter((value, i) => value && !airborne[i - 1]).length, 1, "A voice starting gets one small hop");
  assert.ok(airborne.indexOf(true) < 20, "within a third of a second");
  assert.ok(Math.min(...voiced.map((pose) => pose.lift)) > -0.08, "a small one");
  assert.ok(voiced.at(-1).tall < 0.995, "A loud voice presses it down a little");

  const hearing = createMascotModel({ random: chance() });
  run(hearing, 1, { state: "listening", pointer: [0, 0] });
  const base = gaze(hearing.pose())[1];
  const nods = dips(run(hearing, 9, { state: "listening", pointer: [0, 0], voice: 0.5, heard: true }), base);
  assert.equal(nods.length, 6, "Understood speech gets a pair of nods about every 3.4 seconds");
  nods.slice(1).forEach((at, i) => assert.ok(i % 2 === 0 ? at - nods[i] < 30 : at - nods[i] > 150, "in quick pairs"));
  for (const [state, input] of [["listening", { voice: 0.5 }], ["listening", { heard: true }], ["thinking", { voice: 0.5, heard: true }], ["armed", { voice: 0.5, heard: true }]]) {
    const other = createMascotModel({ random: chance() });
    run(other, 1, { state, pointer: [0, 0] });
    const from = gaze(other.pose())[1];
    assert.equal(dips(run(other, 5, { state, pointer: [0, 0], ...input }).slice(30), from).length, 0, "Only audible, recognised speech while listening is nodded at");
  }
});

test("listening: an action that could not run gets one shake of the head", () => {
  const shake = [[0, 0.42], [0.05, 0.28], [0.14, -0.68], [0.18, -0.54], [0.28, 0.68], [0.34, 0.47], [0.42, 0.35], [0.5, 0.42]];
  const x = (pose) => gaze(pose)[0];
  const model = createMascotModel({ random: chance() });
  run(model, 1, { state: "listening", pointer: [0, 0], shake });
  const home = x(model.pose());
  const frames = run(model, 1.2, { state: "listening", pointer: [0, 0], shake, fallback: "1" });
  const sweep = frames.slice(0, 30).map(x);
  const left = sweep.indexOf(Math.min(...sweep)), right = sweep.indexOf(Math.max(...sweep));
  assert.ok(sweep[left] < home - 0.09 && sweep[right] > home + 0.09, "Its eyes sweep to one side and to the other");
  assert.ok(left < right && left > 4 && right < 24, "left first, then right, within the 500 ms of the gesture");
  frames.forEach((pose) => pose.eyes.forEach((eye) => assert.ok(reach(eye) < 0.97, "The eyes stay on the face")));
  assert.ok(Math.abs(x(frames.at(-1)) - home) < 0.01, "and come home");
  assert.ok(run(model, 2, { state: "listening", pointer: [0, 0], shake, fallback: "1" }).every((pose) => Math.abs(x(pose) - home) < 0.012), "The same event is not shaken at twice");
  assert.ok(run(model, 0.4, { state: "listening", pointer: [0, 0], shake, fallback: "2" }).some((pose) => x(pose) < home - 0.09), "A new one is");
  const other = createMascotModel({ random: chance() });
  run(other, 1, { state: "armed", pointer: [0, 0] });
  assert.ok(run(other, 1, { state: "armed", pointer: [0, 0], fallback: "1" }).every((pose) => Math.abs(x(pose) - home) < 0.012), "Outside a conversation there is nothing to shake at");
  const plain = createMascotModel({ random: chance() });
  run(plain, 1, { state: "listening", pointer: [0, 0] });
  assert.ok(run(plain, 0.5, { state: "listening", pointer: [0, 0], fallback: "1" }).some((pose) => x(pose) < home - 0.09), "It has a shake of its own when none is given");
});

test("speaking: its body rises with its voice and hops as the voice comes in", () => {
  const model = createMascotModel({ random: chance() });
  const silent = run(model, 1.5, { state: "speaking", look: [0.5, -0.2] });
  assert.ok(silent.slice(60).every((pose) => pose.lift === 0 && Math.abs(pose.tall - 1) < 0.02), "Silent, it stands at rest");
  const loud = run(model, 1.5, { state: "speaking", look: [0.5, -0.2], voice: 0.8 });
  assert.equal(loud.map((pose) => pose.lift < 0).filter((value, i, all) => value && !all[i - 1]).length, 1, "Its voice coming in gets one small hop");
  assert.ok(loud.at(-1).tall > 1.035 && loud.at(-1).tall < 1.08, "and it stands taller while it speaks");
  assert.equal(model.mood, "talking");
});

test("carried by the stage, its body trails behind and wobbles upright again", () => {
  const model = createMascotModel({ random: chance() });
  run(model, 1, { state: "listening", pointer: [0, 0] });
  const carried = run(model, 0.4, { state: "listening", pointer: [0, 0], travel: [30, 0] });
  assert.ok(carried.at(-1).tilt < -8 && Math.min(...carried.map((pose) => pose.tilt)) >= -18, "Carried to the right, it leans back to the left, within limits");
  const arrived = run(model, 2, { state: "listening", pointer: [0, 0], travel: [0, 0] });
  assert.ok(Math.max(...arrived.map((pose) => pose.tilt)) > 0.5, "Set down, it swings past upright");
  assert.ok(Math.abs(arrived.at(-1).tilt) < 0.3, "and settles");
  const lifted = run(model, 0.4, { state: "listening", pointer: [0, 0], travel: [0, -30] });
  assert.ok(lifted.at(-1).tall > 1.04, "Carried up or down it stretches");
  model.poke(40);
  assert.ok(run(model, 0.5, { state: "listening", pointer: [0, 0] }).every((pose) => pose.tall <= 1.16 && pose.tall >= 0.82 && pose.wide > 0.85 && pose.wide < 1.16), "However hard it is thrown about, it stays a ball");
});

test("it follows the attract screen's cue: each event once, on time, and nothing that is already over", () => {
  const events = [[0.1, "sound", 1, "ting"], [0.5, "hop", 0.6, "plip"], [0.8, "nod", 1, "clink"], [1, "blink", 2]];
  const model = createMascotModel({ random: chance() });
  let elapsed = 0;
  const heard = [];
  for (let frame = 0; frame < 120; frame += 1) {
    elapsed += FRAME;
    for (const sound of model.step(FRAME, { state: "armed", scene: scene("attentive", { index: 4, elapsed, events }) })) heard.push([sound, Math.round(elapsed * 100) / 100]);
  }
  assert.deepEqual(heard.map(([sound]) => sound), ["ting", "plip", "clink"]);
  assert.ok(Math.abs(heard[0][1] - 0.1) < 0.03 && Math.abs(heard[2][1] - 0.8) < 0.03, "A sound and a nod are heard when they happen");
  assert.ok(heard[1][1] > 0.5 + CROUCH_SECONDS - 0.01 && heard[1][1] < 0.5 + CROUCH_SECONDS + 0.05, "A hop is heard when it leaves the ground");
  const again = [];
  run(model, 1, { state: "armed", scene: scene("attentive", { index: 4, elapsed, events }) }, again);
  assert.deepEqual(again, [], "A cue that stands still does not repeat itself");

  const late = createMascotModel({ random: chance() });
  const missed = [];
  run(late, 0.5, { state: "armed", scene: scene("attentive", { index: 4, elapsed: 3, events }) }, missed);
  assert.deepEqual(missed, [], "Joining a cue late leaves out what is over");

  const restarted = [];
  elapsed = 0;
  run(model, 0.3, () => ({ state: "armed", scene: scene("attentive", { index: 4, elapsed: (elapsed += FRAME), events }) }), restarted);
  assert.deepEqual(restarted, ["ting"], "The same cue started again plays again");

  const talking = createMascotModel({ random: chance() });
  const during = [];
  elapsed = 0;
  const frames = run(talking, 1.2, () => ({ state: "listening", pointer: [0, 0], scene: scene("happy", { index: 4, elapsed: (elapsed += FRAME), events }) }), during);
  assert.deepEqual(during, [], "A conversation is not interrupted by the attract screen's cue");
  assert.equal(talking.mood, "attentive");
  assert.ok(frames.every((pose) => pose.lift === 0));
});

test("each conversation state has its feeling, and a mascot that cannot hear is dimmed", () => {
  for (const [state, mood] of [["listening", "attentive"], ["thinking", "thinking"], ["speaking", "talking"], ["deaf", "off"], ["blocked", "off"], ["armed", "attentive"], ["idle", "attentive"], ["connecting", "attentive"]]) {
    const model = createMascotModel({ random: chance() });
    const pose = run(model, 1.5, { state }).at(-1);
    assert.equal(model.mood, mood);
    assert.equal(pose.dim, mood === "off");
  }
  // While a call connects it has no feeling of its own: it does what the stage tells it.
  const called = createMascotModel({ random: chance() });
  let elapsed = 0;
  const waiting = run(called, 1.2, () => ({ state: "connecting", scene: scene("attentive", { index: -1, elapsed: (elapsed += FRAME), gaze: [0, -0.04], events: [[0, "hop", 0.6]] }) }));
  assert.equal(called.mood, "attentive");
  assert.equal(waiting.map((pose) => pose.lift < 0).filter((value, i, all) => value && !all[i - 1]).length, 1, "On being called it gives one small hop");
  assert.ok(Math.abs(gaze(waiting.at(-1))[0]) < 0.01, "and then waits, looking at the visitor");
  const thinking = createMascotModel({ random: chance() });
  const frames = run(thinking, 4, { state: "thinking" });
  assert.ok(frames.every((pose, i) => i < 30 || pose.eyes[0].y < 0), "Thinking, it looks up");
  const sides = frames.slice(30).map((pose) => Math.sign(gaze(pose)[0]));
  assert.ok(sides.includes(1) && sides.includes(-1), "to one side and then the other");
});

test("reduced motion shows each feeling at rest: no hops, no blinks, no sound", () => {
  for (const mood of Object.keys(MOODS)) {
    const model = createMascotModel({ random: chance() });
    const sounds = [];
    const input = { state: "armed", still: true, scene: scene(mood, { elapsed: 0.01, events: [[0, "hop", 1, "plip"]] }) };
    const frames = run(model, 6, input, sounds);
    assert.deepEqual(sounds, []);
    assert.deepEqual(frames.at(-1), frames[0], "Nothing moves");
    const pose = frames[0];
    assert.equal(pose.lift, 0);
    assert.equal(pose.tall, MOODS[mood].squash || 1);
    pose.eyes.forEach((eye, side) => assert.ok(Math.abs(eye.arc - MOODS[mood].eyes[side].arc) < 1e-9, "The eyes have the feeling's shape at once"));
  }
  const model = createMascotModel({ random: chance() });
  const calm = run(model, 0.1, { state: "listening", still: true }).at(-1);
  const reacting = run(model, 0.1, { state: "listening", still: true, fallback: "1" }).at(-1);
  assert.ok(reacting.eyes[0].x < calm.eyes[0].x - 0.05, "An action that could not run gets a still sideways look");
  assert.deepEqual(run(model, 0.1, { state: "listening", still: true }).at(-1), calm);
});

test("a push on the body makes it wobble and settle", () => {
  const model = createMascotModel({ random: chance() });
  run(model, 1, { state: "armed", pointer: [0, 0] });
  model.poke(1.6);
  const frames = run(model, 1.5, { state: "armed", pointer: [0, 0] });
  const heights = frames.map((pose) => pose.tall), top = heights.indexOf(Math.max(...heights));
  assert.ok(heights[top] > 1.04 && top < 12, "It stretches at once");
  assert.ok(Math.min(...heights.slice(top, top + 20)) < 1, "swings back through its own shape");
  assert.ok(Math.abs(frames.at(-1).tall - 1) < 0.02, "and settles");
});

test("the face is flat: one disc in the site's green and two ovals in its pale greens", () => {
  const paint = mascotPaint("#1C855C", "#002010", "#90B0A0", "#C8D8C8");
  assert.deepEqual(paint.on, { face: "#1C855C", eyes: ["#C8D8C8", "#90B0A0"] }, "The left eye is the lighter one");
  const brightness = (hex) => [1, 3, 5].reduce((sum, at) => sum + parseInt(hex.slice(at, at + 2), 16), 0);
  assert.ok(brightness(paint.off.face) < brightness(paint.on.face) * 0.6, "A mascot that cannot hear is dimmed");
  paint.off.eyes.forEach((eye, side) => assert.ok(brightness(eye) < brightness(paint.on.eyes[side]) * 0.6 && brightness(eye) > brightness(paint.off.face), "with eyes one can still see"));
  assert.deepEqual(mascotPaint("green", "", "rgb(1, 2, 3)"), mascotPaint(), "Colours it cannot read fall back to the site's");
  assert.notDeepEqual(mascotPaint("#336699", "#001122", "#445566", "#778899").on, mascotPaint().on);

  // No gradient, shadow or stroke exists on this context: a face that used one would throw.
  const calls = [];
  let clipped = false;
  const ctx = {
    save() {}, restore() {}, beginPath() {},
    clip() { clipped = true; },
    translate(x, y) { calls.push({ move: [x, y] }); },
    rotate(angle) { calls.at(-1).spin = angle; },
    arc(x, y, radius) { calls.push({ disc: [x, y, radius] }); },
    ellipse(x, y, rx, ry) { calls.push({ oval: [x, y, rx, ry], clipped }); },
    fill() { calls.at(-1).color = this.fillStyle; },
  };
  const model = createMascotModel({ random: chance() });
  const pose = run(model, 1, { state: "armed", pointer: [0.5, 0.2] }).at(-1);
  drawMascot(ctx, 100, pose, paint);
  assert.deepEqual(calls[0], { disc: [0, 0, 100], color: "#1C855C" }, "The face fills its radius with one flat colour");
  const ovals = calls.filter((call) => call.oval);
  assert.equal(ovals.length, 2);
  assert.deepEqual(ovals.map((call) => call.color), ["#90B0A0", "#C8D8C8"], "The right eye is drawn first, the left over it");
  assert.ok(ovals.every((call) => call.clipped), "Nothing of an eye shows beyond the face");
  [pose.eyes[1], pose.eyes[0]].forEach((eye, i) => {
    assert.deepEqual(calls.filter((call) => call.move)[i], { move: [eye.x * 100, eye.y * 100], spin: eye.spin });
    assert.deepEqual(ovals[i].oval, [0, 0, eye.rx * 100, eye.ry * 100]);
  });

  calls.length = 0;
  const happy = run(model, 1, { state: "armed", scene: scene("happy", { gaze: [0, 0] }) }).at(-1);
  drawMascot(ctx, 100, happy, paint);
  const arches = calls.filter((call) => call.oval);
  assert.equal(arches.length, 4, "A smiling eye is its oval with a piece of face laid over the lower part");
  for (const at of [0, 2]) {
    const [eye, cover] = [arches[at].oval, arches[at + 1].oval];
    assert.equal(arches[at + 1].color, "#1C855C");
    assert.ok(cover[1] > 0 && cover[1] - cover[3] < 0 && cover[1] - cover[3] > -eye[3], "The cover stops short of the top of the eye");
    assert.ok(cover[2] > eye[2], "and is wider than the eye");
  }
  calls.length = 0;
  drawMascot(ctx, 100, { ...pose, dim: true }, paint);
  assert.deepEqual(calls.filter((call) => call.color).map((call) => call.color), [paint.off.face, paint.off.eyes[1], paint.off.eyes[0]]);
});

test("its sounds are light, short, a little different each time, wait for a touch, and tolerate blocked audio", async () => {
  for (const [name, voice] of Object.entries(VOICES)) {
    for (const [wave, from, to, seconds, loudness, delay] of voice) {
      assert.ok(["sine", "triangle"].includes(wave), `${name} is a soft tone, not a buzz`);
      assert.ok(from >= 400 && to >= 400 && from <= 6000 && to <= 6000, `${name} is bright: nothing low or growling`);
      assert.ok(seconds <= 0.25 && delay + seconds <= 0.8, `${name} is made of short notes and is soon over`);
      assert.ok(loudness > 0 && loudness * CHIRP_LEVEL <= 0.16, `${name} is not loud`);
    }
    assert.ok(Math.max(...voice.map((partial) => partial[4])) * CHIRP_LEVEL > 0.04, `${name} can be heard`);
  }
  for (const name of ["chirp", "clink", "plip", "plink"]) assert.ok(VOICES[name], `The mascot can ${name}`);
  assert.ok(VOICES.plip[0][2] > VOICES.plip[0][1] * 1.8, "A plip rises quickly, like a drop of water");
  assert.ok(VOICES.clink.length >= 3 && VOICES.clink.every(([, from]) => from > 2000), "A clink rings high, with several partials");
  assert.ok(VOICES.chirp.length === 3 && VOICES.trill.length === 4 && VOICES.tune.length === 4, "A chirp, a trill and a tune are a few notes each");
  assert.ok(VOICES.plink[1][1] < VOICES.plink[0][1] && VOICES.bloop[0][2] < VOICES.bloop[0][1], "A plink steps down and a bloop falls");
  assert.ok(VOICES.murmur.every(([, , , , loudness]) => loudness < VOICES.pip[0][4]), "A murmur is the quietest thing it says");

  let contexts = 0, resumes = 0;
  const tones = [];
  class Audio {
    state = "suspended"; currentTime = 2; destination = {};
    constructor() { contexts += 1; }
    resume() { resumes += 1; this.state = "running"; return Promise.resolve(); }
    createOscillator() {
      const tone = { frequency: { setValueAtTime(value) { tone.from = value; }, exponentialRampToValueAtTime(value) { tone.to = value; } }, connect() {}, disconnect() {}, start(at) { tone.start = at; }, stop(at) { tone.stop = at; } };
      tones.push(tone);
      return tone;
    }
    createGain() {
      const tone = tones.at(-1);
      return { gain: { setValueAtTime() {}, linearRampToValueAtTime(value) { tone.peak = value; }, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
    }
  }
  const view = { AudioContext: Audio, navigator: { userActivation: { hasBeenActive: false } } };
  let roll = 0.5;
  const chirp = createChirps(view, () => roll);
  chirp("plip");
  assert.equal(contexts, 0, "Before the page has been touched it does not even ask for sound");
  view.navigator.userActivation.hasBeenActive = true;
  chirp("plip");
  assert.deepEqual([contexts, resumes, tones.length], [1, 1, 0], "The first sound after a touch only wakes the audio");
  chirp("plip");
  assert.equal(tones.length, 1);
  assert.deepEqual([tones[0].type, tones[0].from, tones[0].to], ["sine", VOICES.plip[0][1], VOICES.plip[0][2]]);
  assert.ok(tones[0].start === 2 && Math.abs(tones[0].stop - 2 - VOICES.plip[0][3] - 0.02) < 1e-9);
  assert.ok(Math.abs(tones[0].peak - VOICES.plip[0][4] * CHIRP_LEVEL) < 1e-9, "at the mascot's level");
  roll = 1;
  chirp("plip");
  assert.ok(tones[1].from > tones[0].from * 1.03 && tones[1].from < tones[0].from * 1.1, "Each one is tuned a little differently");
  assert.ok(Math.abs(tones[1].to / tones[1].from - tones[0].to / tones[0].from) < 1e-9, "while keeping its shape");
  chirp("clink");
  assert.equal(tones.length, 2 + VOICES.clink.length, "A clink sounds all its partials together");
  chirp("tune");
  assert.deepEqual(tones.slice(-4).map((tone) => Math.round((tone.start - 2) * 100) / 100), [0, 0.2, 0.4, 0.6], "A tune plays its notes one after another");
  const count = tones.length;
  chirp("no such sound");
  assert.equal(tones.length, count);
  assert.equal(contexts, 1, "One audio context serves every sound");
  assert.doesNotThrow(() => createChirps({ AudioContext: class { constructor() { throw new Error("Audio blocked"); } } })("plip"));
  assert.doesNotThrow(() => createChirps({})("plip"), "A browser without audio stays silent");
});

// A stand-in for the browser window, its document and one canvas.
function page({ reduced = false, tokens = { "--signal": "#1C855C", "--deep-forest": "#002010", "--sage": "#90B0A0", "--mist": "#C8D8C8" } } = {}) {
  let next = null, now = 1000;
  const calls = { clears: 0, draws: 0, sizes: [], frames: 0 };
  const ctx = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : key === "clearRect" ? () => { calls.clears += 1; } : key === "arc" ? () => { calls.draws += 1; } : () => {}),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  const canvas = { clientWidth: 88, style: {}, getContext: () => ctx, getBoundingClientRect: () => ({ left: 100, top: 100, width: 88, height: 88 }) };
  Object.defineProperty(canvas, "width", { set(value) { calls.sizes.push(value); }, get: () => calls.sizes.at(-1) });
  const shadow = {};
  const root = { dataset: { state: "armed" }, style: { setProperty(name, value) { shadow[name] = value; } } };
  const motion = Object.assign(new EventTarget(), { matches: reduced });
  const view = Object.assign(new EventTarget(), {
    devicePixelRatio: 2, scrollY: 0,
    document: Object.assign(new EventTarget(), { hidden: false }),
    performance: { now: () => now },
    matchMedia: () => motion,
    getComputedStyle: () => ({ getPropertyValue: (name) => tokens[name] || "" }),
    requestAnimationFrame(callback) { assert.ok(!motion.matches, "Reduced motion does not animate"); next = callback; return 1; },
    cancelAnimationFrame() { next = null; },
  });
  return {
    canvas, root, view, calls, shadow, motion,
    frames(count, step = 1000 / 60) {
      for (let i = 0; i < count; i += 1) {
        const callback = next;
        next = null; now += step; calls.frames += 1;
        callback(now);
      }
    },
    get queued() { return next; },
  };
}

test("the mascot's canvas follows the size the stage shows it at", () => {
  const h = page({ reduced: true });
  const mascot = createMascot({ canvas: h.canvas, root: h.root, view: h.view });
  assert.deepEqual(h.calls.sizes, [Math.round(88 * 2 * 3.2)], "A conversation shows the mascot at up to 3.2 times its size");
  mascot.setResolution(11);
  assert.equal(h.calls.sizes.at(-1), 88 * 2 * 11, "The screen-sized mascot gets a pixel for every screen pixel");
  mascot.setResolution(11.2);
  assert.equal(h.calls.sizes.length, 2, "A slightly different size is not worth a new canvas");
  mascot.setResolution(40);
  assert.equal(h.calls.sizes.at(-1), 3072, "The canvas stays within a sane texture size");
  mascot.setResolution(0);
  assert.equal(h.calls.sizes.at(-1), Math.round(88 * 2 * 3.2), "Leaving the attract screen returns the default");
  assert.equal(h.calls.draws, h.calls.sizes.length, "A new canvas is painted at once");
  assert.equal(BALL_RADIUS, 34 / 88);
});

test("the body's moves are moves of the whole canvas, and a face that has not changed is not repainted", () => {
  const h = page();
  const heard = [], levels = [];
  let elapsed = 0;
  const mascot = createMascot({ canvas: h.canvas, root: h.root, view: h.view, say: (name) => heard.push(name), level: (seconds, state) => { levels.push([seconds, state]); return 0; } });
  mascot.setDirection(() => ({ scene: scene("attentive", { index: 2, elapsed: (elapsed += 1 / 60), gaze: [0, 0], events: [[0.2, "hop", 1, "plip"]] }), travel: [0, 0], look: null }));
  const lifts = [], heights = [];
  for (let i = 0; i < 90; i += 1) {
    h.frames(1);
    lifts.push(parseFloat(h.canvas.style.translate.split(" ")[1]));
    heights.push(parseFloat(h.canvas.style.scale.split(" ")[1]));
  }
  assert.ok(Math.min(...lifts) < -3 && lifts.at(-1) === 0, "A hop lifts the canvas and sets it down");
  assert.ok(Math.max(...heights) > 1.05 && Math.min(...heights) < 0.95, "and stretches and squashes it");
  assert.ok(h.canvas.style.rotate.endsWith("deg"));
  assert.deepEqual(heard, ["plip"], "The stage's cue reaches the mascot, and its sound the speaker");
  assert.ok(levels.length > 80 && levels.every(([seconds, state]) => seconds > 0 && state === "armed"), "It asks for the voice level once a frame");
  assert.ok(Number(h.shadow["--voice-shadow-scale"]) > 0.2 && Number(h.shadow["--voice-shadow-alpha"]) <= 1);
  assert.ok(h.calls.draws < 60, "The face is repainted only when it changes, not on every frame of a hop");

  h.root.dataset.state = "listening";
  mascot.refresh();
  assert.doesNotThrow(() => h.frames(1, -4), "A queued frame can carry a time from before a refresh");
  mascot.poke(2);
  h.frames(6);
  assert.ok(parseFloat(h.canvas.style.scale.split(" ")[1]) > 1.03, "A push reaches the body");
  h.view.document.hidden = true;
  h.frames(1);
  assert.equal(h.queued, null, "A hidden page stops the animation");
});

test("with reduced motion the mascot is one still picture that changes only with its state", () => {
  const h = page({ reduced: true });
  const heard = [];
  const mascot = createMascot({ canvas: h.canvas, root: h.root, view: h.view, say: (name) => heard.push(name) });
  mascot.setDirection(() => ({ scene: scene("happy", { elapsed: 0.01, events: [[0, "hop", 1, "plip"]] }), travel: [40, 0], look: null }));
  const draws = h.calls.draws;
  mascot.refresh(); mascot.refresh();
  assert.equal(h.calls.draws, draws, "The same picture is not painted again");
  assert.equal(h.queued, null);
  assert.deepEqual([h.canvas.style.translate, h.canvas.style.rotate], ["0.00px 0.00px", "0.00deg"]);
  assert.deepEqual(heard, []);
  mascot.poke(3);
  mascot.refresh();
  assert.equal(h.canvas.style.scale, "0.9840 1.0200", "A happy mascot stands a little taller, and a push does not move it");
  h.root.dataset.state = "deaf";
  mascot.refresh();
  assert.equal(h.calls.draws, draws + 1, "A new state is a new picture");
});

test("without a canvas to draw on the mascot does nothing, quietly", () => {
  const mascot = createMascot({ canvas: { getContext: () => null }, root: {}, view: {} });
  assert.doesNotThrow(() => { mascot.refresh(); mascot.setDirection(() => null); mascot.setResolution(4); mascot.poke(1); });
});
