# BotLab

BotLab is a local-first monorepo for building, simulating, and running robot behaviors from a visual editor. This first version prioritizes architecture over robotics depth: the app starts, the domain language is explicit, and each future integration has a clear boundary.

## Stack

- Nx monorepo generated with `create-nx-workspace`.
- React + TypeScript app at `apps/botlab-web`.
- Vite for local development and builds.
- Tailwind CSS with shadcn/ui-style primitives in `libs/ui`.
- Shared BotLab domain model in `libs/botlab-model`.
- Common runtime orchestration in `libs/runtime`.
- Robot adapters under `libs/adapters/*`.
- Encapsulated visual editor shell in `libs/blocks`.
- Simulator contracts and robot-specific integrations under `libs/simulators/*`.

## Project Shape

```txt
apps/
  botlab-web/                  React app and first BotLab screen
libs/
  botlab-model/                Core concepts and shared contracts
  runtime/                     Runtime session, adapter registry, introspection
  blocks/                      Scratch Blocks/TurboWarp boundary
  adapters/
    microduck/                 Initial MicroDuck adapter contract
    stackchan/                 Future StackChan adapter placeholder
  simulators/
    core/                      Shared simulator contracts
    microduck/                 MicroDuck simulator integration boundary
  ui/                          shadcn/ui-style primitives
```

## Implementation Plan

The detailed roadmap lives in [docs/implementation-plan.md](docs/implementation-plan.md). It covers milestones, package ownership, acceptance criteria, open decisions, near-term backlog, and technical risks.

Supporting project docs:

- [Glossary](docs/glossary.md)
- [Architecture Decision Records](docs/adr/README.md)

## Domain Concepts

BotLab starts with these concepts in the model:

- `policy`: safety rules and execution constraints.
- `skill`: reusable robot abilities backed by capabilities.
- `behavior`: block-authored logic that can be scheduled and run.
- `capability`: hardware or simulated affordances exposed by adapters.
- `target`: a physical robot or simulator destination.
- `artifact`: blocks, compiled plans, traces, logs, and simulator outputs.
- `introspection`: runtime health, telemetry, and diagnostics.
- `scheduler`: manual, event-driven, or timed execution model.
- `arbitration`: conflict resolution when behaviors compete for capabilities.

## Design Decisions

### The visual editor is isolated

`@botlab/blocks` exposes `BlocksEditorShell` as a host boundary. The app should not import Scratch Blocks, TurboWarp, Blockly internals, or simulator-specific code directly. Future block engines can mount behind this package and communicate through BotLab artifacts.

### Runtime and adapters stay separate

<!-- runtime configuration and lifecycle from libs/runtime/src/lib/runtime.ts -->

`@botlab/runtime` accepts adapters and simulator integrations as configuration. MicroDuck and StackChan packages expose targets and capabilities through the shared `BotLabAdapter` contract.

The runtime pauses between commands, cancels queued work on stop/dispose, and supplies dispatchers with a cooperative abort signal. Locks remain held until any in-flight dispatch settles. This is not a hardware emergency-stop guarantee; see the [runtime lifecycle contract](libs/runtime/README.md).

### Simulators are dependencies where possible

`@botlab/simulators-core` owns the lightweight simulator contracts. Robot-specific packages such as `@botlab/simulators-microduck` own heavy simulator dependencies, assets, and bridges. The preferred path is to depend on official simulator packages or processes instead of copying simulator code into BotLab.

For MicroDuck, BotLab will use a pinned upstream bridge strategy: BotLab-owned adapter code maps BotLab commands into the simulator, while upstream assets are referenced by manifest and loaded into a user cache with verification instead of being committed into this repo.

### Nx commands in this environment

