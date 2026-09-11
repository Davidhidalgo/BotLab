# ADR 0002: Integrate MicroDuck Simulator Through a Pinned Upstream Bridge

## Status

Accepted

## Context

BotLab needs to show a real MicroDuck simulator in the UI without turning the shared simulator layer into a heavy dependency bucket.

The official browser simulator is a complete Vite/React application, not a stable npm library intended for direct consumption. It uses MuJoCo WebAssembly, ONNX Runtime Web, Three.js, robot models, meshes, policies, sounds, and simulator-specific control code. Community examples show two useful patterns:

- add a new simulator input source at the simulator controller boundary;
- fetch upstream MicroDuck model and policy assets at runtime from pinned revisions instead of vendoring them.

The asset and licensing story matters. BotLab should not commit upstream robot meshes, ONNX policies, logos, sounds, or generated simulator bundles unless their licenses explicitly allow that use.

## Decision

BotLab will keep simulator infrastructure split by responsibility:

- `@botlab/simulators-core` owns lightweight shared simulator contracts.
- `@botlab/simulators-microduck` owns the MicroDuck-specific bridge, optional heavy dependencies, asset manifest, cache integration, and BotLab command mapping.

The MicroDuck simulator integration will use a pinned upstream strategy rather than a broad vendored copy:

- BotLab owns a `MicroDuckSimulatorBridge` that speaks BotLab concepts.
- BotLab adds a MicroDuck control source that maps BotLab commands to the simulator controller contract.
- Upstream simulator assets are referenced through a manifest with source URL, revision, expected hash, and license notes.
- Assets are fetched into a user cache at runtime or during an explicit setup step, never silently committed into the repo.
- Heavy runtime pieces such as MuJoCo, ONNX Runtime, Three.js/R3F, policies, and meshes stay inside `@botlab/simulators-microduck` and should be lazy-loaded by the app.
- The default UI integration should be in-process through the simulator bridge, not an iframe.
- BotLab will not modify `node_modules` or patch upstream code in place. If upstream source code must be adapted, the copied or mirrored source must be pinned, read-only by convention, license-checked, and wrapped by BotLab-owned adapter code.

## Consequences

This keeps the shared simulator layer small and makes each robot simulator independently replaceable.

Updating MicroDuck becomes an explicit infrastructure step: change upstream pins, refresh hashes, run affected build/test/lint, and adjust only BotLab's adapter layer if the upstream control API changed.

The tradeoff is more setup work. We need cache logic, hash verification, license notes, and user-facing loading/error states for first-run downloads. That cost is acceptable because it avoids embedding large or ambiguously licensed assets in BotLab and keeps future simulator integrations from affecting each other.
