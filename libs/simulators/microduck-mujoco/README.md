# @botlab/simulators-microduck-mujoco

MicroDuck alpha walking on the shared MuJoCo browser backend. This is a separate target from both the upstream iframe and native gateway.

<!-- public API from src/index.ts and src/lib/simulators-microduck-mujoco.ts -->

`createMicroduckMujocoSession()` supplies a MicroDuck worker entry to the common session client. `loadMicroduckMujocoManifest()` verifies a pinned manifest. The generic engine owns physics/session/render lifecycle; this package owns the 61D observation, 14D action mapping, previous actions, velocity limits and fall envelope.

<!-- observation and inference contracts from src/lib/observations.ts and src/lib/controller.ts -->

The policy runs at 50 Hz with four 5 ms MuJoCo steps per inference. Observations are gyro, body-frame gravity, joint positions relative to the float32 home pose, joint velocities, previous actions and 13 command slots. Action scale is 1; targets pass through the model's position actuators and force limits. ONNX Runtime Web uses one WASM thread. Zero velocity retains balance; unsupported posture, recovery, sensors and hardware are not advertised.

<!-- build/test commands from project.json and vitest.config.mts -->

`pnpm nx build simulators-microduck-mujoco` and `pnpm nx test simulators-microduck-mujoco` validate the library. See [preparation and engine acceptance](../../../tools/mujoco/README.md) and [measured limits](../../../docs/mujoco-validation.md).
