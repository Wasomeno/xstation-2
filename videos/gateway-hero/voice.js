import { VOICE_AGENT_ID, VOICE_BOX_URL, VOICE_BOX_WS } from "./voice-config.js?v=agent-1";
import { createStage } from "./voice-stage.js?v=stage-15";
import { createAttract } from "./voice-attract.js?v=loop-15";
import { createChirps, createMascot } from "./voice-mascot.js?v=flat-3";

const WAKE_WORKER_URL = new URL("./wake-worker.js?v=hei-paths-3", import.meta.url);

// Pinned: the ElevenLabs browser SDK is only fetched when agent mode starts a conversation.
const AGENT_SDK_URL = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.35.0/+esm";
let loadAgentSdk = () => import(AGENT_SDK_URL);
const AGENT_IDLE_MS = 45000;
// How long a connected agent is given to start its greeting before the mascot stops waiting for it.
const AGENT_GREETING_MS = 4000;
const AGENT_CUE_LEAD_MS = 250;

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
  speaking: "Nadi berbicara…",
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

// One 500 ms shake of the head when an action could not run: [second, turn]. The mascot's gaze
// follows the turns and the tone pulses with them.
const FALLBACK_GESTURE = [
  [0, 24 * Math.PI / 180], [.05, .28], [.14, -.68], [.18, -.54],
  [.28, .68], [.34, .47], [.42, .35], [.50, 24 * Math.PI / 180],
];

