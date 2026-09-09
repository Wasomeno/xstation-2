import { VOICE_BOX_URL } from "./voice-config.js";

const SPEECH_RMS = 0.018;
const SILENCE_MS = 800;
const MIN_SPEECH_MS = 400;
const MAX_COMMAND_MS = 15000;
const DISCLOSURE =
  "Suara dari mikrofon ditranskripsi di mesin XTATION. Teksnya dikirim ke DeepSeek. Tidak disimpan.";

const COPY = {
  listen: "Mendengarkan",
  think: "Sebentar…",
  busy: "Sedang sibuk",
  deaf: "Tidak bisa mendengar",
  blocked: "Mikrofon diblokir",
  fallback: "Produk, atau hubungi kami?",
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

const mimeType = () => {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return types.find((type) => window.MediaRecorder?.isTypeSupported(type)) || "";
};

function afterWelcome(fn) {
  if (!document.getElementById("welcome-bumper") || !window.__xstationWelcomeActive) {
    fn();
    return;
  }
  window.addEventListener("xstation:welcome-finished", fn, { once: true });
}

function rmsFrom(analyser, buffer) {
  analyser.getByteTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const centered = (buffer[i] - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / buffer.length);
}

function createSurface() {
  const root = document.createElement("div");
  root.id = "voice-surface";
  root.hidden = true;
  root.innerHTML = `
    <button class="voice-mic" type="button" aria-pressed="false" aria-label="Mulai mendengarkan">
      <svg class="voice-mic-mark" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" stroke-width="2"></rect>
        <path d="M7 11a5 5 0 0 0 10 0" fill="none" stroke="currentColor" stroke-width="2"></path>
        <path d="M12 16v4M9 21h6" fill="none" stroke="currentColor" stroke-width="2"></path>
      </svg>
    </button>
    <div class="voice-panel" hidden>
      <p class="voice-status" aria-live="polite"></p>
      <p class="voice-transcript"></p>
    </div>
  `;
  document.body.append(root);
  return {
    root,
    button: root.querySelector(".voice-mic"),
    panel: root.querySelector(".voice-panel"),
    status: root.querySelector(".voice-status"),
    transcript: root.querySelector(".voice-transcript"),
  };
}

function bindVoice() {
  const ui = createSurface();
  ui.root.hidden = false;

  let session = false;
  let thinking = false;
  let stream = null;
  let recorder = null;
  let audioContext = null;
  let analyser = null;
  let monitorId = 0;
  let speechStartedAt = 0;
  let lastLoudAt = 0;
  let recording = false;
  let chunks = [];

  const setCopy = (status, transcript = "") => {
    ui.status.textContent = status;
    ui.transcript.textContent = transcript;
    ui.panel.hidden = !status && !transcript;
  };

  const setPressed = (on) => {
    ui.button.setAttribute("aria-pressed", on ? "true" : "false");
    ui.button.setAttribute("aria-label", on ? COPY.stop : COPY.start);
  };

  const stopRecorder = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  const teardownAudio = () => {
    window.clearInterval(monitorId);
    monitorId = 0;
    stopRecorder();
    analyser = null;
    if (audioContext) {
      audioContext.close().catch(() => {});
      audioContext = null;
    }
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  };

  const endSession = (status) => {
    session = false;
    thinking = false;
    setPressed(false);
    teardownAudio();
    if (status) setCopy(status);
    else {
      ui.panel.hidden = true;
      ui.status.textContent = "";
      ui.transcript.textContent = "";
    }
  };

  const applyDecision = (decision) => {
    const transcript = decision?.transcript || "";
    if (decision?.action === "busy") {
      setCopy(COPY.busy, transcript);
      return;
    }
    if (decision?.action === "show" && decision.section) {
      const shown = window.xstationShowSection?.(decision.section);
      const label = SECTION_LABELS[decision.section] || decision.section;
      setCopy(shown ? label : COPY.cantShow, transcript);
      return;
    }
    if (decision?.action === "clarify") {
      setCopy(decision.text || COPY.fallback, transcript);
      return;
    }
    setCopy(COPY.fallback, transcript);
  };

  const sendClip = async (blob) => {
    thinking = true;
    setCopy(COPY.think);
    const body = new FormData();
    body.append("audio", blob, `command.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
    try {
      const response = await fetch(`${VOICE_BOX_URL}/v1/command`, {
        method: "POST",
        body,
      });
      if (response.status === 429) {
        applyDecision({ action: "busy" });
        return;
      }
      if (!response.ok) throw new Error("box");
      applyDecision(await response.json());
    } catch {
      setCopy(COPY.deaf);
    } finally {
      thinking = false;
    }
  };

  const beginCommand = () => {
    if (!session || thinking || recording || !stream) return;
    chunks = [];
    const type = mimeType();
    try {
      recorder = type ? new MediaRecorder(stream, { mimeType: type }) : new MediaRecorder(stream);
    } catch {
      setCopy(COPY.deaf);
      return;
    }
    recording = true;
    speechStartedAt = performance.now();
    lastLoudAt = speechStartedAt;
    const typeUsed = recorder.mimeType || type || "audio/webm";
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      const spoken = performance.now() - speechStartedAt;
      const blob = new Blob(chunks, { type: typeUsed });
      chunks = [];
      recording = false;
      recorder = null;
      if (session && blob.size > 0 && spoken >= MIN_SPEECH_MS) sendClip(blob);
    });
    recorder.start();
  };

  const maybeEndCommand = (now) => {
    if (!recording) return;
    if (now - lastLoudAt < SILENCE_MS && now - speechStartedAt < MAX_COMMAND_MS) return;
    stopRecorder();
  };

  const monitor = () => {
    if (!session || !analyser) return;
    const buffer = new Uint8Array(analyser.fftSize);
    const level = rmsFrom(analyser, buffer);
    const now = performance.now();
    if (level >= SPEECH_RMS) {
      lastLoudAt = now;
      if (!recording && !thinking) beginCommand();
    }
    maybeEndCommand(now);
  };

  const startSession = async () => {
    setCopy(DISCLOSURE);
    const micRequest = navigator.mediaDevices.getUserMedia({ audio: true });
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
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    if (audioContext.state === "suspended") await audioContext.resume();
    session = true;
    setPressed(true);
    setCopy(COPY.listen);
    monitorId = window.setInterval(monitor, 80);
  };

  ui.button.addEventListener("click", () => {
    if (session) endSession("");
    else startSession();
  });
}

afterWelcome(bindVoice);
