// Variant 2: smooth green-and-mint flowing colors.
export default function createSmoothWaveform(canvas, voiceEnergy, smoothVoiceEnergy) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return { setAnalyser() {}, refresh() {} };
  const root = canvas.closest("#voice-surface");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const tokens = getComputedStyle(root);
  const palette = ["--deep-forest", "--signal", "--sage", "--mist"].map((name) => tokens.getPropertyValue(name).trim());
  const texture = document.createElement("canvas");
  const resolution = 96;
  texture.width = texture.height = resolution;
  const field = texture.getContext("2d");
  const pixels = field.createImageData(resolution, resolution);
  const colors = palette.map((hex) => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)));
  const ramp = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i += 1) {
    const position = i / 255 * 3;
    const band = Math.min(2, Math.floor(position));
    const mix = position - band;
    const blend = mix * mix * (3 - 2 * mix);
    for (let channel = 0; channel < 3; channel += 1) {
      ramp[i * 3 + channel] = colors[band][channel] * (1 - blend) + colors[band + 1][channel] * blend;
    }
  }
  let frequency = new Uint8Array(128);
  let waveform = new Uint8Array(256);
  let analyser = null;
  let energy = 0;
  let phase = 0;
  let travel = 0;
  let warp = 0.32;
  let lastTime = 0;
  let raf = 0;
  let size = 88;

  const draw = (now = performance.now()) => {
    raf = 0;
    if (document.hidden) return;
    if (lastTime && now - lastTime < 1000 / 30) {
      raf = requestAnimationFrame(draw);
      return;
    }
    const state = root.dataset.state;
    const failed = state === "deaf" || state === "blocked";
    const listening = state === "listening";
    const processing = state === "thinking" || state === "connecting";
    const seconds = lastTime ? Math.min((now - lastTime) / 1000, 0.08) : 1 / 30;
    lastTime = now;
    let target = 0;
    if (analyser && listening && !motion.matches) {
      analyser.getByteTimeDomainData(waveform);
      analyser.getByteFrequencyData(frequency);
      target = Math.pow(voiceEnergy(waveform, frequency), 0.65);
    }
    energy = motion.matches || failed ? 0 : smoothVoiceEnergy(energy, target, seconds);
    const targetWarp = processing ? 0.85 : listening ? 0.48 + energy * 0.65 : 0.32;
    warp = motion.matches ? targetWarp : warp + (targetWarp - warp) * (1 - Math.exp(-seconds / 0.18));
    if (!motion.matches && !failed) {
      phase += seconds * (processing ? 0.8 : listening ? 0.35 + energy * 0.65 : 0.12);
      travel += seconds * (processing ? 1.65 : listening ? 0.25 : 0.06);
    }
    const t = motion.matches || failed ? 0 : phase;
    const sweep = motion.matches || failed ? 0 : travel;
    const radius = size * (32 / 88);

    if (!failed) {
      // Warp the color field itself: there are no rotating shapes or circular bands.
      const step = 2 / (resolution - 1);
      let pixel = 0;
      for (let row = 0; row < resolution; row += 1) {
        const y = row * step - 1;
        for (let column = 0; column < resolution; column += 1) {
          const x = column * step - 1;
          const u = x + warp * Math.sin(y * 2.6 + Math.sin(x * 2 - t * 0.6) * 0.7 + t);
          const v = y + warp * Math.sin(x * 2.2 - t * 0.75);
          const flow = Math.sin(u * 2.8 + v * 1.8 - sweep) + Math.sin(v * 3.2 - u * 1.4 + t * 0.5) * 0.3;
          const color = Math.round(Math.max(0, Math.min(1, 0.5 + flow * 0.4)) * 255) * 3;
          pixels.data[pixel++] = ramp[color];
          pixels.data[pixel++] = ramp[color + 1];
          pixels.data[pixel++] = ramp[color + 2];
          pixels.data[pixel++] = 255;
        }
      }
      field.putImageData(pixels, 0, 0);
    }
    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
    ctx.clip();
    if (failed) {
      ctx.fillStyle = palette[0];
      ctx.fillRect(0, 0, size, size);
    } else {
      ctx.drawImage(texture, size / 2 - radius, size / 2 - radius, radius * 2, radius * 2);
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
