# Shared browser MuJoCo experiment

The normal editor now selects MuJoCo web directly for both robots. Retired iframe/native projects are archived on opening and remain in JSON exports; unsupported blocks are preserved and cannot execute. Native and archived iframe UI regressions require the separate `BOTLAB_REFERENCE_SIMULATORS=1` development configuration documented in the root README.

Runs physics, learned control, ONNX inference and rendering in the browser. Python is an optional preparation/verification tool, never a runtime service for this route. Models and weights stay in ignored `tmp/`.

## Start

<!-- setup scripts from package.json, prepare.py, prepare-microduck.py and prepare-jumper-walking.py -->

Use the workspace's pnpm version through Corepack:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run mujoco:prepare
corepack pnpm run mujoco:prepare:microduck
corepack pnpm run dev
```

Open `https://botlab.localhost/`. Select Jumper with its single MuJoCo web simulator (walking by default), or MicroDuck with the MuJoCo web simulator. Jumper joint testing is under Advanced options. Manage local projects from the Projects dialog; importing creates a new project. Load the robot and execute the example blocks in the main editor. Jumper joint control uses a fixed base and disables contacts. MicroDuck walking uses its real alpha policy on flat ground. **Detener** pauses physics; the zero-velocity block continues balance control. The main editor saves per-destination programs and measured results inside the local project and its JSON export. Restoring an active run records interruption and never starts a worker. `?lab=mujoco` is a separate in-memory test harness sharing the same panel.

The preparers verify pinned archives/resources and write manifests to `tmp/mujoco-web/`. The dev server serves them at `/simulation-assets/`; a Vite build copies prepared resources to the static output. Preparation needs network access on the first run. After preparation, no upstream or native server is required. Worker/wasm execution needs localhost or HTTPS; single-thread inference does not require COOP/COEP. Missing assets produce a load error instead of a simulated success.

### Jumper walking preparation

The official Jumper exporter imports its training framework to resolve collision/solver configuration. Its preparation environment is larger than the joint probe. This does not train a policy.

```sh
UV_CACHE_DIR=tmp/mujoco-native/uv-cache uv venv --python 3.12.12 tmp/mujoco-native/venv
UV_CACHE_DIR=tmp/mujoco-native/uv-cache uv pip install --python tmp/mujoco-native/venv/bin/python -r tools/mujoco/requirements-jumper-export.txt
UV_CACHE_DIR=tmp/mujoco-native/uv-cache uv pip install --python tmp/mujoco-native/venv/bin/python --no-deps -e tmp/mujoco-audit/jumper-78966f45de6f2b6de3f7cea017f32a39f8b993e6
corepack pnpm run mujoco:prepare:jumper-walking
```

Select **Jumper · marcha**. The exposed capabilities are forward 0–0.24 m/s and measured left/right 90° turns. Timed velocity remains forward-only. Other modes in the upstream bundle are not exposed. The host maps forward velocity to Ly and signed 1 rad/s turns to the verified outer Rx band, feeds wire-order feedback, and applies the controller's targets and gains with the original servo speed/thermal law.

The exporter normally uses a 5 ms timestep; this bundle declares 1 ms physics and 5 ms control. The walking preparer retains exported collision/solver configuration and explicitly applies the bundle's timestep, adds torque motors, floor and gyro. The source XML and upstream code remain unchanged. `GIT_CEILING_DIRECTORIES` prevents an archive checkout from accidentally recording BotLab's Git revision as its own.

## Reproduce measurements

<!-- validation entry points from verify-native.py, verify-browser.mjs, verify-ui.mjs, verify-jumper-policy.py, probe-jumper-locomotion.py and verify-jumper-walking.mjs, verify-workbench.mjs and verify-repeats.mjs -->

For only the native numerical reference, an isolated Python 3.12 environment needs `requirements-native.txt`. The larger exporter environment already includes those versions. All Python validation is headless.

With the app on port 4210 (`corepack pnpm run dev:server --port=4210`) and all three assets prepared:

