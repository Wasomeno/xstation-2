const params = new URLSearchParams(window.location.search);

export const VOICE_BOX_URL = (params.get("box") || "http://127.0.0.1:4175").replace(/\/$/, "");
