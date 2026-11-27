# CLI & Development

> Synced with [`docs/cli-and-development.md`](cli-and-development.md) (baseline `2ca43ef58f`; locked runtime: Node `24.15.x` per `.nvmrc` and `pnpm@11.9.0`).

## Offline Home snapshots

`molis-work home snapshot --to /absolute/path/new-directory --home /original/Home --json` captures an existing Home. If `--home` is omitted, normal product Home resolution applies. `--to` is required: the destination must not exist, its parent must exist, and neither the destination nor the Home may contain the other. Duplicate, unknown or incomplete arguments are rejected. Success writes JSON to stdout, or the path and counts without `--json`; failure writes only to stderr and exits with code 1.

Stop every Web/Desktop/Agent process using that Home before running the command. It acquires the same storage ownership as Host/Agent; it neither starts a business Host nor pauses an online one. A busy Home produces no snapshot output. The store inventory comes from `homeStores()`, including actual installed-plugin databases and project partitions. SQLite uses the backup API, including the latest committed WAL; sidecars and ownership locks are excluded. Unknown entries, wrong versions, corrupt databases, links or unfinished maintenance reject the entire snapshot.

The snapshot is limited to the same machine, original canonical Home path and original keys. SDK, build-run and retired-session keys are recorded only as references and identity digests; Home master keys and Keychain contents are not exported. Managed CLI `.home` state and directory bookmarks inside the Home are sealed by their existing owners. This is not a key backup. Browser login state is excluded, so sign in again after recovery; select directories again if the system rejects their original bookmarks. External AppData is not read. Retain or reinstall managed programs and rebuildable caches. Ordinary files are streamed; each vault, bookmark or other file processed as a whole by its owner is limited to 32 MiB. CLI private state also follows its owner's limits of 10,000 nodes, 32 MiB of plaintext and 128 MiB of ciphertext.

Output uses a private sibling staging directory with mode 0700 and files with mode 0600. The manifest records original modes, versions, integrity data, digests and dependencies. Validation and flushing finish before publishing to a new directory; existing destinations are never overwritten. Ordinary failures and SIGINT/SIGTERM remove this operation's unpublished staging directory. A forced termination may leave `.molis-home-snapshot-*`: remove it only after confirming that its process has exited, it is in this operation's destination parent, and it was not published. If the command reports that publication succeeded but durability is unconfirmed, retain the reported destination and inspect its manifest and payload rather than overwriting it as an empty result.

The original SDK reader validates every ciphertext record kind and page using the original Home's key, including valid empty bodies and tombstones that retain ciphertext. Metadata-only stores and ordinary checkpoints do not require or create a key. Managed CLI recovery still requires the original installation identity and actual program at the original path; this command does not reinstall over the network or create a replacement installation.

