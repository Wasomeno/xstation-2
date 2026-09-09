# XTATION

Landing page (`index.html`) for XTATION - a station for company projects and apps.

## Run locally

```bash
npm start
```

Then open [http://127.0.0.1:4174](http://127.0.0.1:4174).

## Voice (local box)

The floating mic talks to an always-on box on this machine: OpenAI `gpt-4o-mini-transcribe`, then DeepSeek `deepseek-chat`. Keys stay on the box.

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

## Live site

[https://wasomeno.github.io/xstation-2/](https://wasomeno.github.io/xstation-2/)
