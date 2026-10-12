# @botlab/simulators-microduck

<!-- reference integration availability from apps/botlab-web/src/app/simulation-destinations.ts and apps/botlab-web/vite.config.ts -->

The default editor uses MuJoCo web exclusively for Jumper and MicroDuck. This legacy/native integration is retained for internal comparisons and regression checks. UI instructions in this document require a separate development server started with `BOTLAB_REFERENCE_SIMULATORS=1`; imported projects cannot enable it. Native services and command-line tools remain available independently.

MicroDuck simulator integration package.

This is the home for the future MuJoCo/ONNX/browser simulator bridge. The shared simulator contracts stay in `@botlab/simulators-core`.

## Public API

<!-- exported MicroDuck simulator API from src/index.ts -->

- `microDuckOfficialSimulatorIntegration`: the MicroDuck simulator integration metadata.
- `microDuckSimulatorIntegrations`: list used by the runtime/app composition layer.
- `microDuckSimulatorAssetManifest`: pinned upstream asset manifest for simulator setup.
- `loadMicroDuckOfficialSimulatorHost`: gates official runtime loading on reviewed assets and loads BotLab control frames into the official source boundary.
- `connectMicroDuckBotLabSourceToOfficialSimulator`: loads an official simulator runtime and registers the BotLab source.
- `createMicroDuckSimulatorBridge`: creates the current MicroDuck simulator bridge.
- `createMicroDuckSimulatorControlSource`: maps compiled BotLab commands into MicroDuck simulator control frames.
- `createMicroDuckBotLabOfficialSource`: adapts BotLab control frames to the official simulator `Controller` source contract. Distance frames require `getPosition()` returning horizontal physics coordinates; turn frames require `getHeading()` returning MuJoCo yaw in radians (positive left). Missing telemetry fails rather than falling back to timing.
- `createMicroDuckBotLabPostMessageSource`: creates a simulator-side `Controller` source that listens for BotLab control frames sent with `window.postMessage`.
- `createMicroDuckBotLabPostMessageSourceModule`: generates the standalone `controls/botlab.js` module for a patched official simulator host. It buffers early delivery, ignores retries of already received execution IDs within a page session, and pauses frame consumption while the supplied `isInputLocked` callback is true. A new execution ID replays even an identical program without reloading the host; legacy messages without an ID are deduplicated by content.
- `createMicroDuckOfficialSimulatorPatchInstructions`: returns the import/source registration hints for the official simulator `Controller`.
- `patchMicroDuckOfficialSimulatorGameSource`: idempotently patches the official simulator `game.js` source to import and register the BotLab source, using the game's `inputLocked` flag to wait for startup. Existing BotLab source registrations are upgraded in place.
- `createMicroDuckSimulatorControlMessage`: wraps BotLab control frames in the stable postMessage envelope, with an optional execution ID shared by all retries of one run.
- `parseMicroDuckSimulatorControlMessage`: validates a candidate postMessage payload before loading frames.
- `postMicroDuckSimulatorControlSource`: sends BotLab control frames and an optional execution ID to a BotLab-enabled simulator window.
- `observeMicroDuckExecution`: starts an identified execution, filters status messages by iframe window, exact origin, plan and execution ID, and exposes `stop()` and `dispose()`. Delivery retries stop after acknowledgment; stopping cancels delivery and retries the stop request.
- `createMicroDuckSimulatorAssetCachePlan`: plans required cache work from the manifest.
- `inspectMicroDuckSimulatorAssetCache`: reads a cache store and verifies cached asset hashes.
- `setupMicroDuckSimulatorAssetCache`: downloads reviewed assets and writes only hash-verified bytes.
- `validateMicroDuckSimulatorAssetManifest`: validates manifest shape before setup.

## Execution Acknowledgments

The generated browser source accepts `botlab.microduck.stop.v1` and replies with `botlab.microduck.execution.v1` statuses: `accepted`, `running`, `completed`, `stopped`, or `failed`. Replies include the execution and artifact IDs, plus the current frame index when running. Only the embedding parent at an allowed origin may control it. A stop clears current and buffered frames and remembers the execution ID so delayed retries cannot revive it, including a stop received before the first delivery.

<!-- progress, distance and turn semantics from src/lib/microduck-execution.ts, src/lib/microduck-distance.ts, src/lib/microduck-turn.ts, and src/lib/microduck-simulator.ts -->

The default official-simulator factory calibrates Feet reverse input to -0.4 and angular input to 2. The bundled walking policy can stall at the upstream -0.2 reverse and 1 angular inputs; the measured 90° right-turn regression stalled around 15° before this change. Forward and roller limits and manual controls retain their upstream values. This calibration is simulator-only; it does not change the lower-level source's caller-provided limits or establish a hardware speed. Explicit `velocityLimitsExpression` overrides remain supported.

