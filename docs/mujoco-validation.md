# Shared MuJoCo web implementation — measured status

Implemented on 2026-10-12, initially as `?lab=mujoco` and adopted as the sole visible simulation route for Jumper and MicroDuck on 2026-10-13. All MuJoCo simulation work runs in the browser. Python is used only to prepare pinned resources and generate independent test references.

## Available targets

| Target                   | Educational palette                                                | Advanced behavior / scope                                                                                                    |
| ------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `jumper-web-joint-probe` | Separate advanced joint experiment                                 | Named joint position in radians, fixed base and disabled contacts                                                            |
| `jumper-web-walking`     | Advance by steps/metres; left/right 90° turns; wait; finite repeat | Timed forward 0–0.24 m/s and zero-velocity balance; no turns or reverse                                                      |
| `microduck-mujoco-web`   | Advance by steps/metres; turn left 90°; wait; finite repeat        | Existing timed forward/yaw requests remain available; reverse and right turns from rest are not reliable educational actions |

The interface uses the existing block provider and runtime, including compiled program identity, source-block highlighting, exclusive ownership and observed completion. The diagnostic panel records execution identity and measured command results. Editing invalidates the old result; edits during a run wait for cancellation acknowledgement before enabling another run. A timed velocity command completes after its interval has been physically simulated; it does not claim exact velocity tracking. **Detener** pauses physics and cancels work; a zero-velocity block preserves active balance control. Changing robot disposes the old worker and renderer. The main editor stores independent programs and the latest MuJoCo result per robot/simulator destination in the existing local project document. Export/import includes these variants, source identity, model revision and measured command traces. Reload never restores a live session: active records become interrupted. The standalone lab remains an in-memory test harness.

The normal editor opens MuJoCo directly for both robots. Old MicroDuck sources and evidence are retained on migration; unsupported actions remain blocked. The archived iframe and native reference UI require an explicit internal build configuration. New heavy packages are optional at runtime and are not fetched by the default route. No hardware capability is enabled.

## Numerical evidence

Test system: macOS 26.3 on arm64; Chrome **154.0.8037.98**, Python **3.12.12**, MuJoCo native/WASM **3.11.0**, ONNX native/web **1.27.0**. No noise/randomization is added to these deterministic scenes. Tests use single-thread WASM.

| Check                                                  | Observed result                                                                                        | Interpretation                                                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Jumper joint probe, 3 × 60 simulated seconds           | Finite state; maximum native/WASM joint difference **7.64×10⁻¹³ rad**                                  | Strong agreement for this isolated scene; not contact/balance validation                                       |
| Jumper controller, 24 reference frames / 18 inferences | Observation and target differences **0**, no mode mismatches                                           | Shipped native and WASM controllers reproduce the bundle vectors                                               |
| Jumper ONNX, identical recorded observations           | Maximum native/web action difference **4.77×10⁻⁷**                                                     | Within declared float32 tolerance                                                                              |
| Jumper free-base walking, 60 s web                     | **2.090 m** during the 10 s movement window; subsequent drift after 20 s **0.108 mm**                  | Passed the predeclared advance/height/stop gate                                                                |
| Jumper walking, short native comparison                | Position difference at 1 s **1.54 µm**                                                                 | Below the declared 0.1 mm threshold                                                                            |
| MicroDuck, 60 s web                                    | Finite state; minimum sampled height **0.115 m**; approximately **2.115 m** in the 20 s walking window | Functional gait with substantial velocity tracking error: requested 0.25 m/s, measured average about 0.106 m/s |
| MicroDuck ONNX, 6 identical native observations        | Maximum action difference **1.35×10⁻⁷**                                                                | Within declared tolerance                                                                                      |
| MicroDuck physical comparison                          | **2.09 µm** position difference at 1 s; **11.14 cm** final position difference at 60 s                 | Short-horizon gate passes; long-horizon parity is not established                                              |
| MicroDuck withdrawal of motion                         | Approximately **0.177 mm** drift over the final 15 s after settling                                    | Steady zero-command balance in the tested scene                                                                |

Raw evidence: [shared numerical tests](evidence/mujoco-browser-validation.json), [Jumper native walking probe](evidence/jumper-locomotion-native-probe.json), [Jumper web walking](evidence/jumper-walking-browser.json), [UI lifecycle checks](evidence/mujoco-ui-validation.json), [source-edit invalidation](evidence/mujoco-editing-validation.json), and [static build checks](evidence/mujoco-production-validation.json). The UI report records its exact run time and tested commands. Screenshots are generated under `output/mujoco/` and are supplemental to numeric evidence.

The direct numerical harness ran 60 s of MicroDuck simulation in about 0.69 s and 60 s of Jumper walking in about 4.92 s on this machine. These are accelerated headless computation timings, **not** interactive FPS or cold-start measurements. MicroDuck inference p95 was about 0.1 ms; p50 fell below the timer's resolution. Interactive performance is measured separately below.

