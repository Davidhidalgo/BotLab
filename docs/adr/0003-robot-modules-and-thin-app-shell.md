# ADR 0003: Move Robot Knowledge Into Robot Modules and Keep the App Shell Thin

## Status

Proposed

First step implemented 2026-09-24: the web app now has an explicit composition root and `app.tsx` is split by responsibility. The robot-module contract below is the proposed next step.

Robot-module contract implemented for MicroDuck 2026-09-24: `RobotModule` and `compileRobotWorkspace` live in `@botlab/model`, `microDuckRobotModule` in `@botlab/adapters-microduck` owns the Scratch XML reader (moved out of `@botlab/blocks`), compiler and executable block list, and the workbench builds its adapters and MicroDuck palette from registered modules. StackChan migrated the same day as a module without `compile` (it executes typed steps over Bluetooth); `compile` is optional and `CompilingRobotModule` marks modules that produce runtime plans. `@botlab/blocks` no longer parses robot programs. Block-definition registration remains open.

## Context

ADR 0001 separated editor, model, runtime, adapters and simulators, and the Nx boundary rules keep those packages from importing each other in the wrong direction. A review of the current code found that the package boundaries hold, but robot-specific knowledge is spread across layers that are meant to be generic:

- **Model.** `@botlab/model` exports `MicroDuckProgramStep`, `PostureCondition`, `StackChanProgramStep` and `StackChanLedSide`, plus MicroDuck/StackChan sample policies, skills and behaviors. Adding a third robot means editing the shared domain package.
- **Editor.** `@botlab/blocks` contains `readMicroDuckProgramFromWorkspace`, `readStackChanProgramFromWorkspace`, the StackChan block definitions and the MicroDuck message catalog. The editor boundary knows every robot.
- **App.** `apps/botlab-web` chose which robot compiler to call, built the runtime inside the flow machine, and held a 2,400-line `app.tsx` that mixed state wiring, the MicroDuck simulator host, presentational panels and i18n label mapping.
- **Adapter.** `compileMicroDuckProgram` built its output by spreading `sampleMicroDuckCompiledBehaviorArtifact`, so production code depended on a demo fixture for `kind`, `createdAt` and `requiredPolicyIds`.
- **i18n.** The flow machine and simulator produce English sentences, and `translateFlowMessage` matches them back with exact strings and regular expressions. Rewording a message silently disables its translation.

Each robot added today touches model, blocks, adapters, simulators and the app together.

## Decision

### Implemented now

1. **Composition root.** `apps/botlab-web/src/app/botlab-runtime.ts` (`createBotLabWorkbenchRuntime`) is the one place that picks adapters, simulator integrations, policies and dispatchers. `botLabFlowMachine` accepts an optional `runtime` input and uses the workbench runtime when none is given, so tests and other hosts can inject their own.
2. **App shell split.** `app.tsx` keeps state wiring and layout. The rest moved out:
   - `microduck-simulator-host.tsx` has the iframe simulator host, delivery scheduling and host-state helpers;
   - `workbench-panels.tsx` has the presentational panels and cards;
   - `workbench-labels.ts` has the label and message translation functions;
   - `i18n.ts` exports `BotLabCopy`.
3. **No fixtures in production paths.** `compileMicroDuckProgram` now sets its artifact fields explicitly. Visible-output policy IDs are exported as `microDuckRequiredPolicyIds`.
4. **Strict by default.** `tsconfig.base.json` now sets `strict: true`, the same as every project already did, so a newly generated project cannot start non-strict.

### Proposed next steps

1. **Robot module contract.** Implemented in `libs/botlab-model/src/lib/robot-module.ts`:
   ```ts
   interface RobotModule<Step> {
     id: string; // adapter ID
     createAdapter(): BotLabAdapter;
     blockTypes(capabilityIds: readonly string[]): string[];
     readProgram(source: RobotProgramSource): Step[];
     compile?(
       source,
       program: readonly Step[],
       targetId: string,
     ): CompiledBehaviorArtifact;
   }
   ```
   `RobotProgramSource` is `Pick<BehaviorArtifact, 'behaviorId' | 'format' | 'content'>`, so adapters read workspaces without importing `@botlab/blocks`. MicroDuck and StackChan are migrated; `compile?` is optional for robots that execute typed steps directly. Remaining: let robot packages contribute block definitions and message catalogs through a small `BlockDefinitionSet` contract that `blocks` consumes as data.
2. **Move robot step types and samples out of the model.** After step 1, move `MicroDuckProgramStep`/`StackChanProgramStep` to their adapters, and move the `sample*` fixtures to a `@botlab/model/testing` entry point or a `fixtures` library tagged `type:fixture` that only apps and specs may import. Add that rule to `.oxlintrc.json`.
3. **Structured messages instead of English sentences.** Replace free-text `buildMessage`/`simulationMessage`/`runMessage` with `{ code, params }` values. Put translations in `i18n.ts` keyed by `code`, and delete `translateFlowMessage`. This removes the regex coupling between the flow machine and the UI.
4. **Split the flow machine by region.** `botLabFlowMachine` has four parallel regions: workspace, build, simulation and execution. Extracting each region's actors and messages into its own module would bring the machine file under ~400 lines without changing its behavior.
5. **One test runner.** Libraries use Vitest while `botlab-web` uses Jest with Babel. Moving the app to Vitest would remove `jest.config.ts`, `jest.preset.js`, `babel-jest`, `ts-jest` and `@nx/jest`.
6. **Tighter boundaries.** `tools/ci/check-boundaries.mjs` now checks that adapters cannot import blocks or runtime and that the model cannot import adapters. Add a fixture rule once step 2 lands.

## Consequences

- Adding a robot should become "add one adapter package that exports a `RobotModule`, and register it in `botlab-runtime.ts`", with no edits to model or blocks.
- The app shell becomes easier to review and test. The simulator host and label mapping can change without touching workbench state wiring.
- The proposed steps move public exports (step types, `read*ProgramFromWorkspace`, samples). Each needs a coordinated change across blocks, adapters and the app, and should land one robot at a time behind the existing `pnpm run verify` gate.
