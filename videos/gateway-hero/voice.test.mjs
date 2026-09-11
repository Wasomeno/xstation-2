import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("./voice.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace(/bindVoice\(\);\s*$/, "");
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
  const node = () => ({ connections: [], connect(target) { this.connections.push(target); }, disconnect() { this.disconnected = true; } });
  class Audio {
    state = "suspended";
    sampleRate = 24000;
    destination = {};
    constructor() { contexts.push(this); }
    async resume() { if (resume) await resume.promise; this.state = "running"; }
    async close() { this.state = "closed"; }
    createMediaStreamSource() { this.source = node(); return this.source; }
    createBiquadFilter() { this.filter = { ...node(), frequency: { value: 350 }, Q: { value: 1 } }; return this.filter; }
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

test("voice orb preserves face visuals, reacts to audio, and respects reduced motion", () => {
  const render = (state, reduced = false, loud = false, variant = "3", frameCount = 30, speaking = false, returnToIdle = false) => {
    let pixels, nextFrame, radius, squash;
    const eyeSamples = [];
    const nodSamples = [];
    const paths = [], fills = [], opacities = [], arcs = [], rectangles = [], translates = [];
    const surface = { dataset: { state, variant, speaking: String(speaking) } };
    const ctx = {
      save() {}, restore() {}, translate(x, y) { translates.push([x, y]); }, scale(x, y) { squash = y; }, beginPath() {}, clip() {}, arc(x, y, value) { radius = value; arcs.push([x, y, value]); },
      roundRect(x, y, width, height, corner) { radius = width / 2; rectangles.push({ width, height, corner }); },
      fillRect() {}, clearRect() { paths.length = 0; fills.length = 0; opacities.length = 0; arcs.length = 0; rectangles.length = 0; translates.length = 0; },
      moveTo(...point) { paths.push(point); }, lineTo(...point) { paths.push(point); },
      closePath() {}, fill() { fills.push(this.fillStyle); opacities.push(this.globalAlpha); },
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
    const faceLayers = () => ["--mist", "--sage", "--deep-forest"].map(name => fills.indexOf(colors[name]));
    const sandbox = vm.createContext({
      window, document, canvas,
      getComputedStyle: () => ({ getPropertyValue: (name) => colors[name] }),
      performance: { now: () => 1000 }, cancelAnimationFrame() {},
      requestAnimationFrame(callback) { assert.equal(reduced, false); nextFrame = callback; return 1; },
    });
    const wave = vm.runInContext(`${source}\ncreateWaveform(canvas);`, sandbox);
    wave.setAnalyser({
      frequencyBinCount: 128, fftSize: 256,
      getByteTimeDomainData(data) { data.fill(loud ? 148 : 128); },
      getByteFrequencyData(data) { data.fill(loud ? 180 : 0); },
    });
    for (let i = 1; i <= frameCount && nextFrame; i++) {
      nextFrame(1000 + i * 34);
      if (variant === "3") {
        assert.equal(translates[0][1], 44, "Nodding never moves the head");
        assert.equal(squash, undefined, "Nodding never squashes the head");
        if (state === "listening" && i >= 180) {
          const layers = faceLayers();
          const eyes = translates[layers[0] + 1][1] + 0.208187 * radius;
          const mouth = translates[layers[2] + 1][1] - 0.678436 * radius;
          nodSamples.push(eyes);
          if (eyes > 0.1) assert.ok(mouth > 0 && mouth < eyes * 0.5, "Mouth follows less than the eyes");
        }
      }
      if (variant === "3" && i >= 180) eyeSamples.push(faceLayers().slice(0, 2).map(layer => ({
        width: paths[layer * 82 + 1][0], height: paths[layer * 82 + 21][1],
        position: translates[layer + 1].slice(),
      })));
    }
    if (variant === "3") {
      const layers = state === "idle" ? [0, 1, 2] : faceLayers();
      const blobs = layers.map(layer => translates[layer + 1]);
      const eyes = blobs.filter(([, y]) => y < 0);
      const mouths = blobs.filter(([, y]) => y > 0);
      if (reduced && ["listening", "thinking"].includes(state)) {
        const reference = state === "listening"
          ? [[-0.178061, -0.208187, 0.373516, 0.526891], [0.619170, -0.206809, 0.234552, 0.397226], [-0.094579, 0.678436]]
          : [[-0.384411, -0.037947, 0.412864, 0.670817], [0.439721, -0.234707, 0.366162, 0.490939], [0.372745, 0.605300]];
        reference.forEach(([x, y, rx, ry], layer) => {
          assert.ok(Math.abs(blobs[layer][0] / radius - x) < 0.001, "Match SVG horizontal placement");
          assert.ok(Math.abs(blobs[layer][1] / radius - y) < 0.001, "Match SVG vertical placement");
          if (layer === 2) return;
          for (const [px, py] of paths.slice(layers[layer] * 82 + 1, layers[layer] * 82 + 82)) {
            assert.ok(Math.abs((px / (radius * rx)) ** 2 + (py / (radius * ry)) ** 2 - 1) < 0.001,
              "Eyes remain clean ellipses without water-like deformation");
          }
        });
      }
      if (state === "listening") {
        assert.equal(eyes.length, 2, "Listening is two eye circles");
        assert.equal(mouths.length, 1, "Keep the idle layer geometry while its mouth appearance fades out");
        assert.ok(eyes[0][0] * eyes[1][0] < 0, "Eyes sit on opposite sides");
      }
      if (state === "thinking") {
        assert.equal(arcs.length, 0, "The face keeps the existing contour renderer");
        assert.equal(rectangles.length, 1);
        assert.ok(Math.abs(rectangles[0].width - rectangles[0].height) < 0.01, "Thinking stays a round face");
        assert.equal(eyes.length, 2, "Thinking keeps two eyes");
        assert.ok(eyes[0][0] * eyes[1][0] < 0, "Thinking eyes stay on opposite sides");
        assert.ok(eyes[0][1] - eyes[1][1] > 3, "Thinking raises one eye in a curious expression");
      } else assert.ok(paths.length > 0, "Variant 3 restores the earlier layered contours");
      assert.equal(fills.length, 3);
      if (state === "idle") assert.deepEqual(fills, [colors["--deep-forest"], colors["--sage"], colors["--mist"]], "Idle colors stay unchanged");
      if (["listening", "thinking"].includes(state)) assert.deepEqual(layers.map(layer => fills[layer]), [colors["--mist"], colors["--sage"], colors["--deep-forest"]], "Active eyes swap colors, mouth stays unchanged");
      assert.ok(fills.every((fill) => Object.values(colors).includes(fill)));
      if (returnToIdle) {
        const exitFrames = [];
        surface.dataset.state = "idle";
        for (let i = 0; i <= 75; i++) {
          if (i) nextFrame(1000 + frameCount * 34 + i * 16);
          exitFrames.push({
            colors: fills.map(hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))),
            positions: translates.slice(-3).map(point => point.slice()),
            rotations: [0, 1, 2].map(layer => paths[layer * 82][1]),
            head: translates[0][1],
          });
        }
        return exitFrames;
      }
      return { paths: paths.slice(), opacities: opacities.slice(), radius, squash, arcs: arcs.slice(), blobs, eyeSamples, nodSamples };
    }
    return pixels;
  };
  const idle = render("idle");
  const hearing = render("listening");
  assert.notDeepEqual(idle, hearing);
  assert.equal(idle.radius, 24);
  assert.deepEqual(idle.opacities, [1, 1, 1], "Idle retains all three circles");
  for (const state of ["listening", "thinking", "connecting"]) {
    const quiet = render(state, false, false, "3", 180);
    const noisy = render(state, false, true, "3", 180);
    assert.ok(quiet.opacities[0] < 0.001, "Active face hides the mouth layer");
    assert.deepEqual(quiet.opacities.slice(1), [1, 1], "Eyes remain visible");
    quiet.eyeSamples.forEach((eyes, frame) => eyes.forEach((eye, i) => {
      assert.ok(Math.abs(eye.height - noisy.eyeSamples[frame][i].height) < 0.001,
        "Microphone noise cannot change eye height");
    }));
  }
  assert.ok(hearing.radius > 33 && hearing.radius <= 34);
  assert.notDeepEqual(hearing, render("listening", false, true));
  assert.notDeepEqual(hearing, render("thinking"));
  assert.notDeepEqual(render("listening", true).blobs, render("thinking", true).blobs,
    "Reduced motion preserves distinct listening and curious expressions");
  assert.deepEqual(render("thinking", true, false), render("thinking", true, true));
  assert.deepEqual(render("listening", true, false), render("listening", true, true));
  const idleStart = render("idle", false, false, "3", 30);
  const idleLater = render("idle", false, false, "3", 180);
  idleStart.blobs.forEach((point, layer) => {
    assert.ok(Math.hypot(...point.map((value, axis) => value - idleLater.blobs[layer][axis])) > 1,
      "Idle circle centers orbit instead of spinning at fixed positions");
  });
  for (const state of ["connecting", "listening", "thinking"]) {
    const exit = render(state, false, state === "listening", "3", 214, state === "listening", true);
    exit.forEach(frame => assert.deepEqual(frame.colors, exit[0].colors,
      "Each circle retains its solid color for the entire transition; only its geometry changes"));
    exit.slice(1).forEach((frame, i) => {
      assert.ok(Math.abs(frame.head - exit[i].head) < 0.6, "An interrupted nod settles without snapping");
      frame.positions.forEach((point, layer) => {
        assert.ok(Math.hypot(...point.map((value, axis) => value - exit[i].positions[layer][axis])) < 4,
          "All state returns move continuously toward the running idle orbit");
      });
    });
    const final = exit.at(-1);
    final.positions.forEach(([x, y], layer) => {
      const spin = final.rotations[layer];
      const offset = 0.3 - layer * 0.25;
      assert.ok(Math.hypot(x - 24 * (offset * Math.cos(spin) - 0.22 * Math.sin(spin)),
        y - 24 * (offset * Math.sin(spin) + 0.22 * Math.cos(spin))) < 0.05,
        "Return rejoins the moving idle orbit at its current angle");
    });
  }
  for (const state of ["listening", "thinking"]) {
    const quick = render(state, false, false, "3", 13);
    const reference = render(state, true, false, "3");
    assert.ok(Math.abs(quick.radius - reference.radius) < 0.3, "State size settles within about 450ms");
    quick.blobs.forEach((position, i) => position.forEach((value, axis) => {
      assert.ok(Math.abs(value - reference.blobs[i][axis]) < 0.5, "Face pose settles within about 450ms");
    }));
    const { eyeSamples } = render(state, false, false, "3", 900);
    const fullHeights = state === "listening" ? [0.526891 * 34, 0.397226 * 34] : [0.670817 * 32, 0.490939 * 32];
    const ratios = eyeSamples.map(eyes => eyes.map((eye, i) => eye.height / fullHeights[i]));
    let blinks = 0, closed = false;
    for (const [left, right] of ratios) {
      const nextClosed = left < 0.3 && right < 0.3;
      if (nextClosed && !closed) blinks++;
      closed = nextClosed;
    }
    assert.ok(blinks >= 1 && blinks <= 3, "Blink rarely over 24 seconds");
    assert.ok(ratios.some(([left, right]) => left > 0.4 && left < 0.85 && right > 0.4), "Eyes squint between blinks");
    if (state === "thinking") {
      assert.ok(ratios.some(([left, right]) => Math.abs(left - right) > 0.06), "Thinking shows subtle curiosity");
      for (const [left, right] of ratios) {
        if (Math.max(left, right) > 0.95) assert.ok(Math.min(left, right) > 0.87, "Curious eyes never squint harshly outside a blink");
      }
    }
    for (const eyes of eyeSamples) eyes.forEach((eye, i) => {
      assert.ok(Math.abs(eye.width - eyeSamples[0][i].width) < 0.001, "Expression changes eye height only");
      eye.position.forEach((value, axis) => assert.ok(Math.abs(value - eyeSamples[0][i].position[axis]) < 0.001, "Eyes stay in their reference positions"));
    });
  }
  const nods = render("listening", false, true, "3", 900, true).nodSamples;
  const nodStarts = [];
  let activeFrames = 0;
  nods.forEach((value, i) => {
    if (value > 0.1) {
      if (!(nods[i - 1] > 0.1)) nodStarts.push(i);
      activeFrames++;
      assert.ok(activeFrames <= 12, "Cartoon nod finishes within 400ms");
    } else activeFrames = 0;
  });
  assert.ok(nodStarts.length >= 18 && nodStarts.length <= 22, "Sustained speech receives frequent double nods");
  nodStarts.slice(1).forEach((start, i) => {
    const gap = start - nodStarts[i];
    assert.ok(i % 2 === 0 ? gap >= 9 && gap <= 13 : gap >= 55 && gap <= 65,
      "Nods arrive in quick pairs with a 2.4-second trigger cooldown");
  });
  assert.ok(Math.max(...nods) > 2 && Math.max(...nods) <= 3.5, "Eyes make a small but readable nod");
  for (const [state, reduced, loud, speaking] of [
    ["listening", false, true, false], ["listening", false, false, true],
    ["thinking", false, true, true], ["idle", false, true, true], ["listening", true, true, true],
  ]) {
    assert.ok(render(state, reduced, loud, "3", 240, speaking).nodSamples.every(value => Math.abs(value) < 0.001),
      "Only audible, recognized speech while listening can trigger nods; reduced motion stays still");
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

test("wind filtering feeds both pause detection and visualization without a raw microphone bypass", async () => {
  const h = browser();
  const { context } = await h.connect();
  assert.deepEqual(context.source.connections, [context.filter]);
  assert.deepEqual(context.filter.connections, [h.ui.wave.analyser, context.processor]);
  assert.equal(context.filter.type, "highpass");
  assert.equal(context.filter.frequency.value, 150);
  assert.equal(context.filter.Q.value, Math.SQRT1_2);
  h.escape();
  assert.equal(context.state, "closed");
});

test("startup captures the first words before health and transcription are ready", async () => {
  const h = browser();
  h.click();
  const { media } = microphone();
  h.microphones[0].resolve(media);
  await flush();
  const context = h.contexts[0];
  assert.ok(context?.processor, "Capture must start as soon as the microphone is available");
  const input = new Float32Array([0, 0.5, -0.5]);
  context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => input } });
  h.health[0].resolve({ ok: true });
  await flush();
  const socket = h.sockets[0];
  socket.open();
  await flush();
  context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => input } });
  assert.equal(socket.messages.length, 0, "Wait for transcription readiness before sending");
  socket.message({ type: "ready" });
  assert.deepEqual(socket.messages, [
    { type: "audio", pcm: "AAD/PwDA" }, { type: "audio", pcm: "AAD/PwDA" },
  ]);
  socket.message({ type: "ready" });
  assert.equal(socket.messages.length, 2, "Startup audio is sent exactly once");
  h.escape();
});

