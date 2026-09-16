# BotLab Implementation Plan

This document is the working implementation plan for BotLab. It keeps the roadmap, architecture decisions, and acceptance criteria in the repository so the project can grow without losing context.

## Product Goal

BotLab should let a user build robot behaviors visually, test them safely in a simulator when available, inspect what the runtime is doing, and deploy the behavior to supported robot targets through adapters.

The first supported target is MicroDuck. StackChan is planned as the next robot family. The visual editor should use the official Scratch Blocks package first, while keeping TurboWarp or raw Blockly as future swappable options behind an internal BotLab boundary.

Product focus (agreed 2026-09-13): refine the product against the MicroDuck simulator before further hardware work. Prioritize the reported turn regression, reliable execution, package-level verification, architecture consolidation, and new executable blocks. A program/example library is outside the next product increment; preserve existing local save/import/export. StackChan, already available to the project owner, will be the first physical target when that experience is ready. Hardware policy and transport tasks below remain requirements before hardware enablement, not blockers for simulator product development.

## Architecture Principles

- Use Nx generators whenever possible for apps, libraries, components, and tooling.
- Keep robot-specific code out of the web app.
- Keep visual editor engine details inside `@botlab/blocks`.
- Keep behavior execution semantics inside `@botlab/runtime`.
- Keep shared language and contracts inside `@botlab/model`.
- Integrate official simulators as dependencies or external processes where possible.
- Treat generated artifacts as first-class data: blocks, compiled plans, traces, logs, simulator outputs, and deployment payloads.
- Make safety policy explicit before real robot execution.

## Current State — Reviewed 2026-09-13

The current baseline below supersedes older status descriptions in the numbered milestones. Those milestones retain the longer-term scope and historical implementation notes; they are not a sequential delivery checklist. Use the agreed delivery order below for new work.

| Area               | Implemented and inspected                                                                                                                                                                                                             | Still open                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Foundation         | Nx, React/TypeScript, enforced library boundaries, shared contracts and app/library verification workflow                                                                                                                             | Physics/release CI and first hosted workflow run                                                                                     |
| Blocks             | Official Scratch Blocks; one green-flag sequence; movement, turns, waits, simulator postures, nested posture conditions, finite repeats and LED compilation; XML parsing in blocks, command lowering in the adapter; localized blocks | Disconnected-block diagnostics; general expressions and generic-runtime control flow                                                 |
| Simulator          | Official local host with postMessage commands and identified execution status; measured displacement/yaw, progress, stop acknowledgement and reset                                                                                    | Further locomotion-mode/scene coverage; upstream pin/hash/setup consolidation                                                        |
| Persistence and UX | Versioned local workspace and last trace, import/export, responsive workbench and block highlighting                                                                                                                                  | Iframe end-to-end acceptance rechecked below; multiple-program storage is deferred                                                   |
| Runtime            | Session lifecycle, cooperative cancellation, queue, locks, traces and initial policies                                                                                                                                                | Shared outcomes and plan identity delivered below; user-facing revision/target-bound approval and hardware stop contract remain open |
| Hardware           | Adapter contracts and placeholders                                                                                                                                                                                                    | Real transport and deployment; StackChan is the first intended physical target                                                       |

Verification performed on 2026-09-13:

| Project                     | Test files | Passing tests | Runner                   |
| --------------------------- | ---------: | ------------: | ------------------------ |
| botlab-web                  |          9 |            89 | Jest                     |
| botlab-model                |          1 |             8 | Vitest                   |
| runtime                     |          1 |            32 | Vitest                   |
| blocks                      |          4 |            53 | Vitest                   |
| simulators-core             |          1 |             2 | Vitest                   |
| simulators-microduck        |          5 |           119 | Vitest                   |
| microduck adapter           |          2 |            22 | Vitest                   |
| simulators-microduck-native |          6 |            56 | Vitest + Python unittest |
| **Total**                   |     **29** |       **381** |                          |

All eight configured test targets passed across the `npm run test:all` run and the isolated blocks rerun (the root alias for `nx run-many --target=test --all --parallel=2`). The app also passed `node_modules/.bin/tsc -p apps/botlab-web/tsconfig.app.json --noEmit` in the earlier review. App/adapter builds and MicroDuck adapter lint passed after the native experiment; the earlier simulator-library build/lint retained six pre-existing non-null assertion warnings. Browser/physics turn verification is recorded below. Full-workspace build/lint coverage remains a separate milestone. `npm test` currently runs only the app. The MicroDuck adapter now owns eight proximity-subscription tests; its broader target/capability contract tests remain open. `stackchan` and `ui` have no dedicated suites yet. The simulator library includes unit tests and generated-receiver integration tests, not just app mocks.

The new native library passed build, lint and TypeScript checks. Its compiled client also passed a real local service smoke check: subscription, telemetry, healthy control-loop status and acknowledged stop, with owned services terminated afterwards. [Recorded result](evidence/microduck-native-library-2026-09-13.json).

The experimental native app passed browser acceptance for rendering, reset, movement/wait completion, posture, explicit stop, iframe fallback and simulated network loss; see [app evidence](evidence/microduck-native-app-2026-09-13.json). App/native builds, TypeScript checks and lint of the new native modules passed. Native sessions remain live-only and use the separate local gateway.

Native video follow-up: PNG/base64 snapshot polling at 5 fps was replaced by an isolated renderer and latest-frame MJPEG stream targeting 30 fps. Chrome measured 29.1 received fps, 28.7 painted images/s and 49.8 Hz policy control. See [performance evidence](evidence/microduck-native-video-2026-09-13.json).

### macOS simulator companion

Verification: [companion evidence](evidence/microduck-native-companion-2026-09-13.json) records the relocated bundle, editor acceptance, zero video requests, native scene cadence and clean window/application/service shutdown. All 302 tests, app/Mac builds, TypeScript checks and changed-module lint passed.

User proposal on 2026-09-13: keep the editor in the browser and package only the native simulator as a separate Mac application. The external-window integration and a standalone Apple Silicon development bundle are now implemented. It preserves both the iframe and embedded native view. Distribution signing/notarization and a supported update path remain open.

The intended experience is to open `BotLab Simulator.app` from Finder, see the native MuJoCo window, and connect from the web editor. The application starts and owns the required local services. The installed user needs no terminal commands, Node, Python or Rust installation. Opening the editor URL from the companion can simplify startup; launching the companion from a browser through a custom URL scheme is optional later work.

Ownership: reuse `@botlab/simulators-microduck-native` for session startup, local transport, execution and shutdown. `apps/simulator-macos` supplies the application lifecycle, resources and packaging. It does not duplicate the simulator library or contain the editor. The native window renders the existing physics world directly; this mode does not start the MJPEG render worker. The editor retains program controls, progress and sensor status over the local gateway.

Delivery sequence (items 1–2 implemented; item 3 remains release work):

1. **External-window mode:** let the gateway start the existing native viewer, advertise presentation mode and protocol compatibility, and let the editor display connection/execution status without requesting video. Preserve exclusive ownership, stale-command rejection and heartbeat cancellation. Verify reset, viewer closure and browser reconnect with one physics instance.
2. **Standalone Apple Silicon prototype:** package the launcher, interpreter/native libraries, compiled daemons, policies and scene assets into a `.app`. Validate MuJoCo's macOS main-thread/`mjpython` requirements in the packaged executable. Run a relocated bundle outside the repository with the development environment unavailable; no paths into `tmp`, the source checkout or its virtual environment may be required. The implemented build copies the pinned standalone interpreter and dependencies and compiles a small AppKit launcher; no Python freezer or editor wrapper is needed.
3. **Distribution:** add reproducible release builds, dependency/license notices, signing and notarization, versioned compatibility checks and an update strategy. Validate other Mac architectures separately if supported.

