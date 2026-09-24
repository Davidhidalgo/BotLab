# botlab-model

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test botlab-model` to execute the unit tests via [Vitest](https://vitest.dev/).

## Execution contracts

<!-- execution contracts exported from src/lib/execution.ts -->

`ProgramIdentity` identifies an exact program revision and target. `createProgramIdentity` canonicalizes finite JSON without depending on property order; `identifyCompiledProgram` includes commands (including nested branches and source-block IDs) and required policy IDs. `sameProgram` compares all identity fields. The revision is opaque data for equality and is not a display name or authenticity signature.

`ExecutionResult` carries a unique execution ID, optional program identity for preflight/empty-queue failures, status, evidence, diagnostic code and active source-block ID. Statuses distinguish validation, acceptance, running, dispatch-only acknowledgement, completion, cancellation, failure, required confirmation and no work. Evidence distinguishes no physical proof, dispatch acknowledgement, simulator completion and hardware completion.

<!-- robot-specific data and fixtures: src/lib/robot-module.ts and src/testing.ts -->

`robotPaletteBlockTypes(module, capabilityIds)` returns the blocks an editor should offer: the shared structure (green flag, wait, repeat), the robot's executable blocks and, whenever one of those is a condition (Boolean block), `control_if`/`control_if_else`. Conditionals are therefore common control, available to any robot that exposes a condition.

Robot-specific program steps (`MicroDuckProgramStep`, `StackChanProgramStep`, …) live in their adapter packages, and each `RobotModule` contributes its skills, policies and behaviors through `catalog`. Shared spec fixtures (`sampleSkills`, `samplePolicies`, `sampleMicroDuckLedBehavior`, `sampleMicroDuckCompiledBehaviorArtifact`, …) are exported from `@botlab/model/testing`; Oxlint rejects that import outside `*.spec.ts(x)` files.

## Messages

<!-- message contracts exported from src/lib/message.ts -->

`BotLabMessage` is a user-facing message with a stable `code`, optional `params` and an English `text` fallback. Libraries throw `BotLabError(code, text, params)` for failures that hosts should be able to localize, and hosts convert any thrown value with `toBotLabMessage(error, fallback)`; errors that are not `BotLabError`s become `error.unknown` with their original text. Translation catalogs live in the host (for the web app, `formatBotLabMessage` in `apps/botlab-web/src/app/workbench-labels.ts`).
