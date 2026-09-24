# botlab-model

This library was generated with [Nx](https://nx.dev).

## Running unit tests

Run `nx test botlab-model` to execute the unit tests via [Vitest](https://vitest.dev/).

## Execution contracts

<!-- execution contracts exported from src/lib/execution.ts -->

`ProgramIdentity` identifies an exact program revision and target. `createProgramIdentity` canonicalizes finite JSON without depending on property order; `identifyCompiledProgram` includes commands (including nested branches and source-block IDs) and required policy IDs. `sameProgram` compares all identity fields. The revision is opaque data for equality and is not a display name or authenticity signature.

`ExecutionResult` carries a unique execution ID, optional program identity for preflight/empty-queue failures, status, evidence, diagnostic code and active source-block ID. Statuses distinguish validation, acceptance, running, dispatch-only acknowledgement, completion, cancellation, failure, required confirmation and no work. Evidence distinguishes no physical proof, dispatch acknowledgement, simulator completion and hardware completion.

<!-- StackChan program types exported from src/lib/stackchan-program.ts -->

`StackChanProgramStep` describes yaw degrees, side LED color/brightness, or wait seconds with a `sourceBlockId`. `StackChanLedSide` is `both | left | right`. These are data contracts; the StackChan adapter enforces physical command restrictions.

## Messages

<!-- message contracts exported from src/lib/message.ts -->

`BotLabMessage` is a user-facing message with a stable `code`, optional `params` and an English `text` fallback. Libraries throw `BotLabError(code, text, params)` for failures that hosts should be able to localize, and hosts convert any thrown value with `toBotLabMessage(error, fallback)`; errors that are not `BotLabError`s become `error.unknown` with their original text. Translation catalogs live in the host (for the web app, `formatBotLabMessage` in `apps/botlab-web/src/app/workbench-labels.ts`).
