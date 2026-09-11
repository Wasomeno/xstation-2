import { VOICE_BOX_URL, VOICE_BOX_WS } from "./voice-config.js?v=same-origin-2";

const WAKE_WORKER_URL = new URL("./wake-worker.js?v=hei-id-1", import.meta.url);

const TARGET_RATE = 24000;
const DESKTOP_VOICE = window.matchMedia(
  "(min-width: 68.0625rem) and (hover: hover) and (pointer: fine)",
);
let voiceInitialized = false;

const COPY = {
  idle: "Aktifkan mikrofon untuk memanggil Nadi · Eksperimental",
  loading: "Menyiapkan pendengar lokal…",
  armed: 'Ucapkan “Hei Nadi” · Eksperimental',
  paused: "Mikrofon dijeda saat halaman tidak aktif.",
  resume: "Ketuk untuk melanjutkan mikrofon.",
  modelError: "Pendengar lokal gagal dimuat. Ketuk untuk mencoba lagi.",
  deaf: "Koneksi suara terputus. Ketuk untuk mencoba lagi.",
  blocked: "Izinkan mikrofon di browser, lalu ketuk untuk mencoba lagi.",
  unsupported: "Mikrofon tidak tersedia. Coba browser lain.",
  connecting: "Menghubungkan…",
  listening: "Mendengarkan…",
  thinking: "Memproses…",
  cancel: "Batalkan koneksi",
  start: "Mulai mendengarkan",
  stop: "Berhenti mendengarkan",
};

function downsample(input, inRate, outRate) {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    output[i] = input[Math.floor(i * ratio)] || 0;
  }
  return output;
}

function floatToPcm16Base64(float32) {
  const bytes = new Uint8Array(float32.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < float32.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, float32[i]));
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function voiceEnergy(waveform, frequency) {
  let sum = 0;
  for (const sample of waveform) sum += ((sample - 128) / 128) ** 2;
  const rms = Math.sqrt(sum / (waveform.length || 1));
  let band = 0;
  const count = Math.min(48, frequency.length);
  for (let i = 0; i < count; i += 1) band += frequency[i] / 255;
  // A small noise floor keeps a quiet room calm even with analyser smoothing.
  return Math.min(1, Math.max(0, rms - 0.008) * (5 + band / (count || 1) * 3));
}

function smoothVoiceEnergy(current, target, seconds) {
  const duration = target > current ? 0.075 : 0.3;
  return current + (target - current) * (1 - Math.exp(-seconds / duration));
}

function createPauseDetector() {
  let active = false;
  let heardVoice = false;
  let lastSpeech = 0;
  let noise = 0.003;
  let peak = 0;
  let lastUpdate = 0;
  return {
    reset() { active = false; heardVoice = false; },
    transcript(now) {
      active = true;
      // Quiet speech can start a turn, but trailing captions cannot prolong an audible one.
      if (!heardVoice) lastSpeech = now;
    },
    update(input, now) {
      let sum = 0;
      for (const sample of input) sum += sample * sample;
      const rms = Math.sqrt(sum / (input.length || 1));
      const seconds = lastUpdate ? Math.min((now - lastUpdate) / 1000, 0.25) : 1 / 60;
      lastUpdate = now;
      peak = Math.max(rms, peak * Math.exp(-seconds / 2));
      // Require a stronger onset, then tolerate softer syllables in the same sentence.
      // Laptop speech can fall below 0.012 RMS even at a steady speaking volume.
      const threshold = Math.max(0.003, noise * (heardVoice ? 1.5 : 2.5), peak * 0.35);
      if (rms < threshold) {
        // Learn the quieter room level even while a command is active.
        noise += (rms - noise) * (1 - Math.exp(-seconds / 0.3));
      }
      if (rms >= threshold) {
        const started = !active;
        active = true;
        heardVoice = true;
        lastSpeech = now;
        return started ? "start" : null;
      }
      // Allow a breath mid-sentence without letting background captions extend the turn.
      if (active && now - lastSpeech >= 1800) {
        active = false;
        heardVoice = false;
        return "commit";
      }
      return null;
    },
  };
}

