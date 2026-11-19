// The mascot: a flat green disc with two oval eyes, moved by springs rather than by keyframes. Its
// body squashes and stretches around the point it stands on, it hops with a crouch before and a
// squash on landing, its eyes grow, narrow and arch from one feeling's shape into the next, its
// gaze follows the pointer or wanders, and it blinks when it likes. Lengths are in face units: the
// disc has radius 1, x grows to the right and y downward.

// ---------------------------------------------------------------------------------------------
// Physics

// One step of a damped spring toward `target`. A low damping for its stiffness is what makes the
// body wobble like jelly.
export function spring(state, target, stiffness, damping, seconds) {
  state.v += (stiffness * (target - state.x) - damping * state.v) * seconds;
  state.x += state.v * seconds;
}

// Stiffness and damping of each part. The body is the loosest; a shake of the head the tightest.
const GAZE = [210, 22], TILT = [90, 12], SQUASH = [320, 13], EYE = [230, 20], SHAKE = [900, 44];
// A hop: with this gravity and take-off speed a full one peaks about a sixth of the disc's radius
// up and lasts under a quarter of a second.
const GRAVITY = 26, TAKE_OFF = 3, LANDING = 0.75;
// It crouches this long before a hop leaves the ground.
export const CROUCH_SECONDS = 0.09;
// One shake of the head, [second, turn], used when none is given.
const SHAKE_FRAMES = [[0, 0], [0.14, -0.68], [0.28, 0.68], [0.42, 0.2], [0.5, 0]];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// How open the eyes are, `ms` after a blink began: shut in 70 ms, open again by 200 ms; a double
// blink does it twice.
export function blinkOpen(ms, double = false) {
  const once = (t) => (t < 70 ? 1 - t / 70 * 0.94 : t < 200 ? 0.06 + (t - 70) / 130 * 0.94 : 1);
  if (ms < 0) return 1;
  if (ms < 200) return once(ms);
  return double && ms >= 260 && ms < 460 ? once(ms - 260) : 1;
}

// ---------------------------------------------------------------------------------------------
// Eyes
//
// The face is flat: a disc and two ovals. What makes it read as a head is where the ovals sit. They
// are placed as if on a ball that turns with the gaze, so the eye turning toward the viewer grows
// and the one turning away shrinks and nears the edge.

// How far apart the eyes sit on that ball, and how far a full glance turns it, in radians.
const EYE_SPREAD = 0.44, TURN_X = 0.6, TURN_Y = 0.48;
// A shut eye keeps this much height, so that it stays a line one can see on the small mascot.
const MIN_EYE = 0.02;

// The two eyes (left, then right) of a face turned by yaw and pitch: centre (x, y), radii (rx, ry)
// and lean (spin, in radians).
export function projectEyes(yaw, pitch) {
  return [-EYE_SPREAD, EYE_SPREAD].map((offset) => {
    const longitude = offset + yaw;
    const depth = Math.cos(longitude) * Math.cos(pitch);
    const perspective = 2.4 / (3.4 - depth);
    const scale = (depth * perspective) ** 0.65;
    return {
      x: 0.83 * Math.sin(longitude) * Math.cos(pitch) * perspective,
      y: 0.83 * Math.sin(pitch) * perspective,
      rx: 0.26 * scale * Math.cos(longitude),
      ry: 0.43 * scale,
      spin: -longitude * 0.08,
    };
  });
}

// What a feeling does to an eye: its size, how far it is open, how much of an arch it is (the
// closed, smiling eye, from 0 to 1) and an extra lean in degrees. Every feeling is two such eyes,
// so one springs into another without a cut.
const EYE_KEYS = ["size", "open", "arc", "turn"];
const shaped = ({ size = 1, open = 1, arc = 0, turn = 0 } = {}) => ({ size, open, arc, turn });
const both = (shape) => [shaped(shape), shaped(shape)];
const mirrored = (mood) => ({
  ...mood, tilt: -(mood.tilt || 0),
  eyes: [mood.eyes[1], mood.eyes[0]].map((eye) => ({ ...eye, turn: -eye.turn })),
});
const CURIOUS = {
  // Looking to the right: the eye nearer the viewer opens wider, the other narrows, the head cocks.
  eyes: [shaped({ open: 1.07 }), shaped({ open: 0.63 })],
  tilt: 8, lean: 5,
};
const SUSPICIOUS = {
  // Both eyes narrow, the far one more, for a look that is not sure about what it sees.
  eyes: [shaped({ open: 0.55 }), shaped({ open: 0.4 })],
  tilt: -4, lean: 4,
};

