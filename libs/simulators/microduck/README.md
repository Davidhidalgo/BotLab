# @botlab/simulators-microduck

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

The default official-simulator factory calibrates the Feet reverse velocity command to -0.4 because the bundled walking policy can stall at the upstream -0.2 input. It preserves forward/turn limits, roller limits, and manual controls. This calibration is simulator-only; it does not change the lower-level source's caller-provided limits or establish a hardware speed. Explicit `velocityLimitsExpression` overrides remain supported.

`running` is emitted after startup unlock and approximately every 100 ms while the controller polls the source, with `frameIndex`, `elapsedMs`, and `distanceMeters` or `turnedDegrees` when applicable. Frames retain the compiled command's optional `sourceBlockId` for editor highlighting; replies do not select arbitrary blocks. The client rejects invalid numeric progress and unknown error codes.

The client requires an arrival measurement for every distance or turn frame before accepting `completed`. Older patched hosts that acknowledge completion without measured arrival fail explicitly and must be regenerated with the setup tool.

Distance frames ignore legacy `durationMs` estimates. They complete only when horizontal displacement from the frame's initial physics position reaches `distanceMeters`; each frame takes a fresh origin. This is not accumulated path length or the HUD odometer, and small post-command drift is possible. Zero meters is a no-op. Position jumps above `max(0.5 m, 5 * dt m)`, unavailable telemetry, ten seconds without at least 1 cm of new progress, or exceeding `max(30 s, distance / 0.05 m/s)` fail and clear commands. Wait frames retain controller priority even at zero velocity, preventing other input sources from taking over during a wait. Re-locking the scene after execution starts fails the run.

Turn frames use `angleDegrees` (-360 to 360, negative left / positive right), exclusive of distance and duration. They unwrap successive yaw measurements and project the signed rotation onto the requested direction, so oscillation and opposite rotation do not count as arrival. Angular power reduces near the target. Zero degrees is a no-op. Missing telemetry, implausible heading jumps, ten seconds without angular progress, or exceeding `max(30 s, abs(angle) / 3)` fail the run. Completion is measured crossing of the requested angle, not a guarantee against subsequent physical drift.

`completed` means all frames met their consumption conditions, including measured arrival for distance and turn frames, not that every robot feature or LED is physically simulated. The app waits up to 60 seconds for initial engine progress, detects missing running heartbeats after 15 seconds, and requires stop confirmation within 3 seconds. Missing confirmation closes the iframe as a simulator-only fallback. Confirmed simulator failures stop the program but retain the scene for editing, retrying, or resetting. The observer assigns `failureOrigin: 'simulator'` to validated failure replies and `'transport'` to delivery or unconfirmed-arrival failures; timeouts also retain the close fallback. This does not implement a hardware emergency stop. The direct in-process source remains a lower-level frame consumer; acknowledgments belong to the generated browser source.
