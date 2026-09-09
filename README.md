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

Voice visuals: [Variant 1 — flat flowing bands](http://127.0.0.1:4174/?voice-variant=1) and [Variant 2 — smooth flowing colors](http://127.0.0.1:4174/?voice-variant=2) are preserved in `videos/gateway-hero/voice-variant-1.js` and `voice-variant-2.js`. [Variant 3 — earlier flat layered circles](http://127.0.0.1:4174/?voice-variant=3) is the default. All three use the same voice session and controls.

## Live site

[https://wasomeno.github.io/xstation-2/](https://wasomeno.github.io/xstation-2/)
