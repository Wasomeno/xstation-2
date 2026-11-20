// The mascot's stage. Between conversations it is large in the middle of the attract screen, going
// through its feelings. When a conversation starts nothing changes while the call connects, except
// that the mascot turns to the visitor and a pulse runs behind it; as soon as the agent is there,
// the attract screen collapses into the mascot and the page shows. While the agent says its
// greeting the mascot stays large in the middle of the page; then it shrinks and moves to the
// emptiest spot beside the content. When the session ends, the screen opens again from wherever
// the mascot stands. The stage only carries the mascot from place to place and size to size; how
// its body takes the ride is voice-mascot.js.

const CELL = 24;
// The mascot in its own 88 px box: a ball of radius 34 px that stands on y = 78.
const RADIUS = 34;
const GROUND_INSET = 10;
const DISC = RADIUS * 2;
// How much of the screen's height the mascot takes on the attract screen.
const FACE_FILL = 0.7;
// Its room to wander on the attract screen, in its own radii: to either side (less where the
// example questions are in the way), up and down. FACE_GROWS is the largest it gets on the way.
const WANDER = { side: 0.6, up: 0.08, down: 0.14 };
const FACE_GROWS = 1.12;
const REST = { spot: [0, 0], zoom: 1 };
// Where it looks while it greets: at the visitor.
const FACING = [0, -0.04];
// What it does on being called, while the call connects: a small hop, then it waits, attentive.
const CALLED = { mood: "attentive", gaze: FACING, events: [[0, "hop", 0.6]] };
// How much of the screen's height it takes while the agent greets the visitor.
const GREET_FILL = 0.5;
const SIDE_SCALE = 1.4;
const CENTER_SCALE_MAX = 3.2;
// Stiffness and damping of the spring that carries the mascot into each pose. Growing into the
// large face keeps some bounce.
const SPRING = { greet: [170, 18], side: [220, 28], face: [150, 16] };
const SCAN_MS = 250;
const SCROLL_SETTLE_MS = 120;
// How long the attract screen takes to collapse into the mascot, or to open from it.
const COVER_SECONDS = 0.36;
// What it costs the mascot to cross the whole screen for a spot, against 3 for standing in the
// middle of it rather than at an edge. Half the screen costs a little less than that, so a free
// corner beats staying in the middle on a screen of any size.
const CROSSING = 5.76;
const SESSION = new Set(["connecting", "listening", "thinking", "speaking"]);

const INFO = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,label,a,button,input,img,video,svg,canvas";
const MEDIA = new Set(["IMG", "VIDEO", "SVG", "CANVAS"]);
const CONTROLS = new Set(["A", "BUTTON", "INPUT"]);

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// Marks which cells of the viewport hold information: text weighs 1, media a little less.
export function occupancy(rects, width, height) {
  const cols = Math.max(1, Math.ceil(width / CELL)), rows = Math.max(1, Math.ceil(height / CELL));
  const cells = new Float32Array(cols * rows);
  for (const rect of rects) {
    const weight = rect.weight ?? 1;
    const x0 = clamp(Math.floor(rect.left / CELL), 0, cols), x1 = clamp(Math.ceil(rect.right / CELL), 0, cols);
    const y0 = clamp(Math.floor(rect.top / CELL), 0, rows), y1 = clamp(Math.ceil(rect.bottom / CELL), 0, rows);
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) if (cells[y * cols + x] < weight) cells[y * cols + x] = weight;
    }
  }
  return { cols, rows, cells };
}

function covered({ cols, rows, cells }, left, top, right, bottom) {
  const x0 = clamp(Math.floor(left / CELL), 0, cols), x1 = clamp(Math.ceil(right / CELL), 0, cols);
  const y0 = clamp(Math.floor(top / CELL), 0, rows), y1 = clamp(Math.ceil(bottom / CELL), 0, rows);
  let sum = 0;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) sum += cells[y * cols + x];
  return sum;
}