test("a command finished during startup is submitted once and processing stays protected", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  const feed = (level, now) => {
    h.sandbox.performance.now = () => now;
    context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
  };
  feed(0.1, 1000);
  feed(0, 3000);
  feed(0.1, 3100);
  socket.message({ type: "ready" });
  assert.equal(socket.messages.at(-1).type, "commit");
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "delta", text: "buka CoDev" });
  assert.equal(socket.messages.at(-1).type, "commit");
  assert.equal(h.ui.root.dataset.state, "thinking");
  feed(0.1, 3200);
  socket.message({ type: "ready" });
  assert.equal(socket.messages.filter(message => message.type === "commit").length, 1);
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "decision", action: "show", section: "codev" });
  feed(0.1, 4000);
  assert.equal(socket.messages.at(-1).type, "audio");
  h.escape();
});

test("cancelled or stalled startup discards buffered audio and releases the microphone", async () => {
  for (const stalled of [false, true]) {
    const h = browser();
    const first = await h.connect();
    const feed = samples => first.context.processor.onaudioprocess({
      inputBuffer: { getChannelData: () => samples },
    });
    feed(new Float32Array(4096).fill(0.1));
    if (stalled) feed(new Float32Array(24000 * 31));
    else h.escape();
    assert.equal(first.track.stopped, true);
    assert.equal(first.context.state, "closed");
    first.socket.message({ type: "ready" });
    assert.deepEqual(first.socket.messages.map(message => message.type), ["stop"]);
    const next = await h.connect();
    next.socket.message({ type: "ready" });
    assert.deepEqual(next.socket.messages, [], "A new session cannot send old microphone audio");
    h.escape();
  }
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
  assert.equal(h.ui.root.dataset.speaking, "true", "Recognized speech enables an audio-gated nod");
  socket.message({ type: "final", text: "buka proyek" });
  assert.equal(h.ui.root.dataset.speaking, "false", "Processing clears the speech signal");
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

test("speech commits after a pause before manual transcription produces captions", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "speech_started", item_id: "empty" });
  socket.message({ type: "delta", item_id: "empty", text: "" });
  socket.message({ type: "delta", item_id: "empty", text: "   " });
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "speech_stopped", item_id: "empty" });
  socket.message({ type: "final", item_id: "empty", transcript: "" });
  assert.equal(h.ui.root.dataset.state, "listening", "Empty finals must not process");
  const frame = (level, now) => {
    h.sandbox.performance.now = () => now;
    context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
  };
  frame(0.1, 1000);
  for (let now = 1100; now <= 3000; now += 100) frame(0, now);
  assert.equal(socket.messages.filter(message => message.type === "commit").length, 1);
  assert.equal(h.ui.root.dataset.state, "thinking", "Detected speech must commit before captions arrive");
  socket.message({ type: "delta", item_id: "empty", text: "buka Arkiv" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.ok(socket.messages.some(message => message.type === "commit"));
  socket.message({ type: "noop", item_id: "empty" });
  assert.equal(h.ui.root.dataset.state, "listening", "An unusable transcript releases the turn");
  h.escape();
});

