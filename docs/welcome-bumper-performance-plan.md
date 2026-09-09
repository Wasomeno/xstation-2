# Welcome bumper performance implementation plan

Status: implemented in the current working tree, including the follow-up entry-complete scheduling gate; see [welcome-bumper-performance-results.md](./welcome-bumper-performance-results.md) for measured results and remaining limits.

Baseline commit: `51590e20b770ece215d7ace976598e732ad584cf`.

Repository: `/Users/kevinananda/Codes/xstation-2`.

## Execution brief

Fix the welcome bumper's freezes and uneven animation while preserving everything currently implemented on the page. Implement and verify the work in this plan; do not stop after refactoring the slab loop. The measured primary problem is synchronous preparation of the marketing megaphone model while the welcome animation is playing. Hidden WebGL rendering, renderer initialization, shader first use, duplicate slab updates, and startup timing also contribute.

The user intends to delegate this document to another model. All essential evidence and decisions are included here. Temporary profiling files from the analysis are optional supporting evidence, not required dependencies. Do not infer permission to deploy, publish, merge, or message other people. Ordinary implementation, asset preparation, local testing, and documentation are in scope.

Start by checking the current commit, working tree, and any applicable AGENTS.md instructions. Preserve unrelated user changes. If the baseline has moved, locate the symbols below and reconcile relevant changes before editing. Line numbers are navigation aids, not assertions that later code is identical. Older documents in docs/ describe previous visual systems and unresolved historical issues; current code and this task's preservation requirements define the baseline for this performance fix.

## Outcome and non-negotiable preservation requirements

The page must retain:

- All 34 welcome slabs; palette, dimensions, glow, atmosphere, perspective, positions, depth travel, stagger, entry, hold, and exit.
- All welcome words, typography, masks, layout, and choreography.
- Existing input acceleration on pointer, wheel, touch, and keyboard.
- The wait-for-hero handoff, seamless bumper crossfade, and hero entry choreography.
- All six category models, the central orb, rings, labels, model appearance, materials, lighting, shadows, hover/focus transitions, orbit motion, autoplay, and later content.
- Existing smooth scrolling, ScrollTrigger behavior, anchor links, project-video behavior, responsive presentation, and reduced-motion path.
- Original model files, provenance, and license files. Generated prepared assets may be added alongside them.

Do not reduce slab count, substitute static screenshots for visible 3D models, remove glow or shadows, lower visible rendering quality, simplify mesh topology beyond the exact weld already performed by the current code, change motion timings to hide dropped frames, or replace GSAP/Three.js/the site's architecture as a shortcut. This task permits changing implementation and scheduling; it does not permit deleting product features or visual treatments.

Avoid unrelated visual redesigns or repairs to historical orbit issues. Record an unrelated defect if encountered and distinguish it from a regression introduced here.

## Evidence supporting the plan

Analysis used isolated headless Chrome 151.0.7922.109 at 1440 × 900, DPR 2, local HTTP, no deliberate throttling, sequential runs. CDN dependencies were still fetched through the page's URLs. Captured rAF intervals, main-thread long tasks, GSAP slab setter counts, WebGL draw submissions, lifecycle events, sampled CPU stacks, and model-build durations.

| Diagnostic | Largest rAF interval while welcome existed |
| --- | ---: |
| Full page, baseline run 1 | 1,432 ms |
| Full page, baseline run 2 | 1,101 ms |
| Suppress hidden scene draws only | 1,100 ms |
| Render slabs once per tick only | 1,134 ms |
| Bumper alone, run 1, retaining all bumper visuals | 50 ms |
| Bumper alone, run 2, retaining all bumper visuals | 33 ms |

The bumper-only runs detected no main-thread long tasks over 50 ms. Typical frame intervals in all variants were approximately 16.7 ms; isolated one-second freezes are the issue. Average FPS or a good p95 alone is insufficient proof of success. These are scheduling measurements, not direct display-frame or GPU execution measurements. Cache, shader warmup, OS load, and instrumentation were not fully controlled, so do not claim precise speedup percentages from this table.

Direct synchronous build timings:

