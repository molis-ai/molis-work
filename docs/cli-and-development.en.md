# CLI & Development

## Installer ownership during development

`pnpm build` cleans generated workspace outputs, then builds all 56 packages in declared dependency order before the root entrypoints and PTY bundle. `build:migrated-packages` reuses `workspace:build`: deleted or moved sources must not leave stale JavaScript in npm/DMG artifacts. This removes generated dist only, not node_modules or user data. The Plugin CLI launcher exists in source, so a clean frozen-lockfile install followed by build makes `pnpm exec molis-work-plugin --help` available. Boundary checks cover JavaScript/TypeScript under src, tooling and bin.

Desktop release scripts belong to `apps/desktop/tooling/`; root `pnpm desktop:*` commands are unchanged. They call Local Host's `createMolisWorkRuntimePayload` instead of running npm install against an isolated workspace:* manifest. Failed preparation preserves old resources; vendor provenance, SBOM and license assets survive both payload generation and Home installation.

Home installation, Runtime integration, managed Web service and uninstall implementations live under `apps/local-host/src/installer/`, exposed through `@molis-ai/molis-work-app-local-host`. The old `src/install/` implementations are removed. CLI/Web callers must not duplicate preview, confirmation, ownership, rollback or cleanup policy.

`installMolisWorkHome` requires an explicit `sourceDirectory`; only the product-root CLI derives its default from its own entry location. Calling that CLI from another working directory without `--source` still installs the same product. Uninstall requires injected `UninstallProjectAccess`; `src/local-host/uninstall.ts` composes the read-only connection and existing Demo deletion lifecycle. Projects owns catalog interpretation, and preview never runs database migrations.

Rebuild after changing workspace sources. At the end of `pnpm build`, `apps/local-host/tooling/write-build-manifest.mjs` invokes the Local Host build-record API over root and workspace source/configuration plus build scripts. Never stamp an old build as fresh. Update fingerprint package discovery and build lists when introducing a workspace level. Targeted tests are `tests/install.test.ts`, `tests/service.test.ts`, `tests/uninstall.test.ts`, and `tests/uninstall-catalog.test.ts`, supplemented by Web/Desktop integration tests. Full DV4 release acceptance remains pending; these checks are not release certification.

## Current Goals, parents, and dependencies

Current work is represented by event state and read through `goal_state`. A parent completes against its own current agreement, reports, requirements, and applicable blockers; child count is not proof of completion. An unfinished dependency affects formal completion without preventing notes or partial work.

Goals Module owns graph integrity and structural impact. Reusable candidates come from current event work status rather than old leaf categories. Relation changes use finite Goal Tree proposals and protected user decisions, with no clarifier Claim, Draft Dialogue, or old action token. Regressions include `tests/goal-tree-event-flow.test.ts`, `tests/goal-events-state.test.ts`, and `tests/planning-engine.test.ts`.

## One-time V3 import

Legacy JSON is not a parallel running mode; it can only be written into a brand-new V1 Board through an explicit import:

```bash
molis-work v1 import-v3 \
  --db .molis-work/imported.db \
  --board-id imported \
  --actor user \
  --key import-1 \
  --file legacy-goal-board.json
```

Import preserves Goal titles and original outcomes, parent/child structure, scope, inputs/outputs, root constraints, coverage dispositions, and original sources. The same transaction establishes current event ownership, with `goal_state.intent.source_kind=migration`. Imported Goals immediately support ordinary notes through Runtime or Web and remain usable after reopening. Import invents no acceptance requirements, completion, user approval, or dependencies absent from V3. Clarify further deliverables through current agreements and requirements. An existing target Board is never overwritten.

The management MCP exposes `molis_work_v1_import_v3` on the same Coordinator; the Runtime MCP does not expose import.

## CLI

The public CLI top level provides program install, the persistent service, demo, safe uninstall, and the `molis-work v1 <operation>` management surface:

```text
init | snapshot | import-v3 | active-goal
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
```

Complex inputs can be passed with `--json` or `--file payload.json`. Old create-goal, Claim/Run, Evidence/Review, and Contract/Candidate/Rewire commands are retired and return an unknown-operation error. Everyday notes, reports, agreements, closure, and resume use MCP or Web; CLI does not provide duplicate event-write commands. CLI is a user/management and local debugging entry, not a fallback for Runtime service failures.

## Project structure

> The repository is now a monorepo: 18 target packages remain `contract-only`, while 30 packages have a real migrated slice and are marked `partial`. The root `@molis-ai/molis-work` package continues to carry the working product and release compatibility surface. A package directory does not mean every responsibility has migrated; see the [Architecture SSOT](SSOT-MATRIX.md) for truthful status and migration ownership.

