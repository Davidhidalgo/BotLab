# blocks

This library was generated with [Nx](https://nx.dev).

## Wait Input

<!-- wait toolbox defaults and XML normalization from src/lib/scratch-blocks-local-bridge.ts -->

The `control_wait` toolbox entry includes an editable `math_positive_number` shadow with a default of one second. Loading an older workspace repairs missing or empty `DURATION` inputs without replacing existing numeric values or connected blocks. Decimal values are preserved when exporting and reloading the workspace. Compilation and execution belong to the app and simulator, not this editor bridge.

## Movement Blocks

<!-- movement palette and fields from src/lib/scratch-blocks-local-bridge.ts and src/lib/microduck-block-messages.ts; execution units from apps/botlab-web/src/app/botlab-flow-machine.ts -->

All movement blocks combine a bundled Lucide SVG with localized text. The two categories can be mixed in one script:

| Category | Block type (prefix `botlab_microduck_`) | Input / meaning |
| --- | --- | --- |
| Movement | `walk_steps`, `back_steps` | `STEPS`, default 1, whole numbers 0–40; one BotLab step is 0.5 m |
| Movement | `turn_left`, `turn_right` | Fixed -90 / +90 degrees |
| Movement | `turn_around` | Fixed +180 degrees |
| Precise movement | `walk_distance`, `back_distance` | `DISTANCE` in meters, 0–20; defaults 5 / 1 |
| Precise movement | `turn_degrees` | `ANGLE`, default 90, range -360 to 360 |

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

Run `npm run nx -- test blocks --run` to execute the unit tests via Vitest.
