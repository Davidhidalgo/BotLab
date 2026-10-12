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

<!-- shared web session contracts exported from src/lib/session.ts -->

`SimulationSession` owns load/start/pause/step/reset/stop, observed commands, snapshots and disposal. `SimulationManifest` pins scene resources, joint actuation and optional controller metadata. `SimulationFrame` uses metres, seconds, radians, Z-up positions and row-major rotations. `SimulationEvidenceLevel` separates command validation, kinematic preview, physics and closed-loop policy. These are data contracts without engine or renderer imports.

`SimulationMotionGoal` describes a measured distance or turn, a bounded controller speed and a simulated timeout. `SimulationCommandResult` can retain the requested distance/angle and measured forward displacement/unwrapped yaw; legacy timed velocity yaw remains the shortest signed heading change.

`SimulationDepthSensor` optionally configures a named site, grid, field of view, range and simulated frequency. `SimulationDepthFrame` carries metre distances, per-zone hit/no-return/invalid status, simulated capture time, sequence, sensor pose and sampling cost; absent returns are `null`, never zero. Site axes are +X forward, +Y left, +Z up; grid row zero is up and column zero left.