// Time, yaw, pitch, tilt, curiosity: remembering, weighing, and curious.
const THINKING_GESTURES = [
  [[0, .12, -.06, 0, 0], [.5, .12, -.06, 0, 0], [1.1, -.35, -.34, -.035, 0], [3, -.35, -.34, -.035, 0], [3.55, .32, -.27, .025, 0], [5.5, .32, -.27, .025, 0], [6.15, .12, -.06, 0, 0], [7.4, .12, -.06, 0, 0]],
  [[0, .12, -.06, 0, 0], [.4, .12, -.06, 0, 0], [.8, -.5, -.055, -.025, 0], [2, -.5, -.055, -.025, 0], [2.45, .5, -.055, .025, 0], [3.8, .5, -.055, .025, 0], [4.15, -.27, -.08, -.015, 0], [4.95, -.27, -.08, -.015, 0], [5.45, .12, -.06, 0, 0], [6.5, .12, -.06, 0, 0]],
  [[0, .12, -.06, 0, 0], [.6, .12, -.06, 0, 0], [1.15, .4, -.11, .16, 1], [3, .4, -.11, .16, 1], [3.55, .08, -.05, 0, 0], [4.2, .08, -.05, 0, 0], [4.85, -.4, -.14, -.14, 1], [6.4, -.4, -.14, -.14, 1], [7.1, .12, -.06, 0, 0], [8, .12, -.06, 0, 0]],
];

function thinkingEyePose(emotion, time) {
  const frames = THINKING_GESTURES[emotion];
  const t = time % frames.at(-1)[0];
  const next = frames.findIndex(frame => frame[0] > t);
  const a = frames[next - 1], b = frames[next];
  const p = (t - a[0]) / (b[0] - a[0]);
  const ease = 1 + 1.8 * (p - 1) ** 3 + 0.8 * (p - 1) ** 2;
  const [yaw, pitch, tilt, curious] = a.slice(1).map((value, axis) => value + (b[axis + 1] - value) * ease);
  const blinkTime = (time + emotion * 0.7) % 7.9;
  const blink = 1 - 0.9 * Math.exp(-(((blinkTime - 6.4) / 0.085) ** 2));
  return projectFaceEyes(yaw, pitch, tilt).map((pose, eye) => ({
    ...pose,
    ry: pose.ry * blink * (1 + curious * (eye === (yaw > 0 ? 0 : 1) ? 0.07 : -0.37)),
  }));
}

function projectFaceEyes(yaw, pitch, tilt = 0) {
  return [-0.44, 0.44].map(offset => {
    const longitude = offset + yaw;
    const depth = Math.cos(longitude) * Math.cos(pitch);
    const perspective = 2.4 / (3.4 - depth);
    const scale = (depth * perspective) ** 0.65;
    const x = 0.83 * Math.sin(longitude) * Math.cos(pitch) * perspective;
    const y = 0.83 * Math.sin(pitch) * perspective;
    return {
      x: x * Math.cos(tilt) - y * Math.sin(tilt),
      y: x * Math.sin(tilt) + y * Math.cos(tilt),
      rx: 0.26 * scale * Math.cos(longitude),
      ry: 0.43 * scale,
      spin: tilt - longitude * 0.08,
    };
  });
}

// One 500 ms shake: time, yaw, pitch, eye-pair roll, eye height.
const FALLBACK_GESTURE = [
  [0, 24 * Math.PI / 180, -18 * Math.PI / 180, 0, 1], [.05, .28, -.20, -.025, .80],
  [.14, -.68, -.09, .10, 1.10], [.18, -.54, -.09, .045, .92],
  [.28, .68, -.09, -.10, 1.10], [.34, .47, -.15, -.025, .97],
  [.42, .35, -.27, .012, 1], [.50, 24 * Math.PI / 180, -18 * Math.PI / 180, 0, 1],
];

function fallbackEyePose(time) {
  let next = FALLBACK_GESTURE.findIndex(frame => frame[0] > time);
  if (next < 0) next = FALLBACK_GESTURE.length - 1;
  const a = FALLBACK_GESTURE[next - 1], b = FALLBACK_GESTURE[next];
  const p = Math.min(1, (time - a[0]) / (b[0] - a[0]));
  const ease = p * p * (3 - 2 * p);
  const [yaw, pitch, roll, height] = a.slice(1).map((value, axis) => value + (b[axis + 1] - value) * ease);
  const velocity = (b[1] - a[1]) / (b[0] - a[0]) * 6 * p * (1 - p);
  const sweep = Math.min(1, Math.abs(velocity) / 12);
  return projectFaceEyes(yaw, pitch, roll).map(pose => ({
    ...pose,
    rx: pose.rx * (1 + .42 * sweep),
    ry: pose.ry * height * (1 - .27 * sweep),
    spin: pose.spin + Math.sign(velocity) * .12 * sweep,
  }));
}

