// Optional: NODE_PATH=<directory containing playwright> CHROME_PATH=<Chrome executable> node scripts/check-record-browser.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    const page = await browser.newPage();
    const requests = [];
    page.on('request', r => requests.push({ url: r.url(), method: r.method() }));
    page.on('websocket', () => { throw Error('Recorder opened a WebSocket'); });
    await page.addInitScript(() => {
      window.testTracks = [];
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...args) => {
        const stream = await get(...args); window.testTracks.push(...stream.getTracks()); return stream;
      };
    });
    const url = (process.env.WAKE_PREVIEW_URL || 'http://127.0.0.1:4174') + '/videos/gateway-hero/record.html';
    await page.goto(url);
    await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Merekam'));
    await page.waitForTimeout(700);
    await page.locator('#stop').click();
    await page.waitForFunction(() => document.querySelectorAll('#clips li').length === 1);
    assert.equal(await page.evaluate(() => window.testTracks.every(t => t.readyState === 'ended')), true);
    const downloadPromise = page.waitForEvent('download');
    await page.getByText('Unduh WAV', { exact: true }).click();
    const download = await downloadPromise;
    const bytes = fs.readFileSync(await download.path());
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.readUInt32LE(24), 16000);
    assert.equal(bytes.readUInt16LE(22), 1);
    assert.equal(bytes.readUInt32LE(40), bytes.length - 44);
    assert.ok(bytes.length > 5000);
    assert.match(download.suggestedFilename(), /^nadi_train_wake_speaker-01_/);
    const metadataPromise = page.waitForEvent('download');
    await page.locator('#manifest').click();
    const metadata = JSON.parse(fs.readFileSync(await (await metadataPromise).path(), 'utf8'));
    assert.equal(metadata.samples[0].filename, download.suggestedFilename());
    assert.equal(metadata.samples[0].sampleRate, 16000);
    await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Merekam'));
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#start').disabled);
    assert.equal(await page.locator('#clips li').count(), 1);
    assert.equal(await page.evaluate(() => window.testTracks.every(t => t.readyState === 'ended')), true);
    // Automatic stop also creates a sample and releases the microphone.
    await page.locator('#split').selectOption('test');
    await page.locator('#start').click();
    await page.waitForFunction(() => document.querySelectorAll('#clips li').length === 2);
    assert.equal(await page.evaluate(() => window.testTracks.every(t => t.readyState === 'ended')), true);
    assert.match(await page.locator('#clips li').last().textContent(), /nadi_test_wake/);
    // A permission result arriving after cancellation must never start capture.
    await page.evaluate(() => {
      const get = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...args) => new Promise(resolve => { window.deliverMic = async () => resolve(await get(...args)); });
    });
    await page.locator('#start').click(); await page.locator('#cancel').click();
    await page.evaluate(() => window.deliverMic());
    await page.waitForFunction(() => window.testTracks.every(t => t.readyState === 'ended'));
    assert.equal(await page.locator('#clips li').count(), 2);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/private/tmp/nadi-recorder.png', fullPage: true });
    const appRequests = requests.filter(r => !r.url.startsWith('blob:'));
    assert.ok(appRequests.every(r => r.method === 'GET' && [url, url.replace('record.html', 'record.js?v=1')].includes(r.url)), JSON.stringify(appRequests));
    console.log('PASS: record, PCM16 mono 16 kHz WAV, labels, cancel, auto-stop, late permission cleanup, mobile layout, and no remote/audio requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
