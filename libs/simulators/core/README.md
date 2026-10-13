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

<!-- shared proximity semantics from src/lib/proximity.ts and session.ts -->

`evaluateFrontProximity(depth, timeSeconds, thresholdMeters)` compares the minimum radial hit in the central quarter of each grid axis against a strict threshold (5–400 cm). Every selected zone must have a valid hit; no return, invalid values, missing sensors and samples over 0.1 simulated seconds old are errors, never “clear”. It returns value, distance, threshold, capture time and sequence. `SimulationCommand` supports `kind: 'proximity'`; `SimulationCommandResult.proximity` retains this decision evidence. Sensor configuration optionally selects pinhole projection and a minimum range.

A command result may retain a `decision` with its shared walking condition and boolean outcome, alongside the raw proximity observation. Restoration verifies that the decision agrees with the saved distance.

`head-yaw` requests an optional head orientation in radians. Completed results retain `headYaw` target and observed angle, independently of body turns.

A `posture` command requests sit or stand where supported. Results retain target, observed stable posture and body height in metres.

`observe-posture` returns a timestamped posture observation without advancing physics. A saved compound decision can use distance, posture or both.

`rest` requests observed balance without ending the program. Results retain measured window duration, drift and heading change.

<!-- software evaluation and optional skill results from src/lib/session.ts -->

Pure program evaluations use `program-evaluation`; variable changes and decision snapshots are stored separately from physical measurements. Optional `skill` commands identify left/right kick or the ground gesture, retaining duration and joint excursion alongside measured rest.
