import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("./voice.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace(/^const WAKE_WORKER_URL = .*;\n/gm, "")
  .replace(/^bindVoice\(\);[\s\S]*$/m, "");
const flush = () => new Promise(setImmediate);
test("voice endpoints use the production proxy and preserve local preview and tunnel overrides", async () => {
  const config = (await readFile(new URL("./voice-config.js", import.meta.url), "utf8")).replace(/export /g, "");
  for (const [page, expected] of [
    ["https://nadi.dotploy.my.id/", "https://nadi.dotploy.my.id/voice"],
    ["https://nadi.example/", "https://nadi.example/voice"],
    ["https://nadi.example/products/", "https://nadi.example/voice"],
    ["http://127.0.0.1:4174/", "http://127.0.0.1:4175"],
    ["http://localhost:4174/", "http://127.0.0.1:4175"],
    ["http://localhost:8080/", "http://localhost:8080/voice"],
    ["https://nadi.example/?box=https://tunnel.example/", "https://tunnel.example"],
  ]) {
    const result = vm.runInNewContext(`${config}; [VOICE_BOX_URL, VOICE_BOX_WS]`, {
      window: { location: new URL(page) }, URLSearchParams,
    });
    assert.equal(result[0], expected);
    assert.equal(result[1], `${expected.replace(/^http/, "ws")}/v1/stream`);
  }
});
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

function browser({ resume, unsupported = false, reducedMotion = false, search = "?voice=1", agentId = "" } = {}) {
  const workers = [], timers = new Map();
  let clock = 1000, timerId = 0;
  const microphones = [], health = [], sockets = [], contexts = [], sections = [], animations = [], stateSounds = [], agentSessions = [], pageActions = [];
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
    wave: { analyser: null, output: null, setAnalyser(node) { this.analyser = node; }, setOutput(level) { this.output = level; }, refresh() {} },
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
  const node = () => ({ connections: [], connect(target) { this.connections.push(target); }, disconnect() { this.disconnected = true; } });
  class Audio extends EventTarget {
    state = "suspended";
    sampleRate = 24000;
    destination = {};
    constructor() { super(); contexts.push(this); }
    async resume() { if (resume) await resume.promise; this.state = "running"; }
    async suspend() { this.state = "suspended"; }
    async close() { this.state = "closed"; }
    createMediaStreamSource() { this.source = node(); return this.source; }
    createBiquadFilter() { this.filter = { ...node(), frequency: { value: 350 }, Q: { value: 1 } }; return this.filter; }
    createAnalyser() { return node(); }
    createScriptProcessor() { this.processor = node(); return this.processor; }
    createGain() { return { ...node(), gain: { value: 1 } }; }
  }
  const window = Object.assign(new EventTarget(), {
    location: { search },
    crossOriginIsolated: true,
    AudioContext: unsupported ? undefined : Audio,
    xstationShowSection(section) { sections.push(section); return true; },
    ...(agentId ? { xstationPageAction(decision) { pageActions.push({ ...decision }); return decision.action !== "back"; } } : {}),
    matchMedia: (query) => ({ matches: query.includes("prefers-reduced-motion") ? reducedMotion : true }),
  });
  const document = Object.assign(new EventTarget(), { querySelector: () => null });
  const sandbox = vm.createContext({
    window, document, ui, stateSounds, Event, AbortController, URLSearchParams,
    CustomEvent: class extends Event { constructor(type, init) { super(type); this.detail = init.detail; } },
    Worker: class extends EventTarget {
      messages = [];
      constructor() { super(); workers.push(this); }
      postMessage(message) { this.messages.push(message); }
      terminate() { this.terminated = true; }
      message(data) { emit(this, "message", { data }); }
    },
    setTimeout(fn, ms) { const id = ++timerId; timers.set(id, { fn, at: clock + ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    WAKE_WORKER_URL: "wake-worker.js",

    navigator: { mediaDevices: unsupported ? undefined : { getUserMedia(constraints) {
      const request = deferred(); request.constraints = constraints; microphones.push(request); return request.promise;
    } } },
    fetch() { const request = deferred(); health.push(request); return request.promise; },
    WebSocket: Socket, AudioContext: unsupported ? undefined : Audio,
    VOICE_BOX_URL: "http://voice.test", VOICE_BOX_WS: "ws://voice.test", VOICE_AGENT_ID: agentId,
    console: { warn() {} },
    agentSdk: { Conversation: { startSession(options) {
      const session = { options, ended: 0, volume: 0, endSession() { this.ended += 1; return Promise.resolve(); }, getOutputVolume() { return this.volume; } };
      agentSessions.push(session);
      return Promise.resolve(session);
    } } },
    performance: { now: () => clock },
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
  });
  vm.runInContext(`${source}\ncreateSurface = () => ui; createStateSound = () => state => stateSounds.push(state); loadAgentSdk = () => Promise.resolve(agentSdk); bindVoice();`, sandbox);
  return {
    ui, microphones, health, sockets, contexts, sections, animations, stateSounds, sandbox, workers, agentSessions, pageActions,
    tick(ms) { clock += ms; for (const [id, timer] of [...timers]) if (timer.at <= clock && timers.delete(id)) timer.fn(); },
    hide(hidden) { document.hidden = hidden; emit(document, "visibilitychange"); },
    audio(value = 0) { contexts.at(-1).processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(value) } }); },
    wake(phrase = "Hei Nadi") { const worker = workers.at(-1); const reset = worker.messages.filter(m => m.type === "reset").at(-1); worker.message({ type: "wake", phrase, epoch: reset.epoch }); },
    async enable() {
      this.click();
      const mic = microphone(); microphones.at(-1).resolve(mic.media);
      await flush(); workers.at(-1).message({ type: "ready" }); await flush();
      return { track: mic.track, context: contexts.at(-1) };
    },
    copy: vm.runInContext("COPY", sandbox),
    click: () => emit(button, "click"),
    escape: () => emit(document, "keydown", { key: "Escape" }),
    async connect() {
      const result = await this.enable();
      await flush(); const socket = sockets.at(-1); socket.open(); socket.message({ type: "ready" });
      return { ...result, socket };
    },
  };
}

test("voice agent only initializes with an explicit voice=1 query parameter", () => {
  for (const [search, hidden] of [
    ["", true], ["?voice", true], ["?voice=0", true], ["?voice=false", true],
    ["?box=https://voice.test", true], ["?voice=1", false], ["?other=value&voice=1", false],
  ]) {
    const h = browser({ search });
    assert.equal(h.ui.root.hidden, hidden, search);
    if (h.ui.root.hidden) {
      vm.runInContext("bindVoice()", h.sandbox);
      assert.equal(h.ui.root.hidden, true, "A later desktop initialization must also stay hidden");
      h.click();
      assert.equal(h.microphones.length, 0);
      assert.equal(h.workers.length, 0);
    }
  }
});

test("the voice level follows the microphone while listening and the agent's playback while it speaks", () => {
  const meter = vm.runInContext("createVoiceLevel()", browser().sandbox);
  let loud = true;
  const analyser = {
    frequencyBinCount: 128, fftSize: 256,
    getByteTimeDomainData(data) { assert.equal(data.length, 256); data.fill(loud ? 148 : 128); },
    getByteFrequencyData(data) { assert.equal(data.length, 128); data.fill(loud ? 180 : 0); },
  };
  const settle = (state, frames = 120) => { let level = 0; for (let i = 0; i < frames; i += 1) level = meter.update(1 / 60, state); return level; };
  assert.equal(settle("listening"), 0, "Without a microphone there is nothing to hear");
  meter.setAnalyser(analyser);
  const first = meter.update(1 / 60, "listening");
  assert.ok(first > 0 && first < 0.3, "A voice comes in over a few frames, not at once");
  const heard = settle("listening");
  assert.ok(heard > 0.6 && heard <= 1, "A loud visitor is a high level");
  assert.equal(meter.level(), heard, "The stage reads the same level the mascot was given");
  assert.ok(settle("thinking") < 0.01 && settle("armed") < 0.01, "The microphone only counts while it listens");
  loud = false;
  settle("listening", 30);
  assert.ok(meter.level() < 0.05, "A quiet room is a level near zero");
  loud = true;
  settle("listening");
  assert.equal(meter.update(1 / 60, "deaf"), 0, "A mascot that cannot hear shows no level at all");
  settle("listening");
  meter.setAnalyser(null);
  assert.equal(meter.level(), 0, "Losing the microphone drops the level");

  let volume = 0.8;
  meter.setOutput(() => volume);
  assert.ok(settle("listening") < 0.01, "The agent's playback is not the visitor's voice");
  const spoken = settle("speaking");
  assert.ok(Math.abs(spoken - 0.8 ** 0.65) < 0.01, "While it speaks the level is its own voice");
  volume = 7;
  assert.ok(settle("speaking") <= 1, "A level stays within bounds");
  meter.setOutput(() => { throw new Error("no audio"); });
  assert.throws(() => meter.update(1 / 60, "speaking"), "The caller guards a playback meter that can fail");
  meter.setOutput(() => "loud");
  assert.ok(settle("speaking") < 0.01, "A reading that is not a number is silence");
  meter.setOutput(null);
  assert.ok(settle("speaking") < 0.01);
});

test("voice navigation starts at the project list and centers individual content in smooth and native scrolling", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  for (const height of [400, 1200]) {
    for (const smooth of [true, false]) {
      let target, options;
      const element = {
        getBoundingClientRect: () => ({ height, top: 500 }),
        classList: { add() {}, remove() {} },
      };
      const sandbox = vm.createContext({
        reduce: !smooth,
        smoothInstance: smooth ? { scrollTo(node, value) { target = node; options = value; } } : null,
        window: { innerHeight: 800, scrollY: 1000, scrollTo(value) { options = value; }, clearTimeout() {}, setTimeout() {} },
        document: { getElementById: id => id === 'site-nav' ? { getBoundingClientRect: () => ({ height: 72 }) } : ['codev', 'work', 'hero'].includes(id) ? element : null, querySelectorAll: () => [] },
      });
      const show = vm.runInContext(`${navigation}\nshowSection`, sandbox);
      assert.equal(show('codev'), true);
 if (smooth) { assert.equal(target, element); assert.equal(options.offset, -(72 + Math.max(0, (800 - 72 - height) / 2))); }
 else { assert.equal(options.top, 1500 - (72 + Math.max(0, (800 - 72 - height) / 2))); assert.equal(options.behavior, 'auto'); }
      assert.equal(show('work'), true);
      if (smooth) { assert.equal(target, element); assert.equal(options.offset, -88); }
      else { assert.equal(options.top, 1412); assert.equal(options.behavior, 'auto'); }
      assert.equal(show('root'), true);
      if (smooth) assert.equal(options.offset, 0);
      else assert.equal(options.top, 1500);
      assert.equal(show('unknown'), false);
    }
  }
});