// Variant 3: layered idle circles unfold into an attentive, expressive face.
function createWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { setAnalyser() {}, refresh() {} };
  const root = canvas.closest("#voice-surface");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tokens = getComputedStyle(root);
  const palette = ["--deep-forest", "--signal", "--sage", "--mist"].map((name) => tokens.getPropertyValue(name).trim());
  let frequency = new Uint8Array(128);
  let waveform = new Uint8Array(256);
  let analyser = null;
  let energy = 0;
  let phase = 0;
  let expressionTime = 0;
  let thinkingTime = 0;
  let thinkingEmotion = 0;
  let previousState = "";
  let fallbackEvent = "";
  let fallbackStarted = 0;
  let fallbackTime = FALLBACK_GESTURE.at(-1)[0];
  let fallbackBlend = 0;
  let speechTime = 0;
  let speechWeight = 0;
  let nodTime = 0.76;
  let nodCooldown = 0;
  let visualRadius = 24;
  let visualFace = 0;
  let curiosity = 0;
  let lastTime = 0;
  let raf = 0;
  let size = 88;

  const draw = (now = performance.now()) => {
    // RAF timestamps can predate a synchronous refresh within the same frame.
    now = Math.max(now, lastTime);
    raf = 0;
    if (document.hidden) return;
    const state = root.dataset.state;
    if (state === "thinking" && previousState !== state) {
      thinkingEmotion = Math.floor(Math.random() * THINKING_GESTURES.length);
      thinkingTime = 0;
    }
    previousState = state;
    const feedback = root.dataset.fallback || "";
    if (feedback && feedback !== fallbackEvent) {
      fallbackTime = 0;
      fallbackStarted = now;
    }
    fallbackEvent = feedback;
    const failed = state === "deaf" || state === "blocked";
    const listening = state === "listening";
    const processing = state === "thinking" || state === "connecting";
    const seconds = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 1 / 60;
    lastTime = now;
    let target = 0;
    if (analyser && listening && !motion.matches) {
      analyser.getByteTimeDomainData(waveform);
      analyser.getByteFrequencyData(frequency);
      target = Math.pow(voiceEnergy(waveform, frequency), 0.65);
    }
    energy = motion.matches || failed ? 0 : smoothVoiceEnergy(energy, target, seconds);
    const targetFace = !failed && (listening || processing) ? 1 : 0;
    visualFace = motion.matches || failed ? targetFace
      : visualFace + (targetFace - visualFace) * (1 - Math.exp(-seconds / 0.12));
    const morph = visualFace * visualFace * (3 - 2 * visualFace);
    const targetCuriosity = state === "thinking" ? 1 : 0;
    curiosity = motion.matches || failed ? targetCuriosity
      : curiosity + (targetCuriosity - curiosity) * (1 - Math.exp(-seconds / 0.12));
    const speed = 0.08 + (0.65 + energy * 0.25 - 0.08) * visualFace;
    if (!motion.matches && !failed) phase += seconds * speed;
    if (!motion.matches && !failed) expressionTime = targetFace ? expressionTime + seconds : 0;
    const t = motion.matches || failed ? 0 : phase;
    const targetRadius = listening ? 34 : state === "thinking" ? 32 : processing ? 30 : 24;
    visualRadius = motion.matches || failed ? targetRadius
      : visualRadius + (targetRadius - visualRadius) * (1 - Math.exp(-seconds / 0.12));
    const radius = size * (visualRadius / 88);
    root.style.setProperty("--voice-shadow-scale", radius / 24);
    const alive = !motion.matches && !failed;
    if (alive && state === "thinking") thinkingTime += seconds;
    const reacting = Boolean(feedback) && listening
      && (motion.matches || fallbackTime < FALLBACK_GESTURE.at(-1)[0]);
    // Use elapsed time so dropped frames cannot prolong the 500 ms reaction.
    if (alive && reacting) fallbackTime = Math.min(FALLBACK_GESTURE.at(-1)[0], (now - fallbackStarted) / 1000);
    const entry = Math.min(1, fallbackTime / .05);
    // Entry is included in the gesture; only interruptions need an outgoing blend.
    fallbackBlend = motion.matches || failed ? Number(reacting)
      : fallbackTime >= FALLBACK_GESTURE.at(-1)[0] ? 0
      : reacting ? entry * entry * (3 - 2 * entry)
      : fallbackBlend * Math.exp(-seconds / .09);
    const fallback = fallbackBlend > .001 ? fallbackEyePose(motion.matches ? .18 : fallbackTime) : null;
    const hearingSpeech = alive && listening && root.dataset.speaking === "true" && energy > 0.12;
    speechWeight = alive ? speechWeight + (Number(hearingSpeech) - speechWeight) * (1 - Math.exp(-seconds / 0.16)) : 0;
    nodCooldown = Math.max(0, nodCooldown - seconds);
    if (alive && listening) {
      speechTime = hearingSpeech ? speechTime + seconds : 0;
      if (speechTime >= 0.75 && nodCooldown === 0) {
        nodTime = 0;
        nodCooldown = 3.4;
        speechTime = 0;
      }
      nodTime = Math.min(0.76, nodTime + seconds);
    } else {
      speechTime = 0;
      nodTime = alive ? Math.min(0.76, nodTime + seconds) : 0.76;
    }
    // Two quick cartoon dips, each with a crisp ease-out return.
    const nodProgress = (nodTime % 0.38) / 0.38;
    const nod = nodTime < 0.76
      ? (nodProgress < 0.28 ? (nodProgress / 0.28) ** 2 : ((1 - nodProgress) / 0.72) ** 3) * morph * speechWeight
      : 0;
    // B · Memahami: look screen-right and up; nod along the same sphere as thinking.
    const listeningPose = [
      ...projectFaceEyes(24 * Math.PI / 180, -18 * Math.PI / 180 + nod * 0.11),
      { x: -0.094579, y: 0.678436, rx: 0.161412, ry: 0.107188, spin: 0 },
    ];
    // Freeze the outgoing pose while it blends back into the other states.
    const thinkingPose = curiosity > 0.001 ? [
      ...thinkingEyePose(thinkingEmotion, motion.matches ? [1.8, 2.9, 2][thinkingEmotion] : thinkingTime),
      { x: 0.372745, y: 0.605300, rx: 0.112107, ry: 0.059774, spin: -0.596200 },
    ] : listeningPose;
    // Quiet listening stays still apart from a brief natural blink.
    const blinkPhase = (expressionTime + 0.65) % 8.8;
    const blink = alive ? 1 - 0.9 * Math.exp(-(((blinkPhase - 7.6) / 0.09) ** 2)) : 1;
    // Match the original rotate-then-translate orbit, even while a face is visible.
    const idlePose = [0, 1, 2].map(layer => {
      const spin = t * (layer === 1 ? -0.7 : 1) + layer * 2.1;
      const offset = 0.3 - layer * 0.25;
      return {
        x: offset * Math.cos(spin) - 0.22 * Math.sin(spin),
        y: offset * Math.sin(spin) + 0.22 * Math.cos(spin),
        rx: 1.06 - layer * 0.19,
        ry: 1.06 - layer * 0.19,
        spin,
      };
    });
    const amplitude = 0.025 * (1 - morph);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.roundRect(-radius, -radius, radius * 2, radius * 2, radius);
    ctx.clip();
    ctx.fillStyle = failed ? palette[0] : palette[1];
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    for (let layer = 0; layer < 3; layer += 1) {
      // Preserve each idle circle’s color and stacking order; move it to its facial role.
      const role = 2 - layer;
      const feature = {};
      const from = idlePose[layer];
      const to = {};
      for (const key of ["x", "y", "rx", "ry", "spin"]) {
        to[key] = listeningPose[role][key] + (thinkingPose[role][key] - listeningPose[role][key]) * curiosity;
      }
      if (role < 2) {
        // Each thinking emotion keeps its own blink.
        to.ry *= 1 + (blink - 1) * (1 - curiosity);
      } else to.ry *= 1 + energy * 0.16;
      if (role < 2 && fallback) {
        for (const key of ["x", "y", "rx", "ry", "spin"]) {
          to[key] += (fallback[role][key] - to[key]) * fallbackBlend;
        }
      }
      const turn = Math.PI * 2;
      let delta = ((to.spin - from.spin) % turn + turn) % turn;
      if (layer === 1 && delta !== 0) delta -= turn;
      feature.x = from.x + (to.x - from.x) * morph;
      feature.y = from.y + (to.y - from.y) * morph + (role === 2 ? nod * 0.03 : 0);
      feature.rx = from.rx + (to.rx - from.rx) * morph;
      feature.ry = from.ry + (to.ry - from.ry) * morph;
      feature.spin = from.spin + delta * morph;
      ctx.save();
      ctx.globalAlpha = role === 2 ? 1 - morph : 1;
      ctx.translate(feature.x * radius, feature.y * radius);
      ctx.rotate(feature.spin);
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const angle = i / 80 * Math.PI * 2;
        const wave = Math.sin(angle * 2 + t + layer) + Math.sin(angle * 3 - t * 0.8) * 0.35
          + Math.sin(angle * 5 + t * 1.35 + layer * 2) * 0.28 * visualFace;
        const x = Math.cos(angle) * radius * feature.rx * (1 + wave * amplitude);
        const y = Math.sin(angle) * radius * feature.ry * (1 + wave * amplitude);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = failed ? palette[0] : [palette[0], palette[2], palette[3]][layer];
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    if (!motion.matches && !failed) raf = requestAnimationFrame(draw);
  };

  const refresh = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    lastTime = 0;
    draw();
  };
  const fit = () => {
    size = canvas.clientWidth || 88;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    refresh();
  };
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", refresh);
  motion.addEventListener("change", refresh);
  fit();
  return {
    refresh,
    setAnalyser(node) {
      analyser = node;
      energy = 0;
      if (node) {
        frequency = new Uint8Array(node.frequencyBinCount);
        waveform = new Uint8Array(node.fftSize);
      }
      refresh();
    },
  };
}


