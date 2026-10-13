# @botlab/adapters-microduck

<!-- reference integration availability from apps/botlab-web/src/app/simulation-destinations.ts and apps/botlab-web/vite.config.ts -->

The default editor uses MuJoCo web exclusively for Jumper and MicroDuck. This legacy/native integration is retained for internal comparisons and regression checks. UI instructions in this document require a separate development server started with `BOTLAB_REFERENCE_SIMULATORS=1`; imported projects cannot enable it. Native services and command-line tools remain available independently.

MicroDuck target metadata and robot-specific capability helpers. The product uses MuJoCo web; legacy browser and native references remain internal; physical hardware connection remains separate work.

## Public API

<!-- exported adapter APIs from src/index.ts -->

- `createMicroDuckAdapter()` returns the current target/capability metadata, including hardware placeholders.
- `createMicroDuckProximityTrigger(options)` creates a per-execution native ToF threshold subscription. `update(frame)` returns `entered`, `armed` and an optional distance in metres; `cancel()` permanently disables that instance.
- `MicroDuckDepthFrame` describes the native 8×8 millimetre/status payload; `MicroDuckProximityOptions` requires positive entry/exit distances in metres, with exit greater than entry, and an optional positive integer confirmation-frame count (default three).

<!-- proximity and cancellation semantics from src/lib/microduck-proximity.ts -->

The trigger uses the central 2×2 rays, requires at least three valid measurements, and accepts ST statuses 5 and 9. It fires once after consecutive near frames and rearms beyond the exit distance. Duplicate/out-of-order sequence numbers are ignored; dropped frames or invalid geometry/ranges reset pending confirmation. Create a new instance for each execution or restarted sensor stream. This is proximity to measured geometry, not person detection. It does not dispatch commands or expose a new editor block by itself.

## Verification

<!-- test commands from vite.config.ts and root package.json -->

Run `pnpm nx test microduck` or the workspace-wide `pnpm run test:all`. The eight tests cover confirmation, hysteresis, repeated/out-of-order frames, gaps, invalid sensor readings, cancellation and configuration. The [native experiment](../../../tools/microduck/native/README.md) also runs this exact TypeScript helper against frames from the real `tofd --sim` service.

## Native posture and compilation

<!-- exported APIs from src/lib/microduck-program.ts and src/lib/microduck-capabilities.ts -->

`compileMicroDuckProgram(artifact, program, targetId)` lowers typed model steps to BotLab commands while preserving source IDs. It owns MicroDuck command IDs, units and the final zero-motion wait. XML parsing is provided by the blocks library. Posture steps lower to `microduck-posture` / `set-posture` with an explicit `posture` input. Conditional steps lower to `microduck-control` / `if-posture`, retaining the typed condition and recursively compiled `then` / `else` command arrays. Branch paths give nested commands unique IDs; only the outer program receives a final zero-motion wait. Native and iframe execution validate all branches. The iframe lowers branches to forward-only indexed frames; generic runtime control flow remains separate work.

`walk-until-obstacle` and `turn-until-clear` lower to native `navigate-by-depth` commands. The adapter rejects them for the browser simulator before dispatch.

`nativeMicroDuckCapabilities(discovery, targetId)` maps the connected gateway's executable posture and kick discovery to model `Capability` contracts bound to that target. Unavailable skills produce no matching capability. `kick_left` and `kick_right` lower to `microduck-native-skills` / `run-skill`; loaded rolls remain informational. Generic runtime target registration and broader capability discovery remain subsequent work.

<!-- repeat lowering from src/lib/microduck-program.ts -->

`compileMicroDuckProgram` validates repeat counts and control depth before expanding finite repeats. The 256-command budget includes every branch, iteration checkpoint and the final stop. Each iteration starts with a zero-duration wait checkpoint, so even empty bodies remain observable and cancellable. Commands carry `iterations` from outermost to innermost, with the repeat source ID, current iteration and count. Conditions remain runtime decisions on every iteration; no posture is corrected automatically. Both simulator transports consume this same compiled program.

## Shared MuJoCo web walking

<!-- walking adapter API from src/lib/web-walking.ts and src/index.ts -->

`createMicroduckWalkingAdapter(hasProximity = false)` advertises the separate `microduck-mujoco-web` target after model/controller loading. `compileMicroduckWalkingProgram()` compiles measured distance goals (0–20 m), left-turn goals (0–2π rad), waits (0–30 s), or legacy bounded SI velocity commands, retaining source IDs. Finite repeats use counts 0–100, 16 levels and a limit of 256 expanded actions including iteration checkpoints. Entire source bodies are checked even for zero repetitions; commands receive unique IDs and complete iteration paths. Measured right turns are rejected because the current policy can stall from rest. `microduckWalkingBehavior` describes its manual/exclusive execution. The simulator owns physics and ONNX; this adapter imports neither. See [the shared engine experiment](../../../tools/mujoco/README.md).

The walking adapter supplies the validated goal speed and simulated timeout in compiled command inputs; the app dispatcher only transports them to the shared worker.

The walking adapter optionally advertises the shared proximity command when the loaded scene has a sensor. Its compiler preserves bounded `until`/`if` control-flow instructions with fresh condition evaluation at runtime. Source branches are all validated; movement units/speed/control stay robot-specific.

The optional proximity capability also compiles compound `condition` commands. Evaluation semantics and expression validation are shared with Jumper.

MuJoCo head actions are left/centre/right at +0.3/0/−0.3 rad, with measured arrival. No arbitrary angle or neck inclination is advertised.

The web walking adapter accepts explicit sit/stand actions using the pinned posture policy. It preserves source IDs and posture results; locomotion while sitting is rejected by the loaded controller.
