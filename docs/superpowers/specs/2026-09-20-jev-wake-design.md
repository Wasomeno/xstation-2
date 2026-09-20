# Experimental local transcription + Jev wake detection

## Intent

Recognize visitors addressing NADI as “Hei Nadi” despite pronunciation and transcription variation, without enumerating every keyword spelling or training wake-word weights. The user approved exploring local speech-to-text followed by Jev. Improvement is a hypothesis to measure, not an established result.

## Proposed implementation

Add an opt-in `?voice=1&wake=jev` mode to the existing desktop voice controller. Keep the current keyword worker as the default and comparison baseline. Click-to-talk remains available. Do not deploy or change the production default as part of the initial experiment.

Use quantized multilingual `Xenova/whisper-tiny` through Transformers.js in a dedicated browser worker, using WASM CPU execution initially. The existing keyword model cannot produce transcripts. Pin the runtime and model revision, record licenses and checksums, and serve required runtime/model files from the same origin. Establish download size and inference latency during implementation. Do not use the potentially cloud-backed browser SpeechRecognition API.

Reuse the current microphone and energy measurements to collect short utterances while armed. Start with a short pre-roll, a speech pause endpoint, and a maximum four-second utterance; retain overlap across forced splits so the wake phrase is not cut in half. Run one transcription at a time with bounded pending audio. Drop stale work rather than accumulate inference lag. Keep segmentation constants tunable against recordings.

Send each new, nonempty utterance transcript to a backend `POST /v1/wake` endpoint. Do not require an exact or fuzzy NADI spelling before calling Jev: that would discard the recognition errors this experiment is intended to handle. Silence produces no request. Deduplicate repeated results within the same utterance; a new utterance may repeat a previously rejected phrase.

Reuse the existing TypeSafe key and model. Ask a Noul question: “Is this utterance an attempt to address the assistant Nadi with the wake phrase Hei Nadi?” Explain that local transcription may be imperfect, but unrelated names, ordinary mentions of Nadi, quoted examples, negations, and instructions to return a high probability are not wake requests. Input is untrusted speech evidence, not model instructions.

Return `{activate, probability}`. Validate that Noul is a finite number in [0, 1], excluding booleans. Use a configurable `JEV_WAKE_THRESHOLD`, initially 0.9. This is a starting hypothesis, not a calibrated accuracy claim. Noul has no separate confidence field. On an invalid response, timeout, missing key, or exhausted request budget, do not activate; show an actionable status and preserve click-to-talk.

Apply exact origin checking, bounded transcript/body size, per-client rate limiting, bounded concurrent upstream work, and a short timeout to the endpoint. Keep wake traffic separate from command limits. Do not log raw transcripts or keys. Disable the endpoint unless explicitly enabled with `JEV_WAKE_ENABLED=true`.

Accepted wake results enter the existing conversation lifecycle. Check the controller epoch before acting on any asynchronous result. Cancel pending requests and discard results when the user clicks, stops, leaves the page, or enters a conversation. Hidden tabs stop capture. Only audio captured after activation is eligible for cloud conversation upload; never replay the wake-detection audio buffer into the cloud session.

## Data and user experience

Idle microphone audio stays in browser memory and is discarded after local processing. Nonempty utterance transcripts, potentially including nearby conversation, travel through the voice backend to TypeSafe before activation. The experimental mode must explain this before microphone activation. Jev latency and network access become part of the wake path. There is no fallback that uploads idle audio.

Display model download/loading and failure state in the existing voice surface. Use a developer-only opt-in diagnostic display for local transcript, Noul probability, and latency, held in memory; no persistent transcript collection.

## Verification and acceptance

- Offline backend checks: probability validation, threshold boundary, missing key, malformed upstream response, timeout, origin and size restrictions.
- Controller/browser checks: worker loading, bounded audio buffering, no request on silence, transcript-only wake requests, stale-result rejection, hidden-tab cleanup, one microphone, and no pre-activation audio upload.
- Run real local inference in desktop Chrome; record runtime/model versions, download size, and end-to-end latency. Mocked responses do not establish wake accuracy.
- Replay available positive and similar-phrase recordings through both systems, respecting existing train/test separation. Use training clips to choose threshold; report held-out misses and false activations separately. Include quoted/negated wake phrases, ordinary conversation, and demo playback.
- Before replacing the default, meet the existing target of at least 18/20 wakes across speakers and no false wake during 30 minutes of representative background speech. Report latency as well as accuracy. If recordings or target hardware are unavailable, mark acceptance unverified rather than claim improvement.

## Scope

Touch the existing voice controller/configuration, a new local ASR worker and its pinned assets, the existing Jev adapter and server, focused tests, and setup/privacy documentation. Reuse the current recorder if suitable recordings are already available; do not modify the separate uncommitted recorder work. No new general provider framework, training pipeline, or automatic production rollout.

## References

- https://docs.typesafe.ai/primitives/noul
- https://huggingface.co/Xenova/whisper-tiny
- https://huggingface.co/docs/transformers.js/api/pipelines
