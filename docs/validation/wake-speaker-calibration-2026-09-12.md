# Speaker calibration — 2026-09-12

Input: one user-provided 54.057-second mono AAC recording, decoded locally to 16 kHz PCM. The recording contains repeated intended wake phrases. Neither the original audio nor decoded copies are included in the repository. No user audio was uploaded to a cloud transcription service.

Detector: shipped sherpa-onnx 1.13.3 / English GigaSpeech Zipformer 3.3M INT8, 4 active paths, 1 trailing blank. Final comparable replays used continuous 80 ms chunks, one second of silence before/after the recording, and a fresh stream after each detection, matching the browser test. Initial no-leading-silence probes yielded different counts (including zero for the baseline), so they are not used in this comparison. Counts below are detection events over the entire recording, not accuracy percentages: individual utterance boundaries and the exact number of repetitions have not been independently annotated.

| Configuration | Detections |
| --- | ---: |
| Shipped Hei/Hey definitions, score 1, threshold 0.25 | 1 |
| Shipped definitions, audio gain ×4 | 1 |
| Add HI NADI / HI NADDY, score 1, threshold 0.25 | 1 |
| Same HI variants, threshold 0.15 | 2 |
| Same HI variants, score 2 / 3 / 4 | 0 / 1 / 1 |
| Same HI variants, score 3 and gain ×4 | 1 |
| Additional NAH DEE / NA DEE / NADDIE phonetic variants | 1 |
| Additional phonetic variants, threshold 0.15 | 2 |
| Additional phonetic variants, gain ×4 | 1 |

The two events in the strongest probe occurred approximately 5.16 and 18.44 seconds into the recording. Increasing gain alone does not explain or resolve the mismatch. None of these candidates is adequate to ship. No production keyword, sensitivity, or audio-gain settings were changed.

This work is inference-time calibration, not weight training. The supplied English inference model has not been fine-tuned on this speaker. Fitting further settings against this same recording would not establish performance on new utterances. A speaker-adapted detector needs separate held-out positive recordings plus representative non-wake speech/noise, including similar phrases, to measure missed and false activations. The original >=18/20 and 30-minute background acceptance criteria remain unmet.

Existing browser replay command: `node scripts/check-wake-browser.cjs /absolute/path/to/recording.wav` with Playwright and Chrome configured as in the root README. It uses a mock backend and runs the real local WASM detector for the supplied recording; detector outputs must be checked separately from the controller test's process exit status.

The actual shipped WASM browser detector independently produced one `Hei Nadi` event on this recording, consistent with the matched native baseline. The browser controller/privacy integration also passed using a mock backend. Candidate configurations above were evaluated natively, not shipped or validated with real-time laptop microphone capture.
