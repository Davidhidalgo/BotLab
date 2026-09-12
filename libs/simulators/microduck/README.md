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
- `createMicroDuckBotLabPostMessageSourceModule`: generates the standalone `controls/botlab.js` module for a patched official simulator host.
- `createMicroDuckOfficialSimulatorPatchInstructions`: returns the import/source registration hints for the official simulator `Controller`.
- `patchMicroDuckOfficialSimulatorGameSource`: idempotently patches the official simulator `game.js` source to import and register the BotLab source.
- `createMicroDuckSimulatorControlMessage`: wraps BotLab control frames in the stable postMessage envelope.
- `parseMicroDuckSimulatorControlMessage`: validates a candidate postMessage payload before loading frames.
- `postMicroDuckSimulatorControlSource`: sends BotLab control frames to a BotLab-enabled simulator window.
- `createMicroDuckSimulatorAssetCachePlan`: plans required cache work from the manifest.
- `inspectMicroDuckSimulatorAssetCache`: reads a cache store and verifies cached asset hashes.
- `setupMicroDuckSimulatorAssetCache`: downloads reviewed assets and writes only hash-verified bytes.
- `validateMicroDuckSimulatorAssetManifest`: validates manifest shape before setup.
