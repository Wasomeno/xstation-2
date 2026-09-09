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
  let closing = false;
  let stream = null;
  let socket = null;
  let audioContext = null;
  let processor = null;

  const setCopy = (status, transcript = "") => {
    ui.status.textContent = status || "";
    ui.transcript.textContent = transcript || "";
    ui.panel.hidden = !status && !transcript;
  };

  const setPressed = (on) => {
    ui.button.setAttribute("aria-pressed", on ? "true" : "false");
    ui.button.setAttribute("aria-label", on ? COPY.stop : COPY.start);
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
    if (status) setCopy(status);
    else {
      ui.panel.hidden = true;
      ui.status.textContent = "";
      ui.transcript.textContent = "";
    }
  };

  const applyDecision = (decision) => {
    const transcript = decision?.transcript || "";
    if (decision?.action === "noop") {
      setCopy(COPY.listen);
      return;
    }
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
    if (decision?.action === "clarify" && decision.text) {
      setCopy(decision.text, transcript);
      return;
    }
    setCopy(COPY.listen, transcript);
  };

  const startCapture = () => {
    const source = audioContext.createMediaStreamSource(stream);
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
          setCopy(COPY.listen);
        }
        talking = false;
      }
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
  };

  const startSession = async () => {
    closing = false;
    setCopy(DISCLOSURE);
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
        setCopy(COPY.listen);
        return;
      }
      if (payload.type === "speech_started") {
        setCopy(COPY.listen, "");
        return;
      }
      if (payload.type === "delta") {
        setCopy(COPY.listen, payload.text || "");
        return;
      }
      if (payload.type === "final") {
        setCopy(COPY.think, payload.transcript || "");
        return;
      }
      if (payload.type === "noop") {
        setCopy(COPY.listen);
        return;
      }
      if (payload.type === "decision") {
        applyDecision(payload);
        return;
      }
      if (payload.type === "error") {
        setCopy(COPY.deaf);
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
    setCopy(COPY.listen);
  };

  ui.button.addEventListener("click", () => {
    if (session) endSession("");
    else startSession();
  });
}

afterWelcome(bindVoice);
