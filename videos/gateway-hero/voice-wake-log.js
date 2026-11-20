// A monitor for the wake word, for when "Hei Nadi" seems not to be heard. With `&wakeLog=1` beside
// `?voice=1` it writes what the listener does to the console and, where `panel` allows it (a
// preview on this machine, never a deployed site), keeps a readout in a corner of the screen: the listener's state, what the microphone picks up, whether that audio reaches the
// detector and is worked through, and every "Hei Nadi" the detector hears. It only watches:
// nothing here changes what the listener does, and without the parameter it does nothing at all.

const QUIET = { on: false, note() {}, state() {}, microphone() {}, detector() {}, audio() {}, processed() {}, wake() {}, problem() {}, sound() {}, watch() {} };

// What each state of the listener means for someone saying "Hei Nadi".
const MEANS = {
  idle: "the microphone is off: take the mic first",
  loading: "loading the detector",
  armed: "listening for \"Hei Nadi\"",
  paused: "paused: this tab is hidden",
  resume: "audio is suspended: click the page",
  connecting: "a conversation is starting: the wake word is not listened for",
  listening: "in a conversation: the wake word is not listened for",
  thinking: "in a conversation: the wake word is not listened for",
  speaking: "in a conversation: the wake word is not listened for",
  deaf: "stopped: the detector failed or could not keep up",
  blocked: "stopped: no microphone, or the page is not isolated",
};
const TICK_MS = 250;
const HEARTBEAT_TICKS = 20;
const BAR = 24;
// Below this, in decibels against full scale, a microphone is picking up next to nothing; a quiet
// room with noise suppression on reads this low too, so it is pointed out only after ten seconds.
const SILENT_DB = -55;
const SILENT_TICKS = 40;

const decibels = (value) => (value > 1e-5 ? 20 * Math.log10(value) : -100);
const meter = (level) => { const lit = Math.round(Math.min(1, Math.max(0, (level + 70) / 70)) * BAR); return "█".repeat(lit) + "░".repeat(BAR - lit); };
const fixed = (value, digits = 1) => Number(value).toFixed(digits);