## Educational movement goals — 2026-10-12

New destination workspaces start with simple blocks. Jumper advances one BotLab step (0.5 m) and waits; MicroDuck advances, turns left and waits. Existing saved timed-velocity programs are preserved and their block lives in the localized **Advanced** category. The panel invites prediction before running, then shows observed movement alongside the requested goal. This is functional acceptance of the learning workflow, not a study of learning outcomes.

The worker measures signed net forward displacement projected onto the heading at the start of the action, after 1 s of balance preparation. It does not count lateral body sway as distance. Turns accumulate signed heading increments through ±π. Completion requires a final error within 2.5 cm or 5° and 0.8 s with zero intent while remaining within that band. Timeout, stalled motion and excessive overshoot fail visibly instead of declaring success. Cancellation, editing, reset and disposal retain worker ownership. These are approximate physical movements; straight-line path tracking and exact positioning are not guaranteed.

[Physical goal evidence](evidence/mujoco-educational-validation.json) passes 13 sequential objectives using the real pinned models/controllers: Jumper distances 0.5, 1, 0.1 and 0 m; MicroDuck two 0.5 m advances interleaved with left turns, further left turns of 180°, 45° and 360°, then 0.1 and 0 m. The numerical controller accepts these left-turn goals; the learner palette currently exposes the familiar 90° left block. All completed within the above tolerances. The largest observed forward error was approximately 1.1 cm and the largest turn error 4.4°. This accelerated harness is not a frame-rate test.

The forward controller uses its validated walking speed until the measured stopping threshold: smaller intents could leave MicroDuck stationary before reaching a short goal. No policy weights or physics parameters were changed. [The right-turn probe](evidence/mujoco-educational-right-turn-probe.json) records a stalled right turn after advance/left-turn/advance. Additional isolated trials at yaw −0.5, −0.75 and −1 rad/s also stalled from rest. This narrows the earlier long-run result: turning right while already moving did not establish reliable right turns from a settled stance. The educational palette therefore withholds right turns and reverse, and the adapter rejects measured right-turn commands; no opposite-direction turn is substituted.

The compiled editor’s Chrome 154, Firefox 151 and Playwright WebKit 26.5 acceptance runs confirm measured goals, the observed/goal display, export/import and reload, source-edit cancellation and per-robot project continuity. The unit suites for the app, blocks, both adapters and shared engine pass, as do relevant TypeScript/lint checks, 13 architecture probes and the app build with its dependencies. Existing lint warnings are unchanged.

Short importable projects: [Jumper first steps](../examples/jumper-mujoco-first-steps.botlab.json), [MicroDuck first steps](../examples/microduck-mujoco-first-steps.botlab.json). Import creates a new project; it does not rewrite the learner's current program. Reproduce the physical goals with `test:mujoco:educational` on the Vite development server and the complete UI with `test:mujoco:workbench` on the compiled preview.

## Extended movement

[Long-run physical evidence](evidence/mujoco-motion-validation.json) adds three deterministic repetitions of each importable program. Jumper runs for 190 simulated seconds with 27 commands: sustained walking, slower walking, acceleration and stops. MicroDuck runs for 195 seconds with 32 commands: forward, attempted reverse, turns in both directions, curves and stops. Every physics substep is checked against the controller's height/tilt envelope. All straight positive commands must advance at least 5 cm in the initial body heading; each turn must rotate at least 0.1 rad in the requested direction. Heading is accumulated without wrapping, so turns beyond 180° remain meaningful.

| Physical rollout     | Minimum root height | Maximum body tilt | Integrated XY root path | Controller/inference p95 |
| -------------------- | ------------------: | ----------------: | ----------------------: | -----------------------: |
| Jumper, 3 × 190 s    |           0.10097 m |             1.87° |                28.569 m |               0.1–0.2 ms |
| MicroDuck, 3 × 195 s |           0.11357 m |             4.94° |                19.993 m |                   0.1 ms |

These are accelerated stability/direction tests. Integrated root path includes body oscillation and is not net forward progress; it also depends on sampling frequency. The long-run harness accumulates heading increments to measure full turns; timed-velocity session results retain the shortest signed `yawRadians` change for compatibility, whereas the new measured-turn results carry unwrapped yaw and `targetYawRadians`. The timings measure controller work in this harness and are not interactive rendering timings. All three repetitions yield the same physical trajectory without randomization.

