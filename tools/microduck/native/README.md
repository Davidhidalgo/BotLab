# Experimental native MicroDuck probe

<!-- reference integration availability from apps/botlab-web/src/app/simulation-destinations.ts and apps/botlab-web/vite.config.ts -->

The default editor uses MuJoCo web exclusively for Jumper and MicroDuck. This legacy/native integration is retained for internal comparisons and regression checks. UI instructions in this document require a separate development server started with `BOTLAB_REFERENCE_SIMULATORS=1`; imported projects cannot enable it. Native services and command-line tools remain available independently.

An isolated macOS arm64 experiment, not a replacement for BotLab's supported browser simulator. It executes the official robot services against the published MuJoCo body server. Results and limitations are in the [evaluation](../../../docs/microduck-simulator-evaluation.md).

## Setup and checks

<!-- native probe entry points and dependencies from prepare.py, requirements.txt, angles.py, reactive.py, lifecycle.py, viewer.py, client.py, serve.py and try-huggingface-skill.py, verify-app.mjs, verify-video.mjs and ../../../package.json -->

Requires `uv`, Python 3, Node 22.22 (or a compatible TypeScript-stripping runtime), `curl`, `tar` and Xcode command-line tools. From the repository root:

```sh
python3 tools/microduck/native/prepare.py
pnpm run test:simulator-native
tmp/microduck-native/venv/bin/python tools/microduck/native/angles.py
tmp/microduck-native/venv/bin/python tools/microduck/native/reactive.py
tmp/microduck-native/venv/bin/python tools/microduck/native/lifecycle.py
tmp/microduck-native/venv/bin/python tools/microduck/native/viewer.py
```

For the app, run `pnpm run microduck:native` and `pnpm run dev`, then select native MuJoCo and connect. Run `pnpm run test:simulator-native-app` separately for browser acceptance, and `pnpm run test:simulator-native-video` for received/painted fps and policy-rate checks (requires Chrome/Playwright). Stop the gateway before the standalone checks below.

Run checks sequentially: they share port 17831 and measurement depends on keeping real time. The preparer downloads official source revisions, a local Rust toolchain, Python and the locked execution-only dependencies. It builds `robotd`, `robotctl` and `tofd`, verifies policy checksums, and writes `tmp/microduck-native/setup.json`. It changes no shell profile or system installation. The measured cache/build footprint was about 2.2 GB; the first Rust build took 37 seconds, excluding downloads and toolchain installation. A warm preparation is not a cold-install benchmark.

<!-- source, policy and toolchain pins from prepare.py and policy-sha256.json -->

- Robot services: `e9cca6272f633dd9054dd0e021f356fe086e5be1`.
- Body server (`sim-body-server` branch): `363b7effd4eae9f24dd1bb8bf647aef4d74edca9`.
- Policies: `916c1e1ee11f8460506532e037a4cf1aa110aca6`.
- Rust 1.98.1, Python 3.12.12, MuJoCo 3.10.0, ONNX Runtime 1.24.4.

## What the checks establish

<!-- experimental ownership, lifecycle and assertions from ../../../libs/simulators/microduck-native/python/botlab_microduck_native/session.py, probe.py, angles.py, reactive.py, lifecycle.py, scene.py and proximity-worker.ts -->

The reusable service/session implementation now belongs to [`@botlab/simulators-microduck-native`](../../../libs/simulators/microduck-native/README.md). `probe.py` is a compatibility import for the existing experiments. Preparation, scenarios and evidence collection remain here.

Each run owns its processes, uses temporary Unix sockets, retains timestamped JSON traces/logs under `tmp/microduck-native/runs/`, sends stop and terminates its services on exit. It refuses an occupied body port. No physical transport is opened. The viewer lasts 30 seconds; other runs are bounded. The helper supports the local `uv` Python library path needed by `mjpython`.