| Model | Time |
| --- | ---: |
| Marketing megaphone | 1,090.1 ms |
| Handshake | 56.1 ms |
| Robot | 11.7 ms |
| Talent assessment | 10.9 ms |
| Prototyping computer | 8.5 ms |
| Document management | 4.7 ms |

The marketing GLB is 19,324,076 bytes, with 446,474 POSITION entries and 892,928 source triangles across seven mesh primitives. These are metadata counts, not per-frame draw counts. The CPU profile attributed approximately 1,154 ms inclusive to model building, approximately 1,148 ms within geometry preparation, approximately 329 ms inclusive within createField, and approximately 92.5 ms inclusive across welcome renderField calls. Nested profile costs overlap; do not add them as independent totals.

There were seven WebGL canvases: six category canvases at 1024 × 1024 in the test and one central-orb canvas. Baselines submitted thousands of WebGL draws while the welcome flag was active. Each category independently creates its renderer, PMREM environment, physical materials, and 1024 × 1024 shadow map configuration.

Slab instrumentation measured 34, 68, and 102 gsap.set calls per tick. Multiple onUpdate callbacks render the same 34-element field in a single tick.

In a timing run, orbit-ready fired at 1,018 ms, before the marketing model started building at 1,403 ms and finished at approximately 2,493 ms. Current readiness does not await usable model frames.

Optional original artifacts on the analysis machine: `/tmp/xstation-bumper-audit.4nZg8E/`, including report.md, probe.cjs, cpu-profile.json, and raw JSON runs. Temporary HTTP-response overrides were diagnostic only; none was applied to application files.

## Code map and dependencies

| Location at baseline | Responsibility / change |
| --- | --- |
| index.html:13–20 | GSAP 3.14.2 and Three.js 0.181.2 imports; keep versions aligned with tooling |
| index.html:135–255, 840–855 | Welcome styles and color overrides; preserve visual output |
| index.html:872–890, 1091–1092 | Welcome markup, classic welcome script, work module |
| videos/gateway-hero/welcome.js:15–89 | Slab definitions, state, alpha, full-field DOM updates |
| welcome.js:100–106, 147–186 | Flight tween and welcome timeline |
| welcome.js:112–144, 189–193 | Finish, readiness, interaction acceleration and cleanup |
| videos/gateway-hero/field.js:164–258 | Central orb renderer and layout-triggered drawing |
| field.js:750–834 | Current source-model mapping; use this instead of the partially stale asset README |
| field.js:855–875 | Source loaders and promise cache |
| field.js:891–901 | Geometry cloning, mergeVertices(1e-4), normal recomputation |
| field.js:903–995 | Materials, model cloning, geometry preparation, fitting |
| field.js:1017–1254 | Category renderer creation, loading, loop, focus and disposal |
| field.js:1273, 1395–1424 | Synchronous controller and all renderer construction |
| field.js:2190–2270 | Initial layout, controller API and destroy |
| videos/gateway-hero/work.js:41–63 | createField and prepareOrbitHero |
| work.js:65–135 | Hero entry starts on welcome-finished |
| work.js:138–179 | Lenis, ticker integration, global lag smoothing, anchors |
| work.js:280–327 | Orbit autoplay already waits for welcome-finished |
| work.js:728–764 | Startup, listeners, initial layout and premature readiness event |
| videos/gateway-hero/station-visuals.test.mjs | Existing tests; not sufficient coverage of this live bumper/renderer path |

The site is static HTML/JavaScript. Root package.json currently only exposes `start`, using Python's HTTP server on 127.0.0.1:4174. There is no existing production build pipeline to assume. Add only the reproducible tooling needed for prepared assets and meaningful diagnostics. Keep browser import-map dependencies working without requiring a development bundler to serve the page.

Suggested new files, adapting names to the implementation if needed:

- `scripts/prepare-orbit-models.mjs`: reproducible offline preparation entry point.
- `videos/gateway-hero/assets/models/prepared/`: generated assets and preparation manifest.
- `videos/gateway-hero/orbit-resource-lifecycle.mjs`: small lifecycle/scheduling helper if extraction makes ownership clearer.
- `scripts/profile-welcome.mjs`: opt-in browser diagnostics, no production profiling loop.
- Focused lifecycle/asset verification tests beside the relevant helper or under `tests/`.
- `docs/welcome-bumper-performance-results.md`: before/after measurements and visual evidence.