test("processing pauses audio streaming and ignores interruptions until the original result", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  const frame = () => context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(0.1) } });
  socket.message({ type: "ready" });
  socket.message({ type: "speech_started", item_id: "first" });
  socket.message({ type: "delta", item_id: "first", text: "CoDev" });
  frame();
  socket.message({ type: "final", item_id: "first" });
  const sent = socket.messages.length;
  frame();
  assert.equal(socket.messages.length, sent);
  socket.message({ type: "speech_started", item_id: "interruption" });
  socket.message({ type: "delta", item_id: "interruption", text: "bukan, buka Arkiv" });
  socket.message({ type: "final", item_id: "interruption" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "decision", item_id: "first", action: "show", section: "codev" });
  assert.deepEqual(h.sections, ["codev"]);
  assert.equal(h.ui.root.dataset.state, "listening");
  socket.message({ type: "delta", item_id: "interruption", text: "late caption" });
  assert.equal(h.ui.transcript.textContent, "");
  frame();
  assert.equal(socket.messages.length, sent + 1);
  socket.message({ type: "speech_started", item_id: "next" });
  socket.message({ type: "delta", item_id: "next", text: "buka Arkiv" });
  assert.equal(h.ui.transcript.textContent, "buka Arkiv");
  h.escape();
});

