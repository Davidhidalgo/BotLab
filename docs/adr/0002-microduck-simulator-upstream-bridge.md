# ADR 0002: Integrate MicroDuck Simulator Through a Pinned Upstream Bridge

## Status

Accepted

Hosting amendment reviewed 2026-09-13: document the iframe host already used by BotLab while retaining the package boundaries and pinned-upstream direction. Reproducible setup, asset verification and a single receiver generator remain follow-up work in the implementation plan.

Backend reassessment opened 2026-09-13: [native versus browser simulator evaluation](../microduck-simulator-evaluation.md). The iframe remains the implemented path while the proposed native-backend experiment is discussed. This ADR does not establish that daemon-backed simulation was evaluated and rejected; the original version selected in-process browser hosting, and the later amendment described the implementation already present.

Experiment update: the user authorized the native probe, which passed local service/ToF/skills/interruption checks and the 10° turn regression budget. The evaluation now records measured results. Native app transport and presentation remain open, so the implemented iframe path is retained pending the next integration decision.

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
- The default UI integration is an isolated iframe running the prepared official simulator host. BotLab sends commands through its controller/source bridge using origin-checked, identified postMessage messages and observes execution acceptance, progress, completion and stop acknowledgement. An iframe load or successful command validation is not evidence of completed execution.
- The app composes the simulator's public lifecycle and transport APIs. Robot-specific receiver code, motion tracking, heavy dependencies and upstream patching belong to `@botlab/simulators-microduck`; the setup tool should consume the package's generated bridge instead of maintaining a separate implementation.
- In-process hosting remains a possible future integration, to be justified by a concrete product or operational requirement rather than treated as a prerequisite for simulator development.
- BotLab will not modify `node_modules` or patch upstream code in place. If upstream source code must be adapted, the copied or mirrored source must be pinned, read-only by convention, license-checked, and wrapped by BotLab-owned adapter code.

The experimental native path now lives separately in `@botlab/simulators-microduck-native`. The app selector can switch to a local gateway and a MuJoCo-rendered scene of the real simulated body state, while retaining the iframe. Native services own physics/policies; the library owns the gateway, measured program controller and browser lease. The app composes public connection APIs and XState lifecycle. This does not remove the iframe or establish full feature parity.

## Consequences

This keeps the shared simulator layer small and makes each robot simulator independently replaceable.

Updating MicroDuck becomes an explicit infrastructure step: change upstream pins, refresh hashes, run affected build/test/lint, and adjust only BotLab's adapter layer if the upstream control API changed.

The tradeoff is more setup work. We need cache logic, hash verification, license notes, and user-facing loading/error states for first-run downloads. That cost is acceptable because it avoids embedding large or ambiguously licensed assets in BotLab and keeps future simulator integrations from affecting each other.

The iframe adds an asynchronous protocol and a separately prepared host. Bridge compatibility, trusted origins, interruption and missing acknowledgements need explicit contracts and integration coverage. The current setup script defaults to the mutable `main` revision, and receiver generation is duplicated in the library and tool; these are known gaps against the reproducibility decision above, not completed guarantees.