Keep the existing controller API synchronous where callers depend on it; expose asynchronous readiness separately. Do not turn createField into an awaited promise without updating every caller.

## Work packages and order

Implement WP0 through WP5, then complete WP6. WP1 is the priority and cannot be replaced by completing WP4. WP2 and WP3 form one coordinated lifecycle change and should be verified together. Suggested commit boundaries appear below; committing is optional unless separately requested. Do not leave a half-connected lifecycle as the delivered result.

### WP0 — Establish a reproducible baseline and visual reference

1. Run the site from the repository root with `npm start`, or reuse a verified server already serving this exact checkout. A server rooted in videos/gateway-hero serves a different entry and is not this test target.
2. Capture normal load without `?shot=`. welcome.js removes the bumper when any shot parameter is present.
3. Reproduce with a fresh browser context and with a warm reload. Record browser/version, viewport, DPR, reduced-motion setting, hardware context, cache state, and any throttling.
4. Install diagnostics before navigation: rAF intervals, long tasks, welcome/orbit event times, model preparation timings, and draw/slab update counters. Take one CPU trace. Use HTTP-response instrumentation or test hooks that remain out of production behavior.
5. Frame samples must identify pre-welcome, intro, hold/readiness wait, exit/crossfade, and post-welcome. Distinguish loading time from synchronous execution time. Count actual field passes per ticker frame; counting only gsap.set would miss an implementation that switched to direct writes.
6. Capture references at controlled choreography states: early entry, full slab/title entrance, hold, early exit, partial crossfade, finished hero, each of the six focus states. Include desktop and compact layout. Keep warmup/late model loading visible in diagnostic logs.
7. Establish existing test results before changes: `node --test videos/gateway-hero/station-visuals.test.mjs`. These tests cover an auxiliary visual module and do not prove field.js is correct.

Exit condition: baseline evidence distinguishes model build, first-use shader work, normal slab updates, and crossfade. Do not spend time collecting exhaustive browser matrices before fixing the confirmed bottleneck.

### WP1 — Move existing geometry preparation out of live startup

Default approach: bake the exact geometry processing into prepared assets. Start with the megaphone, then apply to the other currently active sources so recurring preprocessing is removed consistently. Keep runtime material palette transitions intact.

Current critical operation:

```js
const smoothedGeometry = mergeVertices(geometry.clone(), 1e-4);
smoothedGeometry.computeVertexNormals();
smoothedGeometry.attributes.normal.needsUpdate = true;
mesh.geometry = smoothedGeometry;
```

Implementation:

1. Build a local preparation tool using Three.js **0.181.2** and the matching mergeVertices implementation. Use the current field.js source map. Preserve original files. The tool must be rerunnable from documented dependencies, not dependent on an absolute path into an agent's npm cache.
2. Load each source, apply the exact operation once per relevant mesh as the current runtime does, and export prepared GLB assets. A local browser-assisted GLTFExporter tool is acceptable where loader/exporter image or DOM APIs are required. Geometry preparation is offline; do not execute the tool on page load.
3. Preserve source hierarchy, node transforms, index/attribute data, UVs, groups/material assignments, material names and relevant material metadata, side settings, skin/morph information where present, and any clips required by existing behavior. Do not preapply fitModel and then apply it a second time at runtime. Verify that export did not silently drop unsupported information, especially for the FBX handshake.
4. Mark prepared meshes with a versioned preparation identifier in GLTF extras/userData, and write a manifest containing source and output paths, source/output hashes, Three.js version, preparation version/tolerance, and geometry counts. Validate at generation time. Do not hash the large asset synchronously on the browser's main thread.
5. Point current category sources to their prepared assets. Refactor applyOrbitModelMaterials so source-material classification/replacement still runs, but trusted prepared geometry bypasses prepareOrbitModelGeometry. Keep source palette mappings and animation state exactly as before. Avoid a second expensive clone/weld through another path.
6. Do not silently rerun the old megaphone preprocessing on the main thread if a prepared asset is missing or invalid. Prefer an explicit asset error using existing category fallback styling. If a runtime source fallback is retained, offload its heavy geometry work to a worker; test it. The normal shipped build must contain all prepared assets.
7. Compare original-plus-current-runtime-processing against prepared-plus-new-runtime at matching poses, lighting, colors, and focus. Verify bounds and triangle connectivity, not just file size. If vertex/index ordering changes on export, compare equivalent expanded triangle attributes and groups, not raw buffer identity alone. Float attributes must retain Float32-equivalent values or a documented tolerance no greater than 1e-6 for normals/UVs and 1e-6 times max(1, original bounds diagonal) for positions; visual comparison is also required. Do not loosen tolerances to make a failed preparation pass.

