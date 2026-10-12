# BotLab

BotLab is a local-first educational robotics project for learning programming by building, simulating, and running robot behaviors from a visual editor. Product decisions prioritize understandable blocks, visible cause and effect, and progressively introduced technical concepts; see the [educational product criteria](docs/implementation-plan.md#educational-product-criteria--2026-10-12).

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
    jumper/                    Compiled joint programs for the web experiment
    microduck/                 MicroDuck adapter and web walking programs
    stackchan/                 DANCE Bluetooth head/LED executor and factory encoders
  simulators/
    core/                      Shared simulator contracts
    mujoco/                    Optional shared MuJoCo worker and Three renderer
    jumper/                    Pinned Jumper joint-probe manifest
    microduck-mujoco/           Shared-engine MicroDuck ONNX walker
    microduck/                 MicroDuck browser simulator / iframe bridge
    microduck-native/          Native MuJoCo services and JSON-RPC client
  ui/                          shadcn/ui-style primitives
```

## Implementation Plan

<!-- planning entry points and session continuity from AGENTS.override.md, docs/session-workflow.md and docs/next-steps.md -->

Start or resume work with [the session workflow](docs/session-workflow.md) and [the current tasks and ideas](docs/next-steps.md). The latter is the single current priority list for all BotLab areas, including the resume point, decisions and deferred ideas. Update it during work and before ending a work session so a new chat can continue from the repository. [Local agent instructions](AGENTS.override.md) point to this workflow while preserving the generated project context.

The detailed roadmap lives in [docs/implementation-plan.md](docs/implementation-plan.md). It retains milestones, package ownership, acceptance criteria and historical implementation notes; older task lists must be checked against current evidence before starting them.

Supporting project docs:

- [Glossary](docs/glossary.md)
- [Architecture Decision Records](docs/adr/README.md)
- [Shared web simulation plan for Jumper and MicroDuck](docs/mujoco-jumper-microduck.md)

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

## Local development URL

<!-- development entry points from package.json, portless.json and apps/botlab-web/vite.config.ts -->

Run `corepack pnpm dev` to start BotLab through the locally installed Portless (Node.js 24+). The app is registered as `botlab.localhost`; `portless get botlab` prints the full URL for the shared proxy's configured protocol and port. On the current machine that is `https://botlab.localhost`. The proxy's existing settings and other routes are preserved. Running `portless` from this directory uses the same app name and the `dev:server` script.

The development script launches Vite directly, avoiding an Nx serve-task lock when another checkout/server is already running. Vite reads Portless's assigned `PORT` and binds to `127.0.0.1` with a strict port when managed. For direct access, run `corepack pnpm run dev:server --port=4210` (default: 4200). Browser-local projects belong to their origin; use **Projects → Export project / Import project** to carry existing projects from a numeric localhost URL to the named URL.

## Commands

<!-- runnable workspace commands and test scope from package.json and project test targets -->

```sh
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
pnpm run dev
pnpm run dev:server
pnpm run build
pnpm run build:libs
pnpm run test
pnpm run test:all
pnpm run typecheck:all
pnpm run lint:all
pnpm run format --all
pnpm run format:check --all
pnpm run test:architecture
pnpm run test:mujoco:educational
pnpm run test:mujoco:workbench
pnpm run test:mujoco:repeats
pnpm run verify
pnpm run affected:build
pnpm run affected:test
pnpm run affected:lint
pnpm run microduck:sim --start
pnpm nx show projects
```

Use the affected scripts for everyday validation when only part of the workspace changed. Use `build:libs` when you want a full library contract check. `pnpm run verify` checks formatting and runs all app/library and configured test typechecks, configured test suites, lint, architecture regression checks and library/app builds. It requires Node 22.22+ (or Node 24+), pnpm 10.34.5 and Python 3.11 or newer; native unit tests use only the Python standard library.

`pnpm test` runs only the web app's Jest suite. `pnpm run test:all` runs every configured test target: the app plus the model, runtime, blocks, simulator core, MicroDuck browser/native simulators, shared MuJoCo engine, Jumper/MicroDuck shared-engine integrations and the MicroDuck, Jumper and StackChan adapters. The libraries use Vitest, including controlled bridge/receiver integration tests and native proximity-trigger tests. StackChan tests cover firmware payloads, BLE limits, and bounded sequences; the UI library does not yet have a dedicated test suite. These tests do not run the official physics engine. `pnpm run test:simulator-turns` and `pnpm run test:simulator-postures` provide separate browser-engine regressions; see the MicroDuck simulator README for its setup. The [native MicroDuck experiment](tools/microduck/native/README.md) separately exercises the real robot services against MuJoCo.

`pnpm run test:simulator-native` builds the [native simulator library](libs/simulators/microduck-native/README.md) and checks its client against real local services; first run the native preparer documented in the experiment README. It is separate from the unit suites and stops its owned processes afterwards. The app now offers both the iframe and an experimental native MuJoCo view.

`pnpm run microduck:sim --start` prepares a local checkout of the official MicroDuck browser simulator under `tmp/microduck-simulator`, hydrates Git LFS assets into that ignored checkout, injects the BotLab postMessage control source, and starts the patched simulator host. Keep `pnpm run dev` running separately for the BotLab app.

## Shared MuJoCo web experiment

<!-- shared web simulation from apps/botlab-web/src/app/app.tsx, mujoco-simulator-panel.tsx, workspace-storage.ts, workspace-destinations.ts and tools/mujoco/README.md -->

Run `corepack pnpm run mujoco:prepare` and `corepack pnpm run mujoco:prepare:microduck`, then start the usual web app. In the main editor select **Jumper** for walking (the fixed-body joint test is under **Advanced options**); for **MicroDuck**, select **MuJoCo web** in the simulator selector. Load the robot, then run the example blocks. The same editor filters its palette for the selected destination. Physics, control, inference and rendering execute in the browser. No native service is required for this route.

Jumper's joint probe has a fixed base and disabled contacts. The separate **Jumper · marcha** target uses its verified upstream controller and ONNX after the additional preparation described below. MicroDuck uses its real alpha walking policy on flat ground. Zero velocity maintains balance, while **Detener** pauses physics and cancels execution. Each project keeps separate programs and the latest MuJoCo result for each robot/simulator destination. Reload, project switching and JSON export/import preserve blocks, measured command traces, execution identity and model provenance. Editing invalidates the previous result; editing during execution waits for cancellation before another run. Restored active runs become interrupted, and simulations always reopen disconnected. Data is stored locally in this browser; it is not cloud synchronization. The optional `?lab=mujoco` route remains an in-memory test harness using the same panel.

See [setup and reproducible checks](tools/mujoco/README.md), [measured results and limitations](docs/mujoco-validation.md), and [ADR 0003](docs/adr/0003-shared-browser-mujoco.md). These targets are separate from the existing iframe and native integrations. Heavy libraries/assets are not requested by the default app route. Unit tests include the new simulator and adapter libraries; real-engine tests are explicit commands with prepared assets and Chrome.

<!-- educational walking from libs/blocks/src/lib/microduck-mujoco-blocks.ts, apps/botlab-web/src/app/mujoco-simulator-panel.tsx and libs/simulators/mujoco/src/lib/motion-goal.ts -->

New walking workspaces start with simple blocks: **advance** and **wait** for both robots, plus **turn left** for MicroDuck. One BotLab step means 0.5 m. Movement completes from measured distance/angle, with 2.5 cm/5° tolerances and a settling check, and the panel compares the observed result with the goal. **Advanced** retains timed `marchar` blocks without changing existing projects. Right turns, reverse and Jumper turns are not in the educational palette because they still need reliable physical validation. Import the short [Jumper](examples/jumper-mujoco-first-steps.botlab.json) or [MicroDuck](examples/microduck-mujoco-first-steps.botlab.json) example through **Projects → Import project** to try the new blocks without replacing saved work.

### Actividad: repite, avanza y observa

<!-- repeat activity from examples/jumper-mujoco-repeat.botlab.json, examples/microduck-mujoco-repeat.botlab.json, libs/botlab-model/src/lib/velocity-program.ts and apps/botlab-web/src/app/mujoco-simulator-panel.tsx -->

Importa el ejemplo de [Jumper](examples/jumper-mujoco-repeat.botlab.json) o [MicroDuck](examples/microduck-mujoco-repeat.botlab.json) desde **Proyectos → Importar proyecto**. Se crea un proyecto nuevo. El programa es: **repite 3 veces: avanza 1 paso y espera 1 segundo**.

1. **Predice:** un paso representa 0,5 m. Antes de ejecutar, anota cuántos avances y esperas habrá y cuánto avance sumarán. Para 3 vueltas, el objetivo es 1,5 m.
2. **Ejecuta y observa:** carga el robot y pulsa **Ejecutar programa**. Sigue el bloque resaltado y «Repetición 1 de 3», «2 de 3» y «3 de 3». Compara cada avance y el avance acumulado con sus objetivos.
3. **Ajusta:** cambia el conteo a 2, pulsa **Reiniciar** para comparar desde la misma posición y ejecuta de nuevo. Ahora el objetivo es 1 m. Explica por qué se reduce 0,5 m y desaparece una espera.
4. **Comprueba el límite:** cambia el conteo a 0. No se ejecuta el cuerpo; aparece «Sin acciones que ejecutar». Si la física sigue reproduciéndose, **Detener** la pausa: el conteo cero no cambia ese control. Vuelve a 3 y prueba **Detener** durante una vuelta: las siguientes no deben ejecutarse. Editar durante la ejecución también la cancela; vuelve a pulsar Ejecutar para usar el cambio.

El avance acumulado suma las mediciones de los bloques de avance completados, en la dirección inicial de cada bloque. No es el desplazamiento recto desde el punto de salida: el equilibrio durante las esperas puede producir pequeños movimientos. Para esta actividad, compara la suma con el objetivo con una tolerancia de 2,5 cm por avance (7,5 cm para tres). Si hay caída, cancelación o error, la ejecución está incompleta; reinicia y vuelve a intentarlo, sin contar las vueltas pendientes como realizadas.

Se aceptan conteos enteros de 0 a 100, hasta 16 niveles y 256 pasos expandidos, incluidos puntos de control entre vueltas. Los programas anteriores siguen siendo compatibles. Esta actividad tiene aceptación técnica reproducible; todavía no se ha evaluado con alumnos.

<!-- extended movement examples and checks from tools/mujoco/motion-scenarios.mjs, verify-motion.mjs, verify-performance.mjs and package.json -->

For longer movement, import [Jumper's 190 s walking program](examples/jumper-mujoco-motion.botlab.json) or [MicroDuck's 195 s circuit](examples/microduck-mujoco-motion.botlab.json) through **Projects → Import project**, load the robot and run. Jumper alternates sustained walking, speed changes and stops. MicroDuck exercises forward commands, attempted reverse, turns in both directions and curves. Its current policy produces almost no backward displacement; timed completion does not mean exact velocity tracking. The walking scenes display a world-aligned floor grid so travel remains visible as the camera follows the robot. `test:mujoco:motion` checks three accelerated physical rollouts per robot; `test:mujoco:performance` measures the complete editor with real workers, rendering, recordings and repeated disposal. See the setup link above for their distinct server requirements.

## Native simulator in the app

<!-- native app controls and startup from apps/botlab-web/src/app/native-simulator-panel.tsx, apps/botlab-web/vite.config.ts, package.json and libs/simulators/microduck-native/python/botlab_microduck_native/gateway.py -->

For a separate Mac window, build and open [BotLab Simulator.app](apps/simulator-macos/README.md) with `pnpm run build:simulator-macos`. The Apple Silicon bundle includes its runtime, services and assets; the installed app starts with a double click. Keep the web editor running separately, select **Native MuJoCo**, then **Connect**. External mode exchanges commands and telemetry without streaming video. Closing the scene or quitting the companion stops its services. The current bundle has a local development signature; distribution signing/notarization is pending.

For the embedded development alternative, after the one-time native preparation, run `pnpm run microduck:native` alongside `pnpm run dev`. In the **Simulator** selector choose **Native MuJoCo (experimental)** and **Connect**. The panel renders the real body state with MuJoCo, shows policy/ToF telemetry, and provides run, stop, sit/stand, scene reset and disconnect. The browser iframe remains the default and can be selected again after stopping.

The native scene contains a short physical corridor with walls. In the **Navigation** category, `advance until an obstacle` uses the front distance sensor, while left/right `turn until the path is clear` finds an opening. Connect these blocks below a green flag to build a route without entering metres or degrees. The sensor must provide valid readings; each action has an internal distance, rotation and time limit.

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

Precise movement also offers left and right kick blocks for the native MicroDuck simulator. The connected gateway must advertise each skill. Execution waits for the kick policy to start and for stable standing recovery; the browser iframe simulator does not execute kick blocks.

The native simulator also has an **imported skill** block. Select MicroDuck, use **Add Hugging Face model** in the program toolbar, and save a public model URL, skill name and duration. The block's dropdown lists that project's models. On native connection BotLab imports the models used in the connected program before enabling Run; unused models stay in the project without loading into the simulator. Model definitions persist locally with the project and in exported workspace JSON. The gateway resolves the revision to a commit and records the ONNX SHA-256 for each simulator session. Execution checks observed policy start, standing recovery and falls. A previously tried Polite Bow candidate ended fallen and is not a validated movement.

BotLab's official-simulator connection uses calibrated Feet commands: -0.4 for reverse and 2 for angular motion, with a minimum angular input of 1.5 near turn completion. The bundled walking policy can stall at the upstream reverse/angular inputs; in the reproduced right-turn case it stopped making progress at about 15° of a requested 90°. These are policy inputs, not guaranteed physical speeds. Turns hold zero motion after reaching the requested angle, wait for the body to settle, and correct residual error before proceeding. Measured arrival and stall detection still govern execution. Regenerate an existing host with `pnpm run microduck:sim --no-install --no-lfs-hydrate` to apply the correction; a separately built remote preview also needs rebuilding.

<!-- importable movement example from examples/microduck-movement.botlab.json -->

Import `examples/microduck-movement.botlab.json` with Projects → Import project to try two steps forward, a left turn, two more steps, a one-second wait, a half turn, and one step backward. Importing does not execute the program.

The setup tool expands the ignored official checkout's arena to 12 x 12 meters so the sample 5-meter walk has room. Existing checkouts need `pnpm run microduck:sim --no-install --no-lfs-hydrate` to refresh the generated bridge and arena patch. No official assets are added to Git.

## Workspace Persistence

<!-- workbench layout from apps/botlab-web/src/app/workbench-layout.tsx, apps/botlab-web/src/styles.css, and libs/blocks/src/lib/blocks.tsx -->

The main workbench shows the block editor and simulator side by side from 1024 px upwards. Smaller screens use keyboard-accessible Program and Simulator tabs. Switching views keeps both surfaces mounted; inactive mobile views are offscreen and inert, rather than unloading the simulator. Diagnostic panels and simulator details are collapsed by default, while execution progress and errors remain visible. Narrow editors (up to 600 px) use an overlay block palette; the palette button and category list reopen it. Scratch resizes with its container without replacing the workspace. New workbench labels are available in Catalan, Spanish, and English.

<!-- block localization from libs/blocks/src/lib/block-messages.ts and libs/blocks/src/lib/scratch-blocks-local-bridge.ts -->

Blocks follow the selected UI locale (Catalan by default), including the palette, standard Scratch messages, MicroDuck dropdown labels and tooltips. Language changes preserve the program's executable identifiers and values and do not restart simulation. Versioned display-only catalogs and local translation overlays provide the extension point for external integrations; see `libs/blocks/README.md`. Repository/policy importing and automatic translation are not implemented by this catalog layer.

<!-- scene reset lifecycle from apps/botlab-web/src/app/app.tsx and apps/botlab-web/src/app/simulator-execution-machine.ts -->

The simulator toolbar's Reset scene action replaces only the simulator iframe, returning the robot and scene to their initial state. It cancels launch preparation, stops and disposes the previous command transport, and removes the pending program before reloading. Blocks and the last execution trace are preserved; an active trace is marked stopped. Reset does not compile or run anything. Run is disabled during the reload and must be pressed explicitly afterwards. This currently reloads the simulator runtime rather than resetting physics in place.

<!-- workspace document schema and storage behavior from apps/botlab-web/src/app/workspace-storage.ts, mujoco-execution-storage.ts, workspace-destinations.ts and huggingface-models.ts -->

BotLab automatically saves Scratch XML per destination, robot and simulator selection, the selected UI language, Hugging Face model definitions, and the last simulator execution trace. Named projects and the last active project ID are saved in this browser's local storage (`botlab.projects.v1`); `botlab.workspace.v1` also holds a snapshot of the current workspace. The versioned JSON document is limited to 2 MiB and retains up to 64 iframe execution events with their original control-frame plan, or up to 256 MuJoCo command measurements per destination. Reloading restores the workspace but not compiled approval, a connection, or running execution; a previously active trace is marked interrupted. Invalid documents and failed writes do not overwrite the last stored copy.

The Projects dialog imports and exports versioned workspace JSON, including older `botlab-workspace.json` files. Exports use the project name with a `.botlab.json` suffix. Importing creates and opens a new project, preserves existing projects and disconnects the previous simulator. Storage is local to the browser and exact site origin, not synchronized between devices; use export/import when moving devices or changing a temporary tunnel URL. These controls do not recover work lost before autosave was introduced.

### Workspace acceptance

<!-- browser workspace acceptance from tools/microduck/verify-workspace.mjs and package.json#scripts -->

With the local editor (`pnpm run dev`) and prepared official simulator (`pnpm run microduck:sim --no-install --no-lfs-hydrate --start`) running, run `pnpm run test:workspace`. The check requires Chrome and Playwright; set `BOTLAB_PLAYWRIGHT_MODULE` to an installed Playwright module path when it is not available by name. `BOTLAB_QA_URL` defaults to `http://127.0.0.1:4200/` and must be local. The simulator must allow that exact app origin. `BOTLAB_SIMULATOR_CHECKOUT` selects the prepared checkout used to record the upstream revision.

The check uses an isolated browser context, imports a connected advance/turn/wait fixture, edits a numeric field through the real Scratch UI, and verifies autosave, export and reload. It checks measured motion, block highlighting, matching saved traces, acknowledged stop, editing and rerunning, cancellation when editing during execution, and reload without resuming. JSON evidence, the exported program and screenshots go to `tmp/workspace-qa` (override with `BOTLAB_QA_OUTPUT`). It observes the real iframe engine without replacing its transport or physics. This is a separate acceptance command; the standard CI verification does not require simulator assets or Chrome.

<!-- source invalidation from apps/botlab-web/src/app/app.tsx and apps/botlab-web/src/app/simulator-execution-machine.ts -->

For the iframe, editing the program or changing its target clears the current execution result while preserving the last run in history. MuJoCo instead invalidates its saved result when its source content changes; switching destinations preserves each unchanged program's result. An edit during execution requests a stop and waits for acknowledgement before enabling another run; missing acknowledgement retains the stop-failure fallback. The new program remains unexecuted until Run is pressed.

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

Nx enforces the library boundaries in ADR 0001. Model/runtime cannot depend on editor/UI packages; simulator core cannot depend on a robot simulator; the app uses public package APIs and cannot import Scratch Blocks directly. Thirteen positive/negative import probes guard the architecture rules themselves. Global TypeScript/lint configuration and the setup bridge loader participate in Nx cache inputs.

<!-- default target from apps/botlab-web/src/app/botlab-flow-machine.ts -->

New projects select StackChan by default. App startup reopens the last active local project and restores its target. The StackChan DANCE Bluetooth panel executes bounded horizontal-head and side-LED blocks. The generic runtime target remains planned; this physical route uses its own cancellable execution actor. Select MicroDuck Simulator explicitly to run the existing simulator workspace.

<!-- header target and simulator controls from apps/botlab-web/src/app/app.tsx -->

The header keeps the active project name visible and selects StackChan, MicroDuck or Jumper. MicroDuck offers browser iframe, native and MuJoCo web simulators; Jumper shows one MuJoCo web simulator with walking as its normal mode. Advanced options expose the fixed-body joint test with its limitations. The program breadcrumb identifies the robot and mode within the same project. StackChan has no simulator selector. Changing destination disconnects the old simulator and restores that destination's editor document. Selectors are disabled during execution or simulator preparation.

<!-- robot block availability from apps/botlab-web/src/app/robot-block-palette.ts and app.tsx -->

The palette follows the selected target's implemented execution route and capabilities. MicroDuck iframe/native motion/posture/sensor and LED blocks appear only when their capabilities are available. MuJoCo walking offers the green flag, measured advance, wait and finite repeat, plus MicroDuck’s validated left turn and timed velocity in Advanced. Joint probing retains its separate position block. Postures and sensors are not translated into walking commands. StackChan offers start/wait/repeat, bounded absolute horizontal yaw/center, and side LED color/brightness/off blocks. Motion requires an explicit starting-pose check. Existing incompatible blocks are disabled with a block warning and remain editable. Program execution is blocked for the selected robot or simulator until incompatibilities are resolved. Selecting a compatible target clears the derived disable without deleting blocks or overwriting independent user disables.

<!-- local project management from apps/botlab-web/src/app/project-storage.ts, project-manager.tsx, workbench-copy.ts and app.tsx -->

The Projects button opens a native modal dialog to create, open, rename, duplicate, export, import and delete local projects (up to 50). Blank projects keep the current robot and simulator; imports create a new project without replacing existing work. Deletion requires confirmation inside the dialog and retains at least one project. Failed writes leave the project list and active document unchanged. Keyboard focus stays in the dialog, Escape closes it and returns focus to the opener, and the layout adapts to narrow screens. Labels are localized in Catalan, Spanish and English. Each project owns its robot/simulator selection and separate editor documents per destination. Legacy documents migrate on first destination change without replacing their blocks. The latest MuJoCo result includes source content, compiled program identity, model provenance and up to 256 measured command results with unique command IDs and iteration paths. JSON export/import carries the complete destination map within the existing 2 MiB document limit. Startup reopens the last active project without starting execution or connecting a device; saved active runs are marked interrupted. Projects are browser-local and scoped to the site origin. Export a JSON file to keep a separate copy. Switching projects is disabled during execution/preparation; failed storage writes prevent switching.

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
