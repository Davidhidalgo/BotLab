# ADR 0003: Preferred shared MuJoCo browser backend

## Status

Accepted as the preferred direction on 2026-10-13 by the user. Implemented as an optional destination on 2026-10-12; making it the default and retiring the MicroDuck iframe remain implementation work. ADR 0002 records the historical bridge. The native target remains a reference; its removal was not requested.

## Context

Jumper and MicroDuck need a common physics/session/renderer implementation while retaining their own assets, actuation and learned controllers. The user authorized a web implementation for both robots. Running a compiled program must produce observed simulator evidence and support cancellation.

## Decision

- `simulators-core` owns data-only SI contracts. Model/runtime/adapters cannot import MuJoCo, Three or ONNX (enforced by Nx boundaries and regression checks).
- `simulators-mujoco` owns verified asset loading, MuJoCo world, fixed physics steps, worker protocol, generation fencing and the Three renderer. Robot worker entries supply optional controllers; the engine contains no robot-specific observation layout, velocity ranges or fall thresholds.
- `simulators-jumper` resolves the pinned joint-probe manifest. `simulators-microduck-mujoco` owns the alpha-walking observation contract and ONNX worker entry. No generic BotLab `Policy` is repurposed as learned weights.
- The main editor loads these libraries lazily when a MuJoCo destination is selected. A metadata-only catalog exposes destinations without granting executable capabilities before resource negotiation. Each session owns one worker; changing destination unmounts the old runtime, worker and renderer. XState owns the asynchronous connection lifecycle. `?lab=mujoco` is a test harness using the same panel.
- Project documents extend schema 1 with optional per-destination workspaces and MuJoCo evidence. Existing documents remain readable. Save programs, execution identity, model provenance and measured command results; do not serialize workers, physics state, renderer resources or active XState actors. Running records hydrate as interrupted. Source changes invalidate prior MuJoCo results. The existing project/file size and storage-failure handling apply.
- Blocks compile through adapters into the existing runtime. `sourceBlockId`, compiled program identity, execution results and runtime capability locks are preserved. The new SI velocity program is distinct from existing MicroDuck degree/duration artifacts.
- `stop` pauses physics and cancels the pending command; a zero velocity command keeps MicroDuck's balance policy running. A cancelled inference cannot commit targets after the worker's stop/reset epoch changes. Runtime locks remain held until stop acknowledgement or worker termination.
- Preparation downloads pinned files into ignored `tmp/` and verifies SHA-256. Browser execution needs only static assets, with no native services, cross-origin isolation or multithreading requirement. The build copies prepared assets; missing assets give an actionable load error.

## Consequences

The optional integration supports Jumper's contact-free fixed-base joint experiment, Jumper's forward walking controller and MicroDuck's free-base flat-ground walker. It does not imply hardware support, broad Scratch compatibility, or parity with the iframe/native feature catalogs. Jumper's forward locomotion passed its own native and browser gates; untested modes stay unavailable.

Chrome validation and measured limitations are recorded in [the implementation report](../mujoco-validation.md). Real Safari, physical mobile devices, persistent memory profiling, full frame-by-frame telemetry persistence and broader learned skills remain separate validation work. The adoption decision is accepted; iframe retirement is tracked separately and is not yet implemented. Existing saved programs must remain recoverable, with unsupported actions reported explicitly rather than silently converted. ToF is feasible through MuJoCo geometry queries; the browser sensor path and performance still need validation.