function createSurface() {
  const root = document.createElement("div");
  root.id = "voice-surface";
  root.lang = "id";
  root.hidden = true;
  root.dataset.state = "idle";
  root.innerHTML = `
    <div class="voice-copy">
      <p class="voice-status" role="status" aria-live="polite"></p>
      <p class="voice-transcript"></p>
    </div>
    <button class="voice-orb" type="button" aria-pressed="false" aria-label="Mulai mendengarkan">
      <canvas class="voice-wave" width="88" height="88" aria-hidden="true"></canvas>
    </button>
  `;
  document.body.append(root);
  const canvas = root.querySelector(".voice-wave");
  return {
    root,
    button: root.querySelector(".voice-orb"),
    status: root.querySelector(".voice-status"),
    transcript: root.querySelector(".voice-transcript"),
    wave: createWaveform(canvas),
  };
}

function createStateSound() {
  let context;
  let latest = 0;
  const active = new Set();
  const notes = {
    armed: [740, 1100], connecting: [520, 780], listening: [740, 1100], thinking: [620, 440],
    deaf: [260, 180], blocked: [220, 160], fallback: [900],
  };
  return async (state) => {
    const turn = ++latest;
    for (const cancel of active) cancel();
    active.clear();
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !notes[state]) return;
    try {
      context ||= new Audio();
      if (context.state === "suspended") await context.resume();
      if (turn !== latest || context.state !== "running") return;
      notes[state].forEach((frequency, index) => {
        const start = context.currentTime + index * 0.085;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const shake = state === "fallback";
        const duration = shake ? FALLBACK_GESTURE.at(-1)[0] : 0.12;
        oscillator.type = shake ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(shake ? 100 : frequency * 0.7, start + duration);
        gain.gain.setValueAtTime(0, start);
        if (shake) {
          FALLBACK_GESTURE.slice(1).forEach((frame, i) => {
            const previous = FALLBACK_GESTURE[i];
            const speed = Math.abs(frame[1] - previous[1]) / (frame[0] - previous[0]);
            gain.gain.linearRampToValueAtTime(0.012 + 0.043 * Math.min(1, speed / 12), start + (previous[0] + frame[0]) / 2);
            gain.gain.linearRampToValueAtTime(0.001, start + frame[0]);
          });
        } else {
          gain.gain.linearRampToValueAtTime(0.055, start + 0.006);
          gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
        }
        oscillator.connect(gain);
        gain.connect(context.destination);
        const cancel = () => { gain.disconnect(); oscillator.stop(); oscillator.disconnect(); };
        active.add(cancel);
        oscillator.onended = () => { active.delete(cancel); oscillator.disconnect(); gain.disconnect(); };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      });
    } catch {
      // Sound is optional: audio restrictions must never block voice control.
    }
  };
}