```text
apps/                        Six product-entry and composition-root boundaries
packages/                    Ten foundation packages; contracts exposes 30 public subpaths
modules/                     Sixteen business-fact owner boundaries
horizontal/                  Four horizontal runtime-service boundaries
plugins/                     Six native and five official integration plugin boundaries
packages/plugin-runtime/     FD3 local Plugin lifecycle reference implementation
packages/plugin-sdk/         FD3 Manifest and Integration Plugin definition API
plugins/official-integrations/
                             Official Manifests, Provider adapters, and install packages
apps/workbench/              Shell, slots, assets, current Goal navigation, and native Plugin pages
apps/desktop/                AP4 Desktop shell, panels, Capsule, and Tauri native adapter
apps/cli/                    Current management command parsing, Host invocation, and output
apps/mcp/                    Current tool schemas, connection, event/structure commands, and receipts
packages/ui-host/            UI Contribution registry, surface rendering, and Slot mount validation
packages/design-system/      AP3 theme preferences, browser visual foundation, and layered styles
plugins/native/feed/         FD4 Feed/Attention/Source UI and HTTP route table
modules/goals/               Current events, agreements/requirements, completion, graphs/planning, guidance, and history
modules/governance-collaboration/
                             Current user decisions, finite structure proposals, provenance, and history
tooling/plugin-cli/          Plugin CLI boundary; DV3 implements the real developer tool
scripts/workspace-packages.mjs
                             Inventory, manifest, entrypoint, README, and Contract wiring check
src/index.ts, sdk-*.ts        0.1.x SDK compatibility exports backed by owner packages
apps/desktop/launchers/mcp/server.ts            MCP launcher; protocol in apps/mcp, composition in Local Host
apps/desktop/launchers/web/server.ts            Web launcher; Host owns HTTP/resources, Workbench/Native Plugins own pages
apps/desktop/               Desktop platform and native adapters; old src/desktop removed
apps/local-host/src/installer/
                             Sole implementation of installation, Runtime integration, service and uninstall
apps/local-host/tooling/     Build manifest and npm packaging through public Local Host APIs
apps/desktop/tooling/        macOS build, Runtime payload, install and launch tooling
apps/desktop/launchers/cli/main.ts              CLI launcher; commands in apps/cli, composition in Local Host
desktop/                     macOS Cargo/Tauri distribution config; source lives under apps/desktop/adapters/tauri
examples/seed-demo.mts       Dev script calling the product demo lifecycle
docs/screenshots/            README product screenshots
skills/goal-advance/         Runtime working protocol
tests/goal-events-state.test.ts
                             Current requirements, decisions, completion, and resume transitions
tests/goal-event-migration.test.ts
                             Real database upgrades, original history, and approval preservation
tests/goal-tree-event-flow.test.ts
                             Finite tree proposals, user decisions, graph and transaction boundaries
tests/command-entry-chain.test.ts
                             Current MCP/Host/CLI composition and persistence
tests/host-entry-consistency.test.ts
                             Composed calls, queued concurrency, and Host resource lifetime
tests/mcp.test.ts            MCP audience, permission, and connection regression
tests/web.test.ts            Web data and interaction regression
tests/desktop-tui.test.ts    Third-pane launch, panels, and local PTY regression
tests/i18n.test.ts           UI language regression
tests/uninstall.test.ts      User-data retention, strong confirmation, and receipt regression
PRODUCT.md                   Product definition
DESIGN.md                    Shipped UI design system
docs/SSOT-MATRIX.md          Canonical architecture, package status, and migration-owner index
docs/system/                 Layers, dependencies, migration, and huge-class exit rules
docs/modules/                Fact ownership and API boundaries for all 16 Modules
docs/horizontal/             Technical boundaries for the four horizontal services
docs/platform/               Plugin, Storage, Exchange, and UI platform mechanisms
specs/molis-work-architecture-reorganization/spec.md
                             Accepted full contract for this reorganization
```

### Development rules during the reorganization

- Root `pnpm` commands continue to verify the current product; `workspace:*` commands verify the 48 new packages, and `*:all` commands cover both.
- Cross-owner calls use public entrypoints only; deep imports, cross-Module Store access, and App database writes are forbidden.
- `contract-only` means a real boundary without a fake provider, store, UI entry, or success response.
- Every migration slice updates its package README, `docs/system/MIGRATION.md`, and the affected Module/Service document.
- See the [Huge Class responsibility map](system/HUGE-CLASS-MIGRATION.md) for ownership and removal gates.

## Frontend and the control catalog

When changing the workbench, plugin lists, forms, or shared controls, **prefer** opening `/__ui/catalog` and matching an existing specimen before inventing another look. This is not a gate: one-off pages, drafts, and unstable experiments can stay in product UI first.

Once a shared control, state variant, or micro-interaction meets the product’s visual bar, **add it** to that board (Catalog specimens in `packages/design-system`) so later work can see and reuse it. Product-specific composition does not need a specimen. Usage and isolated preview: [design-system README](../packages/design-system/README.md). Platform split: [UI Platform](platform/UI-PLATFORM.md).

## Development verification

```bash
# Target package tree
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# Current product compatibility surface plus target packages
pnpm typecheck:all
pnpm build:all

# Current-product regression and release contents
pnpm typecheck
pnpm test
pnpm package:npm
```

Use the published-style package name to verify one package independently, for example:

```bash
pnpm --filter @molis-ai/molis-work-module-goals typecheck
pnpm --filter @molis-ai/molis-work-module-goals build
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-integration-github typecheck
```

`workspace:check` validates only the F2 package inventory. `boundary:check` scans real imports, dependency direction, Contract entrypoints, cycles, and the legacy Huge Class allowlist. `workspace:verify` is the complete package gate shared by local development and CI.

The Desktop payload contains root dist, production workspace dependencies, Runtime Skill, Node and vendor provenance/license assets, not a second business implementation. For npm, use `pnpm package:npm`: it builds the workspace and invokes Local Host tooling to stage `release/npm/*.tgz`. Pass an absolute output directory as its argument when needed. Direct npm/pnpm pack at the source root prints this command instead of producing an uninstallable workspace:* archive.

The npm archive bundles required workspace and vendor JavaScript packages using their declared files. Consumers install registry dependencies normally, including target-platform SQLite/PTY binaries; Node itself is not bundled and Node 24+ is required. In a new consumer directory run `npm install /absolute/archive.tgz` without skipping install scripts, then run `node tests/npm-distribution-smoke.mjs /absolute/consumer` from this repository. This checks the actual CLI, SQLite persistence, PTY, planning assets, Home installation and source-independent MCP handshake. The smoke script targets a Unix host; passing locally does not certify other platforms.

That sentence describes the current release. DV4 and the final Cutover Goal will update and verify monorepo packaging, installation, and release commands in a clean environment.
