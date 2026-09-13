# Wake dataset baseline — Ami and Ayu

Actual browser WASM replay of two user-supplied ZIPs. First archive: 30 training wake clips; last 15 relabeled Ayu according to the user. Second archive: 20 clips labeled test/similar, evenly split between Ami and Ayu. Labels are user-provided, not independently transcribed. No model weights or runtime configuration were changed for this evaluation.

Configuration: sherpa-onnx 1.13.3 GigaSpeech 3.3M, score 1.0, threshold 0.15, four paths, one trailing blank, current Hei/Hey/Hi/Hai keyword definitions. Each file gets one second of zero padding before and after, fresh worker/stream, and continuous 80 ms chunks. This measures isolated clip detection, not live microphone latency or continuous booth false-activation rate.

| Speaker | Wake clips detected | Similar clips falsely activated |
| --- | ---: | ---: |
| Ami | 10/15 | 0/10 |
| Ayu | 12/15 | 0/10 |

Combined: 22/30 wake clips detected, 8 missed. No activations on 20 similar-phrase clips totaling 25.74 seconds. This short negative set cannot establish the 30-minute background target. The wake clips are labeled training, so these detection rates do not establish held-out performance or meet the >=18/20-per-phrase acceptance target.

All 50 WAVs are mono PCM16 at 16 kHz; none are byte-identical duplicates. Total recorded duration is 77.46 seconds. The largest fraction of near-full-scale samples in any file is 0.0573%; this check alone does not establish perceptual audio quality or absence of truncated words. No recordings or transcripts were uploaded, and private audio remains outside the repository.

Reproduction: extract only manifest-referenced WAV files to a private directory, then run `WAKE_AUDIO_ONLY=1 node scripts/check-wake-browser.cjs <wav files...>` with Playwright in NODE_PATH and CHROME_PATH as documented in the root README. Without WAKE_AUDIO_ONLY the existing controller integration still runs. Process success only means the replay ran; evaluate each JSON detection result against its label. Input audio and per-file diagnostic results for this run remain in `/private/tmp/nadi-dataset-eval/`.

Next needed for independent validation: new wake-positive test recordings from both speakers and representative background audio. Calibration or model training must use training data; tuning against these negative test clips would make them development data and require a fresh negative test set. No production reliability claim or model training is made by this report.
