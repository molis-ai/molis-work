# CLI & Development

## Installer ownership during development

`pnpm build` cleans generated workspace outputs, then builds all 71 workspace packages in declared dependency order before the root entrypoints and PTY bundle. `build:migrated-packages` reuses `workspace:build`: deleted or moved sources must not leave stale JavaScript in npm/DMG artifacts. This removes generated dist only, not node_modules or user data. The Plugin CLI launcher exists in source, so a clean frozen-lockfile install followed by build makes `pnpm exec molis-work-plugin --help` available. Boundary checks cover JavaScript/TypeScript under src, tooling and bin.

Desktop release scripts belong to `apps/desktop/tooling/`; root `pnpm desktop:*` commands are unchanged. They call Local Host's `createMolisWorkRuntimePayload` instead of running npm install against an isolated workspace:* manifest. Failed preparation preserves old resources; vendor provenance, SBOM and license assets survive both payload generation and Home installation.

Home installation, Runtime integration, managed Web service and uninstall implementations live under `apps/local-host/src/installer/`, exposed through `@molis-ai/molis-work-app-local-host`. The old `src/install/` implementations are removed. CLI/Web callers must not duplicate preview, confirmation, ownership, rollback or cleanup policy.

`installMolisWorkHome` requires an explicit `sourceDirectory`; only the product-root CLI derives its default from its own entry location. Calling that CLI from another working directory without `--source` still installs the same product. Uninstall requires injected `UninstallProjectAccess`; `apps/local-host/src/local-uninstall.ts` composes the read-only connection and existing Demo deletion lifecycle. Projects owns catalog interpretation, and preview never runs database migrations.

Rebuild after changing workspace sources. At the end of `pnpm build`, `apps/local-host/tooling/write-build-manifest.mjs` invokes the Local Host build-record API over root and workspace source/configuration plus build scripts. Never stamp an old build as fresh. Update fingerprint package discovery and build lists when introducing a workspace level. Targeted tests are `tests/install.test.ts`, `tests/service.test.ts`, `tests/uninstall.test.ts`, and `tests/uninstall-catalog.test.ts`, supplemented by Web/Desktop integration tests. Full DV4 release acceptance remains pending; these checks are not release certification.

## Current Goals, parents, and dependencies

Current work is represented by event state and read through `goals.state.read`. A parent completes against its own current agreement, reports, requirements, and applicable blockers; child count is not proof of completion. An unfinished dependency affects formal completion without preventing notes or partial work.

Goals Module owns graph integrity and structural impact. Reusable candidates come from current event work status rather than old leaf categories. Relation changes use finite Goal Tree proposals and protected user decisions, with no clarifier Claim, Draft Dialogue, or old action token. Regressions include `tests/goal-tree-event-flow.test.ts`, `tests/goal-events-state.test.ts`, and `tests/planning-engine.test.ts`.

## CLI

The public CLI top level provides program install, the persistent service, demo, safe uninstall, and the `molis-work v1 <operation>` management surface:

```text
init | snapshot | active-goal
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
```

Every command needs `--db PATH` to name the project database. There is no default path: without it (no value, a blank one, or another `--` flag straight after `--db`) the command fails rather than guess a database from the working directory (`init` included; it creates the database at `PATH`). A relative `PATH` is the one you name; it is resolved against the working directory. Complex inputs can be passed with `--json` or `--file payload.json`. Old create-goal, Claim/Run, Evidence/Review, and Contract/Candidate/Rewire commands are retired and return an unknown-operation error. Everyday notes, reports, agreements, closure, and resume use MCP or Web; CLI does not provide duplicate event-write commands. CLI is a user/management and local debugging entry, not a fallback for Runtime service failures. `init`, `goal-tree-check`, `active-goal` and `goal-tree-decide` write as the person on this machine and their arguments carry no identity: `goal-tree-check` refuses an `actor_id` or `actor_kind` in its arguments (`actions.input_invalid`), and `active-goal` no longer reads `actor_id` from the JSON, so an old script that still writes the field is not taken for someone else; `goal-tree-propose` still takes its author from the `actor_id` argument and `submitted_session_id` from the arguments rather than a Host-injected identity (a known gap).

## Project structure

> The repository is a plugin base plus many plugins in one monorepo: of 71 workspace packages, 70 are `partial` and one (contracts) is `contract-only`; the root package only assembles the product launchers and exports no code. See the [Architecture SSOT](SSOT-MATRIX.md) for status and ownership.

