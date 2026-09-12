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

The existing snapshot state `stopped` covers both normal completion and explicit stop; the lifecycle trace distinguishes them. Structured run outcomes, removal of app-side automatic policy confirmation, current target eligibility checks, and complete policy revision binding remain separate consolidation work.

## Verification

<!-- runtime test target from project.json -->

Run `npm run nx -- test runtime --run` from the repository root. Regression tests use deferred dispatches to exercise pause/resume, cancellation, late results, queued disposal, lock ownership, replacement loads, and failures.
