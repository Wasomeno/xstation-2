const params = new URLSearchParams(window.location.search);
const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "4174";
const defaultBox = localPreview ? "http://127.0.0.1:4175" : `${window.location.origin}/voice`;

export const VOICE_BOX_URL = (params.get("box") || defaultBox).replace(/\/$/, "");

export const VOICE_BOX_WS = `${VOICE_BOX_URL.replace(/^http/, "ws")}/v1/stream`;
