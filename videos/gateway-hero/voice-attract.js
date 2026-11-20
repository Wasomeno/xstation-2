// What the attract screen shows while nobody is talking to Nadi: the mascot, large in the middle of
// the screen and doing as it pleases, example questions to its right, and the head of a microphone held
// out from the bottom left corner with "Take the mic" along its curve. voice-stage.js moves the mascot and voice-mascot.js gives it
// its body; this module owns what is around it and directs the mascot: what it feels, where it
// looks and where on the screen it wanders, turn by turn and never twice the same.

// The example questions take turns over this many seconds.
export const LOOP_SECONDS = 39;

const ASKS = [
  "“Produk apa yang cocok untuk tim marketing?”",
  "“Bisa bantu balas chat pelanggan?”",
  "“Bagaimana cara kerja sistemnya?”",
  "“Tunjukkan demo BikinKonten.”",
];

// What the microphone says beside itself in each state. Before the microphone is on it says
// nothing: "Take the mic" is the invitation. While a call connects it says what it said before:
// nothing on the screen changes then but the pulse behind the mascot.
const HINTS = {
  idle: "",
  loading: "Menyiapkan pendengar…",
  armed: "Ucapkan “Hei Nadi”",
  connecting: "Ucapkan “Hei Nadi”",
  paused: "Mikrofon dijeda",
  resume: "Klik untuk melanjutkan",
};

const wrap = (time) => { const t = time % LOOP_SECONDS; return t < 0 ? t + LOOP_SECONDS : t; };
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------------------------------------
// The mascot's direction

// How much nearer or farther the mascot may stand when it wanders, as a scale of its size.
export const ROAM = { near: 1.04, far: 0.93 };
// voice-mascot.js crouches this long before a hop leaves the ground; a hop to another place starts
// to travel then.
export const LIFT_OFF = 0.09;
// It points at the microphone at least this often, in seconds: that is the call to action.
export const POINT_EVERY = 20;
// It moves to another place on the screen at least this often, in seconds: sooner one time, later
// the next.
export const ROAM_EVERY = [7, 12];
// How often it murmurs to itself while it rests between turns, from 0 (never) to 1 (every time).
export const CHATTER = 0.3;
// How likely each turn is, against the others.
const TURNS = { glance: 3, roam: 2.5, happy: 2, point: 1.6, sway: 1.4, wink: 1.4, peek: 1.3, wiggle: 1.3, ponder: 1.2, suspect: 1 };
const NOTHING = [];
// The mascot at rest in the middle of the screen, for when it may not move about.
const CALM = { index: 0, elapsed: 1, mood: "attentive", gaze: null, events: NOTHING, spot: [0, 0], zoom: 1 };