The local sandbox blocks the Unix sockets used by the Nx daemon and isolated plugins. Use:

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false nx <command>
```

The package scripts already include those environment variables.

## Commands

```sh
npm run dev
npm run build
npm run build:libs
npm run test
npm run affected:build
npm run affected:test
npm run affected:lint
npm run microduck:sim -- --start
npm run nx -- show projects
```

Use the affected scripts for everyday validation when only part of the workspace changed. Use `build:libs` when you want a full library contract check.

`npm run microduck:sim -- --start` prepares a local checkout of the official MicroDuck browser simulator under `tmp/microduck-simulator`, hydrates Git LFS assets into that ignored checkout, injects the BotLab postMessage control source, and starts the patched simulator host. Keep `npm run dev` running separately for the BotLab app.

## Simulator Progress

<!-- measured movement, source block tracking, and local arena from libs/simulators/microduck/src/lib/microduck-distance.ts, apps/botlab-web/src/app/app.tsx, and tools/microduck/prepare-official-simulator.mjs -->

MicroDuck walk blocks now finish on measured horizontal displacement from each block's start position, not a speed-to-duration estimate. Wait blocks hold zero motion for their duration. The editor highlights the active block, and the simulator panel displays distance progress, a wait countdown, or localized execution errors. Lost position telemetry, scene interruptions, implausible position jumps, and stalled movement fail the run instead of claiming arrival. This is straight-line displacement, not the HUD's accumulated odometer, and physics can drift slightly after the stop command.

A failure reported by the simulator stops the program but keeps the scene open, including its current robot configuration. The failing block stays highlighted; editing and running again reuses the loaded runtime. Missing communication or unconfirmed execution still closes the iframe as a stop fallback.

<!-- visual movement palette from libs/blocks/src/lib/scratch-blocks-local-bridge.ts and measured turns from libs/simulators/microduck/src/lib/microduck-turn.ts -->

The Movement category offers forward/backward BotLab steps (0.5 m each), left/right quarter turns, and a half turn. Precise movement offers forward/backward meters and signed degrees. Negative angles turn left; positive angles turn right. Each block has a bundled SVG icon and Catalan, Spanish and English labels. Turns finish on measured yaw and report progress in degrees; regenerate the simulator receiver with `npm run microduck:sim -- --no-install --no-lfs-hydrate` when updating an existing local checkout. Old meter-based programs remain compatible.

<!-- importable movement example from examples/microduck-movement.botlab.json -->

Import `examples/microduck-movement.botlab.json` with the workbench's Import program action to try two steps forward, a left turn, two more steps, a one-second wait, a half turn, and one step backward. Importing does not execute the program.

The setup tool expands the ignored official checkout's arena to 12 x 12 meters so the sample 5-meter walk has room. Existing checkouts need `npm run microduck:sim -- --no-install --no-lfs-hydrate` to refresh the generated bridge and arena patch. No official assets are added to Git.

## Workspace Persistence

<!-- workbench layout from apps/botlab-web/src/app/workbench-layout.tsx, apps/botlab-web/src/styles.css, and libs/blocks/src/lib/blocks.tsx -->

The main workbench shows the block editor and simulator side by side from 1024 px upwards. Smaller screens use keyboard-accessible Program and Simulator tabs. Switching views keeps both surfaces mounted; inactive mobile views are offscreen and inert, rather than unloading the simulator. Diagnostic panels and simulator details are collapsed by default, while execution progress and errors remain visible. Narrow editors (up to 600 px) use an overlay block palette; the palette button and category list reopen it. Scratch resizes with its container without replacing the workspace. New workbench labels are available in Catalan, Spanish, and English.

<!-- block localization from libs/blocks/src/lib/block-messages.ts and libs/blocks/src/lib/scratch-blocks-local-bridge.ts -->

Blocks follow the selected UI locale (Catalan by default), including the palette, standard Scratch messages, MicroDuck dropdown labels and tooltips. Language changes preserve the program's executable identifiers and values and do not restart simulation. Versioned display-only catalogs and local translation overlays provide the extension point for external integrations; see `libs/blocks/README.md`. Repository/policy importing and automatic translation are not implemented by this catalog layer.

<!-- scene reset lifecycle from apps/botlab-web/src/app/app.tsx and apps/botlab-web/src/app/simulator-execution-machine.ts -->

The simulator toolbar's Reset scene action replaces only the simulator iframe, returning the robot and scene to their initial state. It cancels launch preparation, stops and disposes the previous command transport, and removes the pending program before reloading. Blocks and the last execution trace are preserved; an active trace is marked stopped. Reset does not compile or run anything. Run is disabled during the reload and must be pressed explicitly afterwards. This currently reloads the simulator runtime rather than resetting physics in place.

<!-- workspace document schema and storage behavior from apps/botlab-web/src/app/workspace-storage.ts -->

BotLab automatically saves Scratch XML, the selected UI language, and the last simulator execution trace in this browser's local storage (`botlab.workspace.v1`). The versioned JSON document is limited to 2 MB and retains up to 64 execution events with their original control-frame plan. Reloading restores the workspace but not compiled approval, a connection, or running execution; a previously active trace is marked interrupted. Invalid documents and failed writes do not overwrite the last stored copy.

The editor toolbar imports and exports `botlab-workspace.json` documents. Importing replaces the current workspace and disconnects the simulator. Storage is local to the browser and exact site origin, not synchronized between devices; use export/import when moving devices or changing a temporary tunnel URL. These controls do not recover work lost before autosave was introduced.

## Remote Preview

<!-- simulator URL configuration from apps/botlab-web/vite.config.ts and apps/botlab-web/src/app/app.tsx -->

`BOTLAB_SIMULATOR_URL` overrides the simulator iframe URL at build or dev-server startup. It defaults to `http://127.0.0.1:4300/?boot=1`. For a combined static preview, set it to `/simulator/?boot=1`, build BotLab, and serve the simulator build under `/simulator/` (build upstream with `VITE_BASE=/simulator/`). The simulator's generated message receiver must allow the exact public BotLab origin via `microduck:sim -- --botlab-origin https://your-preview-host` before building it.

Expose only the combined static build through a temporary tunnel, not the Vite development server. A Quick Tunnel URL is public and temporary; it requires the local preview process, tunnel, and host computer to remain running. The simulator and its assets stay in the ignored local checkout, not in Git. Rebuild the preview to include later code changes. Restore the local simulator's allowed origin after building the remote copy if also using the local development preview.

When generating code, prefer Nx generators:

```sh
npm run nx -- g @nx/js:lib my-lib --directory=libs/my-lib
npm run nx -- g @nx/react:lib my-ui-lib --directory=libs/my-ui-lib
```
