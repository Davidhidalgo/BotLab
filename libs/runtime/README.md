# Runtime

Shared session orchestration, target registration, policy evaluation, dispatch, traces, and capability arbitration.

## Session Lifecycle

<!-- session lifecycle and dispatcher contract from src/lib/runtime.ts -->

- Load a compiled plan, confirm applicable policy, then start directly or enqueue. A stopped or failed session requires a new load before another run; a disposed session cannot be reused. Session IDs must be unique.
- `startSession()` remains pending while paused. Pause lets the current dispatch settle and waits at the next command boundary. `resumeSession()` continues that same invocation without replaying previous commands. Locks remain held while paused.
- `stopSession()` and `disposeSession()` remove queued work and prevent subsequent dispatches. Late results remain in the trace without changing the terminal state. Direct starts also consume any existing queue entry.
- Each dispatcher receives `dispatch(command, { signal })`. Stop/dispose abort the signal; pause does not. Cancellation is cooperative: a dispatcher that ignores abort may remain pending. The session keeps its locks and rejects replacement loads or starts until dispatch settles. Never interpret the signal, session state, or dispatch completion as proof of a physical stop. Real hardware still needs a transport-specific stop/acknowledgment contract.
- Missing dispatchers, rejected promises, and failed results stop the sequence at the first failure. Invalid pause/resume transitions leave the current state unchanged and record a diagnostic.
- Loading a behavior or compiled plan clears the old compiled plan, queue entry, dispatch counter, and policy approval, even when the new input fails validation. Loads during an unsettled run or after disposal are rejected without replacing the current plan.

The legacy snapshot state `stopped` remains compatible with previous clients. Use the returned `outcome` to distinguish completion, dispatch-only acknowledgement, cancellation, failure, confirmation required and no work. `runNextQueuedSession()` returns an explicit `no-work` result for an empty queue instead of `undefined`.

<!-- shared execution identities, outcomes and lifecycle from ../../botlab-model/src/lib/execution.ts and src/lib/execution.ts -->

`createExecutionLifecycle(executionId, program)` is shared by the command runtime, iframe observer and native app orchestration. `ProgramIdentity` includes the program ID, target ID and an exact canonical JSON revision; it includes nested commands and block references, not timestamps or display labels. The lifecycle rejects foreign runs/revisions/targets, regressions from running to acceptance, and updates after a terminal result. It requires simulator or hardware evidence for `completed`; `dispatched` only acknowledges sending commands.

The runtime owns a copy of each loaded plan and binds its approval to that identity. Loading a replacement clears approval, and trace entries carry their original program identity across session reloads. Target availability is checked before starting and before each subsequent command; current command/capability validation and policy evaluation run before starting. Compilation does not confirm policy. A dispatcher may return `completed` only with evidence matching the target kind (`simulator` or `hardware`); the dispatcher owns the real completion check. Returning `dispatched` remains supported without implying physical completion.

An explicit user-confirmation UI bound to the presented revision, native target registration in the shared scheduler, generic runtime control-flow interpretation, and the hardware transport stop/acknowledgement guarantee remain separate work. No physical transport is enabled by these contracts.

## Verification

<!-- runtime test target from project.json -->

Run `pnpm nx test runtime --run` from the repository root. Regression tests use deferred dispatches to exercise pause/resume, cancellation, late results, queued disposal, lock ownership, replacement loads, and failures.

<!-- conditional control flow from src/lib/runtime.ts and ../../botlab-model/src/lib/botlab-model.ts -->

`CompiledCommand.flow` optionally selects the next instruction. Conditional branches require a completed dispatcher result with target evidence and a boolean `condition`; missing/unknown values fail before the next movement. The runtime validates all command schemas/branch targets before execution, retains cancellation and exclusive ownership, and limits programs containing control flow to 256 dispatched instructions (including condition checks and checkpoints). Completion means reaching the declared exit, not executing every static branch. Program identity includes the flow metadata. Plain sequential artifacts keep their previous behavior.
