# Native MicroDuck simulator

Experimental native MuJoCo integration, separate from the browser/iframe bridge in `@botlab/simulators-microduck`. The app can select either backend. This library provides the loopback gateway, measured program execution and native render stream used by the experimental panel.

## Ownership

<!-- package layout from src/index.ts and python/botlab_microduck_native/ -->

- `src/`: browser-safe TypeScript JSON-RPC client, native program conversion and app connection, independent of React, Node, iframe messages and simulator assets.
- `python/botlab_microduck_native/`: local simulated service session, body connection and Python RPC support, extracted from the measured native experiment, plus the loopback gateway, movement controller and renderer.
- `tools/microduck/native/` at workspace root: preparation, pinned dependencies/policies and verification scenarios. Its `probe.py` imports this library; there is one session implementation.

Upstream assets and executables stay in the ignored `tmp/microduck-native` cache. The Python session runs from the prepared source workspace or the [standalone Mac companion bundle](../../../apps/simulator-macos/README.md). `BOTLAB_NATIVE_BUNDLE` selects its resources and `BOTLAB_NATIVE_RUNS` selects writable logs. The TypeScript build does not package the Python runtime or upstream assets.

## TypeScript API

<!-- exported functions and types from src/index.ts and src/lib/native-client.ts -->

`createNativeMicroDuckClient(transport, options?)` accepts a connected `NativeMicroDuckTransport` with `send`, `subscribe` and `close`. The transport delivers UTF-8 decoded text chunks and connection loss; the client frames newline-delimited JSON-RPC and correlates replies. `NativeMicroDuckClientOptions` accepts a request timeout (default 3000 ms) and `onNotification` callback receiving `NativeMicroDuckNotification` values.

| Method             | Native operation                                |
| ------------------ | ----------------------------------------------- |
| `subscribeRobot()` | `robot.subscribe` at 50 Hz                      |
| `subscribeDepth()` | `tof.stream` on a **separate ToF connection**   |
| `enable(on)`       | `robot.enable`                                  |
| `move(velocity)`   | `robot.move` with `NativeMicroDuckVelocity`     |
| `stop()`           | `robot.stop`                                    |
| `togglePosture()`  | `robot.do` with `sit_toggle`                    |
| `health()`         | `robot.health`                                  |
| `dispose()`        | Reject pending requests and close communication |

Velocities use m/s and rad/s; positive yaw turns left, opposite BotLab's positive angle convention. Replies and notification payloads are `unknown` until validated by the consumer. Command acceptance does not mean physical completion. The client does not resend movement, infer capabilities, control measured angles or reconnect automatically. Missing replies time out; daemon errors and connection failures reject requests. After a healthy session, await `stop()` before `dispose()`; disconnect still relies on the daemon's deadman behavior.

## App API and gateway

<!-- exported app API from src/lib/app-connection.ts and server behavior from python/botlab_microduck_native/gateway.py, program.py and renderer.py -->

`createNativeProgram(artifact, capabilities?)` converts compiled movement/wait/posture and nested if-posture commands into `NativeProgramStep[]`, preserving source block IDs and validating limits. `createNativeAppConnection(url, fetcher?)` creates a `NativeAppConnection`: `connect`, `snapshot`, `run`, `stop`, `reset`, `togglePosture`, and `dispose`. `videoUrl` supplies the leased MJPEG stream. Snapshots expose protocol version 1, `embedded`/`external` presentation, frame timestamps, robot/ToF telemetry, posture transition, discovered native capabilities and identified program progress; images no longer pass through JSON or React state. The app uses XState to own the connection and polling lifetime. Monotonic operation numbers prevent a late run from overtaking stop/release.

Run `pnpm run microduck:native` after preparation. The gateway binds to 127.0.0.1:4401 and permits the two local Vite origins (localhost/127.0.0.1:4200); `--port` and repeated `--origin` configure it. It has a single browser lease, a two-second heartbeat expiry, bounded requests and an allowlist of native operations. The program controller holds zero velocity during waits, measures displacement and unwrapped yaw, waits for settling, and fails on stale telemetry, falls or timeouts. Rendering uses MuJoCo with read-only body poses, not a second advancing physics simulation. The renderer runs in its own process and follows the robot at a target of 30 fps, encoding JPEG with pinned Pillow. A two-frame IPC queue and latest-frame delivery discard backlogs; rendering and socket writes cannot block the control loop. Floor reflections are disabled while shadows remain enabled. Camera/WebRTC and person detection are not part of this view.

