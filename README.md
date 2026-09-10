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
- Simulator integration contracts in `libs/simulators`.

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
  simulators/                  Official simulator integration contracts
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

`@botlab/simulators` records official simulator integration strategies. The preferred path is to depend on official simulator packages or processes instead of copying simulator code into BotLab.

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
npm run nx -- show projects
```

Use the affected scripts for everyday validation when only part of the workspace changed. Use `build:libs` when you want a full library contract check.

When generating code, prefer Nx generators:

```sh
npm run nx -- g @nx/js:lib my-lib --directory=libs/my-lib
npm run nx -- g @nx/react:lib my-ui-lib --directory=libs/my-ui-lib
```
