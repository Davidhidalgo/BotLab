# BotLab Implementation Plan

This document is the working implementation plan for BotLab. It keeps the roadmap, architecture decisions, and acceptance criteria in the repository so the project can grow without losing context.

## Product Goal

BotLab should let a user build robot behaviors visually, test them safely in a simulator when available, inspect what the runtime is doing, and deploy the behavior to supported robot targets through adapters.

The first supported target is MicroDuck. StackChan is planned as the next robot family. The visual editor should use the official Scratch Blocks package first, while keeping TurboWarp or raw Blockly as future swappable options behind an internal BotLab boundary.

## Architecture Principles

- Use Nx generators whenever possible for apps, libraries, components, and tooling.
- Keep robot-specific code out of the web app.
- Keep visual editor engine details inside `@botlab/blocks`.
- Keep behavior execution semantics inside `@botlab/runtime`.
- Keep shared language and contracts inside `@botlab/model`.
- Integrate official simulators as dependencies or external processes where possible.
- Treat generated artifacts as first-class data: blocks, compiled plans, traces, logs, simulator outputs, and deployment payloads.
- Make safety policy explicit before real robot execution.

## Current State

Implemented:

- Nx monorepo generated with `create-nx-workspace`.
- React + TypeScript web app in `apps/botlab-web`.
- Tailwind and shadcn/ui-style primitives in `libs/ui`.
- Visual editor shell in `libs/blocks`.
- Shared BotLab model in `libs/botlab-model`.
- Runtime facade in `libs/runtime`.
- Initial MicroDuck adapter contract in `libs/adapters/microduck`.
- Planned StackChan adapter contract in `libs/adapters/stackchan`.
- Simulator integration contracts in `libs/simulators/core` and robot-specific simulator packages under `libs/simulators/*`.
- First screen showing project model, runtime counts, targets, and editor placeholder.
- Project tags in each `project.json` for app, UI, model, runtime, adapter, simulator, and editor boundaries.
- Lightweight ADR folder with the first boundary decision.
- BotLab glossary linked from the README.
- Expanded domain model contracts for policies, skills, behavior graphs/AST, artifacts, target profiles, and capability schemas.
- Sample MicroDuck LED and StackChan expression behaviors in `@botlab/model`.
- Validation helpers and model tests for valid and invalid behavior definitions.
- Adapter target profiles and capability command schemas for MicroDuck and StackChan placeholders.
- Build targets for every library plus the root `npm run build:libs` workflow.
- Root Nx affected scripts for build, test, and lint workflows.
- Validation helpers for policies, capability schemas, compiled behavior artifacts, and behavior graph/AST references.
- Initial `@botlab/blocks` editor boundary with workspace artifacts, import/export helpers, a mock provider, workspace states, callbacks, and package tests.
- `@botlab/blocks` now has a Scratch Blocks provider boundary with Scratch XML workspace support and an injected bridge contract.
- `@botlab/blocks` now depends on the official `scratch-blocks` package locally, mounts it directly without iframes, and registers an initial BotLab custom MicroDuck block.
- The web app auto-mounts the real Scratch Blocks editor in the browser, serves Scratch/Blockly media from local dependencies in development, and copies those assets into production builds.
- App-level workspace state receives mock editor artifact updates and displays editor status metadata.
- Runtime sessions can load compiled behavior artifacts, dispatch commands through injected target dispatchers, emit lifecycle events, and produce trace artifacts.
- Runtime sessions can load validated behavior definitions and record structured diagnostics with validation, lifecycle, adapter, transport, scheduler, simulator, and policy categories.
- Runtime can produce global introspection snapshots with targets, capabilities, simulators, sessions, diagnostics, active session counts, and recent events.
- Runtime evaluates policy rules for compiled plans, blocks denied execution, pauses for required confirmation, records policy diagnostics, and resumes after confirmation.
- Runtime has an initial priority run queue, scheduler events, capability locks, and arbitration diagnostics for conflicting sessions.
- The web app can run a MicroDuck runtime demo from the UI and display session state, queue entries, and capability locks.
- The web app uses an initial XState v5 parallel flow machine for workspace, build, simulation, and execution lifecycles.
- The UI now exposes a demo compile step that produces a compiled plan artifact before runtime execution is enabled.
- The demo compile step now reads the current Scratch Blocks XML and turns the BotLab MicroDuck LED block into a runtime command.
- The UI now surfaces the compiled MicroDuck command with target, LED pattern, and brightness details.
- The UI now exposes a demo simulation step that verifies the compiled plan before runtime execution is enabled.
- The UI now exposes a target selector that defaults to the MicroDuck simulator demo target and blocks planned or incompatible targets from compilation.
- The UI now exposes a runtime log panel with recent events, session trace entries, and diagnostics.
- The UI now exposes an artifact inventory for the current workspace, compiled plan, simulation output, and runtime trace.
- The UI now exposes policy status for the compiled demo plan, including decision, confirmation state, and rule ids.

