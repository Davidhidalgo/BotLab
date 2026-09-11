# @botlab/simulators-core

Shared simulator contracts and helpers for BotLab.

Keep this package light. Robot-specific simulator dependencies, assets, and runtime bridges belong in sibling packages such as `libs/simulators/microduck`.

## Public API

<!-- exported simulator contracts and helpers from src/index.ts -->

- `SimulatorBridge`: common simulator bridge shape.
- `SimulatorSnapshot`: current simulator state summary.
- `SimulatorRunResult`: result returned after simulating a compiled behavior.
- `defineSimulatorIntegration`: typed helper for one simulator integration.
- `defineSimulatorIntegrations`: typed helper for integration lists.
- `createSimulatorSnapshot`: copies a snapshot defensively.