Use `--presentation external` to open the native MuJoCo window and omit the render worker. The Mac companion selects this mode automatically. The editor displays external-window status and requests no MJPEG. The native presentation loop synchronizes the existing physics world at 50 Hz; scene synchronization measurements are saved on close and must not be described as display FPS. Closing the scene ends the gateway session; any failed child terminates the gateway and cleans up its services. `GET /health` reports protocol, presentation and gateway PID without acquiring control. `--parent-pid` makes a managed gateway exit when its launcher disappears.

Supported steps: explicit `posture` with value `sit` or `stand`, nonzero signed walks up to 5 m, nonzero signed turns up to 360°, and waits from 0–60 s, with at most 256 nodes across all branches, 16 conditional nesting levels and 10 minutes per program. `if` steps contain a posture predicate and `then` / `else` step arrays; the whole tree is validated before dispatch. LED commands are rejected before any movement. The initial app integration has live progress; persisted native traces and integration into the generic runtime target registry remain future work.

The video URL is available only to the owning browser token and does not renew its control lease. Disconnect/expiry closes the stream. Reset invalidates queued images from the previous body. Two overlapping video connections are allowed during image remount, and slow socket writes have a two-second timeout. The renderer is idle when no browser owns the session and is terminated with the gateway.

<!-- performance verification from ../../../tools/microduck/native/verify-video.mjs and ../../../docs/evidence/microduck-native-video-2026-09-13.json -->

`pnpm run test:simulator-native-video` checks the actual Chrome image via canvas sampling as well as the received stream, and asserts at least 27 received fps, 24 distinct painted images/s and a 45 Hz policy loop. On the measured Mac, results were 29.1 received fps, 28.7 painted images/s and 49.8 Hz control; hardware and load affect these figures.

## Circuit and navigation

<!-- circuit geometry and sensor-guided control from python/botlab_microduck_native/circuit.py, depth_navigation.py, gateway.py and program.py -->

The gateway builds a five-wall corridor in the physical MuJoCo scene and uses that same scene for the video renderer. The front ToF sensor sees the first barrier from the starting pose. `walk-until-obstacle` stops after three distinct frames at or below 0.40 m; left/right `turn-until-clear` requires a meaningful turn and three frames at or above 0.65 m. It checks clearance again after the body settles, continuing the turn if the opening vanished. Each action waits for stable standing before advancing. Missing reliable readings for two seconds, a walk beyond 3 m / 35 s, or a turn beyond 360° / 25 s fails the action. These limits are internal safeguards, not block inputs. Restart the local gateway or rebuild the Mac companion to load a changed circuit.

## Native process lifecycle

<!-- session lifecycle from python/botlab_microduck_native/session.py -->

Add `libs/simulators/microduck-native/python` to `PYTHONPATH` and import `NativeMicroDuckSession` from `botlab_microduck_native`. Call `start()` once and `close()` in `finally`. Each session owns its body server, `robotd`, `tofd`, temporary Unix sockets and timestamped evidence directory. It refuses an occupied body port, cleans up when startup fails, and permits repeated close calls. A new launch requires a new instance. No physical robot transport is opened.

Robot-specific proximity interpretation stays in `@botlab/adapters-microduck`; this library owns the simulator connection.

## Verification

<!-- project targets from project.json and vite.config.ts; native smoke command from ../../../package.json -->

```sh
pnpm nx test simulators-microduck-native
pnpm nx build simulators-microduck-native
pnpm nx lint simulators-microduck-native
python3 tools/microduck/native/prepare.py
pnpm run test:simulator-native
# With app and gateway running, and Playwright available:
pnpm run test:simulator-native-app
pnpm run test:simulator-native-video
```

The test target runs Vitest plus standard-library Python unittest tests (Python 3 required, no native dependencies needed for unit tests). Coverage includes movement completion/failure, lease ownership, stale operations and video backlog/reset/shutdown handling. The TypeScript unit suite covers framing, interleaved telemetry/replies, native command mapping, invalid velocities, daemon errors, timeout, disconnect and malformed input. `test:all` includes this suite and `build:libs` includes its build. The separate native smoke check builds and exercises the TypeScript client against real services, then stops them. See the [experiment commands](../../../tools/microduck/native/README.md) for physical movement and sensor scenarios.