// Directs the mascot between conversations. `step` returns the cue it follows now: { index,
// elapsed, mood, gaze, events, spot, zoom }. The mood (one of voice-mascot.js), the gaze and the
// events ([second into the cue, action, strength, sound]) are for the mascot's body; spot and zoom
// are for the stage: where it stands in the room it has to wander ([x, y], each from -1 to 1, the
// middle of the screen being 0; up is negative) and how near. A turn is one or more cues. Turns
// are drawn at random, never the same twice running and each a little different every time, with
// a rest between them in which the mascot looks about as it likes. Nearly every turn has
// something to say: the sounds are those of voice-mascot.js.
export function createDirector({ random = Math.random } = {}) {
  const pick = (from, to) => from + random() * (to - from);
  const count = (from, to) => from + Math.floor(random() * (to - from + 1));
  const either = () => (random() < 0.5 ? -1 : 1);
  let spot = [0, 0], zoom = 1;
  let queue = [], now = null, elapsed = 0, index = 0, resting = false, previous = "";
  let sincePoint = 0, sinceRoam = 0, roamAfter = pick(...ROAM_EVERY);
  const cue = { ...CALM };

  const turns = {
    // Something to one side has its interest; more often than not it checks the other side too.
    glance() {
      const first = either(), up = pick(-0.7, 0.15);
      const look = (side) => ({
        seconds: pick(0.9, 1.6), mood: side < 0 ? "curiousLeft" : "curious", gaze: [side * pick(0.6, 0.9), up],
        events: [[0.12, "sound", 1, "peep"]],
      });
      return random() < 0.55 ? [look(first), look(-first)] : [look(first)];
    },
    // It hops to another place on the screen, in one to three hops, looking where it is going. Of
    // three places that come to mind it takes the farthest, so that it gets around.
    roam() {
      let to = null, far = 0;
      for (let thought = 0; thought < 3; thought += 1) {
        const x = pick(-1, 1), y = pick(-1, 1), away = Math.hypot(x - spot[0], (y - spot[1]) / 2);
        if (away > far) { to = [x, y]; far = away; }
      }
      if (far < 0.5) to = [spot[0] > 0 ? -0.7 : 0.7, 0];
      sinceRoam = 0; roamAfter = pick(...ROAM_EVERY);
      const from = spot, hops = clamp(Math.round(Math.abs(to[0] - from[0]) / 0.6), 1, 3);
      zoom = pick(ROAM.far, ROAM.near);
      return Array.from({ length: hops }, (_, hop) => ({
        seconds: 0.42, mood: "attentive", gaze: [Math.sign(to[0] - from[0]) * 0.7, -0.1],
        spot: [from[0] + (to[0] - from[0]) * (hop + 1) / hops, from[1] + (to[1] - from[1]) * (hop + 1) / hops], spotAt: LIFT_OFF,
        events: [[0, "hop", pick(0.5, 0.7), "pip"]],
      }));
    },
    happy() {
      const hops = count(1, 3);
      return [{
        seconds: 0.5 + hops * 0.55 + pick(0, 0.4), mood: "happy",
        events: [[0.02, "sound", 1, "chirp"], ...Array.from({ length: hops }, (_, hop) => [0.08 + hop * 0.55, "hop", pick(0.75, 1) * (hop ? 0.88 : 1), "plip"])],
      }];
    },
    // The call to action: it looks at the microphone, calls out, and nods at it once or twice.
    point() {
      sincePoint = 0;
      const nods = count(1, 2);
      return [{
        seconds: 1.45 + nods * 0.5 + pick(0.2, 0.7), mood: "pointing",
        events: [[0.1, "sound", 1, "call"], ...Array.from({ length: nods }, (_, nod) => [0.95 + nod * 0.5, "nod", 1, "clink"])],
      }];
    },
    sway() {
      const beats = count(2, 4);
      return [{
        seconds: beats + 0.3, mood: "sway",
        events: [[0.1, "sound", 1, "tune"], ...Array.from({ length: beats }, (_, beat) => [0.5 + beat, "hop", 0.3])],
      }];
    },
    wink: () => [{ seconds: pick(0.7, 1), mood: either() < 0 ? "winkLeft" : "winkRight", events: [[0.05, "sound", 1, "ting"]] }],
    // It leans in for a closer look at whoever is there.
    peek: () => [{ seconds: pick(1.1, 1.9), mood: "peek", zoom: 1.07, events: [[0.15, "sound", 1, "peep"]] }],
    wiggle: () => [{ seconds: pick(0.9, 1.3), mood: "wiggle", events: [[0.05, "sound", 1, "trill"]] }],
    // It looks up, as if working something out.
    ponder: () => [{
      seconds: pick(1.4, 2.4), mood: "thinking", gaze: [either() * pick(0.4, 0.65), pick(-0.8, -0.55)],
      events: [[0.25, "sound", 1, "plink"]],
    }],
    suspect() {
      const side = either();
      return [{
        seconds: pick(1.2, 2), mood: side < 0 ? "suspiciousLeft" : "suspicious", gaze: [side * pick(0.6, 0.85), pick(-0.05, 0.12)],
        events: [[0.25, "sound", 1, "bloop"]],
      }];
    },
  };
  // Between turns it looks about, and now and then murmurs something to itself.
  const rest = () => [{ seconds: pick(1.3, 3.4), mood: "attentive", events: random() < CHATTER ? [[pick(0.3, 0.9), "sound", 1, "murmur"]] : NOTHING }];
  // It has noticed someone: a start, then a greeting.
  const greeting = () => [
    { seconds: 0.55, mood: "startled", events: [[0, "hop", 0.6, "blip"]] },
    { seconds: 1.5, mood: "happy", events: [[0.02, "sound", 1, "chirp"], [0.05, "hop", 1, "plip"], [0.65, "hop", 0.85, "plip"]] },
  ];
  const plan = () => {
    resting = !resting;
    if (resting) return rest();
    // What is due comes first: the call to action, then a change of place.
    const due = sincePoint >= POINT_EVERY ? "point" : sinceRoam >= roamAfter && previous !== "roam" ? "roam" : "";
    const names = due ? [due] : Object.keys(TURNS).filter((name) => name !== previous && (name !== "point" || sincePoint >= POINT_EVERY / 2));
    let roll = random() * names.reduce((sum, name) => sum + TURNS[name], 0);
    previous = names.find((name) => (roll -= TURNS[name]) < 0) || names.at(-1);
    return turns[previous]();
  };
  const greet = () => { queue = greeting(); now = null; resting = false; };

  return {
    // Starts over with a greeting, from wherever the mascot stands.
    greet,
    // Someone has shown up: it greets them, unless it is in the middle of a turn.
    notice() { if (resting && !queue.length) greet(); },
    step(seconds) {
      sincePoint += seconds; sinceRoam += seconds;
      elapsed += seconds;
      while (!now || elapsed >= now.seconds) {
        elapsed = now ? Math.min(elapsed - now.seconds, 0.05) : 0;
        if (!queue.length) queue = plan();
        now = queue.shift();
        index += 1;
      }
      if (now.spot && elapsed >= (now.spotAt || 0)) spot = now.spot;
      cue.index = index; cue.elapsed = elapsed; cue.mood = now.mood; cue.gaze = now.gaze || null; cue.events = now.events || NOTHING;
      cue.spot = spot; cue.zoom = zoom * (now.zoom || 1);
      return cue;
    },
  };
}

