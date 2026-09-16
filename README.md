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

<!-- workspace libraries and applications under apps/ and libs/ -->

```txt
apps/
  botlab-web/                  React app and first BotLab screen
  simulator-macos/             Simulator catalog host and Mac bundle
libs/
  botlab-model/                Core concepts and shared contracts
  runtime/                     Runtime session, adapter registry, introspection
  blocks/                      Scratch Blocks/TurboWarp boundary
  adapters/
    microduck/                 Initial MicroDuck adapter contract
    stackchan/                 DANCE Bluetooth head/LED executor and factory encoders
  simulators/
    core/                      Shared simulator contracts
    microduck/                 MicroDuck browser simulator / iframe bridge
    microduck-native/          Native MuJoCo services and JSON-RPC client
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

<!-- runtime configuration and lifecycle from libs/runtime/src/lib/runtime.ts -->

`@botlab/runtime` accepts adapters and simulator integrations as configuration. MicroDuck and StackChan packages expose targets and capabilities through the shared `BotLabAdapter` contract.

The runtime pauses between commands, cancels queued work on stop/dispose, and supplies dispatchers with a cooperative abort signal. Locks remain held until any in-flight dispatch settles. This is not a hardware emergency-stop guarantee; see the [runtime lifecycle contract](libs/runtime/README.md).

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

<!-- runnable workspace commands and test scope from package.json and project test targets -->

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm run dev
pnpm run build
pnpm run build:libs
pnpm run test
pnpm run test:all
pnpm run typecheck:all
pnpm run lint:all
pnpm run format --all
pnpm run format:check --all
pnpm run test:architecture
pnpm run verify
pnpm run affected:build
pnpm run affected:test
pnpm run affected:lint
pnpm run microduck:sim --start
pnpm nx show projects
```

Use the affected scripts for everyday validation when only part of the workspace changed. Use `build:libs` when you want a full library contract check. `pnpm run verify` checks formatting and runs all app/library and configured test typechecks, configured test suites, lint, architecture regression checks and library/app builds. It requires Node 22.22+ (or Node 24+), pnpm 10.34.5 and Python 3.11 or newer; native unit tests use only the Python standard library.

`pnpm test` runs only the web app's Jest suite. `pnpm run test:all` runs every configured test target: the app plus the model, runtime, blocks, simulator core, MicroDuck browser simulator, MicroDuck native simulator, MicroDuck adapter and StackChan adapter libraries. The libraries use Vitest, including controlled bridge/receiver integration tests and native proximity-trigger tests. StackChan tests cover firmware payloads, BLE limits, and bounded sequences; the UI library does not yet have a dedicated test suite. These tests do not run the official physics engine. `pnpm run test:simulator-turns` and `pnpm run test:simulator-postures` provide separate browser-engine regressions; see the MicroDuck simulator README for its setup. The [native MicroDuck experiment](tools/microduck/native/README.md) separately exercises the real robot services against MuJoCo.

`pnpm run test:simulator-native` builds the [native simulator library](libs/simulators/microduck-native/README.md) and checks its client against real local services; first run the native preparer documented in the experiment README. It is separate from the unit suites and stops its owned processes afterwards. The app now offers both the iframe and an experimental native MuJoCo view.

`pnpm run microduck:sim --start` prepares a local checkout of the official MicroDuck browser simulator under `tmp/microduck-simulator`, hydrates Git LFS assets into that ignored checkout, injects the BotLab postMessage control source, and starts the patched simulator host. Keep `pnpm run dev` running separately for the BotLab app.

## Native simulator in the app

<!-- native app controls and startup from apps/botlab-web/src/app/native-simulator-panel.tsx, apps/botlab-web/vite.config.ts, package.json and libs/simulators/microduck-native/python/botlab_microduck_native/gateway.py -->