Fallback decision: if the exporter cannot faithfully preserve a source, use a prepared geometry-buffer sidecar keyed to that source's stable mesh identifiers and content hash, or a worker that returns transferable geometry buffers. Preserve the loaded hierarchy/material metadata. Document why the default failed and how parity is verified. Do not choose lossy compression, decimation, or visual simplification to reduce implementation effort.

Worker caveats: Three.js objects are not transferable as live renderer objects. Serialize relevant attributes, indices, groups, morph data and metadata, transfer owned buffers safely, reconstruct on the main thread, and avoid detaching buffers still used by another consumer. A Promise, setTimeout, or yielding between models does not move a single large mesh calculation off the main thread.

Validation:

- Prepared source manifest and parity checks pass for all six active categories.
- No unprepared megaphone mergeVertices/computeVertexNormals remains in live startup traces.
- All categories still load, recolor, focus and exit correctly; original assets/licenses remain.
- Remeasure model parsing/build/upload separately. If parsing or fitting is now a new long task, address that evidenced work without declaring the optimization complete merely because one function disappeared.

Suggested commit: `Precompute orbit geometry without changing model appearance`.

### WP2 — Introduce explicit preparation and rendering ownership

Keep all seven views and their visible quality. Introduce lifecycle state so being constructed is not equivalent to continuously rendering.

Recommended view contract (names may vary, semantics must not):

```text
view.ready -> Promise<{ status: 'ready' | 'error', reason? }>
view.setRenderActive(boolean)
view.warm() -> Promise<void>     // one deliberate prepared frame
view.dispose()                  // idempotent, cancels owned work

field.ready -> Promise<{ status: 'ready' | 'degraded', failures: [] }>
field.setRenderActive(boolean)
field.destroy()
```

1. createField must return a usable controller promptly. Create cheap DOM/layout state synchronously; schedule expensive renderer/asset preparation. Maintain stable node/view slots while resources become available. Methods called before a view is ready must retain pending layout/focus state and apply it on attachment, rather than throw or lose updates.
2. Initialize WebGL views in a bounded queue; avoid creating six contexts, six PMREM environments, and the orb environment in one uninterrupted module-evaluation task. Permit network fetches concurrently with a sensible concurrency limit, but serialize expensive attachment/warmup work and yield a browser frame between units. Do not claim that an async function alone makes synchronous PMREM creation preemptible.
3. For each view, configure final lighting/environment/materials, await compileAsync when supported, perform its deliberate warm frame, then settle readiness. Include initial and focused shadow/material variants needed shortly after reveal, without changing the currently displayed model state or firing user-facing focus events. Verify by tracing first reveal and first focus; compileAsync is not a guarantee against texture uploads, geometry uploads, framebuffer allocation, or driver stalls.
4. Measure the largest individual initialization unit. If PMREM generation still causes a long task, prepare/cache an equivalent environment asset offline with the same cube-UV layout, resolution, precision, color space, orientation and mapping, then upload it in the controlled preparation phase. Keep GPU resources owned by their renderer unless compatibility is explicitly established; do not assume separate WebGL contexts share allocations. Do not downgrade the environment to a low-quality replacement.
5. Start recurring category rAF only when active. Make start/stop idempotent; never queue a second loop on repeated activation. No recurring material interpolation, draw calls, or hidden polling is needed for a ready view fully covered by the welcome. Explicit one-shot warmup is allowed and must be identifiable in traces.
6. The central orb does not own the same independent rAF loop as category views; its layout() draws. Gate that draw path too while still storing the newest pose and gain. Warm with a usable nonzero render configuration even if CSS entry opacity is zero. Do not accidentally make readiness depend on a gain threshold that prevents warmup.
7. On reactivation, reset delta-clock bookkeeping. Paused duration must not create an animation jump, large integration step, or completed focus transition when the hero appears. Preserve the desired pose/time explicitly. Keep existing ongoing visible motion timing unchanged.
8. No continuous loops in reduced motion. Its setters may produce deliberate still frames and must still settle readiness. No welcome/shot bypass means views should become active when ready without waiting for an event that will never occur.
9. Dispose queued initialization safely, cancel rAF, ignore/dispose late load results, and remove owned listeners. Prevent late promises from attaching canvases after destroy. Do not double-dispose shared geometry/material resources or dispose a source cache still in use.