// Chooses where the mascot stands (x, y is the point it stands on) and where its caption goes.
// Costs are in covered cells: hiding information dominates; among free spots it prefers the
// bottom corners and a short move. Both are measured against the size of the screen, so that a
// large screen is laid out like a small one. `current` keeps its place unless another spot is
// clearly better.
export function pickSpot({ rects, width, height, body, bubble = null, current = null, from = null, margin = 16 }) {
  const grid = occupancy(rects, width, height);
  const minX = margin + body.w / 2, maxX = width - margin - body.w / 2;
  const maxY = height - margin, minY = margin + body.h;
  const evaluate = (x, y) => {
    const blocked = covered(grid, x - body.w / 2, y - body.h, x + body.w / 2, y);
    let cost = blocked * 4
      + (maxY - y) / 100 * 1.5
      + (1 - Math.abs(x - width / 2) / (width / 2)) * 3
      + (from ? Math.hypot(x - from.x, y - from.y) / width * CROSSING : 0);
    let best = { placement: "above", cost: 0, left: 0, top: 0 };
    if (bubble) {
      best = null;
      const options = [
        { placement: "above", left: clamp(x - bubble.w / 2, margin, width - margin - bubble.w), top: y - body.h - 8 - bubble.h, extra: 0 },
        { placement: "right", left: x + body.w / 2 + 8, top: clamp(y - body.h / 2 - bubble.h / 2, margin, height - margin - bubble.h), extra: 0.5 },
        { placement: "left", left: x - body.w / 2 - 8 - bubble.w, top: clamp(y - body.h / 2 - bubble.h / 2, margin, height - margin - bubble.h), extra: 0.5 },
      ];
      for (const option of options) {
        if (option.left < margin - 0.5 || option.left + bubble.w > width - margin + 0.5 || option.top < margin - 0.5) continue;
        option.cost = covered(grid, option.left, option.top, option.left + bubble.w, option.top + bubble.h) + option.extra;
        if (!best || option.cost < best.cost) best = option;
      }
      if (!best) return null;
    }
    cost += best.cost;
    return { x, y, placement: best.placement, bubble: bubble ? { left: best.left, top: best.top } : null, blocked, cost };
  };
  let best = null;
  if (maxX >= minX && maxY >= minY) {
    const columns = Math.max(1, Math.round((maxX - minX) / 90));
    const rowStep = Math.max(48, body.h * 0.6);
    for (let y = maxY; y >= minY; y -= rowStep) {
      for (let i = 0; i <= columns; i += 1) {
        const spot = evaluate(minX + (maxX - minX) * i / columns, y);
        if (spot && (!best || spot.cost < best.cost)) best = spot;
      }
    }
  }
  if (current) {
    const stay = evaluate(clamp(current.x, minX, Math.max(minX, maxX)), clamp(current.y, minY, Math.max(minY, maxY)));
    // Three cells of slack: a slightly better spot is not worth another move.
    if (stay && (!best || stay.cost <= best.cost + 3)) return stay;
  }
  return best;
}

function collectInfo(root, overlay, width, height) {
  const rects = [];
  for (const el of document.querySelectorAll(INFO)) {
    if (root.contains(el) || overlay.contains(el)) continue;
    const tag = el.tagName.toUpperCase();
    const media = MEDIA.has(tag);
    if (!media && !CONTROLS.has(tag) && !el.textContent.trim()) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4 || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) continue;
    // A layer that fills the screen is a backdrop, not information; a video always is.
    if (tag !== "VIDEO" && rect.width * rect.height > width * height * 0.6) continue;
    if (el.checkVisibility && !el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
    rects.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, weight: media ? 0.7 : 1 });
  }
  return rects;
}

