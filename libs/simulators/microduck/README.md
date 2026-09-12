# @botlab/simulators-microduck

MicroDuck simulator integration package.

This is the home for the future MuJoCo/ONNX/browser simulator bridge. The shared simulator contracts stay in `@botlab/simulators-core`.

## Public API

<!-- exported MicroDuck simulator API from src/index.ts -->

- `microDuckOfficialSimulatorIntegration`: the MicroDuck simulator integration metadata.
- `microDuckSimulatorIntegrations`: list used by the runtime/app composition layer.
- `microDuckSimulatorAssetManifest`: pinned upstream asset manifest for simulator setup.
- `createMicroDuckSimulatorBridge`: creates the current MicroDuck simulator bridge.
- `createMicroDuckSimulatorControlSource`: maps compiled BotLab commands into MicroDuck simulator control frames.
- `createMicroDuckSimulatorAssetCachePlan`: plans required cache work from the manifest.
- `inspectMicroDuckSimulatorAssetCache`: reads a cache store and verifies cached asset hashes.
- `setupMicroDuckSimulatorAssetCache`: downloads reviewed assets and writes only hash-verified bytes.
- `validateMicroDuckSimulatorAssetManifest`: validates manifest shape before setup.
