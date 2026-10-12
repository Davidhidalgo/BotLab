# @botlab/adapters-jumper

Jumper's simulated target/capability metadata and compiled programs. No MuJoCo, ONNX or renderer dependency belongs here.

<!-- adapter API from src/index.ts and src/lib/jumper.ts -->

`createJumperAdapter(joints)` advertises `jumper-web-joint-probe` only after loading its named joints. `compileJumperJointProgram(steps, limits)` validates finite radian positions, limits, command count and source IDs. `jumperJointBehavior` describes manual execution with exclusive ownership. The application binds a dispatcher to the shared simulation session; completion requires measured joint error and settling.

`createJumperWalkingAdapter()`, `compileJumperWalkingProgram()` and `jumperWalkingBehavior` expose the distinct `jumper-web-walking` target. It compiles measured forward distance (0–20 m), waits (0–30 s), measured left/right quarter turns (exactly ±π/2 at 1 rad/s, 45 s deadline), and existing timed forward commands (0–0.24 m/s, zero yaw, 0.02–30 s). It also compiles finite repeats (literal counts 0–100, 16 levels, 256 expanded actions including iteration checkpoints), preserving source IDs and iteration paths while giving each command a unique ID. All source actions, even inside zero repeats, are checked before expansion. Other measured angles and combined timed turns are rejected before dispatch; goal completion belongs to the physics worker.

<!-- commands from project.json and vitest.config.mts -->

Build with `pnpm nx build jumper`; test with `pnpm nx test jumper`. See [the MuJoCo experiment](../../../tools/mujoco/README.md).

The walking adapter supplies the validated goal speed and simulated timeout in compiled command inputs; the app dispatcher only transports them to the shared worker.
