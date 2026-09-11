# Experimental Nadi wake detector

Runtime: [sherpa-onnx v1.13.3](https://github.com/k2-fsa/sherpa-onnx/tree/v1.13.3/wasm/kws), built with Emscripten 4.0.23 and the upstream pinned ONNX Runtime 1.24.4 static SIMD library.
Model: [GigaSpeech English 3.3M, 2024-01-01](https://github.com/k2-fsa/sherpa-onnx/releases/download/kws-models/sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01.tar.bz2), int8 encoder/decoder/joiner. The archive's own README declares Apache License 2.0; its unmodified text is retained as `MODEL-README.md`. Runtime/dependency licenses are retained in `licenses/`.

The upstream build is changed only to use 64 MiB initial memory, one pthread in the pool, and the English int8 model (under the filenames expected by the wrapper). Models and vocabulary are embedded in `.data`; the worker loads the keyword definitions from `keywords.txt`. No external service, account, or activation is used. `SHA256SUMS` records shipped runtime files.

Run `scripts/build-wake.sh` from the repository with Emscripten 4.0.23 activated to rebuild. The script verifies source/model archives and uses the upstream dependency pins. It requires Python >=3.10, CMake, make, curl, tar and shasum. The VPS serves the prebuilt files and needs none of these build tools.

`keywords.txt` uses the archived `bpe.model` and SentencePiece 0.2.2 for `HEI NADI`, `HEY NADI`, and `HEY NADDY` (an acoustic spelling). All map to the single public phrase `Hei Nadi`. Previous Halo/Hello keyword definitions have been removed. The global score/threshold remain 1.0/0.25. Adjust these only against measured recordings; changing phrases requires regenerating the keyword tokens with the archived tokenizer.

English model support does not establish recognition quality for Indonesian pronunciation. This is an experimental build until it passes “Hei Nadi” at >=18/20 utterances across multiple speakers and a 30-minute representative booth-noise test with no false wake. Synthetic recordings are smoke tests, not that acceptance test.

## Initial runtime verification on 2026-09-11 (before the phrase change)

- 22 focused Node voice tests passed. Full web suite: 42 passed, 2 pre-existing responsive-layout failures, reproduced from HEAD.
- Temporary Nginx 1.28.0 accepted the production server configuration with only local listen/root/include paths substituted. Chrome loaded the actual shipped WASM/data through it with cross-origin isolation enabled.
- Browser test with a fake microphone and mock command WebSocket verified no idle connection, post-wake PCM, automatic re-arm, no continued audio after completion, and one microphone request. Detection notification was injected for this controller check.
- Separately, actual WASM inference detected “Hello Nadi” from macOS Samantha English speech and “Halo Nadi” from macOS Damayanti Indonesian speech. A Daniel English sample containing similar words, but neither wake phrase, produced no detections. These were local synthetic recordings; no test audio was sent to OpenAI.
- Real speakers, the kiosk microphone, demo playback through speakers, and a 30-minute booth recording have **not** been validated. The release remains experimental.

## Earlier Halo tuning (superseded)

Damayanti synthetic speech at slow, normal and fast rates, an immediately following command, and joined “Halonadi” were detected (5/5). A similar-phrase passage produced no activation. The selected phonetic path additionally detected one of five white-noise variants that the previous definitions missed (1/5 versus 0/5); three stronger noise/distance variants still failed. These tiny synthetic probes do **not** establish real-speaker accuracy or booth reliability. Increased global sensitivity and larger decoding beams did not resolve this limitation and were not retained. Retest the actual microphone and speakers before release.

## Current Hei Nadi configuration

The controller tests now use `Hei Nadi` and explicitly reject the retired `Halo Nadi` detection event. The browser check still verifies the local-audio boundary and transcript-only bubble. Synthetic Indonesian Damayanti samples detected slow, normal, and fast “Hei Nadi” (3/3 standalone samples), but missed one sample with an immediately following command (3/4 total positives). A similar-phrase passage and the previous “Halo Nadi” sample produced no activation. These are synthetic smoke tests, not real-speaker acceptance; booth noise and the 18/20 target remain unvalidated. Wait for the listening signal before giving the command.

Microphone capture now requests Chrome automatic gain control, alongside echo cancellation and noise suppression, to help with quiet laptop input. This is a browser constraint preference; actual hardware behavior and real-speaker recognition improvements have not been measured. Keyword thresholds are unchanged.

## Conversation lifecycle update

Click or local `Hei Nadi` detection starts a persistent conversation. Per-turn results resume listening on the same socket; no-action speech triggers the 500 ms shake. Live transcript `thanks` / `terimakasih` / `terima kasih`, or clicking again, ends cloud capture and re-arms local wake detection. Escape disables everything. Page visibility resumes the prior mode silently. The model and keyword definitions are unchanged; see the root README for capture/processing boundaries.

Conversation browser integration passed with a fake microphone and mock backend: first-click activation, voice notification activation, same-socket next turn, no-action shake, transcript-only bubble, no audio upload after thank-you, and one microphone request. This does not verify live OpenAI transcription of spoken closing phrases. The full web suite still has the same two pre-existing responsive-layout failures.