export function createStage({ root, orb, copy, status, overlay, attract, mascot }) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pos = { x: 0, y: 0, vx: 0, vy: 0 };
  const caption = { left: 0, top: 0, shown: false };
  // What the mascot is told each frame: the attract screen's cue, how fast it is being carried
  // (in its own radii a second), and where to look when nothing else has its eye.
  const told = { scene: null, travel: [0, 0], look: null };
  let raf = 0, last = 0, dock = null, nextMeasure = 0, asks = null;
  let scale = 1, scaleVelocity = 0;
  let mode = "";
  let spot = null, nextScan = 0, scrollY = window.scrollY || 0, scrollAt = 0;
  let layout = "", openness = 1;
  let looping = false, called = null, calls = 0, pageUsed = false;

  const measure = (now) => {
    nextMeasure = now + 500;
    const rect = root.getBoundingClientRect();
    if (!rect.width) { dock = null; return; }
    const first = !dock;
    dock = { x: rect.left + rect.width / 2, y: rect.bottom - GROUND_INSET, left: rect.left, top: rect.top };
    const box = attract.asks();
    asks = box.width ? { left: box.left, right: box.right } : null;
    if (first) { pos.x = dock.x; pos.y = dock.y; }
  };

  const frame = (now) => {
    raf = 0;
    if (overlay.hidden !== root.hidden) overlay.hidden = root.hidden;
    if (document.hidden || root.hidden) { last = 0; return; }
    const seconds = last ? Math.min(Math.max(now - last, 0) / 1000, 0.05) : 1 / 60;
    last = now;
    if (!dock || now >= nextMeasure) measure(now);
    if (!dock) return;
    const width = window.innerWidth, height = window.innerHeight;
    const state = root.dataset.state;
    const reduced = motion.matches;
    const listening = state === "listening", speaking = state === "speaking", thinking = state === "thinking";
    const calling = state === "connecting";
    const session = SESSION.has(state);

    // The attract screen has the floor until the agent is there: it gives way to the page as soon
    // as the agent is listening and stays away until the session ends.
    const demo = document.body.classList.contains("demo-modal-open");
    // A conversation that has ended takes its demo video with it: the player sits above everything,
    // and the attract screen cannot come back while it is open.
    if (demo && !session) window.xstationPageAction?.({ action: "video_close" });
    const open = !demo && !(listening || speaking || thinking);
    if (open !== looping) {
      looping = open;
      attract.setActive(looping);
    }
    if (!calling) called = null;
    if (!open || state === "deaf" || state === "blocked") {
      // In a conversation its state decides what it does, and a mascot that cannot hear stays put.
      told.scene = null;
    } else if (calling) {
      // It has been called: it turns to the visitor where it stands and waits for the call to connect.
      if (called) called.elapsed += seconds;
      else called = { ...CALLED, index: -(calls += 1), elapsed: 0, spot: told.scene?.spot || REST.spot, zoom: told.scene?.zoom || REST.zoom };
      told.scene = called;
    } else told.scene = attract.cue(seconds, reduced);
    // voice.js marks the agent's greeting: from the moment it connects until it has said hello.
    const greeting = root.dataset.greeting === "true" && (listening || speaking);
    const next = open ? "face" : greeting ? "greet" : "side";
    if (next !== mode) { nextScan = 0; spot = null; }
    mode = next;

    // Large enough to own the screen, with the corners left for the microphone and the questions.
    const room = attract.room();
    const roomWidth = room.width || width, roomHeight = room.height || height;
    const faceScale = Math.min(roomHeight * FACE_FILL, roomWidth * 0.44) / DISC;
    const nextLayout = `${open}|${calling}`;
    if (nextLayout !== layout) {
      layout = nextLayout;
      overlay.dataset.open = String(open);
      // While a call connects, the one thing that changes on the screen is a pulse behind the mascot.
      overlay.dataset.calling = String(calling);
    }
    attract.setHint(state, (status.textContent || "").replace(/\s*·\s*Eksperimental/u, ""));

    const pageY = window.scrollY || 0;
    if (Math.abs(pageY - scrollY) > 0.5) scrollAt = now;
    scrollY = pageY;
    const bubbleWidth = copy.offsetWidth, bubbleHeight = copy.offsetHeight;
    // Rects shift while the page scrolls to a section, so look for a spot once it has settled.
    if (mode === "side" && now >= nextScan && now - scrollAt > SCROLL_SETTLE_MS) {
      nextScan = now + SCAN_MS;
      spot = pickSpot({
        rects: collectInfo(root, overlay, width, height), width, height,
        body: { w: 76 * SIDE_SCALE + 16, h: 72 * SIDE_SCALE + 8 },
        bubble: bubbleHeight ? { w: bubbleWidth, h: bubbleHeight } : null,
        current: spot, from: pos,
      }) || spot;
    }

    // Until a spot is known the mascot waits at the bottom centre.
    let targetX = dock.x, targetY = dock.y, targetScale = SIDE_SCALE;
    if (mode === "greet") {
      // It introduces itself where the visitor is looking: large, in the middle of the page.
      targetScale = Math.min(height * GREET_FILL, width * 0.4) / DISC;
      targetX = width / 2;
      targetY = height / 2 + RADIUS * targetScale;
    } else if (mode === "side") {
      if (spot) { targetX = spot.x; targetY = spot.y; }
    } else if (mode === "face") {
      // It wanders about the middle of the screen, as the attract screen directs, without covering
      // the example questions or leaving the screen.
      const { spot, zoom } = told.scene || REST;
      const radius = RADIUS * faceScale, middle = room.left + roomWidth / 2;
      // The questions stand to one side of the middle: that way it stops short of them, the other
      // way at the edge of the screen.
      const edge = spot[0] < 0
        ? (asks && asks.right <= middle ? asks.right : room.left)
        : (asks && asks.left >= middle ? asks.left : room.left + roomWidth);
      const reach = clamp(Math.abs(edge - middle) - radius * FACE_GROWS - 16, 0, radius * WANDER.side);
      targetScale = faceScale * zoom;
      targetX = middle + spot[0] * reach;
      targetY = room.top + roomHeight / 2 + RADIUS * targetScale + spot[1] * radius * (spot[1] < 0 ? WANDER.up : WANDER.down);
    }
    // Keep the mascot's canvas sharp while it is, or is about to be, screen sized.
    mascot.setResolution(Math.max(scale, targetScale) > CENTER_SCALE_MAX * 1.1 ? Math.max(scale, targetScale) * 1.06 : 0);

    if (reduced) {
      pos.x = targetX; pos.y = targetY; pos.vx = pos.vy = 0;
      scale = targetScale; scaleVelocity = 0;
    } else {
      const [stiffness, damping] = SPRING[mode];
      pos.vx += (stiffness * (targetX - pos.x) - damping * pos.vx) * seconds;
      pos.vy += (stiffness * (targetY - pos.y) - damping * pos.vy) * seconds;
      pos.x += pos.vx * seconds; pos.y += pos.vy * seconds;
      scaleVelocity += (stiffness * (targetScale - scale) - damping * scaleVelocity) * seconds;
      scale = Math.max(0.2, scale + scaleVelocity * seconds);
    }

    // The attract screen is a circle around the mascot: it closes into it and opens out of it,
    // following the mascot while it moves.
    openness = reduced ? Number(open) : clamp(openness + (open ? 1 : -1) * seconds / COVER_SECONDS, 0, 1);
    // Once the attract screen covers the page again, the page starts over for the next visitor:
    // back at the top, with nothing left open or remembered from the last conversation.
    if (!open) pageUsed = true;
    else if (pageUsed && openness >= 1) { pageUsed = false; window.xstationPageAction?.({ action: "reset" }); }
    const eyeX = pos.x, eyeY = pos.y - RADIUS * scale;
    const cover = Math.hypot(Math.max(eyeX, width - eyeX), Math.max(eyeY, height - eyeY)) + 24;
    const eased = openness * openness * (3 - 2 * openness);
    overlay.style.clipPath = openness >= 1 ? "none" : `circle(${(cover * eased).toFixed(1)}px at ${eyeX.toFixed(1)}px ${eyeY.toFixed(1)}px)`;
    overlay.style.visibility = openness <= 0 ? "hidden" : "";

    const blend = (current, target, duration) => reduced ? target : current + (target - current) * (1 - Math.exp(-seconds / duration));

    orb.style.transform = `translate3d(${(pos.x - dock.x).toFixed(2)}px, ${(pos.y - dock.y).toFixed(2)}px, 0) scale(${scale.toFixed(4)})`;
    // The mascot's body trails behind the ride, and beside the content it looks toward the content.
    told.travel[0] = pos.vx / (RADIUS * scale); told.travel[1] = pos.vy / (RADIUS * scale);
    told.look = mode === "side"
      ? [clamp((width / 2 - eyeX) / (width / 2) * 1.2, -0.7, 0.7), clamp((height / 2 - eyeY) / (height / 2) * 0.8, -0.6, 0.3)]
      : mode === "greet" ? FACING : null;
    if (root.dataset.pose !== mode) root.dataset.pose = mode;

    if (bubbleHeight) {
      const placement = mode === "side" && spot?.bubble ? spot.placement : "above";
      const side = 40 * scale + 10;
      const left = placement === "right" ? pos.x + side
        : placement === "left" ? pos.x - side - bubbleWidth
        : clamp(pos.x - bubbleWidth / 2, 8, Math.max(8, width - bubbleWidth - 8));
      const top = placement === "above" ? Math.max(8, pos.y - 70 * scale - 10 - bubbleHeight)
        : clamp(pos.y - RADIUS * scale - bubbleHeight / 2, 8, Math.max(8, height - bubbleHeight - 8));
      caption.left = caption.shown ? blend(caption.left, left, 0.05) : left;
      caption.top = caption.shown ? blend(caption.top, top, 0.05) : top;
      caption.shown = true;
      copy.style.transform = `translate3d(${(caption.left - dock.left).toFixed(2)}px, ${(caption.top - dock.top).toFixed(2)}px, 0)`;
    } else caption.shown = false;

    // With reduced motion the attract screen is a still picture; a state change wakes the stage.
    if (session || mode !== "face" || !reduced) raf = requestAnimationFrame(frame);
  };

  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const refresh = () => { cancelAnimationFrame(raf); raf = 0; last = 0; nextMeasure = 0; frame(performance.now()); };
  window.addEventListener("resize", refresh);
  document.addEventListener("visibilitychange", refresh);
  motion.addEventListener("change", refresh);
  refresh();
  return {
    wake, refresh,
    // What the mascot should know about its ride right now.
    direction: () => told,
  };
}
