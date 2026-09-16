# MicroDuck simulator reevaluation — 2026-09-13

Status: the user authorized the bounded experiment, which ran on this Mac on 2026-09-13. The native services, physics, telemetry, skills and proximity subscription were exercised. A backend migration has not been implemented. Source-inspection findings below are retained with the measured results and limitations added here.

## Recommendation

Proceed toward a native experimental target for skills and sensor-driven behaviors, with one small BotLab integration increment before deciding on replacement. The experiment supports API reuse and local execution, but does not show that native simulation fixes precise movement by itself. Keep the working browser integration while resolving native presentation, transport and installation. Do not maintain two complete product backends indefinitely without a demonstrated need.

Removing the iframe alone does not produce native robot capabilities. Both options use MuJoCo: the substantive choice is browser physics/policy execution versus the robot's actual services connected to a simulated body. Presentation and execution transport should be separate decisions.

## How the iframe became the implementation

The repository provides this evidence:

- `c7f6900` introduced ADR 0002 with in-process browser hosting as the default. It discussed dependency isolation, assets and licensing, but did not compare against `robotd --sim`.
- `2703767` added an iframe showing the hosted official simulator as a preview.
- `b37a337` introduced the local simulator helper; `ac4df63` connected the UI to that prepared host. The preview path became the execution integration.
- The working-tree amendment to ADR 0002 on 2026-09-13 documented that existing implementation. It was not a comparative native-backend evaluation.

Inference: the iframe let BotLab reuse an existing standalone web application incrementally. No inspected decision record establishes that native simulation was rejected on measured technical grounds. This does not establish what may have been discussed outside the repository.

## Options

| Aspect                  | Existing browser host in iframe                | Same browser engine in-process             | Daemons + native MuJoCo body                                                                            |
| ----------------------- | ---------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Current BotLab evidence | Movement, turns, progress and stop tested      | Not integrated                             | Native probe plus app acceptance: rendered scene, movement, posture, stop, fallback and connection loss |
| Robot software          | Browser controller and ONNX policies           | Same browser controller and policies       | Actual robot services against simulated inputs                                                          |
| Native skills/sensors   | Need individual mapping and simulation support | Same work as iframe                        | Stronger reuse opportunity, subject to actual service/transport support                                 |
| Installation            | Prepared Node/browser host and assets          | Browser assets and tighter app integration | Rust, Python, model/policy assets and service lifecycle                                                 |
| Visible scene           | Existing embedded 3D preview                   | Adapt upstream rendering into BotLab       | Native viewer and embedded MuJoCo render of body truth                                                  |
| Main cost               | Patches, protocol and duplicated receiver      | Upstream coupling without service parity   | Setup, platform support and browser-to-service transport                                                |