Do not introduce general offscreen rendering changes throughout the entire site unless required by this lifecycle. Initial scope is covered welcome work and the handoff. Shadow demand-rendering or renderer consolidation is a later evidence-driven optimization if the above fails; neither is required merely because seven contexts exist.

Validation: fully covered ready views have zero recurring draws; all views warm and activate once; no duplicate loops; no first-focus shader stall; unchanged canvas quality and scene appearance; cleanup works during outstanding loads.

Suggested commit, integrated with WP3: `Prepare orbit views asynchronously and control their render lifecycle`.

### WP3 — Make readiness real and connect the crossfade

The existing xstation:orbit-ready event currently means synchronous setup has returned. Change it to mean all required views have either prepared usable frames or reached explicit existing error fallbacks. Do not make readiness wait on activation while activation waits on readiness.

Successful state sequence:

```text
welcome playing + hero preparing
  -> all views loaded/prepared/compiled/warmed
  -> field.ready settles
  -> prepare final hero layout and dispatch xstation:orbit-ready once
  -> welcome passes existing 'ready' pause
  -> dispatch xstation:welcome-exit-start once; activate prepared hero drawing
  -> existing welcome exit and bumper crossfade
  -> existing xstation:welcome-finished once
  -> existing hero entry and orbit autoplay; start Lenis integration
```

1. Retain the existing welcome timeline structure and ready pause. Replace the unconditional readiness dispatch at the end of work.js with readiness-aware startup. Maintain early hero layout calls where needed for measurement, but never label them resource readiness.
2. Add an explicit exit-start lifecycle callback at the exit boundary after the ready pause and before the bumper fade. Its handler activates already-prepared views. Make this correct in both standard and reduced-motion timelines and under 2.8× input acceleration. Keep existing relative timeline anchors attached to the same tweens; inserting a callback must not accidentally change what `<` refers to.
3. Resume rendering before the first translucent bumper frame. Waiting until welcome-finished would make the handoff expose a blank/stale hero. Avoid deferring compilation/upload to exit-start; it should only activate prepared work.
4. Preserve __xstationWelcomeActive semantics through finish; do not clear it early merely to bypass a draw guard. Render-active is distinct from welcome-active during exit.
5. Preserve current on-finished hero copy/brand/actions entry and orbit autoplay. Starting them at orbit-ready or exit-start would advance the existing animation behind the overlay and change the visible choreography.
6. Use per-view success/error settlement (for example allSettled or status-returning promises) so one failed model cannot keep the pause pending forever. Retain existing is-model-error/fallback classes and normal navigation. Successful assets must all remain visible in normal operation.
7. Provide a bounded failure path for a stalled request or work-module import failure. Default to a named 15,000 ms total preparation deadline measured from welcome startup, not from when a late module finally imports. On expiry, settle as degraded, release the existing bumper, restore document/input state and existing hero copy/nav, and allow successfully prepared views to display. Do not use this as the normal readiness signal. Record a diagnostic reason; no new loading UI or shortened normal hold is needed. If the work module never initializes, the classic welcome-side fallback must reveal the available static page without assuming field APIs exist.
8. After timeout, late successful resources may attach through the same safe lifecycle without restarting the bumper, double-dispatching readiness/finish, changing orbit selection, or adding duplicate loops. Scope cleanup and event ownership explicitly.
9. Missing GSAP and `?shot=` retain their existing bumper bypass. Ensure the lifecycle cannot wait for welcome exit in those cases. Keep any expanded no-op controller methods compatible with callers.