## Posture execution

<!-- posture lifecycle from python/botlab_microduck_native/posture.py, program.py and gateway.py -->

The gateway reads `robot.subscribe` loaded-policy information and `robot.skills` configured/built-in names at startup and before a run or toolbar posture action. Snapshots expose executable skill names and supported postures; both client and server reject unsupported posture or skill steps before running. The bundled `kick_left` and `kick_right` skills are executable, as are community skills imported into the current simulator session. The app imports only models selected by connected blocks when it connects or when that program changes. An import pins a public Hugging Face ONNX model to a commit, records its SHA-256, registers it with `robot.setSkill`, and waits for loaded-policy discovery before making its name executable. Resetting the scene clears imported skills and the app loads those used by the program again.

A posture action sends `sit_toggle` at most once when the stable posture differs from the request. An already achieved posture fails at its source block with a localized teaching error; it neither toggles away nor silently skips the instruction. Completion requires the requested policy plus 0.6 seconds of stable simulated trunk height (range below 4 mm, sit at most 8.5 cm, stand at least 9.5 cm) and low gyro motion (each axis below 0.15 rad/s). Missing stability times out after 12 seconds. These are native scene observations, not physical-robot guarantees. The toolbar shares this execution path instead of a fixed busy delay. Walking/turning while seated fails without dispatching motion; place a Stand block first.

Native `robot.stop` zeros velocity without cancelling a latched posture transition. BotLab stops the sequence and dispatches no further blocks, while the posture observer follows the current transition. The toolbar waits for stability, but a new program can inspect a known transition after cancellation; walking/turning still fails unless standing is stable. Refusals, telemetry loss and falls fail the run. The updated iframe backend also executes posture commands and conditions, with its own physical observer and the same explicit-action/error semantics.

`pnpm run test:simulator-native-posture` performs real browser/physics acceptance. Unit coverage includes redundant-posture errors, one-shot dispatch, observed settling, timeout, refusal, missing capability and cancellation before the next action.

Native skill steps dispatch `robot.do` once from a stable standing posture, require the requested policy to appear in fresh telemetry, then require stable standing recovery before advancing. Missing start or recovery times out; falls, refusals, telemetry loss and stop fail or cancel the program. This is verified by unit tests and direct physics probes of both bundled kick policies; full editor-to-gateway acceptance for skills remains to be run. A community Polite Bow model registered and started but ended fallen in a direct trial, so registration alone does not certify the motion.

<!-- condition execution and observation from python/botlab_microduck_native/program.py, posture.py, gateway.py and src/lib/app-connection.ts -->

`capabilities.postureConditions` advertises sitting, standing and transitioning predicates separately from action capabilities, so older companions reject conditional programs in the browser before dispatch. `observedPosture` is `sit`, `stand`, `transitioning` or `unknown`. Stable postures use the physical completion criteria above. Transitioning means a posture action was dispatched by this gateway and has not yet settled (maximum 12 seconds); it is not inferred from every unstable pose or walking policy. Missing/stale telemetry, fallen/limp states, unsupported policies and an unsettled initial observation are unknown.

A condition reads that observation when its block executes; unknown fails with `posture-unknown` instead of evaluating false. Only the selected branch enters execution. Snapshots retain condition/block IDs, the observed posture and Boolean decision; the native panel displays these decisions. Progress counts the currently expanded execution sequence, which grows as branches are selected. Stop prevents further decisions or actions. Walking and turning finish only after standing stabilizes, so the next block receives a stable observation. Failure to settle within 12 seconds after physical completion fails that movement block. This native interpreter does not yet implement generic runtime control flow, loops or arbitrary expressions.

<!-- repeat transport and validation from src/lib/app-connection.ts and python/botlab_microduck_native/program.py -->

Finite repeats are expanded by the shared adapter before native lowering. The gateway validates iteration metadata and preserves it in the current step and conditional decisions. Zero-duration checkpoints retain cancellation between iterations. Existing 256-step and 10-minute program limits still apply. `BOTLAB_QA_BACKEND=native pnpm run test:simulator-repeats` checks the native app against a running gateway; build the editor with the gateway URL and allow its exact origin. The packaged Mac app must be rebuilt to include updated gateway code.
