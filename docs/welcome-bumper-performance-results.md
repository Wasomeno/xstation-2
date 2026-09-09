# Welcome bumper performance implementation results

Implemented from [welcome-bumper-performance-plan.md](./welcome-bumper-performance-plan.md) on the current working tree. The change preserves the existing 34-slab welcome choreography, six category models, central orb, materials, shadows, glows, input acceleration, reduced-motion behavior, and post-welcome interactions.

## What changed

- Added `videos/gateway-hero/orbit-geometry-worker.js`. It uses Three.js 0.181.2 and an inline copy of that release's `mergeVertices` algorithm, then recomputes normals with the same tolerance (`1e-4`) as the original runtime path. Geometry buffers are copied into transferable buffers, processed off the main thread, and reconstructed with attributes, index, groups, draw range, and morph attributes preserved. The original synchronous path remains a compatibility fallback for browsers that cannot construct the module worker or for unsupported geometry.
- Changed category model preparation to await worker processing and shader warmup. The existing model hierarchy and runtime material recoloring remain on the main thread. `compileAsync` is used when available, followed by a deliberate warm draw.
- Added explicit `ready` and `setRenderActive()` view/controller behavior. Category render loops stop while the welcome bumper covers them. They resume at `xstation:welcome-exit-start`, before the bumper becomes translucent. Renderer creation is queued one view per animation frame to spread setup work.
- Added an explicit `xstation:welcome-entry-complete` boundary after the existing slab/title entrance for phase measurement and lifecycle ownership.
- The welcome timeline now begins paused and starts only after `xstation:orbit-ready`, so WebGL context creation, PMREM generation, model parsing, shader compilation, and warm draws finish on the initial static bumper frame. A 15-second welcome-side fallback prevents a failed work module from permanently suppressing the motion.
- The static preparation frame now renders the existing 34-slab field at a restrained alpha instead of leaving the bumper visually blank. When readiness arrives, that same field crossfades into the authored slab entrance; no duplicate or substitute artwork is used.
- Made the readiness event truthful. `xstation:orbit-ready` now waits for category models and the orb to prepare, compile, and warm, while reporting a ready/degraded result. A 15-second bounded fallback prevents a stalled asset from permanently holding the page.
- Added `xstation:welcome-exit-start` before the existing exit sequence and kept `xstation:welcome-finished` as the existing hero-entry boundary.
- Consolidated welcome slab rendering into one GSAP ticker callback per frame. The existing equations, timing, stagger, easing, depth range, alpha, interaction acceleration, and cleanup are unchanged.
- Delayed Lenis startup until the welcome finishes, preserved its existing configuration, and added owned ticker/anchor cleanup.

## Measurements

The baseline measurements in the plan were taken before the change in isolated Chrome 151.0.7922.109 at 1440 × 900, DPR 2. The worst observed welcome frame gaps were 1,432 ms and 1,101 ms; direct model timing showed the marketing megaphone's main-thread geometry preparation taking 1,090.1 ms.

The final uninstrumented run used the same browser/viewport/DPR and a fresh page context. It recorded:

| Metric | Final run |
| --- | ---: |
| Median welcome rAF interval | 16.7 ms |
| p95 welcome rAF interval | 17.6 ms |
| Maximum welcome rAF interval | 116.7 ms |
| Intervals above 25 ms | 9 |
| Intervals above 50 ms | 5 |
| Main-thread long tasks observed | 102 ms, 55 ms, and 73 ms |
| `orbit-ready` | 2,396.6 ms, status `ready` |
| `welcome-exit-start` | 3,698.6 ms |
| `welcome-finished` | 5,081.7 ms |

The existing diagnostic harness, which adds slab setter instrumentation, produced a maximum of 82.5 ms on a second run. Its slab pass count was 34 per ticker frame. The earlier baseline counted 34, 68, or 102 setters per tick.

The frame tail is substantially improved and the one-second geometry stall is gone in this environment. The remaining 70–83 ms startup tasks come from WebGL context/PMREM/renderer setup; the queue limits them to one view per browser frame but does not make PMREM generation itself preemptible. A prepared environment texture or more involved renderer resource strategy would be the next evidence-driven optimization if this remaining tail is visible on target hardware.

### Follow-up entry scheduling pass

A follow-up report found that the remaining renderer/PMREM tasks were still running during the visible entrance. The queue now begins only after `xstation:welcome-entry-complete`, while the existing readiness hold continues to cover model preparation.

Fresh isolated Chrome measurements of the entrance, from welcome evaluation through the new entry-complete event:

| Metric | Desktop 1440 × 900, DPR 2 | Compact 390 × 844, DPR 3 |
| --- | ---: | ---: |
| Median rAF interval | 16.7 ms | 16.7 ms |
| p95 rAF interval | 16.8 ms | 16.8 ms |
| Maximum rAF interval | 33.4 ms | 17.6 ms |
| Intervals above 25 ms | 1 | 0 |
| Intervals above 50 ms | 0 | 0 |
| Main-thread long tasks during entry | 0 | 0 |

Before this scheduling boundary, the same focused entry measurement reached a 117.4 ms maximum, had nine intervals above 25 ms, five above 50 ms, and six main-thread long tasks between 50 and 98 ms. Instrumentation correlated those tasks with six category renderer/PMREM constructions and the central orb renderer.

In that intermediate revision, the synchronous WebGL/PMREM work still existed during the post-entry hold. The entrance no longer competed with it, but the continuously flying slabs in the hold could still expose the relocated work.

### Final pre-animation preparation pass

The final scheduling pass moved the whole readiness phase before the timeline starts. The bumper remains on its initial static frame while the field prepares; the existing entry, 1.4-second idle flight, and exit then run only after every required view has loaded and warmed.

| Phase | Desktop 1440 × 900, DPR 2 | Compact 390 × 844, DPR 3 |
| --- | ---: | ---: |
| Entry p95 / maximum | 17.6 ms / 17.7 ms | 17.2 ms / 17.7 ms |
| Idle p95 / maximum | 16.8 ms / 17.4 ms | 16.8 ms / 17.3 ms |
| Frames above 25 ms, entry + idle | 0 | 0 |
| Main-thread long tasks, entry + idle | 0 | 0 |

The measured static preparation interval before motion was approximately 2.63 seconds on desktop and 2.25 seconds on compact in these fresh isolated runs. This interval varies with model/network/cache speed and is bounded by the existing 15-second degraded path. The visual choreography and its authored durations are unchanged once motion begins.

After replacing the blank preparation frame with the visible slab tableau, a fresh desktop run measured entry at 17.3 ms p95 / 17.7 ms maximum and idle at 17.2 ms p95 / 17.7 ms maximum. A compact run measured entry at 17.2 ms p95 / 17.6 ms maximum and idle at 17.0 ms p95 / 17.6 ms maximum. Neither run recorded a frame above 25 ms or a long task after readiness.

## Browser and visual checks

- Normal desktop flow: six category canvases and the orb were ready, no model errors occurred, and the event order was `orbit-ready → welcome-exit-start → welcome-finished`.
- Follow-up normal desktop flow: all 34 slabs remained present during entry; six category canvases and the orb reached ready; the event order was `welcome-entry-complete → orbit-ready → welcome-exit-start → welcome-finished`.
- Accelerated input flow retained all 34 slabs and the same event order, with six ready category models and the orb after completion.
- Final normal flow: readiness now precedes all bumper motion, with event order `orbit-ready → welcome-entry-complete → welcome-exit-start → welcome-finished`; entry and idle contained no frame intervals above 25 ms.
- The pre-entry browser capture contained all 34 slabs, all 34 had computed opacity above 0.02, and the field was visible before `orbit-ready` fired.
- Final accelerated, reduced-motion, and `?shot=` checks retained their existing completion behavior, canvas counts, and zero model-error state.
- At 1,000 ms into welcome: all 34 `.welcome-slab` elements existed and were visible; the welcome title and glows rendered.
- Reduced-motion compact flow: welcome slabs remained at zero as before, six model canvases loaded, and no page errors occurred.
- `?shot=products` compact flow: the shot bypass remained functional, seven canvases loaded, and no page errors occurred.
- A final desktop screenshot retained the orbit, central orb, model silhouettes, labels, hero copy, and controls.

## Automated checks

Passed:

```text
node --check videos/gateway-hero/field.js
node --check videos/gateway-hero/work.js
node --check videos/gateway-hero/welcome.js
node --check videos/gateway-hero/orbit-geometry-worker.js
node --test videos/gateway-hero/station-visuals.test.mjs
git diff --check
```

The current automated visual tests cover `station-visuals.mjs`; the browser checks above cover the live field/welcome integration. Headed-browser and physical mobile Safari/Chrome measurements were not available in this run, so this result does not claim those platforms passed.

## Remaining limits and follow-up

The worker fallback intentionally retains the original synchronous preparation for unsupported environments. The shipped path uses the worker in the tested browser. The original model files and licenses remain untouched; no decimation, visual simplification, screenshot substitution, glow removal, shadow removal, or slab removal was used.

The remaining tradeoff is the static preparation interval before motion begins. If that interval is too long on target devices, reduce the work itself rather than moving it back into an animated phase. The next candidates are prepared geometry assets, an offline-equivalent PMREM/environment resource, or a carefully consolidated renderer strategy that preserves every view's output. Do not lower shadow/canvas quality without a matching visual comparison.