The deadline is an implementation default for failure recovery, not permission to omit models on healthy loads. Test with local assets arriving within the deadline, delayed assets, a 404, and a module failure. If a target healthy network regularly hits it, optimize loading or report the limit; do not conceal it by treating a degraded state as success.

Validation: no readiness before warm/fallback settlement, no deadlock, one exit-start and one finished event, no blank crossfade frame, unchanged hero entry, correct accelerated/reduced/bypass/error paths.

### WP4 — Render the welcome slabs once per tick

Preserve the math and choreography; reduce redundant work.

Current field equations, which must remain equivalent:

```text
progress = (slab.phase + state.t) % 1
x = slab.x + (slab.railX - slab.x) * 0.42 * exit
y = slab.y + (slab.entryY - slab.y) * (1 - intro) - slab.y * 0.22 * exit
z = -1880 + progress * 2500 - (1 - intro) * 110 + exit * 280
scaleX = 0.92 + intro * 0.08 + exit * 0.08
scaleY = 0.82 + intro * 0.18 + exit * 0.46
alpha = alphaAt(progress, slab.peak) * state.fieldAlpha * intro * (1 - exit)
```

1. Keep flight and intro/opacity/exit tweens updating state. Remove their redundant per-tween renderField callbacks.
2. Register one field-render callback after GSAP's root/state updates, using a supported ticker ordering mechanism verified with the pinned GSAP version. Do not add a separate unsynchronized rAF loop. Verify the callback uses the current tick's state rather than introducing a frame of latency.
3. Initialize xPercent=-50, yPercent=-50, force3D, and other invariants once. Cache element references and setters. Prefer one composite transform commit plus opacity/visibility handling per slab; if using GSAP quickSetter for CSS, benchmark the actual implementation. Individual x/y/z setters may reconstruct the transform multiple times and defeat the intent.
4. Preserve the existing transform order/perspective and autoAlpha's visibility-at-zero behavior. No integer rounding of position or altered alpha thresholds. Keep glow in the existing CSS unless a later trace proves a separate issue.
5. Call the initial render synchronously once to prevent an unpositioned first paint. Remove the ticker callback on finish and teardown; avoid any registration when reduced motion creates zero slabs. Ensure an exit-completing tick cannot render detached nodes.
6. Verify wraparound across progress 1→0, accelerated exit, readiness hold, and the final faded frame. Do not change duration/easing to make the test look smoother.

Locked timeline values:

| Motion | Baseline values |
| --- | --- |
| Flight | 8 s, infinite, ease none |
| Field fade-in | 0.46 s, power2.out, start 0 |
| Slab intro | start 0.04 s, 1.05 s, 0.025 s stagger, expo.out, existing sorted order |
| Word intro | start 0.46 s, 1.15 s, 0.11 s stagger from start, power4.out |
| Hold tween | 1.4 s after previous timeline content |
| Word exit | 1 s, 0.09 s stagger from end, power4.in |
| Flight acceleration | timeScale 3.4 over 0.5 s, power2.in, aligned to word exit |
| Slab exit | 1.25 s, power3.in, aligned to flight acceleration |
| Atmosphere exit | 0.85 s, power2.in, existing `<+=0.24` alignment |
| Bumper fade | 0.7 s, power2.inOut, existing `<+=0.38` alignment |
| Input acceleration | timeline timeScale 2.8, current event behavior |
| Reduced-motion welcome | 0.9 s hold, ready pause, 0.6 s power2.inOut fade |

Validation: one complete slab render per GSAP tick, all 34 slabs retained, math/visibility parity at corresponding timeline states, no callbacks after finish. Do not assert 34 gsap.set calls as the target if the implementation no longer uses gsap.set.

Suggested commit: `Consolidate welcome slab rendering without changing choreography`.

### WP5 — Defer smooth-scroll clock integration until welcome finishes