test("voice scroll commands use page bounds, smooth scrolling and Back history", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  for (const smooth of [false, true]) {
    const dialog = { open: true, close() { this.open = false; } };
    let options;
    const window = { innerHeight: 800, scrollY: 1000, scrollTo(value) { options = value; this.scrollY = value.top; } };
    const sandbox = vm.createContext({ window, reduce: !smooth,
      document: { documentElement: { scrollHeight: 4000 }, getElementById: () => dialog },
      smoothInstance: smooth ? { scrollTo(top, value) { options = value; window.scrollY = top; } } : null,
    });
    vm.runInContext(navigation, sandbox);
    const action = vm.runInContext('runPageAction', sandbox);
    for (const [command, top] of [['scroll_down', 1640], ['scroll_up', 1000], ['scroll_top', 0], ['scroll_bottom', 3200]]) {
      assert.equal(action({ action: command }), true);
      assert.equal(window.scrollY, top);
      assert.equal(dialog.open, false, 'Scrolling closes an open demo');
      assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).top', sandbox), top);
      assert.equal(smooth ? options.duration : options.behavior, smooth ? 1.15 : 'auto');
    }
    assert.equal(action({ action: 'scroll_down' }), false, 'Bottom cannot overscroll');
    assert.equal(action({ action: 'back' }), true);
    assert.equal(window.scrollY, 0, 'Back restores the position before scrolling to bottom');
    assert.equal(action({ action: 'scroll_up' }), false, 'Top cannot overscroll');
    assert.equal(action({ action: 'scroll_diagonal' }), false);
    action({ action: 'scroll_down' });
    assert.equal(window.scrollY, 640);
    assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).top', sandbox), 640, 'New movement replaces forward history');
  }
});