`running` is emitted after startup unlock and approximately every 100 ms while the controller polls the source, with `frameIndex`, `elapsedMs`, and `distanceMeters` or `turnedDegrees` when applicable. A turn's first crossing is reported immediately even between heartbeats, so later settling below the requested angle does not lose the arrival evidence required by the observer. Frames retain the compiled command's optional `sourceBlockId` for editor highlighting; replies do not select arbitrary blocks. The client rejects invalid numeric progress and unknown error codes.

The client requires an arrival measurement for every selected distance or turn frame before accepting `completed`; posture frames need observed completion and conditions need a consistent decision. Older patched hosts that acknowledge completion without measured arrival fail explicitly and must be regenerated with the setup tool.

Distance frames ignore legacy `durationMs` estimates. They complete only when horizontal displacement from the frame's initial physics position reaches `distanceMeters`; each frame takes a fresh origin. This is not accumulated path length or the HUD odometer, and small post-command drift is possible. Zero meters is a no-op. Position jumps above `max(0.5 m, 5 * dt m)`, unavailable telemetry, ten seconds without at least 1 cm of new progress, or exceeding `max(30 s, distance / 0.05 m/s)` fail and clear commands. Wait frames retain controller priority even at zero velocity, preventing other input sources from taking over during a wait. Re-locking the scene after execution starts fails the run.

Turn frames use `angleDegrees` (-360 to 360, negative left / positive right), exclusive of distance and duration. They unwrap successive yaw measurements and project the signed rotation onto the requested direction, so oscillation and opposite rotation do not count as arrival. Angular power reduces near the target to a floor of 75% of the supplied angular limit (1.5 with the default Feet calibration). Lowering the Feet input to 1 near arrival also reproduced a stalled 15° turn. Zero degrees is a no-op. Missing telemetry, implausible heading jumps, ten seconds without angular progress, or exceeding `max(30 s, abs(angle) / 3)` fail the run. After the first measured crossing, the source holds zero motion for at least 0.75 seconds and requires at least 0.25 seconds below 5 degrees/second. It completes when the settled error is at most 5 degrees; otherwise it corrects in either direction and settles again. Stall and total-duration limits also apply during correction. This controls the measured settling phase, not subsequent motion from external inputs or scene changes.

`completed` means all frames met their consumption conditions, including measured arrival for distance and turn frames, not that every robot feature or LED is physically simulated. The app waits up to 60 seconds for initial engine progress, detects missing running heartbeats after 15 seconds, and requires stop confirmation within 3 seconds. Missing confirmation closes the iframe as a simulator-only fallback. Confirmed simulator failures stop the program but retain the scene for editing, retrying, or resetting. The observer assigns `failureOrigin: 'simulator'` to validated failure replies and `'transport'` to delivery or unconfirmed-arrival failures; timeouts also retain the close fallback. This does not implement a hardware emergency stop. The direct in-process source remains a lower-level frame consumer; acknowledgments belong to the generated browser source.

## Physics regression

<!-- browser regression setup and assertions from ../../../tools/microduck/verify-turns.mjs and ../../../package.json -->

From the repository root, prepare the simulator with `pnpm run microduck:sim --no-install --no-lfs-hydrate`, start it on port 4300 and start BotLab with `pnpm run dev` on port 4200. The prepared checkout must have its dependencies and LFS assets already hydrated; first-time setup uses `pnpm run microduck:sim --start`.

Run `pnpm run test:simulator-turns` with Playwright available as a Node module and Chrome installed. An externally installed or bundled Playwright can be selected with `BOTLAB_PLAYWRIGHT_MODULE=/absolute/path/to/playwright`; otherwise the script resolves `playwright` normally. This optional browser test is separate from `test:all` and does not install dependencies or start servers automatically.

The test uses a fresh browser context, imports a short walk followed by right/left quarter turns, a half turn, signed 15° turns, -180° and 360°, and measures unwrapped physics yaw after three-second waits. It checks a 10° absolute angular-error budget for those cases, then replays in the same scene and verifies acknowledged stop during the first turn without dispatching the next block. This is a regression budget for the recorded Feet policy/scene, not a guarantee for every angle, locomotion mode or physical robot.

Reports and a screenshot are written to `tmp/turn-regression/`. The report includes the upstream checkout revision, requested/settled angles, execution messages and raw yaw/command samples. `BOTLAB_QA_URL`, `BOTLAB_QA_OUTPUT`, `BOTLAB_SIMULATOR_CHECKOUT` and `BOTLAB_BROWSER_CHANNEL` override the app URL, output directory, checkout used to identify the revision, and browser channel. Use an app URL serving that checkout to keep the recorded revision meaningful.

