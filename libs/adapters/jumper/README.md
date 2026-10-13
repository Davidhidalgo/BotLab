# @botlab/adapters-jumper

Jumper's simulated target/capability metadata and compiled programs. No MuJoCo, ONNX or renderer dependency belongs here.

<!-- adapter API from src/index.ts and src/lib/jumper.ts -->

`createJumperAdapter(joints)` advertises `jumper-web-joint-probe` only after loading its named joints. `compileJumperJointProgram(steps, limits)` validates finite radian positions, limits, command count and source IDs. `jumperJointBehavior` describes manual execution with exclusive ownership. The application binds a dispatcher to the shared simulation session; completion requires measured joint error and settling.

`createJumperWalkingAdapter(hasProximity = false)`, `compileJumperWalkingProgram()` and `jumperWalkingBehavior` expose the distinct `jumper-web-walking` target. It compiles measured forward distance (0–20 m), waits (0–30 s), measured left/right quarter turns (exactly ±π/2 at 1 rad/s, 45 s deadline), and existing timed forward commands (0–0.24 m/s, zero yaw, 0.02–30 s). It also compiles finite repeats (literal counts 0–100, 16 levels, 256 expanded actions including iteration checkpoints), preserving source IDs and iteration paths while giving each command a unique ID. All source actions, even inside zero repeats, are checked before expansion. Other measured angles and combined timed turns are rejected before dispatch; goal completion belongs to the physics worker.

<!-- commands from project.json and vitest.config.mts -->

Build with `pnpm nx build jumper`; test with `pnpm nx test jumper`. See [the MuJoCo experiment](../../../tools/mujoco/README.md).

The walking adapter supplies the validated goal speed and simulated timeout in compiled command inputs; the app dispatcher only transports them to the shared worker.

The walking adapter optionally advertises the shared proximity command when the loaded scene has a sensor. Its compiler preserves bounded `until`/`if` control-flow instructions with fresh condition evaluation at runtime. Source branches are all validated; movement units/speed/control stay robot-specific.

The walking capability also compiles compound `condition` commands, including numeric comparisons without a sensor. Evaluation semantics and expression validation are shared with MicroDuck.

Jumper rejects MicroDuck head-yaw steps; sharing program types does not inherit robot-specific capabilities.

Jumper rejects MicroDuck sit/stand actions. Its body-height modes require their own controller contract and validation.

Jumper compilation rejects posture predicates until its own posture observer is implemented.

The adapter also compiles numeric expressions/variables, measured rest and the fixed `jump` skill. MicroDuck-specific skills remain rejected. The worker must observe flight and landing before the jump command completes.

Body-pitch compilation accepts only −0.1 and 0 rad. MicroDuck rejects the action; no forward-tilt capability is claimed.

<!-- fixed Jumper skills from libs/blocks/src/lib/microduck-mujoco-blocks.ts and libs/adapters/jumper/src/lib/jumper.ts -->

Jumper has separate gesture and dance dropdowns with four official choices each and approximate clip durations. Imported blocks remain incompatible with MicroDuck. Execution requires a level body and confirms measured rest before continuing; interrupted skills require explicit reset. Arbitrary uploaded policies remain unsupported.

<!-- claw actions from libs/botlab-model/src/lib/gripper.ts and libs/blocks/src/lib/microduck-mujoco-blocks.ts -->

Jumper exposes `gripper` with `prepare-left`, `prepare-right`, `open`, `close` and `stow`. The editor keeps posture changes explicit; MicroDuck rejects this block. Walking requires stowed, stow requires open, and results include action, side, position, maximum observed joint error and measured rest. This does not claim object grasping.