test("successive requests accept their first caption after the audio was submitted", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  socket.message({ type: "ready" });
  const frame = (level, now) => {
    h.sandbox.performance.now = () => now;
    context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
  };
  for (const [item, start] of [["A", 1000], ["B", 5000]]) {
    frame(0.1, start);
    socket.message({ type: "speech_started", item_id: item });
    socket.message({ type: "delta", item_id: item, text: "CoDev" });
    for (let now = start + 100; now <= start + 1900; now += 100) frame(0, now);
    assert.equal(h.ui.root.dataset.state, "thinking");
    const sent = socket.messages.length;
    socket.message({ type: "speech_started", item_id: item });
    socket.message({ type: "delta", item_id: item, text: "CoDev" });
    frame(0.1, start + 2000);
    assert.equal(socket.messages.length, sent);
    socket.message({ type: "final", item_id: item });
    socket.message({ type: "decision", item_id: item, action: "show", section: "codev" });
    assert.equal(h.ui.root.dataset.state, "listening");
  }
  assert.deepEqual(h.sections, ["codev", "codev"]);
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

test("softer speech after a loud opening keeps streaming beyond twelve seconds", async () => {
  const h = browser();
  const { socket, context, track } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "delta", text: "buka CoDev" });
  const step = 4096 / context.sampleRate * 1000;
  const feed = (level, elapsed) => {
    h.sandbox.performance.now = () => 1000 + elapsed;
    context.processor.onaudioprocess({
      inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) },
    });
  };
  let elapsed = 0;
  for (; elapsed < 12000; elapsed += step) {
    const level = elapsed < 1000 ? 0.18 : [0.018, 0.045, 0.025, 0.055][Math.floor(elapsed / step) % 4];
    feed(level, elapsed);
    assert.equal(h.ui.root.dataset.state, "listening", `Speech cut off at ${elapsed}ms`);
  }
  assert.equal(socket.messages.filter(message => message.type === "commit").length, 0);
  const speechEnd = elapsed;
  for (; elapsed < speechEnd + 2200; elapsed += step) feed(0.008, elapsed);
  assert.equal(socket.messages.filter(message => message.type === "commit").length, 1);
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(track.stopped, false);
  h.escape();
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
  for (let now = 1100; now <= 2900; now += 100) frame(0.02, now);
  assert.ok(socket.messages.some(message => message.type === "commit"));
  assert.equal(h.ui.root.dataset.state, "thinking");
  socket.message({ type: "delta", item_id: "A", text: "Buka CoDev suara latar" });
  assert.equal(h.ui.root.dataset.state, "thinking");
  assert.equal(h.ui.transcript.textContent, "");
  socket.message({ type: "decision", item_id: "A", action: "show", section: "codev" });
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
  assert.equal(h.ui.root.dataset.shaking, "true");
  h.animations[0].onfinish();
  assert.equal(h.ui.root.dataset.shaking, "false", "Listening resumes after the shake finishes");
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(track.stopped, false);
  socket.message({ type: "decision", action: "noop" });
  assert.equal(h.animations.length, 2);
  assert.equal(h.ui.root.dataset.shaking, "true");
  socket.message({ type: "decision", action: "show", section: "codev" });
  assert.equal(h.animations.length, 2);
  h.animations[1].onfinish();
  assert.equal(h.ui.root.dataset.shaking, "false", "Cancelled feedback cannot pause listening again");
  socket.message({ type: "final" });
  socket.message({ type: "noop" });
  assert.equal(h.animations.length, 2, "Empty silence must not shake as a failed command");
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

test("voice showcase actions use the visible product, focus its CTA, and restore navigation", async () => {
  const work = await readFile(new URL('./work.js', import.meta.url), 'utf8');
  const navigation = work.slice(work.indexOf('const VOICE_SECTIONS ='), work.indexOf('window.xstationShowSection ='));
  const h = browser();
  let focused, opened;
  const ids = ['hero', 'system', 'work', 'bikinkonten', 'lubna', 'crm-ai-agent', 'hireassess', 'arkiv', 'codev', 'coframe', 'cofinance', 'clients', 'contact'];
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
  const action = payload => socket.message({ type: 'decision', ...payload });
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