Verified on 2026-09-13 with upstream `023172c8a7d629b5258d90364c13bafe013abbfa`: all seven turn cases passed, with settled absolute errors from 0.06° to 4.56°, and stop/replay preserved the scene without starting the following block. The app/library command passed 262 tests; 101 belong to this simulator package.

## Postures and conditions

<!-- posture API and receiver behavior from src/lib/microduck-posture.ts, microduck-simulator.ts and microduck-execution.ts -->

`createMicroDuckPostureObserver(read?)` consumes `MicroDuckPostureState`: simulator time, supported mode, posture label, physical trunk height, gyro and fallen state. Stable completion requires 0.6 seconds of height stability below 4 mm range, gyro axes within 0.15 rad/s and height at most 8.5 cm sitting / at least 9.5 cm standing. Missing/stale observations, resets and falls invalidate the observation. `begin()` marks a dispatched transition; unknown is not treated as false.

`MicroDuckBotLabOfficialSourceOptions` accepts `getPostureState` and `requestPosture`. The game patch binds them to the official Feet sit/stand policy and `setMode`, rejecting rollers, custom policies and unavailable/busy posture actions. The receiver sends an explicit request once, waits up to 12 seconds for observed completion, and fails repeated Sit/Stand instructions at their source block. Stopping clears the remaining program while a latched upstream transition continues; it can be inspected by a new run. Movement requires standing, and measured movement completion holds zero input until standing is stable before the next block.

`createMicroDuckSimulatorControlSource` lowers nested `if-posture` commands to flat `posture-condition`, `posture` and forward-only `jump` frames. Branch indices remain stable across execution, highlighting and saved traces. Both branches are validated before dispatch, with at most 256 input nodes and 16 conditional nesting levels. Status updates include `observedPosture`, `conditionResult` and `postureCompleted` where applicable. The parent validates a decision against its predicate, excludes only the unselected branch from completion checks, and requires physical completion reports for selected posture/motion frames. An old receiver that silently skips these frames cannot confirm success.

<!-- posture acceptance command from ../../../package.json and ../../../tools/microduck/verify-postures.mjs -->

`pnpm run test:simulator-postures` checks real Chrome/iframe physics: nested branches, sit/stand, walk/turn handoff, repeated-posture error and cancellation followed by a transition condition in the same scene. Set `BOTLAB_QA_URL` (default `http://127.0.0.1:4205/`) and `BOTLAB_PLAYWRIGHT_MODULE` when needed. A combined preview uses `BOTLAB_SIMULATOR_URL=/simulator/?boot=1` for BotLab and `VITE_BASE=/simulator/` for the upstream build. Pass comma-separated exact origins to `microduck:sim --botlab-origin` before building. Unit tests exercise both the library-generated receiver and the setup tool's receiver; consolidating the duplicate generator is still planned.

<!-- bridge generation from ../../../tools/microduck/load-simulator-bridge.mjs and ../../../tools/microduck/prepare-official-simulator.mjs -->

The setup tool bundles the current simulator library through `load-simulator-bridge.mjs` using the workspace Vite dependency. The receiver, motion/posture trackers, game patch and arena patch come from that library; the tool owns checkout, assets and installation only. No generated receiver copy is maintained in the tool. Contract tests execute both the library generator and the setup bundle; repeated preparation is idempotent. `patchMicroDuckOfficialSimulatorArenaSource` only expands known upstream arena declarations and rejects unknown layouts.

<!-- repeat frames and progress from src/lib/microduck-simulator.ts and microduck-execution.ts -->

Finite repeats arrive as distinct forward-only frames with iteration metadata; existing completion proofs and stop fences apply to every occurrence. The host derives iteration progress from its compiled frames rather than trusting arbitrary receiver metadata. No backward jumps or unbounded loops are accepted. Run `pnpm run test:simulator-repeats` with the prepared simulator served under `/simulator/` and BotLab at `http://127.0.0.1:4206` (override `BOTLAB_QA_URL`). Set `BOTLAB_PLAYWRIGHT_MODULE` if Playwright is outside the workspace. The test uses isolated browser storage and checks nested iteration display, dynamic posture branches, zero count, repeated posture errors and cancellation.

## Shared execution results

<!-- common execution outcomes from src/lib/microduck-execution.ts and control source identity from src/lib/microduck-simulator.ts -->

Control sources created from compiled programs include their exact `program` identity. Legacy sources without that field derive an identity from their artifact, target and frames. `observeMicroDuckExecution` retains the existing wire protocol and physical arrival checks, and attaches the shared runtime `outcome` to accepted updates. Wire `stopped` becomes `cancelled`; only verified engine completion supplies simulator evidence. Saved workspace traces retain this identity, while old documents remain readable.
