const params = new URLSearchParams(window.location.search);
const localPreview = ["localhost", "127.0.0.1"].includes(window.location.hostname) && window.location.port === "4174";
const defaultBox = localPreview ? "http://127.0.0.1:4175" : `${window.location.origin}/voice`;

export const VOICE_BOX_URL = (params.get("box") || defaultBox).replace(/\/$/, "");

export const VOICE_BOX_WS = `${VOICE_BOX_URL.replace(/^http/, "ws")}/v1/stream`;

// ElevenLabs agent mode is opt-in: ?voice=1&agent=1 uses the NADI agent, ?agent=<agent_id> another one.
const agent = params.get("agent") || "";
const DEFAULT_AGENT_ID = "agent_6401m7vebq8gebqbnffn7s9yapjp";

export const VOICE_AGENT_ID = agent === "1" ? DEFAULT_AGENT_ID : /^agent_[a-z0-9]+$/.test(agent) ? agent : "";

// ?wakeLog=1 reports what the "Hei Nadi" listener hears and does: see voice-wake-log.js. Its
// readout on the screen is for a preview on this machine only. On a deployed site nothing of it
// can show, whatever the address says: there the parameter writes to the console alone.
export const VOICE_WAKE_LOG = params.get("wakeLog") === "1";
export const VOICE_WAKE_PANEL = VOICE_WAKE_LOG && ["localhost", "127.0.0.1"].includes(window.location.hostname);

// ?mascotSound=0 keeps the mascot silent, to find out whether its sounds get in the way of the
// wake word.
export const VOICE_MASCOT_SOUND = params.get("mascotSound") !== "0";