Acceptance: double-click startup without Terminal; usable native-window rendering with measured frame rate and frame-time percentiles; healthy policy control while editing; movement, posture, stop and reset pass against the same gateway semantics; browser loss cancels the program and leaves the viewer idle; closing the simulator stops execution and cleans up owned services; repeated launches do not create competing instances. Existing iframe and embedded-native acceptance must continue to pass. Native control-loop Hz must not be reported as viewer FPS.

### Multi-simulator distribution direction

The user requested a common **BotLab Simulator** application for future simulators, with either downloadable simulation packages or an all-included distribution when size permits. The Mac host now reads a versioned installed-simulator catalog (`apps/simulator-macos/simulators.json`); process arguments, environment, health handshake and editor URL belong to each entry. One installed entry starts directly; multiple installed entries are selectable, with one active simulator at a time. Only MicroDuck is currently bundled and tested. This is installed-package selection, not a download manager.

The measured first MicroDuck development bundle occupies approximately 332 MB uncompressed, including its runtime and resources. Do not assume future simulators are similarly sized. Keep a small common host and per-simulator packages as the ownership boundary; offer a default bundle with the first simulator and optional all-included/offline bundles when measured size justifies them. Avoid duplicating compatible runtimes across packages where practical.

Next packaging increment: define package ID/version, OS/architecture, runtime dependencies, gateway compatibility, download and installed sizes, integrity/authenticity metadata and launch descriptor. Implement catalog discovery, download/install progress, atomic installation, removal and updates without modifying an active simulation. The user chooses simulations; they do not configure Python environments or daemon processes. Evaluate total download size, installed size and shared runtime savings before setting an all-included bundle threshold. The current build remains fully bundled and offline after installation; downloading additional simulators is pending.

Deferred platform requested by the user: **Windows companion application**, after the Mac experience is validated. Keep the editor protocol, program execution and simulator semantics shared. Plan a Windows launcher/installer plus platform-specific runtime paths, native library loading, viewer startup and child-process cleanup. First verify upstream daemon/IPC compatibility on Windows; the current macOS Unix-socket and `.dylib` setup is not evidence of Windows support. Acceptance must include installation without developer tools, browser control, stop/reset, connection loss and clean shutdown. Do not start this work in the current Mac increment.

