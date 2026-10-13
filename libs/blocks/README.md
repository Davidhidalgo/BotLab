# blocks

## Target-aware palette

<!-- palette filtering from src/lib/blocks-contract.ts, blocks.tsx and scratch-blocks-local-bridge.ts -->

`BlocksEditorShell.availableBlockTypes` limits the offered blocks. The mount request carries the initial list; `setAvailableBlockTypes` updates the toolbox without replacing the user's workspace or undo history. Empty categories are removed. Filtering survives locale changes and clears Scratch's cached flyout blocks. Existing incompatible blocks receive a dedicated disabled reason and a localized block warning; the app also prevents program execution. Changing target removes only that reason, preserving independent user disables. The derived compatibility reason is omitted from serialized XML and recalculated on mount, edits, and locale/target changes. Execution validation remains authoritative.

This library was generated with [Nx](https://nx.dev).

## Wait Input

<!-- wait toolbox defaults and XML normalization from src/lib/scratch-blocks-local-bridge.ts -->

The `control_wait` toolbox entry includes an editable `math_positive_number` shadow with a default of one second. Loading an older workspace repairs missing or empty `DURATION` inputs without replacing existing numeric values or connected blocks. Decimal values are preserved when exporting and reloading the workspace. XML parsing belongs to this library; robot command lowering belongs to the adapter and native execution to the simulator boundary.

## Movement Blocks

<!-- movement palette and fields from src/lib/scratch-blocks-local-bridge.ts and src/lib/microduck-block-messages.ts; execution units from src/lib/microduck-program.ts and ../adapters/microduck/src/lib/microduck-program.ts -->

The directional movement blocks combine a bundled Lucide SVG with localized text. The two categories can be mixed in one script:

| Category         | Block type (prefix `botlab_microduck_`)           | Input / meaning                                                                 |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Movement         | `walk_steps`, `back_steps`                        | `STEPS`, default 1, whole numbers 0–40; one BotLab step is 0.5 m                |
| Movement         | `turn_left`, `turn_right`                         | Fixed -90 / +90 degrees                                                         |
| Movement         | `turn_around`                                     | Fixed +180 degrees                                                              |
| Navigation       | `walk_until_obstacle`                             | Native sensor-guided advance, ending before a detected obstacle                 |
| Navigation       | `turn_left_until_clear`, `turn_right_until_clear` | Native sensor-guided turn until the front path is clear                         |
| Precise movement | `walk_distance`, `back_distance`                  | `DISTANCE` in meters, 0–20; defaults 5 / 1                                      |
| Precise movement | `turn_degrees`                                    | `ANGLE`, default 90, range -360 to 360                                          |
| Precise movement | `sit`, `stand`                                    | Explicit posture; posture-capable native or iframe simulator required, no input |
| Precise movement | `kick_left`, `kick_right`                         | Native simulator skill; observed start and standing recovery required           |
| Precise movement | `community_skill`                                 | Native simulator skill; dropdown lists models saved in the current project      |

Negative angles turn left, positive angles turn right, relative to the robot heading. The variable turn's icon follows the sign and is not serialized. The existing `walk_distance` type, `DISTANCE` field and `walk` translation key remain compatible with saved programs and translation overlays. Numeric defaults supply Scratch's text-field configuration as well as Blockly's numeric configuration; Scratch's field limits primarily configure its keypad, so the compiler also validates all inputs.

## Active Block

<!-- active block rendering from src/lib/blocks.tsx and src/lib/scratch-blocks-local-bridge.ts -->

`BlocksEditorShell` accepts `activeBlockId`; its provider mount handle can implement `highlightBlock(blockId?)`. The local Scratch bridge uses the workspace highlighting API, with a visible outline scoped to the editor. Missing IDs or `undefined` clear the highlight without changing or serializing blocks.

## Workbench

<!-- workbench presentation and responsive palette from src/lib/blocks.tsx, src/lib/blocks-contract.ts, and src/lib/scratch-blocks-local-bridge.ts -->

`BlocksEditorShell` accepts `workbench` (default `false`) for a full-height editor with a compact toolbar and no development controls after mounting. `labels.togglePalette` names the palette icon. Mount handles can implement `togglePalette()`. The local Scratch bridge observes container resizing and, at widths up to 600 px, uses standard Blockly metrics and an initially closed overlay flyout. Wider editors retain Scratch's continuous toolbox. Resizing and toggling the palette preserve the serialized program; disposal disconnects the resize observer.

## Localization

<!-- localization API from src/lib/block-messages.ts, src/lib/microduck-block-messages.ts, src/lib/blocks-contract.ts, and src/lib/scratch-blocks-local-bridge.ts -->

`BlocksEditorShell` and mount requests accept `locale` (`ca`, `es`, `en`; default `ca`). Mount handles can implement `setLocale(locale)`. The local bridge uses Scratch's bundled messages for standard blocks, categories and context menus, plus `microDuckBlockMessages` for BotLab labels, dropdown display names and tooltips. Switching locale rebuilds display fields in the existing workspace while preserving serialized IDs, input values, connections, zoom, scroll, highlight and undo/redo stacks. It does not emit workspace edits or send simulator commands. Scratch's message registry is global: use one active editor locale per page.

External integrations can use `parseBlockMessageCatalog(unknown)` and `createBlockMessageResolver(catalog, localTranslations?)`. Catalogs contain display text only, with a namespace and an exact revision (package version or pinned commit). A `BlockTranslationOverlay` adds local translations without modifying the upstream catalog. Mismatched revisions/namespaces, unknown message keys and changed `%1`/`%2` parameter sets are rejected. Resolution is per message: selected locale, English, source locale, then original text; local translations take precedence within each language. Text is not evaluated as code or HTML, and nested Blockly message references are rejected.

```json
{
  "schemaVersion": 1,
  "namespace": "org.example.balance",
  "revision": "pinned-commit-id",
  "sourceLocale": "en",
  "messages": { "run": "balance for %1 seconds" },
  "translations": {
    "ca": { "run": "mantén l'equilibri durant %1 segons" },
    "es": { "run": "mantén el equilibrio durante %1 segundos" }
  }
}
```

An adapter must explicitly bind message keys to its block definitions. This catalog format does not import policies, execute repository code, register arbitrary blocks, fetch repositories, or generate automatic translations. The built-in bridge accepts an optional overlay for `botlab.microduck` revision `1` as its factory argument.

## Running unit tests

<!-- test target from project.json -->

Run `pnpm nx test blocks --run` to execute the unit tests via Vitest.

## Program parsing

<!-- parser API from src/lib/microduck-program.ts and typed steps from ../botlab-model/src/lib/program.ts -->

`readMicroDuckProgramFromWorkspace(artifact)` parses the single enabled green-flag script, including nested `control_if` and `control_if_else` branches, into typed `MicroDuckProgramStep[]`, retaining source block IDs. It validates numeric fields and rejects unsupported connected blocks/expressions; detached blocks remain ignored. It does not dispatch robot commands. `compileMicroDuckProgram` in the MicroDuck adapter lowers these steps to target-specific commands; the app composes the two functions. Posture blocks stay explicit (`sit`/`stand`) rather than becoming toggles at compile time. Kick blocks preserve `kick_left` / `kick_right` skill names; the imported-skill dropdown preserves its selected name across locale changes. The app supplies the project's model names without replacing the workspace. All three require the native simulator.

Navigation blocks preserve sensor-guided intent without putting a distance or angle in the workspace. They are offered only with the native backend; the gateway interprets ToF frames during execution.

<!-- posture predicates and control palette from src/lib/scratch-blocks-local-bridge.ts; validation from src/lib/microduck-program.ts -->

Sensing offers Boolean `botlab_microduck_is_sit`, `botlab_microduck_is_stand` and `botlab_microduck_is_transitioning`. Control offers `control_if` and `control_if_else`; their `CONDITION` must contain one of these predicates, and their `SUBSTACK` / `SUBSTACK2` statement inputs may contain nested sequences or be empty. Both branches are validated before execution. The parser preserves predicate and statement IDs, limits nesting to 16 levels and action/control nodes to 256, and rejects missing or unsupported conditions. General Boolean expressions and loops are not implemented yet.

<!-- repeat parsing and palette from src/lib/microduck-program.ts and scratch-blocks-local-bridge.ts -->

`control_repeat` is available in Control with the standard localized Scratch labels (Catalan, Spanish and English). Its TIMES input accepts a literal integer from 0 to 100. The parser emits a typed `repeat` node, preserves SUBSTACK order and source IDs, validates zero-count bodies, and rejects expressions and invalid counts. Control nesting is limited to 16 levels.

## StackChan

<!-- StackChan palette, fields, locale and parser from src/lib/stackchan-blocks.ts and src/lib/stackchan-program.ts -->

`botlab_stackchan_yaw`, `botlab_stackchan_center`, `botlab_stackchan_leds`, and `botlab_stackchan_leds_off` are localized in Catalan, Spanish, and English. Explicit field validators bound whole-degree yaw to ±20° and brightness to 0–25%; adapter preflight also validates imported/programmatic input. Side/color dropdowns select both/left/right and red/green/blue/amber/white.

`readStackChanProgramFromWorkspace(artifact)` reads one enabled green-flag script into `StackChanProgramStep[]`, preserving block IDs. It supports literal waits and bounded repeat expansion (counts 0–10, four nested repeats, 40 expanded steps), skips explicitly disabled statements, and rejects incompatible blocks and computed inputs. It sends no commands; the adapter validates all physical limits before execution.

## Shared web simulation blocks

<!-- web block examples and parsers from src/lib/microduck-mujoco-blocks.ts, src/lib/jumper-blocks.ts, scratch-blocks-local-bridge.ts and src/index.ts -->

The web walking examples use the existing educational movement blocks: advance in steps (one BotLab step = 0.5 m) or metres, plus a literal `control_wait`. MicroDuck additionally offers a 90° left turn; Jumper offers 90° left and right turns. MicroDuck right turns and reverse remain withheld pending reliable policy behavior. `jumperWalkingBlockTypes` and `microduckWalkingBlockTypes` describe the distinct palettes. Labels and the **Advanced** category are localized in Catalan, Spanish and English. `botlab_web_velocity` remains in Advanced and existing timed programs remain compatible.

`readMicroduckWalkingProgram()` and `readJumperWalkingProgram()` apply their own target palette and return structured `WalkingProgramStep[]`: measured distance/turn goals, waits, legacy timed velocity steps and `control_repeat` bodies. Both walking palettes offer repeat. Counts are literal integers 0–100; zero skips execution but its body is still validated. There may be at most 256 source blocks and 16 nested repeats, with a separate adapter limit of 256 expanded steps including iteration checkpoints. One enabled green-flag script is required; disconnected scripts, expressions and unsupported statement inputs are rejected. Educational left turns become positive SI radians and Jumper right turns negative SI radians; existing blocks keep their meaning. Joint-probe blocks and their parser remain separate. The supported condition is `botlab_web_obstacle` (front distance less than a literal 5–400 cm), usable in `control_repeat_until`, `control_if` and `control_if_else`. `botlab_web_advance_cm` converts explicit centimetres to metres, with 15 cm as its default. New blocks are shared by both walking palettes; existing metre and 0.5 m step blocks keep their meaning. Missing predicates, disconnected inputs and unsupported expressions are rejected. General expressions remain unsupported.

<!-- mounted callback forwarding from src/lib/blocks.tsx -->

A mounted native editor forwards change notifications to the latest React `onArtifactChange` callback without remounting the workspace. Hosts can therefore react to the current execution/session when cancelling a run after edits.

Mount generations exclude notifications from replaced or unmounted workspaces. A pending mount suppresses duplicate automatic mounts, and a handle returned after cancellation is disposed immediately. The local bridge also ignores queued changes after disposal, preventing late editor events from replacing an imported project.

Both walking palettes include **wait until [condition], at most [seconds]**. The timeout is explicit (0.5–30 s in half-second increments); the existing proximity condition connects to it. The robot balances while observing, and no forward action is inserted.

The walking palettes also expose **and / or / not**. Nested proximity conditions connect to if, repeat-until and bounded wait-until. The XML parser preserves operand structure and rejects disconnected inputs.

Only MicroDuck’s MuJoCo palette offers **look left / centre / right**. This changes head orientation, not the body heading; Jumper rejects imported head blocks.

MicroDuck MuJoCo now accepts the existing **sit** and **stand** block IDs, preserving saved programs. Retired-destination migration continues to block unimplemented actions (the regression fixture uses kick-left).
