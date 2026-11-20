import assert from "node:assert/strict";
import test from "node:test";
import { createWakeLog } from "./voice-wake-log.js";

// A monitor that writes into lists here: its console lines, and the readout it would put on screen.
function monitor(look = {}) {
  const lines = [], ticks = [], panel = { style: {}, attributes: {}, isConnected: false, textContent: "", setAttribute(name, value) { this.attributes[name] = value; } };
  let now = 0;
  const doc = { body: { append(node) { node.isConnected = true; } }, createElement: () => panel };
  const log = createWakeLog({ enabled: true, doc, out: { info: (line) => lines.push(line) }, clock: () => now, time: () => "12:00:00", every: (fn) => { ticks.push(fn); return 1; } });
  log.watch(() => ({ state: "armed", hidden: false, audio: "running", isolated: true, backlog: 0, ...look }));
  return {
    log, lines, panel,
    // A quarter of a second goes by: the readout is drawn again.
    tick(times = 1) { for (let i = 0; i < times; i += 1) { now += 250; ticks[0](); } },
    // One block of audio as loud as `level` (0 to 1) arrives from the microphone.
    hear(level, fed = true) { log.audio(new Float32Array(4096).map((_, i) => Math.sin(i / 3) * level), 48000, fed); },
  };
}

test("without the parameter the monitor does nothing and costs nothing", () => {
  const touched = [];
  const log = createWakeLog({ enabled: false, doc: { get body() { touched.push("screen"); return null; } }, out: { info: () => touched.push("console") }, every: () => touched.push("timer") });
  assert.equal(log.on, false);
  for (const name of ["note", "state", "microphone", "detector", "audio", "processed", "wake", "problem", "sound", "watch"]) log[name]("x", "y", "z");
  assert.deepEqual(touched, []);
});

test("it writes each step of the listener to the console", () => {
  const { log, lines } = monitor();
  log.state("loading", "armed", "Ucapkan “Hei Nadi”");
  log.microphone({ label: "Booth microphone", muted: false, getSettings: () => ({ sampleRate: 48000, echoCancellation: true, noiseSuppression: false }) }, { sampleRate: 44100 });
  log.detector("ready, loaded in 1.2 s");
  log.wake("Hei Nadi", true);
  log.wake("Hei Nadi", false, "the listener is paused");
  log.problem("detector", new Error("Keyword model initialization failed"));
  const text = lines.join("\n");
  assert.match(lines[0], /^\[wake 0\.0s\] wake log on$/);
  assert.match(text, /state loading -> armed \("Ucapkan “Hei Nadi”"\): listening for "Hei Nadi"/);
  assert.match(text, /microphone: Booth microphone, 48000 Hz in, 44100 Hz graph, echo cancel on, noise suppression off, auto gain \?/, "It names the device and what the browser does to its sound");
  assert.match(text, /detector: ready, loaded in 1\.2 s/);
  assert.match(text, /HEARD "Hei Nadi": starting a conversation/);
  assert.match(text, /heard "Hei Nadi" but did not start: the listener is paused/);
  assert.match(text, /PROBLEM detector: Keyword model initialization failed/, "A failure is written out, not only shown as a state");
});

test("the readout shows the state, how loud the microphone is, and whether the detector is fed", () => {
  const { log, panel, tick, hear } = monitor();
  log.detector("ready, loaded in 0.5 s");
  for (let i = 0; i < 3; i += 1) hear(0.1);
  tick();
  assert.match(panel.textContent, /state +armed: listening for "Hei Nadi"/);
  assert.match(panel.textContent, /page +visible, audio running, isolated/);
  assert.match(panel.textContent, /level .* -23 dB, peak -20 dB/, "A tenth of full scale is 20 dB down at its peak");
  assert.match(panel.textContent, /detector +ready, loaded in 0\.5 s; fed 1\.02 s of audio a second, 0\.00 s waiting/);
  assert.match(panel.textContent, /heard +0 x "Hei Nadi"/);
  log.wake("Hei Nadi", true);
  tick();
  assert.match(panel.textContent, /heard +1 x "Hei Nadi", last at 12:00:00/);
  assert.match(panel.textContent, /NO AUDIO is arriving from the microphone/, "A quarter of a second without a block of audio shows at once");
});

