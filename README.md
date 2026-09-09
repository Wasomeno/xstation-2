# XTATION

Landing page (`index.html`) for XTATION - a station for company projects and apps.

## Run locally

```bash
npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Voice (local box)

The floating mic talks to an always-on box on this machine: local OpenAI Whisper, then DeepSeek `deepseek-chat`. GitHub Pages cannot run Whisper.

```bash
cd voice/box
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # set DEEPSEEK_API_KEY
```

From the repo root (venv active, key in the environment or `voice/box/.env`):

```bash
npm start          # site on :4174
npm run voice      # box on :4175
```

First Whisper load downloads the `small` model. Point the live site at a tunneled box with `?box=https://your-tunnel`.

## Live site

[https://wasomeno.github.io/xstation-2/](https://wasomeno.github.io/xstation-2/)
