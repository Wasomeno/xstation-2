import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = (await readFile(new URL("./voice.js", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
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
    matchMedia: (query) => ({ matches: query.includes("prefers-reduced-motion") ? reducedMotion : true }),
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
  let restingEyeY = 0;
  const render = (state, reduced = false, loud = false, variant = "3", frameCount = 30, speaking = false, returnToIdle = false, emotion = 0, repeatProcessing = false, silenceAt = Infinity) => {
    let pixels, nextFrame, radius, squash;
    let randomCalls = 0;
    const eyeSamples = [];
    const nodSamples = [];
    const paths = [], fills = [], opacities = [], arcs = [], rectangles = [], translates = [];
    let shadowScale;
    const surface = { dataset: { state, variant, speaking: String(speaking) }, style: { setProperty(name, value) { if (name === "--voice-shadow-scale") shadowScale = Number(value); } } };
    const ctx = {
      save() {}, restore() {}, translate(x, y) { translates.push([x, y]); }, scale(x, y) { squash = y; }, beginPath() {}, clip() {}, arc(x, y, value) { radius = value; arcs.push([x, y, value]); },
      roundRect(x, y, width, height, corner) { radius = width / 2; assert.equal(shadowScale, radius / 24, "Shadow follows the rendered radius in every state and transition"); rectangles.push({ width, height, corner }); },
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
      Math: Object.assign(Object.create(Math), { random() { randomCalls++; return (emotion + 0.5) / 3; } }),
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
      if (i === silenceAt) {
        surface.dataset.speaking = "false";
        loud = false;
      }
      nextFrame(1000 + i * 34);
      if (variant === "3") {
        assert.equal(translates[0][1], 44, "Nodding never moves the head");
        assert.equal(squash, undefined, "Nodding never squashes the head");
        if (state === "listening" && i >= 180) {
          const layers = faceLayers();
          const eyes = translates[layers[0] + 1][1] - restingEyeY * radius;
          const mouth = translates[layers[2] + 1][1] - 0.678436 * radius;
          nodSamples.push(eyes);
          if (eyes > 0.1) assert.ok(mouth > 0 && mouth < eyes * 0.5, "Mouth follows less than the eyes");
        }
      }
      if (variant === "3" && i >= 180) eyeSamples.push(faceLayers().slice(0, 2).map(layer => ({
        width: paths[layer * 82 + 1][0], height: paths[layer * 82 + 21][1],
        spin: paths[layer * 82][1],
        position: translates[layer + 1].slice(),
      })));
    }
    assert.equal(randomCalls, state === "thinking" ? 1 : 0, "Choose an emotion once per processing turn, never per frame or refresh");
    if (variant === "3") {
      const layers = state === "idle" ? [0, 1, 2] : faceLayers();
      const blobs = layers.map(layer => translates[layer + 1]);
      const eyes = blobs.slice(0, 2);
      const mouths = blobs.slice(2);
      if (reduced && state === "listening") {
        layers.slice(0, 2).forEach(layer => {
          const rx = paths[layer * 82 + 1][0], ry = paths[layer * 82 + 21][1];
          for (const [px, py] of paths.slice(layer * 82 + 1, layer * 82 + 82)) {
            assert.ok(Math.abs((px / rx) ** 2 + (py / ry) ** 2 - 1) < 0.001,
              "Eyes remain clean ellipses without water-like deformation");
          }
        });
      }
      if (state === "listening") {
        assert.equal(eyes.length, 2, "Listening is two eye circles");
        assert.equal(mouths.length, 1, "Keep the idle layer geometry while its mouth appearance fades out");
        assert.ok(eyes[0][0] * eyes[1][0] < 0, "Eyes sit on opposite sides");
        assert.ok(eyes[0][0] + eyes[1][0] > 12 && eyes.every(eye => eye[1] < -4), "Listening faces the upper right of the screen");
        assert.ok(Math.hypot(...eyes[0]) < Math.hypot(...eyes[1]), "The left eye is nearer the face center");
        assert.ok(paths[layers[0] * 82 + 1][0] > paths[layers[1] * 82 + 1][0], "The near eye is larger than the far eye");
      }
      if (state === "thinking") {
        assert.equal(arcs.length, 0, "The face keeps the existing contour renderer");
        assert.equal(rectangles.length, 1);
        assert.ok(Math.abs(rectangles[0].width - rectangles[0].height) < 0.01, "Thinking stays a round face");
        assert.equal(opacities.filter(value => value > 0.99).length, 2, "Thinking keeps two visible eyes");
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
      if (repeatProcessing) {
        wave.refresh();
        assert.equal(randomCalls, 1, "A resize or refresh cannot replace the current emotion");
        surface.dataset.state = "listening";
        wave.refresh();
        surface.dataset.state = "thinking";
        wave.refresh();
        assert.equal(randomCalls, 2, "The next processing turn chooses again");
      }
      return { paths: paths.slice(), opacities: opacities.slice(), radius, squash, arcs: arcs.slice(), blobs, eyeSamples, nodSamples };
    }
    return pixels;
  };
  restingEyeY = render("listening", true).blobs[0][1] / 34;
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
  {
    const state = "listening";
    const quick = render(state, false, false, "3", 13);
    const reference = render(state, true, false, "3");
    assert.ok(Math.abs(quick.radius - reference.radius) < 0.3, "State size settles within about 450ms");
    quick.blobs.forEach((position, i) => position.forEach((value, axis) => {
      assert.ok(Math.abs(value - reference.blobs[i][axis]) < 0.5, "Face pose settles within about 450ms");
    }));
    const { eyeSamples } = render(state, false, false, "3", 900);
    const fullHeights = [0, 1].map(eye => Math.max(...eyeSamples.map(eyes => eyes[eye].height)));
    const ratios = eyeSamples.map(eyes => eyes.map((eye, i) => eye.height / fullHeights[i]));
    let blinks = 0, closed = false;
    for (const [left, right] of ratios) {
      const nextClosed = left < 0.3 && right < 0.3;
      if (nextClosed && !closed) blinks++;
      closed = nextClosed;
    }
    assert.ok(blinks >= 1 && blinks <= 3, "Blink rarely over 24 seconds");
    assert.ok(ratios.filter(([left, right]) => left > 0.999 && right > 0.999).length > ratios.length * 0.94,
      "Quiet listening keeps eyes open and stable between brief natural blinks");
    for (const eyes of eyeSamples) eyes.forEach((eye, i) => {
      assert.ok(Math.abs(eye.width - eyeSamples[0][i].width) < 0.001, "Expression changes eye height only");
      eye.position.forEach((value, axis) => assert.ok(Math.abs(value - eyeSamples[0][i].position[axis]) < 0.001, "Eyes stay in their reference positions"));
    });
  }
  const emotions = [0, 1, 2].map(emotion => render("thinking", false, false, "3", 900, false, false, emotion, true));
  assert.notDeepEqual(emotions[0].eyeSamples, emotions[1].eyeSamples, "Remembering and weighing have distinct choreography");
  assert.notDeepEqual(emotions[1].eyeSamples, emotions[2].eyeSamples, "Curiosity has its own choreography");
  for (const [emotion, { eyeSamples }] of emotions.entries()) {
    const widths = eyeSamples.map(eyes => eyes[0].width);
    assert.ok(Math.max(...widths) - Math.min(...widths) > 2, "Perspective changes eye size as the face turns");
    for (const eyes of eyeSamples) {
      const [near, far] = eyes.slice().sort((a, b) => Math.hypot(...a.position) - Math.hypot(...b.position));
      assert.ok(near.width > far.width && near.height > far.height, "The eye closer to the center is larger");
      for (const eye of eyes) for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 40) {
        const x = Math.cos(angle) * eye.width, y = Math.sin(angle) * eye.height;
        const px = eye.position[0] + x * Math.cos(eye.spin) - y * Math.sin(eye.spin);
        const py = eye.position[1] + x * Math.sin(eye.spin) + y * Math.cos(eye.spin);
        assert.ok(Math.hypot(px, py) < 32, "Every emotion keeps the eyes inside the circular face");
      }
    }
    assert.deepEqual(render("thinking", true, false, "3", 900, false, false, emotion).paths,
      render("thinking", true, true, "3", 30, false, false, emotion).paths, "Reduced motion stays static regardless of time or noise");
    render("thinking", false, false, "3", 240, false, true, emotion);
  }
  const speaking = render("listening", false, true, "3", 900, true);
  const nods = speaking.nodSamples;
  const nodWidths = speaking.eyeSamples.map(eyes => eyes[0].width);
  assert.ok(Math.max(...nodWidths) - Math.min(...nodWidths) > 0.005, "Nodding updates eye perspective instead of sliding a flat face");
  for (const [left, right] of speaking.eyeSamples) {
    assert.ok(left.position[0] + right.position[0] > 12 && left.position[1] < -4 && right.position[1] < -4, "Nodding keeps the upper-right gaze");
    assert.ok(left.width > right.width && left.height > right.height, "Nods and blinks preserve the near/far perspective");
    assert.ok(Math.abs(left.height / left.width * Math.cos(0.44 - 24 * Math.PI / 180)
      - right.height / right.width * Math.cos(0.44 + 24 * Math.PI / 180)) < 0.001, "Both eyes blink together during speech");
  }
  const nodStarts = [];
  let activeFrames = 0;
  nods.forEach((value, i) => {
    if (value > 0.1) {
      if (!(nods[i - 1] > 0.1)) nodStarts.push(i);
      activeFrames++;
      assert.ok(activeFrames <= 12, "Cartoon nod finishes within 400ms");
    } else activeFrames = 0;
  });
  assert.ok(nodStarts.length >= 12 && nodStarts.length <= 16, "Sustained speech receives occasional double nods");
  nodStarts.slice(1).forEach((start, i) => {
    const gap = start - nodStarts[i];
    assert.ok(i % 2 === 0 ? gap >= 9 && gap <= 13 : gap >= 85 && gap <= 95,
      "Nods arrive in quick pairs at the approved 1× pace, about every 3.4 seconds");
  });
  assert.ok(Math.max(...nods) > 2 && Math.max(...nods) <= 3.5, "Eyes make a small but readable nod");
  const interrupted = render("listening", false, true, "3", 450, true, false, 0, false, 236);
  assert.ok(interrupted.nodSamples.some(value => value > 0.1), "Speech triggers a response before falling silent");
  assert.ok(interrupted.nodSamples.slice(236 - 180 + 20).every(value => Math.abs(value) < 0.001),
    "An interrupted response settles and does not restart while quiet");
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

test("laptop speech below the old energy floor stays listening until a real pause", async () => {
  const h = browser();
  const { socket, context } = await h.connect();
  socket.message({ type: "ready" });
  let now = 1000;
  const feed = level => {
    h.sandbox.performance.now = () => now;
    context.processor.onaudioprocess({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
    now += 4096 / 48000 * 1000;
  };
  // Rounded RMS levels from the laptop trace that submitted mid-sentence.
  const speech = [0.01281, 0.00994, 0.01315, 0.01335, 0.01249, 0.01233,
    0.01027, 0.01394, 0.01265, 0.01216, 0.01144, 0.00869, 0.00531,
    0.01269, 0.0111, 0.01154, 0.01109, 0.00875, 0.00991, 0.00901, 0.00638, 0.00526];
  for (let i = 0; i < 10; i++) feed(0.0005);
  feed(0.01471);
  for (let i = 0; i < 8; i++) feed(0.01);
  feed(0.01577);
  for (let i = 0; i < 150; i++) {
    feed(speech[i % speech.length]);
    assert.equal(h.ui.root.dataset.state, "listening", `Speech cut off at frame ${i}`);
  }
  for (let i = 0; i < 24; i++) feed(0.0005);
  assert.equal(socket.messages.filter(message => message.type === "commit").length, 1);
  assert.equal(h.ui.root.dataset.state, "thinking");
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

test("unmatched commands trigger eye feedback without moving the button", async () => {
  const h = browser();
  const { socket, track } = await h.connect();
  socket.message({ type: "ready" });
  socket.message({ type: "noop" });
  assert.equal(h.animations.length, 0);
  assert.ok(!h.ui.root.dataset.fallback);
  socket.message({ type: "decision", action: "clarify", hypotheses: [] });
  const first = h.ui.root.dataset.fallback;
  assert.ok(first, "An unmatched decision starts fallback feedback");
  assert.equal(h.animations.length, 0, "The button never animates");
  assert.equal(h.ui.root.dataset.state, "listening");
  assert.equal(track.stopped, false);
  socket.message({ type: "decision", action: "noop" });
  assert.ok(h.ui.root.dataset.fallback && h.ui.root.dataset.fallback !== first, "Each failed command gets one new reaction");
  socket.message({ type: "decision", action: "show", section: "codev" });
  assert.ok(!h.ui.root.dataset.fallback, "Successful navigation cancels fallback");
  socket.message({ type: "final" });
  socket.message({ type: "noop" });
  assert.ok(!h.ui.root.dataset.fallback, "Empty silence is not a failed command");
  socket.message({ type: "decision", action: "noop" });
  socket.message({ type: "speech_started" });
  assert.ok(!h.ui.root.dataset.fallback, "New speech interrupts feedback");
  socket.message({ type: "decision", action: "noop" });
  socket.message({ type: "delta", text: "Buka CoDev" });
  assert.ok(!h.ui.root.dataset.fallback, "A caption also interrupts feedback without a speech-start event");
  socket.message({ type: "decision", action: "noop" });
  h.escape();
  assert.ok(!h.ui.root.dataset.fallback, "Stopping clears feedback");
  assert.equal(h.animations.length, 0);
  const reduced = browser({ reducedMotion: true });
  const r = await reduced.connect();
  r.socket.message({ type: "ready" });
  r.socket.message({ type: "decision", action: "noop" });
  assert.equal(reduced.animations.length, 0);
  assert.match(reduced.ui.status.textContent, /belum ditemukan/i);
  reduced.escape();
});

test("fallback shakes its eyes once and returns within 500 ms with a stationary orb", () => {
  const setup = (reduced = false) => {
    let frame, next, now = 1000;
    const root = { dataset: { state: "listening", speaking: "false" }, style: { setProperty() {} } };
    const ctx = {
      clearRect() { frame = { layers: [] }; },
      translate(x, y) { if (!frame.center) frame.center = [x, y]; else frame.layers.push({ position: [x, y], path: [] }); },
      rotate(angle) { frame.layers.at(-1).spin = angle; },
      moveTo(x, y) { frame.layers.at(-1).path.push([x, y]); },
      lineTo(x, y) { frame.layers.at(-1).path.push([x, y]); },
      roundRect(x, y, w) { frame.radius = w / 2; },
      fill() { frame.layers.at(-1).color = this.fillStyle; },
      save() {}, restore() {}, beginPath() {}, closePath() {}, clip() {}, fillRect() {}, setTransform() {},
    };
    const canvas = { clientWidth: 88, closest: () => root, getContext: () => ctx };
    const window = Object.assign(new EventTarget(), {
      matchMedia: () => Object.assign(new EventTarget(), { matches: reduced }),
    });
    const sandbox = vm.createContext({
      canvas, window, document: new EventTarget(), performance: { now: () => now },
      getComputedStyle: () => ({ getPropertyValue: name => name }),
      requestAnimationFrame(fn) { assert.ok(!reduced); next = fn; return 1; }, cancelAnimationFrame() {},
    });
    const wave = vm.runInContext(`${source}\ncreateWaveform(canvas)`, sandbox);
    const run = (count, step = 1000 / 60) => Array.from({ length: count }, () => { now += step; next(now); return frame; });
    if (!reduced) run(120);
    return { root, wave, run, get frame() { return frame; } };
  };
  const h = setup(), baseline = h.frame;
  h.root.dataset.fallback = "1";
  h.wave.refresh();
  const frames = h.run(30);
  const center = frame => (frame.layers[1].position[0] + frame.layers[2].position[0]) / 2;
  const centers = frames.map(center);
  assert.equal(centers.filter((value, i) => value < -10 && (i === 0 || centers[i - 1] >= -10)).length, 1,
    "Eyes make one decisive sweep left");
  assert.ok(centers.slice(centers.indexOf(Math.min(...centers))).some(value => value > 10),
    "The sweep returns decisively right before settling");
  const atHome = frame => frame.layers.slice(1).every((layer, i) =>
    layer.position.every((value, axis) => Math.abs(value - baseline.layers[i + 1].position[axis]) < 0.03)
      && layer.path.every((point, j) => point.every((value, axis) => Math.abs(value - baseline.layers[i + 1].path[j][axis]) < 0.03)));
  assert.ok(atHome(frames.at(-1)), "Entry, shake, and return all finish within 500 ms");
  assert.ok(frames.some(frame => frame.layers[1].path[0][0] > frame.layers[2].path[0][0] * 2),
    "The eye nearest the center becomes larger when looking left");
  assert.ok(frames.some(frame => frame.layers[2].path[0][0] > 9), "Fast sweeps stretch the eyes cartoonishly");
  for (const frame of frames) {
    assert.deepEqual(frame.center, [44, 44]);
    assert.ok(Math.abs(frame.radius - 34) < 0.001, "Orb size stays fixed");
    assert.deepEqual(frame.layers.map(layer => layer.color), baseline.layers.map(layer => layer.color));
    for (const layer of frame.layers.slice(1)) for (const [x, y] of layer.path) {
      const px = layer.position[0] + x * Math.cos(layer.spin) - y * Math.sin(layer.spin);
      const py = layer.position[1] + x * Math.sin(layer.spin) + y * Math.cos(layer.spin);
      assert.ok(Math.hypot(px, py) < 34, "Cartoon eyes remain inside the orb");
    }
  }
  assert.ok(h.run(120).every(atHome), "The same fallback event cannot loop or restart");
  h.root.dataset.fallback = "2"; h.wave.refresh(); h.run(8);
  assert.ok(!atHome(h.frame), "A new fallback can play again");
  const outgoing = h.frame;
  h.root.dataset.fallback = ""; h.root.dataset.speaking = "true"; h.wave.refresh();
  assert.ok(Math.abs(center(h.frame) - center(outgoing)) < 5, "Interrupting blends out instead of snapping");
  assert.ok(atHome(h.run(45).at(-1)), "New speech recovers the listening pose");
  h.root.dataset.speaking = "false"; h.root.dataset.fallback = "3"; h.wave.refresh();
  assert.ok(atHome(h.run(5, 100).at(-1)), "Dropped frames cannot stretch the reaction beyond 500 ms");
  h.root.dataset.fallback = "4"; h.wave.refresh(); h.run(8);
  const beforeStop = center(h.frame);
  h.root.dataset.fallback = ""; h.root.dataset.state = "idle"; h.wave.refresh();
  assert.ok(Math.abs(center(h.frame) - beforeStop) < 5, "Stopping the session also blends out");
  const reduced = setup(true), still = reduced.frame;
  reduced.root.dataset.fallback = "1"; reduced.wave.refresh();
  const reaction = reduced.frame;
  assert.notDeepEqual(reaction.layers, still.layers, "Reduced motion uses a static listening reaction");
  reduced.wave.refresh(); assert.deepEqual(reduced.frame, reaction);
  reduced.root.dataset.fallback = ""; reduced.wave.refresh();
  assert.deepEqual(reduced.frame, still);
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
