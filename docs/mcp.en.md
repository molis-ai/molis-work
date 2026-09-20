# MCP Integration

Molis Work connects projects through the unified Skill. The Runtime consumes the public status, project identity and connection returned by `molis_work_v1_context_resolve`; it does not inspect the catalog/database or infer a project from a repository name. A bound Session or one exact, verified workspace membership can recover read-only; a suggestion alone does not authorize binding.

## Runtime work-entry binding (recommended)

The Runtime host only provides a Session ID when it can guarantee stability; it is not a Git URL, directory name, repository structure, or a string inferred from conversation. Molis Work supports any MCP Runtime providing a Session ID in `_meta.threadId`, `_meta.sessionId`, or `_meta["molis-work/sessionId"]` on each `tools/call`, and also supports stable environment signals from adapters like Claude Code; ordinary tool arguments are never treated as host identity. When the same long-lived MCP process receives a different Session ID, it clears the previous Session's connection. Without a Session ID, Molis Work can still use the canonical workspace to find historical candidates, but never pretends a directory or MCP process is a Session. One workspace can associate multiple `project_id`s; a normal selection does not set a default automatically.

The install itself never writes Runtime configuration. Codex and Claude Code should use the stable launcher after the user confirms the integration preview; other Runtime hosts can explicitly provide the same set of environment values:

```bash
MOLIS_WORK_HOME="$HOME/.molis-work" \
MOLIS_WORK_RUNTIME_ID="<runtime-id>" \
MOLIS_WORK_WORK_CONTEXT_ID="<host-provided stable work-entry ID>" \
MOLIS_WORK_WORK_CONTEXT_STABLE="true" \
MOLIS_WORK_WEB_URL="http://127.0.0.1:4173" \
MOLIS_WORK_MCP_AUDIENCE="runtime" \
"$HOME/.molis-work/bin/molis-work-mcp"
```

This MCP process starts "not connected to a project" and opens no Board. The unified Skill calls `molis_work_v1_context_resolve` first:

> **Host identity**: Molis Work reads per-call `_meta["molis-work/sessionId"]`, `_meta.threadId`, then `_meta.sessionId` before falling back to the host's startup identity. Availability is host-dependent; do not assume every Runtime version supplies these fields. Without a Session signal, one exact verified workspace membership may still recover read-only; otherwise follow the returned suggested/unbound state.

- `bound`: returns one project and a fixed connection. Later ordinary calls omit `board_id` and actor fields; Host injects them from that connection and Session. Calls for a particular Goal still provide `goal_id` explicitly.
- `suggested`: the new Session has workspace history or other host clues. The result contains only candidate projects and generic reasons that don't leak the original path, with no project connection. If the current user message already explicitly asks to use Molis Work with a named project and exactly one returned existing project unambiguously matches it, the Skill calls `context_bind` directly; otherwise it shows the candidates and asks.
- `unbound`: returns `missing_stable_context` or `unknown_context` and connects to no project. The Skill likewise reuses an explicit current-message selection of one unambiguous existing project; otherwise it shows the project list and asks the user to select or create one.
- When the user explicitly rejects a `suggested` candidate, the Skill calls `molis_work_v1_context_reject_suggestion` with `user_confirmed=true`. It only stops suggesting that candidate in this Session, then may return another candidate or an explicit project list/create path; it never unbinds, deletes, or affects other Sessions.
- After the user explicitly selects an existing project, call `molis_work_v1_context_bind` with `user_confirmed=true`. A stable Session may use `binding_scope=session`; workspace membership records association, not a directory default. Switching an existing binding also needs explicit switch authority and `rebind_confirmed=true`. Do not send the removed `workspace_default` option.
- After the user explicitly asks to create a named project in the current conversation, the Skill calls `molis_work_v1_context_create_and_bind` with `user_confirmed=true`, the project name, and an idempotency key. It creates the project DB and binds it only under `~/.molis-work`; a failure leaves no orphan project.
- When the user asks to view projects, the Skill calls `molis_work_v1_context_list_projects`; it doesn't expose database paths and changes nothing.
- When the user explicitly asks to unbind only the current work entry, the Skill calls `molis_work_v1_context_unbind` with `user_confirmed=true`. It doesn't delete the project, DB, or other Runtimes' bindings.
- Deleting a project and its DB is a separate confirmation: after the user names the project and confirms deletion, the Skill calls `molis_work_v1_project_delete` with `delete_confirmed=true` and an idempotency key. It refuses while the project has a valid Claim or unfinished Run; on success it returns a deletion receipt and the Runtime can no longer use the old connection.