test("voice demo controls reuse page triggers and only control an open demo", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  const dialog = { open: false, close() { this.open = false; } };
  let played = 0, paused = 0, selected;
  const video = { currentTime: 15, play() { played++; return Promise.resolve(); }, pause() { paused++; } };
  const elements = {
    'project-demo-dialog': dialog, 'project-demo-video': video,
    bikinkonten: { querySelector: () => ({ click() { selected = 'bikinkonten'; dialog.open = true; } }) },
    lubna: { querySelector: () => ({ click() { selected = 'lubna'; dialog.open = true; } }) },
    codev: { querySelector: () => null },
  };
  const sandbox = vm.createContext({ document: { getElementById: id => elements[id] }, window: {} });
  vm.runInContext(`${navigation}\ncurrentVoiceSection = () => 'lubna'; showSection = () => true;`, sandbox);
  const action = vm.runInContext('runPageAction', sandbox);
  assert.equal(action({ action: 'video_pause' }), false);
  assert.equal(action({ action: 'demo', section: 'codev' }), false);
  assert.equal(action({ action: 'demo', section: 'https://evil.test' }), false);
  assert.equal(action({ action: 'demo', section: 'bikinkonten' }), true);
  assert.equal(selected, 'bikinkonten');
  assert.equal(action({ action: 'video_pause' }), true);
  assert.equal(paused, 1);
  assert.equal(action({ action: 'video_resume' }), true);
  assert.equal(played, 1);
  assert.equal(action({ action: 'video_restart' }), true);
  assert.equal(video.currentTime, 0);
  assert.equal(played, 2);
  assert.equal(action({ action: 'video_close' }), true);
  assert.equal(dialog.open, false);
  assert.equal(action({ action: 'video_resume' }), false);
  assert.equal(action({ action: 'demo', section: 'current' }), true);
  assert.equal(selected, 'lubna');
});

test("demo modal raises the existing voice surface and restores it on close and cleanup", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const source = work.slice(work.indexOf('function bindProjectDemoModal()'), work.indexOf('function applyShot()'));
  const node = () => Object.assign(new EventTarget(), { classList: { add() {}, remove() {} } });
  const body = Object.assign(node(), { append(el) { el.parentElement = this; } });
  const voice = { hidden: false, parentElement: body, setAttribute() {}, removeAttribute() {}, showPopover() { this.raised = true; }, hidePopover() { this.raised = false; } };
  const closeButton = node(), title = {};
  const video = { pause() {}, removeAttribute() {}, load() {}, play: () => Promise.resolve() };
  const trigger = Object.assign(node(), { dataset: { demoSrc: 'demo.mp4' } });
  const dialog = Object.assign(node(), {
    append(el) { el.parentElement = this; }, getBoundingClientRect() {},
    showModal() { this.open = true; },
    close() { this.open = false; this.dispatchEvent(new Event('close')); },
    querySelector(selector) { return selector === '.project-demo-close' ? closeButton : voice.parentElement === this ? voice : null; },
  });
  const elements = { 'project-demo-dialog': dialog, 'project-demo-video': video, 'project-demo-title': title, 'voice-surface': voice };
  const sandbox = vm.createContext({
    document: { body, getElementById: id => elements[id], querySelectorAll: () => [trigger] },
    window: { clearTimeout() {} }, reducedMotionMedia: { matches: false },
  });
  const cleanup = vm.runInContext(`${source}\nbindProjectDemoModal()`, sandbox);
  trigger.dispatchEvent(new Event('click'));
  assert.equal(voice.parentElement, dialog);
  assert.equal(voice.raised, true);
  dialog.close();
  assert.equal(voice.parentElement, body);
  assert.equal(voice.raised, false);
  trigger.dispatchEvent(new Event('click'));
  cleanup();
  assert.equal(voice.parentElement, body);
  assert.equal(voice.raised, false);
});

test("click opens a persistent session; thanks ends it and voice can reopen it", async () => {
  const h = browser(); await h.enable();
  assert.equal(h.sockets.length, 1, "First click must start cloud listening");
  const socket = h.sockets[0]; socket.open(); socket.message({ type: "ready" });
  h.tick(8000); assert.equal(h.ui.root.dataset.state, "listening", "Silence does not end the session");
  socket.message({ type: "delta", text: "Buka CoDev", item_id: "a" });
  h.tick(2000); h.audio();
  socket.message({ type: "decision", action: "show", section: "codev", item_id: "a" });
  assert.equal(h.ui.root.dataset.state, "listening"); assert.equal(socket.readyState, 1);
  assert.equal(h.sections.at(-1), "codev");
  socket.message({ type: "delta", text: "terimakasih", item_id: "b" });
  assert.equal(h.ui.root.dataset.state, "armed"); assert.equal(socket.readyState, 3);
  const count = socket.messages.length; h.audio(.1); assert.equal(socket.messages.length, count);
  h.wake(); assert.equal(h.sockets.length, 2); h.wake(); assert.equal(h.sockets.length, 2);
  h.click(); assert.equal(h.ui.root.dataset.state, "armed");
  h.click(); assert.equal(h.sockets.length, 3); assert.equal(h.microphones.length, 1); h.escape();
});

test("no-action shakes while keeping listening and final thank-you cancels pending interpretation", async () => {
  const h = browser(); await h.enable();
  const socket = h.sockets[0]; assert.ok(socket); socket.open(); socket.message({ type: "ready" });
  socket.message({ type: "delta", text: "tidak dikenal", item_id: "a" }); h.tick(2000); h.audio();
  socket.message({ type: "noop", item_id: "a" });
  assert.equal(h.ui.root.dataset.state, "listening"); assert.ok(h.ui.root.dataset.fallback);
  socket.message({ type: "delta", text: "thanksgiving", item_id: "b" });
  h.tick(499); assert.ok(h.ui.root.dataset.fallback); h.tick(1); assert.equal(h.ui.root.dataset.fallback, "");
  socket.message({ type: "delta", text: "thanksgiving", item_id: "b" });
  assert.equal(h.ui.root.dataset.state, "listening"); h.tick(2000); h.audio();
  socket.message({ type: "final", transcript: "Thanks!", item_id: "b" });
  assert.equal(h.ui.root.dataset.state, "armed");
  socket.message({ type: "decision", action: "show", section: "codev", item_id: "b" });
  assert.equal(h.sections.length, 0); h.escape();
});

test("makasih ends the conversation in live and final transcripts", async () => {
  for (const payload of [
    { type: "delta", text: "makasih" },
    { type: "final", transcript: "Oke, MAKASIH!" },
  ]) {
    const h = browser(); const { socket, track } = await h.connect();
    socket.message({ type: "delta", text: "makasihnya", item_id: "a" });
    assert.equal(h.ui.root.dataset.state, "listening");
    socket.message({ ...payload, item_id: "a" });
    assert.equal(h.ui.root.dataset.state, "armed");
    assert.equal(socket.readyState, 3);
    assert.equal(track.stopped, false);
    h.escape();
  }
});