**Measured limitation:** MicroDuck's −0.2 m/s commands produce only about 2.2 mm total endpoint displacement over eight seconds, with less than 1 mm projected backward travel. The report explicitly records `backwardMotionObserved: false` against a 1 cm observation threshold. Completing that timed block means its interval was physically simulated, not that reverse walking succeeded. The UI now states this limitation in Spanish, Catalan and English. The example retains these commands as visible probes; no policy weights, velocity limits or coordinate mappings were changed. Forward and both turn directions pass the gates in that sustained sequence; the educational tests above separately expose the right-turn limitation from rest.

Both programs can be imported from `examples/*-mujoco-motion.botlab.json` through Projects without replacing existing projects. Infinite walking floors now remain under the following camera, with a 10 cm grid anchored to world coordinates. The grid is visual only and does not alter physics.

## Interactive performance

The [before](evidence/mujoco-performance-before-pacing.json) and [after](evidence/mujoco-performance-validation.json) runs use the static editor on an **Apple M2, 8 cores, 16 GiB RAM**, Chrome **154.0.8037.98**, ANGLE Metal. Both record video at 960 × 640 from a 1600 × 1000 viewport. The earlier loop restarted its timer after each control interval, accumulating browser timer delay: drawing stayed near 60 FPS while physics advanced at only 0.763× / 0.766× real time. The corrected wall clock preserves fixed physics steps and every inference, absorbs jitter with at most four control intervals per callback, yields after 8 ms of work, and discards excessive backlog after suspension. Pause/resume starts a fresh wall clock. It does not skip physics or policy decisions to appear faster.

| Main editor, complete program  | Cold HTTP-cache load | Warm load, median of 3 | Draw frames/s | Distinct physics frames/s | Simulated / wall time | Retained heap change across 5 disposal cycles |
| ------------------------------ | -------------------: | ---------------------: | ------------: | ------------------------: | --------------------: | --------------------------------------------: |
| Jumper, 190 s / 27 commands    |               8.88 s |                 8.88 s |         60.00 |                     28.26 |               0.99991 |                                    +0.287 MiB |
| MicroDuck, 195 s / 32 commands |               6.48 s |                 6.85 s |         60.00 |                     24.99 |               1.00004 |                                    +0.293 MiB |

Both programs complete with saved physical measurements. All ten post-run load/close cycles leave zero workers. Main-renderer heap after collection remains around 31.2–31.5 MiB for Jumper and 49.4–49.7 MiB for MicroDuck. Summed Chrome RSS after disposal ranges from 1192–1227 MiB and 1246–1251 MiB respectively; the largest sampled total during loading/running is about 2055 MiB. RSS sums shared mappings across browser, renderer and GPU processes, so these are **not** private allocations attributable solely to the simulator. Heap measurements include the test's retained telemetry samples. This finite run shows no sustained material growth in the measured disposal window, not proof against every leak or a multi-hour memory plateau.

Draw cadence counts WebGL submissions in headless Chrome, not physical display presentation. Physics snapshots are published less often than drawing; 60 draw frames/s does not mean 60 distinct robot poses/s. Recording and periodic garbage collection are included in this workload. Cold means a fresh context and cleared HTTP cache, not a cold OS or rebooted device; warm reloads still rebuild the worker/model/controller and do not improve materially here. Load-phase attribution remains unprofiled.

The predeclared acceptance gates pass: at least 30 draw frames/s, real-time factor 0.95–1.05, full command completion, minimum physical path, zero workers after closing, and less than 16 MiB retained main-heap growth per five-cycle series. Full recordings and shorter real-speed previews are under `output/mujoco/`; their data is local to this test run. Performance evidence currently covers this Chrome/M2 configuration only.

## Bounded repetition and first activity — 2026-10-12

