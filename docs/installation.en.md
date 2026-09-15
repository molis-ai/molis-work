# Install & Maintenance (Molis Work)

> Detailed install, update, startup, uninstall, and demo-data notes. For the quick start, see "Try it in 3 minutes" in the [README](../README.md).

## macOS Desktop installer

Installer implementations belong to Local Host. Clean and rebuild all workspace packages before installing from source; stale builds are rejected without replacing the existing installation. Current distribution checks, real App upgrade/recovery and independent npm-consumer evidence are collected in the [DV4 validation report](../specs/molis-work-architecture-reorganization/dv4-validation.md). Internal validation on this Mac does not certify Apple notarization, Intel hardware or public-release readiness.

For macOS, download the `macos-arm64` (Apple Silicon) or `macos-x64` (Intel) DMG from [GitHub Releases](https://github.com/molis-ai/molis-work/releases), drag Molis Work into Applications, and launch it. The App contains architecture-matched Node, Molis Work Core, and production dependencies. On first launch it calls the same `molis-work install` service to populate `~/.molis-work`, then starts the local Web service. It does not create a project, connect a Runtime, create demo data, or edit a user project.

Repository development provides the same release path:

```bash
pnpm desktop:build:macos    # DMG, App zip, and SHA256 under release/macos
pnpm desktop:install:macos  # install in ~/Applications; trash previous Molis Work and owned GoalBoard.app first
pnpm desktop:start:macos    # launch the installed App
```

For automation or acceptance checks, set `MOLIS_WORK_SKIP_OPEN=1` to install without opening a window. `MOLIS_WORK_APP_DIR` can point the script at another user-level Applications directory.

The build downloads a fixed Node LTS release and verifies it against Node's official `SHASUMS256.txt` before creating the payload. Apple Silicon and Intel are built separately so native addons are never mixed into a fake universal package. Without an explicit `APPLE_SIGNING_IDENTITY`, the script sets `-` for internal ad-hoc signing, preventing Tauri from selecting an unrelated local development certificate. An explicit identity is preserved. The script verifies App signature integrity and reports the artifact's actual signature. This is not proof of Apple notarization or Gatekeeper approval; quarantine is never removed automatically.

The [release workflow](../.github/workflows/release-macos.yml) is currently manual-only; automatic tag triggers are paused. Restoring automatic `v*` releases requires a separate trigger change and all Apple Secrets. Existing public-release conditions require Developer ID signing and Apple notarization. This reorganization neither changes triggers nor uploads artifacts, and internal verification does not establish public release readiness.

## Install boundaries

To distribute an npm archive, run `pnpm package:npm` in the repository and take the artifact from `release/npm/`. Consumers run `npm install /absolute/adeptify-molis-work-VERSION.tgz` in their own directory, then `npx --no-install molis-work --help` or `npx --no-install molis-work install`. This path requires Node 24+ and normal target-platform native dependency installation; do not use `--ignore-scripts`. No source checkout or separately published private workspace packages are needed. Installing the npm package does not start services or connect a Runtime; the explicit `molis-work install` command maintains the Home described below.

`molis-work install` only maintains `~/.molis-work`: the versioned program, shared Skill, MCP/Web/CLI launchers, project DB root, logs, and install manifest. It never creates or starts projects, never writes into user projects, and never modifies any Runtime user-level configuration. Registering the MCP entry into a Runtime later requires the user-confirmed Runtime integration flow.

For local installs from the repository use `pnpm install:local`; this single entry point rebuilds first, then installs the current content. If you point `molis-work install --source ...` directly at a repository containing `src/`, the installer checks the build fingerprint and stops if source and `dist` disagree instead of silently copying a stale build. The release also records a content digest: when the version is the same but program or Skill content changed, it refreshes atomically; only when the content is identical does it report "already up to date". A failed refresh restores the previous release; project data is never part of the replacement.

Projects use an immutable `project_id`; display names can be renamed or duplicated, and every project has its own `molis-work.db`. `projects/catalog.db` stores project identity, DB location, optional Session bindings, historical workspace-to-project associations, a user-set unique default project, and deletion receipts; it never copies Goal facts and never depends on Git. A normal project selection does not automatically become the directory default; a new Session sees historical candidates and asks. Only after the user explicitly sets a default does it restore automatically. Unbinding an association does not delete the project; deleting a project and its DB requires separate confirmation and is refused while valid Claims or unfinished Runs exist.

## Updating an existing install

### Offline backup and recovery boundaries

There is no general online backup command yet. Quit the App and stop the owned Molis Work service and every other writer before copying the complete Home to protected storage. Closing a window alone does not stop background writers. Keep the Catalog, project databases, Session Registry, encrypted content blobs and their keys together; copying only `.db` files is insufficient. External workspace files require their own backup.

Restore with all writers stopped, retain the damaged directory for rollback, and place the complete backup at the original absolute Home path. Then check Project records, Goal text/history, exact Artifact versions and Session content before resuming work. Catalog database paths are absolute: this is not a cross-directory or cross-machine migration procedure. Keychain or environment-supplied keys are not included in a Home copy; verify their availability separately and never replace a missing key with a fresh one.

The [production-path recovery tests](../tests/home-backup-recovery.test.ts) cover offline restore, subsequent writes and missing-key rejection. They do not certify online snapshots, cross-machine Keychain recovery or external workspace contents.

If you already installed from the repository, pull the new content first, then use the same install entry point. Even when the version number doesn't change, the installer compares the actual content and refreshes the program and Skill; user projects, Runtime configuration, and demos are never rewritten automatically:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm install:local

# Check a persistent Web service first; only install can atomically repair stale configuration
"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work" --json
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

# Restart only when the configuration is current and the process merely needs to load new content
"$HOME/.molis-work/bin/molis-work" service restart --home "$HOME/.molis-work" --confirm
```

When status returns `needs_repair`, run `service install` directly instead of trying `restart` first. Install rewrites only Molis Work-owned plist and receipt files, performs a controlled restart, and rolls back on failure; it still never takes over an unknown LaunchAgent or an external port listener.

Updating Molis Work Core never silently rewrites Runtime configuration or Skill links. Whenever a Release changes MCP behavior or `skills/goal-advance`, open Molis Work's Settings → AI & Runtimes page as a separate acceptance step. A Molis Work-managed Runtime that still targets an older Release is shown as `needs_repair`; preview the exact changes and let the user confirm the repair. A Runtime-dependent fix may be called installed only after this page returns to `connected` and the Skill link targets the current Release from the install manifest. Matching Core, App, and Web service versions do not replace this step, and unknown same-name configuration or Skills remain conflicts that must not be overwritten.

After updating MCP or the Skill, also open a new Runtime Session, because an already-running Session does not reload tools. To make the built-in demo use the new example content, run `molis-work demo reset --confirm` separately; it clears changes inside the demo but never touches user projects.

### Final-artifact acceptance after a Release

A release operator may mark a consumer-visible fix installed only after checking every applicable layer:

1. The Git tag, Release assets, and checksums come from the same commit; the App-embedded Runtime and the `~/.molis-work` install manifest report the same version.
2. The persistent service follows the action returned by `status`, reaches `running`, and has one consistent LaunchAgent, listener, and `/health` identity.
3. Every already-connected Molis Work-managed Runtime is checked in Settings → AI & Runtimes. A `needs_repair` integration must be previewed and explicitly confirmed by the current user until it becomes `connected`. This transaction updates both MCP configuration and the Skill link and rolls back on failure.
4. Close and create a new Runtime Session, then verify that it loaded the current Release's tool declaration and Skill. An old Session is never evidence for a new Release.
5. Finally, use a real project and representative data to inspect the user-visible result. Source, automated tests, package strings, version numbers, and page HTML prove only their own layers; they do not replace the final App's computed styles or end-to-end journey.

If an older Session then reports a catalog schema above its reader's supported range, the running MCP is stale; the database is not damaged. Do not roll back `catalog.db` or bypass writes through SQLite, CLI, or Web. Create or Fork a Session, confirm that messages actually have the new task focus, and perform a read-only Molis Work project resolution before any write. A host navigation success alone does not prove that the next message will land in the new task.

## Demo data

Both the CLI and Web "Settings → Projects" can create the same demo data. Preview first, then write only after explicit confirmation:

```bash
"$HOME/.molis-work/bin/molis-work" demo create
"$HOME/.molis-work/bin/molis-work" demo create --confirm
"$HOME/.molis-work/bin/molis-work" demo reset --confirm
"$HOME/.molis-work/bin/molis-work" demo remove --confirm
```

This project is clearly marked `regenerable_demo` in the catalog, separate from `user` and `migrated_user` data. Re-creating opens the existing demo; resetting clears changes inside the demo; removal and normal uninstall only clean up the regenerable demo and never touch user projects. Repository development and screenshots can still use `examples/seed-demo.mts`, which calls the same classification and rebuild logic.

## Starting Web: persistent or temporary

In a Runtime already connected to the Molis Work Skill, you can say:

> Start Molis Work

The Runtime first does a read-only `molis-work service status` check and does not guess the desired lifetime. On macOS, if no persistent service exists and the user only says “start/open Molis Work”, the Runtime presents one choice between temporary foreground use, which ends with the current terminal or Session, and login-persistent use, which installs Molis Work's owned user LaunchAgent, survives terminal closure, and starts after login. It follows the explicit choice without a repeated confirmation; before that choice it starts no Web process and writes no system configuration.

An explicit request for temporary use is already foreground-start authority, so the Runtime explains the lifetime and proceeds. An explicit request to enable login persistence is already first-install authority, so it explains the LaunchAgent effect and proceeds. Repairing an old configuration is a separate mutation: the Runtime still explains which owned configuration will be rewritten and restarted and obtains repair-specific authority. Unknown same-name services and port conflicts are never overwritten, adopted, or stopped. A service command reports success only after the reachable page belongs to the current owned instance. During an upgrade, a managed legacy process whose health payload has no PID is accepted only when its ownership receipt and plist remain valid and the LaunchAgent PID exactly matches the sole listener PID on port 4173; a different or unprovable PID remains a conflict.

“Use Molis Work to continue this project”, “advance this Goal”, and “connect or open a project/Goal” stay in the Runtime Goal flow and do not start Web. Web is never a prerequisite for connection, clarification, execution, or review. If the user accepts a contextual visualization offer while the service is absent, the Runtime uses the same one choice between temporary and login-persistent use.

For a temporary process tied to the current terminal, say directly:

> Open Molis Work temporarily

This runs the foreground `molis-work-web`; the page stops when the terminal or Runtime Session closes. Non-macOS platforms currently support only this foreground mode and never fake a system-level persistent service with `nohup` or a background shell.

### Manual startup

```bash
# Web lists browsable projects only from Molis Work's own project directory
"$HOME/.molis-work/bin/molis-work-web" --home "$HOME/.molis-work"
```

After opening `http://127.0.0.1:4173`, you can create, import, rename, and open projects in Settings, and configure Runtime integration first. Selecting a project only changes what the page browses; it does not bind or switch the current Runtime Session. Existing legacy DBs are migrated into a project only after you explicitly select and confirm. On macOS you can use the Desktop installer or run `pnpm desktop` from the repository; both are window shells over the same pages and local data.

Running `molis-work-web` directly is still foreground mode, good for temporary debugging; closing the terminal closes the page too. On macOS you can instead use the user-level LaunchAgent persistent service — preview first, then confirm:

```bash
# Preview only; writes nothing to the system
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work"

# Install and start after explicit confirmation; auto-starts at login and recovers after abnormal exit
"$HOME/.molis-work/bin/molis-work" service install --home "$HOME/.molis-work" --confirm

"$HOME/.molis-work/bin/molis-work" service status --home "$HOME/.molis-work"
```

`stop` only stops the current service and keeps login startup; `remove` stops and removes the LaunchAgent that Molis Work created and that hasn't been rewritten. Logs live in `~/.molis-work/logs/web-service.log` and `web-service.error.log`. Non-macOS platforms clearly report "not supported" and never pretend to install with a background shell. You can also run the same preview and confirmation from Web "Settings → Diagnostics".

## Safe uninstall

A normal uninstall first generates a plan and changes nothing without `--confirm`. After confirmation, it removes only what Molis Work's ownership receipt still proves it owns — Runtime integrations, LaunchAgent, launchers, and releases — and cleans up demo data explicitly marked as rebuildable. User projects, the catalog, backups, and logs are kept and remain usable after reinstall:

```bash
"$HOME/.molis-work/bin/molis-work" uninstall
"$HOME/.molis-work/bin/molis-work" uninstall --confirm
```

Permanently erasing user data is a separate operation and cannot reuse the single confirmation from a normal uninstall. The preview shows the exact home and user project count; execution requires providing both again unchanged:

```bash
"$HOME/.molis-work/bin/molis-work" uninstall --purge-user-data
"$HOME/.molis-work/bin/molis-work" uninstall --purge-user-data --confirm \
  --confirm-home "$HOME/.molis-work" --confirm-project-count N
```

If a Runtime config, Skill link, LaunchAgent, or launcher was rewritten by the user, uninstall reports the conflict and stops instead of widening the deletion scope. A failure mid-run leaves the completed steps, kept projects, and the error in `~/.molis-work/config/uninstall.json`, so you can fix the conflict, preview again, and continue.

## Next steps after install

`molis-work install` only installs the Molis Work program and prints the install location, CLI/MCP/Web launchers, and safety boundaries; automation can use `molis-work install --json`. The install never creates projects, associates Sessions, starts services, or modifies Runtime configuration.

Runtime integration is handled by the same domain service. The current adapter read-only probes Codex and Claude Code, then generates a preview containing config paths, the Molis Work MCP entry, the Skill link, backup location, and restart instructions; it writes only after the user explicitly confirms the current Runtime and plan. MCP and Skill are validated as one transaction; on failure, the original config bytes and Skill state are restored. Removal only undoes what the Molis Work ownership receipt still records as untouched by the user. Unknown same-name configs or Skills show a conflict and are never overwritten.

After the integration is confirmed, **you must open a new Codex / Claude Code Session** for it to take effect: Runtimes read MCP and Skill manifests only at Session startup, and the current conversation doesn't dynamically gain just-written tools. In the new Session you can copy "continue with Molis Work" to resume; Molis Work shows projects previously used in the current directory and asks you to confirm. If you want a project to be entered automatically in the future, you must additionally set it as the directory default. The integration preview lists every change and this resume note item by item.

Creating a project and associating the current Session are separate operations: after the user invokes the unified Skill in the current Runtime, the Skill uses `context-list-projects`, `context-bind`, or `context-create-and-bind`, and writes into Molis Work's own data directory only after the user explicitly chooses. Web can create, import, rename, and open projects, and manage already-confirmed Session and workspace associations; selecting a project in the page never changes the Runtime connection, and a new Session still asks by default unless the user explicitly set a directory default project.

Web only listens on loopback. The control token is stored in `config/web-control-token` under the Molis Work home and written into the local page; all Web API write requests must also pass same-origin Origin, control token, and one-time operation key checks. Non-local Hosts, blind third-party page submissions, missing credentials, or repeated requests are rejected before reaching the project catalog, Runtime config service, or Goal Coordinator. This browser gate does not replace the confirmation and idempotency rules in each domain flow.