Not implemented yet:

- Real block-to-behavior serialization and compilation from Scratch XML.
- Behavior serialization and compilation.
- Real MicroDuck transport.
- Real simulator bridge.
- Timed/event-driven scheduler loop.
- Full arbitration engine beyond initial priority queue and exclusive capability locks.
- Richer runtime introspection UI beyond the initial event, trace, diagnostic, artifact, and policy summaries.
- Full product statechart for deployment, recovery, real compiler integration, and real simulator bridge integration.
- Persistence.
- Deployment workflow.

## Milestone 1: Project Foundation

Goal: keep the monorepo stable, understandable, and easy to extend.

Tasks:

- Confirm project naming and package naming conventions.
- Add project tags in each `project.json`, for example `scope:runtime`, `scope:adapter`, `type:ui`.
- Add root scripts for common Nx workflows.
- Add lint/typecheck/build targets where Nx does not infer enough.
- Add a lightweight architecture decision record folder: `docs/adr`.
- Add a `docs/glossary.md` for BotLab terms.

Acceptance criteria:

- `npm run build` passes.
- `npm run test` passes.
- `npm run nx -- show projects` lists every app and library.
- README links to the implementation plan, glossary, and ADR index.

## Milestone 2: Domain Model v1

Goal: make the core BotLab concepts precise enough for the editor, runtime, adapters, and simulators to share.

Packages:

- `@botlab/model`

Tasks:

- Expand `Policy` with rule categories: safety, resource, target, environment, and user confirmation.
- Expand `Skill` with inputs, outputs, required capabilities, and generated block metadata.
- Expand `Behavior` with graph or AST representation.
- Add `BehaviorArtifact` and `CompiledBehaviorArtifact`.
- Add `TargetProfile` with hardware, firmware, simulator, and connection details.
- Add `CapabilitySchema` so adapters can describe commands and telemetry.
- Add validation helpers for behavior plans and adapter manifests.
- Add model unit tests.

Acceptance criteria:

- Model types can represent at least one MicroDuck LED behavior.
- Model types can represent at least one future StackChan expression behavior.
- Model tests cover valid and invalid behavior definitions.
- No app imports robot-specific details directly from model fixtures.

## Milestone 3: Visual Editor Boundary

Goal: turn `@botlab/blocks` into a real boundary for Scratch Blocks first, with room to swap in TurboWarp or Blockly later.

Packages:

- `@botlab/blocks`
- `@botlab/model`

Tasks:

- Choose the official `scratch-blocks` package as the first real editor route.
- Add `BlocksEditorProvider` interface.
- Add `BlocksWorkspaceArtifact` type.
- Add import/export functions for workspace XML or equivalent block format.
- Add a first Scratch XML to MicroDuck demo plan compiler path.
- Add a mock provider for tests and development.
- Add Scratch Blocks provider boundary with an injected bridge contract.
- Add official `scratch-blocks` as a local dependency of `@botlab/blocks`.
- Serve Scratch Blocks and Blockly media assets from the app without exposing `node_modules` paths to the browser.
- Register initial BotLab custom blocks through the Scratch Blocks/Blockly API.
- Add UI states: empty workspace, loaded workspace, dirty workspace, invalid workspace, read-only workspace.
- Add callbacks for artifact updates and validation errors.
- Keep engine-specific globals out of the app.

Acceptance criteria:

- App can load a sample workspace artifact.
- App receives editor changes as BotLab artifacts.
- Editor package can be tested without launching the full app.
- The selected block engine can be swapped without changing `apps/botlab-web`.

Open decisions:

- Whether TurboWarp features should be added later through the same editor boundary.
- Whether BotLab stores blocks as XML, JSON, or a normalized internal artifact.
- How custom robot blocks are registered per adapter.

## Milestone 4: Runtime v1

Goal: define how BotLab executes behavior plans independently of any one robot.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Add runtime session lifecycle: create, start, pause, resume, stop, dispose.
- Add behavior loading and compiled plan loading.
- Add command dispatch abstraction.
- Add event bus for runtime events.
- Add introspection snapshots.
- Add trace generation.
- Add error taxonomy: validation, policy, adapter, transport, scheduler, simulator.
- Add unit tests around lifecycle and dispatch.

Acceptance criteria:

- Runtime can load a compiled behavior plan.
- Runtime can dispatch a command to a fake adapter.
- Runtime produces introspection snapshots and trace artifacts.
- Runtime never imports web UI or block-engine code.

## Milestone 5: Policy Engine v1