```text
apps/                        Six product-entry and composition-root boundaries
packages/                    Ten foundation packages (plus the root server/); contracts exposes 57 public subpaths
modules/                     Thirteen business-fact owners
horizontal/                  Eight packages: five horizontal runtime services and three platform product services (Memory, Placement, Search)
plugins/                     26 native plugins and six official integration plugins
packages/plugin-runtime/     FD3 local Plugin lifecycle reference implementation
packages/plugin-sdk/         FD3 Manifest and Integration Plugin definition API
plugins/official-integrations/
                             Official Manifests, Provider adapters, and install packages
apps/workbench/              Workbench shell: bottom bar, plugin picker, Manifest-derived navigation, and plugin page wiring
apps/desktop/                AP4 Desktop shell, panels, Capsule, and Tauri native adapter
apps/cli/                    Current management command parsing, Host invocation, and output
apps/mcp/                    Platform MCP schemas, protocol and project tool dispatch; plugin contributions are composed by the Host from Manifests
packages/ui-host/            UI Contribution registry, surface rendering, and Slot mount validation
packages/design-system/      AP3 theme preferences, browser visual foundation, and layered styles
plugins/native/feed/         FD4 Feed/Attention/Source UI and HTTP route table
modules/goals/               Current events, agreements/requirements, completion, graphs/planning, guidance, and history
modules/governance-collaboration/
                             Current user decisions, finite structure proposals, provenance, and history
tooling/plugin-cli/          Plugin CLI boundary; DV3 implements the real developer tool
scripts/workspace-packages.mjs
                             Inventory (71 packages), manifest, entrypoint, README, and Contract wiring check
apps/desktop/launchers/mcp/server.ts            MCP launcher; protocol in apps/mcp, composition in Local Host
apps/desktop/launchers/web/server.ts            Web launcher; Host owns HTTP/resources, Workbench/Native Plugins own pages
apps/desktop/               Desktop platform and native adapters; old src/desktop removed
apps/local-host/src/installer/
                             Sole implementation of installation, Runtime integration, service and uninstall
apps/local-host/tooling/     Build manifest and npm packaging through public Local Host APIs
apps/desktop/tooling/        macOS build, Runtime payload, install and launch tooling
apps/desktop/launchers/cli/main.ts              CLI launcher; commands in apps/cli, composition in Local Host
apps/desktop/src-tauri/      macOS Cargo/Tauri config; the Rust entry lives under apps/desktop/adapters/tauri
examples/seed-demo.mts       Dev script calling the product demo lifecycle
docs/screenshots/            README product screenshots
skills/goal-advance/         Runtime working protocol
skills/molis-plugin-dev/     Plugin authoring skill (ships with install; not auto-linked to Runtimes)
tests/goal-events-state.test.ts
                             Current requirements, decisions, completion, and resume transitions
tests/goal-event-imported-requirements.test.ts
                             Imported requirements, original history, and approval preservation
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
docs/system/                 Layers, dependencies, migration, and the giant-unit list
docs/modules/                Fact ownership and API boundaries for Modules (pages do not yet match the 13 Modules one to one: characters has no page, and pages remain for 4 future owners and retired modules; SSOT-MATRIX is authoritative)
docs/horizontal/             Technical boundaries for the services under `horizontal/` (Memory and Placement: see their package READMEs)
docs/platform/               Plugin, Storage, Exchange, and UI platform mechanisms
specs/molis-work-architecture-reorganization/spec.md
                             Accepted full contract for this reorganization
```

### Development rules during the reorganization

- Root `pnpm build` builds all 71 workspace packages and then compiles the launchers; `workspace:*` commands run only the workspace packages, and `*:all` commands run both.
- Cross-owner calls use public entrypoints only; deep imports, cross-Module Store access, and App database writes are forbidden.
- `contract-only` means a real boundary without a fake provider, store, UI entry, or success response.
- Every migration slice updates its package README and the affected Module/Service document.
- See [giant units: list and verdicts](system/HUGE-CLASS-MIGRATION.md) for the owner, verdict and plan of every file, class and function over the limits.

## Frontend and the control catalog

When changing the workbench, plugin lists, forms, or shared controls, **prefer** opening `/__ui/catalog` and matching an existing specimen before inventing another look. This is not a gate: one-off pages, drafts, and unstable experiments can stay in product UI first.

The visual spec is the Soft Workbench in [DESIGN.md](../DESIGN.md): a pearl desk holding one continuous white work surface, graphite for the primary action and a selected choice, copper for focus, links and work in progress, weights 400 / 500 / 600, motion around 130 / 250 / 420 ms. Take colours, corners, heights and durations from the shared tokens in `packages/design-system/src/palette.ts`; do not hard-code hex values or win over an earlier layer with `!important` or per-plugin overrides. Plugins carry no identity colour, draw no card of their own inside the surface, and have no global sidebar: global entries live in the bottom bar (the Dock and the plugin switcher), and the `navigator` slot id keeps its name. The real bottom bar is at `/__ui/catalog/bar`.