// Each feeling: the two eyes (left, then right), how the body holds itself (tilt in degrees, squash
// as its height, sway in degrees to each side, a beat in seconds for each swing), and where it
// looks if the feeling looks somewhere of its own. `still` keeps the eyes from blinking.
export const MOODS = {
  attentive: { eyes: both() },
  happy: { eyes: both({ arc: 1 }), squash: 1.02, still: true },
  // Looking to the right with interest; curiousLeft is its mirror image.
  curious: CURIOUS,
  curiousLeft: mirrored(CURIOUS),
  suspicious: SUSPICIOUS,
  suspiciousLeft: mirrored(SUSPICIOUS),
  thinking: {
    eyes: both({ size: 0.98 }), lean: 5,
    gaze: (seconds) => [Math.floor(seconds / 1.6) % 2 ? 0.62 : -0.62, -0.6],
  },
  // The microphone is held out from the lower right.
  pointing: { eyes: both(), tilt: 4, gaze: () => [0.72, 0.7] },
  sway: { eyes: both({ open: 0.9 }), sway: 5, squash: 1.01 },
  // A quick, pleased shimmy.
  wiggle: { eyes: both({ arc: 1 }), sway: 13, beat: 0.2, still: true },
  // Leaning in for a closer look at whoever is there.
  peek: { eyes: both({ size: 1.1, open: 1.03 }), squash: 1.03, gaze: () => [0, 0.04] },
  startled: { eyes: both({ size: 1.18, open: 1.1 }), squash: 1.05, gaze: () => [0, -0.15] },
  // A wink: one eye smiles shut, the other stays open.
  winkLeft: { eyes: [shaped({ arc: 1 }), shaped()], tilt: -5, still: true },
  winkRight: { eyes: [shaped(), shaped({ arc: 1 })], tilt: 5, still: true },
  talking: { eyes: both({ size: 0.97 }) },
  off: { eyes: both({ open: 0.07 }), squash: 0.97, gaze: () => [0, 0.3], still: true, dim: true },
};

// Which feeling a conversation state wears. Between conversations the attract screen's cue decides.
const STATE_MOOD = { listening: "attentive", thinking: "thinking", connecting: "thinking", speaking: "talking", deaf: "off", blocked: "off" };

// ---------------------------------------------------------------------------------------------
// The model: everything about the mascot that is not drawing. `step` advances it by one frame and
// returns the sounds that frame made; `pose` is what to draw.