For a separate Mac window, build and open [BotLab Simulator.app](apps/simulator-macos/README.md) with `pnpm run build:simulator-macos`. The Apple Silicon bundle includes its runtime, services and assets; the installed app starts with a double click. Keep the web editor running separately, select **Native MuJoCo**, then **Connect**. External mode exchanges commands and telemetry without streaming video. Closing the scene or quitting the companion stops its services. The current bundle has a local development signature; distribution signing/notarization is pending.

For the embedded development alternative, after the one-time native preparation, run `pnpm run microduck:native` alongside `pnpm run dev`. In the **Simulator** selector choose **Native MuJoCo (experimental)** and **Connect**. The panel renders the real body state with MuJoCo, shows policy/ToF telemetry, and provides run, stop, sit/stand, scene reset and disconnect. The browser iframe remains the default and can be selected again after stopping.

The native path executes movement, explicit sit/stand posture, and wait blocks. LED blocks are rejected before execution; remove them from the program to try native motion. Per-block limits are 5 m, 360° and 60 s. Native policy commands still require measured displacement/yaw and settling; this does not imply better turn accuracy than the browser simulator. The view uses an independent MuJoCo render process and a bounded MJPEG stream targeting 30 fps, while the upstream policy loop targets 50 Hz. The measured Chrome check received about 29 fps and painted about 28.7 distinct images/s; the telemetry no longer carries image payloads. Floor reflections are disabled while shadows remain enabled. Native traces are currently live only; saved execution traces belong to the iframe path.

The gateway binds to `127.0.0.1:4401`. `BOTLAB_NATIVE_SIMULATOR_URL` configures the app endpoint at Vite startup; `pnpm run microduck:native --port PORT --origin http://your-local-app-origin` configures the local gateway. Default permitted origins are `http://127.0.0.1:4200` and `http://localhost:4200`. One browser session controls the simulator at a time. Losing its heartbeat for two seconds stops the program and releases control; switching backend/disconnecting explicitly releases it. Stop the gateway before running standalone native probes, which share body port 17831.

Native posture blocks appear in **Precise movement** and require a connected target advertising `sit_toggle` plus the requested posture. Capability discovery reconciles the daemon's configured skills with loaded policies; missing capabilities fail before execution. Repeating an already achieved Stand or Sit stops at that block with a teaching error; use an explicit posture condition to decide whether to act. Completion uses observed policy, trunk height stability and gyro motion in the native simulator, with a 12-second timeout. **Stop cancels the sequence, but an already latched native posture transition finishes settling**; the UI permits posture conditions during a known transition, while movement still requires standing stability. No following block executes after cancellation. **Sensing** contains sitting, standing and changing-posture predicates; **Control** contains if / if-else with nested branches. The native panel shows observed posture and each branch decision. Unknown posture fails the condition rather than choosing its false branch. The updated iframe also executes these posture blocks and conditions using its own physical observer. Native execution requires the updated companion.

`pnpm run test:simulator-native-posture` checks repeated postures, a posture/movement sequence and cancellation in Chrome against the real simulator. `BOTLAB_QA_URL` selects an isolated compiled preview; allow that exact origin on the gateway. Rebuild the Mac application after Python library changes.

`pnpm run test:simulator-native-video` measures received and painted frame rates, payload size and control rate in Chrome. It requires the prepared native environment (including pinned Pillow), app and gateway.

`pnpm run test:simulator-native-app` is the separate Chrome/Playwright acceptance check with both app and gateway running. Set `BOTLAB_PLAYWRIGHT_MODULE` to an installed Playwright package path if it is not available by name. Set `BOTLAB_NATIVE_PRESENTATION=external` when checking the Mac companion; this also asserts that the editor requests no video.

## Simulator Progress

<!-- measured movement, source block tracking, and local arena from libs/simulators/microduck/src/lib/microduck-distance.ts, apps/botlab-web/src/app/app.tsx, and tools/microduck/prepare-official-simulator.mjs -->

MicroDuck walk blocks now finish on measured horizontal displacement from each block's start position, not a speed-to-duration estimate. Wait blocks hold zero motion for their duration. The editor highlights the active block, and the simulator panel displays distance progress, a wait countdown, or localized execution errors. Lost position telemetry, scene interruptions, implausible position jumps, and stalled movement fail the run instead of claiming arrival. This is straight-line displacement, not the HUD's accumulated odometer, and physics can drift slightly after the stop command.