```sh
tmp/mujoco-native/venv/bin/python tools/mujoco/verify-native.py
tmp/mujoco-native/venv/bin/python tools/mujoco/verify-jumper-policy.py
tmp/mujoco-native/venv/bin/python tools/mujoco/probe-jumper-locomotion.py
corepack pnpm run test:mujoco:web
corepack pnpm run test:mujoco:jumper-walking
corepack pnpm run test:mujoco:ui
corepack pnpm run test:mujoco:editing
corepack pnpm run test:mujoco:workbench
corepack pnpm run test:mujoco:motion
corepack pnpm run test:mujoco:repeats
```

Browser scripts use installed Google Chrome through Playwright in an isolated profile. The main-editor check also accepts `BOTLAB_BROWSER=firefox` or `BOTLAB_BROWSER=webkit` after installing those Playwright browsers (WebKit is not a Safari product validation). For project-local binaries, use `PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright" corepack pnpm exec playwright install firefox webkit`, then set that same variable when running the check. Set `BOTLAB_TEST_URL` to another local app origin. Numerical scripts need Vite's dev module imports; UI checks also work against a static build. `test:mujoco:production` checks all three workers against a Vite preview on port 4211 (or `BOTLAB_TEST_URL`). Reports go to `docs/evidence/mujoco-*.json` and `docs/evidence/jumper-*.json`; screenshots go to `output/mujoco/`. Test-only Jumper reference data goes to `tmp/mujoco-validation/`, outside production assets. The bundled native controller check currently selects the macOS universal binary; other operating systems require selecting their corresponding bundle build and new evidence.

- Jumper joint physics: three deterministic 60 s runs, finite state, native/WASM comparison and a 0.02 rad position tolerance.
- Jumper policy: 24 controller frames and 18 fixed-observation ONNX comparisons; `1e-6` controller and `1e-5 + 1e-4*abs(reference)` inference tolerances.
- Jumper walking: 60 s web run, at least 1 m advance, height above 0.065 m, short native/WASM difference below 0.1 mm, stop drift below 3 cm after settling.
- MicroDuck: 60 s physical rollout, six fixed-observation ONNX comparisons and a 1 s native/WASM position tolerance of 10 µm. The 60 s trajectory difference is reported separately, not asserted as long-horizon parity.
- Main editor: a single MuJoCo simulator with advanced joint testing, project dialog keyboard/mobile layout and create/rename/duplicate/delete confirmation, per-target programs/results, project switching, JSON export/import into a new project, reload after completion and during execution, source-edit cancellation, and zero workers after hydration.
- UI: measured programs, pause/resume, reset, cancellation, ten target switches, one worker per loaded target and none after close; no default-route engine requests or native service requests.
- Extended motion: three 190 s Jumper runs and three 195 s MicroDuck runs, checking every physics substep against the controller's balance envelope, at least 5 cm advance for each positive straight command, and at least 0.1 rad in each requested turn direction. Reports retain physical travel, heading change without wrapping, attempted backward displacement and controller/inference latency. Passing this gate establishes stability, forward motion and turns in the tested flat-ground sequence; backward response is recorded separately, and exact velocity tracking is not asserted. Successful runs regenerate the two importable `examples/*-mujoco-motion.botlab.json` programs.

<!-- sustained editor performance from verify-performance.mjs, motion-scenarios.mjs and package.json -->

After generating the movement examples, build the app and serve its static output on port 4211. The performance check defaults to that production server; it takes roughly eight minutes and records both programs in isolated Chrome profiles:

```sh
corepack pnpm run build
corepack pnpm exec vite preview --config apps/botlab-web/vite.config.ts --port 4211
# In another terminal, with the preview running:
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright" corepack pnpm exec playwright install ffmpeg
PLAYWRIGHT_BROWSERS_PATH="$PWD/tmp/playwright" corepack pnpm run test:mujoco:performance
```