Current smooth() initializes Lenis during the bumper and calls gsap.ticker.lagSmoothing(0), globally. Keep Lenis's eventual synchronization settings; do not remove this call indiscriminately and introduce scroll desynchronization.

1. Initialize/start smooth scrolling once on welcome-finished when a welcome exists. If welcome was bypassed, initialize once through the normal startup path. Audit closures and anchors for any earlier assumption that Lenis already exists.
2. Keep existing Lenis configuration, anchor offset/duration, and ScrollTrigger registration/layout behavior. ScrollTrigger can be registered before Lenis; defer only the work that requires scrolling/clock integration. Do not move mandatory measurements behind an event they themselves are required to release.
3. Replace anonymous unowned ticker/listener callbacks with owned references and an idempotent cleanup function. Remove rAF/ticker callbacks, anchors/listeners, and destroy the Lenis instance on the existing page lifecycle. A gsap.context alone should not be assumed to clean up arbitrary DOM listeners or ticker additions.
4. Preserve the existing welcoming input lock and acceleration until finish. Repeated finish/late-start paths must not construct a second Lenis instance.
5. Do not introduce a custom clock, cap flight speed, or alter easing as the first implementation. Verify the welcome has not inherited another global lag-smoothing override. Clock smoothing mitigates visible catch-up after severe interruptions; the primary frame-budget work must still be fixed.

Validation: Lenis does not set global lag smoothing during welcome; scrolling/anchors work immediately after finish; no duplicate tickers; accelerated input remains correct; reduced-motion and missing-Lenis paths work.

Suggested commit: `Coordinate welcome handoff and smooth-scroll startup`.

### WP6 — Verify the final integrated result and report limits

Add meaningful tests for the risky changes, not snapshots of source spelling or tests that merely repeat implementation formulas.

Automated checks:

- Prepared assets: manifest consistency, expected active category coverage, original files retained, no double preparation, equivalent geometry attributes/groups/bounds/material metadata, visual parity.
- Lifecycle: prepare/warm/activate ordering, activation twice yields one loop, reduced-motion still frame, delayed readiness, individual failure, 15-second deadline, late arrival after timeout, destroy during pending preparation, no recurring work after dispose.
- Integration: normal page reaches finished with six successful category assets; exit-start precedes crossfade exposure; ready cannot fire before prepared/fallback state; no duplicate events; bumper and input lock removed; bypass paths do not hang.
- Rendering: one field pass per GSAP tick; fully covered prepared hero has no recurring draws beyond explicit warmup; seven views exist in successful normal operation; no visible shader/upload hitch has merely moved into first focus.

Browser matrix:

| Scenario | Verify |
| --- | --- |
| Desktop, normal load | Full bumper, hold, crossfade, hero entry, six-category autoplay/focus |
| Desktop, input during intro/hold/exit | Pointer, wheel, touch emulation, keyboard acceleration; no stuck pause or duplicate finish |
| Compact viewport, e.g. 390 × 844, DPR 2/3 | All 34 slabs and all models retained; no clipping/layout regression |
| Reduced motion | Zero welcome slabs as before; static hero draws settle; normal release |
| Delayed model, 404 model, stalled request | Truthful wait/fallback; readable page and working navigation; no permanent lock |
| work.js/Three dependency fails | Classic welcome fallback releases the page |
| No GSAP, shot mode | Existing bypass behavior; no lifecycle deadlock |
| Resize or tab hide/show during preparation/exit | No lost pose, duplicate loop, stale timing jump or crash |
| Leave page/destroy during outstanding load | No late DOM attachment or leaked owned loops |
| Post-welcome scroll/anchors/products | Lenis, ScrollTrigger, labels, focus, project videos and later content preserved |

Performance protocol:

1. Compare the same baseline and final build on the same machine/browser/viewport/DPR. Use fresh contexts for cold loads and a defined warm-reload procedure. Run sequentially, with unrelated heavy tasks minimized. Capture at least three cold and three warm runs for baseline/final if feasible; report unavailable conditions rather than fabricate results.
2. Use clean, minimally instrumented runs for frame-gap timing and separate instrumented traces for attribution. Test on normal hardware first; optional CPU throttling is stress testing, not a substitute for a real mobile device.
3. Record maximum rAF gap, counts over 25/50/100 ms, long-task stacks and durations, prepared-asset/build/compile/warm times, readiness time, time spent at the ready pause, finish time, and first-focus behavior. Report phase-specific values. Record draw/update counts in a separate diagnostic run.
4. Primary acceptance: the roughly 1.1-second megaphone preprocessing stall is absent; no runtime main-thread rebuild of prepared geometry; no equivalent long task shifted to reveal/focus; one slab pass per tick; covered views stop recurring draws; zero normal-path model omissions.
5. Target on the matched desktop setup: no repeatable application-owned task over 50 ms during visible welcome/exit, p95 rAF interval at or below 20 ms on a 60 Hz run, and no repeated gaps over 50 ms attributable to application work. Keep max-gap/tail metrics even if p95 passes. For a 120 Hz device report against its 8.3 ms cadence; do not hardcode a universal 60 FPS claim.
6. Compare readiness/finish time too. Eliminating a freeze by adding a long artificial hold or revealing before assets are ready is not success. Preserve the existing timing when assets are ready; the genuine readiness wait may differ on cold/slow loads and must be reported explicitly.
7. Confirm in a headed desktop browser and, when available, real mobile Safari/Chrome. Headless emulation does not establish physical-device smoothness. If unavailable, finish the authorized work, report the remaining verification gap, and do not claim those platforms passed.

Visual verification:

- Compare corresponding animation states, not identical elapsed wall times when readiness differs.
- Confirm word positions, slab distribution/phase, perspective, glow, opacity, atmosphere, crossfade and full hero entry.
- Compare each model at idle and focus, including shadow, color transition, highlight, silhouette and orientation. Prepared geometry must not flatten or alter the established shading.
- Inspect first reveal and first category focus frame by frame for blank canvases, delayed shadows, shader pop-in or a frozen-to-moving jump.
- Distinguish antialiasing noise from geometry/material changes; do not accept a screenshot metric alone as proof of visual fidelity.

Run the existing tests again, all new focused tests, syntax/tooling checks appropriate to changed files, and `git diff --check`. No install/build/test command for a framework absent from this repository should be invented. If tools were added, document their install/run commands and pin relevant dependencies.

## Delivery requirements

The executor should deliver:

1. The integrated implementation and reproducible prepared assets/tooling.
2. Meaningful tests and exact local commands to rerun them.
3. A results document with baseline/final conditions, measured frame tails, model preparation times, lifecycle/draw evidence, visual comparisons and material limitations.
4. A concise handoff explaining what changed, what was preserved, what passed, and any remaining evidenced bottleneck or untested device.

Do not declare completion based on smaller setter counts or passing station-visuals tests alone. If a remaining initialization/upload unit still causes visible stalls, use the trace to reduce that work within the preservation constraints before handing off; document any technical limit that could not be resolved. Do not expand into a full renderer rewrite without evidence that the planned changes are insufficient.

## Reference documentation

- [GSAP quickSetter](https://gsap.com/docs/v3/GSAP/gsap.quickSetter()/): optimized repeated updates; verify composite-transform behavior rather than assuming every setter arrangement is faster.
- [GSAP ticker](https://gsap.com/docs/v3/GSAP/gsap.ticker/): ticker order and lag-smoothing semantics.
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html): compileAsync, resource and renderer behavior. Check against pinned 0.181.2 source when current docs differ.
- [Browser animation performance guidance](https://web.dev/articles/animations-guide): distinguish scripting/layout/paint/compositing instead of assuming transform animation has no cost.

## Copy-and-paste delegation prompt

> Implement docs/welcome-bumper-performance-plan.md in this repository. Preserve all existing page visuals and behavior, including every slab, glow, model, shadow and animation. Prioritize the measured megaphone geometry-processing stall; slab-loop cleanup alone is insufficient. Follow the preparation/readiness/render lifecycle and verify the crossfade, normal/reduced/accelerated/error paths. Reproduce baseline and final measurements, use corresponding-state visual comparisons, and document results in docs/welcome-bumper-performance-results.md. Do not stop at a plan, claim untested device results, or deploy/publish. Preserve unrelated worktree changes and report any evidenced limitation honestly.
