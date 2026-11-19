# NADI

Landing page (`index.html`) for NADI — a portfolio of intelligent products for business.

## Run locally

```bash
npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Voice (local box)

The voice agent is hidden by default. Add `?voice=1` to show it on desktop, for example [http://127.0.0.1:4174/?voice=1](http://127.0.0.1:4174/?voice=1).

After a click or local wake-word detection, the floating mic opens a conversation session with the voice box: OpenAI Realtime `gpt-live-transcribe`, then DeepSeek `deepseek-v4-flash` (default) or TypeSafe AI Jev `jev-latest`. Keys stay on the box. Live transcript appears in the popover.

```bash
cd voice/box
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set OPENAI_API_KEY and DEEPSEEK_API_KEY
```

From the repo root (keys in `voice/box/.env`):

```bash
npm start          # site on :4174
npm run voice      # box on :4175; reloads when Python files change
```

To select Jev, set these in `voice/box/.env` (local) or Dokploy's Environment tab, then restart/redeploy the voice service:

```dotenv
VOICE_LLM_PROVIDER=jev
TYPESAFE_API_KEY=your-typesafe-key
JEV_MODEL=jev-latest
```

`OPENAI_API_KEY` is still required for transcription. Jev does not require a DeepSeek key. Switch back with `VOICE_LLM_PROVIDER=deepseek` and `DEEPSEEK_API_KEY`. Keys stay on the backend; there is no automatic provider fallback. `/health` reports the selected `provider` and `model` and checks that provider's key plus OpenAI's key (it does not validate credentials with the upstream services).

Jev uses [TypeSafe's typed Choice API](https://docs.typesafe.ai/primitives/choice) to select an allowed page action and target, reusing the catalog, navigation rules, and action validator. It cannot generate clarification prose, so unclear references use the existing Indonesian clarification text. The live intent evaluation below runs against whichever provider is selected; run it with your TypeSafe key before relying on Jev's Indonesian/English accuracy.

Point the live site at a tunneled box with `?voice=1&box=https://your-tunnel`.

### ElevenLabs agent mode (opt-in)

`?voice=1&agent=1` keeps the same floating mic and "Hei Nadi" wake word, but the conversation runs through the ElevenLabs "Nadi" agent instead of the voice box: it listens, speaks, and moves the page. `?agent=<agent_id>` selects another agent. The voice box is not needed in this mode.

The agent drives the page through one client tool, `page_action({ action, section })`, which `voice.js` passes to `window.xstationPageAction` — the same actions and section ids the voice box produces. The routing rules live in the agent's prompt ("Website control" section) in ElevenLabs, not in `decide.py`. The browser SDK (`@elevenlabs/client`, pinned in `voice.js`) is loaded from jsDelivr only when a conversation starts. The agent is public (no auth), so its id in `voice-config.js` is enough to start a conversation; restrict it with an origin allowlist or signed URLs in ElevenLabs before sending real traffic to it.

`page_action` also takes an optional `cue`: one to three words the agent is about to say. A cued action does not run at once; `voice.js` reads the per-character timings the SDK reports for the agent's audio (`onAudioAlignment`) and runs the action just before the agent's voice reaches those words (`AGENT_CUE_LEAD_MS`). The agent makes all its calls for one explanation in a single turn (first stop without a cue, later stops cued), so the page walks through several sections in step with the voice for the price of one tool round. Waiting cues are dropped when the visitor interrupts or speaks.

A connected conversation is billed by the minute, so `voice.js` hangs up and re-arms the wake word after 45 seconds in which the agent is silent and the visitor says nothing (`AGENT_IDLE_MS`). Keep the agent a single prompt without workflow hand-overs in ElevenLabs: a hand-over mid-turn made the next step speak the `page_action(...)` call aloud and repeat it. Keep the voice's Expressive mode off too: with it on, the realtime model opened small-talk replies with a `[sad]` refusal ("Saya tidak bisa melakukan itu") and then corrected itself; the `[warmly]` / `[enthusiastically]` / `[confidently]` tags come from the prompt's Style section instead.