The report records the host/GPU/browser, one cold HTTP-cache load and three warm loads per robot, wall/simulated time, WebGL draw cadence, physics frame cadence, main-renderer heap after garbage collection, and summed RSS of only the isolated Chrome processes. RSS includes shared mappings and is not private memory. macOS/Linux `ps` is required. Recording and periodic heap collection are part of the measured workload. Headless draw cadence does not establish physical display presentation. Predeclared gates are at least 30 draw frames/s, real-time factor 0.95–1.05, all commands completed with physical measurements, minimum travel from the scenario, zero workers after each close, and at most 16 MiB retained main-heap growth across five post-run disposal cycles per robot. RSS is reported separately; this short test cannot establish a universal memory plateau.

Evidence goes to `docs/evidence/mujoco-performance-validation.json`, with named recordings and screenshots under `output/mujoco/`. Both commands use fresh browser data; they do not alter projects in the user's browser. Import the generated examples via **Projects → Import project** to watch them locally. MicroDuck's backward commands are intentional probes of a measured limitation: the current policy barely moves backward.

Unit tests, types, lint, architecture boundaries and builds remain independent of these browser/asset checks. See [results and remaining validations](../../docs/mujoco-validation.md).

### MicroDuck directional investigation

<!-- directional probes from probe-microduck-directions.mjs and probe-microduck-directions.py -->

With prepared assets and the Vite development server running:

```sh
BOTLAB_TEST_URL=https://botlab.localhost node tools/mujoco/probe-microduck-directions.mjs
tmp/mujoco-native/venv/bin/python tools/mujoco/probe-microduck-directions.py
```

