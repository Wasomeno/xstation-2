"""Map Jev's finite choices to the same validated page actions as DeepSeek."""

import json
import os

import httpx
from fastapi import HTTPException

from decide import SYSTEM_PROMPT, decide
from sections import PRODUCT_IDS, SECTION_IDS

JEV_MODEL = os.environ.get("JEV_MODEL", "jev-latest")
DECISIONS = {
    action: {"action": action}
    for action in (
        "back", "next", "explore", "scroll_up", "scroll_down", "scroll_top", "scroll_bottom",
        "video_pause", "video_resume", "video_restart", "video_close", "noop", "clarify",
    )
}
for action, targets in (
    ("show", SECTION_IDS),
    ("demo", ("bikinkonten", "lubna", "current")),
    ("contact", sorted(PRODUCT_IDS | {"current", "contact"})),
    ("whatsapp", sorted(PRODUCT_IDS | {"current", "contact"})),
):
    for target in targets:
        DECISIONS[f"{action}:{target}"] = {"action": action, "section": target}

QUESTIONS = {
    "decision": {
        "type": "choice",
        "instructions": {
            "task": "Choose the page action matching the visitor's command. The JSON examples in the navigation rules describe the choices; select a choice instead of generating JSON. For unclear references select clarify; for off-topic or unsupported requests select noop.",
            "navigation_rules": SYSTEM_PROMPT,
        },
        "criteria": {
            key: json.dumps(value) + " " + {
                "noop": "No action for greetings, off-topic, negated or unsupported requests. Demo playback for any product other than BikinKonten or Lubna is unsupported: choose noop.",
                "contact": "Focus the contact CTA only for an explicit request to contact the team or book/schedule a demo appointment. Asking to play/watch/see a demo is not a contact request.",
                "demo": "Play an existing BikinKonten or Lubna demo. Use current only when no product is named. Never substitute current for a named product without a demo.",
            }.get(value["action"], "")
            for key, value in DECISIONS.items()
        },
    }
}


async def interpret_jev(transcript: str) -> dict:
    api_key = os.environ.get("TYPESAFE_API_KEY", "").strip()
    if not api_key:
        raise HTTPException(status_code=503, detail="jev-key-missing")
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                "https://api.typesafe.ai/v1/systemone",
                headers={"Authorization": f"Bearer {api_key}"},
                json={"model": JEV_MODEL, "state": transcript, "questions": QUESTIONS},
            )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail="jev-failed") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail="jev-failed")
    try:
        choice = response.json()["answers"]["decision"]["choice"]
        payload = DECISIONS[choice]
    except (ValueError, KeyError, TypeError) as exc:
        raise HTTPException(status_code=502, detail="jev-shape") from exc
    return decide(payload, transcript)