export function createMascotModel({ random = Math.random } = {}) {
  const unit = (x = 0) => ({ x, v: 0 });
  const gazeX = unit(), gazeY = unit(), tilt = unit(), squash = unit(1);
  const hop = { y: 0, vy: 0 };
  const eyes = MOODS.attentive.eyes.map((eye) => Object.fromEntries(EYE_KEYS.map((key) => [key, unit(eye[key])])));
  let mood = "attentive", moodAt = 0, cue = -1, cueElapsed = 0;
  let pending = [];                                 // what waits for its moment: { at, run }
  const blink = { at: -1, double: false, next: 1.8 };
  const wander = { x: 0, y: 0, home: true, next: 0 };
  const dip = { at: -1, strength: 0 };
  let shakeAt = -1, shakeKey = "", heardFor = 0, understoodFor = 0, nextHop = 0, nextNod = 0, hush = 1;
  let clock = 0, sounds = [], rested = false;

  const later = (delay, run) => pending.push({ at: clock + delay, run });
  const startBlink = (double = random() < 0.2) => {
    blink.at = clock; blink.double = double; blink.next = clock + 2.6 + random() * 3.2;
  };
  const actions = {
    // Crouch, then leave the ground stretched; the landing squashes it again.
    hop(strength = 1, sound = "") {
      squash.v -= 2.4 * strength;
      later(CROUCH_SECONDS, () => { hop.vy = -TAKE_OFF * strength; squash.v += 4.2 * strength; if (sound) sounds.push(sound); });
    },
    // A quick dip of the eyes and the body.
    nod(strength = 1, sound = "") {
      dip.at = clock; dip.strength = strength; squash.v -= 1.6 * strength;
      if (sound) sounds.push(sound);
    },
    blink(times = 1) { startBlink(times > 1); },
    sound(_, name) { if (name) sounds.push(name); },
  };
  const feel = (name, still) => {
    if (name === mood) return;
    mood = name; moodAt = clock; pending = [];
    if (still) return;
    // A new feeling goes through the whole body.
    squash.v -= 1.2;
    if (!MOODS[name].still) later(0.04, () => startBlink(false));
  };

  return {
    // input: state ("listening", …); scene, the attract screen's cue { index, elapsed, mood, gaze,
    // events: [[second, action, strength, sound]] }, or null; voice (0–1); heard (speech is being
    // recognised); fallback (a key that changes when an action could not run); shake (frames
    // [second, turn] of the head shake); scrolling (-1, 0, 1); pointer ([x, y] toward the pointer,
    // in face units, or null); look ([x, y], where it looks when nothing else asks); travel
    // ([x, y], how fast the stage carries it, in radii a second); still (reduced motion).
    step(seconds, input = {}) {
      const { state = "idle", scene = null, voice = 0, still = false } = input;
      clock += seconds;
      sounds = [];
      rested = still;

      // The feeling: a conversation state's own, or the attract screen's cue.
      const cued = Boolean(scene) && !STATE_MOOD[state] && Boolean(MOODS[scene.mood]);
      feel(STATE_MOOD[state] || (cued ? scene.mood : "attentive"), still);
      if (cued) {
        const fresh = scene.index !== cue || scene.elapsed < cueElapsed;
        // Joining a cue late leaves out what should already have happened.
        const before = fresh ? Math.max(-1e-6, scene.elapsed - 0.25) : cueElapsed;
        cue = scene.index; cueElapsed = scene.elapsed;
        if (!still) {
          for (const [at, action, strength = 1, sound = ""] of scene.events || []) {
            if (before < at && at <= scene.elapsed) actions[action]?.(strength, sound);
          }
        }
      } else cue = -1;
      const now = MOODS[mood], age = clock - moodAt;

      // Listening: a hop of recognition when a voice starts, a pair of nods now and then while
      // speech is understood, and a shake of the head when an action could not run.
      if (state === "listening" && !still) {
        const hears = voice > 0.1 || Boolean(input.heard);
        const was = heardFor;
        heardFor = hears ? heardFor + seconds : 0;
        if (was <= 0.12 && heardFor > 0.12 && clock >= nextHop) { actions.hop(0.5); nextHop = clock + 1.2; }
        understoodFor = input.heard && voice > 0.12 ? understoodFor + seconds : 0;
        if (understoodFor >= 0.75 && clock >= nextNod) {
          actions.nod(0.8);
          later(0.34, () => actions.nod(0.7));
          nextNod = clock + 3.4; understoodFor = 0;
        }
        if (input.fallback && input.fallback !== shakeKey) shakeAt = clock;
      } else { heardFor = 0; understoodFor = 0; }
      shakeKey = state === "listening" ? input.fallback || "" : "";
      // Speaking: a small hop as its voice comes in after a pause.
      if (state === "speaking" && !still) {
        if (voice > 0.2 && hush >= 0.6) { actions.hop(0.35); hush = 0; }
        hush = voice < 0.1 ? hush + seconds : voice > 0.2 ? 0 : hush;
      } else hush = 1;

      if (pending.length) {
        const due = pending.filter((item) => clock >= item.at);
        pending = pending.filter((item) => clock < item.at);
        for (const item of due) item.run();
      }
      if (!still && !now.still && clock >= blink.next) startBlink();

      // Where it looks: a shake of the head first, then what the cue or the feeling wants, the
      // page as it scrolls, the pointer, and otherwise wherever its eyes wander.
      let look = null, gazeSpring = GAZE;
      const frames = input.shake?.length > 1 ? input.shake : SHAKE_FRAMES;
      const shaking = shakeAt >= 0 ? clock - shakeAt : -1;
      if (shaking >= 0 && shaking < frames.at(-1)[0]) {
        const next = Math.max(1, frames.findIndex((frame) => frame[0] > shaking));
        const [t0, turn0] = frames[next - 1], [t1, turn1] = frames[next];
        const widest = Math.max(...frames.map((frame) => Math.abs(frame[1]))) || 1;
        look = [(turn0 + (turn1 - turn0) * (shaking - t0) / (t1 - t0)) / widest, 0.1];
        gazeSpring = SHAKE;
      } else {
        shakeAt = -1;
        look = (cued && scene.gaze) || now.gaze?.(still ? 0 : age) || null;
        if (!look && still && state === "listening" && input.fallback) look = [-0.6, 0.1];
        if (!look && state === "listening" && input.scrolling) look = [0.1, input.scrolling * 0.8];
        if (!look && input.pointer) look = input.pointer;
        if (!look && still) look = input.look || [0, 0];
        if (!look) {
          if (clock >= wander.next) {
            const angle = random() * Math.PI * 2, far = random() < 0.3 ? 0 : 0.25 + random() * 0.4;
            wander.x = Math.cos(angle) * far; wander.y = Math.sin(angle) * far * 0.7;
            wander.home = random() < 0.2;
            wander.next = clock + 1.2 + random() * 2;
          }
          // Beside the content it looks at the content, with a glance at the visitor now and then.
          look = !input.look ? [wander.x, wander.y]
            : wander.home ? [0, 0] : [input.look[0] + wander.x * 0.3, input.look[1] + wander.y * 0.3];
        }
      }
      const far = Math.hypot(look[0], look[1]);
      if (far > 1) look = [look[0] / far, look[1] / far];
      const nodding = dip.at >= 0 && clock - dip.at < 0.26 ? dip.strength * 0.6 * Math.sin(Math.PI * (clock - dip.at) / 0.26) : 0;

      // The body: it leans with its gaze, sways when it feels like it, trails behind when the stage
      // carries it, and takes the shape its voice gives it, flatter while it listens to a loud
      // voice and taller while it speaks.
      const travel = input.travel || [0, 0];
      const sway = now.sway ? now.sway * Math.sin(Math.PI * age / (now.beat || 1)) : 0;
      const lean = (now.tilt || 0) + sway + gazeX.x * (now.lean ?? 3) + clamp(-travel[0] * 2.2, -14, 14);
      const shape = (now.squash || 1) + Math.min(0.06, Math.abs(travel[1]) * 0.006)
        + (state === "speaking" ? 0.07 * voice : state === "listening" ? -0.035 * voice : 0);
      if (still) {
        gazeX.x = look[0]; gazeY.x = look[1]; tilt.x = now.tilt || 0; squash.x = now.squash || 1;
        gazeX.v = gazeY.v = tilt.v = squash.v = hop.y = hop.vy = 0;
        eyes.forEach((eye, i) => EYE_KEYS.forEach((key) => { eye[key].x = now.eyes[i][key]; eye[key].v = 0; }));
        return sounds;
      }
      // Short steps keep the springs true when frames arrive late.
      const steps = Math.max(1, Math.ceil(seconds * 60 - 1e-6)), dt = seconds / steps;
      for (let i = 0; i < steps; i += 1) {
        spring(gazeX, look[0], ...gazeSpring, dt);
        spring(gazeY, look[1] + nodding, ...gazeSpring, dt);
        spring(tilt, lean, ...TILT, dt);
        spring(squash, shape, ...SQUASH, dt);
        if (hop.y < 0 || hop.vy < 0) {
          hop.vy += GRAVITY * dt; hop.y += hop.vy * dt;
          if (hop.y >= 0) { squash.v -= Math.abs(hop.vy) * LANDING; hop.y = 0; hop.vy = 0; }
        }
        eyes.forEach((eye, side) => EYE_KEYS.forEach((key) => spring(eye[key], now.eyes[side][key], ...EYE, dt)));
      }
      return sounds;
    },

    // A push from outside: a pointer arriving over it, a press.
    poke(strength = 1) { squash.v += strength; },
    get mood() { return mood; },

    pose() {
      const now = MOODS[mood];
      const open = now.still || rested ? 1 : blinkOpen((clock - blink.at) * 1000, blink.double);
      const gx = gazeX.x, gy = gazeY.x;
      // Where the eyes sit on a head turned as far as it is looking.
      const seats = projectEyes(clamp(gx, -1.15, 1.15) * TURN_X, clamp(gy, -1.15, 1.15) * TURN_Y);
      // A slow breath, unless it is to keep still. However hard it is thrown about, it stays round.
      const tall = clamp(squash.x + (rested ? 0 : Math.sin(clock * 1.7) * 0.01), 0.82, 1.16);
      const wide = 1 + (1 - tall) * 0.8;
      const height = Math.min(-hop.y, 0.4);
      return {
        // The body, around the point it stands on: tall and wide keep its volume.
        shift: gx * 0.05, lift: hop.y, tilt: tilt.x, tall, wide,
        dim: Boolean(now.dim),
        // Each eye: centre, radii and lean of its oval, and how much of an arch it is.
        eyes: eyes.map((eye, side) => {
          const seat = seats[side], arc = clamp(eye.arc.x, 0, 1.1), size = Math.max(0.2, eye.size.x);
          return {
            x: seat.x, y: seat.y,
            rx: seat.rx * size * (1 + 0.14 * arc),
            ry: Math.max(MIN_EYE, seat.ry * size * eye.open.x * open * (1 - 0.12 * arc)),
            spin: seat.spin + eye.turn.x * Math.PI / 180,
            arc,
          };
        }),
        // Off the ground its shadow is smaller and fainter.
        shadow: { wide: 1 - height / 1.1 + (wide - 1) * 1.2, alpha: 1 - height / 0.7 },
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing

const HEX = /^#[0-9a-f]{6}$/i;
const mix = (from, to, amount) => `#${[1, 3, 5].map((at) => Math.round(parseInt(from.slice(at, at + 2), 16) * (1 - amount) + parseInt(to.slice(at, at + 2), 16) * amount).toString(16).padStart(2, "0")).join("")}`;

// The mascot's flat colours, the site's own: its green for the face, its two pale greens for the
// eyes (the left one lighter). A mascot that cannot hear wears them dimmed toward the dark green.
export function mascotPaint(signal = "", forest = "", sage = "", mist = "") {
  const face = HEX.test(signal) ? signal : "#1C855C", dark = HEX.test(forest) ? forest : "#002010";
  const eyes = [HEX.test(mist) ? mist : "#C8D8C8", HEX.test(sage) ? sage : "#90B0A0"];
  return { on: { face, eyes }, off: { face: mix(face, dark, 0.6), eyes: eyes.map((eye) => mix(eye, dark, 0.62)) } };
}

// Draws the face at the origin of `ctx`, its radius being `r` pixels: one flat disc and two flat
// ovals. The body's lean, squash and hop are not drawn here: they are moves of the whole canvas.
export function drawMascot(ctx, r, pose, paint = mascotPaint()) {
  const colors = pose.dim ? paint.off : paint.on;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = colors.face;
  ctx.fill();
  // Nothing of an eye shows beyond the face.
  ctx.save();
  ctx.clip();
  // The right eye first, so that the left lies over it where they meet.
  for (const side of [1, 0]) {
    const eye = pose.eyes[side];
    ctx.save();
    ctx.translate(eye.x * r, eye.y * r);
    ctx.rotate(eye.spin);
    ctx.beginPath();
    ctx.ellipse(0, 0, eye.rx * r, eye.ry * r, 0, 0, Math.PI * 2);
    ctx.fillStyle = colors.eyes[side];
    ctx.fill();
    if (eye.arc > 0.01) {
      // A smiling eye is an arch: the eye with face laid over its lower part.
      ctx.beginPath();
      ctx.ellipse(0, eye.ry * r * (2.2 - 1.58 * eye.arc), eye.rx * r * 1.3, eye.ry * r * 1.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = colors.face;
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Sound: small synthesized voices for what the mascot does on the attract screen: plips, clinks
// and chirps, light and bright, nothing recorded and nothing that sounds like a creature. Each is
// a few partials with a fast decay: [wave, frequency from, frequency to, seconds, loudness, delay].
export const VOICES = {
  // A drop of water: a quick rise.
  plip: [["sine", 520, 1250, 0.075, 0.16, 0]],
  // The same drop, smaller: a step on the way somewhere.
  pip: [["sine", 700, 1150, 0.05, 0.09, 0]],
  // Two small drops under its breath.
  murmur: [["sine", 760, 980, 0.045, 0.06, 0], ["sine", 660, 880, 0.05, 0.06, 0.1]],
  // Two drops, the second higher: a call for attention.
  call: [["sine", 560, 1180, 0.07, 0.15, 0], ["sine", 700, 1480, 0.07, 0.15, 0.13]],
  // Glass touched by glass: high partials that are not in tune with each other.
  clink: [["sine", 2349, 2349, 0.24, 0.12, 0], ["sine", 3520, 3520, 0.17, 0.066, 0], ["sine", 5274, 5274, 0.09, 0.036, 0]],
  ting: [["sine", 1568, 1568, 0.22, 0.11, 0], ["sine", 2352, 2352, 0.15, 0.054, 0]],
  // A plucked note and a lower one after it: something being turned over.
  plink: [["sine", 1319, 1319, 0.16, 0.11, 0], ["sine", 988, 988, 0.2, 0.1, 0.17]],
  // A small machine's "oh!".
  blip: [["triangle", 620, 1480, 0.1, 0.12, 0]],
  // A short rise that asks a question.
  peep: [["sine", 880, 1400, 0.09, 0.12, 0]],
  // A drop falling the other way: not convinced.
  bloop: [["sine", 740, 430, 0.1, 0.12, 0]],
  // Three quick notes, a small machine being pleased.
  chirp: [["sine", 880, 1040, 0.05, 0.12, 0], ["sine", 1320, 1500, 0.05, 0.12, 0.07], ["sine", 1100, 1650, 0.08, 0.12, 0.14]],
  // Four quick notes back and forth: a giggle.
  trill: [["sine", 1568, 1700, 0.045, 0.1, 0], ["sine", 1319, 1400, 0.045, 0.1, 0.07], ["sine", 1568, 1700, 0.045, 0.1, 0.14], ["sine", 1760, 1980, 0.06, 0.1, 0.21]],
  // A little tune of four plucked notes, to sway to.
  tune: [["sine", 1047, 1047, 0.13, 0.1, 0], ["sine", 1319, 1319, 0.13, 0.1, 0.2], ["sine", 1568, 1568, 0.13, 0.1, 0.4], ["sine", 1319, 1319, 0.18, 0.1, 0.6]],
};
// Scales every voice at once; 0 keeps the mascot silent.
export const CHIRP_LEVEL = 0.8;
// No two sounds are quite the same: each is tuned up or down by up to this much.
const CHIRP_DRIFT = 0.07;

// Returns say(name): the mascot makes that sound, if it may.
export function createChirps(view = window, random = Math.random) {
  let context = null;
  return (name) => {
    const voice = VOICES[name];
    const Audio = view.AudioContext || view.webkitAudioContext;
    // A browser keeps sound shut until the page has been touched; until then the mascot is silent.
    if (!voice || !Audio || !CHIRP_LEVEL || view.navigator?.userActivation?.hasBeenActive === false) return;
    try {
      context ||= new Audio();
      if (context.state !== "running") { context.resume()?.catch(() => {}); return; }
      const tune = 1 + (random() * 2 - 1) * CHIRP_DRIFT;
      for (const [wave, from, to, seconds, loudness, delay] of voice) {
        const start = context.currentTime + delay;
        const tone = context.createOscillator(), level = context.createGain();
        tone.type = wave;
        tone.frequency.setValueAtTime(from * tune, start);
        tone.frequency.exponentialRampToValueAtTime(to * tune, start + seconds);
        level.gain.setValueAtTime(0, start);
        level.gain.linearRampToValueAtTime(loudness * CHIRP_LEVEL, start + 0.005);
        level.gain.exponentialRampToValueAtTime(0.0005, start + seconds);
        tone.connect(level);
        level.connect(context.destination);
        tone.onended = () => { tone.disconnect(); level.disconnect(); };
        tone.start(start);
        tone.stop(start + seconds + 0.02);
      }
    } catch {
      // Sound is a nicety: a refusal must never stop the mascot.
    }
  };
}

// ---------------------------------------------------------------------------------------------
// The mascot on the page: a canvas that is redrawn when the face changes and moved as a whole for
// the body's lean, squash and hop.

// The face's radius, of its square canvas: 34 px of 88.
export const BALL_RADIUS = 34 / 88;
const CANVAS_MAX = 3072;
// The stage shows the mascot at up to this many times its size in a conversation.
const DEFAULT_RESOLUTION = 3.2;

export function createMascot({ canvas, root, level = () => 0, shake = SHAKE_FRAMES, say = () => {}, view = window }) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { refresh() {}, setDirection() {}, setResolution() {}, poke() {} };
  const { document, performance } = view;
  const motion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const tokens = view.getComputedStyle ? view.getComputedStyle(root) : null;
  const paint = mascotPaint(...["--signal", "--deep-forest", "--sage", "--mist"].map((name) => tokens?.getPropertyValue(name).trim()));
  const model = createMascotModel();
  let direction = null, resolution = DEFAULT_RESOLUTION, size = 88, raf = 0, last = 0, drawn = "";
  let pointer = null, scrollY = view.scrollY || 0, scrolling = 0, scrollUntil = 0;

  const frame = (now = performance.now()) => {
    // A queued frame can carry a time from before a refresh in the same frame.
    now = Math.max(now, last);
    raf = 0;
    if (document.hidden) return;
    const still = motion.matches;
    const seconds = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
    last = now;
    const state = root.dataset.state;
    // The page moving under it, by hand or by the agent.
    const pageY = Math.max(0, view.scrollY || 0);
    if (Math.abs(pageY - scrollY) > 0.5) { scrolling = Math.sign(pageY - scrollY); scrollUntil = now + 100; }
    scrollY = pageY;
    // The pointer, for a second and a half after it last moved.
    let toward = null;
    if (pointer && now - pointer.at < 1500) {
      const box = canvas.getBoundingClientRect();
      if (box.width) toward = [(pointer.x - (box.left + box.width / 2)) / (box.width * 1.1), (pointer.y - (box.top + box.height / 2)) / (box.height * 1.1)];
    }
    const told = direction ? direction() : null;
    const sounds = model.step(seconds, {
      state, still, shake, pointer: toward,
      scene: told?.scene || null, travel: told?.travel, look: told?.look || null,
      voice: still ? 0 : clamp(Number(level(seconds, state)) || 0, 0, 1),
      heard: root.dataset.speaking === "true", fallback: root.dataset.fallback || "",
      scrolling: now < scrollUntil ? scrolling : 0,
    });
    for (const name of sounds) say(name);

    const pose = model.pose(), r = size * BALL_RADIUS;
    // The face is painted again only when something on it has moved.
    const face = `${pose.dim}${pose.eyes.map((eye) => [eye.x, eye.y, eye.rx, eye.ry, eye.spin, eye.arc].map((value) => value.toFixed(4)).join()).join()}`;
    if (face !== drawn) {
      drawn = face;
      ctx.clearRect(0, 0, size, size);
      ctx.save();
      ctx.translate(size / 2, size / 2);
      drawMascot(ctx, r, pose, paint);
      ctx.restore();
    }
    canvas.style.translate = `${(pose.shift * r).toFixed(2)}px ${(pose.lift * r).toFixed(2)}px`;
    canvas.style.rotate = `${pose.tilt.toFixed(2)}deg`;
    canvas.style.scale = `${pose.wide.toFixed(4)} ${pose.tall.toFixed(4)}`;
    root.style.setProperty("--voice-shadow-scale", Math.max(0.2, pose.shadow.wide).toFixed(3));
    root.style.setProperty("--voice-shadow-alpha", clamp(pose.shadow.alpha, 0, 1).toFixed(3));
    if (!still) raf = view.requestAnimationFrame(frame);
  };
  const refresh = () => { view.cancelAnimationFrame(raf); raf = 0; last = 0; frame(); };
  const fit = () => {
    size = canvas.clientWidth || 88;
    // One canvas pixel per screen pixel at the size the stage shows the mascot, within a sane texture.
    const dpr = Math.min(Math.min(2, view.devicePixelRatio || 1) * resolution, CANVAS_MAX / size);
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawn = "";
    refresh();
  };
  view.addEventListener("resize", fit);
  view.addEventListener("pointermove", (event) => { pointer = { x: event.clientX, y: event.clientY, at: performance.now() }; }, { passive: true });
  document.addEventListener("visibilitychange", refresh);
  motion.addEventListener("change", refresh);
  fit();
  return {
    refresh,
    // What the stage tells the mascot each frame: a function returning { scene, travel, look }.
    setDirection(tell) { direction = tell; refresh(); },
    // How many times its own size the stage is about to show the mascot; 0 returns to the default.
    setResolution(scale) {
      const next = Math.max(DEFAULT_RESOLUTION, Number(scale) || 0);
      if (Math.abs(next - resolution) < resolution * 0.04) return;
      resolution = next;
      fit();
    },
    // A push on the body; it wobbles and settles.
    poke(strength) { if (!motion.matches) model.poke(strength); },
  };
}