The browser probe repeats 20-second left/right/reverse/forward commands three times, from rest and immediately after eight seconds of forward motion. It also checks measured ±90° goals from rest and after a completed 0.5 m advance, and cancels negative commands through the real worker. `probeCompleted` means measurements and cancellation completed safely, not that every requested motion succeeded. Reports retain signed displacement, unwrapped rotation, balance envelope and zero-command settling. The independent Python check uses native MuJoCo/ORT with the same prepared scene and weights; long trajectories are compared qualitatively, not asserted to be identical. Reports are `docs/evidence/microduck-directions-probe.json` and `microduck-directions-native-probe.json`. See [BL-003 results](../../docs/mujoco-validation.md#microduck-directional-investigation--2026-10-13).

## Provenance

<!-- educational checks from verify-educational.mjs, motion-harness.ts, verify-workbench.mjs and package.json -->

`corepack pnpm run test:mujoco:educational` uses the Vite development server (default `http://127.0.0.1:4210`) and prepared robot assets to check measured distance and left-turn goals against real physics. It writes `docs/evidence/mujoco-educational-validation.json`. Distances use projected net progress; turns use unwrapped yaw. This accelerated check is not an interactive FPS measurement. The right-turn limitation is retained in `mujoco-educational-right-turn-probe.json`.

`BOTLAB_TEST_URL=http://127.0.0.1:4211 corepack pnpm run test:mujoco:workbench` checks the compiled editor, first-step examples, goal measurements, persistence, project dialog and cancellation on editing. It generates the two `examples/*-mujoco-first-steps.botlab.json` importable examples. `BOTLAB_BROWSER=firefox` or `webkit` selects another installed test browser.

<!-- pins from prepare.py, prepare-microduck.py, prepare-jumper-walking.py and docs/evidence/mujoco-upstream-audit.json -->

Jumper is fixed at `78966f45de6f2b6de3f7cea017f32a39f8b993e6`, with all 54 bundle files verified. MicroDuck model revision is `363b7effd4eae9f24dd1bb8bf647aef4d74edca9`; policy revision is `916c1e1ee11f8460506532e037a4cf1aa110aca6`. The MicroDuck XML and policy are byte-identical to the existing pinned browser reference. MuJoCo is 3.11.0, ONNX Runtime is 1.27.0 and Three is 0.164.1.

LICENSE/NOTICE files travel with prepared model resources. Generated policy output licensing is recorded separately from repository code licensing; public redistribution remains unreviewed. The build produces local static artifacts, not a publication or deployment. Do not commit upstream meshes, weights, compiled controllers or training dependencies to BotLab.

## Repetition and first learning activity

<!-- repeat acceptance from verify-repeats.mjs, ../../examples/*-mujoco-repeat.botlab.json and ../../package.json -->

`corepack pnpm run test:mujoco:repeats` runs both importable repeat activities in the main editor against real MuJoCo workers and the prepared controllers. It uses the same local server and `BOTLAB_TEST_URL` override as the other browser checks. It verifies three and two measured 0.5 m advances, nested progress, bounded empty bodies, zero-count no-work outcomes, cancellation on the second iteration, source-edit cancellation, the expansion budget, distinct command identities, JSON export/import, reload and legacy first-steps programs. No user browser projects are modified. The latest development report is `docs/evidence/mujoco-repeat-validation.json`; the separate production acceptance is retained in `mujoco-repeat-production-validation.json`, and the final build smoke result in `mujoco-repeat-final-build-validation.json`. Screenshots are `output/mujoco/repeat-*.png`.

Follow [the activity](../../README.md#actividad-repite-avanza-y-observa) to predict, run, compare and change the count. Its technical acceptance does not establish learning outcomes with students.

## Jumper quarter-turn acceptance

<!-- Jumper turn checks from probe-jumper-turns.mjs, probe-jumper-turns.py, verify-jumper-turns.mjs, verify-jumper-turns-ui.mjs and ../../examples/jumper-mujoco-turns.botlab.json -->

With the prepared walking assets and Vite development server available:

```sh
node tools/mujoco/verify-jumper-turns.mjs
node tools/mujoco/verify-jumper-turns-ui.mjs
tmp/mujoco-native/venv/bin/python tools/mujoco/probe-jumper-turns.py
```

The numerical acceptance runs 20 measured quarter turns in same-direction and alternating sequences, two 0.5 m advances and real-worker cancellation in both directions. The UI acceptance imports the turn activity, measures four turns across two repeat iterations, exports and reloads the results, cancels during a turn and checks worker disposal. Both accept `BOTLAB_TEST_URL`; the UI check also runs against a static build with `BOTLAB_PRODUCTION=1`, writing a separate production report.

`probe-jumper-turns.mjs` reproduces the earlier isolated candidates from Git revision `fc890ac6536665c5d1e009496f90ee0e09b6b6d0`. Profiles are default `tapered`, or `BOTLAB_TURN_PROFILE=fixed`, `center`, `pure-yaw`; `BOTLAB_PROBE_RUNS=1` selects a four-case pilot instead of three reset repetitions. Candidates are generated in ignored `tmp/`, never loaded by the app. A failed probe does not enable capabilities. The native reference checks the pinned raw-axis mapping and balance separately; it is not an assertion of long-horizon trajectory parity. [Results and selection](../../docs/mujoco-validation.md#jumper-quarter-turns--2026-10-13).

## ToF prototype

<!-- optional scene, sampling and validation from prepare-microduck.py, tof-harness.ts, verify-tof.mjs and verify-tof-physics.mjs -->

MicroDuck preparation additionally writes `obstacles.xml` and `obstacles-manifest.json`; the existing flat-ground manifest is unchanged. In the editor choose MicroDuck → **Escena → Obstáculos + ToF**, then load. The panel shows an 8×8 geometric map in metres (45° per axis, 4 m range, 15 simulated Hz); it follows the head site and distinguishes no return from zero distance. Pause freezes the reading; reset restores the initial scene. Close before selecting another scene. Projects and JSON exports retain scene selection per robot; changing scenes clears the previous execution result. No worker starts when reopening a project.

Predict what will change, execute one advance and compare the readings. The first wall starts at X=1.52 m; another wall is behind it. The sensor does not steer or stop the robot: repeating advances can cause a collision. There is no optical noise, hardware equivalence or new navigation block in this increment.

```sh
node tools/mujoco/verify-tof.mjs
node tools/mujoco/verify-tof-physics.mjs
```

Both accept `BOTLAB_TEST_URL` and default to `https://botlab.localhost`. The physics comparison requires Vite development mode; the UI check also runs on a static preview. Reports: `docs/evidence/mujoco-tof-web.json` and `docs/evidence/mujoco-tof-physics.json`.