Goal: prevent unsafe or unsupported behavior execution before commands reach an adapter.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Add policy evaluation before behavior execution.
- Add policy evaluation before command dispatch.
- Add policy result states: allow, deny, require confirmation, warn.
- Add policy violation artifacts.
- Add default policies for untrusted behavior plans.
- Add target-specific policy overlays.

Acceptance criteria:

- A behavior using an unsupported capability is denied.
- A behavior targeting a planned/offline target is denied.
- A behavior requiring confirmation produces the right runtime state.
- Policy results are visible to the app through introspection.

## Milestone 6: Scheduler and Arbitration

Goal: support multiple behaviors and resolve capability conflicts explicitly.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Implement scheduler profiles: manual, timed, event-driven.
- Implement behavior run queue.
- Implement cancellation and timeout handling.
- Implement arbitration strategies: priority, exclusive lock, cooperative.
- Add capability locks.
- Add tests for conflicting behaviors.

Acceptance criteria:

- Two behaviors cannot command the same exclusive capability at the same time.
- Priority arbitration selects the expected behavior.
- Runtime traces explain scheduler and arbitration decisions.

## Milestone 7: MicroDuck Adapter v1

Goal: connect BotLab to MicroDuck through a real adapter layer.

Packages:

- `@botlab/adapters-microduck`
- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Research MicroDuck connection options and official SDKs.
- Define MicroDuck transport abstraction.
- Implement discovery where possible.
- Implement connection lifecycle.
- Implement LED capability.
- Implement basic motion capability if supported.
- Implement telemetry or health checks if available.
- Add adapter-level tests with fake transport.
- Add docs for local setup.

Acceptance criteria:

- Runtime can list MicroDuck targets.
- Runtime can connect to a fake MicroDuck transport in tests.
- Runtime can dispatch at least one LED command through the adapter.
- Unsupported commands fail with typed adapter errors.

Open decisions:

- USB, WebUSB, serial, Bluetooth, or another transport.
- Whether browser transport is enough or a local bridge process is required.

## Milestone 8: Simulator Integration v1

Goal: let users test behavior without a physical robot when an official simulator exists.

Packages:

- `@botlab/simulators-core`
- `@botlab/simulators-microduck`
- `@botlab/runtime`
- `@botlab/adapters-microduck`

Infrastructure decisions:

- Keep shared simulator contracts in `libs/simulators/core`.
- Keep robot-specific simulator integrations in `libs/simulators/<robot>`, starting with `libs/simulators/microduck`.
- Do not put heavy simulator dependencies in `@botlab/simulators-core`.
- Do not modify `node_modules`.
- Do not vendor upstream MicroDuck meshes, ONNX policies, logos, sounds, or simulator bundles unless licensing is explicitly verified.
- Prefer a pinned upstream asset manifest with hashes and a user cache for MicroDuck simulator assets.
- Integrate the official browser simulator through its controller/source boundary where possible, not through an iframe.
- Use Nx affected validation before committing simulator infrastructure changes.

Tasks:

- Identify official MicroDuck simulator package or process. Done: browser simulator is a Hugging Face Space full app, daemon simulator is a heavier local process path.
- Add simulator bridge interface. Done: initial `SimulatorBridge` contract lives in `@botlab/simulators-core`.
- Add simulator target registration. Done: MicroDuck simulator metadata lives in `@botlab/simulators-microduck`.
- Add upstream manifest types for MicroDuck simulator assets, including URL, revision, hash, and license notes. Done: initial manifest and validation helpers live in `@botlab/simulators-microduck`.
- Add a cache/setup path for MicroDuck simulator assets without committing those assets to the repo. Started: cache planning and setup interfaces now distinguish pending license review, missing assets, stale hashes, blocked assets, and ready assets, and only write downloaded bytes after SHA-256 verification.
- Add a BotLab simulator control source that maps compiled BotLab commands to the official simulator controller contract. Started: compiled LED and differential drive commands now map into typed MicroDuck simulator control frames, and BotLab exposes a source compatible with the official simulator `Controller` source contract.
- Spike loading the official simulator game core in the BotLab UI through `@botlab/simulators-microduck`. Started: a lazy runtime connector can register the BotLab source with the official simulator controller once the game runtime is loaded.
- Map simulator capabilities to the same adapter contract as hardware.
- Add simulator output artifacts. Started: the simulation flow now creates a typed `simulator-output` artifact with command count, command echoes, simulator messages, and the bridge snapshot, and the web app surfaces it in the artifact inventory and simulator host.
- Add app UI for selecting hardware versus simulator target.

Acceptance criteria:

- Runtime sees simulator targets and hardware targets through the same target model.
- A simulated MicroDuck behavior can produce an output artifact. Started: the demo MicroDuck simulator path emits a `simulator-output` artifact for the compiled plan.
- Simulator integration does not require copying official simulator source or assets into BotLab without license verification.
- First-run simulator asset loading has clear pending, success, and failure states.
- Updating upstream MicroDuck simulator inputs is a manifest/hash update plus adapter verification, not an ad hoc patch.

