# @botlab/simulators-jumper

Pinned Jumper scene resolution and robot-specific controller integration for the shared browser backend.

<!-- exports from src/index.ts and manifests from tools/mujoco/prepare.py and prepare-jumper-walking.py -->

`loadJumperJointManifest()` resolves the contact-free fixed-base scene. `loadJumperWalkingManifest(signal?, scene = 'flat')` and `createJumperWalkingSession()` load the official exported collision model, verified Rust/WASM controller and locomotion ONNX bundle. The walking controller owns wire order, raw input mapping, dynamic gains and the bundle's 200 Hz control / 1 kHz physics cadence. The walking target exposes forward 0–0.24 m/s and measured ±90° turns. In-place turn intent is ±1 rad/s through Rx = ∓0.625: the pinned outer stick band produces yaw while the upstream controller also sets its posture twist. Other turn speeds and mixed forward/yaw are rejected. The shared goal tracker keeps constant turn speed, starts braking within 0.5°, and still requires a final result within 5° for 0.8 s. These settings are specific to Jumper; MicroDuck retains its existing approach profile.

The controller's JS/WASM are executable, SHA-pinned resources. Arbitrary uploaded bundles are not supported. The packaged model, code, meshes and generated weights have separate provenance; no source binary is committed. Preparation and measured scope: [MuJoCo tools](../../../tools/mujoco/README.md).

<!-- targets from project.json and vitest.config.mts -->

Build with `pnpm nx build simulators-jumper`; run manifest rejection tests with `pnpm nx test simulators-jumper`. Numerical policy/controller and walking gates run separately in real Chrome and native MuJoCo.

<!-- Jumper geometric proximity profile from tools/mujoco/prepare-jumper-depth.py and src/lib/simulators-jumper.ts -->

`scene: 'obstacles'` selects a separately pinned manifest while leaving the flat-ground digest unchanged. The geometric preview uses the upstream ToF camera mounting (4 mm eye offset), pinhole FOV derived from its sensor size/focal configuration (about 55° × 42°), 0.05–8.8 m radial range and 15 simulated Hz. The 54×42 reference is reduced by six along each axis to 9×7 for this educational web preview; this is not chip emulation and measures from the camera eye without the native optical-centre correction/noise. The original walking policy remains unchanged.

<!-- jump controller and resources from src/lib/walking-controller.ts and tools/mujoco/prepare-jumper-jump.py -->

Separately pinned manifests add the official 167D/20D jump policy and use the same Rust/WASM state machine, reference trajectory and mode gains. A jump has fixed upstream parameters; no user height is advertised. The shared goal checks contact-free flight, height gain, landing contact and settled upright return before continuing. Cancelling an active jump freezes physics and requires explicit reset before further movement; it does not silently recover or finish the jump. Other bundle modes remain probe-only.

The optional body-pitch channel exposes only backward (−0.1 rad) and level (0) through the adapter/worker. Positive targets failed stability calibration and remain probe-only. The target persists across ordinary pause/condition reads and movement; reset clears it. Jump requires explicit level first.