The browser application is a standalone MuJoCo WASM/ONNX web application. Embedding it differently changes integration and packaging, not the services it executes. [Official browser README](https://huggingface.co/spaces/pollen-robotics/microduck-simulator/blob/main/README.md).

Upstream describes the native boundary as replacing body I/O while retaining control, policies, odometry and robot APIs. Its design includes ToF and camera inputs; hardware drivers and NPU execution remain outside that fidelity claim. Local ToF was verified; the published body revision used here lacks camera support, so the broader design must not be read as this revision's feature list. [Native simulation design](https://github.com/pollen-robotics/microduck/blob/e9cca6272f633dd9054dd0e021f356fe086e5be1/docs/design/simulation.md).

## Reproducibility and platform findings

Inspected revisions:

| Repository                              | Revision                                   | Finding                                                       |
| --------------------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `microduck` main                        | `e9cca6272f633dd9054dd0e021f356fe086e5be1` | Contains daemon simulator integration and launcher            |
| `microduck_rl` main                     | `1e79c29c97d8b38aee9eefde77a545860ba7658e` | Does **not** contain `mjlab_microduck.sim.body_server`        |
| `microduck_rl` branch `sim-body-server` | `363b7effd4eae9f24dd1bb8bf647aef4d74edca9` | Contains the required body server and `duck-body` entry point |

Cloning both default branches is therefore insufficient. The branch is public in the official repository; it is not necessary to invent a replacement body server. The two revisions passed the local control/ToF compatibility experiment. [RL main tree](https://github.com/pollen-robotics/microduck_rl/tree/1e79c29c97d8b38aee9eefde77a545860ba7658e/src/mjlab_microduck), [published body server](https://github.com/pollen-robotics/microduck_rl/blob/363b7effd4eae9f24dd1bb8bf647aef4d74edca9/src/mjlab_microduck/sim/body_server.py).

This host is Darwin arm64. Rust was absent, so Rust 1.98.1 and Python 3.12.12 were installed inside the ignored experiment directory. The execution-only environment uses the branch's MuJoCo 3.10.0, NumPy 2.4.1 and ONNX Runtime 1.24.4, without installing its training stack. The initial Rust build took 37.12 seconds; the combined cache/build directory occupied about 2.2 GB. Cold total installation time was not separately benchmarked. The maintained preparer and dependency lock reproduce this isolated setup. [Branch manifest](https://github.com/pollen-robotics/microduck_rl/blob/363b7effd4eae9f24dd1bb8bf647aef4d74edca9/pyproject.toml).

The launcher explicitly accommodates macOS ONNX libraries and `mjpython`. However, `mediad` exits unsuccessfully on non-Linux hosts. Consequently, local control/ToF and the full camera/WebRTC experience have different platform requirements. Linux or a VM must be evaluated for the latter; installing GStreamer on macOS alone does not remove the source-level restriction. [Launcher](https://github.com/pollen-robotics/microduck/blob/e9cca6272f633dd9054dd0e021f356fe086e5be1/scripts/duck-sim), [mediad platform guard](https://github.com/pollen-robotics/microduck/blob/e9cca6272f633dd9054dd0e021f356fe086e5be1/mediad/src/main.rs#L647).

## Proposed integration boundary

BotLab should express actions and subscriptions through a MicroDuck adapter. The transport should carry official robot intents and telemetry; the simulator package should own process setup, scene lifecycle and simulation-only observations. A browser cannot directly use the daemon's Unix sockets: either a small local gateway or the official WebRTC route is required.

The inspected WebRTC router permits motion, skills, head control, sound, telemetry and stop. It does not forward every daemon method, so capability discovery must account for transport as well as robot support. [Official routing code](https://github.com/pollen-robotics/microduck/blob/e9cca6272f633dd9054dd0e021f356fe086e5be1/mediad/src/route.rs).

BotLab still owns sequence execution, cancellation, traces and completion criteria. Native velocity commands do not establish an exact-angle completion guarantee. Compare measured turns before deciding which tracking code can be removed. Separate simulator ground truth from robot odometry so tests do not hide dependence on perfect coordinates.

Closing a preview must not be treated as stopping an external daemon. Verify explicit stop, command expiry and disconnection independently. Person detection is not an acceptance assumption: begin with a supported depth observation and only expose semantic triggers after checking their producer and transport.

## Experiment scope and decision gates

1. **Reproduce upstream startup.** Use isolated checkouts, explicit revisions, separate ports/state and a recorded dependency set. Start one duck without cameras or containers. Verify startup, stable control rate and clean shutdown. Completed without a system-wide installation.
2. **Exercise the robot API.** List and invoke one available skill; command movement; subscribe to telemetry; test explicit stop and loss of command updates. Record accepted versus physically completed actions separately.
3. **Compare movement.** Reuse the current walk/turn/stop cases, scene assumptions and tolerances. Record policy/model revisions, actual pose and odometry. Do not transplant browser velocity calibration without measurement.
4. **Demonstrate one reactive behavior.** A changing ToF distance triggers a stop or supported skill. Verify one activation per threshold crossing, reset/rearm behavior and cancellation. Cover those semantics in library tests.
5. **Assess product presentation and installation.** Evaluate a native viewer for development versus an embedded view; test the Linux camera/WebRTC route if it is required. Record installation time, startup time and real-time performance on the intended host.

Proceed to migration only when the experiment shows useful API/sensor reuse, reproducible setup, reliable interruption and an acceptable BotLab viewing experience. Otherwise retain the browser backend and record the failed gate. Relative effort is low for this documentary assessment, medium for a control/ToF prototype, and higher for a supported camera/WebRTC installation and embedded product experience; calendar estimates require the prototype.

If adopted, move transport-independent execution semantics and their tests into the owning libraries, replace the browser receiver with the official transport adapter, and retire redundant generation/patch code only after parity checks. The next blocks should target validated native actions, events and conditions; an example gallery remains out of scope.

## Measured results

Commands and reproducible setup are in [the native probe README](../tools/microduck/native/README.md). [Compact evidence](evidence/microduck-native-2026-09-13.json) records revisions and results; full traces/logs remain under `tmp/microduck-native/`.

| Check                       | Observed result                                                                                                                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Startup and stable standing | Native sitstand policy raised the trunk to approximately 11.6 cm; headless loop approximately 50 Hz, zero missed ticks in the baseline                                                   |
| Skills                      | `sit_toggle` transitioned to `sit` at 5.94 cm and back to `stand` at 11.59 cm                                                                                                            |
| Distance                    | Requested 25 cm using odometry; settled physics displacement 25.92 cm and odometry 26.62 cm                                                                                              |
| Native proximity            | Actual wall ray casts through `tofd --sim`; library trigger fired at 43.5 and 38.7 cm, stopped, held without repeating and rearmed on reverse                                            |
| Cancelled proximity         | A fresh run crossed the threshold at 41.9 cm with zero events after cancellation                                                                                                         |
| Explicit stop               | Acknowledged; applied command magnitude below 0.001 after 0.57 s; approximately 2.8 cm subsequent displacement during the observation                                                    |
| Lost command connection     | Deadman observed after 0.53 s; applied command below 0.001 after 0.95 s; approximately 10 cm subsequent displacement                                                                     |
| Native viewer process       | Thirty-second run, mean 49.96 Hz, one missed tick, real-time ratio 0.9996; no logged viewer fallback. Pixel/interaction acceptance remains open because the UI inspection tool timed out |
| BotLab checks               | 270 tests across seven targets, including eight new adapter tests; app/adapter builds and adapter lint passed                                                                            |

The proximity event is produced by BotLab from native sensor frames, not a pre-existing native `person.detected` event. Its algorithm lives in the adapter library and the native probe invokes that exact TypeScript implementation. It is not yet an editor block.

The native gait also stalled on small commands: a 0.15 m/s request moved about 6 mm in three seconds, and ±1 rad/s produced mostly transient torso rotation. Measured ±2 rad/s produced sustained rotation. The angle experiment consequently still needed heading feedback, settling and corrections; a velocity command is not an angle-completion API.

| Requested BotLab angle | Settled physics angle | Absolute error | Corrections |
| ---------------------: | --------------------: | -------------: | ----------: |
|                    90° |                87.96° |          2.04° |           1 |
|                   -90° |               -95.44° |          5.44° |           7 |
|                   180° |               174.33° |          5.67° |           4 |
|                    15° |                18.50° |          3.50° |           0 |
|                   -15° |               -10.08° |          4.92° |           4 |
|                  -180° |              -185.46° |          5.46° |          13 |
|                   360° |               359.35° |          0.65° |           1 |

All seven cases met the existing 10° regression budget without falling. Three exceeded 5° after the three-second post-command observation, and -180° took about 24 seconds including that observation. This is evidence against claiming the native path automatically improves turning. The native/body revisions and prototype controller differ from the browser setup; these are not controlled performance rankings. Native odometry yaw and physical yaw nearly coincide here because the simulated IMU receives the physics quaternion, which does not establish real-robot sensor accuracy.

The process launcher needed an explicit local Python-library search path for `mjpython` with the `uv` interpreter. That is now in the probe helper. The inspected body branch does not accept the newer `--cameras`/`--frame-port` options used in the daemon repository's launcher. Together with Linux-only `mediad`, this leaves the camera/WebRTC route unvalidated. No Linux VM was provisioned.

## Native app increment — implemented

The app now has a simulator selector retaining the iframe and adding an experimental native view through `@botlab/simulators-microduck-native`. Its loopback gateway owns the simulated services and an exclusive browser lease. The panel displays MuJoCo renders generated from body truth, executes movement/wait blocks with measured completion, and exposes sit/stand, ToF, stop, reset and disconnect. It rejects unsupported LED blocks before moving. Camera/WebRTC and semantic person detection remain separate work; the render stream is a scene view, not a simulated camera sensor.

Browser acceptance covers a 0.25 m walk, 90° turn, wait, posture changes, explicit stop and fallback selection. The gateway owns cancellation and expires a missing browser heartbeat after two seconds. Native execution traces remain live-only, and native runtime target registration/capability discovery are still pending.

App acceptance evidence: [recorded checks and control-loop observations](evidence/microduck-native-app-2026-09-13.json). The completed program observed a mean policy rate of about 50 Hz.

## macOS companion proposal

The user's next proposal is to package the native simulator alone as a Mac application, with the existing web editor in another window. This is a good fit for the existing library boundary: the session already supports the upstream native viewer, while the current app gateway uses a headless session and a separate MJPEG renderer. A companion mode should start the native viewer and omit that video worker. Commands, execution progress and sensor telemetry continue through the local gateway.

The expected benefit is removal of scene replication for streaming, JPEG encoding, HTTP video delivery and browser decoding from this presentation path. It does not remove physics or policy inference cost. The embedded path now measures approximately 29 received fps and 28.7 painted images/s; the earlier native viewer experiment measured approximately 50 Hz **control**, not native display FPS. Measure native frame timing before claiming a visual performance improvement. [Embedded performance evidence](evidence/microduck-native-video-2026-09-13.json).

MuJoCo supplies a native Python viewer. Its passive viewer on macOS requires `mjpython` because rendering must run on the main thread. Our existing launcher accommodates this during development, but a distributable app must preserve that requirement. [Official MuJoCo viewer documentation](https://mujoco.readthedocs.io/en/stable/python.html#interactive-viewer).

Use a thin application shell around the existing library; wrapping the editor in a desktop framework is unnecessary for this proposal. PyInstaller is a packaging candidate because it supports macOS `.app` bundles, but the complete combination of the MuJoCo launcher, Python runtime, native libraries, subprocess binaries and model assets has not been packaged or validated here. Select it only after a relocated bundle passes startup/rendering/shutdown checks without the development checkout or toolchains. [PyInstaller bundle documentation](https://pyinstaller.org/en/latest/usage.html).

The companion owns the service lifecycle and permits a single controlling editor. Closing the simulator must stop execution and terminate its owned children. Losing the browser connection must retain the existing stop/lease behavior; reconnecting must not resume a cancelled program. Reset must reconnect the native view to the replacement scene, and repeated launches must reuse or focus the existing application. A versioned gateway handshake should expose compatibility and external-window presentation to the editor.

The first distribution target is macOS Apple Silicon. Bundle the runtime dependencies and simulator resources so users can open the application without terminal commands. Signing, notarization, dependency/license notices, update delivery and other CPU architectures remain release work. Keep iframe and embedded-native options until the companion passes installation, visual performance, control and lifecycle acceptance. Camera/person detection remains a separate capability task.

The bounded implementation sequence and acceptance criteria are recorded in [the implementation plan](implementation-plan.md#macos-simulator-companion).

### Companion implementation

The external mode and a standalone Apple Silicon development `.app` are implemented. The package uses a compiled Swift/AppKit launcher and a copied standalone CPython runtime with pinned execution dependencies, resources and binaries. The launcher sanitizes its environment and the build rejects escaping symlinks. It does not require PyInstaller. Release signing/notarization and updates remain open.

A relocated bundle launched from `/tmp/botlab-companion-relocated` and passed editor acceptance for reset, a 0.25 m walk, 90° turn, wait, posture, explicit stop, iframe fallback and browser loss, with zero video requests and no browser JavaScript errors. The native window was also inspected visually. The measured policy mean was approximately 49.5 Hz. Scene synchronization measured approximately 49.9 Hz with a 24.8 ms p95 interval; this is not a display FPS measurement.

The companion's owned presentation loop reuses upstream physics and TCP services, requires the viewer to open successfully, and synchronizes every 50 Hz physics pass. The earlier upstream presentation loop synchronized every second pass. Closing the window is an explicit session exit; browser loss remains a cancelled program with an idle viewer. Native window shutdown exposed an upstream daemon-thread/CPython finalization race; the wrapper exits after viewer cleanup and metrics persistence without finalizing live upstream server threads.

The user also requested a Windows companion, explicitly deferred until later. Reuse shared gateway/program semantics while separately evaluating upstream daemon IPC, runtime loading, viewer startup and installer/process lifecycle on Windows. The Mac packaging result does not establish Windows compatibility.

The host has subsequently been generalized to a versioned installed-simulator catalog in `apps/simulator-macos`; only MicroDuck is currently packaged. Additional downloaded packages versus all-included bundles will be selected using measured sizes and shared-runtime costs. Package download/install/update behavior remains planned.

Final catalog-based bundle and clean shutdown evidence: [Mac companion verification](evidence/microduck-native-companion-2026-09-13.json). Scene synchronization measured approximately 50.0 Hz with a 24.0 ms p95 interval in the final run.
