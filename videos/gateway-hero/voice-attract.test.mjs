import assert from "node:assert/strict";
import test from "node:test";
import { CHATTER, LIFT_OFF, POINT_EVERY, ROAM, ROAM_EVERY, createDirector } from "./voice-attract.js";
import { CROUCH_SECONDS, MOODS, VOICES } from "./voice-mascot.js";

const FRAME = 1 / 60;
// A repeatable source of chance.
const chance = (seed = 11) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// What kind of turn a cue belongs to.
const kind = (cue) => (cue.mood === "startled" ? "greeting" : cue.mood === "pointing" ? "point" : cue.mood === "thinking" ? "ponder"
  : cue.mood.startsWith("curious") ? "glance" : cue.mood.startsWith("suspicious") ? "suspect" : cue.mood.startsWith("wink") ? "wink"
  : cue.mood !== "attentive" ? cue.mood : cue.events.some((event) => event[1] === "hop") ? "roam" : "rest");
const hops = (cue) => cue.events.filter((event) => event[1] === "hop");
const said = (cue) => cue.events.map((event) => event[3]).filter(Boolean);
// Runs a director and returns each cue it gave, with how long it lasted and where the mascot stood.
function watch(seconds, { seed = 11, greet = true, each = () => {} } = {}) {
  let clock = 0;
  const director = createDirector({ random: chance(seed) });
  if (greet) director.greet();
  const cues = [];
  for (let frame = 0; frame < seconds / FRAME; frame += 1) {
    clock = frame * FRAME;
    each(director, clock, cues);
    const cue = director.step(FRAME);
    if (cue.index !== cues.at(-1)?.index) cues.push({ index: cue.index, at: clock, mood: cue.mood, gaze: cue.gaze, events: cue.events, kind: kind(cue), spots: [], zooms: [] });
    const now = cues.at(-1);
    now.seconds = clock + FRAME - now.at;
    now.spots.push([cue.elapsed, ...cue.spot]);
    now.zooms.push(cue.zoom);
  }
  return { cues, director };
}
// Turns: the cues between two rests.
const turns = (cues) => cues.reduce((all, cue) => {
  if (cue.kind === "rest" || !all.length || all.at(-1)[0].kind === "rest") all.push([cue]);
  else all.at(-1).push(cue);
  return all;
}, []);

test("when the attract screen takes the floor the mascot starts, greets, and then rests", () => {
  const { cues } = watch(8);
  assert.deepEqual(cues.slice(0, 3).map((cue) => cue.mood), ["startled", "happy", "attentive"]);
  assert.deepEqual(cues[0].events.map((event) => event.slice(1)), [["hop", 0.6, "blip"]], "It starts with a small hop and a blip");
  assert.deepEqual(cues[1].events.map((event) => [event[1], event[3]]), [["sound", "chirp"], ["hop", "plip"], ["hop", "plip"]], "and greets with a chirp and two happy hops");
  assert.equal(cues[2].kind, "rest");
  assert.ok(cues.slice(0, 2).every((cue) => cue.spots.every(([, x, y]) => x === 0 && y === 0)), "from the middle of the screen");
});

test("its turns alternate with rests, and it never takes the same turn twice running", () => {
  const { cues } = watch(600);
  const all = turns(cues).slice(0, -1);
  all.forEach((turn, i) => {
    if (i) assert.notEqual(turn[0].kind === "rest", all[i - 1][0].kind === "rest", "A rest follows every turn, and a turn every rest");
  });
  const rests = all.filter((turn) => turn[0].kind === "rest").map((turn) => turn[0]);
  for (const rest of rests) {
    assert.ok(rest.seconds > 1.25 && rest.seconds < 3.45, "A rest lasts a few seconds");
    assert.ok(rest.mood === "attentive" && rest.gaze === null, "and leaves its eyes to wander as they like");
    assert.ok(rest.events.length <= 1 && said(rest).every((sound) => sound === "murmur"), "with at most a murmur to itself");
    for (const [at] of rest.events) assert.ok(at >= 0.3 && at < 0.9 && at < rest.seconds - 0.3, "said well inside the rest");
  }
  const taken = all.filter((turn) => turn[0].kind !== "rest").map((turn) => turn[0].kind);
  taken.forEach((name, i) => { if (i) assert.notEqual(name, taken[i - 1], "The same turn does not come twice running"); });
  assert.ok(taken.length > 100, "In ten minutes it takes more than a hundred turns");
  const muttered = rests.filter((rest) => rest.events.length).length / rests.length;
  assert.ok(Math.abs(muttered - CHATTER) < 0.1, "It murmurs in about as many rests as it is set to");
});