Run `molis-work home restore --from <snapshot-directory> [--home <original-Home>] [--json]` in the same offline window to restore to the original Home using its original keys. Preflight checks the manifest, payload digests, owner versions, Memory eligibility and target stores before moving originals. The result reports `originals_directory` when it replaces data and `unchanged` when no business writes are needed. If an interrupted restore blocks normal startup, use `molis-work home restore --recover`. It rolls back an uncommitted operation, finishes a committed one, or returns `no_recovery` when nothing is pending. Choose exactly one of `--from` and `--recover`. During the pre-development stage, old development Homes are not migrated and can be wiped and recreated cleanly at v1; see [section 4 of the release checklist](releases/CHECKLIST.md#4-真实-home搬开后干净重建).

## Installer ownership during development

`pnpm build` invokes `workspace:build` through `build:migrated-packages`, cleaning and rebuilding workspace packages whose inputs or outputs have changed, in dependency order, and skipping packages whose build records remain valid. It then regenerates the root entrypoints, PTY bundle and installation build fingerprint. Deleting or moving source files rebuilds their package and its dependents, preventing stale JavaScript in npm/DMG artifacts. With no build records, all packages are built; use `pnpm build:clean` to force a complete rebuild. Only generated outputs are cleaned, not node_modules or user data. Incremental-build and machine-slot rules are in [Parallel development §5](system/PARALLEL-DEVELOPMENT.md#5-构建与浏览器用例排时段). The Plugin CLI launcher exists in source, so a clean frozen-lockfile install followed by build makes `pnpm exec molis-work-plugin --help` available. Boundary checks cover JavaScript/TypeScript under src, tooling and bin.

Desktop release scripts belong to `apps/desktop/tooling/`; root `pnpm desktop:*` commands are unchanged. They call Local Host's `createMolisWorkRuntimePayload` instead of running npm install against an isolated workspace:* manifest. Failed preparation preserves old resources; vendor provenance, SBOM and license assets survive both payload generation and Home installation.

Home installation, Runtime integration, managed Web service and uninstall implementations live under `apps/local-host/src/installer/`, exposed through `@molis-ai/molis-work-app-local-host`. The old `src/install/` implementations are removed. CLI/Web callers must not duplicate preview, confirmation, ownership, rollback or cleanup policy.

`installMolisWorkHome` requires an explicit `sourceDirectory`; only the product-root CLI derives its default from its own entry location. Calling that CLI from another working directory without `--source` still installs the same product. Uninstall requires injected `UninstallProjectAccess`; `apps/local-host/src/local-uninstall.ts` composes the read-only connection and existing Demo deletion lifecycle. Projects owns catalog interpretation, and preview never runs database migrations.

Rebuild after changing workspace sources. At the end of `pnpm build`, `apps/local-host/tooling/write-build-manifest.mjs` invokes the Local Host build-record API over root and workspace source/configuration plus build scripts. Never stamp an old build as fresh. Update fingerprint package discovery and build lists when introducing a workspace level. Targeted tests are `tests/install.test.ts`, `tests/service.test.ts`, `tests/uninstall.test.ts`, and `tests/uninstall-catalog.test.ts`, supplemented by Web/Desktop integration tests. Full DV4 release acceptance remains pending; these checks are not release certification.

## Current Goals, parents, and dependencies

Current work is represented by event state and read through `goals.state.read`. A parent completes against its own current agreement, reports, requirements, and applicable blockers; child count is not proof of completion. An unfinished dependency affects formal completion without preventing notes or partial work.

Goals Module owns graph integrity and structural impact. Reusable candidates come from current event work status rather than old leaf categories. Relation changes use finite Goal Tree proposals and protected user decisions, with no clarifier Claim, Draft Dialogue, or old action token. Regressions include `tests/goal-tree-event-flow.test.ts`, `tests/goal-events-state.test.ts`, and `tests/planning-engine.test.ts`.

## CLI

The public CLI top level provides program install, the persistent service, demo, safe uninstall, plugin management, offline `molis-work home snapshot` and `molis-work home restore`, and the `molis-work v1 <operation>` management surface. The following are v1 operations:

```text
review-request | review-decide
```

(Hardcoded Goals subcommands `init`, `snapshot`, `active-goal`, and `goal-tree-*` were removed in batch 44 / PEQ-15; the CLI retains only the platform protected review commands.)

Each v1 command requires `--db PATH` and the project's `project_id` in its JSON. The CLI resolves a relative path against the working directory and refuses a missing path. Supply input with `--json` or `--file payload.json`. `review-request` reads the original owner's current request, using `action` and `request_id` or an exact `reference`. After reviewing the choice, use `review-decide` with the returned reference, `choice_id`, a stable `request_key` and an optional note. The resident Host supplies the person's identity and records the management entry. Notes, reports, agreements, closure and resume use MCP or Web.

The plugin author's commands (`molis-work plugin create`, `validate`, `dev`, `pack`) are in the [plugin development manual](platform/PLUGIN-DEVELOPMENT.md#创建和运行) (Chinese). `validate` also reads the language files the Manifest declares in `ui.locales`: what would block fails, what only lacks a translation goes into `locale_notes`; how to read it is in the manual's [界面文字与语言文件](platform/PLUGIN-DEVELOPMENT.md#界面文字与语言文件).

`molis-work demo remove --confirm` asks the resident service of this Home first. When it answers, its deletion service does the removal (it refuses while a terminal of the project is still open, as the settings page does, and records the person on this machine); the address is resolved in order: `MOLIS_WORK_WEB_URL` > the Home's `run/endpoint.json` > `http://127.0.0.1:4173` (same as Desktop and launchers). Only when the Home has no control token, or nothing answers at that address, does the command delete in its own process. If the answer comes from another Home's service, or a terminal is still open, the command exits with an error and leaves the demo as it was. `molis-work uninstall` stops the resident service first and then clears the demo in its own process.

Plugin authors can run `molis-work plugin validate` to inspect Manifests, files, and declarations; when `state_machines` are declared, validation prints the machine list (metadata-only, see [state-machine.md](../skills/molis-plugin-dev/state-machine.md)).

For isolated-Home real evaluation, run `pnpm eval:run` (`tsx scripts/run-evaluation.mts`): default `--mode stand-in` boots the real Host, plugins, Prologue Runtime, `system.observation`, and `system.evaluation` in a temporary isolated Home and cleans up automatically; `--verify-reproducible` compares verdict digests across two independent temporary Homes; `--mode live` uses Gemini (`gemini-2.5-flash`, `https://generativelanguage.googleapis.com/v1beta/openai`) with `GEMINI_API_KEY` (or `MOLIS_EVAL_API_KEY`) and refuses `~/.molis-work`. See [Evaluation service](horizontal/evaluation.md).

## Project structure

> The repository is a plugin base plus many plugins in one monorepo. `scripts/workspace-packages.mjs` owns the package inventory; `pnpm workspace:check` reports its current count. Maturity uses the four words in [SSOT-MATRIX](SSOT-MATRIX.md) §2 (`production`, `experimental`, `slice`, `absent`), with `absent` reserved for target paths that have no package yet. The root package only assembles product launchers and exports no code. See the [Architecture SSOT](SSOT-MATRIX.md) for status and ownership.

```text
apps/                        Product-entry and composition-root boundaries
packages/                    Foundation packages; contracts declares public subpaths in its package.json exports
server/                      Chat and continuation facts, classified as a Module
modules/                     Business-fact owners; current packages and future target paths are in SSOT-MATRIX §5
horizontal/                  Runtime services and platform product services (Memory, Placement, Search, Knowledge)
plugins/                     Native and official integration plugins, listed by the registry
packages/plugin-runtime/     FD3 local Plugin lifecycle reference implementation
packages/plugin-sdk/         FD3 Manifest and Integration Plugin definition API
plugins/official-integrations/
                             Official Manifests, Provider adapters, and install packages
apps/workbench/              Workbench shell: bottom bar, plugin picker, Manifest-derived navigation, and plugin page wiring
apps/desktop/                AP4 Desktop shell, panels, menu bar, and Tauri native adapter
apps/cli/                    Current management command parsing, Host invocation, and output
apps/mcp/                    Platform MCP schemas, protocol and project tool dispatch; plugin contributions are composed by the Host from Manifests
packages/ui-host/            UI Contribution registry, surface rendering, and Slot mount validation
packages/design-system/      AP3 theme preferences, browser visual foundation, and layered styles
plugins/native/feed/         FD4 Feed/Attention/Source UI and HTTP route table
plugins/native/goals/        Goals plugin, owning Goal facts and the event protocol
                             Current user decisions, finite structure proposals, provenance, and history
tooling/plugin-cli/          Plugin CLI boundary; DV3 implements the real developer tool
scripts/workspace-packages.mjs
                             Package inventory, manifest, entrypoint, README, and Contract wiring check
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
tests/mcp-action-catalog.test.ts
                             Public MCP catalog: platform tools and authorized actions
tests/web.test.ts            Web data and interaction regression
tests/desktop-tui.test.ts    Third-pane launch, panels, and local PTY regression
tests/i18n.test.ts           UI language regression
tests/uninstall.test.ts      User-data retention, strong confirmation, and receipt regression
PRODUCT.md                   Product definition
DESIGN.md                    Shipped UI design system
docs/SSOT-MATRIX.md          Canonical architecture, package status, and migration-owner index
docs/system/                 Layers, dependencies, migration, and the giant-unit list
docs/modules/                Fact ownership and API boundaries, including future targets and concepts now implemented by plugins; pages do not map one to one to current Module packages; SSOT-MATRIX is authoritative
docs/horizontal/             Technical boundaries for the services under `horizontal/` (Memory and Placement: see their package READMEs)
docs/platform/               Plugin, Storage, Exchange, and UI platform mechanisms
specs/molis-work-architecture-reorganization/spec.md
                             Accepted full contract for this reorganization
```

### Development rules during the reorganization

- Root `pnpm build` incrementally builds workspace packages, then recompiles the launchers and refreshes the installation build fingerprint; `pnpm build:clean` forces a complete rebuild. `workspace:*` commands run only the workspace packages, and `*:all` commands run both.
- Cross-owner calls use public entrypoints only; deep imports, cross-Module Store access, and App database writes are forbidden.
- A package that exists has a real implementation: no fake provider, store, UI entry, or success response; targets that do not exist yet stay in the `absent` rows of the SSOT.
- Every migration slice updates its package README and the affected Module/Service document.
- See [giant units: list and verdicts](system/HUGE-CLASS-MIGRATION.md) for the owner, verdict and plan of every file, class and function over the limits.

## External MCP

`molis-work-mcp` is the sole external MCP entrypoint: platform connection tools plus each user-granted action. For plugin authoring order and elements see [molis-plugin-dev Skill](../skills/molis-plugin-dev/SKILL.md); for external MCP authoring see [Plugin development · External MCP](platform/PLUGIN-DEVELOPMENT.md#对外-mcp); for the Runtime protocol see [MCP Integration](mcp.en.md).

### Call chain

```text
molis-work-mcp
  apps/desktop/launchers/mcp/server.ts     Process entry
  apps/local-host/src/mcp-server.ts        Composition, live discovery, catalog-entry dispatch
  apps/local-host/src/mcp-catalog.ts       Platform tools + granted, available actions
  apps/local-host/src/mcp-settings-store.ts  {home}/config/mcp-tools.json (action grants only)
  apps/local-host/src/mcp-authority.ts     Shared list/call authority gate
  apps/local-host/src/action-gateway.ts    Actions -> resident Web Host
  apps/mcp                                 Platform schemas, protocol, connection tools, management dispatch
```

Every `tools/list` and `tools/call` reads the current catalog and grants so connected clients see changes immediately (no proactive `tools/list_changed`). When the production launcher has an explicit Runtime Home, actions come from that Home's resident service; if offline, only connection tools remain.

| `source` | Dispatched to |
| --- | --- |
| `action` | Shared `ActionClient`; production stdio forwards over the local channel to the resident Host registry and execution queue. Runtime writes record the session as audit author. |
| `platform` (connection tool) | Runtime-context handlers in `apps/mcp` |
| `platform` (management entry) | `dispatchMcpProjectTool` after Host injects identity |

- **Adding capabilities**: Declare actions and handlers in the plugin Manifest with `"mcp"` in `audiences`; once registered through SDK/Runtime they appear in **Capabilities → External access** automatically, with no separate MCP table.
- **Grants & settings**: Per-client grants live in `mcp-settings-store.ts` and are managed under **Capabilities → External access**.
- `agent.mcp` is the reverse direction (in-plugin Agents calling external MCP servers); do not reuse it here.

## Frontend and the control catalog

When changing the workbench, plugins, or shared controls, **visuals, motion, icons, and color are part of the slice**, not follow-up polish. Passing typecheck and tests is not completion. See [ui-craft-floor](../specs/ui-craft-floor/spec.md) and [DESIGN.md](../DESIGN.md) (Soft Workbench).

Hard rules:

- **Never ship OS native controls as product UI.** Native dropdowns, color pickers, date/time popups, `alert`/`confirm`/`prompt`, and unskinned `range` inputs are forbidden. Use `mw-menu` (hiding native `<select>` only for form submission), `mw-btn` for file triggers, and `mw-*` styling on `<dialog>` (keeping only Escape and focus ring). See [mw-select-custom-menu](../specs/archive/mw-select-custom-menu/spec.md).
- **Consistent icons and semantic color.** Action icons come from Lucide using surface ink (`--ink-soft` / `--ink`). Plugins carry no identity color (`--plugin-tint` stays neutral). Ink blue `--action` is for primary actions and active selection; mist blue `--accent` is for focus, links, and in-progress; status uses the status family. All colors, radii, heights, and durations come only from baseline tokens in `packages/design-system/resources/`—no hardcoded hex, no `!important`, and no per-plugin overrides.
- **Coherent motion.** Use only `--dur-*` (130 / 250 / 420 ms), `--ease-quint`, `--ease-spring`, and shared transitions (`craft-rise`, etc.). Respect `prefers-reduced-motion`.
- **Keyboard focus** uses only `--focus-stroke` (2 px mist blue, 1 px offset); inputs use mist-blue border plus 3 px glow.
- **Typography and hierarchy.** System font stack with weights 400 / 500 / 600 only (`--weight-body`, `--weight-control`, `--weight-title`), one continuous white work surface, no plugin outer frame cards, shadows only on elevated surfaces.

Before editing shared controls, states, or micro-interactions, open `/__ui/catalog` (`pnpm web` → `http://127.0.0.1:4173/__ui/catalog`; real bottom bar at `/__ui/catalog/bar`). One-off drafts may start in feature code, **but must migrate to `mw-*` before landing—never merge OS native controls**. Shared controls, state variants, or micro-interactions that meet the product bar **must** be added to the `packages/design-system` catalog. See [design-system README](../packages/design-system/README.md) and [UI Platform](platform/UI-PLATFORM.md).

## Development verification

Choose commands for the affected scope; this is not a checklist to run in full. Incremental and clean builds and machine scheduling are covered in [Parallel development, section 5](system/PARALLEL-DEVELOPMENT.md#5-构建与浏览器用例排时段). Sections 6–8 cover targeted versus full regression, where to run it, and baseline comparisons; section 5.1 states the limits for the current work session.

### Command reference

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
pnpm --filter @molis-ai/molis-work-plugin-goals typecheck
pnpm --filter @molis-ai/molis-work-plugin-goals build
pnpm --filter @molis-ai/molis-work-plugin-runtime typecheck
pnpm --filter @molis-ai/molis-work-integration-github typecheck
```

`workspace:check` validates only the F2 package inventory. `boundary:check` scans real imports, dependency direction, Contract entrypoints, and cycles. `workspace:verify` is the complete package gate shared by local development and CI.

### Page asset sizes

After changing stylesheets, client scripts, plugin client bundles, `/desktop/pty-client.js`, or fonts, run `pnpm build` then `node scripts/gates/page-assets.mjs --base origin/main` (`pnpm page-assets:check` compares against `origin/main` by default). Batch 100 `100-2` ([Decision 58](../specs/post-anticorruption-roadmap/reference/decisions.md#decision-58)) retired per-task `tooling/gates/page-asset-allowances/*.json` files (adding new JSON files there now fails `pnpm health:check`) and replaced them with the unified route/payload budget table [`tooling/gates/page-asset-budgets.json`](../tooling/gates/page-asset-budgets.json):

- Checks route/surface total bytes across `workbench`, `arrival`, `settings`, `pluginFrame` (including `/assets/molis-work-plugin-frame.js`, `/assets/molis-work-composer.js`, `/desktop/pty-client.js`), `pluginPacks` (all `/assets/molis-work-plugins/*` and `/assets/molis-work-pages-editor.js`), and `fonts`.
- Enforces `maxSingleAssetBytes` for non-font assets and `maxPluginAssetBytes` per plugin bundle; unclassified served paths fail immediately.
- Changes within budget need no per-byte allowance file. Relative to `merge-base`, budgets in `page-asset-budgets.json` may only tighten; raising a cap or removing an asset from a route requires user approval first. `--report [--json]` measures the current build and prints raw and gzip bytes per asset. See [`scripts/gates/page-assets-measure.mjs`](../scripts/gates/page-assets-measure.mjs) and the [Chinese reference](cli-and-development.md#页面资源体积).

### First-screen bytes

After `pnpm build`, run `node scripts/gates/first-screen.mjs --base origin/main`. CI runs the same HTTP sampler against an isolated temporary Home and fixed project seed, checking cold/warm real bytes for `arrival-empty`, `chooser`, `workbench-default`, and `workbench-all-plugins` in [`tooling/gates/first-screen.json`](../tooling/gates/first-screen.json) against the `firstScreen` limits in [`tooling/gates/page-asset-budgets.json`](../tooling/gates/page-asset-budgets.json) (`workbench-demo` is report-only). Any error status, truncated response, or SSE first-event timeout fails, and caps may only tighten relative to `merge-base`.

Before starting a batch, run a browser audit to catch unrecorded GETs or missing paths:

```sh
node scripts/machine-slot.mjs run browser --label 'first-screen audit' -- node scripts/first-screen-report.mjs --runs 1 --pages arrival-empty,chooser,workbench-default,workbench-all-plugins,workbench-demo
```

### Secret scanning before push

Scan for secrets before pushing: run `git fetch origin main`, then `pnpm secrets:check`. It reads every commit of your branch since its merge base with `origin/main` (`scripts/check-secrets.mjs`) and looks for OpenAI/Anthropic keys (`sk-…`, `sk-ant-…`), GitHub tokens (`ghp_…`, `github_pat_…`), Slack tokens, AWS access keys (`AKIA…`), Google API keys (`AIza…`), private key blocks, JWTs, and quoted literals of 12 or more mixed letters and digits assigned to a name that ends in `api_key`, `secret`, `password` or `token` (references, `${…}`, placeholders and URLs do not count). Names also include `secretKey`, `private_key`, `aws_secret_access_key` and `clientKey`, that is a key preceded by secret, private, access, client, auth, signing or encryption (a bare `key` does not count), and a type annotation may sit between the name and the `=` (`const apiKey: string = "…"`). Files whose names git quotes in diff headers (a quote, backslash or control character) are scanned too, and control characters in a file name are escaped in the log. The diff is read with external diff drivers, textconv and `diff.noprefix` switched off, so a local git configuration cannot change what the scan sees. A hit prints the file, line, rule and the first four characters of the value, never the whole value. The CI Secret scan job runs the same command with full history (a pull request against its base branch, a push to main against the tip before the push) and `Verify` waits for it. The rules themselves are tested by `tests/secret-scan.test.ts`, which the Package boundaries job runs.

- A real credential: deleting it in a later commit is not enough because it is already in the history. Remove it from every commit with a rebase or squash, then rotate the key. Secrets live in the Home's secret store or the environment, and code carries only a reference.
- Test data that is already on main: add the exact value (or a `/regex/` anchored with `^…$`) with a reason to `tooling/gates/secret-allowlist.txt`, one entry per line as `<value>  # reason`. A line without a reason makes the scan exit with an error. Do not loosen the rules to get a pass.
- `node scripts/check-secrets.mjs --all` audits the whole tree and `--base <ref>` changes the base. It does not read unquoted YAML values, binary files, or passwords with no recognizable shape.

### Release artifact verification

The Desktop payload contains root dist, production workspace dependencies, Runtime Skill, Node and vendor provenance/license assets, not a second business implementation. For npm, use `pnpm package:npm`: it builds the workspace and invokes Local Host tooling to stage `release/npm/*.tgz`. Pass an absolute output directory as its argument when needed. Direct npm/pnpm pack at the source root prints this command instead of producing an uninstallable workspace:* archive.

The npm archive bundles required workspace and vendor JavaScript packages using their declared files. Consumers install registry dependencies normally, including target-platform PTY binaries; Node itself is not bundled and Node 24.15.x is required: project libraries use the SQLite that comes with it, and on another Node every plugin statement is refused, which the service says at start. In a new consumer directory run `npm install /absolute/archive.tgz` without skipping install scripts, then run `node tests/npm-distribution-smoke.mjs /absolute/consumer` from this repository. This checks the actual CLI, SQLite persistence, PTY, planning assets, Home installation and source-independent MCP handshake. The smoke script targets a Unix host; passing locally does not certify other platforms.

That sentence describes the current release; DV4's full release acceptance in a clean environment is still pending.

## Account environment startup

Use the locked official standalone Node `24.15.x` (`.nvmrc` `24.15.0`) and `pnpm@11.9.0`, then run `pnpm install --frozen-lockfile` and `pnpm build`. Copy any needed templates from `secrets.example/` into the ignored `secrets/` directory (the current account client needs no provider secret).

| Command | Auth | Work | Home |
| --- | --- | --- | --- |
| `pnpm start --env dev` | `http://127.0.0.1:8787` | `http://127.0.0.1:4207` | `~/.molis-work-environments/dev` |
| `pnpm start --env test` | `https://auth.test.molis.ai` | `http://127.0.0.1:4207` | `~/.molis-work-environments/test` |

Startup verifies the Node version and terminal build tooling (`--strict-native` aborts on missing native tools). Pass `--desktop` to launch the Desktop shell attached to the same authenticated Host (stop any previous Work instance first).

### Local login testing (dev)

Start the V2 Auth service in `dev` mode per the Auth repository deployment guide (`npm start -- --env dev`), then run `pnpm start --env dev` in Work and open `http://127.0.0.1:4207`. Installed builds register `http://127.0.0.1:4173/account/callback`, while source dev registers `http://127.0.0.1:4207/account/callback`.

Test-channel installs appear as Molis Work Test (`com.molis.work.test`) using `~/.molis-work-environments/installed-test`. `pnpm start --env test` runs on port `4207`, connecting login to `https://auth.test.molis.ai` and sync to `https://work.test.molis.ai`. When `syncOrigin` is empty, cloud sync is unavailable (`dev` may point to a local sync worker at `http://127.0.0.1:8788`).

### Test file typecheck inventory

`pnpm typecheck:tests` runs strict `noEmit` typechecking across all test files and type dependencies. It currently exits non-zero due to pre-existing test debt and is tracked separately from mandatory CI gates (see [D0069 record](reviews/daily-quality/2026-11-08-test-types.md)).