export function createWakeLog({ enabled = false, panel: onScreen = true, doc = globalThis.document, out = globalThis.console, clock = () => performance.now(), time = () => new Date().toTimeString().slice(0, 8), every = (fn, ms) => setInterval(fn, ms) } = {}) {
  if (!enabled) return QUIET;

  const started = clock();
  // What has gone by since the last look at the screen, and since the last line in the console.
  const fresh = () => ({ squares: 0, samples: 0, peak: 0, heard: 0, fed: 0, processed: 0, callbacks: 0, sounds: 0 });
  let glance = fresh(), stretch = fresh();
  let read = () => ({}), microphone = "not opened yet", detector = "not started", last = "", wakes = 0, lastWake = "", ticks = 0, quiet = 0;
  let panel = null, mascot = null;

  const note = (text) => {
    last = `${time()} ${text}`;
    out.info(`[wake ${fixed((clock() - started) / 1000)}s] ${text}`);
  };

  const show = (lines) => {
    if (!onScreen || !doc?.body) return;
    if (!panel) {
      panel = doc.createElement("pre");
      panel.id = "voice-wake-log";
      panel.setAttribute("aria-hidden", "true");
      panel.style.cssText = "position:fixed;top:8px;left:8px;z-index:2147483647;margin:0;padding:10px 12px;max-width:calc(100vw - 16px);"
        + "font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:pre-wrap;color:#c8f5dd;background:rgba(0,16,8,.86);"
        + "border:1px solid rgba(110,240,178,.35);border-radius:6px;pointer-events:none";
    }
    if (!panel.isConnected) doc.body.append(panel);
    panel.textContent = lines.join("\n");
  };

  const tick = () => {
    ticks += 1;
    const now = read();
    const level = glance.samples ? decibels(Math.sqrt(glance.squares / glance.samples)) : -100, peak = decibels(glance.peak);
    const silent = glance.callbacks === 0;
    quiet = now.state === "armed" && !silent && peak < SILENT_DB ? quiet + 1 : 0;
    const feeding = now.state !== "armed" ? "not fed (see state)"
      : silent ? "NO AUDIO is arriving from the microphone"
      : `fed ${fixed(glance.fed / (TICK_MS / 1000), 2)} s of audio a second, ${fixed(now.backlog || 0, 2)} s waiting`;
    show([
      `WAKE LOG ${time()}`,
      `state     ${now.state || "?"}: ${MEANS[now.state] || "?"}${now.status ? `\n          "${now.status}"` : ""}`,
      `page      ${now.hidden ? "hidden" : "visible"}, audio ${now.audio || "not started"}, ${now.isolated === false ? "NOT isolated (no local detector)" : "isolated"}`,
      `mic       ${microphone}`,
      `level     ${meter(level)} ${fixed(level, 0)} dB, peak ${fixed(peak, 0)} dB${quiet >= SILENT_TICKS ? "\n          silence for ten seconds: if someone is speaking, check the input device" : ""}`,
      `detector  ${detector}; ${feeding}`,
      `mascot    ${!mascot ? "no sound yet" : `${mascot.audible ? "" : "silenced (mascotSound=0), would have made "}"${mascot.name}" ${fixed((clock() - mascot.at) / 1000)} s ago`}`,
      `heard     ${wakes} x "Hei Nadi"${lastWake ? `, last at ${lastWake}` : ""}`,
      `last      ${last}`,
    ]);
    glance = fresh();
    if (ticks % HEARTBEAT_TICKS) return;
    // One line every five seconds, as long as the microphone is open.
    if (stretch.callbacks) {
      const stretchLevel = decibels(Math.sqrt(stretch.squares / Math.max(1, stretch.samples)));
      out.info(`[wake ${fixed((clock() - started) / 1000)}s] ${now.state} | mic ${fixed(stretchLevel, 0)} dB, peak ${fixed(decibels(stretch.peak), 0)} dB | heard ${fixed(stretch.heard)} s, fed to the detector ${fixed(stretch.fed)} s, worked through ${fixed(stretch.processed)} s, waiting ${fixed(now.backlog || 0, 2)} s | mascot sounds ${stretch.sounds}${mascot && !mascot.audible ? " (silenced)" : ""} | "Hei Nadi" ${wakes} x`);
    } else if (now.state && now.state !== "idle") out.info(`[wake ${fixed((clock() - started) / 1000)}s] ${now.state} | no audio has arrived from the microphone for five seconds`);
    stretch = fresh();
  };
  every(tick, TICK_MS);
  note("wake log on");

  return {
    on: true,
    note,
    // voice.js hands over a way to look at the listener: { state, status, hidden, audio, isolated, backlog }.
    watch(look) { read = look; },
    state(from, to, text) { note(`state ${from || "none"} -> ${to}${text ? ` ("${text}")` : ""}: ${MEANS[to] || "?"}`); },
    microphone(track, context) {
      const settings = track?.getSettings?.() || {};
      const onOff = (value) => (value === undefined ? "?" : value ? "on" : "off");
      microphone = `${track?.label || "unnamed"}, ${settings.sampleRate || "?"} Hz in, ${context?.sampleRate || "?"} Hz graph, echo cancel ${onOff(settings.echoCancellation)}, noise suppression ${onOff(settings.noiseSuppression)}, auto gain ${onOff(settings.autoGainControl)}${track?.muted ? ", MUTED by the system" : ""}`;
      note(`microphone: ${microphone}`);
    },
    detector(text) { detector = text; note(`detector: ${text}`); },
    // Every block of audio the microphone delivers; `fed` when it went on to the detector.
    audio(samples, sampleRate, fed) {
      let squares = 0, peak = 0;
      for (let i = 0; i < samples.length; i += 1) { const value = Math.abs(samples[i]); squares += value * value; if (value > peak) peak = value; }
      const seconds = samples.length / sampleRate;
      for (const span of [glance, stretch]) {
        span.squares += squares; span.samples += samples.length; span.callbacks += 1; span.heard += seconds;
        if (peak > span.peak) span.peak = peak;
        if (fed) span.fed += seconds;
      }
    },
    processed(seconds) { stretch.processed += seconds; },
    // A sound of the mascot's own, which the microphone may pick up; `audible` unless it is silenced.
    sound(name, audible = true) { mascot = { name, audible, at: clock() }; stretch.sounds += 1; },
    wake(phrase, started, why = "") {
      if (started) { wakes += 1; lastWake = time(); }
      note(started ? `HEARD "${phrase}": starting a conversation` : `heard "${phrase}" but did not start: ${why}`);
    },
    problem(what, error) { note(`PROBLEM ${what}: ${error?.message || error || "no details"}`); },
  };
}
