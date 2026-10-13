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

<!-- web program types and bounded expansion exported from src/lib/joint-program.ts and src/lib/velocity-program.ts -->

`JointPositionStep` and `JointPositionLimits` describe named joints in radians. `VelocityProgramStep` describes forward m/s, yaw rad/s, simulated seconds and source-block identity. `WalkingActionStep` adds measured distance goals in metres, signed turn goals in radians and waits in seconds alongside legacy velocity steps. `WalkingProgramStep` also includes structured repeat bodies. `expandWalkingProgram(program, validateAction)` validates the entire source (including zero-count bodies) through the adapter callback, requires unique source IDs, then emits actions with `ProgramIteration[]` paths. `walkingProgramLimits` sets counts 0–100, depth 16, 256 source blocks and 256 expanded steps. Each iteration includes a zero-duration wait checkpoint so empty loops remain bounded and cancellable. The adapter assigns unique command IDs after expansion; old sequential IDs remain unchanged. An all-zero repeat yields no commands. These contracts do not change the units of existing MicroDuck programs.

<!-- bounded conditional instructions from src/lib/velocity-program.ts and src/lib/botlab-model.ts -->

Walking programs also accept `until` and `if` nodes with a `ProximityCondition` and optional else body for `if`. The complete source, including unselected branches, is validated before lowering. `ExpandedWalkingStep` retains branch offsets through `CommandFlow`: either `next` or `whenTrue`/`whenFalse`, bounded to the command list or its exit. Conditions lower to the shared `proximityCommandSchema` (5–400 cm in SI inputs). Dynamic execution remains in the runtime; the adapter still supplies robot-specific movement limits and speeds. General expressions remain outside this subset.

`wait-until` lowers to a fresh predicate followed by half-second balance waits. Its explicit 0.5–30 s timeout becomes `maxFalseChecks` on the condition branch; the whole-program budget remains in force.

<!-- walking conditions exported from src/lib/walking-condition.ts -->

`WalkingCondition` represents proximity leaves and nested `and`, `or`, `not`. `validateWalkingCondition` bounds depth/size and checks every operand and identity. `evaluateWalkingCondition` evaluates one confirmed distance; `describeWalkingCondition` renders the saved expression.
