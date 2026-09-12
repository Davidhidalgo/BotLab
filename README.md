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

`@botlab/runtime` accepts adapters and simulator integrations as configuration. MicroDuck and StackChan packages expose targets and capabilities through the shared `BotLabAdapter` contract.

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

## Workspace Persistence

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