test("a retired result cannot act on a later turn in the same conversation", async () => {
  const h = browser(); const { socket } = await h.connect();
  socket.message({ type: "delta", item_id: "a", text: "buka CoDev" }); h.tick(2000); h.audio();
  socket.message({ type: "decision", item_id: "a", action: "show", section: "codev" });
  socket.message({ type: "delta", item_id: "b", text: "buka Arkiv" }); h.tick(2000); h.audio();
  socket.message({ type: "decision", item_id: "a", action: "show", section: "codev" });
  assert.equal(h.sections.length, 1); assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "decision", item_id: "b", action: "show", section: "arkiv" });
  assert.deepEqual(h.sections, ["codev", "arkiv"]); assert.equal(h.ui.root.dataset.state, "listening");
  h.escape();
});

test("wake mode keeps idle audio local and reuses the microphone across sessions", async () => {
  const h = browser(); const { track } = await h.enable();
  assert.equal(h.microphones[0].constraints.audio.autoGainControl, true);
  h.click(); assert.equal(h.ui.root.dataset.state, "armed");
  const first = h.sockets[0]; const count = first.messages.length;
  h.audio(.1); assert.equal(first.messages.length, count); assert.equal(h.health.length, 0);
  h.wake("Halo Nadi"); assert.equal(h.sockets.length, 1);
  h.wake(); h.wake(); assert.equal(h.sockets.length, 2);
  assert.equal(h.ui.root.dataset.state, "listening", "Wake immediately shows capture while the backend connects");
  const socket = h.sockets[1]; h.audio(.1); assert.equal(socket.messages.length, 0);
  socket.open(); socket.message({ type: "ready" });
  assert.equal(socket.messages.filter(m => m.type === "audio").length, 1);
  socket.message({ type: "delta", text: "Buka CoDev" });
  h.tick(2000); h.audio(); assert.equal(h.ui.root.dataset.state, "thinking");
  const sent = socket.messages.length; h.audio(.1); assert.equal(socket.messages.length, sent);
  socket.message({ type: "decision", action: "show", section: "codev" });
  assert.equal(h.sections[0], "codev"); assert.equal(h.ui.root.dataset.state, "listening");
  socket.message({ type: "delta", text: "Terima kasih!" });
  assert.equal(h.ui.root.dataset.state, "armed"); assert.equal(socket.readyState, 3);
  assert.equal(track.stopped, false); assert.equal(h.microphones.length, 1);
  h.escape(); assert.equal(track.stopped, true); assert.equal(h.workers[0].terminated, true);
});

test("a speech pause starts processing within two seconds without waiting for captions", async () => {
  const h = browser(); const { socket } = await h.connect();
  h.audio(.2); h.tick(1700); h.audio();
  assert.equal(h.ui.root.dataset.state, "listening", "A brief pause keeps listening");
  h.audio(.2); h.tick(1700); h.audio();
  assert.equal(h.ui.root.dataset.state, "listening", "Further speech restarts the pause");
  h.tick(100); h.audio();
  assert.equal(socket.messages.at(-1).type, "commit");
  assert.equal(h.ui.root.dataset.state, "thinking", "Processing starts at submission, before captions arrive");
  const sent = socket.messages.length;
  h.tick(2000); h.audio(.2);
  assert.equal(socket.messages.length, sent, "Processing stops capture and does not submit twice");
  socket.message({ type: "final", item_id: "noise", transcript: "  " });
  socket.message({ type: "noop", item_id: "noise" });
  assert.equal(h.ui.root.dataset.state, "listening"); assert.equal(h.ui.root.dataset.fallback, "");
  h.audio(.2); h.tick(2000); h.audio();
  socket.message({ type: "final", item_id: "speech", transcript: "Buka Arkiv" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "decision", item_id: "speech", action: "show", section: "arkiv" });
  assert.equal(h.ui.root.dataset.state, "listening");
  h.audio(.2); h.tick(2000); h.audio();
  assert.equal(h.ui.root.dataset.state, "thinking", "Each speech pause starts processing without captions");
  socket.message({ type: "delta", item_id: "late", text: "Buka CoDev" });
  assert.equal(h.ui.root.dataset.state, "thinking"); h.escape();
});

test("no new words for two seconds submits once even while crowd noise stays loud", async () => {
  const h = browser(); const { socket } = await h.connect();
  h.audio(.1);
  socket.message({ type: "delta", item_id: "hello", text: "Hello" });
  for (let i = 0; i < 19; i++) { h.tick(100); h.audio(.06); }
  assert.equal(h.ui.root.dataset.state, "listening");
  socket.message({ type: "delta", item_id: "hello", text: "Hello" });
  h.tick(100);
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(socket.messages.filter(m => m.type === "commit").length, 1);
  socket.message({ type: "noop", item_id: "hello" });
  socket.message({ type: "delta", item_id: "next", text: "Buka" });
  h.tick(1500);
  socket.message({ type: "delta", item_id: "next", text: "Buka Arkiv" });
  h.tick(1500);
  assert.equal(h.ui.root.dataset.state, "listening", "New words extend the command");
  h.tick(500);
  assert.equal(h.ui.root.dataset.state, "thinking");
  h.escape();
});

test("session bounds connections, audio buffers and processing without ending on silence", async () => {
  const h = browser(); await h.enable(); const stale = h.sockets[0];
  h.audio(.1); h.tick(10000); assert.equal(h.ui.root.dataset.state, "armed");
  stale.message({ type: "ready" }); assert.equal(h.ui.root.dataset.state, "armed");
  h.wake(); let socket = h.sockets.at(-1); socket.open(); socket.message({ type: "ready" });
  h.tick(8000); assert.equal(h.ui.root.dataset.state, "listening");
  h.tick(22000); assert.equal(socket.messages.at(-1).type, "commit");
  socket.message({ type: "noop" }); assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(h.ui.root.dataset.fallback, "", "Silence flush must not shake");
  socket.message({ type: "delta", text: "Buka CoDev" });
  h.audio(.1); h.tick(30000); assert.equal(h.ui.root.dataset.state, "thinking");
  h.tick(30000); assert.equal(h.ui.root.dataset.state, "armed");
  socket.message({ type: "decision", action: "show", section: "codev" }); assert.equal(h.sections.length, 0);
  h.wake(); socket = h.sockets.at(-1); socket.message({ type: "error" });
  assert.equal(h.ui.root.dataset.state, "armed"); h.escape();
});

test("cancel during initialization cleans up late microphone and worker results", async () => {
  const h = browser(); h.click(); const worker = h.workers[0]; h.escape();
  const mic = microphone(); h.microphones[0].resolve(mic.media); await flush();
  worker.message({ type: "ready" });
  assert.equal(mic.track.stopped, true); assert.equal(worker.terminated, true);
  assert.equal(h.ui.root.dataset.state, "idle"); assert.equal(h.sockets.length, 0);
});