A failure reported by the simulator stops the program but keeps the scene open, including its current robot configuration. The failing block stays highlighted; editing and running again reuses the loaded runtime. Missing communication or unconfirmed execution still closes the iframe as a stop fallback.

<!-- visual movement palette from libs/blocks/src/lib/scratch-blocks-local-bridge.ts and measured turns from libs/simulators/microduck/src/lib/microduck-turn.ts -->

The Movement category offers forward/backward BotLab steps (0.5 m each), left/right quarter turns, and a half turn. Precise movement offers forward/backward meters and signed degrees. Negative angles turn left; positive angles turn right. Each block has a bundled SVG icon and Catalan, Spanish and English labels. Turns finish on measured yaw and report progress in degrees; regenerate the simulator receiver with `pnpm run microduck:sim --no-install --no-lfs-hydrate` when updating an existing local checkout. Old meter-based programs remain compatible.

BotLab's official-simulator connection uses calibrated Feet commands: -0.4 for reverse and 2 for angular motion, with a minimum angular input of 1.5 near turn completion. The bundled walking policy can stall at the upstream reverse/angular inputs; in the reproduced right-turn case it stopped making progress at about 15° of a requested 90°. These are policy inputs, not guaranteed physical speeds. Turns hold zero motion after reaching the requested angle, wait for the body to settle, and correct residual error before proceeding. Measured arrival and stall detection still govern execution. Regenerate an existing host with `pnpm run microduck:sim --no-install --no-lfs-hydrate` to apply the correction; a separately built remote preview also needs rebuilding.

<!-- importable movement example from examples/microduck-movement.botlab.json -->

Import `examples/microduck-movement.botlab.json` with the workbench's Import program action to try two steps forward, a left turn, two more steps, a one-second wait, a half turn, and one step backward. Importing does not execute the program.

The setup tool expands the ignored official checkout's arena to 12 x 12 meters so the sample 5-meter walk has room. Existing checkouts need `pnpm run microduck:sim --no-install --no-lfs-hydrate` to refresh the generated bridge and arena patch. No official assets are added to Git.

## Workspace Persistence

<!-- workbench layout from apps/botlab-web/src/app/workbench-layout.tsx, apps/botlab-web/src/styles.css, and libs/blocks/src/lib/blocks.tsx -->

The main workbench shows the block editor and simulator side by side from 1024 px upwards. Smaller screens use keyboard-accessible Program and Simulator tabs. Switching views keeps both surfaces mounted; inactive mobile views are offscreen and inert, rather than unloading the simulator. Diagnostic panels and simulator details are collapsed by default, while execution progress and errors remain visible. Narrow editors (up to 600 px) use an overlay block palette; the palette button and category list reopen it. Scratch resizes with its container without replacing the workspace. New workbench labels are available in Catalan, Spanish, and English.

<!-- block localization from libs/blocks/src/lib/block-messages.ts and libs/blocks/src/lib/scratch-blocks-local-bridge.ts -->

Blocks follow the selected UI locale (Catalan by default), including the palette, standard Scratch messages, MicroDuck dropdown labels and tooltips. Language changes preserve the program's executable identifiers and values and do not restart simulation. Versioned display-only catalogs and local translation overlays provide the extension point for external integrations; see `libs/blocks/README.md`. Repository/policy importing and automatic translation are not implemented by this catalog layer.

<!-- scene reset lifecycle from apps/botlab-web/src/app/app.tsx and apps/botlab-web/src/app/simulator-execution-machine.ts -->

The simulator toolbar's Reset scene action replaces only the simulator iframe, returning the robot and scene to their initial state. It cancels launch preparation, stops and disposes the previous command transport, and removes the pending program before reloading. Blocks and the last execution trace are preserved; an active trace is marked stopped. Reset does not compile or run anything. Run is disabled during the reload and must be pressed explicitly afterwards. This currently reloads the simulator runtime rather than resetting physics in place.

