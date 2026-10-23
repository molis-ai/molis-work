# PG-002 facts (② survey, 2026-10-19, on #776 branch a2ba016f9)

Read-only survey for the optional-permission switch in settings. Not a plan yet.

## Runtime grants
- One API changes grants: `PluginRuntime.grant(installId, permissions[])`, `packages/plugin-runtime/src/index.ts:368-380`, contract `packages/contracts/src/platform/plugin.ts:510`.
  - It refuses a running plugin (`state_invalid`). The caller must stop, grant and start again, the way `tests/bundled-plugin-grants.test.ts:92-97` does.
  - It refuses permissions the Manifest does not declare (`plugin.grant_denied`, `install-rules.ts:103-110`). It does not refuse dropping a required one: that only fails at the next start (`runtime-rules.ts:30-37`). A bundled plugin's required permissions come back at its next start (`install-rules.ts:120-123`).
  - It is synchronous and not under `runLocked` (`index.ts:690`).
- Where grants are stored: `plugin_runtime_installs.record_json.grants`, in the project database or the Home plugin store.
- How "the person switched it off" is recorded (#741): no flag. It is inferred from the held grants lacking an optional permission that the record's build declared (`bundledGrants`, `install-rules.ts:42-48`). `declared_before` is read from the archive row (`supervisor-releases.ts:24-31`).
- Effect of a stop:
  - `revokeContext` runs (`index.ts:709-714`). The activation context's grants are a snapshot taken at start (`activation-context.ts:8`).
  - In-flight calls fail through kernel `assertCurrent` (`action-service.ts:115-122`): provider token or availability.
  - Local-user `validate_authority` re-reads the install row (`local-web-actions.ts:44-62`).
- Stopping a Home plugin without `preserve_enabled` leaves it `disabled`, and `home-plugins.ts:166-168` keeps it off after a Host restart. A crash between stop and start leaves it off.

## Supervisors and routes
- Project platform: `project-plugins.ts:55`, accessors at `:58-61` and `:88`. Home: `localHost.homePlugins.ready()`, `home-plugins.ts:33,48-50,66-74`. Installed/sandbox: `installed-plugin-host.ts:202`.
- No route or action reads or changes grants today. The only `runtime.grant` caller in apps is `official-integrations.ts:67`.
- Membership routes: `web-project-settings.ts:21-70`. Per-plugin operations: `plugin-route-operations.ts:41-70`.

## Settings UI
- Sections: `HOST_SECTIONS`, `apps/workbench/src/settings-sections.ts:27-39`. Plugin pages: `:42-60`. Capability sections: `plugin-settings-catalog.ts:8`.
- Closest analogue, 对外接入: `mcp-access.ts:26-49` → `scripts/mcp-access.ts:35,59` → `web-mcp-action-settings.ts:19-100`. It uses plain routes.
- Gateway pattern: `web-project-platform-routes.ts:74` (`projectSettingsCapabilities.selectBrowsingWorkspace`, audiences user, permission `projects:settings`).
- The Manifest permission has only `reason` as human text (`plugin.ts:144-153`). There are no labels.

## Security rows
- S-15 (`SECURITY-INVARIANTS.md:29`) says the settings switch is the next slice. S-34 (always_on) is pending design. No row says who may change grants. The highest S number on main is S-40, so a new row takes S-41 or whatever is next free.

## Docs
- POLICY §7.8 (around line 180): stop first, then grant; actions become `actions.plugin_permission`.
- anti-corruption spec :1002 (10-18): "可选的都能在设置里关；内置插件装上时可选项默认勾上".
- privileges.md:103 puts PG-002 in stage 2. PG-003 (`:127`) and PG-005 (`:129`) are related. §5 (`:328-337`) items 1 and 3 must be asked.

## Likely questions for the user (batch for AskUserQuestion)
1. Who may change a plugin's grants: only the local person (user-only action, never MCP or Agent)? Recommended.
2. Should the switch stop and restart a running plugin automatically, or ask first?
3. Should a required permission be listed but locked?
