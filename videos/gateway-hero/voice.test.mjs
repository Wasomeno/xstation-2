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

function browser({ resume, unsupported = false } = {}) {
  const microphones = [], health = [], sockets = [], contexts = [], sections = [];
  const button = Object.assign(new EventTarget(), {
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
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
    xstationShowSection(section) { sections.push(section); },
  });
  const document = new EventTarget();
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
    ui, microphones, health, sockets, contexts, sections, sandbox,
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