// The voice the mascot reacts to: the visitor's microphone while it listens, the agent's playback
// while it speaks. `update` is called once a frame and returns the smoothed loudness, 0 to 1.
function createVoiceLevel() {
  let frequency = new Uint8Array(128);
  let waveform = new Uint8Array(256);
  let analyser = null;
  let output = null;
  let energy = 0;
  return {
    update(seconds, state) {
      let target = 0;
      if (analyser && state === "listening") {
        analyser.getByteTimeDomainData(waveform);
        analyser.getByteFrequencyData(frequency);
        target = Math.pow(voiceEnergy(waveform, frequency), 0.65);
      } else if (output && state === "speaking") {
        target = Math.pow(Math.min(1, Math.max(0, Number(output()) || 0)), 0.65);
      }
      energy = state === "deaf" || state === "blocked" ? 0 : smoothVoiceEnergy(energy, target, seconds);
      return energy;
    },
    level: () => energy,
    // The agent's playback level (0–1) while it speaks.
    setOutput(level) { output = level; },
    setAnalyser(node) {
      analyser = node;
      energy = 0;
      if (node) {
        frequency = new Uint8Array(node.frequencyBinCount);
        waveform = new Uint8Array(node.fftSize);
      }
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
  // The attract screen that covers the page until the agent needs to show it. Its live layer is
  // what a conversation is held on; the loop that plays between conversations is added below.
  const overlay = document.createElement("div");
  overlay.id = "voice-attract";
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="attract-live" aria-hidden="true">
      <svg class="voice-attract-pulse" viewBox="0 0 1200 120" preserveAspectRatio="none">
        <path d="M0 60 H170 l14 0 l8 -9 l8 9 l10 0 l9 -44 l13 82 l9 -38 l12 0 l9 -12 l10 12 H870 l14 0 l8 -9 l8 9 l10 0 l9 -44 l13 82 l9 -38 l12 0 l9 -12 l10 12 H1200" />
        <path pathLength="100" d="M0 60 H170 l14 0 l8 -9 l8 9 l10 0 l9 -44 l13 82 l9 -38 l12 0 l9 -12 l10 12 H870 l14 0 l8 -9 l8 9 l10 0 l9 -44 l13 82 l9 -38 l12 0 l9 -12 l10 12 H1200" />
      </svg>
      <p class="voice-attract-hint"></p>
    </div>
  `;
  document.body.append(overlay, root);
  const canvas = root.querySelector(".voice-wave");
  const button = root.querySelector(".voice-orb");
  const voice = createVoiceLevel();
  const mascot = createMascot({ canvas, root, level: voice.update, shake: FALLBACK_GESTURE, say: createChirps() });
  // A pointer arriving over the mascot makes it wobble; a press pushes it down.
  button.addEventListener("pointerenter", () => mascot.poke(1.6));
  button.addEventListener("pointerdown", () => mascot.poke(-2.4));
  const status = root.querySelector(".voice-status");
  // For looking at the attract screen: ?attractAt=<seconds> holds its questions on one moment and
  // the mascot at rest, ?attractMood=<feeling> holds the mascot in one feeling.
  const query = new URLSearchParams(window.location.search);
  const freezeAt = query.get("attractAt");
  const attract = createAttract({
    overlay, gsap: window.gsap,
    still: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    freezeAt: freezeAt === null || freezeAt === "" ? null : Number(freezeAt),
    mood: query.get("attractMood") || "",
    onTakeMic: () => button.click(),
  });
  // Until the microphone is on, a click anywhere on the attract screen turns it on: such a click
  // only asks for the microphone. Once it is listening, a conversation takes a click on the mascot
  // or on the microphone.
  overlay.addEventListener("click", (event) => {
    if (!event.target.closest("button") && ["idle", "deaf", "blocked", "resume"].includes(root.dataset.state)) button.click();
  });
  const stage = createStage({
    root, orb: button, overlay, status, attract, mascot,
    copy: root.querySelector(".voice-copy"),
  });
  mascot.setDirection(stage.direction);
  // Every change of state or of voice source lets the mascot and its stage react at once.
  const refresh = () => { mascot.refresh(); stage.wake(); };
  return {
    root,
    button,
    status,
    transcript: root.querySelector(".voice-transcript"),
    wave: {
      refresh,
      setAnalyser(node) { voice.setAnalyser(node); refresh(); },
      setOutput(level) { voice.setOutput(level); refresh(); },
    },
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
  if (new URLSearchParams(window.location.search).get("voice") !== "1") return;
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
    ui.transcript.textContent = state === "listening" || state === "speaking" ? transcript : "";
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
    if (old.close) { old.close(); return; }
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
  // Agent mode: the ElevenLabs agent listens, speaks, and drives the page through one client tool.
  const beginAgent = (phrase, silent) => {
    // committed keeps the local capture loop from uploading audio to the voice box.
    const c = { timers: [], pending: [], committed: true, conversation: null };
    command = c;
    const current = () => enabled && command === c;
    const timer = (fn, ms) => { const id = setTimeout(() => { if (current()) fn(); }, ms); c.timers.push(id); return id; };
    const fail = () => { if (current()) arm(`Koneksi suara terputus. ${COPY.armed}`); };
    c.close = () => {
      ui.root.dataset.greeting = "";
      ui.wave.setOutput(null);
      Promise.resolve(c.conversation?.endSession()).catch(() => {});
    };
    // The agent opens with a greeting. From the moment it connects until that has been said, the
    // stage keeps the mascot large in the middle of the page; then it steps aside.
    const endGreeting = () => {
      clearTimeout(c.greetTimer);
      if (!ui.root.dataset.greeting) return;
      ui.root.dataset.greeting = "";
      ui.wave.refresh();
    };
    setState("connecting", COPY.connecting, "", silent);
    if (phrase) window.dispatchEvent(new CustomEvent("nadi:wake", { detail: { phrase } }));
    const connectionTimer = timer(fail, 20000);
    // A connected agent bills by the minute, so a session nobody talks to hangs up by itself.
    const idle = () => { clearTimeout(c.idleTimer); c.idleTimer = timer(() => arm(), AGENT_IDLE_MS); };
    // Cued page actions wait for the agent's own voice: said/saidAt hold the letters of the speech
    // still to be played and when each one sounds, taken from the per-character timings of the audio.
    const spoken = text => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    c.said = ""; c.saidAt = []; c.speechEnd = 0; c.cues = [];
    const dropCues = () => {
      for (const cue of c.cues) clearTimeout(cue.timer);
      c.cues.length = 0; c.said = ""; c.saidAt.length = 0; c.speechEnd = 0;
    };
    const matchCues = () => {
      const now = performance.now();
      for (const cue of c.cues) {
        if (cue.timer !== undefined) continue;
        const index = c.said.indexOf(cue.key, cue.from);
        if (index < 0) continue;
        // Start moving just before the word so the section arrives while it is being said.
        cue.timer = timer(() => { c.cues.splice(c.cues.indexOf(cue), 1); pageAction(cue.decision); }, Math.max(0, c.saidAt[index] - now - AGENT_CUE_LEAD_MS));
      }
    };
    const heard = ({ chars, char_start_times_ms: starts, char_durations_ms: durations } = {}) => {
      if (!current() || !Array.isArray(chars) || !chars.length) return;
      const now = performance.now();
      const base = Math.max(now, c.speechEnd);
      chars.forEach((char, i) => { for (const letter of spoken(char)) { c.said += letter; c.saidAt.push(base + (starts?.[i] || 0)); } });
      c.speechEnd = base + (starts?.[chars.length - 1] || 0) + (durations?.[chars.length - 1] || 0);
      if (c.said.length > 4000) {
        const cut = c.said.length - 2000;
        c.said = c.said.slice(cut); c.saidAt.splice(0, cut);
        for (const cue of c.cues) cue.from = Math.max(0, cue.from - cut);
      }
      matchCues();
    };
    const pageAction = ({ action, section, cue } = {}) => {
      if (!current()) return "ignored";
      const decision = { action: String(action || "") };
      if (section) decision.section = String(section);
      const key = spoken(cue);
      if (key) {
        if (c.cues.length >= 8) return "too many waiting page actions";
        c.cues.push({ key, decision, from: c.said.length });
        matchCues();
        return `scheduled: runs when you say "${cue}"`;
      }
      let moved = false;
      try { moved = window.xstationPageAction?.(decision) === true; } catch { /* The agent hears the failure below. */ }
      if (!moved) {
        ui.root.dataset.fallback = String(++reaction); ui.wave.refresh(); sound("fallback");
        timer(() => { ui.root.dataset.fallback = ""; ui.wave.refresh(); }, 500);
      }
      return moved ? "done" : "not possible from the current page position";
    };
    loadAgentSdk().then(({ Conversation }) => Conversation.startSession({
      agentId: VOICE_AGENT_ID,
      connectionType: "webrtc",
      clientTools: { page_action: pageAction },
      onMessage: ({ message, source }) => {
        // Only the visitor's turns matter here: what the agent says is heard, not shown as text.
        if (!current() || source !== "user" || typeof message !== "string" || !message.trim()) return;
        // A new visitor turn cancels page moves still waiting for words the agent will no longer say.
        dropCues();
        endGreeting();
        clearTimeout(c.idleTimer);
        clearTimeout(c.modeTimer);
        setState("thinking", COPY.thinking, "", true);
        // The agent may stay silent; never leave the face thinking forever.
        clearTimeout(c.replyTimer);
        c.replyTimer = timer(() => setState("listening", COPY.listening, "", true), 12000);
      },
      onModeChange: ({ mode }) => {
        if (!current() || !c.conversation) return;
        clearTimeout(c.replyTimer);
        clearTimeout(c.modeTimer);
        if (mode === "speaking") { clearTimeout(c.idleTimer); clearTimeout(c.greetTimer); setState("speaking", COPY.speaking, "", true); }
        // Playback pauses briefly between sentences; only a real pause returns the face to listening,
        // and ends the greeting if that is what was being said.
        else { idle(); c.modeTimer = timer(() => { endGreeting(); setState("listening", COPY.listening, "", true); }, 600); }
      },
      onDisconnect: () => { if (current()) arm(); },
      onAudioAlignment: heard,
      onInterruption: dropCues,
      onError: (message) => { console.warn("[voice] agent error:", message); },
    })).then(conversation => {
      if (!current()) { Promise.resolve(conversation.endSession()).catch(() => {}); return; }
      clearTimeout(connectionTimer);
      c.conversation = conversation;
      ui.wave.setOutput(() => { try { return conversation.getOutputVolume(); } catch { return 0; } });
      // An agent that stays silent is not waited for.
      ui.root.dataset.greeting = "true";
      c.greetTimer = timer(endGreeting, AGENT_GREETING_MS);
      setState("listening", COPY.listening, "", silent);
      idle();
    }).catch(error => { console.warn("[voice] agent failed to start:", error); fail(); });
  };
  const beginCommand = (phrase, silent = false) => {
    if (!enabled || document.hidden || !stream || !modelReady || command) return;
    sessionWanted = true;
    resetWake();
    if (VOICE_AGENT_ID) { beginAgent(phrase, silent); return; }
    const socket = new WebSocket(VOICE_BOX_WS);
    const c = { socket, pending: [], timers: [], ready: false, committed: false, transcribed: false, pause: createPauseDetector(), item: null, retired: new Set() };
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
      c.item = null; c.committed = false; c.transcribed = false; c.latestTranscript = ""; c.pause = createPauseDetector();
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
      clearTimeout(c.wordTimer);
      send({ type: "commit" });
      setState("thinking");
      timer(fail, 30000);
    };
    c.send = send;
    const connectionTimer = timer(fail, 10000);
    // Post-wake audio already buffers during connection setup, so show capture immediately.
    setState(phrase ? "listening" : "connecting", phrase ? COPY.listening : COPY.connecting, "", silent);
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
      if (typeof text === "string" && /\b(?:thanks|terima\s*kasih|makasih)\b/iu.test(text.normalize("NFKC"))) { arm(); return; }
      if (typeof text === "string" && text.trim()) {
        c.transcribed = true;
        if (c.committed) setState("thinking");
      }
      if (payload.type === "decision" || payload.type === "noop") {
        if (!c.committed) return;
        let moved = false;
        if (payload.type === "decision") {
          moved = window.xstationPageAction?.(payload) === true;
          if (!window.xstationPageAction && payload.action === "show" && typeof payload.section === "string") {
            moved = window.xstationShowSection?.(payload.section) === true;
          }
        }
        nextTurn(c.transcribed && !moved);
        return;
      }
      if (c.committed) return;
      if (payload.type === "delta" && typeof text === "string" && text.trim()) {
        if (text.trim() !== c.latestTranscript) {
          c.latestTranscript = text.trim();
          // New words extend the command; microphone noise and repeated captions do not.
          clearTimeout(c.wordTimer);
          c.wordTimer = timer(c.commit, 2000);
        }
        c.pause.transcript(performance.now());
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
