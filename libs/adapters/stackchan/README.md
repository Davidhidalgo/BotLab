# StackChan adapter

<!-- exported functions from src/index.ts and target status from src/lib/stackchan.ts -->

The generic runtime target remains `planned`. A separate DANCE Bluetooth executor supports bounded head/LED programs. The owner confirmed manual −10°/0°/+10° movements on firmware 1.5.1; LED behavior still awaits physical observation.

- `createStackChanAdapter()` declares the planned target and capabilities.
- `createStackChanExpressionPayload(expression)` encodes the factory firmware eye presets `happy` and `neutral` as JSON.
- `encodeStackChanExpressionFrame(targetMac, expression)` builds the app-to-relay binary frame, preserving the exact 12-character device identifier. It does not send it.
- `encodeStackChanYawFrame(targetMac, degrees)` prepares an absolute horizontal servo target within -20 to +20 whole degrees, at speed 100/1000. The initial pose must be verified before sending; zero means calibrated origin, not current pose. No continuous rotation or vertical motion is encoded.
- `createStackChanYawPayload(degrees)` returns the bounded motion JSON.
- `encodeStackChanBleYaw(degrees)` fragments that JSON using the factory 10-byte fragment header and 20-byte ATT payload limit.
- `connectStackChanBluetooth(bluetooth, signal, onDisconnect)` opens the browser device picker, discovers the DANCE motion and RGB characteristics, and returns `sendYaw`/`sendLeds`/`disconnect` plus read-only last-commanded motion state. Connection alone writes nothing. Commands are serialized, with changes no larger than 10°, 1–3 seconds between motion commands according to travel plus a 10-second rest every 12 moves and 1 second between LED commands, with a 10-second per-operation timeout and disconnect on write failure. Results are `dispatched`, never inferred hardware completion.

- `createStackChanLedPayload(side, color, brightness)` encodes left/right/both RGB output, scaling RGB channels to brightness 0–25%, with a 0.5-second transition.
- `validateStackChanProgram(steps, session?)` validates the entire sequence before sending: literal yaw/wait/LED steps, maximum 40 actions, 90 seconds scheduled time including rests, without session move or cumulative travel caps. It checks against the session's last commanded yaw, which is not measured feedback.
- `runStackChanProgram(input, signal)` snapshots the plan, validates against connection state, tracks source blocks and sends sequentially with distance-based 1–3-second motion/1-second LED pauses and 10-second rests every 12 moves. Aborting or a write failure disconnects and prevents later commands. Success reports `dispatched`, never hardware completion.

<!-- robot module and workspace parser from src/lib/stackchan-module.ts and src/lib/stackchan-workspace.ts -->

- `stackChanBlockSet` (`src/lib/stackchan-blocks.ts`) describes the StackChan head and LED blocks, their clamped fields and `stackChanBlockMessages` as editor-neutral data; it is exposed as `stackChanRobotModule.blocks`.
- `stackChanCatalog` (skill `set-stackchan-expression` and the `planned-targets-disabled` policy) is exposed as `stackChanRobotModule.catalog`. `StackChanProgramStep` and `StackChanLedSide` are exported from `src/lib/stackchan-steps.ts`.
- `stackChanRobotModule` implements the model's `RobotModule` contract with `createAdapter`, `blockTypes(capabilityIds)` (yaw/center with `stackchan-yaw`, LED on/off with `stackchan-leds`) and `readProgram`. It has no `compile`: StackChan programs run as typed steps through `runStackChanProgram`, not as runtime plans.
- `readStackChanProgramFromWorkspace(artifact)` reads one enabled green-flag script into `StackChanProgramStep[]`, preserving block IDs. It supports literal waits and bounded repeat expansion (counts 0–10, four nested repeats, 40 expanded steps), skips explicitly disabled statements, and rejects incompatible blocks and computed inputs. It sends no commands; the adapter validates all physical limits before execution.

The planned capability enum is broader than this initial verified encoder. Unsupported trial expressions throw; they are not silently substituted.

See [firmware compatibility and physical trial](../../../docs/stackchan-1.5.1.md).

<!-- test configuration from vite.config.ts -->

Run protocol tests with `npx vitest run --config libs/adapters/stackchan/vite.config.ts`.