test("tab switches mute capture without suspending the live audio graph", async () => {
  const h = browser(); const { context, track, socket } = await h.connect();
  h.hide(true);
  assert.equal(context.state, "running", "Do not force browser autoplay recovery on every tab switch");
  assert.equal(track.enabled, false);
  const sent = socket.messages.length; h.audio(.2); assert.equal(socket.messages.length, sent);
  h.hide(false); await flush();
  assert.equal(track.enabled, true); assert.equal(h.microphones.length, 1);
  h.escape();
});

test("browser audio interruption cannot leave a nonfunctional listening state", async () => {
  const h = browser(); const { context } = await h.connect();
  context.state = "suspended"; context.resume = async () => { throw new Error("gesture required"); };
  emit(context, "statechange"); await flush();
  assert.equal(h.ui.root.dataset.state, "resume");
  context.resume = async () => { context.state = "running"; };
  h.click(); await flush(); const next = h.sockets.at(-1); next.open(); next.message({ type: "ready" });
  assert.equal(h.ui.root.dataset.state, "listening"); assert.equal(h.microphones.length, 1); h.escape();
});

test("hidden pages pause sessions and resume silently without another microphone request", async () => {
  const h = browser(); const { socket } = await h.connect();
  const tones = () => h.stateSounds.filter(state => ["armed", "connecting", "listening"].includes(state)).length;
  const before = tones();
  for (let i = 0; i < 4; i++) {
    h.hide(true); assert.equal(h.ui.root.dataset.state, "paused");
    const count = socket.messages.length; h.audio(.2); assert.equal(socket.messages.length, count);
    h.hide(false); await flush(); const next = h.sockets.at(-1); next.open(); next.message({ type: "ready" });
    assert.equal(h.ui.root.dataset.state, "listening");
  }
  assert.equal(tones(), before, "Returning to the browser must be silent");
  assert.equal(h.microphones.length, 1); h.escape();
});

test("denied microphone and worker failure stop all resources without cloud fallback", async () => {
  const h = browser(); h.click(); h.microphones[0].reject(new Error("denied")); await flush();
  assert.equal(h.ui.root.dataset.state, "blocked"); assert.equal(h.workers[0].terminated, true);
  assert.equal(h.sockets.length, 0);
  const g = browser(); const { track } = await g.enable();
  g.workers[0].message({ type: "error", message: "model failed" });
  assert.equal(track.stopped, true); assert.ok(g.sockets.every(socket => socket.readyState === 3));
});

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