test("its turns are varied, each a little different every time, and no two visits alike", () => {
  const { cues } = watch(600);
  const seen = new Set(cues.map((cue) => cue.kind));
  for (const name of ["rest", "roam", "glance", "happy", "point", "sway", "wink", "peek", "wiggle", "ponder", "suspect"]) assert.ok(seen.has(name), `It takes the turn "${name}"`);
  for (const cue of cues) {
    assert.ok(MOODS[cue.mood], `"${cue.mood}" is a feeling the mascot has`);
    assert.ok(!/sleep|drows/.test(cue.mood), "It never falls asleep");
    for (const [at, action, strength = 1, sound = ""] of cue.events) {
      assert.ok(["hop", "nod", "sound"].includes(action) && at >= 0 && at < cue.seconds + 0.05 && strength > 0 && strength <= 1.1);
      assert.ok(!sound || VOICES[sound], `"${sound}" is a sound the mascot can make`);
    }
    if (cue.gaze) assert.ok(cue.gaze.every((value) => Math.abs(value) <= 1), "A gaze is a direction on the face");
  }
  for (const name of ["rest", "glance", "happy", "point", "ponder"]) {
    const lengths = new Set(cues.filter((cue) => cue.kind === name).map((cue) => cue.seconds.toFixed(2)));
    assert.ok(lengths.size > 4, `"${name}" is not the same length every time`);
  }
  // Happy turns are few, so three visits are looked at for how many hops they take.
  const cheers = [cues, watch(600, { seed: 12 }).cues, watch(600, { seed: 13 }).cues].flatMap((visit) => visit.filter((cue) => cue.kind === "happy" && cue.at > 1));
  assert.deepEqual([...new Set(cheers.map((cue) => hops(cue).length))].sort(), [1, 2, 3], "A happy turn is one, two or three hops");
  assert.ok(cheers.every((cue) => said(cue)[0] === "chirp" && hops(cue).every((event) => event[3] === "plip")), "with a chirp, and a plip to each hop");
  for (const side of ["curious", "curiousLeft", "winkLeft", "winkRight", "suspicious", "suspiciousLeft"]) assert.ok(cues.some((cue) => cue.mood === side), `It can be ${side}`);
  const gazes = cues.filter((cue) => cue.kind === "glance").map((cue) => cue.gaze);
  assert.ok(gazes.some(([, y]) => y < -0.4) && gazes.some(([, y]) => y > -0.1), "It glances up as well as across");
  const other = watch(600, { seed: 12 }).cues;
  assert.notDeepEqual(other.slice(2, 40).map((cue) => cue.mood), cues.slice(2, 40).map((cue) => cue.mood), "Another visit goes differently");
  const used = new Set(cues.flatMap((cue) => cue.events.map((event) => event[3]).filter(Boolean)));
  for (const sound of Object.keys(VOICES)) assert.ok(used.has(sound), `It makes the sound "${sound}"`);
  // Every turn but a quiet rest has something to say, and each kind of turn its own thing.
  const voices = { glance: "peep", peek: "peep", wiggle: "trill", ponder: "plink", suspect: "bloop", wink: "ting", sway: "tune", point: "call" };
  for (const cue of cues) {
    if (voices[cue.kind]) assert.equal(said(cue)[0], voices[cue.kind], `A ${cue.kind} says "${voices[cue.kind]}"`);
  }
  const perMinute = cues.reduce((sum, cue) => sum + said(cue).length, 0) / 10;
  assert.ok(perMinute > 24 && perMinute < 38, "It has something to say every couple of seconds");
});

