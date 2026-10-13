# @botlab/simulators-mujoco

Optional shared MuJoCo 3.11.0 backend. This package owns physics and rendering, with robot controllers supplied by separate worker entry points.

## API and ownership

<!-- public API from src/index.ts, src/worker.ts and src/lib/controller.ts -->

`createMujocoSession()` starts one dedicated worker; load a verified `SimulationManifest` before stepping or executing commands. `createSimulationRenderer(container, geometry, { rearView? })` consumes copied geometry/frame data. `validateManifest` rejects unresolved versions, paths, hashes and invalid joint metadata. The separate `@botlab/simulators-mujoco/worker` entry exports `installSimulationWorker(factory?)`; it must only be imported by worker modules. Controllers implement feedback, velocity validation, inference and explicit state commit/reset/disposal. Optional `turnProfile` (`constant` or default `tapered`) and `turnStopFraction` (default 0.45, bounded above zero through 1) tune approach speed and the inner braking band without widening final angle tolerance.

<!-- lifecycle from src/lib/client.ts and src/lib/worker-runtime.ts -->

Sessions carry a UUID and generation. Reset invalidates older requests; pause/stop change the loop epoch so late inference cannot actuate. Abort waits for stop acknowledgement, while timeout/error terminates the worker. `dispose()` is idempotent. Workers own native/WASM allocations; renderers dispose WebGL geometry/materials, listeners, ResizeObserver and animation frame. Call both disposers when leaving a target.

`stop` pauses physics and removes commands. A velocity command with zero forward/yaw continues control and balance. `step` advances one joint physics substep, or one complete controller interval for a learned target. Simulated time drives command deadlines; rendering cannot change timestep or inference decimation. Wall-clock pacing absorbs timer jitter with at most four control intervals per callback and yields after 8 ms of work. Long suspension discards excess backlog; pause/resume starts a fresh wall clock. No unbounded catch-up is performed.

<!-- measured motion execution from src/lib/motion-goal.ts, worker-runtime.ts and client.ts -->

Measured goals run at physics-step cadence inside the worker. They allow 1 s of balance preparation, measure net forward displacement projected onto the initial heading (not accumulated sway), and unwrap yaw through ±π. After stopping, the goal must remain within 2.5 cm or 5° for 0.8 s before completion. A stalled goal, excessive overshoot or simulated timeout fails visibly and pauses physics. The client bounds its wall-clock watchdog for longer distance goals; cancellation/reset/disposal retain the existing ownership contract. Controller limits are checked before starting. This does not guarantee straight-line path tracking or eliminate balance drift.

<!-- walking ground rendering from src/lib/renderer.ts -->

Infinite walking floors follow the visible robot region while a 10 cm world-aligned grid makes travel visible under the following camera. This changes only rendering, not collisions or physical ground coordinates. Grid geometry/materials are released with the renderer.

## Resources and validation

<!-- verification and commands from src/lib/assets.ts, project.json and tools/mujoco/README.md -->

Resources are verified by size/SHA-256 before entering the MuJoCo VFS. Host/browser caching may reuse downloads, but verification runs on each load. The default app does not import the engine. `pnpm nx test simulators-mujoco` runs protocol, asset and servo unit tests; real-engine browser/native checks are documented in [tools/mujoco](../../../tools/mujoco/README.md).

<!-- geometric depth ownership and sampling from src/lib/depth.ts, assets.ts and world.ts -->

Optional geometric depth samples `mj_ray` from a named site's pose, using normalized rays at zone centres. All geometry groups, static geometry and self intersections are included. A separate kinematic `MjData` copies joint/mocap poses so observations never alter the running solver or controller state. Simulated time limits sampling; pause reuses the last sample, reset restarts it, and world disposal frees the scratch data. No optical noise or automatic avoidance is implemented. Real-WASM tests cover distance, occlusion, range/no return, pose, self intersections, cadence and dynamics independence.

<!-- condition sampling from src/lib/worker-runtime.ts, world.ts and depth.ts -->

A proximity command pauses the simulation loop, invalidates pending inference and forces a new geometric sample from the current pose before comparison. It never advances the robot. The normal display uses configured sampling frequency; explicit condition queries refresh even within the same sampling slot. Angular and pinhole zone-centre patterns are supported, with range limits per robot. Subsequent movement resumes through the existing controller lifecycle.

Obstacle activities select a rear camera view so an approaching wall does not hide the robot; OrbitControls still allows manual orbit. This changes presentation only.

An optional controller `setHeadYaw` channel uses observed joint arrival (0.07 rad, joint speed ≤0.05 rad/s for 0.1 s, eight-second timeout). The walking controller stays active; unsupported controllers reject the command. Stop freezes physics and reset clears the controller pose.

Optional controller `setPosture` / `getPosture` methods support explicit, observed sit/stand transitions with a ten-second deadline. Posture requests share the command exclusivity and cancellation path with motion and joints.

Posture observation pauses the worker, validates current feedback and reads the controller state; it never starts a transition or infers sitting solely from low height. The initial stand state comes from the pinned initial keyframe; subsequent transitions require stable physical confirmation.

<!-- rest arrival tracked by src/lib/rest-goal.ts -->

`RestGoal` confirms zero-intent balance with an observed 0.8 s window: ≤1 cm planar drift, ≤0.05 rad heading change and angular speed ≤0.1 rad/s. It times out after 5 s and uses the shared cancellation path.

<!-- bounded optional skills from src/lib/skill-goal.ts and worker-runtime.ts -->

Optional controller skill hooks run under the same exclusive/cancellable command lifecycle. `SkillGoal` requires at least 0.15 rad joint excursion, completion of the policy window, upright return and `RestGoal` confirmation; its total deadline is ten seconds. Results identify the skill and observed duration/excursion, without claiming contact with a ball or pickup of an object.

For the optional jump, `SkillGoal` additionally requires ≥0.04 s with zero MuJoCo contacts and ≥3 cm vertical gain, then contact and upright measured rest. `MujocoWorld.contactCount()` reads the current solver contact count only; it does not modify physics. Zero contacts conservatively proves absence of all contacts, including self contacts.

`BodyPitchGoal` confirms quaternion pitch within 0.025 rad and angular speed ≤0.1 rad/s for 0.4 s, with an eight-second timeout and the shared cancellation path. Its offered targets are backward/level only.