Web is an optional viewing and user-confirmation surface, not a prerequisite for project connection or Goal work. Browsing does not bind the Runtime. Project Settings manages Session associations and workspace memberships, not directory defaults. Project creation, Runtime configuration, unlinking and deletion each retain their own authorization.

## Current tools

Names below omit `molis_work_v1_`. The current MCP schema defines each tool's actual input.

| Purpose | Runtime tools |
| --- | --- |
| Project connection | `context_resolve`, `context_list_projects`, `context_reject_suggestion`, `context_bind`, `context_unbind`, `context_create_and_bind`, `project_delete` |
| Discovery, creation, and state | `goal_list`, `goal_intent_create`, `goal_state` |
| Everyday records and history | `event_note`, `event_configure`, `event_report`, `event_progress`, `event_list`, `event_read` |
| Agreements, decisions, and closure | `event_concern`, `event_decision_request`, `event_cite_decision`, `event_agree`, `event_close`, `event_resume` |
| Structure proposals | `goal_tree_propose`, `goal_tree_read`, `goal_tree_check` |
| Optional planning | `planning_methods`, `planning_method_save`, `planning_analyze_change`, `planning_graph_check` |
| Project guidance | `project_guidance_get`, `project_guidance_add`, `project_guidance_update` |
| Trash and restore | `goal_trash`, `goal_trash_list`, `goal_restore` |
| Judgment functions | `functions_list`, `functions_describe`, `functions_invoke` |

The only outbound process is `molis-work-mcp`. Platform tools (connection / Goals / events) keep their schema in this package. Plugins register local `tool_id`s on Manifest `mcp_exports`; Host stamps `molis_work_v1_<plugin>_<tool>` and composes the catalog. Functions stays on by default. Forms / Dataset / PPT are registered, off by default, and need a bound project. `agent.mcp` is the opposite direction (a plugin Agent calling external MCP). Plugin authors and Host changes: [Plugin development](platform/PLUGIN-DEVELOPMENT.md#对外-mcp) and [CLI and development](cli-and-development.md#对外-mcp) (Chinese).

Ordinary Runtime tools reject overrides for `board_id`, database paths, Web URLs, or `actor_id` / `actor_kind` / `runtime_actor_id`, even when the supplied value matches the current connection. Trash tools also use finite top-level fields rather than the old `payload` envelope. Project-selection tools and `project_delete` retain their own explicit project and confirmation arguments; those confirmations cannot authorize agreement or tree changes.

The shortest work path is `goal_intent_create` → `event_note`, with no type or plan required. Use `event_configure` / `event_report` for structured results. A report can contain multiple facts and progress; the whole batch must be valid, and the receipt includes current state, gaps, and cursors. `event_close` closes explicitly, and only `completion_applied=true` establishes completion. `event_resume` requires a reason to continue completed or cancelled work. Ordinary notes and unrelated reports do not reopen it automatically. Valid counterevidence may invalidate the effect of an earlier completion while preserving its history.

`event_decide` and `goal_tree_decide` belong to protected user Web/management entries, not Runtime. The Runtime can propose concrete changes and request or cite saved valid decisions; user identities, confirmation text, and Session fields supplied by the Runtime cannot approve its own proposal. Existing authorization does not require another decision while its exact scope remains valid.

Trusted management entries use `MOLIS_WORK_MCP_AUDIENCE=management`, which additionally retains `initialize`, `import_v3`, `snapshot`, `event_decide`, `goal_tree_decide`, and `active_goal`. Management calls follow their explicit project and identity schemas. Never hand management MCP to an autonomous Runtime. V3 import preserves original fields, relations, coverage, and source. Imported Goals immediately support current state and notes without invented acceptance commitments.

Old Claim/select/Run/Evidence/Review, draft dialogue, Contract/Candidate/Dependency/Rewire writes, and Available/Ready/Contract/Explain work entries are retired. Management does not make those old names executable. Historical records remain readable; everyday work uses the current event path.

If the service is unavailable, report the failure without switching databases, rewriting URLs or falling back to CLI. `mcp.context_refresh_required` asks for read-only resolution: retry unchanged with the same idempotency key only after `bound`; otherwise follow project selection. An older-reader version error is different from a connection-cache refresh and follows its returned diagnosis. See the complete [Runtime Skill](../skills/goal-advance/SKILL.md).