test("short quiet commands and transcript-only speech finish once after a natural pause", () => {
  const { sandbox } = browser();
  const create = vm.runInContext("createPauseDetector", sandbox);
  const pause = create();
  const quiet = new Float32Array(4096);
  const speech = new Float32Array(4096).fill(0.018);
  assert.equal(pause.update(quiet, 1000), null);
  assert.equal(pause.update(speech, 1170), "start");
  assert.equal(pause.update(quiet, 1870), null);
  assert.equal(pause.update(quiet, 2370), null);
  assert.equal(pause.update(quiet, 3070), "commit");
  assert.equal(pause.update(quiet, 3700), null);
  pause.transcript(4000);
  assert.equal(pause.update(quiet, 4500), null);
  pause.transcript(4600);
  assert.equal(pause.update(quiet, 5100), null);
  assert.equal(pause.update(quiet, 5800), null);
  assert.equal(pause.update(quiet, 6500), "commit");
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
  assert.ok(committedAt >= 4700 && committedAt <= 5000, `Expected a natural pause, got ${committedAt}`);
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

test("a breathing pause in background noise keeps the sentence open until speech resumes", () => {
  const create = vm.runInContext("createPauseDetector", browser().sandbox);
  const pause = create();
  const frame = level => new Float32Array(4096).fill(level);
  for (let now = 1000; now <= 2000; now += 100) pause.update(frame(0.1), now);
  for (let now = 2100; now <= 3400; now += 100) {
    assert.notEqual(pause.update(frame(0.024), now), "commit", "A breath should not submit half a sentence");
  }
  for (let now = 3500; now <= 5000; now += 100) {
    assert.notEqual(pause.update(frame(0.09), now), "commit");
  }
  let commits = 0;
  for (let now = 5100; now <= 7100; now += 100) {
    if (pause.update(frame(0.024), now) === "commit") commits++;
  }
  assert.equal(commits, 1, "Background noise must not hold the completed sentence open");
});

test("voice showcase actions use the visible product, focus its CTA, and restore navigation", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  const h = browser();
  let focused, opened;
  const ids = ['hero', 'system', 'work', 'bikinkonten', 'lubna', 'crm-ai-agent', 'hireassess', 'arkiv', 'codev', 'coframe', 'cofinance', 'colegal', 'clients', 'contact'];
  const position = id => ids.indexOf(id) * 800;
  const elements = Object.fromEntries(ids.map((id, index) => [id, {
    id, classList: { add() {}, remove() {} },
    getBoundingClientRect: () => ({ top: index * 800 - h.sandbox.window.scrollY, bottom: (index + 1) * 800 - h.sandbox.window.scrollY, height: 800 }),
    querySelector(selector) {
      if (selector.includes('cta') || selector.includes('inquiry')) return {
        href: `https://wa.me/123?text=${id}`, focus() { focused = id; }, classList: { add() {}, remove() {} },
        getBoundingClientRect: () => ({ top: index * 800 + 600 - h.sandbox.window.scrollY, height: 44 }),
      };
      return null;
    },
  }]));
  Object.assign(h.sandbox.window, { innerHeight: 800, scrollY: 0, clearTimeout() {}, setTimeout() {},
    scrollTo({ top }) { this.scrollY = top; }, location: { assign(href) { opened = href; } },
  });
  Object.assign(h.sandbox.document, {
    getElementById: id => elements[id],
    querySelectorAll: () => [],
  });
  Object.assign(h.sandbox, { reduce: true, smoothInstance: null });
  vm.runInContext(`${navigation}\nwindow.xstationShowSection = showSection; window.xstationPageAction = runPageAction;`, h.sandbox);
  const { socket } = await h.connect();
  socket.message({ type: 'ready' });
  const action = payload => { const active = h.sockets.at(-1); active.message({ type: 'delta', text: 'perintah' }); h.tick(2000); h.audio(); active.message({ type: 'decision', ...payload }); };
  action({ action: 'back' });
  assert.equal(vm.runInContext('voiceActionLog.index', h.sandbox), -1, 'Empty history cannot go back');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('system'), 'Next from Hero visits System without needing history');
  action({ action: 'back' });
  action({ action: 'show', section: 'crm-ai-agent' });
  assert.equal(h.sandbox.window.scrollY, position('crm-ai-agent'));
  action({ action: 'back' });
  assert.equal(h.sandbox.window.scrollY, 0);
  action({ action: 'back' });
  assert.equal(vm.runInContext('voiceActionLog.index', h.sandbox), 0, 'Back cannot leave the start of history');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('system'), 'Next follows page order instead of replaying CRM from history');
  assert.equal(vm.runInContext('voiceActionLog.index', h.sandbox), 1);
  assert.equal(vm.runInContext('voiceActionLog.entries.length', h.sandbox), 2, 'Next replaces forward history with a new Show');
  assert.equal(vm.runInContext('voiceActionLog.entries[1].section', h.sandbox), 'system');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('work') - 16);
  assert.equal(vm.runInContext('voiceActionLog.index', h.sandbox), 2, 'Each next section is recorded as a new action');
  action({ action: 'back' });
  assert.equal(h.sandbox.window.scrollY, position('system'), 'Back restores the section before next');
  action({ action: 'show', section: 'hero' });
  action({ action: 'explore' });
  assert.equal(h.sandbox.window.scrollY, position('work') - 16, 'Explore still visits the catalog section');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('bikinkonten'), 'Next from the catalog opens its first service');
  action({ action: 'show', section: 'system' });
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('work') - 16, 'Next from System opens the product catalog');
  h.sandbox.window.scrollY = 0;
  for (const id of ids.slice(1)) {
    action({ action: 'next' });
    assert.equal(h.sandbox.window.scrollY, position(id) - (id === 'work' ? 16 : 0), `Next reaches ${id} in page order`);
    assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).section', h.sandbox), id);
  }
  h.sandbox.window.scrollY = position('codev');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('coframe'), 'Next uses the manually scrolled service, not the last logged destination');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('cofinance'));
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('colegal'), 'Next includes CoLegal after CoFinance');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('clients'), 'Next continues beyond the last product to Trusted by');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('contact'), 'Next continues from Trusted by to Contact');
  const indexAtEnd = vm.runInContext('voiceActionLog.index', h.sandbox);
  const lengthAtEnd = vm.runInContext('voiceActionLog.entries.length', h.sandbox);
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('contact'), 'Next stops at the last page section without wrapping');
  assert.equal(vm.runInContext('voiceActionLog.index', h.sandbox), indexAtEnd);
  assert.equal(vm.runInContext('voiceActionLog.entries.length', h.sandbox), lengthAtEnd);
  assert.equal(opened, undefined, 'Navigating to Contact never opens WhatsApp');
  h.sandbox.window.scrollY = position('bikinkonten'); // A manual scroll changes the contextual product.
  action({ action: 'contact', section: 'current' });
  assert.equal(focused, 'bikinkonten');
  assert.equal(opened, undefined, 'Conversion focuses the CTA without opening WhatsApp');
  action({ action: 'contact', section: 'contact' });
  assert.equal(focused, 'contact');
  action({ action: 'back' });
  assert.equal(focused, 'bikinkonten', 'Back restores the previous contact CTA');
  action({ action: 'next' });
  assert.equal(h.sandbox.window.scrollY, position('lubna'), 'Next from a product CTA goes to the next service instead of replaying contact');
  assert.equal(vm.runInContext('runPageAction({action:"demo",section:"bikinkonten"})', h.sandbox), false);
  action({ action: 'whatsapp', section: 'bikinkonten' });
  assert.equal(opened, 'https://wa.me/123?text=bikinkonten');
  const logLength = vm.runInContext('voiceActionLog.entries.length', h.sandbox);
  assert.equal(vm.runInContext('runPageAction({action:"show",section:"unknown"})', h.sandbox), false);
  assert.equal(vm.runInContext('voiceActionLog.entries.length', h.sandbox), logLength, 'Rejected actions do not enter history');
  assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).action', h.sandbox), 'whatsapp');
  elements.work.getBoundingClientRect = () => ({ top: position('work') - h.sandbox.window.scrollY, height: 200 });
  elements.bikinkonten.getBoundingClientRect = () => ({ top: position('work') + 200 - h.sandbox.window.scrollY, height: 800 });
  action({ action: 'show', section: 'work' });
  assert.equal(vm.runInContext('currentVoiceSection()', h.sandbox), 'work', 'A short catalog remains active after being top-aligned');
  action({ action: 'next' });
  assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).section', h.sandbox), 'bikinkonten', 'Next must not skip the first product below a short catalog');
  action({ action: 'show', section: 'work' });
  h.sandbox.window.scrollY = position('work') + 300;
  assert.equal(vm.runInContext('currentVoiceSection()', h.sandbox), 'bikinkonten', 'Manual scrolling away from the catalog updates the active section');
  action({ action: 'next' });
  assert.equal(vm.runInContext('voiceActionLog.entries.at(-1).section', h.sandbox), 'lubna');
  elements.bikinkonten.getBoundingClientRect = () => ({ top: -1100, height: 1600 });
  elements.lubna.getBoundingClientRect = () => ({ top: 500, height: 400 });
  h.sandbox.window.scrollY = 2700;
  assert.equal(vm.runInContext('currentVoiceSection()', h.sandbox), 'bikinkonten', 'The centered CTA still belongs to its tall mobile section');
  h.escape();
});

test("idle silences scheduled tones and cancels delayed audio resume", async () => {
  const ready = deferred();
  let starts = 0, muted = 0;
  const param = { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} };
  class Audio {
    state = "suspended"; currentTime = 0; destination = {};
    async resume() { await ready.promise; this.state = "running"; }
    createOscillator() { return { frequency: param, connect() {}, disconnect() {}, start() { starts++; }, stop() {} }; }
    createGain() { return { gain: param, connect() {}, disconnect() { muted++; } }; }
  }
  const soundSource = source.slice(source.indexOf("function createStateSound()"), source.indexOf("function bindVoice()"));
  const play = vm.runInNewContext(`${soundSource}\ncreateStateSound()`, { window: { AudioContext: Audio } });
  const pending = play("listening");
  const idle = play("idle");
  ready.resolve(); await Promise.all([pending, idle]);
  assert.equal(starts, 0, "Idle must cancel a tone waiting for audio permission");
  await play("listening"); assert.equal(starts, 2);
  await play("idle"); assert.equal(starts, 2, "Idle must not create a tone");
  assert.equal(muted, 2, "Idle must disconnect already scheduled tones");
  await play("armed"); await play("paused");
  assert.equal(muted, 4, "Hidden-page pause must silence tones too");
});