<!-- workspace document schema and storage behavior from apps/botlab-web/src/app/workspace-storage.ts -->

BotLab automatically saves Scratch XML, robot and simulator selection, the selected UI language, and the last simulator execution trace. Named projects and the last active project ID are saved in this browser's local storage (`botlab.projects.v1`); `botlab.workspace.v1` also holds a snapshot of the current workspace. The versioned JSON document is limited to 2 MB and retains up to 64 execution events with their original control-frame plan. Reloading restores the workspace but not compiled approval, a connection, or running execution; a previously active trace is marked interrupted. Invalid documents and failed writes do not overwrite the last stored copy.

The editor toolbar imports and exports `botlab-workspace.json` documents. Importing replaces the current workspace and disconnects the simulator. Storage is local to the browser and exact site origin, not synchronized between devices; use export/import when moving devices or changing a temporary tunnel URL. These controls do not recover work lost before autosave was introduced.

### Workspace acceptance

<!-- browser workspace acceptance from tools/microduck/verify-workspace.mjs and package.json#scripts -->

With the local editor (`pnpm run dev`) and prepared official simulator (`pnpm run microduck:sim --no-install --no-lfs-hydrate --start`) running, run `pnpm run test:workspace`. The check requires Chrome and Playwright; set `BOTLAB_PLAYWRIGHT_MODULE` to an installed Playwright module path when it is not available by name. `BOTLAB_QA_URL` defaults to `http://127.0.0.1:4200/` and must be local. The simulator must allow that exact app origin. `BOTLAB_SIMULATOR_CHECKOUT` selects the prepared checkout used to record the upstream revision.

The check uses an isolated browser context, imports a connected advance/turn/wait fixture, edits a numeric field through the real Scratch UI, and verifies autosave, export and reload. It checks measured motion, block highlighting, matching saved traces, acknowledged stop, editing and rerunning, cancellation when editing during execution, and reload without resuming. JSON evidence, the exported program and screenshots go to `tmp/workspace-qa` (override with `BOTLAB_QA_OUTPUT`). It observes the real iframe engine without replacing its transport or physics. This is a separate acceptance command; the standard CI verification does not require simulator assets or Chrome.

<!-- source invalidation from apps/botlab-web/src/app/app.tsx and apps/botlab-web/src/app/simulator-execution-machine.ts -->

Editing the program or changing its target clears the current execution result while preserving the last run in history. An edit during execution requests a stop and waits for acknowledgement before enabling another run; missing acknowledgement retains the stop-failure fallback. The new program remains unexecuted until Run is pressed.

### Shared execution outcomes

<!-- execution results from libs/botlab-model/src/lib/execution.ts, libs/runtime/src/lib/execution.ts, apps/botlab-web/src/app/botlab-flow-machine.ts and native-simulator-machine.ts -->

The runtime, browser simulator and native simulator use a common execution result with program revision, target and execution identity. Sending a command is distinct from observed completion; cancelled, failed, confirmation-required and empty-queue outcomes cannot be shown as successful completion. Native snapshots from another run are excluded from program progress, and editing hides the previous program's result. The preparation stage is command validation; engine completion remains a separate result. Compilation no longer confirms policy and the placeholder hardware dispatcher has been removed. These changes do not enable physical robots.

## Remote Preview

<!-- simulator URL configuration from apps/botlab-web/vite.config.ts and apps/botlab-web/src/app/app.tsx -->

`BOTLAB_SIMULATOR_URL` overrides the simulator iframe URL at build or dev-server startup. It defaults to `http://127.0.0.1:4300/?boot=1`. For a combined static preview, set it to `/simulator/?boot=1`, build BotLab, and serve the simulator build under `/simulator/` (build upstream with `VITE_BASE=/simulator/`). The simulator's generated message receiver must allow the exact public BotLab origin via `microduck:sim -- --botlab-origin https://your-preview-host` before building it. A comma-separated list allows multiple exact app origins during local/public verification.

