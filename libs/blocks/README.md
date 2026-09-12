# blocks

This library was generated with [Nx](https://nx.dev).

## Wait Input

<!-- wait toolbox defaults and XML normalization from src/lib/scratch-blocks-local-bridge.ts -->

The `control_wait` toolbox entry includes an editable `math_positive_number` shadow with a default of one second. Loading an older workspace repairs missing or empty `DURATION` inputs without replacing existing numeric values or connected blocks. Decimal values are preserved when exporting and reloading the workspace. Compilation and execution belong to the app and simulator, not this editor bridge.

## Active Block

<!-- active block rendering from src/lib/blocks.tsx and src/lib/scratch-blocks-local-bridge.ts -->

`BlocksEditorShell` accepts `activeBlockId`; its provider mount handle can implement `highlightBlock(blockId?)`. The local Scratch bridge uses the workspace highlighting API, with a visible outline scoped to the editor. Missing IDs or `undefined` clear the highlight without changing or serializing blocks.

## Running unit tests

<!-- test target from project.json -->

Run `npm run nx -- test blocks --run` to execute the unit tests via Vitest.
