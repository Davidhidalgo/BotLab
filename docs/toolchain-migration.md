# BotLab toolchain migration — 2026-09-17

<!-- toolchain versions from ../package.json and ../pnpm-lock.yaml -->

The workspace moved from Nx 20.2.2/npm/TypeScript 5.6 to Nx 23.2.1, pnpm 10.34.5 and TypeScript 6.0.3. The stable Nx version was checked against the npm registry. React 18.3.1 is retained; Vite resolves to 7.3.6, Jest to 30.3.0 and Vitest to 4.1.9. Oxlint 1.83.0 and Oxfmt 0.68.0 are pinned because the official Nx Oxlint integration is experimental.

## Official migration path

1. `npx nx@23.2.1 migrate 23.2.1 --interactive=false` generated the dependency updates and migration plan.
2. The generated React 19 upgrade was declined to preserve the existing UI contract. TypeScript was explicitly pinned to 6.0.3, and the two official `@nx/js` TypeScript 6 compatibility migrations were added to the plan. Vite 7 satisfies Vitest 4's Vite 6+ requirement.
3. `pnpm import` converted the npm lockfile, preserving compatible existing resolutions; `pnpm install` installed the updated dependencies.
4. `nx migrate --run-migrations` applied 52 deterministic migrations. These moved Vitest inference to `@nx/vitest`, replaced `vitest.workspace.ts` with `vitest.config.ts`, and preserved pre-TypeScript-6 compiler behavior. Existing library strictness is unchanged.
5. `nx add @nx/oxlint@23.2.1` initialized the official plugin. `nx g @nx/oxlint:configuration --project=<name> --plugins=react,jsx-a11y` configured `botlab-web`, `blocks`, and `ui`. The existing architecture constraints were transferred to `@nx/oxlint/boundaries-plugin`; all eight positive/negative regression probes now invoke Oxlint.
6. Oxfmt was configured using Nx's documented formatter detection. `nx format:write --all` established the formatting baseline. Sources under `sources/` and generated/downloaded content are excluded.

The generated AI follow-ups were reviewed: this workspace has no custom Vitest pools, reporters, browser-mode provider configs or removed mock APIs requiring changes. The React 19 and ESLint follow-ups do not apply to the retained React 18 and replacement linter. Generated one-shot migration plans and prompts were moved to the ignored `tmp/toolchain-migration/` audit directory after application.

## Compatibility adjustments

- The integrated workspace retains a single dependency manifest. Root scripts are excluded from Nx target inference to prevent recursive root test/build targets. The aggregate Vitest config only selects library configs and is excluded from Nx project inference.
- Scratch Blocks and Blockly media resolve through their package entry points, including Blockly relative to Scratch Blocks. This supports pnpm's isolated dependency layout without hoisting transitive packages.
- Browser asset cache and digest calls copy byte views into ordinary `ArrayBuffer`-backed arrays, satisfying TypeScript 6's DOM types and retaining the exact view contents.
- `unicorn/no-thenable` is disabled for the domain's `then` data property. The Bluetooth test's typed-array conversion is exempt from `no-useless-spread`. Existing React hook dependency warnings remain warnings, as do new effect/semantic-tag recommendations.
- ESLint and Prettier are removed from direct dependencies and project configuration. Nx still uses some related packages internally, so they can remain transitive dependencies.
- Vitest configs use `defineConfig` from `vitest/config`; library spec configs use bundler resolution. Four app test mocks have explicit result types or UUID-shaped identifiers. `typecheck:all` now checks every configured `tsconfig.spec.json` as well as production configs.
- Existing Nx Vite path/asset helper plugins remain supported in Nx 23, with deprecation warnings for Nx 24.
- Only `@swc/core`, `esbuild`, and `nx` dependency build scripts are approved in pnpm. Optional watcher/resolver installation scripts are not needed by the verified paths.

## Validation

The original `npm run verify` passed before migration. Final validation passed (exit 0) after migration using a clean `node_modules`, `pnpm install --frozen-lockfile`, and `NX_SKIP_NX_CACHE=true pnpm run verify` so existing cached outputs cannot hide regressions. The verification covers production and configured test types, Jest/Vitest and native Python unit tests, Oxlint, architecture probes, all nine library builds and the web production build. Formatting is checked by `verify` using `pnpm run format:check --all`. A local Vite smoke check fetched the HTML page, transformed React entry and Blockly sprites successfully.

The final run passed all nine test targets, ten lint targets, eight architecture probes, nine library builds and the web production build. Existing non-blocking React lint, Nx Vite-helper deprecation and large-bundle warnings remain. Local command logs are available under `tmp/toolchain-migration/`.

Physics-engine browser acceptance and macOS packaging are separate integration commands, outside this toolchain verification. They require their prepared external assets/services.

References: [Nx migration guidance](https://nx.dev/docs/features/automate-updating-dependencies), [official Oxlint integration](https://nx.dev/docs/technologies/oxlint/introduction), [Oxfmt support](https://nx.dev/docs/reference/code-formatting).