Expose only the combined static build through a temporary tunnel, not the Vite development server. A Quick Tunnel URL is public and temporary; it requires the local preview process, tunnel, and host computer to remain running. The simulator and its assets stay in the ignored local checkout, not in Git. Rebuild the preview to include later code changes. Restore the local simulator's allowed origin after building the remote copy if also using the local development preview.

When generating code, prefer Nx generators:

```sh
pnpm nx g @nx/js:lib my-lib --directory=libs/my-lib
pnpm nx g @nx/react:lib my-ui-lib --directory=libs/my-ui-lib
```

<!-- iframe posture behavior from libs/simulators/microduck/src/lib/microduck-posture.ts, microduck-simulator.ts and microduck-execution.ts -->

The iframe executes explicit Sit/Stand and posture conditions in Feet mode with the official posture policy. It observes trunk height and gyro stability, sends each action once, and waits for physical completion. Unsupported locomotion/custom-policy modes, repeated postures, missing observations, refusals and timeouts produce errors at the current block. Stop cancels later blocks while an already started posture finishes. Regenerate and rebuild the patched simulator when upgrading the bridge; updating the web editor alone does not update an existing static `/simulator/` bundle.

<!-- repeat semantics from libs/adapters/microduck/src/lib/microduck-program.ts and package.json#scripts -->

The Control category includes **repeat N times**, with integer counts from 0 to 100. Zero skips the body; nested repeats and posture conditions retain source-block highlighting and an iteration path in either simulator. Programs allow 16 nested control levels and 256 expanded steps including loop checkpoints and the final stop. Reduce counts or body size if the budget is exceeded. `pnpm run test:simulator-repeats` exercises real iframe physics; set `BOTLAB_QA_BACKEND=native` for native acceptance.

<!-- CI workflow and architecture policy from .github/workflows/verify.yml, .oxlintrc.json and tools/ci/ -->

