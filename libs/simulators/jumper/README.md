# @botlab/simulators-jumper

Pinned Jumper scene resolution and robot-specific controller integration for the shared browser backend.

<!-- exports from src/index.ts and manifests from tools/mujoco/prepare.py and prepare-jumper-walking.py -->

`loadJumperJointManifest()` resolves the contact-free fixed-base scene. `loadJumperWalkingManifest()` and `createJumperWalkingSession()` load the official exported collision model, verified Rust/WASM controller and locomotion ONNX bundle. The walking controller owns wire order, raw input mapping, dynamic gains and the bundle's 200 Hz control / 1 kHz physics cadence. The first walking target exposes only forward 0–0.24 m/s and zero yaw.

The controller's JS/WASM are executable, SHA-pinned resources. Arbitrary uploaded bundles are not supported. The packaged model, code, meshes and generated weights have separate provenance; no source binary is committed. Preparation and measured scope: [MuJoCo tools](../../../tools/mujoco/README.md).

<!-- targets from project.json and vitest.config.mts -->

Build with `pnpm nx build simulators-jumper`; run manifest rejection tests with `pnpm nx test simulators-jumper`. Numerical policy/controller and walking gates run separately in real Chrome and native MuJoCo.
