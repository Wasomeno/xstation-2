// Optional integration check: NODE_PATH=<directory containing playwright> node scripts/check-wake-browser.cjs [hei.wav similar-phrase.wav]
// Uses a fake microphone and mock command server; never contacts the real voice backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true, executablePath: process.env.CHROME_PATH || undefined,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const origin = process.env.WAKE_PREVIEW_URL || 'http://127.0.0.1:4174';
    const sockets = [], audio = [];
    await page.routeWebSocket('**/v1/stream', socket => {
      sockets.push(socket);
      socket.onMessage(message => { const data = JSON.parse(message); if (data.type === 'audio') audio.push(data); });
      socket.send(JSON.stringify({ type: 'ready' }));
    });
    await page.addInitScript(() => {
      const NativeWorker = Worker;
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.testWakeWorker = this; }
        postMessage(data, ...rest) { if (data.type === 'reset') this.testEpoch = data.epoch; super.postMessage(data, ...rest); }
      };
      const getMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      window.micRequests = 0;
      navigator.mediaDevices.getUserMedia = (...args) => { window.micRequests++; return getMedia(...args); };
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => crossOriginIsolated), true, 'WASM isolation headers missing');
    await page.locator('.voice-orb').click();
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'listening', null, { timeout: 60000 });
    assert.equal(sockets.length, 1, 'First click starts listening');
    await page.locator('.voice-orb').click();
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'armed');
    const idleAudio = audio.length;
    await page.waitForTimeout(1500);
    assert.equal(sockets.length, 1, 'Armed listener opened another cloud connection');
    assert.equal(audio.length, idleAudio, 'Idle audio left the device');
    assert.equal(await page.locator('.voice-status').evaluate(el => getComputedStyle(el).clipPath), 'inset(50%)', 'Only the transcript should have a visible bubble');
    // Inject only the detection notification to test controller wiring independently of model accuracy.
    await page.evaluate(() => window.testWakeWorker.dispatchEvent(new MessageEvent('message', {
      data: { type: 'wake', phrase: 'Hei Nadi', epoch: window.testWakeWorker.testEpoch },
    })));
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'listening');
    await page.waitForTimeout(400);
    assert.equal(sockets.length, 2); assert.ok(audio.length > idleAudio, 'Post-wake capture missing');
    sockets[1].send(JSON.stringify({ type: 'delta', text: 'Tampilkan CoDev' }));
    await page.waitForFunction(() => document.querySelector('.voice-transcript').textContent === 'Tampilkan CoDev');
    assert.ok(await page.locator('.voice-transcript').isVisible());
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'thinking', null, { timeout: 40000 });
    sockets[1].send(JSON.stringify({ type: 'decision', action: 'show', section: 'codev' }));
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'listening');
    assert.equal(sockets.length, 2, 'The next command reuses the session');
    sockets[1].send(JSON.stringify({ type: 'delta', text: 'perintah tidak dikenal' }));
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'thinking', null, { timeout: 40000 });
    sockets[1].send(JSON.stringify({ type: 'noop' }));
    await page.waitForFunction(() => Boolean(document.querySelector('#voice-surface')?.dataset.fallback));
    await page.waitForTimeout(550);
    assert.equal(await page.locator('#voice-surface').getAttribute('data-state'), 'listening');
    sockets[1].send(JSON.stringify({ type: 'delta', text: 'Terima kasih!' }));
    await page.waitForFunction(() => document.querySelector('#voice-surface')?.dataset.state === 'armed');
    const count = audio.length;
    await page.waitForTimeout(500);
    assert.equal(audio.length, count, 'Audio continued after completion');
    assert.equal(await page.evaluate(() => window.micRequests), 1);
    await page.keyboard.press('Escape');
    console.log('PASS: click and wake start sessions; idle audio stays local; next command stays listening; no-action shake; thank-you stops audio; one microphone request.');

    // Real detector, optional recorded WAV inputs. Synthetic inputs are smoke tests, not booth acceptance.
    for (const file of process.argv.slice(2)) {
      const result = await page.evaluate(async encoded => {
        const context = new AudioContext({ sampleRate: 16000 });
        const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
        const decoded = await context.decodeAudioData(bytes.buffer);
        const samples = new Float32Array(decoded.length + 32000);
        samples.set(decoded.getChannelData(0), 16000);
        await context.close();
        const worker = new Worker('/videos/gateway-hero/wake-worker.js');
        const detected = [];
        let offset = 0;
        const started = performance.now();
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { worker.terminate(); reject(new Error('Detector timed out')); }, 60000);
          const next = () => {
            if (offset >= samples.length) {
              clearTimeout(timer); worker.terminate(); resolve({ detected, elapsedMs: Math.round(performance.now() - started) }); return;
            }
            const frame = samples.slice(offset, offset + 1280); offset += frame.length;
            worker.postMessage({ type: 'audio', epoch: 1, sampleRate: 16000, samples: frame }, [frame.buffer]);
          };
          worker.onerror = event => { clearTimeout(timer); worker.terminate(); reject(new Error(event.message)); };
          worker.onmessage = ({ data }) => {
            if (data.type === 'error') { clearTimeout(timer); worker.terminate(); reject(new Error(data.message)); }
            if (data.type === 'ready') { worker.postMessage({ type: 'reset', epoch: 1 }); next(); }
            if (data.type === 'wake') detected.push(data.phrase);
            if (data.type === 'processed') next();
          };
        });
      }, fs.readFileSync(file).toString('base64'));
      console.log(JSON.stringify({ file, ...result }));
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