GitHub Actions runs `pnpm install --frozen-lockfile` and `pnpm run verify` on pushes, pull requests and manual dispatch, using Ubuntu 24.04, Node 22.22.0 and Python 3.12. The workflow uses the official [checkout](https://github.com/actions/checkout), [Node setup](https://github.com/actions/setup-node) and [Python setup](https://github.com/actions/setup-python) actions. Physics acceptance and Mac packaging remain separate local commands requiring prepared simulator assets; this workflow does not download or run the physics engine.

Nx enforces the library boundaries in ADR 0001. Model/runtime cannot depend on editor/UI packages; simulator core cannot depend on a robot simulator; the app uses public package APIs and cannot import Scratch Blocks directly. Eight positive/negative import probes guard the architecture rules themselves. Global TypeScript/lint configuration and the setup bridge loader participate in Nx cache inputs.

<!-- default target from apps/botlab-web/src/app/botlab-flow-machine.ts -->

New projects select StackChan by default. App startup reopens the last active local project and restores its target. The StackChan DANCE Bluetooth panel executes bounded horizontal-head and side-LED blocks. The generic runtime target remains planned; this physical route uses its own cancellable execution actor. Select MicroDuck Simulator explicitly to run the existing simulator workspace.

<!-- header target and simulator controls from apps/botlab-web/src/app/app.tsx -->

The header contains the robot selector and, for MicroDuck, the browser/native simulator selector. StackChan has no simulator selector. Changing robot disconnects the iframe preview; selectors are disabled during execution or simulator preparation.

<!-- robot block availability from apps/botlab-web/src/app/robot-block-palette.ts and app.tsx -->

The palette follows the selected target's implemented execution route and capabilities. MicroDuck simulator motion/posture/sensor and LED blocks appear only when their capabilities are available. StackChan offers start/wait/repeat, bounded absolute horizontal yaw/center, and side LED color/brightness/off blocks. Motion requires an explicit starting-pose check. Existing incompatible blocks are disabled with a block warning and remain editable. Program execution is blocked for the selected robot or simulator until incompatibilities are resolved. Selecting a compatible target clears the derived disable without deleting blocks or overwriting independent user disables.

<!-- local project management from apps/botlab-web/src/app/project-storage.ts and app.tsx -->

The project toolbar creates blank projects, edits their names, and switches between saved projects. Each project owns its blocks, robot and simulator selection. Startup reopens the last active project without starting execution or connecting a device. Projects are browser-local and scoped to the site origin. Export a JSON file to keep a separate copy. Switching projects is disabled during execution/preparation; failed storage writes prevent switching.

## StackChan blocks

<!-- StackChan blocks and execution from libs/blocks/src/lib/stackchan-blocks.ts, libs/adapters/stackchan/src/lib/program.ts, bluetooth.ts and apps/botlab-web/src/app/stackchan-panel.tsx -->

Open DANCE, connect Bluetooth, and run a single green-flag script. Horizontal destinations are limited to ±20° at fixed speed 100/1000, changes to 10°, and movement pauses scale from 1–3 seconds with commanded distance. Every 12th movement adds a 10-second rest; reconnecting is unnecessary. Whole-program validation checks the last commanded position and scheduled duration before sending anything: 90 seconds scheduled time per program (including rests), without a session move limit or cumulative travel cap, 40 expanded actions, repeat counts 0–10 and nesting up to four levels. LED blocks select left/right/both, a color, brightness 0–25%, or both off, with a 0.5-second transition and 1-second pause. No vertical motion or continuous rotation is exposed.

Cancel, edit, disconnect, and unmount prevent subsequent commands. The UI times out after 120 seconds; BLE operations time out after 10 seconds. Cancellation disconnects Bluetooth and cannot halt a movement already received or guarantee LED shutdown. Results mean commands dispatched, not measured physical completion. Check the head's calibrated center before the first movement; software limits do not guarantee mechanical safety without position/stall feedback. See [firmware notes](docs/stackchan-1.5.1.md).

<!-- importable StackChan example from examples/stackchan-first-program.botlab.json -->

Import [StackChan: luz y saludo](examples/stackchan-first-program.botlab.json) for blue LEDs at 15%, yaw +10°, center, and LED off. Importing does not connect or execute. The owner has physically verified the manual −10°/0°/+10° controls; the new sequence and LED route have automated/mock-Bluetooth coverage and still need owner observation.

<!-- toolchain versions and commands from package.json, pnpm-workspace.yaml, nx.json and .oxlintrc.json -->

## Toolchain

BotLab uses Nx 23.2.1, pnpm 10.34.5, TypeScript 6.0.3, Oxlint 1.83.0 and Oxfmt 0.68.0. React remains on 18.3.1; the web app uses Vite 7 and Jest 30, and library suites use Vitest 4. Dependencies stay in the root manifest of this integrated Nx workspace. `pnpm-lock.yaml` is the authoritative lockfile; CI installs with `--frozen-lockfile`.

`pnpm run lint:all` uses the official `@nx/oxlint` inferred targets, including the same Nx module-boundary constraints as before. React hook dependency checks remain warnings; newly introduced React effect and semantic-tag recommendations are also warnings. `unicorn/no-thenable` is disabled because robot condition instructions use a data field named `then`; the Bluetooth tests disable `no-useless-spread` because they intentionally convert typed arrays to ordinary arrays.

`pnpm run format --all` and `pnpm run format:check --all` use Nx's Oxfmt integration. Sources synced from ChatGPT, downloaded simulators, build outputs and the generated lockfile are excluded. Nx currently labels its Oxlint integration experimental, so Oxlint and Oxfmt are pinned. TypeScript 6 uses the official Nx compatibility migration (`ignoreDeprecations: "6.0"`) to preserve the existing CommonJS library emission and path aliases. Migrating those options is deferred to a future TypeScript 7 upgrade.

The upstream MicroDuck simulator checkout still uses its own npm installation internally; BotLab commands use pnpm. See [the migration record](docs/toolchain-migration.md) for the applied generators and validation.
