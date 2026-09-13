# Ami/Ayu detector tuning

Configuration selection used only 30 training wake clips (15 Ami, 15 Ayu). Six candidates were specified before testing. Equal hit counts favor the higher threshold, score nearest 1.0, then fewer paths. Keyword definitions and audio processing were unchanged. This is inference-time tuning, not model weight training.

## Training selection

| Score | Threshold | Paths | Clips detected |
| ---: | ---: | ---: | ---: |
| 1 | 0.15 | 4 | 22/30 |
| 1 | 0.1 | 4 | 22/30 |
| 1 | 0.05 | 4 | 22/30 |
| 1.5 | 0.15 | 4 | 24/30 |
| 2 | 0.15 | 4 | 22/30 |
| 1 | 0.15 | 8 | 27/30 |

Locked winner: score 1.0, threshold 0.15, eight paths. Only after selection, both baseline and winner were evaluated on the same 21 new wake clips and 20 similar-phrase test clips. No further candidate was chosen using those results.

## Held-out comparison

| Speaker | Baseline wake hits | Eight-path wake hits | Baseline / eight-path false triggers |
| --- | ---: | ---: | ---: |
| Ami | 5/11 | 6/11 | 0/10 / 0/10 |
| Ayu | 2/10 | 3/10 | 0/10 / 0/10 |

Total held-out detection improves from 7/21 to 9/21; 12 clips are still missed. Both configurations produce zero activations on the 20 similar-phrase clips (25.74 seconds). The selected change is applied locally and remains experimental. It does not meet the original recognition target or establish a 30-minute false-activation result. Do not confuse 27/30 on training audio with performance on new recordings.

All replays used the actual browser WASM worker, fresh worker per clip, 80 ms frames and one second of zero padding before/after. Labels come from user manifests; the final 10 new wake clips are Ayu, preceding 11 Ami, as confirmed by the user. Audio stayed local. No production deployment or automatic retraining occurred.

## Reproduce

Use `WAKE_AUDIO_ONLY=1 WAKE_TEST_CONFIG='{"score":1,"threshold":0.15,"paths":8}' node scripts/check-wake-browser.cjs <wav files...>` with the existing Playwright/Chrome environment described in README. Set paths to 4 for baseline. Overrides exist only in the test browser's intercepted worker response and do not change production files. Process success is not an accuracy assertion; count JSON results against manifest labels. Raw logs and private files from this run are in `/private/tmp/nadi-dataset-eval/`.