test("robot tones are short, quiet, reused, and tolerate blocked audio", async () => {
  let contexts = 0, starts = [], stops = [], volumes = [], frequencies = [], ramps = [], peaks = [];
  const param = { setValueAtTime() {}, linearRampToValueAtTime(value, time) { volumes.push(value); peaks.push(time); }, exponentialRampToValueAtTime() {} };
  class Audio {
    state = 'suspended'; currentTime = 1; destination = {};
    constructor() { contexts++; }
    async resume() { this.state = 'running'; }
    createOscillator() { return { frequency: { ...param, setValueAtTime(value) { frequencies.push(value); }, exponentialRampToValueAtTime(value, time) { ramps.push([value, time]); } }, connect() {}, disconnect() {}, start(time) { starts.push(time); }, stop(time) { stops.push(time); } }; }
    createGain() { return { gain: param, connect() {}, disconnect() {} }; }
  }
  const soundSource = source.slice(source.indexOf('function createStateSound()'), source.indexOf('function bindVoice()'));
  const gesture = vm.runInContext('FALLBACK_GESTURE', browser().sandbox);
  const sandbox = vm.createContext({ window: { AudioContext: Audio }, FALLBACK_GESTURE: gesture });
  const play = vm.runInContext(`${soundSource}\ncreateStateSound()`, sandbox);
  for (const state of ['connecting', 'listening', 'thinking', 'armed', 'deaf', 'blocked']) await play(state);
  assert.equal(contexts, 1);
  assert.equal(starts.length, 12);
  assert.ok(stops.filter(end => end !== undefined).every((end, i) => Math.abs(end - starts[i] - 0.13) < 1e-8));
  assert.ok(volumes.every(value => value <= 0.055));
  assert.ok(frequencies[3] > frequencies[2], 'Listening rises');
  assert.ok(frequencies[5] < frequencies[4], 'Thinking descends');
  peaks = [];
  await play('fallback');
  assert.equal(starts.length, 13, 'Shake is one continuous prrunk');
  assert.ok(ramps.at(-1)[0] < frequencies.at(-1) / 4, 'Pitch falls from high to low');
  assert.ok(Math.abs(stops.at(-1) - starts.at(-1) - 0.51) < 1e-8);
  for (let i = 1; i < gesture.length; i++) {
    assert.ok(peaks.includes(1 + (gesture[i - 1][0] + gesture[i][0]) / 2), 'Pulse follows each shake segment');
  }
  sandbox.window.AudioContext = class { constructor() { throw new Error('Audio blocked'); } };
  await assert.doesNotReject(vm.runInContext('createStateSound()', sandbox)('connecting'));
});

test("worker epochs reject stale detections and explicit resume recovers a suspended context", async () => {
  const h = browser(); const { context } = await h.enable(); h.click();
  const worker = h.workers[0]; const old = worker.messages.at(-1).epoch;
  h.hide(true); h.hide(false); await flush();
  worker.message({ type: "wake", phrase: "Hei Nadi", epoch: old }); assert.equal(h.sockets.length, 1);
  context.state = "suspended"; context.resume = async () => { throw new Error("gesture required"); };
  h.hide(true); h.hide(false); await flush();
  assert.equal(h.ui.root.dataset.state, "resume");
  context.resume = async () => { context.state = "running"; };
  h.click(); await flush(); assert.equal(h.ui.root.dataset.state, "armed");
  assert.equal(h.microphones.length, 1); h.escape();
});

test("a stopped listener cannot be revived by late model readiness or a previous command", async () => {
  const h = browser(); const { socket, track } = await h.connect();
  const worker = h.workers[0]; h.escape();
  socket.message({ type: "decision", action: "show", section: "codev" }); worker.message({ type: "ready" });
  assert.equal(h.sections.length, 0); assert.equal(h.ui.root.dataset.state, "idle"); assert.equal(track.stopped, true);
  await h.enable(); assert.equal(h.microphones.length, 2); assert.equal(h.ui.root.dataset.state, "connecting"); h.escape();
});

test("missing isolation fails before requesting the microphone, and slow inference fails without cloud fallback", async () => {
  const h = browser(); h.sandbox.window.crossOriginIsolated = false; h.click();
  assert.equal(h.microphones.length, 0);
  assert.equal(h.ui.root.dataset.state, "blocked");
  const g = browser(); const { track } = await g.enable(); g.click();
  for (let i = 0; i < 20 && !track.stopped; i++) g.audio(.1);
  assert.equal(track.stopped, true); assert.ok(g.sockets.every(socket => socket.readyState === 3));
});