test("it wanders about its room in hops, and stays inside it", () => {
  assert.equal(LIFT_OFF, CROUCH_SECONDS, "A hop to another place starts to travel as the mascot leaves the ground");
  const { cues } = watch(600);
  const roams = turns(cues).filter((turn) => turn[0].kind === "roam");
  assert.ok(roams.length > 40, "It moves to another place several times a minute");
  // The longest turn and the longest rest can come between the moment a move is due and the move itself.
  [0, ...roams.map((turn) => turn[0].at), 600].forEach((at, i, all) => { if (i) assert.ok(at - all[i - 1] < ROAM_EVERY[1] + 13, "It never stays put for long"); });
  assert.ok(roams.some((turn) => turn.length === 1) && roams.some((turn) => turn.length > 1), "in one hop or in several");
  for (const turn of roams) {
    const from = turn[0].spots[0].slice(1), to = turn.at(-1).spots.at(-1).slice(1);
    assert.ok(Math.hypot(to[0] - from[0], (to[1] - from[1]) / 2) >= 0.5, "A move goes somewhere");
    assert.ok(turn.length <= 3);
    let last = from;
    for (const cue of turn) {
      assert.deepEqual(cue.events.map((event) => [event[0], event[1], event[3]]), [[0, "hop", "pip"]], "Each step is a hop with a small sound");
      assert.ok(cue.gaze[0] * (to[0] - from[0]) > 0, "It looks where it is going");
      for (const [elapsed, x, y] of cue.spots) {
        if (elapsed < LIFT_OFF - 1e-9) assert.deepEqual([x, y], last, "It does not slide before it has left the ground");
      }
      const landed = cue.spots.at(-1).slice(1);
      assert.ok(Math.sign(landed[0] - last[0]) === Math.sign(to[0] - from[0]) || landed[0] === last[0], "Every hop is a step on the way");
      last = landed;
    }
  }
  const xs = [], ys = [], zooms = [];
  for (const cue of cues) {
    for (const [, x, y] of cue.spots) { xs.push(x); ys.push(y); }
    zooms.push(...cue.zooms);
  }
  assert.ok(Math.min(...xs) >= -1 && Math.max(...xs) <= 1 && Math.min(...ys) >= -1 && Math.max(...ys) <= 1, "It stays inside its room");
  assert.ok(Math.min(...xs) < -0.6 && Math.max(...xs) > 0.6 && Math.min(...ys) < -0.5 && Math.max(...ys) > 0.5, "and uses all of it");
  assert.ok(Math.min(...zooms) >= ROAM.far && Math.max(...zooms) <= ROAM.near * 1.07 + 1e-9, "Nearer and farther stay within bounds");
  assert.ok(new Set(zooms.map((zoom) => zoom.toFixed(2))).size > 6, "It does not always stand equally near");
  const peeks = cues.filter((cue) => cue.kind === "peek");
  for (const peek of peeks) {
    const before = cues[cues.indexOf(peek) - 1].zooms.at(-1), after = cues[cues.indexOf(peek) + 1]?.zooms[0] ?? before;
    assert.ok(peek.zooms.every((zoom) => Math.abs(zoom - before * 1.07) < 1e-9) && after === before, "Leaning in for a look brings it nearer for that moment only");
  }
});

test("it keeps pointing at the microphone, calling out and nodding at it", () => {
  const { cues } = watch(600);
  const points = cues.filter((cue) => cue.kind === "point");
  // The longest turn and the longest rest can come between the moment a point is due and the point itself.
  [0, ...points.map((cue) => cue.at), 600].forEach((at, i, all) => { if (i) assert.ok(at - all[i - 1] < POINT_EVERY + 9, "The call to action is never long in coming"); });
  points.slice(1).forEach((cue, i) => assert.ok(cue.at - points[i].at > POINT_EVERY / 2, "but it does not point all the time"));
  const nodsOf = (cue) => cue.events.filter((event) => event[1] === "nod");
  for (const cue of points) {
    assert.deepEqual(cue.events[0].slice(1), ["sound", 1, "call"], "It calls out first");
    assert.ok(nodsOf(cue).length >= 1 && nodsOf(cue).length <= 2 && nodsOf(cue).every((event) => event[3] === "clink"), "then nods once or twice, with a clink");
    assert.ok(nodsOf(cue)[0][0] - cue.events[0][0] > 0.8, "once its call has been heard out");
  }
  assert.ok(points.some((cue) => nodsOf(cue).length === 1) && points.some((cue) => nodsOf(cue).length === 2));
});

test("a visitor who shows up is greeted, but not in the middle of a turn", () => {
  let asked = 0, greeted = 0;
  const { cues } = watch(240, {
    each(director, clock, seen) {
      // A pointer that moves every twenty seconds or so, whatever the mascot is doing.
      if (clock > 5 && Math.floor(clock / 20) > asked) {
        asked += 1;
        const during = seen.at(-1);
        director.notice();
        during.noticed = true;
      }
    },
  });
  for (const cue of cues.filter((item) => item.noticed)) {
    const next = cues[cues.indexOf(cue) + 1];
    if (!next) continue;
    if (cue.kind === "rest") { greeted += 1; assert.equal(next.mood, "startled", "At rest, it turns to the visitor at once"); assert.ok(cue.seconds < 3.45); }
    else assert.notEqual(next.mood, "startled", "A turn is finished first");
  }
  assert.ok(greeted >= 2, "The visits in this run meet it at rest more than once");
});

test("a degenerate source of chance cannot stall it", () => {
  for (const value of [0, 0.5, 0.999999]) {
    const director = createDirector({ random: () => value });
    director.greet();
    let moods = new Set();
    for (let frame = 0; frame < 60 * 120; frame += 1) moods.add(director.step(FRAME).mood);
    assert.ok(moods.size >= 3, "It still takes turns");
  }
  const director = createDirector({ random: chance() });
  const slow = director.step(5);
  assert.ok(slow.elapsed <= 0.05 + 1e-9 || slow.elapsed <= 5, "A late frame does not skip through the turns");
});
