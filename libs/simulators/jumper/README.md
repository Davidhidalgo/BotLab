# @botlab/simulators-jumper

Pinned Jumper scene resolution and robot-specific controller integration for the shared browser backend.

<!-- exports from src/index.ts and manifests from tools/mujoco/prepare.py and prepare-jumper-walking.py -->

`loadJumperJointManifest()` resolves the contact-free fixed-base scene. `loadJumperWalkingManifest()` and `createJumperWalkingSession()` load the official exported collision model, verified Rust/WASM controller and locomotion ONNX bundle. The walking controller owns wire order, raw input mapping, dynamic gains and the bundle's 200 Hz control / 1 kHz physics cadence. The walking target exposes forward 0–0.24 m/s and measured ±90° turns. In-place turn intent is ±1 rad/s through Rx = ∓0.625: the pinned outer stick band produces yaw while the upstream controller also sets its posture twist. Other turn speeds and mixed forward/yaw are rejected. The shared goal tracker keeps constant turn speed, starts braking within 0.5°, and still requires a final result within 5° for 0.8 s. These settings are specific to Jumper; MicroDuck retains its existing approach profile.

The controller's JS/WASM are executable, SHA-pinned resources. Arbitrary uploaded bundles are not supported. The packaged model, code, meshes and generated weights have separate provenance; no source binary is committed. Preparation and measured scope: [MuJoCo tools](../../../tools/mujoco/README.md).

<!-- targets from project.json and vitest.config.mts -->

Build with `pnpm nx build simulators-jumper`; run manifest rejection tests with `pnpm nx test simulators-jumper`. Numerical policy/controller and walking gates run separately in real Chrome and native MuJoCo.
