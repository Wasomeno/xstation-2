const $ = id => document.getElementById(id);
let active = null, generation = 0;
const clips = [];
const instructions = {
  wake: 'Ucapkan “Hei Nadi” satu kali dengan suara biasa. Rekaman berhenti otomatis setelah 4 detik.',
  similar: 'Ucapkan kalimat mirip seperti “hari ini” atau “hai Dani”, tanpa “Hei Nadi”. Maksimal 8 detik.',
  background: 'Rekam percakapan biasa atau suara ruangan tanpa “Hei Nadi”. Maksimal 30 detik.',
};
$('kind').onchange = () => { $('prompt').textContent = instructions[$('kind').value]; };
function controls(busy) {
  $('settings').disabled = busy;
  $('start').disabled = busy || clips.length >= 30;
  $('stop').disabled = !active?.recorder || active.recorder.state !== 'recording';
  $('cancel').disabled = !busy;
}
function release(take) {
  clearInterval(take.timer);
  take.stream?.getTracks().forEach(track => track.stop());
  take.context?.close().catch(() => {});
  $('level').value = 0;
}
function stop(discard = false) {
  const take = active;
  if (!take) return;
  take.discard ||= discard;
  ++generation;
  if (take.recorder?.state === 'recording') take.recorder.stop();
  else if (!take.recorder) {
    release(take); active = null; controls(false); $('status').textContent = 'Rekaman dibatalkan.';
  }
  release(take);
  $('stop').disabled = true;
}
// PCM16 mono, preserving all samples supplied by the 16 kHz browser decoder.
export function wav(samples, sampleRate = 16000) {
  const bytes = new ArrayBuffer(44 + samples.length * 2), view = new DataView(bytes);
  const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((s, i) => { const x = Math.max(-1, Math.min(1, s)); view.setInt16(44 + i * 2, Math.round(x * (x < 0 ? 32768 : 32767)), true); });
  return new Blob([bytes], { type: 'audio/wav' });
}
function updateCount() {
  $('count').textContent = `(${clips.length}/30)`;
  $('empty').hidden = clips.length > 0;
  $('manifest').disabled = clips.length === 0;
  controls(Boolean(active));
}
function addClip(blob, metadata) {
  const url = URL.createObjectURL(blob), row = document.createElement('li');
  const title = document.createElement('p'); title.textContent = `${metadata.filename} · ${metadata.durationSeconds.toFixed(1)} dtk`;
  const audio = document.createElement('audio'); audio.controls = true; audio.src = url;
  const download = document.createElement('a'); download.href = url; download.download = metadata.filename; download.textContent = 'Unduh WAV';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'secondary'; remove.textContent = 'Hapus';
  const actions = document.createElement('div'); actions.className = 'actions'; actions.append(download, remove);
  const clip = { url, metadata, audio };
  remove.onclick = () => { audio.pause(); URL.revokeObjectURL(url); clips.splice(clips.indexOf(clip), 1); row.remove(); updateCount(); };
  row.append(title, audio, actions); $('clips').append(row); clips.push(clip); updateCount();
}
$('start').onclick = async () => {
  if (active || clips.length >= 30 || !$('speaker').reportValidity()) return;
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    $('status').textContent = 'Gunakan Chrome melalui HTTPS atau localhost untuk merekam.'; return;
  }
  clips.forEach(clip => clip.audio.pause());
  const token = ++generation;
  const take = { discard: false, chunks: [], metadata: {
    speaker: $('speaker').value, split: $('split').value, kind: $('kind').value,
    condition: $('condition').value, createdAt: new Date().toISOString(),
  }};
  active = take; controls(true); $('timer').textContent = '0.0 dtk';
  $('status').textContent = 'Menunggu izin mikrofon…';
  try {
    // Match the laptop capture preferences used by the deployed voice listener.
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (generation !== token) { stream.getTracks().forEach(track => track.stop()); return; }
    take.stream = stream;
    take.metadata.capture = stream.getAudioTracks().map(track => {
      const { sampleRate, channelCount, echoCancellation, noiseSuppression, autoGainControl } = track.getSettings();
      return { sampleRate, channelCount, echoCancellation, noiseSuppression, autoGainControl };
    });
    take.context = new AudioContext(); await take.context.resume();
    if (generation !== token) { release(take); return; }
    const analyser = take.context.createAnalyser(); analyser.fftSize = 1024;
    take.context.createMediaStreamSource(stream).connect(analyser);
    const frame = new Float32Array(analyser.fftSize);
    const recorder = new MediaRecorder(stream); take.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data.size) take.chunks.push(e.data); };
    recorder.onerror = () => { take.error = true; stop(true); };
    recorder.onstop = async () => {
      release(take); $('status').textContent = 'Menyiapkan WAV…';
      try {
        if (!take.discard) {
          const decoder = new OfflineAudioContext(1, 1, 16000);
          const decoded = await decoder.decodeAudioData(await new Blob(take.chunks, { type: recorder.mimeType }).arrayBuffer());
          if (!take.discard) {
            const samples = decoded.getChannelData(0);
            take.metadata.durationSeconds = samples.length / 16000;
            take.metadata.sampleRate = 16000;
            take.metadata.filename = `nadi_${take.metadata.split}_${take.metadata.kind}_${take.metadata.speaker}_${crypto.randomUUID()}.wav`;
            addClip(wav(samples), take.metadata);
          }
        }
        $('status').textContent = take.error ? 'Perekaman gagal. Coba lagi.' : take.discard ? 'Rekaman dibatalkan.' : 'Sampel siap. Dengarkan sebelum mengunduh.';
      } catch { $('status').textContent = 'Audio tidak dapat diubah menjadi WAV. Coba rekam ulang di Chrome.'; }
      finally { if (active === take) active = null; controls(false); }
    };
    recorder.start(250); take.started = performance.now(); controls(true);
    $('status').textContent = 'Merekam — silakan bicara.';
    const limit = { wake: 4, similar: 8, background: 30 }[take.metadata.kind];
    take.timer = setInterval(() => {
      const seconds = (performance.now() - take.started) / 1000;
      $('timer').textContent = `${Math.min(seconds, limit).toFixed(1)} dtk`;
      analyser.getFloatTimeDomainData(frame);
      $('level').value = Math.min(1, Math.sqrt(frame.reduce((n, x) => n + x * x, 0) / frame.length) * 6);
      if (seconds >= limit) stop();
    }, 100);
    stream.getAudioTracks()[0].onended = () => stop();
  } catch {
    release(take);
    if (active === take) { active = null; controls(false); $('status').textContent = 'Mikrofon tidak tersedia. Periksa izin browser lalu coba lagi.'; }
  }
};
$('stop').onclick = () => stop();
$('cancel').onclick = () => stop(true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') stop(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
window.addEventListener('pagehide', () => { stop(true); clips.forEach(clip => URL.revokeObjectURL(clip.url)); });
window.addEventListener('beforeunload', e => { if (active || clips.length) { e.preventDefault(); e.returnValue = ''; } });
$('manifest').onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, samples: clips.map(clip => clip.metadata) }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = 'nadi-sample-labels.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
