import { VOICE_BOX_URL, VOICE_BOX_WS } from "./voice-config.js";
import createFlatWaveform from "./voice-variant-1.js";
import createSmoothWaveform from "./voice-variant-2.js";

const TARGET_RATE = 24000;

const COPY = {
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

function afterWelcome(fn) {
  if (!document.getElementById("welcome-bumper") || !window.__xstationWelcomeActive) {
    fn();
    return;
  }
  window.addEventListener("xstation:welcome-finished", fn, { once: true });
}

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
      const threshold = Math.max(0.012, noise * (heardVoice ? 1.5 : 2.5), peak * 0.35);
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

// Variant 3: the earlier flat, layered-circle animation.
function createWaveform(canvas) {
  const variant = canvas.closest("#voice-surface")?.dataset.variant;
  if (variant === "1") {
    return createFlatWaveform(canvas, voiceEnergy, smoothVoiceEnergy);
  }
  if (variant === "2") {
    return createSmoothWaveform(canvas, voiceEnergy, smoothVoiceEnergy);
  }
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
  let visualRadius = 24;
  let visualSquash = 1;
  let lastTime = 0;
  let raf = 0;
  let size = 88;

  const draw = (now = performance.now()) => {
    raf = 0;
    if (document.hidden) return;
    const state = root.dataset.state;
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
    const speed = state === "thinking" ? 1.05 : state === "connecting" ? 0.65 : listening ? 0.55 + energy * 0.85 : 0.08;
    if (!motion.matches && !failed) phase += seconds * speed;
    const t = motion.matches || failed ? 0 : phase;
    const targetRadius = listening ? 34 : state === "thinking" ? 32 : processing ? 30 : 24;
    visualRadius = motion.matches || failed ? targetRadius
      : visualRadius + (targetRadius - visualRadius) * (1 - Math.exp(-seconds / 0.2));
    const targetSquash = state === "thinking" ? 0.48 : 1;
    visualSquash = motion.matches || failed ? targetSquash
      : visualSquash + (targetSquash - visualSquash) * (1 - Math.exp(-seconds / 0.18));
    const radius = size * (visualRadius / 88);
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.roundRect(-radius, -radius * visualSquash, radius * 2, radius * visualSquash * 2, radius * visualSquash);
    ctx.clip();
    ctx.scale(1, visualSquash);
    ctx.fillStyle = failed ? palette[0] : palette[1];
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
    // Three flat overlapping contours.
    for (let layer = 0; layer < 3; layer += 1) {
      const rotation = t * (!processing && layer === 1 ? -0.7 : 1) + layer * 2.1;
      const amplitude = processing ? 0.08 : listening ? 0.1 + energy * 0.15 : 0.025;
      ctx.save();
      ctx.rotate(rotation);
      ctx.translate(radius * (0.3 - layer * 0.25), radius * 0.22);
      ctx.beginPath();
      for (let i = 0; i <= 80; i += 1) {
        const angle = i / 80 * Math.PI * 2;
        const wave = Math.sin(angle * 2 + t + layer) + Math.sin(angle * 3 - t * 0.8) * 0.35;
        const reach = radius * (1.06 - layer * 0.19) * (1 + wave * amplitude);
        const x = Math.cos(angle) * reach;
        const y = Math.sin(angle) * reach;
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
  const variant = new URLSearchParams(window.location.search).get("voice-variant");
  root.dataset.variant = ["1", "2"].includes(variant) ? variant : "3";
  root.innerHTML = `
    <div class="voice-copy">
      <p class="voice-status" role="status" aria-live="polite"></p>
      <p class="voice-transcript"></p>
    </div>
    <button class="voice-orb" type="button" aria-pressed="false" aria-label="Mulai mendengarkan">
      <canvas class="voice-wave" width="88" height="88" aria-hidden="true"></canvas>
      <span class="voice-stop" aria-hidden="true"></span>
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

function bindVoice() {
  const ui = createSurface();
  ui.root.hidden = false;

  let session = false;
  let generation = 0;
  let stream = null;
  let socket = null;
  let audioContext = null;
  let processor = null;
  let feedbackAnimation = null;
  const setCopy = (status, transcript = "", state = "idle") => {
    ui.status.textContent = status || "";
    ui.transcript.textContent = state === "listening" ? transcript : "";
    ui.root.dataset.state = state;
    ui.button.setAttribute("aria-pressed", session ? "true" : "false");
    ui.button.setAttribute("aria-label", session
      ? (state === "connecting" ? COPY.cancel : COPY.stop)
      : (state === "deaf" || state === "blocked" ? "Coba lagi" : COPY.start));
    ui.wave.refresh();
  };

  const showHearing = (transcript = "") => {
    setCopy(COPY.listening, transcript, "listening");
  };

  const showNoAction = () => {
    setCopy("Aksi belum ditemukan. Coba sebutkan tujuan lain.", "", "listening");
    feedbackAnimation?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    feedbackAnimation = ui.button.animate(
      [0, -5, 5, -3, 3, 0].map(x => ({ transform: `translateX(${x}px)` })),
      { duration: 360, easing: "ease-in-out" },
    );
  };

  const teardownAudio = () => {
    if (processor) {
      processor.onaudioprocess = null;
      try {
        processor.disconnect();
      } catch {
        /* already closed */
      }
      processor = null;
    }
    ui.wave.setAnalyser(null);
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (socket && socket.readyState === 1) {
      try {
        socket.send(JSON.stringify({ type: "stop" }));
      } catch {
        /* closing */
      }
    }
    if (socket && socket.readyState < 2) socket.close();
    socket = null;
  };

  const endSession = (state = "idle", status = COPY[state]) => {
    feedbackAnimation?.cancel();
    session = false;
    generation += 1;
    teardownAudio();
    setCopy(status, "", state);
  };

  const applyDecision = (decision) => {
    let navigated = false;
    if (decision?.action === "show" && typeof decision.section === "string" && decision.section) {
      navigated = window.xstationShowSection?.(decision.section) === true;
    }
    if (navigated) {
      feedbackAnimation?.cancel();
      showHearing();
    } else showNoAction();
  };

  const startCapture = (isCurrent, isReady, onPause) => {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.62;
    ui.wave.setAnalyser(analyser);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    const pause = createPauseDetector();
    const pending = [];
    let bufferedSamples = 0;
    let pendingCommit = false;
    const send = (message) => {
      const data = JSON.stringify(message);
      if (isReady()) socket.send(data);
      else pending.push(data);
    };
    processor.onaudioprocess = (event) => {
      if (!isCurrent() || pendingCommit || !["connecting", "listening"].includes(ui.root.dataset.state)) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsample(input, audioContext.sampleRate, TARGET_RATE);
      if (!pcm.length) return;
      if (!isReady()) {
        bufferedSamples += pcm.length;
        // A stalled connection must fail instead of retaining unlimited microphone audio.
        if (bufferedSamples > TARGET_RATE * 30) { endSession("deaf"); return; }
      }
      send({ type: "audio", pcm: floatToPcm16Base64(pcm) });
      const action = pause.update(input, performance.now());
      if (action === "commit") {
        send({ type: "commit" });
        if (isReady()) onPause();
        else pendingCommit = true;
      }
    };
    source.connect(analyser);
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
    return {
      ...pause,
      flush() {
        for (const data of pending) socket.send(data);
        pending.length = 0;
        bufferedSamples = 0;
        if (pendingCommit) { pendingCommit = false; onPause(); }
      },
    };
  };

  const startSession = async () => {
    if (session) return;
    session = true;
    const attempt = ++generation;
    const isCurrent = () => session && generation === attempt;
    setCopy(COPY.connecting, "", "connecting");
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices?.getUserMedia || !Audio) {
      endSession("blocked", COPY.unsupported);
      return;
    }
    let backendReady = false;
    let captureReady = false;
    let currentItem = null;
    let submittedItem = null;
    const ignoredItems = new Set();
    let pause = null;
    const isReady = () => isCurrent() && backendReady && captureReady && socket?.readyState === 1;
    const listenWhenReady = () => {
      if (isReady()) { showHearing(); pause.flush(); }
    };
    const fail = () => {
      if (isCurrent()) endSession("deaf");
    };
    try {
      // Resume during the click gesture, while permission and networking proceed.
      const context = new Audio();
      audioContext = context;
      const contextReady = (context.state === "suspended" ? context.resume() : Promise.resolve()).catch(fail);
      const micRequest = navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      }).then((media) => {
        if (!isCurrent()) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        stream.getAudioTracks().forEach((track) => {
          track.addEventListener("ended", () => {
            if (isCurrent()) endSession("deaf");
          });
        });
      }).catch(() => {
        if (isCurrent()) endSession("blocked");
      });
      Promise.all([micRequest, contextReady]).then(() => {
        if (!isCurrent()) return;
        pause = startCapture(isCurrent, isReady, () => {
          submittedItem = currentItem;
          setCopy(COPY.thinking, "", "thinking");
        });
        captureReady = true;
        listenWhenReady();
      }).catch(fail);
      const healthRequest = fetch(`${VOICE_BOX_URL}/health`, { cache: "no-store" })
        .then((health) => {
          if (!health.ok && isCurrent()) endSession("deaf");
        }).catch(() => {
          if (isCurrent()) endSession("deaf");
        });
      await Promise.all([micRequest, healthRequest]);
      if (!isCurrent()) return;

      const ws = new WebSocket(VOICE_BOX_WS);
      socket = ws;
      const finishTurn = () => {
        pause?.reset();
        if (currentItem) ignoredItems.add(currentItem);
        currentItem = null;
        submittedItem = null;
      };
      ws.addEventListener("message", (event) => {
        if (!isCurrent()) return;
        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!payload || typeof payload !== "object") return;
        if (payload.type === "error") {
          if (payload.recoverable && isReady()) {
            if (payload.item_id && currentItem && payload.item_id !== currentItem) return;
            finishTurn();
            showHearing();
            return;
          }
          fail();
          return;
        }
        if (payload.type === "ready") {
          if (backendReady) return;
          backendReady = true;
          listenWhenReady();
          return;
        }
        if (!isReady()) return;
        if (payload.item_id && ignoredItems.has(payload.item_id)) return;
        if (ui.root.dataset.state === "thinking" && (payload.type === "speech_started" || payload.type === "delta")) {
          if (!currentItem) currentItem = payload.item_id || null;
          else if (payload.item_id && payload.item_id !== currentItem) ignoredItems.add(payload.item_id);
          return;
        }
        if (payload.type === "speech_started") {
          feedbackAnimation?.cancel();
          currentItem = payload.item_id || null;
          submittedItem = null;
          showHearing();
          return;
        }
        if (payload.item_id && currentItem && payload.item_id !== currentItem) return;
        if (payload.item_id) currentItem = payload.item_id;
        if (payload.type === "noop") {
          finishTurn();
          if (ui.root.dataset.state === "thinking") showNoAction();
          else showHearing();
        }
        else if (payload.type === "delta") {
          if (submittedItem && payload.item_id === submittedItem) return;
          const text = typeof payload.text === "string" ? payload.text : "";
          if (text.trim()) pause?.transcript(performance.now());
          showHearing(text);
        }
        else if (payload.type === "final" || payload.type === "speech_stopped") {
          pause?.reset();
          setCopy(COPY.thinking, "", "thinking");
        }
        else if (payload.type === "decision") {
          finishTurn();
          applyDecision(payload);
        }
      });
      ws.addEventListener("close", fail);
      ws.addEventListener("error", fail);
    } catch {
      if (isCurrent()) endSession("deaf");
    }
  };

  ui.button.addEventListener("click", () => {
    if (session) endSession();
    else startSession();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && session) endSession();
  });
}

afterWelcome(bindVoice);
