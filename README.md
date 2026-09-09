# NADI

Landing page (`index.html`) for NADI — a portfolio of intelligent products for business.

## Run locally

```bash
npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

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
npm run voice      # box on :4175
```

Point the live site at a tunneled box with `?box=https://your-tunnel`.

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

Voice visuals: [Variant 1 — flat flowing bands](http://127.0.0.1:4174/?voice-variant=1) and [Variant 2 — smooth flowing colors](http://127.0.0.1:4174/?voice-variant=2) are preserved in `videos/gateway-hero/voice-variant-1.js` and `voice-variant-2.js`. [Variant 3 — earlier flat layered circles](http://127.0.0.1:4174/?voice-variant=3) is the default. All three use the same voice session and controls.

## Live site

[https://wasomeno.github.io/xstation-2/](https://wasomeno.github.io/xstation-2/)
