import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("./voice.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace(/afterWelcome\(bindVoice\);\s*$/, "");
const flatSource = (await readFile(new URL("./voice-variant-1.js", import.meta.url), "utf8"))
  .replace("export default function", "function");
const smoothSource = (await readFile(new URL("./voice-variant-2.js", import.meta.url), "utf8"))
  .replace("export default function", "function");
const flush = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const emit = (target, type, data = {}) => target.dispatchEvent(Object.assign(new Event(type), data));
const microphone = () => {
  const track = Object.assign(new EventTarget(), { stopped: false, stop() { this.stopped = true; } });
  return { track, media: { getTracks: () => [track], getAudioTracks: () => [track] } };
};

function browser({ resume, unsupported = false, reducedMotion = false } = {}) {
  const microphones = [], health = [], sockets = [], contexts = [], sections = [], animations = [];
  const button = Object.assign(new EventTarget(), {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    animate(frames, options) {
      const animation = { frames, options, cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    },
  });
  const ui = {
    root: { hidden: true, dataset: { state: "idle" } }, button,
    status: { textContent: "" }, transcript: { textContent: "" },
    wave: { analyser: null, setAnalyser(node) { this.analyser = node; }, refresh() {} },
  };
  class Socket extends EventTarget {
    static OPEN = 1;
    readyState = 0;
    messages = [];
    constructor() { super(); sockets.push(this); }
    send(data) { this.messages.push(JSON.parse(data)); }
    close() { this.readyState = 3; emit(this, "close"); }
    open() { this.readyState = 1; emit(this, "open"); }
    message(data) { emit(this, "message", { data: JSON.stringify(data) }); }
  }
  const node = () => ({ connect() {}, disconnect() { this.disconnected = true; } });
  class Audio {
    state = "suspended";
    sampleRate = 24000;
    destination = {};
    constructor() { contexts.push(this); }
    async resume() { if (resume) await resume.promise; this.state = "running"; }
    async close() { this.state = "closed"; }
    createMediaStreamSource() { return node(); }
    createAnalyser() { return node(); }
    createScriptProcessor() { this.processor = node(); return this.processor; }
    createGain() { return { ...node(), gain: { value: 1 } }; }
  }
  const window = Object.assign(new EventTarget(), {
    AudioContext: unsupported ? undefined : Audio,
    xstationShowSection(section) { sections.push(section); return true; },
    matchMedia: () => ({ matches: reducedMotion }),
  });
  const document = Object.assign(new EventTarget(), { querySelector: () => null });
  const sandbox = vm.createContext({
    window, document, ui, Event, AbortController,
    navigator: { mediaDevices: unsupported ? undefined : { getUserMedia() {
      const request = deferred(); microphones.push(request); return request.promise;
    } } },
    fetch() { const request = deferred(); health.push(request); return request.promise; },
    WebSocket: Socket, AudioContext: unsupported ? undefined : Audio,
    VOICE_BOX_URL: "http://voice.test", VOICE_BOX_WS: "ws://voice.test",
    performance: { now: () => 1000 },
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  });
  vm.runInContext(`${source}\ncreateSurface = () => ui; bindVoice();`, sandbox);
  return {
    ui, microphones, health, sockets, contexts, sections, animations, sandbox,
    copy: vm.runInContext("COPY", sandbox),
    click: () => emit(button, "click"),
    escape: () => emit(document, "keydown", { key: "Escape" }),
    async connect() {
      this.click();
      const { track, media } = microphone();
      microphones.at(-1).resolve(media);
      health.at(-1).resolve({ ok: true });
      await flush();
      const socket = sockets.at(-1);
      socket.open();
      await flush();
      return { socket, track, context: contexts.at(-1) };
    },
  };
}

test("voice energy responds to waveform and frequency, with bounded output", () => {
  const { sandbox } = browser();
  assert.equal(vm.runInContext("typeof voiceEnergy", sandbox), "function");
  const energy = vm.runInContext("voiceEnergy", sandbox);
  const silence = new Uint8Array(256).fill(128);
  const low = new Uint8Array(256).fill(132);
  const loud = new Uint8Array(256).fill(200);
  const quietFreq = new Uint8Array(128);
  const loudFreq = new Uint8Array(128).fill(220);
  assert.equal(energy(silence, quietFreq), 0);
  assert.ok(energy(loud, quietFreq) > energy(low, quietFreq));
  assert.ok(energy(low, loudFreq) > energy(low, quietFreq));
  for (const waveform of [silence, low, loud, new Uint8Array(256).fill(255)]) {
    const value = energy(waveform, loudFreq);
    assert.ok(value >= 0 && value <= 1);
  }
});

test("energy smoothing attacks faster than release and is frame-rate independent", () => {
  const { sandbox } = browser();
  assert.equal(vm.runInContext("typeof smoothVoiceEnergy", sandbox), "function");
  const smooth = vm.runInContext("smoothVoiceEnergy", sandbox);
  assert.ok(smooth(0, 1, 0.02) > 1 - smooth(1, 0, 0.02));
  for (const [current, target] of [[0, 1], [1, 0]]) {
    assert.ok(Math.abs(smooth(current, target, 0.04) - smooth(smooth(current, target, 0.02), target, 0.02)) < 1e-10);
  }
});

test("all three variants preserve their visuals, react to audio, and respect reduced motion", () => {
  const render = (state, reduced = false, loud = false, variant = "2") => {
    let pixels, nextFrame, radius;
    const paths = [], fills = [];
    const surface = { dataset: { state, variant } };
    const ctx = {
      save() {}, restore() {}, translate() {}, beginPath() {}, clip() {}, arc(x, y, value) { radius = value; },
      fillRect() {}, clearRect() { paths.length = 0; fills.length = 0; },
      moveTo(...point) { paths.push(point); }, lineTo(...point) { paths.push(point); },
      closePath() {}, fill() { fills.push(this.fillStyle); },
      rotate(angle) { paths.push(["rotate", angle]); }, setTransform() {}, drawImage() {},
      stroke() { assert.fail("Voice visuals should not draw state rings"); },
      createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData(image) { pixels = image.data.slice(); },
    };
    const canvas = { clientWidth: 88, getContext: () => ctx, closest: () => surface };
    const document = Object.assign(new EventTarget(), { createElement: () => ({ getContext: () => ctx }) });
    const window = Object.assign(new EventTarget(), {
      matchMedia: () => Object.assign(new EventTarget(), { matches: reduced }),
    });
    const colors = { "--deep-forest": "#083B28", "--signal": "#1C855C", "--sage": "#90B0A0", "--mist": "#C8D8C8" };
    const sandbox = vm.createContext({
      window, document, canvas,
      getComputedStyle: () => ({ getPropertyValue: (name) => colors[name] }),
      performance: { now: () => 1000 }, cancelAnimationFrame() {},
      requestAnimationFrame(callback) { assert.equal(reduced, false); nextFrame = callback; return 1; },
    });
    const wave = vm.runInContext(`${flatSource}\n${smoothSource}\n${source}\ncreateWaveform(canvas);`, sandbox);
    wave.setAnalyser({
      frequencyBinCount: 128, fftSize: 256,
      getByteTimeDomainData(data) { data.fill(loud ? 148 : 128); },
      getByteFrequencyData(data) { data.fill(loud ? 180 : 0); },
    });
    for (let i = 1; i <= 30 && nextFrame; i++) nextFrame(1000 + i * 34);
    if (variant === "3") {
      assert.ok(paths.length > 0, "Variant 3 restores the earlier layered contours");
      assert.equal(fills.length, 3);
      assert.ok(fills.every((fill) => Object.values(colors).includes(fill)));
      return { paths: paths.slice(), radius };
    }
    assert.ok(pixels?.length, "Render a continuous fluid color field");
    const flatColors = new Set(["8,59,40", "28,133,92", "144,176,160", "200,216,200"]);
    if (variant === "1") {
      for (let i = 0; i < pixels.length; i += 4) {
        assert.ok(flatColors.has(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`), "Variant 1 preserves solid colors");
      }
    } else {
      const alphas = pixels.filter((_, i) => i % 4 === 3);
      assert.ok(alphas.every((alpha) => alpha === 255), "Variant 2 restores the filled circular fluid surface");
      const blendedColors = new Set();
      for (let i = 0; i < pixels.length; i += 4) blendedColors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      assert.ok(blendedColors.size > 4, "Variant 2 restores smooth color transitions");
    }
    return pixels;
  };
  for (const variant of ["1", "2", "3"]) {
    const idle = render("idle", false, false, variant);
    const hearing = render("listening", false, false, variant);
    assert.notDeepEqual(idle, hearing);
    if (variant === "3") {
      assert.equal(idle.radius, 24);
      assert.ok(hearing.radius > 33 && hearing.radius <= 34);
    }
    assert.notDeepEqual(hearing, render("listening", false, true, variant));
    assert.notDeepEqual(hearing, render("thinking", false, false, variant));
    assert.deepEqual(render("listening", true, false, variant), render("listening", true, true, variant));
  }
});

test("a second click cancels a connecting attempt and closes its late microphone", async () => {
  const h = browser();
  h.click();
  assert.equal(h.ui.root.dataset.state, "connecting");
  assert.equal(h.ui.button.attributes["aria-pressed"], "true");
  assert.equal(h.ui.button.attributes["aria-label"], h.copy.cancel);
  h.click();
  assert.equal(h.microphones.length, 1);
  assert.equal(h.ui.root.dataset.state, "idle");
  const { track, media } = microphone();
  h.microphones[0].resolve(media);
  h.health[0].resolve({ ok: true });
  await flush();
  assert.equal(track.stopped, true);
  assert.equal(h.sockets.length, 0);
});

test("listening waits for both backend ready and audio capture readiness", async () => {
  for (const backendFirst of [false, true]) {
    const resume = deferred();
    const h = browser({ resume });
    const { socket } = await h.connect();
    assert.equal(h.ui.root.dataset.state, "connecting");
    if (backendFirst) socket.message({ type: "ready" });
    else { resume.resolve(); await flush(); }
    assert.equal(h.ui.root.dataset.state, "connecting");
    if (backendFirst) { resume.resolve(); await flush(); }
    else socket.message({ type: "ready" });
    assert.equal(h.ui.root.dataset.state, "listening");
    assert.equal(h.ui.status.textContent, h.copy.listening);
    h.click();
  }
});

test("Escape stops capture and stale socket callbacks cannot revive a session", async () => {
  const h = browser();
  const first = await h.connect();
  first.socket.message({ type: "ready" });
  h.escape();
  assert.equal(h.ui.root.dataset.state, "idle");
  assert.equal(first.track.stopped, true);
  assert.equal(first.context.state, "closed");
  assert.equal(first.context.processor.disconnected, true);
  assert.equal(first.socket.readyState, 3);
  assert.equal(h.ui.wave.analyser, null);
  h.click();
  first.socket.message({ type: "ready" });
  first.socket.message({ type: "error" });
  first.socket.message({ type: "decision", action: "show", section: "stale" });
  emit(first.socket, "error");
  assert.equal(h.ui.root.dataset.state, "connecting");
  assert.deepEqual(h.sections, []);
  h.click();
});

test("backend errors tear down microphone, socket, and audio context", async () => {
  const h = browser();
  const { socket, track, context } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "error" });
  assert.equal(h.ui.root.dataset.state, "deaf");
  assert.equal(h.ui.button.attributes["aria-pressed"], "false");
  assert.equal(track.stopped, true);
  assert.equal(context.state, "closed");
  assert.equal(socket.readyState, 3);
  assert.equal(h.ui.wave.analyser, null);
});

test("failed health stops a microphone that resolves after the error", async () => {
  const h = browser();
  h.click();
  h.health[0].resolve({ ok: false });
  await flush();
  assert.equal(h.ui.root.dataset.state, "deaf");
  const { track, media } = microphone();
  h.microphones[0].resolve(media);
  await flush();
  assert.equal(track.stopped, true);
  assert.equal(h.sockets.length, 0);
});

test("a microphone obtained while health is pending stops immediately on Escape", async () => {
  const h = browser();
  h.click();
  const { track, media } = microphone();
  h.microphones[0].resolve(media);
  await flush();
  h.escape();
  assert.equal(track.stopped, true);
  assert.equal(h.ui.root.dataset.state, "idle");
});

test("AudioContext resume rejection cleans up the entire session", async () => {
  const resume = deferred();
  const h = browser({ resume });
  const { socket, track, context } = await h.connect();
  resume.reject(new Error("audio blocked"));
  await flush();
  assert.equal(h.ui.root.dataset.state, "deaf");
  assert.equal(track.stopped, true);
  assert.equal(context.state, "closed");
  assert.equal(socket.readyState, 3);
});

test("denied and unsupported microphones show an inactive actionable error", async () => {
  const denied = browser();
  denied.click();
  denied.microphones[0].reject(new Error("NotAllowedError"));
  await flush();
  assert.equal(denied.ui.root.dataset.state, "blocked");
  assert.equal(denied.ui.status.textContent, denied.copy.blocked);
  assert.equal(denied.ui.button.attributes["aria-pressed"], "false");
  const unsupported = browser({ unsupported: true });
  unsupported.click();
  assert.equal(unsupported.ui.status.textContent, unsupported.copy.unsupported);
  assert.equal(unsupported.ui.button.attributes["aria-pressed"], "false");
  assert.equal(unsupported.microphones.length, 0);
});

test("a cancelled startup cannot stop or replace a newer session", async () => {
  const h = browser();
  h.click();
  h.click();
  const current = await h.connect();
  current.socket.message({ type: "ready" });
  const stale = microphone();
  h.microphones[0].resolve(stale.media);
  h.health[0].resolve({ ok: false });
  await flush();
  assert.equal(stale.track.stopped, true);
  assert.equal(current.track.stopped, false);
  assert.equal(h.sockets.length, 1);
  assert.equal(h.ui.root.dataset.state, "listening");
  h.click();
});

test("protocol keeps transcripts in listening, navigates decisions, and sends PCM audio", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "delta", text: "buka proyek" });
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(h.ui.transcript.textContent, "buka proyek");
  socket.message({ type: "final", text: "buka proyek" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "decision", action: "show", section: "projects" });
  assert.deepEqual(h.sections, ["projects"]);
  assert.equal(h.ui.root.dataset.state, "listening");
  context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array([0, 0.5, -0.5]) } });
  assert.deepEqual(socket.messages.at(-1), { type: "audio", pcm: "AAD/PwDA" });
  socket.message({ type: "final" });
  socket.message({ type: "noop" });
  assert.equal(h.ui.root.dataset.state, "listening");
  h.click();
  assert.deepEqual(socket.messages.at(-1), { type: "stop" });
});

test("new speech keeps its transcript and ignores a previous turn's late navigation", async () => {
  const h = browser();
  const { socket } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "speech_started", item_id: "first" });
  socket.message({ type: "final", item_id: "first" });
  socket.message({ type: "speech_started", item_id: "second" });
  socket.message({ type: "delta", item_id: "second", text: "bukan, buka Arkiv" });
  socket.message({ type: "decision", item_id: "first", action: "show", section: "hero" });
  socket.message({ type: "final", item_id: "first" });
  assert.deepEqual(h.sections, []);
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(h.ui.transcript.textContent, "bukan, buka Arkiv");
  socket.message({ type: "speech_stopped", item_id: "second" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "decision", item_id: "second", action: "show", section: "arkiv" });
  assert.deepEqual(h.sections, ["arkiv"]);
  assert.equal(h.ui.root.dataset.state, "listening");
  h.escape();
});

test("recoverable turn errors keep the microphone and next command available", async () => {
  const h = browser();
  const { socket, track, context } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "final" });
  socket.message({ type: "error", recoverable: true });
  assert.equal(track.stopped, false);
  assert.equal(context.state, "running");
  assert.equal(h.ui.root.dataset.state, "listening");
  socket.message({ type: "delta", text: "buka Arkiv" });
  assert.equal(h.ui.transcript.textContent, "buka Arkiv");
  h.escape();
});

test("microphone noise during processing does not discard a valid CoDev decision", async () => {
  const h = browser();
  const { socket, context, track } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "speech_started", item_id: "codev-request" });
  socket.message({ type: "delta", item_id: "codev-request", text: "CoDev" });
  socket.message({ type: "final", item_id: "codev-request", transcript: "CoDev" });
  const noise = Float32Array.from({ length: 4096 }, (_, i) => i % 2 ? 0.018 : -0.018);
  context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => noise } });
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "decision", item_id: "codev-request", action: "show", section: "codev" });
  assert.deepEqual(h.sections, ["codev"]);
  assert.equal(track.stopped, false);
  h.escape();
});

test("short quiet commands and transcript-only speech finish once after a natural pause", () => {
  const { sandbox } = browser();
  const create = vm.runInContext("createPauseDetector", sandbox);
  const pause = create();
  const quiet = new Float32Array(4096);
  const speech = new Float32Array(4096).fill(0.018);
  assert.equal(pause.update(quiet, 1000), null);
  assert.equal(pause.update(speech, 1170), "start");
  assert.equal(pause.update(quiet, 1870), null);
  assert.equal(pause.update(quiet, 2370), "commit");
  assert.equal(pause.update(quiet, 3700), null);
  pause.transcript(4000);
  assert.equal(pause.update(quiet, 4500), null);
  pause.transcript(4600);
  assert.equal(pause.update(quiet, 5100), null);
  assert.equal(pause.update(quiet, 5800), "commit");
  assert.equal(pause.update(quiet, 7000), null);
  pause.transcript(7200);
  pause.reset();
  assert.equal(pause.update(quiet, 9000), null);
});

test("background noise and trailing captions cannot keep a finished foreground command open", () => {
  const create = vm.runInContext("createPauseDetector", browser().sandbox);
  const pause = create();
  const frame = level => Float32Array.from({ length: 4096 }, (_, i) => i % 2 ? level : -level);
  for (let now = 1000; now <= 3000; now += 100) {
    pause.update(frame(0.1), now);
    pause.transcript(now);
  }
  let committedAt;
  for (let now = 3100; now <= 5000; now += 100) {
    pause.transcript(now); // Distant conversation continues generating captions.
    if (pause.update(frame(0.024), now) === "commit") {
      committedAt = now;
      break;
    }
  }
  assert.ok(committedAt >= 4000 && committedAt <= 4300, `Expected a natural pause, got ${committedAt}`);
  pause.reset();
  for (let now = 5100; now <= 8000; now += 100) {
    assert.equal(pause.update(frame(0.024), now), null, "Learned room noise should stay idle");
  }
});

test("a long foreground sentence and brief pauses are not cut by a fixed timeout", () => {
  const create = vm.runInContext("createPauseDetector", browser().sandbox);
  const pause = create();
  for (let now = 1000; now <= 9000; now += 100) {
    const level = now >= 4000 && now <= 4500 ? 0.02 : [0.07, 0.1, 0.06][now / 100 % 3];
    assert.notEqual(pause.update(new Float32Array(4096).fill(level), now), "commit");
    pause.transcript(now);
  }
});

test("late captions cannot reopen a turn that was already submitted", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "speech_started", item_id: "A" });
  const frame = (level, now) => {
    h.sandbox.performance.now = () => now;
    context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
  };
  frame(0.1, 1000);
  socket.message({ type: "delta", item_id: "A", text: "Buka CoDev" });
  for (let now = 1100; now <= 2200; now += 100) frame(0.02, now);
  assert.ok(socket.messages.some(message => message.type === "commit"));
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "delta", item_id: "A", text: "Buka CoDev suara latar" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "speech_started", item_id: "B" });
  socket.message({ type: "delta", item_id: "B", text: "Sekarang Arkiv" });
  assert.equal(h.ui.transcript.textContent, "Sekarang Arkiv");
  h.escape();
});

test("unmatched commands shake once, successful navigation and idle silence do not", async () => {
  const h = browser();
  const { socket, track } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "noop" });
  assert.equal(h.animations.length, 0);
  socket.message({ type: "decision", action: "clarify", hypotheses: [] });
  assert.equal(h.animations.length, 1);
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(track.stopped, false);
  socket.message({ type: "decision", action: "noop" });
  assert.equal(h.animations.length, 2);
  assert.equal(h.animations[0].cancelled, true);
  socket.message({ type: "decision", action: "show", section: "codev" });
  assert.equal(h.animations.length, 2);
  socket.message({ type: "final" });
  socket.message({ type: "noop" });
  assert.equal(h.animations.length, 3);
  h.escape();
  assert.equal(h.animations.at(-1).cancelled, true);
  const reduced = browser({ reducedMotion: true });
  const r = await reduced.connect();
  r.socket.message({ type: "ready" });
  r.socket.message({ type: "decision", action: "noop" });
  assert.equal(reduced.animations.length, 0);
  assert.match(reduced.ui.status.textContent, /belum ditemukan/i);
  reduced.escape();
});

test("voice navigation starts at the project list and centers individual content in smooth and native scrolling", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  for (const height of [400, 1200]) {
    for (const smooth of [true, false]) {
      let target, options;
      const element = {
        getBoundingClientRect: () => ({ height }),
        scrollIntoView(value) { target = this; options = value; },
        classList: { add() {}, remove() {} },
      };
      const sandbox = vm.createContext({
        reduce: !smooth,
        smoothInstance: smooth ? { scrollTo(node, value) { target = node; options = value; } } : null,
        window: { innerHeight: 800, clearTimeout() {}, setTimeout() {} },
        document: { getElementById: id => ['codev', 'work'].includes(id) ? element : null, querySelectorAll: () => [] },
      });
      const show = vm.runInContext(`${navigation}\nshowSection`, sandbox);
      assert.equal(show('codev'), true);
      assert.equal(target, element);
      if (smooth) assert.equal(options.offset, (height - 800) / 2);
      else { assert.equal(options.block, 'center'); assert.equal(options.behavior, 'auto'); }
      assert.equal(show('work'), true);
      assert.equal(target, element);
      if (smooth) assert.equal(options.offset, 0);
      else { assert.equal(options.block, 'start'); assert.equal(options.behavior, 'auto'); }
      assert.equal(show('unknown'), false);
    }
  }
});
