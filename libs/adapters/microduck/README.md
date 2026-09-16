# @botlab/adapters-microduck

MicroDuck target metadata and robot-specific capability helpers. The application supports browser and native simulators; physical hardware connection remains separate work.

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

`nativeMicroDuckCapabilities(discovery, targetId)` maps the connected gateway's executable posture discovery to model `Capability` contracts bound to that target. Unavailable posture support produces no capability. Loaded kick/roll skills are not exposed as executable blocks yet. Generic runtime target registration and broader capability discovery remain subsequent work.

<!-- repeat lowering from src/lib/microduck-program.ts -->

`compileMicroDuckProgram` validates repeat counts and control depth before expanding finite repeats. The 256-command budget includes every branch, iteration checkpoint and the final stop. Each iteration starts with a zero-duration wait checkpoint, so even empty bodies remain observable and cancellable. Commands carry `iterations` from outermost to innermost, with the repeat source ID, current iteration and count. Conditions remain runtime decisions on every iteration; no posture is corrected automatically. Both simulator transports consume this same compiled program.