BL-001 and BL-002 add `control_repeat` to both walking palettes and an importable [Jumper](../examples/jumper-mujoco-repeat.botlab.json) / [MicroDuck](../examples/microduck-mujoco-repeat.botlab.json) activity. Follow [the learner instructions](../README.md#actividad-repite-avanza-y-observa): predict three 0.5 m advances and three one-second waits, run, compare, then change the count to two and explain the difference. This is technical acceptance of the activity, not an evaluation with students.

The model retains structured repeat bodies. The parser and shared adapter expansion enforce literal whole counts 0–100, depth 16, 256 source blocks and at most 256 expanded steps. Source IDs are unique in the source tree; every expanded command has a distinct ID plus its original block and complete outer-to-inner iteration path. The whole source is validated before lowering, including zero-count bodies and unsupported robot actions. Empty bodies have cancellable zero-duration wait checkpoints; those checkpoints count toward the expansion budget. Zero iterations skip the body, and a program with no remaining commands returns `no-work` with no physical evidence. It does not start physics from a paused scene. Existing timed velocity and measured first-steps programs keep their units and semantics.

The panel highlights the current block and shows its iteration in Catalan, Spanish or English. Result rows distinguish each invocation of the same source block; total advance sums the projected progress of completed distance commands and their goals, excluding balance drift during waits. JSON persistence preserves up to 256 measurements with command/iteration identity and still accepts old traces without those optional fields. A zero-count result also survives reload without starting a worker.

[Production acceptance](evidence/mujoco-repeat-production-validation.json) used Chrome 154.0.8037.98, the actual MuJoCo/ONNX workers and pinned prepared assets. Each advance must be within 0.025 m of its goal. Observed totals:

| Robot     | 3 repetitions: goal 1.5 m | 2 repetitions: goal 1 m |
| --------- | ------------------------: | ----------------------: |
| Jumper    |                1.468678 m |              0.980052 m |
| MicroDuck |                1.498148 m |              0.998394 m |

Both robots additionally passed a 2×2 nested program with four measured 0.1 m advances; empty-body checkpoints; zero count without advancing the paused physical clock; stopping during iteration two with no third-iteration dispatch; editing during execution with cancellation and invalidated results; over-budget rejection before physics; separate iteration result rows; completed-result reload and JSON export/import; legacy first-steps execution; and worker disposal. The browser reported no errors. The maintained command is `corepack pnpm run test:mujoco:repeats`, with `BOTLAB_TEST_URL` for a development or static-build origin. Screenshots under `output/mujoco/repeat-*.png` were visually inspected.

The four affected library suites and the web application's 130 tests pass, along with all configured TypeScript checks, affected-project lint, the 13 architecture checks and the app/dependency production build. Parser/model cases cover invalid and fractional counts, unsupported expressions/statements, zero-body validation, duplicate IDs, depth and expansion limits; storage cases cover legacy traces, bounds and malformed iteration metadata. Initial browser attempts exposed an asynchronous save-read race in the acceptance script (now awaits the persisted status) and a transient development load timeout. The complete [development run at `https://botlab.localhost`](evidence/mujoco-repeat-validation.json) subsequently passed the same cases for both robots without browser errors; the timeout was not reproduced in that final run. A [final build smoke check](evidence/mujoco-repeat-final-build-validation.json) also loaded the verified assets, worker and controller and stepped physics for all three targets after the panel layout adjustment. The production acceptance above remains a separate complete run.

## Compatibility and lifecycle

The main-editor acceptance runs on 2026-10-12 exercised [Chrome 154](evidence/mujoco-workbench-validation.json), [Playwright Firefox 151](evidence/mujoco-workbench-firefox-validation.json) and [Playwright WebKit 26.5](evidence/mujoco-workbench-webkit-validation.json) against the static production build, including the revised simulation clock and floor rendering. WebKit testing is not a Safari product validation. All three destinations completed real programs. Per-destination XML and measurements survived robot/backend switches, project switches, JSON export/import and reload. Restored sessions had zero workers; reloading a running program marked it interrupted. Editing during execution cancelled and paused before selectors were enabled. The default editor requested no engine assets. The implementation reuses the lab's panel and worker stack.

Import acceptance exposed late notifications from a replaced Scratch editor. Mount generations now reject stale callbacks, prevent duplicate pending mounts and dispose handles that arrive after unmount. Both the actual import flow and an asynchronous provider regression test cover this fix. The web app's 127 tests, blocks tests, applicable TypeScript checks, lint, 13 architecture probes and the production build pass for this integration.

The Projects dialog now covers create/open/rename/duplicate/export/import and confirmed deletion, preserving at least one project and the existing 50-project limit. Import creates a new project and leaves previous documents unchanged. The real-browser check specifically imports into the same MuJoCo destination after creating a blank project: synchronizing React project state and XState source updates prevents a transient write to the previous project or loss of the imported result. Automated checks cover rejected storage writes and cancelled deletion. All three browser runs verified modal focus containment, Escape/focus return, a 390 px layout, saved results and zero workers after hydration. Desktop and narrow-screen screenshots were inspected. Jumper now exposes one MuJoCo simulator, with fixed-body joint testing under Advanced options; physics capabilities are unchanged.

| Surface                                            | Status                                                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Chrome 154, macOS arm64                            | Real workers, WebGL, ONNX and MuJoCo tested                                                                                        |
| Static Vite build                                  | All three targets loaded verified resources, initialized their workers/controllers and stepped successfully                        |
| Target lifecycle                                   | Ten switches with exactly one live worker, zero after close; pause, reset, cancellation and source-block execution tested          |
| Native services                                    | Not used by the new route; explicit request-count check in UI script                                                               |
| Playwright Firefox 151, macOS arm64                | All three programs and the complete project workflow passed against the static build                                               |
| Playwright WebKit 26.5, macOS arm64                | All three programs and the complete project workflow passed against the static build                                               |
| Safari application                                 | Pending; the WebKit result does not establish Safari product compatibility                                                         |
| Physical mobile devices / WebGPU / multithreading  | Pending and not required by this first implementation                                                                              |
| Persistent memory profiling                        | Chrome/M2 heap and process RSS measured during both long programs and ten disposals; longer soaks and other devices remain pending |
| Full Scratch programs / complete physics snapshots | Out of this bounded sequential editor integration                                                                                  |
| Hardware / sim-to-real                             | Not tested                                                                                                                         |

## Asset and scene findings

[Preparation inventory](evidence/mujoco-upstream-audit.json) records revisions, hashes and inspected artifacts. It is distinct from executed evidence. Jumper's original CAD XML produced ten overlapping internal contacts at its home pose; using it unmodified prevented the joint from reaching its target. The joint probe therefore explicitly disables contacts.

For walking, BotLab runs the official pinned exporter and keeps its collision masks, contact parameters and solver settings. The exporter uses a 5 ms generic physics setting, while the distributed locomotion contract specifies 1 ms physics / 5 ms control. The derived walking scene explicitly selects the bundle timing and is tested against native MuJoCo before browser exposure. Gains come from the controller every control interval; the measured torque-speed and thermal curve is applied each physics step. The 22-wire-joint mapping and 20 policy actions remain distinct.

MicroDuck's source XML and walking policy are byte-identical to the pinned existing simulator reference. Its body-frame observation, home-pose float32 rounding, previous actions and four physics substeps per inference reproduce that reference's semantics. Speeds such as 0.15 m/s may produce very little motion with this policy; the example uses the measured 0.25 m/s command. This is recorded behavior, not an exact tracking guarantee.

Repository license notices travel with prepared resources. Generated weight redistribution remains a separate review; nothing has been published. All binaries and source checkouts remain in ignored cache directories.

## Phase outcome

Repository checks passed: all 27 configured test/lint tasks across 14 projects, all application/library/specification TypeScript checks, 13 architecture import probes, and the web build with its 13 dependent library builds. The editor callback regression has an additional unit test and a real-browser edit/cancel/rerun check. Existing lint and build warnings remain non-blocking.

The movement/performance follow-up also passes the app's 127 tests, the shared engine's nine tests (including clock drift, bounded catch-up and pause reset), relevant TypeScript/lint checks, 13 architecture probes, the web build with its dependent libraries, and the complete editor workflow in Chrome, Firefox and WebKit. Direct test harness access to internal physics/controller code is scoped to the dev-only numerical module; production boundaries remain enforced.

P0–P5 have executable implementations and Chrome evidence, including a real Jumper policy rather than a placeholder. P6 has a second real robot on the same generic worker/world/renderer and a separately owned controller. Its limited flat-ground behavior is observable and cancellable. The long programs and first Chrome/M2 performance measurements are complete. Safari, physical mobile devices, the rest of the performance matrix and the decision to replace any existing simulator remain open under [proposed ADR 0003](adr/0003-shared-browser-mujoco.md).

[Reproduction commands](../tools/mujoco/README.md) describe setup, pinned preparation, unit tests, native comparisons and browser checks. These results apply to those artifacts and scenarios only.

## Next implementation steps

Current priorities and task status are maintained in [the project task register](next-steps.md): BL-001–BL-005 cover educational repetition and activities, MicroDuck movement limitations, Jumper turning and the performance matrix; BL-006 tracks the backend adoption decision. Keep the measured results and limitations in this report and update the register when new evidence changes a task. This avoids maintaining competing next-step lists across sessions.

## MicroDuck directional investigation — 2026-10-13

BL-003 compares the pinned alpha walker from rest and immediately after forward motion. The [browser probe](evidence/microduck-directions-probe.json) uses the real MuJoCo/ONNX controller, three reset runs per timed scenario, 1 s initial balance, an optional 8 s advance at +0.25 m/s, 20 s of the requested direction and 2 s of zero command. It records signed projected displacement, unwrapped yaw and balance checks at every physical substep. Separate measured ±90° goals compare rest with a completed 0.5 m advance; those goals include the normal balance/settling phases. These are different starting conditions from immediately switching velocity during walking.

The [independent native probe](evidence/microduck-directions-native-probe.json) uses native MuJoCo and ONNX Runtime, the same prepared scene, float32 home pose and pinned weights. It does not use the browser observation builder or goal tracker. Native/WASM long trajectories are not expected to be numerically identical, and these tests do not establish hardware behavior or an exhaustive policy operating envelope.

### Browser measurements and cancellation

Chrome 154.0.8037.98 completed 36 timed rollouts (12 scenarios × 3 resets) with no balance-envelope violations or page errors. Repeats were deterministic in this environment. Selected 20 s results:

| Command                   | From rest                       | Immediately after 8 s forward                               |
| ------------------------- | ------------------------------- | ----------------------------------------------------------- |
| Right, yaw −1             | −12.56°                         | −740.16°                                                    |
| Right, yaw −0.75          | −9.86°                          | −637.34°                                                    |
| Right, yaw −0.5           | −6.06°                          | −423.64°                                                    |
| Reverse, vx −0.2          | −0.634 mm projected; +0.78° yaw | +68.77 mm projected; −177.29° yaw; 1.176 m net displacement |
| Left control, yaw +1      | +419.23°                        | +418.48°                                                    |
| Forward control, vx +0.25 | +2.056 m projected              | +2.205 m projected                                          |

Large timed rotations establish a response while already moving, not accurate angular stopping. The measured right −90° goal stalled after 11.765 s from rest and after 13.190 s when preceded by a completed 0.5 m goal. Both reported failure, without completed evidence. Left +90° completed at 90.06° and 86.57°, within the existing ±5° tolerance. Distance goals retain ±2.5 cm tolerance; reverse is not an accepted measured-distance command. Twenty seconds of near-zero or strongly curving motion do not support adding that capability.

Across the timed browser runs, minimum root height was 0.113603 m and maximum tilt 0.073674 rad (4.22°), inside the controller limits of 0.065 m and 60°. The independent native runs stayed inside the same envelope. Thus the failures here are insufficient/unreliable directional tracking, not falls.

Real-worker cancellation was tested separately for a negative measured turn and a timed reverse command. Both rejected as cancelled at tick 404 (2.02 simulated seconds), remained paused with identical tick and root position after 500 ms, and disposed to zero workers. This is a simulator pause, not proof of a hardware stop or passive balance after power removal. Zero-command balancing in the numerical scenarios is recorded separately.

The investigation completed successfully (`probeCompleted: true`); right-turn capability did not pass. All 28 MicroDuck adapter tests passed, including rejection of negative measured distance and right turns. Probe syntax, JavaScript lint and scoped formatting were checked. Production code was unchanged, so this increment did not require a new production build.

### Contract audit and interpretation

The upstream browser revision `023172c8a7d629b5258d90364c13bafe013abbfa` (`app/src/game/game.js`, `constants.js`, `controls/keyboard.js`) and model revision `363b7effd4eae9f24dd1bb8bf647aef4d74edca9` (`scripts/infer_policy.py`) agree with the integration: gyro, projected gravity, relative joint positions, velocities, previous action, then `[vx, 0, yaw]` and ten zero command slots; action scale 1; four 5 ms physics steps per inference. Right is negative yaw, reverse negative vx. The policy hash remains `e36332d383997d51401897734cd3e79cf5038406feddb18b4d57ecfb141daa6c`, revision `916c1e1ee11f8460506532e037a4cf1aa110aca6`. Local upstream files were inspected without changing them; the existing iframe integration changes do not alter this observation/action contract.

The observed limitation depends on the controller/physical state, not just the requested sign. The native check also produces only −0.219 rad (−12.55°) for right from rest in 20 s, and −0.636 mm projected reverse displacement. Immediately after walking, native right reaches −12.97 rad, while reverse has −0.134 m projected progress but 1.223 m net displacement and −2.823 rad yaw: this is not a straight backwards movement. The browser comparison and measured goals below determine the exposed capabilities. No sign inversion or mapping discrepancy was found; this investigation does not identify a particular training defect or prove that no different policy could support the actions.

No corrective advance, opposite full-circle turn, weight change, or physics change was introduced. Right turns and backwards distance remain unavailable as simple educational blocks. Advanced timed commands remain probes whose elapsed duration is not proof of achieving a distance or angle.

Reproduce with the [directional probe commands](../tools/mujoco/README.md#microduck-directional-investigation). The existing adapter tests retain rejection of negative measured distance and right-turn goals.

## Jumper quarter turns — 2026-10-13

BL-004 adds measured left/right 90° blocks to Jumper's simple palette after validating the pinned controller's input mapping and stopping behavior. Other angles, reverse, strafe and mixed timed forward/yaw remain unsupported. MicroDuck's restrictions are unchanged. The [importable activity](../examples/jumper-mujoco-turns.botlab.json) advances 0.5 m, then repeats a left and right quarter turn twice.

### Mapping and approach selection

The pinned locomotion contract (`operator_controller/2`, controls hash `a70239319ad99a853a12bac571b79599f936c4f9a7f3a1930b07ac08338a44d3`) uses Rx with sign −1. Its yaw travel is `[0.5, 1]` and angular range `[−4, 4]`; the inner stick band controls posture twist. Therefore signed 1 rad/s maps to Rx ∓0.625, not ∓0.25. The [independent native check](evidence/jumper-turns-native-probe.json) confirms observed velocity commands of ±1 rad/s, posture twist ±0.261799 rad, correct turn direction and stable zero-command settling, from rest and after advance. That coupled posture behavior is retained from upstream. This is a native/WASM qualitative comparison, not long-horizon numerical parity.

The [initial tapered-goal probe](evidence/jumper-turns-probe.json) ran three resets for each direction/start condition. Nine of twelve turns stalled near ±85°; only the left turn after forward completed. Merely preserving signed 1 rad/s was insufficient: the [fixed-speed pilot](evidence/jumper-turns-fixed-probe.json) recorded six successful rest cases and a failed left turn after advance, then was interrupted by a development-page navigation. It is an incomplete experiment, not acceptance.

A [four-case pilot](evidence/jumper-turns-center-probe.json) passed after moving the braking band from 2.25° to 0.5° while retaining constant signed 1 rad/s until stopping. The final tolerance remains ±5° for 0.8 s; it was not widened. This per-controller choice is exposed internally as `turnProfile: constant` and `turnStopFraction: 0.1`; shared defaults preserve MicroDuck's approach. A separate [2 rad/s pilot](evidence/jumper-turns-pure-yaw-probe.json), in the upstream stick region without posture twist, also passed its four isolated cases, but was not selected or enabled: the final sequences and worker acceptance validate the slower 1 rad/s profile.

No policy weights, joints, servo law, physics timestep or inference frequency changed. Model revision remains `78966f45de6f2b6de3f7cea017f32a39f8b993e6` and controller bundle revision `ce71f79b191766f0208dca34516564a37816c729`. Only the manifest's human-readable limitation changed; its new pinned SHA-256 is `aeec1ff2435981ccff8cf426c732ea34141bcbbb65cc505dcf2fe2fa9b4d41f1`. Re-run walking preparation when updating an older asset cache.

### Acceptance and limits

The [final numerical/worker acceptance](evidence/jumper-turns-validation.json) completed 20 turns and two measured 0.5 m advances across consecutive same-direction and alternating sequences, before and after advancing. Maximum angular error was 4.575°; minimum height 0.098411 m and maximum tilt 2.544°, within the existing 0.065 m / 50° walking envelope. Both turn directions cancelled through the real worker, preserving identical tick and position after 500 ms paused; disposal left zero workers. These are simulator stops, not hardware-stop evidence.

The [development editor acceptance](evidence/jumper-turns-ui-validation.json) imports the activity, checks all four signed goal measurements and repeat identities, exports/reloads the same trace without starting a worker, then cancels during a left turn after advance. The [final production editor acceptance](evidence/jumper-turns-production-validation.json) passed the same flow against the static build, including the corrected ES/CA/EN capability help. An initial static run caught the previous help text in an older build; rebuilding with the corrected copy resolved it. Five affected project test suites, all configured TypeScript checks, affected lint, 13 architecture checks and the production app plus 13 dependencies passed. Probe scripts also passed syntax/lint and scoped formatting checks.

The source parser validates Jumper and MicroDuck palettes separately, preventing this addition from enabling MicroDuck right turns. Unit tests cover signed axis mapping and rejection, stopping profiles without relaxed tolerance, quarter-turn-only compilation and target-specific parsing.

The tolerance applies to each measured block, not the sum of multiple turns. Balancing can translate the body and turning left then right does not guarantee return to the starting position. Evidence is for the prepared flat-ground scene in Chrome on the local Mac; it does not establish hardware, Safari or mobile behavior. Reproduction commands are in the [MuJoCo tools README](../tools/mujoco/README.md#jumper-quarter-turn-acceptance).

## Unified simulation destinations — 2026-10-13

BL-025 makes MuJoCo web the only simulation choice for Jumper and MicroDuck in the normal editor, including restoration and file import. StackChan retains its physical route. Jumper's fixed-body joint probe remains an advanced MuJoCo mode. The old MicroDuck USB placeholder also opens on the web simulator with its source archived; no hardware support is implied.

A retired MicroDuck document is archived in its original per-destination slot, including its execution. If a MuJoCo slot already exists, it is restored; otherwise a copy of the original XML remains in the editor for adaptation. No command translation or automatic run occurs. Unsupported blocks are disabled and block execution; the original archived source/result remains in JSON exports. A localized notice explains the retained programs. Inactive projects migrate when opened, not by rewriting the whole library.

The native reference and archived iframe regression harness remain accessible only through `BOTLAB_REFERENCE_SIMULATORS=1` at dev/build time, not through saved data or a URL. The normal selector and runtime panels cannot start those transports. The environment flag participates in the app's Nx cache inputs so a reference build cannot satisfy a normal build cache lookup. Reference tests explicitly enable the reference configuration; product tests exercise the default.

Verification:

- 137 editor tests passed, including both old backends, source preservation, JSON round trips, existing MuJoCo slot preference, import/reload and blocked unsupported actions. Type checks across all configured projects, app lint, 13 architecture boundary checks and the production build passed. App lint retains existing advisory warnings.
- [Chrome workbench acceptance](evidence/mujoco-unified-workbench-validation.json): actual measured Jumper and MicroDuck programs, advanced joint mode, source edits, cancellation, worker cleanup, project operations, export/import and reload. No browser errors. The 390px viewport check is responsive desktop testing, not a physical mobile device.
- [Static-build migration acceptance](evidence/mujoco-destination-migration.json): both old backends preserve exact original XML and execution identity through export/reload; import prefers an existing web slot; unsupported posture cannot run after loading physics; no iframe or native requests and no browser errors. The first test attempt incorrectly expected a newly loaded world to be Paused; it was correctly Ready. The assertion was corrected and the full test passed without changing application behavior.

Reproduce with `BOTLAB_TEST_URL=<editor> node tools/mujoco/verify-workbench.mjs` and `BOTLAB_TEST_URL=<static-preview> node tools/mujoco/verify-destination-migration.mjs`. These checks do not enable ToF, additional policies, hardware, real Safari or physical mobile support. The [requested block plan](mujoco-jumper-microduck.md#plan-de-bloques-comunes-y-específicos--2026-10-13) records those future capabilities and their acceptance criteria.

## Geometric ToF prototype — 2026-10-13

BL-026 first increment: optional MicroDuck obstacle scene in MuJoCo web, with an 8×8 map from the model's `tof` site. Configuration: 45° per axis, 4 m maximum radial distance, 15 simulated Hz. Rays use zone centres and include static objects, ground and self intersections. Row zero is up, column zero is left, viewed from behind the sensor. No return is `null` with a status, never zero; invalid numeric results have a separate status. This is geometric depth without optical noise, reflectance or multipath modelling.

The shared manifest/frame contracts carry depth without importing a robot controller. The engine uses a separate kinematic data allocation to avoid mutating solver/controller state. Pause freezes the sample; reset clears sequence/cache; disposal frees the allocation. Missing sites fail loading. The MicroDuck loader verifies a separate pinned obstacle manifest; the existing flat manifest digest and walking policy are unchanged. Jumper has no depth configuration yet and gains no new advertised capability.

The scene selector is available while disconnected; loading locks it until closing. Scene selection persists per destination, including JSON round-trip. Changing scenes clears the old execution result. Reload preserves the choice and historical results but does not load a worker or retain live readings. The panel identifies units, geometric scope, no return and simulated capture time in Spanish, Catalan and English.

Evidence:

- [Chrome UI acceptance](evidence/mujoco-tof-web.json): 64 readings, pause/reset, advance + left turn + wait, cancellation, close, reload, robot switching and scene/result separation. The advance completed at 0.5014 m for a 0.5 m target. Static build on local preview; Chrome 154.0.8037.98. Panel screenshot inspected for readable numbers, legend and orientation. A development attempt was interrupted by Vite reload during implementation; the stable compiled check passed.
- [Physics and cost](evidence/mujoco-tof-physics.json): 1 s balance preparation then 4 s at the educational forward speed, 0.25 m/s. Sensor-on and sensor-off worlds with identical geometry/control produced exactly equal feedback at every physics step. X travel 0.3849 m; zone (row 4, column 4) fell from 1.4592 m to 1.0650 m. 76 samples including the first/end samples across 5 simulated seconds. Mean sampling cost 0.6395 ms, p95 0.9 ms, maximum 2.5 ms on this development machine; this is ray sampling cost, not overall rendering/inference performance or a mobile guarantee.
- Real-WASM engine tests cover analytic nearest surfaces, occlusion, no intersection/out-of-range, translated/rotated sensor, self intersections, normalized grid directions, frequency/reset/disposal, missing sites and exact dynamics independence. 20 engine tests and 138 editor tests pass; types, lint, architecture and app build pass.

An exploratory direct command at 0.15 m/s moved only about 0.008 m in 4 s; that was not used as a depth-motion acceptance case. The accepted comparison uses the same 0.25 m/s and balance preparation as the existing educational advance. This does not establish arbitrary velocity tracking.

Run `node tools/mujoco/verify-tof.mjs` for the browser workflow and `node tools/mujoco/verify-tof-physics.mjs` against Vite for the physical comparison. See [setup](../tools/mujoco/README.md#tof-prototype). Official ray semantics: [MuJoCo mj_ray](https://mujoco.readthedocs.io/en/stable/APIreference/APIfunctions.html#mj-ray).

Remaining BL-026 scope: proximity semantics, stale-reading handling for decisions, bounded “advance until obstacle”, a dedicated Jumper sensor configuration and navigation acceptance. No automatic avoidance, sensor blocks, hardware validation, Safari or mobile acceptance is claimed here. Obstacle collisions remain possible; the existing policy receives no depth input.
