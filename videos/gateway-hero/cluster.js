export function createCluster({ canvas, active: startActive = true } = {}) {
  const host = canvas || document.getElementById("nadi-cluster");
  if (!host) {
    return {
      setProgress() {},
      setActive() {},
      resize() {},
      dispose() {},
      ready: Promise.resolve(),
    };
  }

  const ctx = host.getContext("2d");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // topology / timing: approved Nadi hero constants — do not change without owner
  const FOV = 980;
  const BEAT = 0.75;
  const WAKE = BEAT * 2;
  const REVEAL = 1.2;
  const ORBIT = 2.6;
  const INTRO = WAKE + REVEAL;
  const TOUR = WAKE + ORBIT;
  const VISIT = 3.0;
  const BREATH = 1.6;
  const OUT = 1.15;
  const HOLD_END = 1.95;
  const BACK = 1.0;
  const AMBIENT_PERIOD = 5.4;
  const ORBIT_SWEEP = 1.75;
  const SEQ = [];
  [0, 3].forEach((s) => {
    for (let i = 0; i < 3; i++) SEQ.push({ type: "visit", agent: s + i, dur: VISIT });
    SEQ.push({ type: "wide", dur: BREATH });
  });
  const LOOP = SEQ.reduce((a, s) => a + s.dur, 0);

  // paper retune: color and compositing only. Nadi drew additive rgb(110,240,178) on #04100B.
  const G = [8, 59, 40];
  const PULSE = [28, 133, 92];
  const HEAD = [28, 133, 92];
  const PAPER_GAIN = 1.35;
  const FAR_ALPHA_MUL = 0.32;
  const CORE_BLOOM = 0.42;
  const NAMES = [
    "Marketing & Content",
    "Customer Engagement",
    "Document Management",
    "Talent Assessment",
    "Prototyping",
    "AI Agents",
  ];
  const stage = host.parentElement || host;
  const labels = NAMES.map((n, i) => {
    const d = document.createElement("div");
    d.className = "nadi-lbl";
    d.innerHTML = `<span><small>AGENT 0${i + 1}</small>${n}</span>`;
    stage.appendChild(d);
    return d;
  });
  const hideLabels = () => {
    labels.forEach((Lb) => {
      Lb.style.opacity = "0";
    });
    labelSide = null;
    labelAgent = -1;
  };
  let labelSide = null;
  let labelAgent = -1;

  let seed = 720260909;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const rr = (a, b) => a + rnd() * (b - a);
  const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (v) => {
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  const rotAround = (v, k, ang) => {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const d = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cr = cross(k, v);
    return [
      v[0] * c + cr[0] * s + k[0] * d * (1 - c),
      v[1] * c + cr[1] * s + k[1] * d * (1 - c),
      v[2] * c + cr[2] * s + k[2] * d * (1 - c),
    ];
  };
  const bez = (p0, p1, p2, p3, n) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      out.push([
        a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
        a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
        a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
      ]);
    }
    return out;
  };
  function curve(origin, dir, len, bow1, bow2, n) {
    const d = norm(dir);
    const p1 = norm(cross(d, Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const p2 = norm(cross(d, p1));
    const end = add(origin, d, len);
    return {
      pts: bez(
        origin,
        add(add(origin, d, len * 0.32), p1, bow1),
        add(add(origin, d, len * 0.70), p2, bow2),
        end,
        n,
      ),
      end,
      dir: d,
    };
  }
  const tangentAt = (pts, i) =>
    norm(sub(pts[Math.min(pts.length - 1, i + 1)], pts[Math.max(0, i - 1)]));

  const MAIN_DIRS = [
    { dir: [-0.52, -0.80, 0.30], len: 400, bow: [84, -40] },
    { dir: [0.62, -0.60, -0.50], len: 470, bow: [-66, 58] },
    { dir: [0.96, -0.08, 0.28], len: 360, bow: [52, 36] },
    { dir: [0.56, 0.70, -0.44], len: 440, bow: [-92, -30] },
    { dir: [-0.22, 0.90, 0.38], len: 372, bow: [62, 48] },
    { dir: [-0.90, 0.28, -0.34], len: 330, bow: [-54, 40] },
  ];

  function grow(scale, widthMul, alphaMul, origin, deep) {
    const all = [];
    const primaries = MAIN_DIRS.map((m) => {
      const c = curve(origin, m.dir, m.len * scale, m.bow[0] * scale, m.bow[1] * scale, 44);
      const v = { ...c, gen: 0, w: 2.9 * widthMul, a: 0.40 * alphaMul, kids: [], dur: OUT, origin };
      all.push(v);
      [0.52, 0.70, 0.86].forEach((at, j) => {
        const i0 = Math.round(at * 44);
        const base = c.pts[i0];
        const tan = tangentAt(c.pts, i0);
        const dir = rotAround(
          tan,
          norm(cross(tan, [rr(-1, 1), rr(-1, 1), rr(-1, 1)])),
          rr(0.55, 1.0) * (j % 2 ? 1 : -1),
        );
        const len = m.len * scale * rr(0.34, 0.52);
        const sc = curve(base, dir, len, rr(-60, 60) * scale, rr(-50, 50) * scale, 18);
        const sv = { ...sc, gen: 1, w: 1.7 * widthMul, a: 0.30 * alphaMul, kids: [], parent: v, at, dur: 0.40, origin };
        all.push(sv);
        v.kids.push(sv);
        if (deep) {
          [0.48, 0.78].forEach((at2, k) => {
            const i1 = Math.round(at2 * 18);
            const b2 = sc.pts[i1];
            const t2 = tangentAt(sc.pts, i1);
            const d2 = rotAround(
              t2,
              norm(cross(t2, [rr(-1, 1), rr(-1, 1), rr(-1, 1)])),
              rr(0.6, 1.1) * (k % 2 ? -1 : 1),
            );
            const tc = curve(b2, d2, len * rr(0.38, 0.6), rr(-30, 30) * scale, rr(-24, 24) * scale, 10);
            const tv = { ...tc, gen: 2, w: 1.05 * widthMul, a: 0.20 * alphaMul, kids: [], parent: sv, at: at2, dur: 0.28, origin };
            all.push(tv);
            sv.kids.push(tv);
          });
        }
      });
      for (let k = 0; k < (deep ? 3 : 0); k++) {
        const tan = tangentAt(c.pts, 43);
        const dir = rotAround(tan, norm(cross(tan, [rr(-1, 1), rr(-1, 1), rr(-1, 1)])), rr(0.5, 1.2));
        const tw = curve(c.end, dir, m.len * scale * rr(0.14, 0.24), rr(-20, 20) * scale, rr(-16, 16) * scale, 7);
        const wv = { ...tw, gen: 3, w: 0.8 * widthMul, a: 0.18 * alphaMul, kids: [], parent: v, at: 1, dur: 0.22, origin };
        all.push(wv);
        v.kids.push(wv);
      }
      return v;
    });
    for (const v of all) {
      v.rad = v.pts.map((p) => Math.hypot(p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]));
    }
    return { all, primaries };
  }

  const NEAR = grow(1, 1, 1, [0, 0, 0], true);
  const FAR = grow(1.7, 1.3, FAR_ALPHA_MUL, [0, 0, 860], false);

  const easeOut = (t) => 1 - Math.pow(1 - t, 2.7);
  const invEaseOut = (y) => 1 - Math.pow(1 - y, 1 / 2.7);
  function schedule(v, start) {
    v.start = start;
    v.kids.forEach((k) =>
      schedule(k, start + v.dur * (v.gen === 0 ? invEaseOut(Math.min(1, k.at)) : k.at)),
    );
  }
  NEAR.primaries.forEach((p) => schedule(p, 0));
  FAR.primaries.forEach((p) => schedule(p, 0));

  let W = 0;
  let Ht = 0;
  let DPR = 1;
  let CX = 0;
  let CY = 0;
  let SC = 1;

  function size() {
    const r = host.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width;
    Ht = r.height;
    if (!W || !Ht) return;
    host.width = Math.round(W * DPR);
    host.height = Math.round(Ht * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    const narrow = W < 820;
    CX = narrow ? W * 0.52 : W * 0.665;
    CY = narrow ? Ht * 0.40 : Ht * 0.50;
    SC = (Math.min(W, Ht) / 720) * (narrow ? 0.78 : 1.0);
  }

  let tmx = 0;
  let tmy = 0;
  let mx = 0;
  let my = 0;

  function onPointerMove(e) {
    const r = host.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    ) {
      tmx = 0;
      tmy = 0;
      return;
    }
    tmx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    tmy = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }

  function onPointerLeave() {
    tmx = 0;
    tmy = 0;
  }

  const cam = { look: [0, 0, 0], yaw: 0.2, pitch: 0.1, dist: 1180 };
  const tgt = { look: [0, 0, 0], yaw: 0.2, pitch: 0.1, dist: 1180 };
  let cy_ = 1;
  let sy_ = 0;
  let cx_ = 1;
  let sx_ = 0;
  const P = [0, 0, 0, 0];
  function project(p) {
    const qx = p[0] - cam.look[0];
    const qy = p[1] - cam.look[1];
    const qz = p[2] - cam.look[2];
    const x1 = qx * cy_ + qz * sy_;
    const z1 = -qx * sy_ + qz * cy_;
    const y2 = qy * cx_ - z1 * sx_;
    const z2 = qy * sx_ + z1 * cx_;
    const depth = Math.max(60, z2 + cam.dist);
    const k = FOV / depth;
    P[0] = CX + x1 * k * SC;
    P[1] = CY + y2 * k * SC;
    P[2] = k;
    P[3] = depth;
    return P;
  }
  const nearestYaw = (t, cur) => {
    while (t - cur > Math.PI) t -= Math.PI * 2;
    while (t - cur < -Math.PI) t += Math.PI * 2;
    return t;
  };

  const frac = (x) => x - Math.floor(x);
  const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const fog = (depth) => Math.max(0.16, Math.min(1, 1.32 - depth / 2300));
  let focusDepth = 1180;
  let treeA = 1;
  let revealR = 1e9;

  function rgba(rgb, a) {
    return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  }

  function vesselStroke(v, extraAlpha = 0) {
    const pts = v.pts;
    const n = pts.length;
    const proj = new Array(n);
    for (let i = 0; i < n; i++) {
      const q = project(pts[i]);
      proj[i] = [q[0], q[1], q[2], q[3]];
    }
    const CH_ = 4;
    let front = -1;
    for (let i = 0; i < n - 1; i += CH_) {
      const j = Math.min(n - 1, i + CH_);
      if (v.rad[i] > revealR) {
        front = i;
        break;
      }
      const mid = proj[Math.min(n - 1, i + (CH_ >> 1))];
      const k = mid[2];
      const depth = mid[3];
      const w = v.w * k * (1 - 0.42 * (i / n)) * 1.15;
      const df = Math.min(1, Math.abs(depth - focusDepth) / 430);
      const al = (v.a + extraAlpha) * fog(depth) * (1 - df * 0.35) * treeA * PAPER_GAIN;
      const passes = df > 0.08
        ? [[1 + df * 4.6, al * 0.10], [1 + df * 2.3, al * 0.16], [1 + df * 1.2, al * 0.38]]
        : [[1, al]];
      for (const [wm, a] of passes) {
        ctx.beginPath();
        ctx.moveTo(proj[i][0], proj[i][1]);
        for (let m = i + 1; m <= j; m++) ctx.lineTo(proj[m][0], proj[m][1]);
        ctx.lineWidth = Math.min(13, Math.max(0.25, w * wm));
        ctx.strokeStyle = rgba(G, a);
        ctx.stroke();
      }
    }
    if (front > 0) {
      const q = proj[front];
      glow(q[0], q[1], 14 * q[2], 0.55 * fog(q[3]) * PAPER_GAIN, PULSE);
    }
  }

  function glow(x, y, r, a, rgb = G) {
    if (r < 0.6 || a < 0.004) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgb, a));
    g.addColorStop(0.4, rgba(rgb, a * 0.32));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.2832);
    ctx.fill();
  }

  function spark(v, f, strength, tail, headR, withHead) {
    const n = v.pts.length - 1;
    const fade = 1 - Math.pow(Math.min(1, f), 6);
    for (let i = tail; i >= 0; i--) {
      const ff = f - i * (1.0 / (n * 0.9)) * (v.gen === 0 ? 1.0 : 1.6);
      if (ff < 0) continue;
      const pr = project(v.pts[Math.round(Math.min(1, ff) * n)]);
      const kk = 1 - i / (tail + 1);
      const df = Math.min(1, Math.abs(pr[3] - focusDepth) / 430);
      glow(
        pr[0],
        pr[1],
        (headR * 0.5 + headR * 3.2 * kk) * pr[2] * (1 + df * 1.5),
        Math.pow(kk, 1.7) * strength * fade * fog(pr[3]) * (1 - df * 0.5),
        PULSE,
      );
    }
    if (withHead) {
      const pr = project(v.pts[Math.round(Math.min(1, f) * n)]);
      const df = Math.min(1, Math.abs(pr[3] - focusDepth) / 430);
      ctx.fillStyle = rgba(
        HEAD,
        0.95 * strength * fade * (1 - df * 0.6) * fog(pr[3]),
      );
      ctx.beginPath();
      ctx.arc(pr[0], pr[1], (headR * 0.5 + df * 2.2) * pr[2], 0, 6.2832);
      ctx.fill();
    }
  }

  function runPulse(root, t, gain, withHead) {
    const walk = (v) => {
      const lt = (t - v.start) / v.dur;
      if (lt >= 0 && lt <= 1.25) {
        const f = v.gen === 0 ? easeOut(Math.min(1, lt)) : Math.min(1, lt);
        spark(
          v,
          f,
          gain * (v.gen === 0 ? 1 : v.gen === 1 ? 0.66 : 0.46),
          v.gen === 0 ? 18 : v.gen === 1 ? 9 : 5,
          v.gen === 0 ? 7.5 : v.gen === 1 ? 4.6 : 3.2,
          withHead && v.gen === 0,
        );
      }
      v.kids.forEach(walk);
    };
    walk(root);
  }

  let t0 = 0;
  let lastNow = 0;
  let pauseShift = 0;
  let pausedAt = 0;
  let active = startActive;
  let disposed = false;
  let raf = 0;
  const observer = new ResizeObserver(() => {
    size();
    if (reduce) draw(performance.now());
  });

  function nowClock(now) {
    return now - pauseShift;
  }

  function draw(now) {
    if (disposed || !W || !Ht) return;
    if (!t0) {
      t0 = nowClock(now) - (reduce ? (INTRO + 3) * 1000 : 0);
      lastNow = nowClock(now);
    }
    const clock = nowClock(now);
    const T = (clock - t0) / 1000;
    const dt = Math.min(0.05, (clock - lastNow) / 1000);
    lastNow = clock;

    const waking = T < WAKE;
    const revealing = T >= WAKE && T < INTRO;
    const orbiting = T >= WAKE && T < TOUR;
    const Ltime = Math.max(0, T - TOUR);
    const L = frac(Ltime / LOOP) * LOOP;
    let acc = 0;
    let seg = SEQ[0];
    let tt = 0;
    for (const s of SEQ) {
      if (L < acc + s.dur) {
        seg = s;
        tt = L - acc;
        break;
      }
      acc += s.dur;
    }
    const agent = seg.type === "visit" ? NEAR.primaries[seg.agent] : null;

    treeA = waking ? 0 : revealing ? easeOut((T - WAKE) / REVEAL) : 1;
    revealR = waking ? 0 : revealing ? easeOut((T - WAKE) / REVEAL) * 1500 : 1e9;

    const orbT = Math.min(1, Math.max(0, (T - WAKE) / ORBIT));
    const orbEase = 1 - Math.pow(1 - orbT, 3.2);
    const yawOff = orbiting || T < WAKE ? 0 : ORBIT_SWEEP;
    const sway = yawOff + 0.30 * Math.sin(T * 0.085) + 0.22 * Math.sin(T * 0.037 + 1.3);
    const swayP = 0.10 * Math.sin(T * 0.071 + 0.4);
    if (orbiting) {
      tgt.look = [0, 0, 0];
      tgt.yaw = 0.2 + ORBIT_SWEEP * orbEase;
      tgt.pitch = 0.10 + 0.22 * Math.sin(orbEase * Math.PI);
      tgt.dist = 1320 - 140 * orbEase;
    } else if (agent && T >= TOUR) {
      const e = agent.end;
      tgt.look = [e[0] * 0.82, e[1] * 0.82, e[2] * 0.82];
      tgt.yaw = nearestYaw(Math.atan2(agent.dir[2], agent.dir[0]) + (seg.agent % 2 ? 0.45 : -0.45), cam.yaw);
      tgt.pitch = swayP + (agent.dir[1] > 0 ? -0.18 : 0.18);
      tgt.dist = 720;
    } else {
      tgt.look = [0, 0, 0];
      tgt.yaw = nearestYaw(sway, cam.yaw);
      tgt.pitch = swayP;
      tgt.dist = waking ? 1320 : 1180;
    }
    const speed = orbiting ? 9 : agent ? (tt < OUT ? 3.1 : 2.2) : 2.0;
    const kk = 1 - Math.exp(-dt * speed);
    for (let i = 0; i < 3; i++) cam.look[i] += (tgt.look[i] - cam.look[i]) * kk;
    cam.yaw += (tgt.yaw - cam.yaw) * kk;
    cam.pitch += (tgt.pitch - cam.pitch) * kk;
    cam.dist += (tgt.dist - cam.dist) * kk;
    mx += (tmx - mx) * 0.05;
    my += (tmy - my) * 0.05;
    const yaw = cam.yaw + mx * 0.22;
    const pitch = cam.pitch + my * 0.14;
    cy_ = Math.cos(yaw);
    sy_ = Math.sin(yaw);
    cx_ = Math.cos(pitch);
    sx_ = Math.sin(pitch);
    focusDepth += (cam.dist - focusDepth) * kk;

    ctx.clearRect(0, 0, W, Ht);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "source-over";

    if (!waking) {
      const saveA = treeA;
      const saveR = revealR;
      treeA = revealing ? easeOut(Math.max(0, (T - WAKE - 0.35) / REVEAL)) : 1;
      revealR = revealing ? treeA * 2600 : 1e9;
      for (const v of FAR.all) vesselStroke(v);
      if (T >= TOUR) {
        FAR.primaries.forEach((v, i) =>
          runPulse(v, frac(Ltime / (AMBIENT_PERIOD * 1.6) + i * 0.29) * AMBIENT_PERIOD * 1.6, 0.09, false),
        );
      }
      treeA = saveA;
      revealR = saveR;
    }

    if (!waking) {
      for (const v of NEAR.all) {
        const lit = agent && (v === agent || (v.parent && (v.parent === agent || v.parent.parent === agent)));
        vesselStroke(v, lit ? 0.12 : 0);
      }

      NEAR.primaries.forEach((v) => {
        if (v === agent) return;
        const ep = project(v.end);
        const df = Math.min(1, Math.abs(ep[3] - focusDepth) / 430);
        const a = fog(ep[3]) * (1 - df * 0.5) * treeA * PAPER_GAIN;
        glow(ep[0], ep[1], 12 * ep[2] * (1 + df), 0.28 * a, PULSE);
        ctx.beginPath();
        ctx.arc(ep[0], ep[1], Math.min(9, 7 * ep[2]), 0, 6.2832);
        ctx.lineWidth = Math.max(0.3, Math.min(1.2, 0.9 * ep[2]));
        ctx.strokeStyle = rgba(PULSE, 0.30 * a);
        ctx.stroke();
      });

      if (T >= TOUR) {
        NEAR.primaries.forEach((v, i) => {
          if (v === agent) return;
          runPulse(v, frac(Ltime / AMBIENT_PERIOD + i * 0.173) * AMBIENT_PERIOD, 0.22, false);
        });
      }
    }

    if (agent && T >= TOUR) {
      runPulse(agent, tt, 0.62, true);

      const ep = project(agent.end);
      const arr = (tt - OUT) / 0.95;
      const epdf = Math.min(1, Math.abs(ep[3] - focusDepth) / 430);
      glow(
        ep[0],
        ep[1],
        26 * ep[2] * (1 + epdf),
        (0.10 + (arr >= 0 && arr <= 1 ? (1 - arr) * 0.55 : 0)) * fog(ep[3]),
        PULSE,
      );
      if (arr >= 0 && arr <= 1) {
        ctx.beginPath();
        ctx.arc(ep[0], ep[1], (6 + easeOut(arr) * 30) * ep[2], 0, 6.2832);
        ctx.lineWidth = 1.1 * ep[2];
        ctx.strokeStyle = rgba(PULSE, (1 - arr) * 0.28);
        ctx.stroke();
      }
      labels.forEach((Lb, i) => {
        if (i !== seg.agent) {
          Lb.style.opacity = "0";
          return;
        }
        const lo = arr >= 0 && arr <= 1.9 ? Math.min(1, arr * 3.2) * Math.min(1, (1.9 - arr) * 2.4) : 0;
        Lb.style.opacity = lo.toFixed(3);
        Lb.style.setProperty("--k", Math.min(1, Math.max(0, arr * 2.6)).toFixed(3));
        if (lo > 0.01) {
          if (labelAgent !== i || labelSide === null) {
            labelAgent = i;
            labelSide = ep[0] > W * 0.74;
          }
          Lb.classList.toggle("is-left", labelSide);
          Lb.style.left = ep[0].toFixed(1) + "px";
          Lb.style.top = ep[1].toFixed(1) + "px";
        } else {
          labelSide = null;
          labelAgent = -1;
        }
      });

      const bo = (tt - HOLD_END) / BACK;
      if (bo >= 0 && bo <= 1) {
        const bf = 1 - easeIO(bo);
        const n = agent.pts.length - 1;
        for (let i = 10; i >= 0; i--) {
          const ff = bf + i * 0.018;
          if (ff > 1) continue;
          const pr = project(agent.pts[Math.round(ff * n)]);
          const kq = 1 - i / 11;
          glow(
            pr[0],
            pr[1],
            (4 + 18 * kq) * pr[2],
            Math.pow(kq, 1.5) * 0.26 * Math.sin(Math.PI * bo) * fog(pr[3]),
            PULSE,
          );
        }
      }
    } else {
      hideLabels();
    }

    const cp = project([0, 0, 0]);
    const cdf = Math.min(1, Math.abs(cp[3] - focusDepth) / 430);
    const cf = fog(cp[3]);
    let beat;
    let coreGain;
    if (waking) {
      const bt = frac(T / BEAT);
      const nth = Math.floor(T / BEAT);
      beat = (Math.exp(-bt * 7) + Math.exp(-Math.max(0, bt - 0.17) * 10) * 0.45) * (0.4 + nth * 0.3);
      coreGain = 0.55;
    } else {
      const burst = revealing ? Math.exp(-(T - WAKE) * 3.2) * 2.4 : 0;
      const bt = T < TOUR ? 1 : agent ? tt / VISIT : tt / BREATH;
      beat = Math.exp(-bt * 9) + Math.exp(-Math.max(0, bt - 0.14) * 12) * 0.5 + burst;
      coreGain = 1;
    }
    glow(cp[0], cp[1], 200 * CORE_BLOOM * cp[2] * (1 + beat * 0.08), (0.12 + beat * 0.08) * cf * coreGain, PULSE);
    glow(cp[0], cp[1], 56 * CORE_BLOOM * cp[2] * (1 + beat * 0.12), (0.44 + beat * 0.26) * cf * coreGain, PULSE);
    glow(cp[0], cp[1], (22 + cdf * 30) * CORE_BLOOM * cp[2], (0.5 + beat * 0.2) * cf * coreGain, PULSE);
    if (!waking) {
      for (let k = 0; k < 2; k++) {
        const q = frac(T / 3.6 + k * 0.5);
        ctx.beginPath();
        ctx.arc(cp[0], cp[1], (30 + q * 110) * CORE_BLOOM * cp[2], 0, 6.2832);
        ctx.lineWidth = 1.0 * cp[2];
        ctx.strokeStyle = rgba(PULSE, (1 - q) * 0.09 * cf);
        ctx.stroke();
      }
    }
    if (cdf < 0.85) {
      ctx.fillStyle = rgba(
        HEAD,
        (0.55 + beat * 0.15) * Math.pow(1 - cdf, 2) * cf * coreGain,
      );
      ctx.beginPath();
      ctx.arc(cp[0], cp[1], 9 * cp[2] * (1 + beat * 0.16) * (1 - cdf * 0.7), 0, 6.2832);
      ctx.fill();
    }
  }

  function shouldRun() {
    return active && !document.hidden && !disposed && !reduce;
  }

  function frame(now) {
    if (!shouldRun()) {
      raf = 0;
      return;
    }
    draw(now);
    raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (disposed) return;
    if (reduce) {
      draw(performance.now());
      return;
    }
    if (shouldRun() && !raf) raf = requestAnimationFrame(frame);
  }

  function onVisibility() {
    if (document.hidden) {
      if (!pausedAt) pausedAt = performance.now();
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      return;
    }
    if (pausedAt) {
      pauseShift += performance.now() - pausedAt;
      pausedAt = 0;
      lastNow = 0;
    }
    kick();
  }

  size();
  observer.observe(host);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerleave", onPointerLeave);
  document.addEventListener("visibilitychange", onVisibility);
  kick();

  return {
    setProgress() {},
    setActive(next) {
      const on = Boolean(next);
      if (on === active) return;
      active = on;
      if (!active) {
        if (!pausedAt) pausedAt = performance.now();
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        hideLabels();
        return;
      }
      if (pausedAt) {
        pauseShift += performance.now() - pausedAt;
        pausedAt = 0;
        lastNow = 0;
      }
      kick();
    },
    resize: size,
    dispose() {
      disposed = true;
      active = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      observer.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      labels.forEach((Lb) => Lb.remove());
    },
    ready: Promise.resolve(),
  };
}