Next handoff:

1. Verify licenses for the official browser simulator source, MicroDuck model assets, ONNX policies, meshes, and sounds.
2. Fill reviewed SHA-256 values and license decisions into the MicroDuck upstream manifest once the exact official asset set is approved.
3. Add a concrete browser or local cache store implementation for the setup/download interfaces.
4. Add the web UI host that lazy-loads the official simulator runtime, calls `connectMicroDuckBotLabSourceToOfficialSimulator`, and renders the simulator scene. Started: the workbench now reserves a MicroDuck simulator host surface with asset-gated runtime state.
5. Continue UI state for simulator load failure and ready/running states. Started: the app now surfaces official simulator asset readiness and per-asset setup status from the MicroDuck manifest.
6. Keep the existing local bridge tests green while adding browser-level smoke coverage for the visible simulator.

## Milestone 9: Artifacts and Persistence

Goal: make user work durable and inspectable.

Packages:

- `@botlab/model`
- `@botlab/runtime`
- `apps/botlab-web`

Tasks:

- Define artifact storage interface.
- Store block workspace artifacts.
- Store compiled behavior artifacts.
- Store trace and log artifacts.
- Add import/export from the app.
- Add local persistence first, likely IndexedDB or filesystem bridge depending on target environment.

Acceptance criteria:

- User can create or load a sample behavior.
- User can refresh the app without losing the current workspace.
- Runtime traces can be inspected after execution.

## Milestone 10: App UX v1

Goal: turn the first screen into a usable BotLab workbench.

Packages:

- `apps/botlab-web`
- `@botlab/ui`
- `@botlab/blocks`
- `@botlab/runtime`

Tasks:

- Add main layout: editor, target panel, runtime panel, artifact panel.
- Add target selector.
- Add capability browser.
- Add run controls: validate, simulate, run, stop.
- Add policy status.
- Add runtime log panel.
- Add behavior artifact list.
- Add empty/error/loading states.

Acceptance criteria:

- A user can select MicroDuck simulator or hardware target.
- A user can validate a sample behavior.
- A user can run a sample behavior against a fake/simulated target.
- App communicates status without exposing internal implementation details.

## Milestone 11: StackChan Planning

Goal: prepare StackChan support without slowing down MicroDuck v1.

Packages:

- `@botlab/adapters-stackchan`
- `@botlab/model`

Tasks:

- Research StackChan capabilities and transports.
- Define initial capability map: expression, sound, speech, motion if applicable.
- Define future simulator strategy.
- Add sample behavior fixtures.
- Keep adapter status as `planned` until at least one real capability works.

Acceptance criteria:

- StackChan adapter contract is documented.
- App can show StackChan as planned without implying it is executable.
- Model supports StackChan-style expression skills.

## Milestone 12: Developer Experience and Release Readiness

Goal: make BotLab easy to contribute to and safe to change.

Tasks:

- Add CI workflow for build and tests.
- Add formatting command.
- Add dependency update policy.
- Add conventional commit guidance if desired.
- Add issue templates for adapters, runtime, editor, and simulator work.
- Add release notes process.
- Add security notes for robot execution and local transports.

Acceptance criteria:

- Pull requests run build and tests.
- New adapter work has a clear template.
- New block-engine work has a clear boundary.
- Security-sensitive robot execution paths are documented.

## Near-Term Backlog

Recommended next tasks:

1. Add project tags and enforce module boundaries with Nx.
2. Create `docs/glossary.md`.
3. Create first ADR: `docs/adr/0001-monorepo-and-boundaries.md`.
4. Add `@botlab/model` tests for MicroDuck and StackChan sample behaviors.
5. Add a mock `BlocksEditorProvider`.
6. Add a fake runtime adapter for tests.
7. Add capability browser UI to the first screen.

## Technical Risks

- Scratch Blocks, TurboWarp, or Blockly integration may require asset loading or build configuration that conflicts with Vite.
- Real robot transports may require browser APIs, native bridges, or permissions that change the app architecture.
- Simulator licensing or packaging may prevent direct dependency integration.
- Runtime policy and arbitration need careful design before real robot execution.
- The local Codex sandbox blocks some Nx/Vite development-server operations without elevated permission.

## Working Rules

- Prefer Nx generators for new projects and library structure.
- Keep implementation commits scoped by milestone or package.
- Keep robot hardware code behind adapters.
- Keep simulator-specific code behind simulator bridges.
- Keep browser UI declarative and domain-driven.
- Add tests when changing shared model, runtime, adapter contracts, or execution behavior.