With `?voice=1` the page opens behind an attract screen (`#voice-attract`): a dark screen with the mascot large in the middle (70% of the screen's height), example questions beside it, and the head of a microphone held out from the bottom right corner, with "Take the mic" running along its curve. The mascot answers to "Hei Nadi" (or "Hai Nadi") at any moment.

The mascot (`voice-mascot.js`) is flat: a disc in the site's `--signal` green with two oval eyes in `--mist` (left) and `--sage` (right), with no shading. It is moved by springs rather than keyframes. Its body squashes and stretches around the point it stands on and keeps its volume; a hop crouches first, leaves the ground stretched and lands with a squash; its eyes grow, narrow and arch from one feeling's shape into the next (`MOODS`); its gaze follows the pointer for a moment after it moves and otherwise wanders; and it blinks on its own, now and then twice. The eyes sit as if on a ball that turns with the gaze (`projectEyes`), so the eye turning toward the viewer grows and the one turning away shrinks and nears the edge: that is what makes the flat face read as a head. A smiling eye is an arch: its oval with face colour laid over the lower part. The spring constants are at the top of the file.

Between conversations nothing is scripted. A director (`createDirector` in `voice-attract.js`) draws the mascot's turns at random, never the same twice running and each a little different every time (how many hops, which side, how long), with a rest of a few seconds between turns in which the mascot simply looks about. The turns are: hopping to another place on the screen in one to three hops, a curious glance to one side or both, happy hops, a sway, a quick wiggle, a wink of either eye, leaning in for a closer look, looking up as if working something out, a suspicious side-eye, and pointing at the microphone with one or two nods. It does not fall asleep. `TURNS` weighs the turns against each other; two of them also come when they are due: a move to another place 7 to 12 seconds after the last one (`ROAM_EVERY`), and pointing at the microphone 20 seconds after the last time (`POINT_EVERY`), the call to action. Each time the attract screen takes the floor it starts with a greeting, and a pointer that moves after eight still seconds gets one too. `WANDER` in `voice-stage.js` sets how far it may go: up to 0.6 of its radius to either side (less on the left, where the example questions are, which it never covers) and a little up and down; `FACE_FILL` sets how large it is. The microphone (`#voice-mic`) is a layer of its own above the mascot: the head of a hand-held microphone pointing at the middle of the screen, drawn flat as a ball of woven mesh (`meshPath` in `voice-attract.js` stretches a square mesh over a dome, so the wires crowd toward the rim) with the ring around its middle and the collar it sits in, the handle out of sight beyond the corner. Its label is set on the curve of the ball, just outside it (an SVG `textPath`). It comes out of the corner when the attract screen takes the floor and then keeps still. Beside it sits a hint for the state the microphone is in (for example `Ucapkan “Hei Nadi”`); before the microphone has been turned on there is none. It does what a click on the mascot does. While the microphone is still off (`idle`, or after an error) a click anywhere on the screen turns it on; once it is listening, only the mascot and the microphone start a conversation. The example questions are `ASKS`; they and the microphone need GSAP (already on the page). With reduced motion the mascot, one question and the microphone stay still.

The mascot makes small sounds as it goes, and nearly every turn has one: a "plip" for a happy hop and a softer "pip" for each hop of a walk, a rising two-drop call and then a "clink" at each nod when it points at the microphone, a "ting" for a wink, a "blip" when it starts, a three-note chirp for a greeting or a happy turn, a short "peep" for a curious glance or a closer look, a trill for a wiggle, a four-note tune for a sway, a "plink" stepping down when it works something out, a falling "bloop" when it is suspicious, and now and then a quiet murmur while it rests (`CHATTER` in `voice-attract.js` sets how often). They are synthesized in the browser (`VOICES` in `voice-mascot.js`: a few sine partials each, bright and short, tuned a little differently every time), so there are no audio files. `CHIRP_LEVEL` scales them all; `0` makes the mascot silent. A browser keeps sound shut until the page has been touched, so the mascot is silent until the first click or key press. Keep them light: a set of robot vocalisations generated with ElevenLabs' sound effects model was tried in their place and came across as eerie. The tones that mark a conversation's states (`createStateSound` in `voice.js`) are separate and unchanged.

In a conversation the same body reacts to what happens: listening, it gives a small hop when a voice starts, a pair of nods now and then while speech is understood, flattens a little under a loud voice, follows the page with its eyes as it scrolls, and shakes its head once when an action could not run; thinking, it looks up to one side and then the other; speaking, it stands taller with its own voice and hops as the voice comes in after a pause; when the stage carries it to another spot its body trails behind and wobbles upright again. A mascot that cannot hear (`deaf`, `blocked`) is dimmed, with its eyes shut.

For looking at the attract screen, add `&attractMood=<feeling>` to hold the mascot in one feeling (for example `?voice=1&attractMood=happy`), or `&attractAt=<seconds>` to hold the example questions on one moment with the mascot at rest.

When a conversation starts, the attract screen stays as it is while the call connects: the mascot turns to the visitor with a small hop and waits where it stands, the example questions step back, and a heartbeat trace runs across the whole screen behind the mascot (`data-calling` on `#voice-attract`). There is no "connecting" wording. As soon as the agent is connected, the screen collapses in a circle into the mascot (about a third of a second, following it as it moves) and the page shows. In agent mode the agent opens with a greeting, and while it says it the mascot stays in the middle of the page, large (`GREET_FILL` in `voice-stage.js`, half the screen's height): `voice.js` sets `data-greeting` on `#voice-surface` when the agent connects and clears it when the first thing it says is over, when the visitor speaks first, or after four seconds if the agent stays silent (`AGENT_GREETING_MS`). Then the mascot shrinks and goes to the emptiest spot beside the content (`voice-stage.js`). Every 250 ms (once scrolling has settled) it maps the visible text, controls and media onto a grid and picks the place where it covers the least, preferring the bottom corners and staying put unless another spot is clearly better. The page stays in view for the rest of the session. What the agent says is heard, not shown as text; the caption is only used by the voice box for the visitor's own words, and then sits above or beside the mascot, whichever is free. When the session ends (hang-up, idle timeout, a click on the mascot, Escape) the screen opens again from the mascot, which greets and takes up its turns again. While the screen is open it covers the page and takes its clicks. The mascot's layout box does not move, so section centering in `work.js` is unaffected.

The voice prompt includes all 38 commands from **AI Product Showcase - AI Voice Nav (1).csv**, reconciled against the product descriptions in `index.html` as the primary reference; the CSV is secondary. Business needs also select the best matching product without an explicit name or navigation command. General promotion or sales growth starts at BikinKonten; a more specific problem takes priority, such as unanswered customer messages selecting CRM AI Agent. Lubna handles marketing through chat from brief to publication. The catalog in `voice/box/sections.py` describes every product and the System services using the site's capabilities. Recommendations only navigate; they add no spoken or written explanation.

Reconciled CSV targets:

| CSV rows | Effective action | Reason |
| --- | --- | --- |
| 7 | Show BikinKonten | The command explicitly names BikinKonten. |
| 23–24 | Show Arkiv | Its product description covers document management and information retrieval; Lubna handles marketing. |
| 11–12 | Open current product demo | BikinKonten and Lubna have playable demos. |

Knowledge storage and organization also select Arkiv. Prototypes select CoFrame; client references and track record select Trusted by (`clients`); agent architecture and operations select System. Product conversion requests focus that product's existing CTA, including CoFinance.

"Go back" returns to the previous action. "Next", "go next", and "go forward" open the section after the currently visible one in full page order, including after manual scrolling: Hero → The System Behind Every Agent → product catalog → BikinKonten → Lubna → CRM AI Agent → HireAssess → Arkiv → CoDev → CoFrame → CoFinance → CoLegal → Trusted by → Contact. Next stops at Contact without wrapping or opening WhatsApp. "What else can I explore?" keeps its existing route through the catalog, products, and Trusted by. Contact requests focus the general or named product's CTA. Only an explicit request to open WhatsApp follows its existing link; it never sends a message. Voice can open the BikinKonten or Lubna demo: “Play the BikinKonten demo”, “Putar demo Lubna”, or “Play the demo” for the current product. “Pause the video”, “Resume the video”, “Restart the video”, and “Close the video” control the open player; Indonesian equivalents work too. Other products only have decorative previews, so they do not open a demo. Navigating closes the player. Booking a demo still focuses contact. Restart/redeploy the voice service after changing `voice/box/sections.py` or `voice/box/decide.py`.

Run offline checks separately from the live intent evaluation:

```bash
npm run test:voice
node --test videos/gateway-hero/voice.test.mjs
# Sends fixed sample commands and the catalog prompt to the configured voice decision API; uses API credits.
voice/box/.venv/bin/python voice/box/eval_intents.py
# Focused regression: the cake example must select BikinKonten three times.
voice/box/.venv/bin/python voice/box/eval_intents.py --group cake
```

The live evaluation checks the 38 reconciled showcase commands, held-out Indonesian/English business needs for every product, client references, and System service, and commands that must not navigate. It uses the live stream's 12-second interpretation deadline and exits nonzero on any mismatch or API error. It is not part of the offline test command.

`window.voiceActionLog` holds `{ entries, index }` in memory: entry 0 is the initial position, followed by successful actions and their destinations/scroll positions. Back moves the index without appending entries. Next records a new Show; a new action after going back replaces the forward history. Replaying a WhatsApp entry restores its page position without reopening the external link. Reloading the page clears the log.

## Deploy on one domain

### Dokploy (Docker Compose)

Create a **Docker Compose** deployment using this repository's `main` branch and `compose.yaml`. This starts both the static frontend (`web`) and Python backend (`voice`), with `/voice/` proxied internally. A static-only Dokploy application does not run the backend or install the proxy snippet.

Set these variables in Dokploy's Environment tab:

```dotenv
OPENAI_API_KEY=your-openai-key
DEEPSEEK_API_KEY=your-deepseek-key
DEEPSEEK_MODEL=deepseek-v4-flash
VOICE_BOX_ALLOWED_ORIGINS=https://nadi.dot.co.id
```

In Domains, route `nadi.dot.co.id` to service **web**, container port **80**, path `/`, with HTTPS enabled. Replace the old application's domain mapping so only this deployment owns the hostname. Do not add a public domain or host port for `voice`. See [Dokploy's Compose domain setup](https://docs.dokploy.com/docs/core/docker-compose/domains).

Deploy, then check `https://nadi.dot.co.id/voice/health` returns JSON with `ok: true`. The frontend uses `wss://nadi.dot.co.id/voice/v1/stream`. Updated script URLs bypass the old four-hour cached voice configuration; HTML and JavaScript revalidate on subsequent deployments. If a custom Cloudflare rule overrides origin cache headers, purge the old HTML/JavaScript cache and honor the origin headers.

### Existing Nginx server

Production uses `/voice` on the frontend's origin automatically. Local preview on port 4174 still connects directly to port 4175; `?box=` remains an override.

Run the Python voice backend as a persistent service on the same host as Nginx, with these environment variables (or `voice/box/.env`):

```dotenv
DEEPSEEK_API_KEY=your-deepseek-key
OPENAI_API_KEY=your-openai-key
DEEPSEEK_MODEL=deepseek-v4-flash
VOICE_BOX_HOST=127.0.0.1
VOICE_BOX_PORT=4175
VOICE_BOX_ALLOWED_ORIGINS=https://your-domain.com
```

Use comma-separated exact origins if both apex and www domains serve the site. Keep the backend directory and its `.env` outside the public static files.

Include `deploy/nginx-voice.conf` inside your existing frontend HTTPS `server {}` block, using its absolute installed path:

```nginx
include /path/to/nadi/deploy/nginx-voice.conf;
```

Validate with `sudo nginx -t`, then reload Nginx. The config strips `/voice/`, so `/voice/health` reaches `/health` and `/voice/v1/stream` reaches `/v1/stream`. It forwards WebSocket upgrade headers following the [Nginx WebSocket documentation](https://nginx.org/en/docs/http/websocket.html).

Check `https://your-domain.com/voice/health`, then try the voice control and verify `/voice/v1/stream` upgrades with status 101. Static-only hosting needs a separate proxy-capable server for this setup. If Nginx and the backend run in separate containers, replace the upstream loopback address with the backend container's service address and bind the backend to `0.0.0.0`.

## Live site

[https://wasomeno.github.io/xstation-2/](https://wasomeno.github.io/xstation-2/)

## Local wake words (experimental, desktop Chrome)

Click the orb once and grant microphone permission to start listening. Give successive commands without repeating the wake phrase. After each decision or no-action result, Nadi returns to listening in the same connection; an unmatched command plays the 500 ms head shake. Only live transcription appears above the orb.

Say **“thanks”**, **“terimakasih”**, **“terima kasih”**, or **“makasih”** (recognized in OpenAI live transcription), or click the orb again, to end the conversation and return to the on-device **“Hei Nadi”** listener. Either that wake phrase or another click starts a new session using the same microphone. `nadi:wake` is emitted only for voice-triggered sessions. Escape releases the microphone and worker.

Processing animation requires nonempty text from the current turn; audio energy or an empty transcript keeps the orb in listening and does not trigger the no-action shake. The active session has no eight-second silence cutoff. The client commits after a speech pause or 30 seconds (including silence, to bound upstream audio buffers), pauses upload while processing, and resumes after the result. Backend connection and processing deadlines remain 10 and 30 seconds; failures close the session and return to local listening. Audio from local wake-ready mode is never uploaded. During an active session, listening audio—including room sound—is sent for transcription until the session ends. Hidden pages disable microphone tracks and close the connection while keeping the audio graph alive; returning resumes the previous active conversation silently, or shows a resume control if Chrome needs a gesture. A reload requires enabling again.

Use `npm start` for local preview: the preview server now supplies the same isolation headers as `deploy/nginx-web.conf`. On the VPS, rebuild the existing frontend image to include the prebuilt WASM assets and new Nginx config. HTTPS is required outside localhost. Preserve `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` through any proxy/CDN; Chrome needs them for this shared-memory runtime. No additional VPS service is needed. Plain `python -m http.server` does not supply these headers.

Runtime provenance, rebuild instructions, and licensing are in [wake assets](videos/gateway-hero/assets/wake/sherpa-onnx-1.13.3/README.md). Model-load or performance failures display an error and release the mic; there is no cloud wake-word fallback. The worker queue is capped at two seconds so slow devices fail visibly instead of retaining unbounded audio.

Before relying on it at a booth, test “Hei Nadi” with several speakers and the actual microphone: at least 18/20 detections, plus no false wake in 30 minutes of representative room sound, similar phrases and demo playback. These real-speaker acceptance measurements are still required. Existing cloud transcription/interpretation costs apply only to activated commands.

Browser integration smoke check (with Playwright available in `NODE_PATH`): `node scripts/check-wake-browser.cjs hei.wav similar-phrase.wav`. Set `WAKE_PREVIEW_URL` to the running preview and optionally `CHROME_PATH`. It uses a fake microphone and mock backend, checks the privacy boundary, and reports actual local detector results for the supplied WAVs. It does not send test audio to OpenAI. Test file results must be compared with their expected phrases; a successful process exit alone does not establish recognition accuracy.

### Record wake-word training samples

Use **Rekam sampel suara** in the footer, or open `/videos/gateway-hero/record.html`. The standalone recorder does not load the voice agent or contact the voice backend. It uses the microphone only after clicking Record, offers playback, and exports mono PCM16 WAV at 16 kHz plus a JSON label manifest. Download each desired WAV and the manifest before leaving; recordings are held in memory only, with a 30-sample limit. No automatic upload or model training occurs.

Label each sample with a pseudonymous speaker code, train/test split, microphone condition, and wake/similar/background category. Wake clips stop at 4 seconds, similar phrases at 8 seconds, and background at 30 seconds. Escape cancels; hiding the page finishes the current clip and releases the microphone. Use new recordings for held-out testing. This collection tool does not establish recognition accuracy or replace the longer booth acceptance test.

The existing frontend Docker image copies this page and its script through `COPY videos/`; no backend or deployment configuration changes are required. Browser recorder smoke check: `node scripts/check-record-browser.cjs` with Playwright in `NODE_PATH` and optional `CHROME_PATH` / `WAKE_PREVIEW_URL`. It exercises real browser capture with a fake microphone, WAV and metadata downloads, automatic/manual stop, cancellation, stale permission cleanup, and verifies no audio uploads.
