# CLI & Development

## Offline Home snapshots

`molis-work home snapshot --to /absolute/path/new-directory --home /original/Home --json` captures an existing Home. If `--home` is omitted, normal product Home resolution applies. `--to` is required: the destination must not exist, its parent must exist, and neither the destination nor the Home may contain the other. Duplicate, unknown or incomplete arguments are rejected. Success writes JSON to stdout, or the path and counts without `--json`; failure writes only to stderr and exits with code 1.

Stop every Web/Desktop/Agent process using that Home before running the command. It acquires the same storage ownership as Host/Agent; it neither starts a business Host nor pauses an online one. A busy Home produces no snapshot output. The store inventory comes from `homeStores()`, including actual installed-plugin databases and project partitions. SQLite uses the backup API, including the latest committed WAL; sidecars and ownership locks are excluded. Unknown entries, wrong versions, corrupt databases, links or unfinished maintenance reject the entire snapshot.

The snapshot is limited to the same machine, original canonical Home path and original keys. SDK, build-run and retired-session keys are recorded only as references and identity digests; Home master keys and Keychain contents are not exported. Managed CLI `.home` state and directory bookmarks inside the Home are sealed by their existing owners. This is not a key backup. Browser login state is excluded, so sign in again after recovery; select directories again if the system rejects their original bookmarks. External AppData is not read. Retain or reinstall managed programs and rebuildable caches. Ordinary files are streamed; each vault, bookmark or other file processed as a whole by its owner is limited to 32 MiB. CLI private state also follows its owner's limits of 10,000 nodes, 32 MiB of plaintext and 128 MiB of ciphertext.

Output uses a private sibling staging directory with mode 0700 and files with mode 0600. The manifest records original modes, versions, integrity data, digests and dependencies. Validation and flushing finish before publishing to a new directory; existing destinations are never overwritten. Ordinary failures and SIGINT/SIGTERM remove this operation's unpublished staging directory. A forced termination may leave `.molis-home-snapshot-*`: remove it only after confirming that its process has exited, it is in this operation's destination parent, and it was not published. If the command reports that publication succeeded but durability is unconfirmed, retain the reported destination and inspect its manifest and payload rather than overwriting it as an empty result.

The original SDK reader validates every ciphertext record kind and page using the original Home's key, including valid empty bodies and tombstones that retain ciphertext. Metadata-only stores and ordinary checkpoints do not require or create a key. Managed CLI recovery still requires the original installation identity and actual program at the original path; this command does not reinstall over the network or create a replacement installation.

Run `molis-work home restore --from <snapshot-directory> [--home <original-Home>] [--json]` in the same offline window to restore to the original Home using its original keys. Preflight checks the manifest, payload digests, owner versions, Memory eligibility and target stores before moving originals. The result reports `originals_directory` when it replaces data and `unchanged` when no business writes are needed. If an interrupted restore blocks normal startup, use `molis-work home restore --recover`. It rolls back an uncommitted operation, finishes a committed one, or returns `no_recovery` when nothing is pending. Choose exactly one of `--from` and `--recover`. The real-Home backup and rebuild remains tracked in BL-928.

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
init | snapshot | active-goal
goal-tree-propose | goal-tree-read | goal-tree-check | goal-tree-decide
```

Each v1 command above needs `--db PATH` to name the project database. There is no default path: without it (no value, a blank one, or another `--` flag straight after `--db`) the command fails rather than guess a database from the working directory (`init` included; it creates the database at `PATH`). A relative `PATH` is the one you name; it is resolved against the working directory. Complex inputs can be passed with `--json` or `--file payload.json`. Old create-goal, Claim/Run, Evidence/Review, and Contract/Candidate/Rewire commands are retired and return an unknown-operation error. Everyday notes, reports, agreements, closure, and resume use MCP or Web; CLI does not provide duplicate event-write commands. Each v1 command calls one Goals action (`goals.board.initialize`, `goals.snapshot.read`, `goals.active.set`, `goals.tree.submit`, `.read`, `.check`, `.decide`) as a caller the Host builds: the person on this machine, origin `management`, with only that one action's own permissions; a command's input and output are unchanged (one exception, S8: `init` no longer takes a `title`, the project's name lives only in the project directory, and the board in `snapshot` no longer carries a `title`), and its JSON must carry the `project_id` the command is bound to, otherwise `actions.scope_mismatch`. CLI is a user/management and local debugging entry, not a fallback for Runtime service failures. `init`, `goal-tree-propose`, `goal-tree-check`, `active-goal` and `goal-tree-decide` write as the person on this machine and their arguments carry no identity: `goal-tree-propose` and `goal-tree-check` refuse an `actor_id` or `actor_kind` in their arguments (`actions.input_invalid`), and `goal-tree-propose` refuses `submitted_session_id` too (there is no Runtime Session behind this door), and `goal-tree-decide` refuses `actor_id`, `actor_kind`, `audit_actor_id` and `runtime_actor_id` the same way (the person on this machine decides and no Runtime relays it; the `authority` only carries the conversation reference, `conversation_ref` and `message_ref`, and an `actor_id`, `actor_kind` or `authority_source` in it is refused too), and `active-goal` no longer reads `actor_id` from the JSON, so an old script that still writes the field is not taken for someone else.

`molis-work demo remove --confirm` asks the resident service of this Home first. When it answers, its deletion service does the removal (it refuses while a terminal of the project is still open, as the settings page does, and records the person on this machine); the address is the `MOLIS_WORK_WEB_URL` environment variable, or `http://127.0.0.1:4173` without it. Only when the Home has no control token, or nothing answers at that address, does the command delete in its own process. If the answer comes from another Home's service, or a terminal is still open, the command exits with an error and leaves the demo as it was. `molis-work uninstall` stops the resident service first and then clears the demo in its own process.

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
apps/desktop/                AP4 Desktop shell, panels, Capsule, and Tauri native adapter
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