test("the readout says why the wake word is not being listened for", () => {
  const talking = monitor({ state: "listening" });
  talking.hear(0.1, false); talking.tick();
  assert.match(talking.panel.textContent, /state +listening: in a conversation: the wake word is not listened for/);
  assert.match(talking.panel.textContent, /not fed \(see state\)/);
  const hidden = monitor({ state: "paused", hidden: true, audio: "suspended", status: "Mikrofon dijeda" });
  hidden.tick();
  assert.match(hidden.panel.textContent, /state +paused: paused: this tab is hidden\n +"Mikrofon dijeda"/);
  assert.match(hidden.panel.textContent, /page +hidden, audio suspended/);
  const open = monitor({ state: "blocked", isolated: false });
  open.tick();
  assert.match(open.panel.textContent, /NOT isolated \(no local detector\)/);
});

test("a microphone that picks up next to nothing is pointed out after ten seconds", () => {
  const { panel, tick, hear } = monitor();
  for (let i = 0; i < 39; i += 1) { hear(0.0005); tick(); }
  assert.doesNotMatch(panel.textContent, /silence for ten seconds/, "A pause in a quiet room is nothing unusual");
  hear(0.0005); tick();
  assert.match(panel.textContent, /silence for ten seconds: if someone is speaking, check the input device/);
  hear(0.2); tick();
  assert.doesNotMatch(panel.textContent, /silence for ten seconds/, "A voice clears it");
});

test("every five seconds one console line sums up what was heard, fed and worked through", () => {
  const { log, lines, tick, hear } = monitor({ backlog: 0.25 });
  for (let i = 0; i < 20; i += 1) { hear(0.1, i < 10); log.processed(0.05); tick(); }
  const summary = lines.at(-1);
  assert.match(summary, /^\[wake 5\.0s\] armed \| mic -23 dB, peak -20 dB \| heard 1\.7 s, fed to the detector 0\.9 s, worked through 1\.0 s, waiting 0\.25 s \| mascot sounds 0 \| "Hei Nadi" 0 x$/);
  const before = lines.length;
  tick(19);
  assert.equal(lines.length, before, "Nothing between two summaries");
  tick();
  assert.match(lines.at(-1), /armed \| no audio has arrived from the microphone for five seconds/);
});

test("the mascot's own sounds are shown, since the microphone hears them too", () => {
  const { log, lines, panel, tick, hear } = monitor();
  hear(0.1); tick();
  assert.match(panel.textContent, /mascot +no sound yet/);
  log.sound("chirp"); hear(0.1); tick(2);
  assert.match(panel.textContent, /mascot +"chirp" 0\.5 s ago/);
  log.sound("plip", false);
  for (let i = 0; i < 17; i += 1) { hear(0.1); tick(); }
  assert.match(panel.textContent, /mascot +silenced \(mascotSound=0\), would have made "plip"/);
  assert.match(lines.at(-1), /mascot sounds 2 \(silenced\)/, "The summary counts them");
});

test("on a deployed site nothing of it shows on the screen, while the console still gets its lines", () => {
  const lines = [], ticks = [];
  let made = 0, now = 0;
  const doc = { body: { append() { made += 1; } }, createElement() { made += 1; return { style: {}, setAttribute() {} }; } };
  const log = createWakeLog({ enabled: true, panel: false, doc, out: { info: (line) => lines.push(line) }, clock: () => now, time: () => "12:00:00", every: (fn) => ticks.push(fn) });
  log.watch(() => ({ state: "armed", audio: "running" }));
  log.wake("Hei Nadi", true);
  for (let i = 0; i < 20; i += 1) { log.audio(new Float32Array(4096).fill(0.1), 48000, true); now += 250; ticks[0](); }
  assert.equal(made, 0, "No readout is made, let alone shown");
  assert.match(lines.join("\n"), /HEARD "Hei Nadi"/);
  assert.match(lines.at(-1), /armed \| mic -20 dB/);
});
