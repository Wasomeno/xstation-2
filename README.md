# NADI

Landing page (`index.html`) for NADI — a portfolio of intelligent products for business.

## Run locally

```bash
npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Hero on phones

The hero illustration is a canvas animation that repaints screen-sized radial
gradients every frame, which is the work a phone GPU handles worst. Below 768px
the canvas and its agent callouts are hidden and `videos/gateway-hero/media/hero/`
carries a recorded portrait clip of the same canopy instead: `hero-mobile.mp4`
(H.264, 540x1200, ~157 KB) with `hero-mobile-poster.jpg` as its first frame.

The clip is framed so the canopy sits in the upper half and fades out over the
lower half, leaving the hero copy on dark ground. The `<video>` element ships
without a source; `bindHeroMotion()` attaches one at the first idle moment after
load, skips it entirely under `prefers-reduced-motion` or Save-Data, and pauses
it once the hero scrolls away. If the file never loads, the poster shows; if that
fails too, the stage's own `#04100b` ground stays and nothing else moves.

To re-record after changing the canvas, capture `#nadi-cluster` at a portrait
size, composite each frame over `#04100b` first (the canvas keeps a translucent
trail buffer, so a raw capture blooms), then encode with
`-crf 31 -profile:v main -movflags +faststart`.

## Voice (local box)

The floating mic streams audio to an always-on box: OpenAI Realtime `gpt-live-transcribe`, then DeepSeek `deepseek-v4-flash`. Keys stay on the box. Live transcript appears in the popover.

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

Point the live site at a tunneled box with `?box=https://your-tunnel`.

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
# Sends fixed sample commands and the catalog prompt to the configured DeepSeek API; uses API credits.
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
VOICE_BOX_ALLOWED_ORIGINS=https://nadi.dotploy.my.id
```

In Domains, route `nadi.dotploy.my.id` to service **web**, container port **80**, path `/`, with HTTPS enabled. Replace the old application's domain mapping so only this deployment owns the hostname. Do not add a public domain or host port for `voice`. See [Dokploy's Compose domain setup](https://docs.dokploy.com/docs/core/docker-compose/domains).

Deploy, then check `https://nadi.dotploy.my.id/voice/health` returns JSON with `ok: true`. The frontend uses `wss://nadi.dotploy.my.id/voice/v1/stream`. Updated script URLs bypass the old four-hour cached voice configuration; HTML and JavaScript revalidate on subsequent deployments. If a custom Cloudflare rule overrides origin cache headers, purge the old HTML/JavaScript cache and honor the origin headers.

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
