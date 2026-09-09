import { VOICE_BOX_URL, VOICE_BOX_WS } from "./voice-config.js";

const TARGET_RATE = 24000;
const DISCLOSURE =
  "Suara dari mikrofon ditranskripsi di mesin XTATION. Teksnya dikirim ke DeepSeek. Tidak disimpan.";

const COPY = {
  listen: "Mendengarkan",
  think: "Sebentar…",
  busy: "Sedang sibuk",
  deaf: "Tidak bisa mendengar",
  blocked: "Mikrofon diblokir",
  cantShow: "Tidak bisa menampilkan bagian itu",
  start: "Mulai mendengarkan",
  stop: "Berhenti mendengarkan",
};

const SECTION_LABELS = {
  hero: "Hero",
  work: "Products",
  bikinkonten: "BikinKonten",
  lubna: "Lubna",
  "crm-ai-agent": "CRM AI Agent",
  hireassess: "HireAssess",
  arkiv: "Arkiv",
  codev: "CoDev",
  coframe: "CoFrame",
  cofinance: "CoFinance",
  clients: "Clients",
  contact: "Contact",
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

const WAVE_BARS = 52;
const WAVE_SIZE = 116;

function createWaveform(canvas) {
  const ctx = canvas.getContext("2d");
  const bins = new Float32Array(WAVE_BARS);
  const freq = new Uint8Array(128);
  const time = new Uint8Array(256);
  let analyser = null;
  let raf = 0;

  const fit = () => {
    const css = canvas.clientWidth || WAVE_SIZE;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(css * dpr);
    canvas.height = Math.round(css * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const draw = () => {
    const size = canvas.clientWidth || WAVE_SIZE;
    const cx = size / 2;
    const cy = size / 2;
    const inner = size * 0.2;
    const reach = size * 0.26;
    const state = canvas.closest("#voice-surface")?.dataset.state || "idle";
    ctx.clearRect(0, 0, size, size);

    let rms = 0;
    if (analyser && (state === "listening" || state === "speaking")) {
      analyser.getByteFrequencyData(freq);
      analyser.getByteTimeDomainData(time);
      for (let i = 0; i < time.length; i += 1) {
        const n = (time[i] - 128) / 128;
        rms += n * n;
      }
      rms = Math.sqrt(rms / time.length);
    }

    const now = performance.now() / 1000;
    for (let i = 0; i < WAVE_BARS; i += 1) {
      let target = 0.045;
      if (state === "listening" || state === "speaking") {
        const index = Math.floor((i / WAVE_BARS) * freq.length * 0.42);
        const mag = Math.pow((freq[index] || 0) / 255, 1.18);
        target = Math.min(1, mag * 0.82 + rms * 2.4);
      } else if (state === "thinking") {
        target = 0.16 + 0.2 * Math.abs(Math.sin(now * 2.4 + i * 0.24));
      }
      bins[i] += (target - bins[i]) * 0.32;
    }

    ctx.lineCap = "round";
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "rgb(18 34 37 / 0.38)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = Math.max(1.6, size / 64);
    for (let i = 0; i < WAVE_BARS; i += 1) {
      const angle = (i / WAVE_BARS) * Math.PI * 2 - Math.PI / 2;
      const energy = bins[i];
      if (energy < 0.08) continue;
      const outer = inner + energy * reach;
      ctx.strokeStyle = `rgb(${Math.round(18 + 10 * energy)} ${Math.round(34 + 99 * energy)} ${Math.round(37 + 55 * energy)})`;
      ctx.globalAlpha = 0.42 + energy * 0.58;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  };

  fit();
  window.addEventListener("resize", fit);
  draw();
  return {
    setAnalyser(node) {
      analyser = node;
    },
  };
}

function createSurface() {
  const root = document.createElement("div");
  root.id = "voice-surface";
  root.hidden = true;
  root.dataset.state = "idle";
  root.innerHTML = `
    <div class="voice-copy">
      <p class="voice-status" aria-live="polite"></p>
      <p class="voice-transcript"></p>
    </div>
    <button class="voice-orb" type="button" aria-pressed="false" aria-label="Mulai mendengarkan">
      <canvas class="voice-wave" width="116" height="116"></canvas>
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
  let closing = false;
  let stream = null;
  let socket = null;
  let audioContext = null;
  let processor = null;
  let analyser = null;

  const setState = (state) => {
    ui.root.dataset.state = state;
  };

  const setCopy = (status, transcript = "", state) => {
    ui.status.textContent = status || "";
    ui.transcript.textContent = transcript || "";
    if (state) setState(state);
  };

  const setPressed = (on) => {
    ui.button.setAttribute("aria-pressed", on ? "true" : "false");
    ui.button.setAttribute("aria-label", on ? COPY.stop : COPY.start);
    if (!on && ui.root.dataset.state !== "deaf" && ui.root.dataset.state !== "blocked") {
      setState("idle");
    }
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
    analyser = null;
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

  const endSession = (status) => {
    session = false;
    closing = true;
    setPressed(false);
    teardownAudio();
    if (status === COPY.deaf) setCopy(status, "", "deaf");
    else if (status === COPY.blocked) setCopy(status, "", "blocked");
    else if (status) setCopy(status, "", "idle");
    else setCopy("", "", "idle");
  };

  const applyDecision = (decision) => {
    const transcript = decision?.transcript || "";
    if (decision?.action === "noop") {
      setCopy(COPY.listen, "", "listening");
      return;
    }
    if (decision?.action === "busy") {
      setCopy(COPY.busy, transcript, "thinking");
      return;
    }
    if (decision?.action === "show" && decision.section) {
      const shown = window.xstationShowSection?.(decision.section);
      const label = SECTION_LABELS[decision.section] || decision.section;
      setCopy(shown ? label : COPY.cantShow, transcript, shown ? "shown" : "clarify");
      return;
    }
    if (decision?.action === "clarify" && decision.text) {
      setCopy(decision.text, transcript, "clarify");
      return;
    }
    setCopy(COPY.listen, transcript, "listening");
  };

  const startCapture = () => {
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.62;
    ui.wave.setAnalyser(analyser);
    processor = audioContext.createScriptProcessor(4096, 1, 1);
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    let talking = false;
    let lastLoudAt = 0;
    let speechStartedAt = 0;
    processor.onaudioprocess = (event) => {
      if (!session || !socket || socket.readyState !== 1) return;
      const input = event.inputBuffer.getChannelData(0);
      const pcm = downsample(input, audioContext.sampleRate, TARGET_RATE);
      if (!pcm.length) return;
      socket.send(JSON.stringify({ type: "audio", pcm: floatToPcm16Base64(pcm) }));
      let sum = 0;
      for (let i = 0; i < input.length; i += 1) sum += input[i] * input[i];
      const rms = Math.sqrt(sum / input.length);
      const now = performance.now();
      if (rms >= 0.03) {
        if (!talking) {
          talking = true;
          speechStartedAt = now;
        }
        lastLoudAt = now;
        return;
      }
      if (talking && now - lastLoudAt >= 800) {
        if (lastLoudAt - speechStartedAt >= 700) {
          socket.send(JSON.stringify({ type: "commit" }));
        } else {
          setCopy(COPY.listen, "", "listening");
        }
        talking = false;
      }
    };
    source.connect(analyser);
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
  };

  const startSession = async () => {
    closing = false;
    setCopy(DISCLOSURE, "", "listening");
    const micRequest = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    const dropMic = () => {
      micRequest.then((media) => media.getTracks().forEach((track) => track.stop())).catch(() => {});
    };
    let boxUp = false;
    try {
      const health = await fetch(`${VOICE_BOX_URL}/health`, { cache: "no-store" });
      boxUp = health.ok;
    } catch {
      boxUp = false;
    }
    if (!boxUp) {
      dropMic();
      endSession(COPY.deaf);
      return;
    }
    try {
      stream = await micRequest;
    } catch {
      endSession(COPY.blocked);
      return;
    }
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        if (session) endSession(COPY.deaf);
      });
    });
    try {
      socket = new WebSocket(VOICE_BOX_WS);
    } catch {
      endSession(COPY.deaf);
      return;
    }
    socket.addEventListener("message", (event) => {
      let payload = null;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      if (payload.type === "ready") {
        setCopy(COPY.listen, "", "listening");
        return;
      }
      if (payload.type === "speech_started") {
        setCopy(COPY.listen, "", "listening");
        return;
      }
      if (payload.type === "delta") {
        setCopy(COPY.listen, payload.text || "", payload.text ? "speaking" : "listening");
        return;
      }
      if (payload.type === "final") {
        setCopy(COPY.think, payload.transcript || "", "thinking");
        return;
      }
      if (payload.type === "noop") {
        setCopy(COPY.listen, "", "listening");
        return;
      }
      if (payload.type === "decision") {
        applyDecision(payload);
        return;
      }
      if (payload.type === "error") {
        setCopy(COPY.deaf, "", "deaf");
      }
    });
    socket.addEventListener("close", () => {
      if (session && !closing) endSession(COPY.deaf);
    });
    socket.addEventListener("error", () => {
      if (session && !closing) endSession(COPY.deaf);
    });
    await new Promise((resolve, reject) => {
      const onOpen = () => {
        socket.removeEventListener("error", onErr);
        resolve();
      };
      const onErr = () => reject(new Error("ws"));
      socket.addEventListener("open", onOpen, { once: true });
      socket.addEventListener("error", onErr, { once: true });
    }).catch(() => {
      endSession(COPY.deaf);
    });
    if (!socket || socket.readyState !== 1) return;
    audioContext = new AudioContext();
    if (audioContext.state === "suspended") await audioContext.resume();
    startCapture();
    session = true;
    setPressed(true);
    setCopy(COPY.listen, "", "listening");
  };

  ui.button.addEventListener("click", () => {
    if (session) endSession("");
    else startSession();
  });
}

afterWelcome(bindVoice);