See [the companion assessment](microduck-simulator-evaluation.md#macos-companion-proposal) for the rendering and packaging rationale.

### Posture conditions follow-up

Implemented native `if` / `if-else`, including nested branches and Boolean sitting/standing/transitioning blocks in Sensing. The panel displays observed posture and decision outcomes. Transitioning tracks a dispatched native posture action for up to 12 seconds; missing/unstable initial observations remain unknown. Redundant explicit postures now fail, superseding the idempotent behavior in the historical first-increment evidence. A stopped latched transition can be inspected by a new conditional program, without allowing movement before standing stabilizes.

Validation: 338 tests across 28 files; the first full run encountered one existing locale-switch test timeout under concurrent builds, then the blocks suite was rerun independently. Real browser/physics acceptance covers nested true/false branches, retained decisions, repeated-posture error and cancellation. The final regression also passes movement/turn/wait, stop, iframe fallback and connection loss; the latter resets the scene to isolate it from the preceding cancelled walk. Movement completion now includes standing stability, fixing a premature walk-to-turn handoff. App/Mac builds, TypeScript and changed-module lint pass. Evidence: [native conditions](evidence/microduck-native-conditions-2026-09-13.json). No automatic corrective posture action is inserted. Next language increment remains bounded repetition, then general Boolean operators; native skill expansion follows its physical lifecycle checks.

### Iframe posture parity

Explicit Sit/Stand and sitting/standing/transitioning conditions now execute in the iframe as well as natively. The bridge binds the existing official Feet posture policy to explicit actions and observes physical height, gyro and simulator time. It rejects unsupported modes, redundant postures and unknown conditions; no corrective Stand is inserted. Forward-only branch frames preserve indices for active-block highlighting and saved traces. Selected posture frames require completion evidence; an unselected branch is excluded only after its condition decision is validated.

Verified real browser/physics behavior: nested true/false branches, Sit/Stand, walk-to-turn handoff, repeated Sit error at the second block, cancellation during sitting and a new run that detects the continuing transition while leaving the following Stand unexecuted. [Iframe evidence](evidence/microduck-iframe-postures-2026-09-13.json). The full configured suite plus the final focused library check pass 355 tests in 29 files. Build and TypeScript checks pass; lint retains the six existing non-null assertion warnings in receiver tests. Both the web app and the static `/simulator/` build must be published together for the tunnel to receive these changes. Generator consolidation (A3) remains planned; both implementations run the shared behavioral tests.

## Agreed Delivery Order — 2026-09-13

Native experiment completed after user authorization: [MicroDuck simulator evaluation](microduck-simulator-evaluation.md) records real service/physics execution on macOS, skills, odometry, ToF-driven stop, cancellation and connection-loss checks. All seven angle cases passed a 10° budget but still needed feedback/corrections. A native proximity helper and eight tests now belong to the MicroDuck adapter; the app now offers browser and experimental native simulators. The user authorized keeping the iframe and adding native integration through a separate library. `@botlab/simulators-microduck-native` now owns the native session/process code and a transport-independent JSON-RPC client, with dedicated protocol tests. Existing CLI experiments reuse the library. The native app panel now uses a leased local gateway, MuJoCo-rendered body truth, measured movement/wait execution, sit/stand, live ToF and stop/reset/disconnect. The iframe remains available. Generic runtime registration, capability discovery, persisted native traces, camera/WebRTC and person blocks remain open; this is not a full migration.

### Recommended next increment: native MicroDuck skills

After the Mac companion, prioritize useful native blocks over package downloads. The first increment (capability discovery and native posture blocks) is implemented; posture conditions with if/if-else are also implemented; additional skills remain planned. The pinned daemon exposes `robot.do`, `robot.skills` and loaded-policy information; the current gateway only permits `sit_toggle`, through the shared posture execution path for the toolbar and explicit blocks. The prepared configuration loads `kick_left`, `kick_right`, `roulade`, `ground_pick` and the posture policy. Loading a policy does not establish editor support or verified physical completion.

Verification of the first increment: [native posture evidence](evidence/microduck-native-posture-2026-09-13.json) records actual repeated posture actions, a walk between posture transitions, stable final sitting, and cancellation during rising with no subsequent movement. The existing movement/turn/wait/posture/fallback/connection-loss acceptance also passes. All 319 configured tests pass across 27 test files; app/Mac builds and changed-module checks pass. Runtime target registration remains separate from the implemented native capability-to-adapter mapping.

Educational semantics raised by the user: BotLab must not insert corrective actions such as standing up automatically before a walk. Walking from a seated state reports a failure at that block. The follow-up implements a redundant posture as a visible teaching error that stops execution at its block, with guidance to use an explicit condition. Do not silently reinterpret a second Stand as Sit.

Prioritize **posture conditions plus if/if-else** before kicks: expose observed sitting, standing and transitioning states, with an explicit unavailable/unknown state when telemetry is missing. A first educational program should be expressible as “if seated → stand; advance”. The typed model, blocks parser and adapter now preserve nested branches. The native interpreter evaluates current observations, executes one branch and records its decision/source IDs; it handles cancellation and validates both branches before execution. Unknown posture fails visibly. Generic runtime control flow remains separate work; the iframe now executes the same posture conditions. Automatic action insertion remains out of scope.

1. **Discover executable capabilities:** map loaded skills and available built-ins through the MicroDuck adapter/target contract. `robot.skills` describes configuration; reconcile it with loaded policies. Do not use the subscription's `skills` array alone: posture and `ground_pick` are conditional built-ins outside that array. The app should show capabilities from the connected target rather than inventing simulator-specific availability.
2. **Deliver posture blocks first:** explicit Sit and Stand blocks, backed by the native toggle only when a change is needed. Observe the current posture/transition so running Stand twice cannot sit the robot back down. Integrate source-block highlighting and actual completion into program execution, replacing the fixed toolbar busy delay for this path.
3. **After posture conditions, extend the common skill lifecycle and then expose one-shot actions:** validate acceptance, observed start, completion/recovery, refusal, timeout and cancellation against the native engine. Add kick left/right, then roulade and `ground_pick` after their behavior and stop semantics are measured. Do not treat an RPC acknowledgement or a duration alone as proof of completion, repeatedly dispatch a chaining skill, or disable fall checks globally to accommodate a deliberate roll.
4. **Add the first sensor condition:** use the already measured ToF proximity helper for a distance condition / wait-until block, with cancellation and rearming tests. This needs the expression/condition execution boundary described below. Person detection remains separate until an actual producer and transport exist.

Ownership: block definitions/compiler in `@botlab/blocks`; typed steps/results in the model and runtime; robot capability semantics in `@botlab/adapters-microduck`; native transport/observations in the native simulator library. Deliver the minimum A1/A2 contract consolidation needed by these blocks rather than growing a second app-specific compiler/executor. Tests belong in those libraries, with app composition checks and a real simulator acceptance sequence (walk → kick → turn → sit), plus interruption during each supported skill. The first completion criterion is executable posture blocks, not an example gallery or a complete event scheduler.

### 1. Reproduce and resolve the turn regression

Owner: `@botlab/simulators-microduck`, with compiler/app integration where evidence requires it.

Status: corrected and verified in Feet mode on 2026-09-13. A requested 90° right turn stalled at approximately 15° with the upstream angular input of 1. The calibrated input is now 2 with a 1.5 floor. Calibration alone exposed transient torso twist and rebound on small angles, so the tracker now holds zero motion after crossing, waits for a quiet settled heading, and corrects error above 5° before advancing. First-crossing messages bypass heartbeat throttling to preserve measured arrival evidence even when the body subsequently settles below the requested angle.

The maintained `tools/microduck/verify-turns.mjs` browser regression passed against upstream `023172c8a7d629b5258d90364c13bafe013abbfa`: a 0.25 m walk followed by 90°, -90°, 180°, 15°, -15°, -180° and 360°, plus replay and acknowledged stop during the first turn. The seven settled angular errors were 0.95°, 0.06°, 2.71°, 4.55°, 1.39°, 2.59° and 0.07°. Reports and raw physics samples are in `tmp/turn-regression/`; setup is documented in the simulator README. This result verifies the recorded Feet policy/scene, not all possible angles or Rollers mode. The existing local host has been regenerated; independently built previews require regeneration and rebuild.

Tasks:

- [x] Capture the failing block/program, requested angle, Feet/Rollers mode, scene state and exact app/receiver/upstream revisions. Compare a clean run with a turn after movement and repeated runs.
- [x] Reproduce left/right quarter turns, a half turn and signed degree turns in the actual engine. Include yaw wraparound and stop during a turn.
- [x] Record commanded angular velocity, measured yaw, reported progress, completion time and settled heading after zero motion is requested. Investigate wrong direction, under/overshoot and stall separately.
- [x] Review the slowdown floor and completion criterion against measured engine behavior. The former tracker retained half angular command and declared completion at the first crossing. Physics traces confirmed both stalling and post-crossing rebound; the calibrated command and settled-heading feedback address these cases.
- [x] Verify that the local receiver matches its generator. The local host was regenerated, and library/setup-tool tests verify idempotent upgrades of existing registrations. Eliminating the duplicate generator implementation remains architecture task A3.
- [x] Add the regression at its owning library boundary and a repeatable browser/engine check. Record the upstream revision, locomotion mode and observed angular error; define and document a supported tolerance from measured results.
- [ ] Extend the physics matrix to additional scenes and locomotion modes and make unsupported combinations explicit.

Acceptance: the reported case is reproduced and then passes after a targeted fix; each supported direction finishes within the documented tolerance without premature completion, indefinite turning or dispatch after stop. Unsupported locomotion modes must be explicit. Unit tests alone do not close this item.

### 2. Close the reliable end-to-end milestone and test gaps

- [x] Recheck the real editor flow: author advance/turn/wait actions, save, reload, execute, stop, edit and rerun, and inspect matching progress and traces. The maintained iframe acceptance imports a connected fixture and edits it through the real Scratch UI; see the workspace acceptance follow-up below.
- [x] Add a root `test:all` command for every configured app/library test target. `npm test` retains its app-only behavior; both commands are documented.
- [x] Wire the full command into CI. `.github/workflows/verify.yml` runs `npm run verify`; its first hosted run will occur after pushing.
- [ ] Add independent adapter contract tests for target status, capability bindings, command validation and unsupported commands. Test UI primitives when they own meaningful interactions; avoid tests of static wrappers alone.
- [ ] Keep domain/compiler/runtime/simulator semantics in library tests; app tests cover composition and user interaction. Move compiler tests with the compiler when its boundary changes.
- [ ] Promote useful ignored browser-check scripts into maintained, reproducible tests with local URLs, isolated browser storage and recorded simulator setup. Separate quick controlled transport tests from slower physics checks.
- [x] Run app/library typechecks, all configured tests, lint and builds in the standard workflow. Passing tests do not substitute for the engine-level turn check.

Acceptance: a documented local command and CI exercise every configured suite, each behavioral library owns its regressions, and browser acceptance verifies the visible result and interruption path.

### 3. Consolidate architecture in bounded changes

Plan these changes as separate reviewable increments; preserve the working sequential program path while introducing the contracts needed by new blocks.

| Order | Change and ownership                                                                                                                                                                                                             | Acceptance                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1    | Move Scratch XML traversal from `botlab-flow-machine.ts` into `@botlab/blocks`; define engine-independent program nodes and source references in `@botlab/model`; keep robot command lowering behind adapter/simulator contracts | The app handles BotLab artifacts without parsing Scratch XML or encoding robot commands; existing programs and diagnostics remain compatible                                                                     |
| A2    | Define program revision/target identity, typed execution results and diagnostic codes in the model; consolidate demo and real execution paths using runtime orchestration and simulator transport boundaries                     | Validation, accepted/running, completed, failed, cancelled and no-work outcomes remain distinct; stale results and approvals cannot attach to a replacement program; UI progress comes from the active execution |
| A3    | Give the MicroDuck receiver, motion trackers, message schema and patch generator one source of truth in the simulator package; make the setup tool consume that output                                                           | Native and generated receivers pass shared contract tests; regeneration is reproducible and idempotent without manually synchronizing algorithm copies                                                           |
| A4    | Enforce ADR 0001 with Nx tags; keep editor/UI dependencies out of model/runtime and transport/engine internals out of the app                                                                                                    | Lint rejects forbidden imports while allowing composition through public package APIs                                                                                                                            |
| A5    | Document the current iframe host in ADR 0002; pin upstream source and bridge versions and make setup verification concrete                                                                                                       | The supported integration matches the ADR, can be reproduced at a known revision and reports incompatible bridge versions; in-process hosting requires a demonstrated benefit before migration                   |
| A6    | Put versioned workspace serialization/storage behind an injected boundary; let the app own browser lifecycle and user feedback                                                                                                   | Storage migration/validation/failure behavior is testable independently of app orchestration; restored documents cannot resume execution or restore approval                                                     |
| A7    | Complete runtime target eligibility, per-plan/target approval and acknowledged hardware stop contracts                                                                                                                           | Offline/unsupported/denied targets dispatch nothing; required confirmation is an explicit user action tied to the current plan; physical execution stays disabled until the transport stop guarantee is verified |

A3 generation follow-up: the setup tool now bundles the current simulator library with Vite and consumes its receiver generator, game patch and arena patch. The manually synchronized tool copy has been removed. All 118 simulator tests pass, including shared receiver contracts against the setup bundle and idempotent patch upgrades.

A1 progress: XML traversal is now in `@botlab/blocks`, typed sequential actions in `@botlab/model`, and MicroDuck command lowering in the adapter. The app composes those APIs. Broader engine-independent control flow and A2 runtime consolidation remain open.

A1–A3 and A4 establish the boundaries used by block expansion. A5 and A6 can be delivered independently; A7 gates hardware enablement. New packages should only be introduced when existing ownership boundaries cannot express the responsibility clearly.

### Verification and dependency boundaries follow-up

`npm run verify` runs all app/library typechecks, every configured test target, full-workspace lint, eight positive/negative architecture probes, library builds and the web app build. GitHub Actions runs the same command after `npm ci` on Ubuntu 24.04 with Node 22.22.0 and Python 3.12, on pushes, pull requests and manual dispatch. Native Python unit tests require no prepared physics assets. Engine acceptance and Mac release packaging remain separate commands.

Validation: `npm ci` and `CI=true npm run verify` passed in a fresh temporary source copy with a separately installed dependency tree and no prepared simulator assets (macOS, Node 22.22.0, Python 3.11.1). This includes 381 tests, all ten app/library TypeScript configurations, lint for ten projects, eight architecture probes, all nine library builds and the app build. Workflow YAML was parsed; the hosted Ubuntu run is pending push. The Mac companion build also passed separately.

A4 is implemented through Nx scope/type constraints, public package imports and external editor/UI import restrictions. Blocks may use UI primitives; model/runtime cannot depend on editor/UI, and simulator core cannot import robot integrations. Root lint/TypeScript configuration and the setup bridge loader are hashed for cache invalidation. Existing empty test doubles now state their intent so lint can run without errors; pre-existing warnings remain visible.

### A2 execution contract follow-up — 2026-09-16

The model now defines exact program/target identities, typed execution results, evidence and diagnostic codes. Canonical revisions include nested commands and source-block references, so reused display IDs cannot identify a changed plan. The shared runtime lifecycle is used by command dispatch, the iframe observer and native app orchestration; it rejects foreign identities, backwards progress and updates after a terminal result.

Runtime calls distinguish dispatch acknowledgement, observed completion, cancellation, failure, required confirmation and empty queues. Dispatcher completion requires evidence matching the target kind. The app routes resolved failures and no-work results to their own states. It labels simulator preparation as command validation, does not automatically confirm policy during compilation, and no longer contains a pretend hardware dispatcher. Loaded plans are copied, approvals are attached to the loaded identity, and trace entries retain their original identity. Live target availability is checked before starting and between commands. Native progress excludes other run IDs and prior revisions; iframe workspace files preserve the common outcome and remain compatible with old documents.

This completes the common result/identity boundary for A2. Physical completion and stop checks remain owned by each transport. Native registration in the shared scheduler and generic runtime interpretation of control flow remain separate integration work; the native/iframe engines still execute their own branch semantics. A7's user-facing approval contract and hardware stop acknowledgement must be verified before enabling a physical target.

Validation: **405 tests**, all workspace TypeScript checks, lint, eight architecture probes, library builds and the web build pass. Real iframe acceptance covers the complete workspace flow and asserts common identity/evidence in each saved trace. Native engine acceptance covers movement, postures, stop, iframe fallback and browser connection loss; its stop fixture now waits for physical posture stability. Existing lint/build warnings remain. [Recorded evidence](evidence/execution-contract-2026-09-16.json). The first live-development browser attempt was interrupted by hot reload; successful browser checks use the isolated compiled preview.

Next physical target confirmed by the owner: Kickstarter StackChan, updated to firmware **1.5.1** (owner correction on 2026-09-16; installed version and available updates have not yet been independently checked). The next StackChan step is a read-only compatibility check of that firmware's actual connection/API, then a bounded expression command through an adapter. Do not assume that APIs from other StackChan firmware projects are compatible.

### StackChan compatibility preparation — 2026-09-16

Owner confirmed successful Bluetooth operation at all three manual yaw positions (-10/0/+10 degrees). This is owner-observed physical evidence, not firmware position telemetry. Palette follow-up now filters blocks against implemented target/capability support and updates the mounted Scratch flyout on robot changes without deleting blocks. StackChan excludes MicroDuck motion/posture/sensor/LED blocks; shared start/wait/repeat structure remains. Existing incompatible blocks produce a warning. Servo block compilation/execution is the next integration step.

Direct BLE follow-up: factory DANCE starts the BLE motion service, unlike AVATAR. Added a browser Bluetooth transport with explicit device selection, sequential 20-byte fragments, bounded yaw, timeout/disconnect handling, and a manual -10/0/+10-degree panel. Connection sends no motion; the owner checks the starting pose before manual commands. The owner has DANCE open and the robot nearby; browser pairing and physical movement are pending. Validation: 23 adapter tests, 108 app tests, and production build pass. Shared block execution/physical completion and stop acknowledgement remain pending.

Workspace follow-up: robot selection now lives in the header, with browser/native simulator selection shown for MicroDuck. New projects default to StackChan. Named local projects save blocks, robot, simulator, locale, and the last iframe trace; startup reopens the last active project without execution or connection. Projects can be created, renamed, and reopened. Browser-local storage is scoped to the site origin. Validation: 106 app tests, TypeScript and production build pass; isolated Chrome acceptance verified two projects, restored active project/native selection, and layout at 1280px and 390px.

Owner steering: prioritize servo movement. Prepared an offline horizontal servo encoder with absolute destinations restricted to ±20 degrees and speed 100/1000. First intended physical trial is a 10-degree displacement and return from a verified starting pose. Position readback and stop acknowledgement remain unverified; `GetAvatarPosture` exists in the relay/app but is absent from the inspected firmware WebSocket handler. No automatic centering or physical command is enabled.

Inspected official M5Stack source revision `1b5765599fba8aaad1811d9a79358ccc7051f5f3`, which declares firmware 1.5.1. Added an offline encoder for the verified happy/neutral eye presets and the app-to-relay binary framing. The factory AVATAR route uses an authenticated outbound WebSocket connection; local HTTP and available BLE expression control have not been established. The adapter remains planned. Physical sending awaits a verified owner session/target and transport integration; successful sends alone cannot establish completion. See [compatibility evidence and trial steps](stackchan-1.5.1.md).

### Workspace acceptance follow-up — 2026-09-15

`npm run test:workspace` now verifies the real Scratch editor and official iframe engine in an isolated browser context. It imports a connected advance/turn/wait fixture, edits numeric fields through the visible editor, checks autosave/export/reload without execution, and verifies measured movement/turn arrival, highlighting and matching saved traces. It also checks acknowledged stop without later actions, editing and rerunning with a fresh execution ID, editing while running, and reload of an active run as interrupted without reconnection or resumption.

The acceptance exposed a stale UI result: changing a completed/stopped/failed program retained the previous execution status. Source changes now invalidate the current result while preserving historical traces. During execution, source changes request cancellation and wait for acknowledgement; further edits do not extend the timeout. Missing acknowledgement still fails and uses the existing iframe shutdown fallback. This bounded fix does not complete A2's shared execution-result and program/target identity consolidation.

Validation: real browser/physics acceptance passed all seven checks, and `CI=true npm run verify` passed 387 tests, workspace TypeScript checks, lint, eight architecture probes, library builds and the web build. Existing lint/build warnings remain. [Recorded acceptance](evidence/workspace-acceptance-2026-09-15.json). Full local reports, exported fixture and screenshots are written to `tmp/workspace-qa`. Native saved traces, general runtime consolidation, broader adapter contracts and hosted CI execution remain separate work.

### Finite repetition follow-up

Implemented `repeat N times` in the palette, typed program, shared adapter lowering, iframe and native transport, with Catalan/Spanish/English iteration progress and source-block highlighting. Counts are literal integers from 0 to 100; zero skips the body. Control nesting is limited to 16 levels and the compiled tree to 256 steps including checkpoints, both conditional branches and the final stop. Conditions are evaluated again on each iteration. Empty bodies have cancellable checkpoints; no posture is corrected implicitly.

Verification: 381 tests in 29 files, full app/dependency build and TypeScript check, plus real browser/physics acceptance in both simulators for nested progress, true/false conditions on different iterations, zero count, repeated posture failure and stop. See [repeat evidence](evidence/microduck-repeat-2026-09-13.json). The maintained command is `npm run test:simulator-repeats`, with `BOTLAB_QA_BACKEND=native` for the native route. The first iframe UI check missed a short 0.4-second interval; the maintained fixture uses a 2-second wait to inspect visible iteration progress reliably.

### 4. Expand executable blocks

Agreed product scope: add blocks. Do not build a program library or example gallery in this increment. Existing example files remain useful as fixtures; local save/import/export remains supported.

Proposed implementation sequence:

1. **Repeat N times — implemented above**: finite repetition with nested sequences, source-block tracking per iteration and cancellation between actions. Define valid counts, nesting and execution budgets, including zero/invalid counts, before implementation.
2. **Expressions and comparisons**: numeric inputs, arithmetic and boolean comparisons with explicit types and diagnostics, usable in movement, waits and control blocks.
3. **If / if-else**: conditional execution using those expressions, with trace evidence showing the selected branch and source block.
4. **Variables and condition-driven control**: introduce variables and then `repeat until`/`wait until` once expression evaluation and cancellation are established. Only expose sensor conditions actually available through target capabilities.

The order within this block increment is a proposal; adjust it around the first educational behavior the user wants to express. Each addition must include palette registration, Catalan/Spanish/English labels, typed program representation, validation, execution semantics, library tests and visible progress/stop behavior. Displaying a standard Scratch block does not imply BotLab can execute it. Defer concurrent scripts, event scheduling and unbounded loops until their runtime semantics and resource limits are designed.

## Immediate Milestone: Reliable MicroDuck End-to-End Flow

Priority: follow the agreed delivery order above, beginning with the turn regression. Complete this consolidation milestone before expanding robot support, adding timed/event-driven scheduling, or extending arbitration strategies. It pulls forward the essential parts of milestones 3–6, 8–10, and 12 without renumbering the roadmap.

Goal: a user can author two connected actions, save and reload the workspace, compile exactly those actions, execute them on an observable target, stop execution reliably, and inspect an accurate result and trace.

Review baseline (2026-09-12): the architecture has useful editor, model, runtime, adapter, and simulator boundaries, but the reviewed implementation still contains demo execution paths. Findings below were observed while another conversation was making changes. Recheck each item against the latest implementation before changing it; mark it complete only after its acceptance criteria are verified. This planning update does not mean the fixes have been implemented.

### P0: Runtime Lifecycle and Policy Enforcement

Owners: `@botlab/runtime`, `@botlab/model`, adapter contracts, and the app's execution controls.

Observed gaps:

- Pausing, stopping, or disposing a session during dispatch changes its recorded state but does not prevent the next command from being sent.
- A disposed session left in the queue can become runnable again when dequeued.
- Compilation automatically confirms policy, and loading a new plan retains the previous plan's confirmation.
- An offline target can pass compiled-plan validation and receive commands through the runtime.

Tasks:

- [x] Enforce legal session transitions and check cancellation/pause state between commands. Define pause/resume cursor semantics so resuming does not replay completed commands.
- [x] Remove or invalidate stopped/disposed queue entries and prevent late asynchronous results from reviving a terminal session.
- [ ] Define dispatcher cancellation and in-flight command behavior. Distinguish preventing subsequent dispatches from stopping an already active hardware command; require an explicit transport stop contract before hardware execution is enabled.
- [ ] Remove automatic policy confirmation from compilation. Require a user action when the evaluated policy requests confirmation, and bind that confirmation to the exact plan revision and target.
- [ ] Invalidate confirmation when the plan or target changes, and validate current target availability, capability support, and applicable policies before dispatch.
- [ ] Add regression coverage for interruption during the first of two commands, queued cancellation/disposal, late results, replacement plans, and unavailable targets.

Lifecycle consolidation update: the shared runtime now retains one invocation across pause/resume, aborts dispatch cooperatively on stop/dispose, keeps capability locks until in-flight transport settles, rejects replacement loads while unsettled, clears old plans/queue entries/approval on subsequent loads, and fails fast on dispatch errors. Nineteen additional regressions cover interruption, late results, queue cancellation, lock ownership, duplicate session IDs, replacement loads, and lifecycle listeners. Current target eligibility, app-side automatic confirmation, full revision-bound approval, structured run outcomes, and an acknowledged hardware stop contract remain open; these changes do not enable physical robot execution.

Acceptance criteria:

- Pausing during the first command prevents the second from starting until resume; resume sends each remaining command once.
- Stopping or disposing during the first command prevents the second from starting, and late completion preserves the terminal state.
- A stopped/disposed queued session sends no commands when the queue is processed.
- A replacement plan requiring confirmation cannot execute using an earlier plan's approval.
- Denied plans, unsupported capabilities, and unavailable/planned targets send no commands; UI and traces explain why.

### P1: Faithful Compilation and Observable Execution

Owners: `@botlab/blocks`, `@botlab/model`, `@botlab/runtime`, `@botlab/simulators-microduck`, and `apps/botlab-web`.

Observed gaps:

- The demo compiler selects the first LED block anywhere in the XML, including disconnected blocks, and ignores subsequent actions.
- The demo simulation validates command-to-control-frame mapping and returns `passed` without executing a simulator engine. The app's preview runtime only registers control sources locally.
- The execution statechart can enter `completed` when the runtime produces no run result or returns a failure as a resolved value.

Tasks:

- [ ] Traverse the supported Scratch block connections from the entry event and compile actions in order. Explicitly reject unsupported control flow and diagnose disconnected blocks instead of silently executing or discarding them.
- [ ] Move Scratch XML parsing and compilation out of the app flow machine behind the editor/compiler boundary; keep robot command mapping behind the appropriate package contract.
- [ ] Distinguish command validation, remote visual preview, and actual simulator execution in contracts, artifacts, and UI wording. Only report simulator execution success when the connected runtime provides completion evidence.
- [ ] Connect the compiled plan to one observable execution target. A deterministic fake target is acceptable for this milestone if clearly labeled; official simulator execution remains incomplete until its engine consumes commands and reports results.
- [ ] Branch the XState flow on runtime outcomes: success, failure, cancellation, confirmation required, and no queued work. Do not equate promise resolution with successful execution.
- [ ] Invalidate compiled/simulation results when their source workspace or target changes and prevent stale asynchronous results from being shown as current.
- [ ] Persist and restore the workspace locally with a versioned artifact format. Retain the last execution trace and its source-plan identity; restored work must not resume execution or restore policy approval automatically.

Acceptance criteria:

- Two connected actions compile into two commands in the authored order; a disconnected LED block is never executed as part of the entry script.
- Unsupported blocks or malformed input produce actionable diagnostics rather than a misleading successful compilation.
- The user can save, refresh, restore the two-action workspace, execute it on the selected observable target, and see both effects and their trace.
- Failed, cancelled, empty, and confirmation-blocked runs are not displayed as successful completion.
- A visual preview or command-validation result is never presented as evidence that a physical simulation ran.
- Changing the workspace or target requires a fresh compile and the relevant validation/confirmation before execution.

### P2: Verification and Enforced Architecture Boundaries

Owners: workspace tooling and the affected packages.

Review baseline: the full test run reported 69 passing tests and one failure caused by error-message wording. Builds passed, but an explicit app typecheck failed because the validation actor inferred `artifact.status` as `string`. The root `npm test` command covered only the app. These are observations from the review, not current completion claims.

Tasks:

- [x] Correct the validation actor output typing. Its explicit output type is present and the app typecheck passed on 2026-09-13.
- [ ] Include the explicit app typecheck in the standard validation workflow; a successful Vite build alone is insufficient.
- [x] Recheck the historical Scratch Blocks error-message test failure: all app and blocks suites passed on 2026-09-13.
- [ ] Keep localized UI messages separate from stable diagnostic identifiers where appropriate.
- [x] Document and execute the full-workspace test command covering all seven configured app/library targets.
- [x] Add `test:all` and the separate `test:simulator-turns` physics regression command.
- [ ] Wire tests, typechecks, lint, and builds into CI.
- [ ] Replace unrestricted Nx tag dependencies with rules reflecting ADR 0001. Keep transport and simulator internals out of the app, and UI/editor-engine dependencies out of the runtime/model.
- [x] Add browser-level coverage for the real editor's two-action save/reload/execute/stop flow, alongside runtime regression tests using controlled asynchronous dispatchers. The maintained iframe workspace check covers three connected actions plus edit/rerun and interruption.

Acceptance criteria:

- App and library typechecks, tests, lint, and builds pass through the documented validation workflow.
- The full-workspace test command includes the runtime, model, blocks, and simulator suites.
- Lint rejects imports that violate the documented architectural boundaries.
- The milestone's end-to-end scenario is verified against an observable target, with its fake/simulated/hardware nature recorded explicitly.

## Milestone 1: Project Foundation

Goal: keep the monorepo stable, understandable, and easy to extend.

Tasks:

- Confirm project naming and package naming conventions.
- Add project tags in each `project.json`, for example `scope:runtime`, `scope:adapter`, `type:ui`.
- Add root scripts for common Nx workflows.
- Add lint/typecheck/build targets where Nx does not infer enough.
- Add a lightweight architecture decision record folder: `docs/adr`.
- Add a `docs/glossary.md` for BotLab terms.

Acceptance criteria:

- `npm run build` passes.
- `npm run test` passes.
- `npm run nx -- show projects` lists every app and library.
- README links to the implementation plan, glossary, and ADR index.

## Milestone 2: Domain Model v1

Goal: make the core BotLab concepts precise enough for the editor, runtime, adapters, and simulators to share.

Packages:

- `@botlab/model`

Tasks:

- Expand `Policy` with rule categories: safety, resource, target, environment, and user confirmation.
- Expand `Skill` with inputs, outputs, required capabilities, and generated block metadata.
- Expand `Behavior` with graph or AST representation.
- Add `BehaviorArtifact` and `CompiledBehaviorArtifact`.
- Add `TargetProfile` with hardware, firmware, simulator, and connection details.
- Add `CapabilitySchema` so adapters can describe commands and telemetry.
- Add validation helpers for behavior plans and adapter manifests.
- Add model unit tests.

Acceptance criteria:

- Model types can represent at least one MicroDuck LED behavior.
- Model types can represent at least one future StackChan expression behavior.
- Model tests cover valid and invalid behavior definitions.
- No app imports robot-specific details directly from model fixtures.

## Milestone 3: Visual Editor Boundary

Goal: turn `@botlab/blocks` into a real boundary for Scratch Blocks first, with room to swap in TurboWarp or Blockly later.

Packages:

- `@botlab/blocks`
- `@botlab/model`

Tasks:

- Choose the official `scratch-blocks` package as the first real editor route.
- Add `BlocksEditorProvider` interface.
- Add `BlocksWorkspaceArtifact` type.
- Add import/export functions for workspace XML or equivalent block format.
- Add a first Scratch XML to MicroDuck demo plan compiler path.
- Add a mock provider for tests and development.
- Add Scratch Blocks provider boundary with an injected bridge contract.
- Add official `scratch-blocks` as a local dependency of `@botlab/blocks`.
- Serve Scratch Blocks and Blockly media assets from the app without exposing `node_modules` paths to the browser.
- Register initial BotLab custom blocks through the Scratch Blocks/Blockly API.
- Add UI states: empty workspace, loaded workspace, dirty workspace, invalid workspace, read-only workspace.
- Add callbacks for artifact updates and validation errors.
- Keep engine-specific globals out of the app.

Acceptance criteria:

- App can load a sample workspace artifact.
- App receives editor changes as BotLab artifacts.
- Editor package can be tested without launching the full app.
- The selected block engine can be swapped without changing `apps/botlab-web`.

Open decisions:

- Whether TurboWarp features should be added later through the same editor boundary.
- Whether BotLab stores blocks as XML, JSON, or a normalized internal artifact.
- How custom robot blocks are registered per adapter.

## Milestone 4: Runtime v1

Goal: define how BotLab executes behavior plans independently of any one robot.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Add runtime session lifecycle: create, start, pause, resume, stop, dispose.
- Add behavior loading and compiled plan loading.
- Add command dispatch abstraction.
- Add event bus for runtime events.
- Add introspection snapshots.
- Add trace generation.
- Add error taxonomy: validation, policy, adapter, transport, scheduler, simulator.
- Add unit tests around lifecycle and dispatch.

Acceptance criteria:

- Runtime can load a compiled behavior plan.
- Runtime can dispatch a command to a fake adapter.
- Runtime produces introspection snapshots and trace artifacts.
- Runtime never imports web UI or block-engine code.

## Milestone 5: Policy Engine v1

Goal: prevent unsafe or unsupported behavior execution before commands reach an adapter.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Add policy evaluation before behavior execution.
- Add policy evaluation before command dispatch.
- Add policy result states: allow, deny, require confirmation, warn.
- Add policy violation artifacts.
- Add default policies for untrusted behavior plans.
- Add target-specific policy overlays.

Acceptance criteria:

- A behavior using an unsupported capability is denied.
- A behavior targeting a planned/offline target is denied.
- A behavior requiring confirmation produces the right runtime state.
- Policy results are visible to the app through introspection.

## Milestone 6: Scheduler and Arbitration

Goal: support multiple behaviors and resolve capability conflicts explicitly.

Packages:

- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Implement scheduler profiles: manual, timed, event-driven.
- Implement behavior run queue.
- Implement cancellation and timeout handling.
- Implement arbitration strategies: priority, exclusive lock, cooperative.
- Add capability locks.
- Add tests for conflicting behaviors.

Acceptance criteria:

- Two behaviors cannot command the same exclusive capability at the same time.
- Priority arbitration selects the expected behavior.
- Runtime traces explain scheduler and arbitration decisions.

## Milestone 7: MicroDuck Adapter v1

Goal: connect BotLab to MicroDuck through a real adapter layer.

Packages:

- `@botlab/adapters-microduck`
- `@botlab/runtime`
- `@botlab/model`

Tasks:

- Research MicroDuck connection options and official SDKs.
- Define MicroDuck transport abstraction.
- Implement discovery where possible.
- Implement connection lifecycle.
- Implement LED capability.
- Implement basic motion capability if supported.
- Implement telemetry or health checks if available.
- Add adapter-level tests with fake transport.
- Add docs for local setup.

Acceptance criteria:

- Runtime can list MicroDuck targets.
- Runtime can connect to a fake MicroDuck transport in tests.
- Runtime can dispatch at least one LED command through the adapter.
- Unsupported commands fail with typed adapter errors.

Open decisions:

- USB, WebUSB, serial, Bluetooth, or another transport.
- Whether browser transport is enough or a local bridge process is required.

## Milestone 8: Simulator Integration v1

Goal: let users test behavior without a physical robot when an official simulator exists.

Packages:

- `@botlab/simulators-core`
- `@botlab/simulators-microduck`
- `@botlab/runtime`
- `@botlab/adapters-microduck`

Infrastructure decisions:

- Keep shared simulator contracts in `libs/simulators/core`.
- Keep robot-specific simulator integrations in `libs/simulators/<robot>`, starting with `libs/simulators/microduck`.
- Do not put heavy simulator dependencies in `@botlab/simulators-core`.
- Do not modify `node_modules`.
- Do not vendor upstream MicroDuck meshes, ONNX policies, logos, sounds, or simulator bundles unless licensing is explicitly verified.
- Prefer a pinned upstream asset manifest with hashes and a user cache for MicroDuck simulator assets.
- Use the current isolated iframe host with the BotLab controller/source bridge and explicit execution messages, as documented in ADR 0002. Revisit in-process hosting only for a concrete product or operational need.
- Use Nx affected validation before committing simulator infrastructure changes.

Tasks:

- Identify official MicroDuck simulator package or process. Done: browser simulator is a Hugging Face Space full app, daemon simulator is a heavier local process path.
- Add simulator bridge interface. Done: initial `SimulatorBridge` contract lives in `@botlab/simulators-core`.
- Add simulator target registration. Done: MicroDuck simulator metadata lives in `@botlab/simulators-microduck`.
- Add upstream manifest types for MicroDuck simulator assets, including URL, revision, hash, and license notes. Done: initial manifest and validation helpers live in `@botlab/simulators-microduck`.
- Add a cache/setup path for MicroDuck simulator assets without committing those assets to the repo. Started: cache planning and setup interfaces now distinguish pending license review, missing assets, stale hashes, blocked assets, and ready assets, and only write downloaded bytes after SHA-256 verification.
- Add a BotLab simulator control source that maps compiled BotLab commands to the official simulator controller contract. Started: compiled LED and differential drive commands now map into typed MicroDuck simulator control frames, duration-aware drive frames stay active across simulator ticks, and BotLab exposes a source compatible with the official simulator `Controller` source contract.
- Spike loading the official simulator game core in the BotLab UI through `@botlab/simulators-microduck`. Started: a lazy runtime connector can register the BotLab source with the official simulator controller once the game runtime is loaded, the MicroDuck package now exposes a host loader that warns on unverified assets without vendoring them, and the web host can show the official Hugging Face Space as a remote educational preview.
- Add a BotLab-enabled browser host path for the official simulator. Started: `@botlab/simulators-microduck` now defines a stable `postMessage` envelope, simulator-side `Controller` source, generated `controls/botlab.js` patch module, and idempotent `game.js` patcher so a local patched simulator host, or an upstream-accepted BotLab source, can receive compiled BotLab control frames without relying on cross-origin iframe injection. A local `npm run microduck:sim -- --start` helper now prepares and runs the patched official simulator checkout from `tmp/microduck-simulator`.
- Map simulator capabilities to the same adapter contract as hardware. Started: the MicroDuck adapter exposes USB hardware and simulator targets under the same adapter id, shares LED and motion capability target bindings across both targets, and the app flow-machine suite now asserts that contract.
- Add simulator output artifacts. Started: the simulation flow now creates a typed `simulator-output` artifact with command count, command echoes, simulator messages, and the bridge snapshot, and the web app surfaces it in the artifact inventory and simulator host. The default MicroDuck demo now compiles visible LED feedback plus a 5 m walk command and stop command so the official simulator can show physical movement, not just a control-channel handshake.
- Add app UI for selecting hardware versus simulator target.

Acceptance criteria:

- Runtime sees simulator targets and hardware targets through the same target model.
- A simulated MicroDuck behavior can produce an output artifact. Started: the demo MicroDuck simulator path emits a `simulator-output` artifact for the compiled plan.
- Simulator integration does not require copying official simulator source or assets into BotLab without license verification.
- First-run simulator asset loading has clear pending, success, and failure states.
- Updating upstream MicroDuck simulator inputs is a manifest/hash update plus adapter verification, not an ad hoc patch.

Next handoff:

1. Verify licenses for the official browser simulator source, MicroDuck model assets, ONNX policies, meshes, and sounds.
2. Fill reviewed SHA-256 values and license decisions into the MicroDuck upstream manifest once the exact official asset set is approved.
3. Add a concrete browser or local cache store implementation for the setup/download interfaces.
4. Add the web UI host that lazy-loads the official simulator runtime, calls `connectMicroDuckBotLabSourceToOfficialSimulator`, and renders the simulator scene. Started: the workbench now reserves a MicroDuck simulator host surface with asset-gated runtime state, warns on unverified assets unless explicitly restricted, embeds the local BotLab-enabled official simulator host at `http://127.0.0.1:4300/?boot=1`, and posts compiled BotLab control frames into that host through the simulator source boundary.
5. Continue UI state for simulator load failure and ready/running states. Started: the app now surfaces blocked, loading, ready, running, failed, and disconnected host states alongside per-asset setup status from the MicroDuck manifest. The host now stays `ready` after a simulation output is produced, moves to `running` only after the runtime source is loaded, exposes a disconnect action that returns the UI to `disconnected`, and marks the host as `failed` if the local simulator preview errors or does not load within the timeout.
6. Keep the existing local bridge tests green while adding browser-level smoke coverage for the visible simulator. Started: the app test suite verifies actual `postMessage` calls from the mounted React component, in addition to the delivery helper. A regression test reproduced zero sends caused by effect cleanup cancelling its own timers; delivery now survives the sent-state update. Generated receiver tests exercise early buffering, startup lock, duplicate delivery, stopping, untrusted origins, and patch upgrades. A local browser check on 2026-09-12 confirmed receipt and consumption of all three demo frames and an odometer change from 0.0 m to 0.4 m. This verifies movement in the patched engine, but does not yet provide execution acknowledgements back to BotLab or an automated browser test. The nominal 5 m block still uses a 2.5 s estimate based on 2 m/s, while the official feet mode limits forward speed to 0.25 m/s; exact distance execution remains incomplete.

The simulator now has one Run action beside the preview, replacing the separate compile, validate, simulate, execute, and runtime-load controls. It compiles the current workspace, validates the simulator plan, dispatches the local demo, and loads the preview runtime automatically when needed. Subsequent runs reuse the iframe and send the newly compiled plan. Preparation failures stop delivery, workspace or target changes cancel preparation, and load errors or timeouts allow retrying with the same button. Each execution uses a fresh ID, retries share that ID, and the receiver ignores delayed retries from previous executions. Replaying replaces the active sequence without remounting the iframe or resetting the scene. App regression coverage includes first-run setup, editing the distance, rejecting stale execution, replaying identical content, cancelling superseded retries, disconnect cleanup, and all three button locales; it does not equate local demo dispatch completion with engine completion.

The demo compiler now follows the `next` chain of one green-flag script, preserving repeated LED and walk blocks and lowering numeric `control_wait` durations to timed zero-power motion frames. Detached blocks are ignored; unsupported connected blocks, expressions, invalid durations, empty scripts, and multiple green-flag scripts fail explicitly. A final stop frame is appended. Regression tests exercise walk/wait/walk through both the TypeScript and generated simulator receivers. This is sequential subset support, not a full Scratch interpreter; distance remains time-estimated rather than measured by the physics engine.

## Milestone 9: Artifacts and Persistence

Simulator fidelity update: walk commands carry distance without an estimated duration and preserve source block IDs. The native and generated simulator sources measure horizontal displacement per walk, keep zero-motion ownership during waits, and reject missing telemetry, position resets, stalled movement, and motion timeouts. The app highlights active/failing blocks and displays live meters or wait countdowns in Catalan, Spanish, and English. The setup tool expands only its ignored upstream checkout to a 12 x 12 m arena. Historical speed-estimate limitations above are superseded for walking, but LED fidelity, scene reset UX, and richer block control flow remain future work.

Persistence update: a versioned browser-local document now saves Scratch XML, locale and the last confirmed simulator trace with its source plan. The editor exposes JSON import/export (2 MB limit), failed writes preserve the previous copy, malformed/unknown-version stored data is not silently replaced, and active traces restore as interrupted without reconnecting, running or restoring approvals. This is one local workspace per site origin, not cross-device sync or a multi-project artifact repository.

Consolidation update: the embedded official simulator now reports identified execution acceptance, frame progress, completion, stop and polling failure. The app no longer runs its local fake dispatcher before launching a simulator plan and does not infer engine completion from validation. Stop clears buffered/current frames, blocks late retries, and requires acknowledgment; missing startup/progress/stop feedback closes the iframe. This completes the simulator-specific stop/status path, not shared runtime interruption or hardware safety. Tests cover both the library generator and the setup tool's generated receiver.

Goal: make user work durable and inspectable.

Packages:

- `@botlab/model`
- `@botlab/runtime`
- `apps/botlab-web`

Tasks:

- Define artifact storage interface.
- Store block workspace artifacts.
- Store compiled behavior artifacts.
- Store trace and log artifacts.
- Add import/export from the app.
- Add local persistence first, likely IndexedDB or filesystem bridge depending on target environment.

Acceptance criteria:

- User can create or load a sample behavior.
- User can refresh the app without losing the current workspace.
- Runtime traces can be inspected after execution.

## Milestone 10: App UX v1

Goal: turn the first screen into a usable BotLab workbench.

Packages:

- `apps/botlab-web`
- `@botlab/ui`
- `@botlab/blocks`
- `@botlab/runtime`

Tasks:

- Add main layout: editor, target panel, runtime panel, artifact panel.
- Add target selector.
- Add capability browser.
- Add run controls: validate, simulate, run, stop.
- Add policy status.
- Add runtime log panel.
- Add behavior artifact list.
- Add empty/error/loading states.

Acceptance criteria:

- A user can select MicroDuck simulator or hardware target.
- A user can validate a sample behavior.
- A user can run a sample behavior against a fake/simulated target.
- App communicates status without exposing internal implementation details.

## Milestone 11: StackChan Planning

Goal: prepare StackChan support without slowing down MicroDuck v1.

Packages:

- `@botlab/adapters-stackchan`
- `@botlab/model`

Tasks:

- Research StackChan capabilities and transports.
- Define initial capability map: expression, sound, speech, motion if applicable.
- Define future simulator strategy.
- Add sample behavior fixtures.
- Keep adapter status as `planned` until at least one real capability works.

Acceptance criteria:

- StackChan adapter contract is documented.
- App can show StackChan as planned without implying it is executable.
- Model supports StackChan-style expression skills.

## Milestone 12: Developer Experience and Release Readiness

Goal: make BotLab easy to contribute to and safe to change.

Tasks:

- Add CI workflow for build and tests.
- Add formatting command.
- Add dependency update policy.
- Add conventional commit guidance if desired.
- Add issue templates for adapters, runtime, editor, and simulator work.
- Add release notes process.
- Add security notes for robot execution and local transports.

Acceptance criteria:

- Pull requests run build and tests.
- New adapter work has a clear template.
- New block-engine work has a clear boundary.
- Security-sensitive robot execution paths are documented.

## Near-Term Backlog

Execution follows the [agreed delivery order](#agreed-delivery-order--2026-09-13):

1. Completed for the recorded Feet configuration: reproduce and fix the turn regression, with library and browser/physics coverage. Extend the mode/scene matrix as needed.
2. Verify the saved-program execution/stop flow and complete app/library/browser verification coverage.
3. Deliver architecture changes A1–A7 in bounded increments, with hardware-specific guarantees required before hardware enablement.
4. Expand executable blocks, beginning with finite repetition and then expressions and conditions. A library of programs/examples is deferred.
5. Resume physical StackChan support and broader scheduler/arbitration work after the simulator experience is reliable.

## Technical Risks

- Scratch Blocks, TurboWarp, or Blockly integration may require asset loading or build configuration that conflicts with Vite.
- Real robot transports may require browser APIs, native bridges, or permissions that change the app architecture.
- Simulator licensing or packaging may prevent direct dependency integration.
- Runtime policy and arbitration need careful design before real robot execution.
- The local Codex sandbox blocks some Nx/Vite development-server operations without elevated permission.

## Working Rules

- Prefer Nx generators for new projects and library structure.
- Keep implementation commits scoped by milestone or package.
- Keep robot hardware code behind adapters.
- Keep simulator-specific code behind simulator bridges.
- Keep browser UI declarative and domain-driven.
- Add tests when changing shared model, runtime, adapter contracts, or execution behavior.

### StackChan DANCE blocks (2026-09-16)

Implemented a dedicated BLE program route for bounded horizontal head position/center and side LED color/brightness/off. Full preflight, bounded angles, distance-based pauses and periodic automatic rests, source-block tracking, and abort-on-edit/cancel/disconnect are active. Vertical motion stays excluded. Manual −10°/0°/+10° was confirmed by the owner; new sequences/LEDs await physical observation. Generic hardware runtime remains planned. See `docs/stackchan-1.5.1.md` and the importable `examples/stackchan-first-program.botlab.json`.