// ---------------------------------------------------------------------------------------------
// The screen around the mascot

const escape = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]));

const ASKS_MARKUP = `
    <div class="attract-asks" aria-hidden="true">
      <p class="attract-kicker">Coba tanyakan</p>
      <div class="attract-ask-list">${ASKS.map((ask) => `<p class="attract-ask">${escape(ask)}</p>`).join("")}</div>
    </div>`;

// The wires of a microphone's ball: a square mesh stretched over a dome of radius r and seen from
// in front, so that the wires bow outward and crowd toward the rim. `pitch` is the gap between two
// wires at the middle of the dome, as a part of its radius.
function meshPath(r, pitch = 0.1) {
  const onDome = (u, v) => {
    const far = Math.hypot(u, v);
    const reach = far ? r * Math.sin(Math.min(far, 1) * Math.PI / 2) / far : 0;
    return `${(u * reach).toFixed(1)} ${(v * reach).toFixed(1)}`;
  };
  const wires = [];
  for (let u = -1 + pitch / 2; u < 1; u += pitch) {
    const half = Math.sqrt(1 - u * u), across = [], down = [];
    for (let step = 0; step <= 16; step += 1) {
      const v = -half + 2 * half * step / 16;
      across.push(onDome(u, v));
      down.push(onDome(v, u));
    }
    wires.push(`M${across.join("L")}`, `M${down.join("L")}`);
  }
  return wires.join("");
}

// The microphone is the head of a hand-held one, held out from the bottom left corner (0, 400
// in these units) toward the middle of the screen: a ball of woven mesh with the ring around its
// middle, sitting in the collar that narrows toward the handle, which is out of sight beyond the
// corner. Its label runs along the curve of the ball, just outside it, and the hint sits beside
// it. The head is drawn with its tip upward and then turned to point up and to the right.
const MIC_MARKUP = `
    <svg class="attract-mic-shape" viewBox="0 0 400 400" aria-hidden="true">
      <defs>
        <clipPath id="attract-mic-ball"><circle r="170" /></clipPath>
        <path id="attract-mic-arc" d="M100.3 64.5A192 192 0 0 1 335.5 299.7" />
      </defs>
      <g class="attract-mic-head">
        <g transform="translate(150 250) rotate(45)">
          <path class="attract-mic-collar" d="M-106 132H106L84 250H-84Z" />
          <path class="attract-mic-seam" d="M-97 186H97" />
          <circle class="attract-mic-ball" r="170" />
          <g clip-path="url(#attract-mic-ball)">
            <path class="attract-mic-mesh" transform="rotate(-45)" d="${meshPath(170)}" />
            <path class="attract-mic-band" d="M-170 10A170 40 0 0 0 170 10" />
            <path class="attract-mic-sheen" d="M-170 -2A170 40 0 0 0 170 -2" />
          </g>
        </g>
      </g>
      <text class="attract-mic-label"><textPath href="#attract-mic-arc" startOffset="50%" text-anchor="middle">Take the mic</textPath></text>
    </svg>
    <span class="attract-mic-hint"></span>`;
// The corner the microphone comes out of.
const MIC_CORNER = "0 400";

