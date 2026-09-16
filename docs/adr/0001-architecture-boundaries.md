# ADR 0001: Keep Editor, Runtime, Adapter, and Simulator Boundaries Separate

## Status

Accepted

## Context

BotLab needs to support visual programming, runtime execution, real robot adapters, and simulator integrations without coupling the first web screen to every future implementation detail.

The official Scratch Blocks package is the first visual editor engine, MicroDuck is the first robot target, StackChan is planned, and simulators should use official packages or processes where possible. TurboWarp or raw Blockly can still be evaluated later behind the same editor boundary.

## Decision

BotLab keeps separate package boundaries for the major responsibilities:

- `@botlab/blocks` owns the visual editor boundary and hides Scratch Blocks, TurboWarp, or Blockly-specific details.
- `@botlab/model` owns shared domain concepts and contracts.
- `@botlab/runtime` owns execution orchestration, policy evaluation, scheduling, arbitration, dispatch, and introspection.
- `@botlab/adapters-*` packages own robot-specific capabilities, targets, and transport concerns.
- `@botlab/simulators-core` owns shared simulator contracts and dependency strategy.
- `@botlab/simulators-*` packages own robot-specific simulator bridges, heavy dependencies, assets, and runtime adapters.
- `apps/botlab-web` composes these packages but does not import robot transport, simulator internals, or block-engine globals directly.

Nx project tags enforce these boundaries through `@nx/enforce-module-boundaries` in the root Oxlint config (`.oxlintrc.json`). Blocks may compose UI primitives, while model/runtime stay independent of editor and UI packages. The app imports public package APIs and cannot import Scratch Blocks directly. Simulator core depends only on model/core contracts. `pnpm run test:architecture` verifies representative allowed and forbidden imports using temporary import probes that are removed after each check.

## Consequences

This makes the early codebase more explicit and gives each integration a clear home before the real robotics work begins.

The tradeoff is some upfront ceremony: simple demos need to pass through package contracts instead of importing concrete implementation details directly. That cost is acceptable because BotLab is expected to grow across multiple robot targets, simulators, and editor engines.
