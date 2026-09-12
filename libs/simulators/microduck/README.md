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
- `createMicroDuckBotLabOfficialSource`: adapts BotLab control frames to the official simulator `Controller` source contract.
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

`running` is emitted after startup unlock and periodically while the controller polls the source. `completed` means the source consumed all frames, not that measured physical distance matched the requested distance. The app waits up to 60 seconds for initial engine progress, detects missing running heartbeats after 15 seconds, and requires stop confirmation within 3 seconds. Missing confirmation closes the iframe as a simulator-only fallback. This does not implement a hardware emergency stop or the shared runtime's pause/resume contract. The direct in-process source remains a lower-level frame consumer; acknowledgments belong to the generated browser source.