test("agent mode talks through ElevenLabs, drives the page with one client tool, and re-arms when the call ends", async () => {
  const h = browser({ agentId: "agent_test" });
  await h.enable(); await flush();
  assert.equal(h.sockets.length, 0, "Agent mode never opens the voice box stream");
  assert.equal(h.agentSessions.length, 1);
  const session = h.agentSessions[0], { options } = session;
  assert.equal(options.agentId, "agent_test");
  assert.equal(h.ui.root.dataset.state, "listening");
  h.audio(0.5);
  assert.equal(h.sockets.length, 0, "Local capture is not uploaded during an agent conversation");

  assert.equal(options.clientTools.page_action({ action: "show", section: "arkiv" }), "done");
  assert.deepEqual(h.pageActions, [{ action: "show", section: "arkiv" }]);
  assert.match(options.clientTools.page_action({ action: "back" }), /not possible/);
  assert.notEqual(h.ui.root.dataset.fallback, "", "A page action that cannot run shakes the face");

  options.onMessage({ source: "user", message: "Show me Arkiv" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  options.onMessage({ source: "ai", message: '@@page_action@@{"action": "show", "section": "arkiv"} page_action(action="show", section="arkiv") [warmly] Here is  Arkiv.' });
  options.onModeChange({ mode: "speaking" });
  assert.equal(h.ui.root.dataset.state, "speaking");
  assert.equal(h.ui.transcript.textContent, "", "What the agent says is heard, not shown as text");
  session.volume = 0.4;
  assert.equal(h.ui.wave.output(), 0.4);
  options.onModeChange({ mode: "listening" });
  options.onModeChange({ mode: "speaking" });
  h.tick(600);
  assert.equal(h.ui.root.dataset.state, "speaking", "A pause between sentences keeps the face speaking");
  options.onModeChange({ mode: "listening" });
  h.tick(600);
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(h.ui.transcript.textContent, "");

  options.onMessage({ source: "user", message: "Hmm" });
  h.tick(12000);
  assert.equal(h.ui.root.dataset.state, "listening", "A silent agent does not leave the face thinking");

  h.tick(44000);
  assert.equal(session.ended, 0, "The idle clock starts when the agent stops talking, not at the last user message");
  options.onModeChange({ mode: "speaking" });
  options.onModeChange({ mode: "listening" });
  h.tick(44000);
  assert.equal(session.ended, 0);
  h.tick(1000);
  assert.equal(session.ended, 1, "A conversation nobody talks to hangs up instead of billing minutes");
  assert.equal(h.ui.root.dataset.state, "armed");
  assert.equal(h.ui.wave.output, null);
  assert.equal(options.clientTools.page_action({ action: "next" }), "ignored");

  h.click(); await flush();
  assert.equal(h.agentSessions.length, 2, "Tapping the armed mic starts a new conversation");
  h.click();
  assert.equal(h.agentSessions[1].ended, 1, "Tapping during a conversation ends it");
  assert.equal(h.ui.root.dataset.state, "armed");
});

test("agent mode keeps the mascot in the middle of the page until the agent has said its greeting", async () => {
  const h = browser({ agentId: "agent_test" });
  assert.ok(!h.ui.root.dataset.greeting, "Before a conversation there is no greeting to wait for");
  await h.enable(); await flush();
  const { options } = h.agentSessions[0];
  assert.deepEqual([h.ui.root.dataset.state, h.ui.root.dataset.greeting], ["listening", "true"], "A connected agent is about to greet the visitor");
  h.tick(1000);
  options.onModeChange({ mode: "speaking" });
  assert.deepEqual([h.ui.root.dataset.state, h.ui.root.dataset.greeting], ["speaking", "true"]);
  h.tick(6000);
  assert.equal(h.ui.root.dataset.greeting, "true", "A long greeting is heard out");
  options.onModeChange({ mode: "listening" });
  options.onModeChange({ mode: "speaking" });
  h.tick(600);
  assert.equal(h.ui.root.dataset.greeting, "true", "A pause between its sentences is not its end");
  options.onModeChange({ mode: "listening" });
  h.tick(599);
  assert.equal(h.ui.root.dataset.greeting, "true");
  h.tick(1);
  assert.deepEqual([h.ui.root.dataset.state, h.ui.root.dataset.greeting], ["listening", ""], "Once it has been said the mascot steps aside");
  options.onModeChange({ mode: "speaking" });
  assert.equal(h.ui.root.dataset.greeting, "", "A later answer is not a greeting");

  const silent = browser({ agentId: "agent_test" });
  await silent.enable(); await flush();
  silent.tick(3999);
  assert.equal(silent.ui.root.dataset.greeting, "true");
  silent.tick(1);
  assert.deepEqual([silent.ui.root.dataset.state, silent.ui.root.dataset.greeting], ["listening", ""], "An agent that stays silent is not waited for");

  const eager = browser({ agentId: "agent_test" });
  await eager.enable(); await flush();
  eager.agentSessions[0].options.onMessage({ source: "user", message: "Halo" });
  assert.equal(eager.ui.root.dataset.greeting, "", "A visitor who speaks first is answered, not greeted");

  const brief = browser({ agentId: "agent_test" });
  await brief.enable(); await flush();
  brief.agentSessions[0].options.onModeChange({ mode: "speaking" });
  brief.click();
  assert.deepEqual([brief.ui.root.dataset.state, brief.ui.root.dataset.greeting], ["armed", ""], "Ending the conversation ends the greeting");
  brief.click(); await flush();
  assert.equal(brief.ui.root.dataset.greeting, "true", "The next conversation is greeted again");

  const box = browser();
  await box.connect();
  assert.ok(!box.ui.root.dataset.greeting, "The voice box does not speak, so it has no greeting");
});

test("agent mode runs cued page actions when the agent's voice reaches each cue", async () => {
  const h = browser({ agentId: "agent_test" });
  await h.enable(); await flush();
  const { options } = h.agentSessions[0];
  const say = (text, ms = 100) => options.onAudioAlignment({
    chars: [...text], char_start_times_ms: [...text].map((_, i) => i * ms), char_durations_ms: [...text].map(() => ms),
  });

  say("Mari lihat HireAssess. ");
  assert.equal(options.clientTools.page_action({ action: "show", section: "bikinkonten" }), "done");
  assert.match(options.clientTools.page_action({ action: "show", section: "hireassess", cue: "Hire Assess" }), /^scheduled/);
  assert.match(options.clientTools.page_action({ action: "contact", section: "contact", cue: "tim kami" }), /^scheduled/);
  assert.deepEqual(h.pageActions, [{ action: "show", section: "bikinkonten" }], "Cued actions wait, and words said before the call do not count");

  h.tick(2300);
  say("BikinKonten untuk konten, ");
  say("HireAssess untuk rekrutmen, dan tim kami siap membantu.");
  h.tick(2600 - 250 - 1);
  assert.equal(h.pageActions.length, 1);
  h.tick(1);
  assert.deepEqual(h.pageActions[1], { action: "show", section: "hireassess" }, "The move starts just before its word is spoken");
  h.tick(3199);
  assert.equal(h.pageActions.length, 2);
  h.tick(1);
  assert.deepEqual(h.pageActions[2], { action: "contact", section: "contact" });

  options.clientTools.page_action({ action: "show", section: "arkiv", cue: "Arkiv" });
  say("Lalu ada Arkiv.");
  options.onInterruption({});
  h.tick(5000);
  assert.equal(h.pageActions.length, 3, "An interrupted explanation drops the moves it had not reached");

  options.clientTools.page_action({ action: "show", section: "codev", cue: "CoDev" });
  options.onMessage({ source: "user", message: "Tunggu" });
  say("CoDev.");
  h.tick(5000);
  assert.equal(h.pageActions.length, 3, "A new visitor turn drops waiting moves");
});

test("agent mode is opt-in through the agent query parameter", async () => {
  const config = (await readFile(new URL("./voice-config.js", import.meta.url), "utf8")).replace(/export /g, "");
  const read = search => vm.runInNewContext(`${config}; VOICE_AGENT_ID`, {
    window: { location: { search, hostname: "nadi.example", port: "", origin: "https://nadi.example" } }, URLSearchParams,
  });
  assert.equal(read("?voice=1"), "");
  assert.match(read("?voice=1&agent=1"), /^agent_[a-z0-9]+$/);
  assert.equal(read("?voice=1&agent=agent_abc123"), "agent_abc123");
  assert.equal(read("?voice=1&agent=https://evil.test"), "");
});