function bindVoice() {
  if (voiceInitialized || !DESKTOP_VOICE.matches) return;
  voiceInitialized = true;
  const ui = createSurface();
  ui.root.hidden = false;
  const sound = createStateSound();
  let enabled = false, sessionWanted = false, generation = 0, epoch = 0, reaction = 0;
  let stream, context, processor, worker, command;
  let modelReady = false, queuedSeconds = 0, loadingTimer;
  const setState = (state, text = COPY[state] || "", transcript = "", silent = false) => {
    const previous = ui.root.dataset.state;
    if (previous !== state) {
      // Resuming local listening after an app switch is silent.
      sound(silent || (state === "armed" && (previous === "paused" || previous === "resume")) ? "paused" : state);
    }
    ui.root.dataset.state = state;
    ui.status.textContent = text;
    ui.transcript.textContent = state === "listening" ? transcript : "";
    ui.root.dataset.speaking = "false";
    if (state !== "listening" || previous !== "listening") ui.root.dataset.fallback = "";
    ui.button.setAttribute("aria-pressed", String(enabled));
    ui.button.setAttribute("aria-label", state === "resume" ? "Lanjutkan mikrofon" : command ? "Akhiri percakapan" : enabled ? "Mulai percakapan" : "Aktifkan panggilan suara");
    ui.wave.refresh();
  };
  const closeCommand = () => {
    const old = command;
    command = null;
    if (!old) return;
    for (const timer of old.timers) clearTimeout(timer);
    old.pending.length = 0;
    try { if (old.socket.readyState === 1) old.socket.send(JSON.stringify({ type: "stop" })); } catch { /* Transport already failed. */ }
    if (old.socket.readyState < 2) old.socket.close();
  };
  const resetWake = () => {
    epoch += 1;
    queuedSeconds = 0;
    worker?.postMessage({ type: "reset", epoch });
  };
  const arm = (message) => {
    sessionWanted = false;
    closeCommand();
    resetWake();
    if (!enabled || !modelReady || !stream) return;
    setState(document.hidden ? "paused" : context.state === "running" ? "armed" : "resume", message);
  };
  const stop = (state = "idle", message) => {
    enabled = false; sessionWanted = false;
    generation += 1;
    clearTimeout(loadingTimer);
    closeCommand();
    worker?.terminate(); worker = null;
    if (processor) { processor.onaudioprocess = null; processor.disconnect(); processor = null; }
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    context?.close().catch(() => {}); context = null;
    modelReady = false;
    ui.wave.setAnalyser(null);
    setState(state, message);
  };
  const beginCommand = (phrase, silent = false) => {
    if (!enabled || document.hidden || !stream || !modelReady || command) return;
    sessionWanted = true;
    resetWake();
    const socket = new WebSocket(VOICE_BOX_WS);
    const c = { socket, pending: [], timers: [], ready: false, committed: false, heard: false, pause: createPauseDetector(), item: null, retired: new Set() };
    command = c;
    const current = () => enabled && command === c;
    const timer = (fn, ms) => { const id = setTimeout(() => { if (current()) fn(); }, ms); c.timers.push(id); return id; };
    const fail = () => { if (current()) arm(`Koneksi suara terputus. ${COPY.armed}`); };
    const send = (payload) => {
      if (!current()) return;
      if (c.ready && socket.readyState === 1) socket.send(JSON.stringify(payload));
      else c.pending.push(payload);
    };
    const nextTurn = (shake = false) => {
      for (const id of c.timers) clearTimeout(id);
      c.timers.length = 0;
      if (c.item) { c.retired.add(c.item); if (c.retired.size > 32) c.retired.delete(c.retired.values().next().value); }
      c.item = null; c.committed = false; c.heard = false; c.pause = createPauseDetector();
      setState("listening", COPY.listening, "", true);
      if (shake) {
        ui.root.dataset.fallback = String(++reaction); ui.wave.refresh(); sound("fallback");
        timer(() => { ui.root.dataset.fallback = ""; ui.wave.refresh(); }, 500);
      }
      // Flush silence too, so an unattended active session cannot grow one audio buffer forever.
      c.captureTimer = timer(c.commit, 30000);
    };
    c.commit = () => {
      if (!current() || c.committed || !c.ready) return;
      c.committed = true;
      clearTimeout(c.captureTimer);
      send({ type: "commit" });
      if (c.heard) setState("thinking");
      timer(fail, 30000);
    };
    c.send = send;
    const connectionTimer = timer(fail, 10000);
    setState("connecting", COPY.connecting, "", silent);
    if (phrase) window.dispatchEvent(new CustomEvent("nadi:wake", { detail: { phrase } }));
    socket.addEventListener("error", fail);
    socket.addEventListener("close", fail);
    socket.addEventListener("message", event => {
      if (!current()) return;
      let payload;
      try { payload = JSON.parse(event.data); } catch { return; }
      if (!payload || typeof payload !== "object") return;
      if (payload.type === "error") { fail(); return; }
      if (payload.type === "ready") {
        if (c.ready) return;
        c.ready = true; clearTimeout(connectionTimer);
        for (const pending of c.pending) socket.send(JSON.stringify(pending));
        c.pending.length = 0;
        c.captureTimer = timer(c.commit, 30000);
        setState("listening", COPY.listening, "", silent);
        return;
      }
      if (!c.ready || (payload.item_id && c.retired.has(payload.item_id))) return;
      if (payload.item_id && c.item && payload.item_id !== c.item) return;
      if (payload.item_id) c.item = payload.item_id;
      const text = payload.type === "delta" ? payload.text : payload.type === "final" ? payload.transcript : null;
      if (typeof text === "string" && /\b(?:thanks|terima\s*kasih)\b/iu.test(text.normalize("NFKC"))) { arm(); return; }
      if (payload.type === "decision" || payload.type === "noop") {
        if (!c.committed) return;
        let moved = false;
        if (payload.type === "decision") {
          moved = window.xstationPageAction?.(payload) === true;
          if (!window.xstationPageAction && payload.action === "show" && typeof payload.section === "string") {
            moved = window.xstationShowSection?.(payload.section) === true;
          }
        }
        nextTurn(c.heard && !moved);
        return;
      }
      if (c.committed) return;
      if (payload.type === "delta" && typeof text === "string" && text.trim()) {
        c.heard = true; c.pause.transcript(performance.now());
        setState("listening", COPY.listening, text.trim());
        ui.root.dataset.speaking = "true";
      }
    });
  };
  const readyToListen = (silent = false) => {
    if (!enabled || !modelReady || !stream || command) return;
    if (sessionWanted && !document.hidden && context.state === "running") {
      try { beginCommand(undefined, silent); } catch { arm(`Koneksi suara terputus. ${COPY.armed}`); }
    } else if (!sessionWanted) arm();
    else setState(document.hidden ? "paused" : "resume");
  };
  const capture = () => {
    const source = context.createMediaStreamSource(stream);
    const filter = context.createBiquadFilter();
    filter.type = "highpass"; filter.frequency.value = 150; filter.Q.value = Math.SQRT1_2;
    const analyser = context.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = .62;
    ui.wave.setAnalyser(analyser);
    processor = context.createScriptProcessor(4096, 1, 1);
    const mute = context.createGain(); mute.gain.value = 0;
    source.connect(filter); filter.connect(analyser); filter.connect(processor); processor.connect(mute); mute.connect(context.destination);
    processor.onaudioprocess = event => {
      if (!enabled || document.hidden || context.state !== "running") return;
      const input = event.inputBuffer.getChannelData(0);
      if (ui.root.dataset.state === "armed") {
        // Fail visibly instead of dropping speech or retaining unbounded room audio.
        queuedSeconds += input.length / context.sampleRate;
        if (queuedSeconds > 2) { stop("deaf", "Perangkat terlalu lambat untuk pendengar lokal. Ketuk untuk mencoba lagi."); return; }
        const samples = input.slice();
        worker.postMessage({ type: "audio", samples, sampleRate: context.sampleRate, epoch }, [samples.buffer]);
      }
      const c = command;
      if (!c || c.committed) return;
      c.send({ type: "audio", pcm: floatToPcm16Base64(downsample(input, context.sampleRate, TARGET_RATE)) });
      const action = c.pause.update(input, performance.now());
      if (action === "start") c.heard = true;
      if (action === "commit") c.commit();
    };
  };
  const enable = async () => {
    enabled = true; sessionWanted = true; const attempt = ++generation;
    const current = () => enabled && generation === attempt;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio || !navigator.mediaDevices?.getUserMedia || typeof Worker === "undefined") { stop("blocked", COPY.unsupported); return; }
    if (!window.crossOriginIsolated) { stop("blocked", "Pendengar lokal belum tersedia di halaman ini. Coba muat ulang."); return; }
    setState("loading");
    try {
      const audio = new Audio(); context = audio;
      audio.addEventListener("statechange", () => {
        if (!current() || document.hidden || audio.state === "running" || audio.state === "closed") return;
        closeCommand(); setState("resume"); resume();
      });
      const ready = audio.resume();
      worker = new Worker(WAKE_WORKER_URL);
      worker.addEventListener("error", () => { if (current()) stop("deaf", COPY.modelError); });
      worker.addEventListener("message", ({ data }) => {
        if (!current()) return;
        if (data.type === "error") { stop("deaf", COPY.modelError); return; }
        if (data.type === "ready") { modelReady = true; clearTimeout(loadingTimer); readyToListen(); }
        if (data.epoch !== epoch) return;
        if (data.type === "processed") queuedSeconds = Math.max(0, queuedSeconds - data.seconds);
        if (data.type === "wake" && data.phrase === "Hei Nadi" && ui.root.dataset.state === "armed") {
          try { beginCommand(data.phrase); } catch { arm(`Koneksi suara terputus. ${COPY.armed}`); }
        }
      });
      loadingTimer = setTimeout(() => { if (current()) stop("deaf", COPY.modelError); }, 60000);
      const mic = navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(media => {
        if (!current()) { media.getTracks().forEach(track => track.stop()); return; }
        stream = media;
        media.getAudioTracks().forEach(track => track.addEventListener("ended", () => { if (current()) stop("blocked"); }));
      });
      await Promise.all([ready, mic]);
      if (!current()) return;
      capture();
      if (document.hidden) stream.getTracks().forEach(track => { track.enabled = false; });
      if (current() && modelReady) readyToListen();
    } catch { if (current()) stop("blocked"); }
  };
  const resume = async () => {
    const attempt = generation;
    const audio = context;
    try {
      if (audio.state !== "running") { setState("resume"); await audio.resume(); }
      if (!enabled || generation !== attempt || document.hidden) return;
      if (audio.state !== "running") { setState("resume"); return; }
      stream.getTracks().forEach(track => { track.enabled = true; });
      if (modelReady) readyToListen(true); else setState("loading");
    } catch { if (enabled && generation === attempt) setState("resume"); }
  };
  ui.button.addEventListener("click", () => {
    if (enabled && ui.root.dataset.state === "resume") resume();
    else if (enabled && command) arm();
    else if (enabled && ui.root.dataset.state === "armed") {
      try { beginCommand(); } catch { arm(); }
    } else if (enabled) stop();
    else enable();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && enabled) stop(); });
  document.addEventListener("visibilitychange", () => {
    if (!enabled || !context) return;
    if (document.hidden) {
      closeCommand(); resetWake(); setState("paused");
      stream?.getTracks().forEach(track => { track.enabled = false; });
      // Keep the audio graph alive; tracks and uploads are paused above.
    } else if (stream) resume();
  });
  window.addEventListener("pagehide", () => stop());
  setState("idle");
}

bindVoice();
DESKTOP_VOICE.addEventListener("change", ({ matches }) => { if (matches) bindVoice(); });
