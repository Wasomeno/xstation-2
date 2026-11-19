const params = new URLSearchParams(window.location.search);
const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "4174";
const defaultBox = localPreview ? "http://127.0.0.1:4175" : `${window.location.origin}/voice`;

export const VOICE_BOX_URL = (params.get("box") || defaultBox).replace(/\/$/, "");

export const VOICE_BOX_WS = `${VOICE_BOX_URL.replace(/^http/, "ws")}/v1/stream`;

// ElevenLabs agent mode is opt-in: ?voice=1&agent=1 uses the NADI agent, ?agent=<agent_id> another one.
const agent = params.get("agent") || "";
const DEFAULT_AGENT_ID = "agent_9801m7mfdstxejksdzkm78n1rdac";

export const VOICE_AGENT_ID = agent === "1" ? DEFAULT_AGENT_ID : /^agent_[a-z0-9]+$/.test(agent) ? agent : "";