## Frontend and the control catalog

When changing the workbench, plugin lists, forms, or shared controls, **prefer** opening `/__ui/catalog` and matching an existing specimen before inventing another look. This is not a gate: one-off pages, drafts, and unstable experiments can stay in product UI first.

The visual spec is the Soft Workbench in [DESIGN.md](../DESIGN.md): a pearl desk holding one continuous white work surface, graphite for the primary action and a selected choice, copper for focus, links and work in progress, weights 400 / 500 / 600, motion around 130 / 250 / 420 ms. Take colours, corners, heights and durations from the shared tokens in `packages/design-system/src/palette.ts`; do not hard-code hex values or win over an earlier layer with `!important` or per-plugin overrides. Plugins carry no identity colour, draw no card of their own inside the surface, and have no global sidebar: global entries live in the bottom bar (the Dock and the plugin switcher), and the `navigator` slot id keeps its name. The real bottom bar is at `/__ui/catalog/bar`.

Once a shared control, state variant, or micro-interaction meets the product’s visual bar, **add it** to that board (Catalog specimens in `packages/design-system`) so later work can see and reuse it. Product-specific composition does not need a specimen. Usage and isolated preview: [design-system README](../packages/design-system/README.md). Platform split: [UI Platform](platform/UI-PLATFORM.md).

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

After building with `pnpm workspace:build`, run `node scripts/gates/page-assets.mjs --base origin/main`. The gate compares actual Host-served bytes at the merge-base and candidate. Shrinking needs no committed budget edit; future comparisons start from the smaller actual size. `--report [--json]` only measures the current build.

Necessary growth is reviewed in a separate task JSON under `tooling/gates/page-asset-allowances/`, with `reason`, `review`, and an `assets` map of permitted byte increases. New assets or growth over 10,000 bytes require the user's prior approval recorded in `userApproval`. Only files absent from the comparison base count; adopted allowances cannot be edited, removed or reused. A merge group sums its new allowances. Do not copy an old approval as a new one.

The base measurement may come from a successful main-push or merge-queue CI artifact for the exact commit, collector and toolchain. Missing or invalid artifacts trigger an isolated base install/build/measurement; failure is never a pass and temporary checkouts are cleaned on success, failure and cancellation. This adds a build on a cold baseline. The candidate is always measured from its own build. See the [complete procedure and transition instructions](cli-and-development.md#页面资源体积).

### Secret scanning before push

Scan for secrets before pushing: run `git fetch origin main`, then `pnpm secrets:check`. It reads every commit of your branch since its merge base with `origin/main` (`scripts/check-secrets.mjs`) and looks for OpenAI/Anthropic keys (`sk-…`, `sk-ant-…`), GitHub tokens (`ghp_…`, `github_pat_…`), Slack tokens, AWS access keys (`AKIA…`), Google API keys (`AIza…`), private key blocks, JWTs, and quoted literals of 12 or more mixed letters and digits assigned to a name that ends in `api_key`, `secret`, `password` or `token` (references, `${…}`, placeholders and URLs do not count). Names also include `secretKey`, `private_key`, `aws_secret_access_key` and `clientKey`, that is a key preceded by secret, private, access, client, auth, signing or encryption (a bare `key` does not count), and a type annotation may sit between the name and the `=` (`const apiKey: string = "…"`). Files whose names git quotes in diff headers (a quote, backslash or control character) are scanned too, and control characters in a file name are escaped in the log. The diff is read with external diff drivers, textconv and `diff.noprefix` switched off, so a local git configuration cannot change what the scan sees. A hit prints the file, line, rule and the first four characters of the value, never the whole value. The CI Secret scan job runs the same command with full history (a pull request against its base branch, a push to main against the tip before the push) and `Verify` waits for it. The rules themselves are tested by `tests/secret-scan.test.ts`, which the Package boundaries job runs.

- A real credential: deleting it in a later commit is not enough because it is already in the history. Remove it from every commit with a rebase or squash, then rotate the key. Secrets live in the Home's secret store or the environment, and code carries only a reference.
- Test data that is already on main: add the exact value (or a `/regex/` anchored with `^…$`) with a reason to `tooling/gates/secret-allowlist.txt`, one entry per line as `<value>  # reason`. A line without a reason makes the scan exit with an error. Do not loosen the rules to get a pass.
- `node scripts/check-secrets.mjs --all` audits the whole tree and `--base <ref>` changes the base. It does not read unquoted YAML values, binary files, or passwords with no recognizable shape.

### Release artifact verification

The Desktop payload contains root dist, production workspace dependencies, Runtime Skill, Node and vendor provenance/license assets, not a second business implementation. For npm, use `pnpm package:npm`: it builds the workspace and invokes Local Host tooling to stage `release/npm/*.tgz`. Pass an absolute output directory as its argument when needed. Direct npm/pnpm pack at the source root prints this command instead of producing an uninstallable workspace:* archive.

The npm archive bundles required workspace and vendor JavaScript packages using their declared files. Consumers install registry dependencies normally, including target-platform SQLite/PTY binaries; Node itself is not bundled and Node 24+ is required. In a new consumer directory run `npm install /absolute/archive.tgz` without skipping install scripts, then run `node tests/npm-distribution-smoke.mjs /absolute/consumer` from this repository. This checks the actual CLI, SQLite persistence, PTY, planning assets, Home installation and source-independent MCP handshake. The smoke script targets a Unix host; passing locally does not certify other platforms.

That sentence describes the current release; DV4's full release acceptance in a clean environment is still pending.