Once a shared control, state variant, or micro-interaction meets the product’s visual bar, **add it** to that board (Catalog specimens in `packages/design-system`) so later work can see and reuse it. Product-specific composition does not need a specimen. Usage and isolated preview: [design-system README](../packages/design-system/README.md). Platform split: [UI Platform](platform/UI-PLATFORM.md).

## Development verification

```bash
# All workspace packages
pnpm workspace:check
pnpm boundary:test
pnpm boundary:check
pnpm workspace:verify
pnpm workspace:typecheck
pnpm workspace:build

# Root launchers plus all workspace packages
pnpm typecheck:all
pnpm build:all

# Product regression and release contents
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

`workspace:check` validates only the F2 package inventory. `boundary:check` scans real imports, dependency direction, Contract entrypoints, and cycles. `workspace:verify` is the complete package gate shared by local development and CI.

After changing a stylesheet, a client script, a plugin client pack or a font, run `node scripts/gates/page-assets.mjs --base origin/main` after `pnpm workspace:build` (that is `pnpm page-assets:check` with `--base`; CI runs the same command after `workspace:verify`). The byte size of every file the host sends under `/assets/` is frozen in `tooling/gates/page-assets.json` and may only fall. When an asset shrinks, run `node scripts/gates/page-assets.mjs --update --base origin/main` to lower its number; `--report` prints bytes, gzip bytes and budget per file. The rules and what the gate does not cover are in [`specs/repository-anti-corruption/spec.md`](../specs/repository-anti-corruption/spec.md) §5a.

Scan for secrets before pushing: run `git fetch origin main`, then `pnpm secrets:check`. It reads every commit of your branch since its merge base with `origin/main` (`scripts/check-secrets.mjs`) and looks for OpenAI/Anthropic keys (`sk-…`, `sk-ant-…`), GitHub tokens (`ghp_…`, `github_pat_…`), Slack tokens, AWS access keys (`AKIA…`), Google API keys (`AIza…`), private key blocks, JWTs, and quoted literals of 12 or more mixed letters and digits assigned to a name that ends in `api_key`, `secret`, `password` or `token` (references, `${…}`, placeholders and URLs do not count). Names also include `secretKey`, `private_key`, `aws_secret_access_key` and `clientKey`, that is a key preceded by secret, private, access, client, auth, signing or encryption (a bare `key` does not count), and a type annotation may sit between the name and the `=` (`const apiKey: string = "…"`). Files whose names git quotes in diff headers (a quote, backslash or control character) are scanned too, and control characters in a file name are escaped in the log. The diff is read with external diff drivers, textconv and `diff.noprefix` switched off, so a local git configuration cannot change what the scan sees. A hit prints the file, line, rule and the first four characters of the value, never the whole value. The CI Secret scan job runs the same command with full history (a pull request against its base branch, a push to main against the tip before the push) and `Verify` waits for it. The rules themselves are tested by `tests/secret-scan.test.ts`, which the Package boundaries job runs.

- A real credential: deleting it in a later commit is not enough because it is already in the history. Remove it from every commit with a rebase or squash, then rotate the key. Secrets live in the Home's secret store or the environment, and code carries only a reference.
- Test data that is already on main: add the exact value (or a `/regex/` anchored with `^…$`) with a reason to `tooling/gates/secret-allowlist.txt`, one entry per line as `<value>  # reason`. A line without a reason makes the scan exit with an error. Do not loosen the rules to get a pass.
- `node scripts/check-secrets.mjs --all` audits the whole tree and `--base <ref>` changes the base. It does not read unquoted YAML values, binary files, or passwords with no recognizable shape.

The Desktop payload contains root dist, production workspace dependencies, Runtime Skill, Node and vendor provenance/license assets, not a second business implementation. For npm, use `pnpm package:npm`: it builds the workspace and invokes Local Host tooling to stage `release/npm/*.tgz`. Pass an absolute output directory as its argument when needed. Direct npm/pnpm pack at the source root prints this command instead of producing an uninstallable workspace:* archive.

The npm archive bundles required workspace and vendor JavaScript packages using their declared files. Consumers install registry dependencies normally, including target-platform SQLite/PTY binaries; Node itself is not bundled and Node 24+ is required. In a new consumer directory run `npm install /absolute/archive.tgz` without skipping install scripts, then run `node tests/npm-distribution-smoke.mjs /absolute/consumer` from this repository. This checks the actual CLI, SQLite persistence, PTY, planning assets, Home installation and source-independent MCP handshake. The smoke script targets a Unix host; passing locally does not certify other platforms.

That sentence describes the current release; DV4's full release acceptance in a clean environment is still pending.