// The loop around the mascot: the example questions take turns. Every tween states its start, so
// the loop reads the same on each pass and at any moment shown.
function compose(gsap, el) {
  const tl = gsap.timeline({ paused: true, repeat: -1, defaults: { ease: "expo.out" } });
  const asks = [...el.querySelectorAll(".attract-ask")], askSeconds = LOOP_SECONDS / Math.max(1, asks.length);
  asks.forEach((ask, index) => {
    const at = index * askSeconds;
    tl.fromTo(ask, { autoAlpha: 0, yPercent: 30 }, { autoAlpha: 1, yPercent: 0, duration: 0.55 }, at)
      .to(ask, { autoAlpha: 0, yPercent: -30, duration: 0.3, ease: "power2.in" }, at + askSeconds - 0.32);
  });
  tl.set({}, {}, LOOP_SECONDS);
  return tl;
}

// The microphone comes out of the corner each time the attract screen takes the floor, without a
// bounce, and its label slides along the curve into place. After that it keeps still.
function entrance(gsap, mic) {
  return gsap.timeline({ paused: true, defaults: { ease: "expo.out" } })
    .fromTo(mic.querySelector(".attract-mic-head"), { scale: 0, svgOrigin: MIC_CORNER }, { scale: 1, svgOrigin: MIC_CORNER, duration: 0.7 }, 0.25)
    .fromTo(mic.querySelector(".attract-mic-label"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, ease: "none" }, 0.55)
    .fromTo(mic.querySelector(".attract-mic-label textPath"), { attr: { startOffset: "66%" } }, { attr: { startOffset: "50%" }, duration: 0.8 }, 0.55)
    .fromTo(mic.querySelector(".attract-mic-hint"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4 }, 0.9);
}

// How long the pointer must have been still for its return to count as someone showing up.
const NOTICE_AFTER_MS = 8000;

// `freezeAt` holds the questions on one moment of their loop and the mascot at rest; `mood` holds
// the mascot in one feeling. Both are for looking at the screen.
export function createAttract({ overlay, gsap, still = false, freezeAt = null, mood = "", random = Math.random, onTakeMic = () => {} }) {
  const el = document.createElement("div");
  el.className = "attract-loop";
  el.innerHTML = ASKS_MARKUP;
  overlay.append(el);
  // The microphone is its own layer, after the attract screen in the page, so that it sits over the
  // mascot, which lives in a layer above the screen.
  const mic = document.createElement("button");
  mic.id = "voice-mic";
  mic.type = "button";
  mic.setAttribute("aria-label", "Take the mic");
  mic.innerHTML = MIC_MARKUP;
  overlay.parentNode.append(mic);
  mic.addEventListener("click", onTakeMic);
  const hint = mic.querySelector(".attract-mic-hint");

  const animated = Boolean(gsap) && !still;
  if (!animated) el.classList.add("is-still");
  const tl = animated ? compose(gsap, el) : null;
  const arrive = animated ? entrance(gsap, mic) : null;
  const frozen = animated && Number.isFinite(freezeAt) ? wrap(freezeAt) : null;
  if (frozen !== null) { tl.time(frozen); arrive.progress(1); }

  const director = createDirector({ random });
  const held = mood ? { ...CALM, mood } : frozen !== null ? CALM : null;
  let active = false, pointerAt = 0;
  window.addEventListener("pointermove", () => {
    const now = performance.now();
    if (active && now - pointerAt > NOTICE_AFTER_MS) director.notice();
    pointerAt = now;
  }, { passive: true });

  const asks = el.querySelector(".attract-asks");
  return {
    // The box of the example questions, which the wandering mascot keeps clear of.
    asks: () => asks.getBoundingClientRect(),
    // What the mascot feels and does now; `seconds` have passed since the last call.
    cue: (seconds, reduced = false) => (still || reduced ? CALM : held || director.step(seconds)),
    // The room the mascot may fill: the whole attract screen.
    room: () => overlay.getBoundingClientRect(),
    // Each time the attract screen takes the floor the mascot greets whoever is there, and the
    // questions start from the first.
    setActive(on) {
      active = on;
      if (on) director.greet();
      if (!tl || frozen !== null) return;
      if (on) {
        tl.time(0);
        tl.play();
        arrive.restart();
      } else tl.pause();
    },
    setHint(state, status) {
      const text = state in HINTS ? HINTS[state] : status || "";
      if (hint.textContent !== text) hint.textContent = text;
    },
  };
}
