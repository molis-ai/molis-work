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

- `bound`: returns one project and a fixed connection. Later ordinary calls omit `project_id` and actor fields; Host injects them from that connection and Session. Calls for a particular Goal still provide `goal_id` explicitly.
- `suggested`: the new Session has workspace history or other host clues. The result contains only candidate projects and generic reasons that don't leak the original path, with no project connection. If the current user message already explicitly asks to use Molis Work with a named project and exactly one returned existing project unambiguously matches it, the Skill calls `context_bind` directly; otherwise it shows the candidates and asks.
- `unbound`: returns `missing_stable_context` or `unknown_context` and connects to no project. The Skill likewise reuses an explicit current-message selection of one unambiguous existing project; otherwise it shows the project list and asks the user to select or create one.
- When the user explicitly rejects a `suggested` candidate, the Skill calls `molis_work_v1_context_reject_suggestion` with `user_confirmed=true`. It only stops suggesting that candidate in this Session, then may return another candidate or an explicit project list/create path; it never unbinds, deletes, or affects other Sessions.
- After the user explicitly selects an existing project, call `molis_work_v1_context_bind` with `user_confirmed=true`. A stable Session may use `binding_scope=session`; workspace membership records association, not a directory default. Switching an existing binding also needs explicit switch authority and `rebind_confirmed=true`. Do not send the removed `workspace_default` option.
- After the user explicitly asks to create a named project in the current conversation, the Skill calls `molis_work_v1_context_create_and_bind` with `user_confirmed=true`, the project name, and an idempotency key. It creates the project DB and binds it only under `~/.molis-work`; a failure leaves no orphan project.
- When the user asks to view projects, the Skill calls `molis_work_v1_context_list_projects`; it doesn't expose database paths and changes nothing.
- When the user explicitly asks to unbind only the current work entry, the Skill calls `molis_work_v1_context_unbind` with `user_confirmed=true`. It doesn't delete the project, DB, or other Runtimes' bindings.
- Deleting a project and its DB is a separate confirmation: after the user names the project and confirms deletion, the Skill calls `molis_work_v1_project_delete` with `delete_confirmed=true` and an idempotency key. On success it returns a deletion receipt (with the clean-up step of each owner of plugin data; a step that did not finish is retried with the same idempotency key) and the Runtime can no longer use the old connection. The data plugins keep for the project (documents, forms and their answers, todos, memories, Assistant works and the like) is deleted with it; When Molis Work is running, the stdio MCP hands the deletion to it (the project's terminals and runtime are there): it refuses while one of the project's terminals is running (`catalog.project_terminal_live`: ask the user to close it, then retry with the same idempotency key), otherwise it lets go of the project's runtime first and deletes, and finishes the memory step on the spot. When Molis Work is not running, the MCP process deletes alone (there is no terminal to check): memory lives in the Agent service, which the MCP process does not run, so when the Home has an Agent runtime that step stays pending in the receipt for a Molis Work that runs later (it does so when it starts and every minute while it runs); the data is not gone until the receipt is complete, and while Molis Work is not running, retrying with the same idempotency key gives the same pending step.

Web is an optional viewing and user-confirmation surface, not a prerequisite for project connection or Goal work. Browsing does not bind the Runtime. Project Settings manages Session associations and workspace memberships, not directory defaults. Project creation, Runtime configuration, unlinking and deletion each retain their own authorization.

## Current tools

`molis-work-mcp` has two kinds of tools:

- **Connection tools** (platform tools, named with the `molis_work_v1_` prefix): `context_resolve`, `context_list_projects`, `context_reject_suggestion`, `context_bind`, `context_unbind`, `context_create_and_bind`, `project_delete`. The connection tools take no `actor_id`: the Host records the MCP client and the Runtime Session of the call (`runtime:<runtime_id>:<session>`, or `runtime:<runtime_id>` alone when the host declares no stable Session), and an identity field in the arguments is refused with `mcp.unexpected_field` and writes nothing.
- **Action tools**: every action in the system's single capability registry, named `molis_work_v1_action_<action>__v<version>`, for example `molis_work_v1_action_goals.list__v1`. Goals, judgment rules and every plugin reach MCP only this way.

An action tool appears only after the user grants that action to this client for its scope (Home-wide or a project). In **Capabilities → External access**, choose the client and scope, search by name or provider, review the required permissions, and grant or revoke each action. A grant binds the exact capability version and provider; discovery and every call check the latest grants, so the next call after a revocation is refused, though a client may need to refresh its own tool list. Binding a project grants no action.

Common Goals actions:

| Purpose | Actions |
| --- | --- |
| Find, create and read state | `goals.list`, `goals.create`, `goals.state.read` |
| Notes and history | `goals.note`, `goals.events.configure`, `goals.events.report`, `goals.progress.record`, `goals.events.list`, `goals.events.read` |
| Agreement, decisions and closure | `goals.concerns.apply`, `goals.decisions.request`, `goals.decisions.cite`, `goals.agreement.set`, `goals.closure.submit`, `goals.work.resume` |
| Tree proposals | `goals.tree.submit`, `goals.tree.read`, `goals.tree.check` |
| Optional planning | `goals.planning.catalog` (catalog without instructions), `goals.planning.read` (instructions by `method_ids`), `goals.planning.save`, `goals.planning.impact`, `goals.planning.graph.check` |
| Project guidance | `goals.guidance.read`, `goals.guidance.add`, `goals.guidance.update` |
| Trash | `goals.trash.set` (`trashed` true moves to trash, false restores), `goals.trash.list` |

Action input holds business fields only: the project, the operator and the creation channel come from the connection and Session, so `project_id`, database paths, Web URLs, `actor_id` / `actor_kind` / `runtime_actor_id` and `source_kind` are not accepted. For a Runtime write, the host records the Session as the audit author (`runtime:<runtime_id>:<session>`); without a stable Session identity the write is refused.

The shortest path is `goals.create` → `goals.note`, with no type or planning. Use `goals.events.configure` / `goals.events.report` for structured results. A report may hold several facts and progress; the batch is saved only when all of it is valid, and the receipt returns current state, gaps and cursors.

The person's decisions are written only from the protected Web interface or the trusted management entry, never by a Runtime. A Runtime may submit concrete changes and request or cite saved decisions; it cannot fill in a user identity, confirmation text or Session fields to approve itself. The trusted management entry uses `MOLIS_WORK_MCP_AUDIENCE=management` and has the extra platform tools `initialize`, `event_decide` and `goal_tree_decide`; the host sets its identity to the person on this machine (`web-user`), and their arguments carry no identity: `event_decide` refuses `actor_id`, `actor_kind`, `audit_actor_id` and `runtime_actor_id` (`mcp.unexpected_field`), and so does `goal_tree_decide` (`actions.input_invalid`), whose `authority` carries only the conversation reference (`conversation_ref` and `message_ref`, plus the whole-proposal confirmation) and refuses an identity or origin named inside it (`actor_id`, `actor_kind`, `authority_source`: `goal_tree_proposal.authority_source_invalid`); `initialize` reads only `project_id`, `title` and `idempotency_key`, and ignores every other argument without treating it as an identity and without an error. These tools must be told which project database to use: the `database_path` argument or the `MOLIS_WORK_DATABASE` environment variable. With neither they fail with `store.path_required`; there is no default path guessed from the working directory.

When the service is unavailable, report the failure; do not switch databases, change URLs or fall back to the CLI. `mcp.context_refresh_required` only asks for a read-only `context_resolve`: when it returns bound, retry with the original idempotency_key; otherwise follow project selection.

Plugins do not register separate MCP tools: the actions a plugin declares in its Manifest are its external capabilities. See [Plugin development](platform/PLUGIN-DEVELOPMENT.md).