- `angles.py`: 0.25 m plus signed 90°, 180°, 15° and 360° turns. It uses robot odometry for decisions and physics ground truth for comparison. The prototype controller still measures, settles and corrects. Exit checks use a 3 cm distance budget and 10° turn budget, including the three-second post-command observation; this is not a guaranteed 5° controller or a cross-backend performance benchmark.
- `client.py` / `client-worker.mjs`: the built TypeScript library talks to real `robotd` over a Unix socket and checks subscriptions, telemetry, health and stop.
- `reactive.py`: a generated wall scene supplies actual ray-cast ToF frames. The TypeScript helper in `@botlab/adapters-microduck` triggers native stop twice, with hold and reverse/rearm between approaches. The worker is experimental CLI plumbing, not the future browser transport.
- `lifecycle.py`: explicit stop, command-socket loss, sit/stand, and a separate cancelled subscription that crosses the near threshold without triggering. Applied command values below 0.001 are measured separately from physical drift; acknowledgement alone is not physical completion.
- `viewer.py`: starts `mjpython`, checks control rate and upright state. Window rendering still requires human/visual acceptance; this probe cannot assert pixel correctness.

The pinned body branch lacks the launcher's newer camera arguments. `mediad` is Linux-only. The app now embeds a MuJoCo render of body truth through a separate renderer process and bounded MJPEG stream via the native library gateway. The isolated Python requirements include Pillow for JPEG encoding. Camera/WebRTC, person detection and physical-device parity remain unverified. Upstream source/assets remain in the ignored cache; none are redistributed here.

## Try a Hugging Face skill yourself

<!-- simulator-only Hugging Face trial arguments, download pinning and results from try-huggingface-skill.py -->

The BotLab application now offers this trial directly: select MicroDuck, add a Hugging Face model URL beside the project controls, select its name in the **execute imported skill** block, and connect **MuJoCo native**. The app imports it when the connected program uses it. The CLI below is useful for an isolated trial with explicit revision and file arguments.

After `prepare.py`, choose a public episodic MicroDuck ONNX skill trained for the daemon's zero-command skill input, plus its documented run duration. For example, to register the [Polite Bow model](https://huggingface.co/fffiloni/microduck-polite-bow-b1d864) without moving the simulated robot:

```sh
tmp/microduck-native/venv/bin/python tools/microduck/native/try-huggingface-skill.py \
  --repo fffiloni/microduck-polite-bow-b1d864 \
  --name polite-bow --duration 4
```

Add `--execute` to run it in MuJoCo. This particular model **registered and ran but ended fallen** in the 2026-09-22 probe; see [the recorded result](../../../docs/community-skills-evaluation.md). For another model, replace `--repo`, `--name`, `--duration`, and optionally `--revision` / `--file`. A branch name is resolved to a commit before download; the report records that commit and SHA-256. The trial creates a fresh simulated session, reports whether the policy visibly started and recovered to stable standing, and writes `huggingface-trial.json` with full logs under `tmp/microduck-native/runs/`. It never connects to physical hardware or changes the pinned official policy set. Stop the BotLab simulator companion before running it because the two sessions share the local body port.

## Mac companion

<!-- native companion build command from ../../../package.json and external acceptance from verify-app.mjs -->

After preparation, `pnpm run build:simulator-macos` creates the standalone Apple Silicon application. See [its build and usage guide](../../../apps/simulator-macos/README.md). The development equivalent is `pnpm run microduck:native --presentation external`. Close either mode before running standalone native probes because they share the body port.

With the companion and editor running, `BOTLAB_NATIVE_PRESENTATION=external pnpm run test:simulator-native-app` verifies the external window integration and zero video requests. The existing embedded-app and video checks retain their default behavior.

## Posture block acceptance

<!-- posture acceptance command from ../../../package.json and verify-posture.mjs -->

Run `pnpm run test:simulator-native-posture` with the updated gateway and editor. It checks repeated explicit postures, posture/walk sequencing, final physical sitting and cancellation during rising. Set `BOTLAB_QA_URL` for a compiled preview and add its exact `--origin` to the gateway. Use this to avoid development hot reload during long physics checks. Results are written to `tmp/native-posture-qa/`.

<!-- posture acceptance from verify-posture.mjs -->

`test:simulator-native-posture` imports a temporary program into an isolated browser, exercises true/false and nested posture branches with real movement, asserts the retained decision trace, verifies a localized error at a repeated Sit block, and cancels rising before the following walk. Use `BOTLAB_QA_URL` to select a compiled preview and avoid development HMR invalidating an active program. It does not overwrite the user's browser workspace.
