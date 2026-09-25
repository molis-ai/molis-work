# Project connection and recovery

Use this reference for project selection, binding, switching, connection errors, or recoverable Goal trash. Start with molis_work_v1_context_resolve.

## Use the resolved state

| State | Action |
| --- | --- |
| bound | Reuse the returned connection and any authorized Goal focus. Ordinary Goal calls omit board and actor fields. |
| suggested or unbound | Follow an already explicit user project selection if exactly one returned existing project matches. Otherwise show project names and ask which to use or whether to create a named project. |
| missing_stable_context | Explain that the Host has not supplied a stable conversation context. Do not invent a Session ID or guess a project from a directory. |

An exact realpath-verified workspace with one project membership can recover a connection read-only. This does not create a Session binding. Multiple, conflicting or unverified matches still need a choice. A repository name, directory, database path or mere project mention is not selection authority.

Once the user selects an existing project, call molis_work_v1_context_bind with its returned project_id, the current Runtime actor_id and user_confirmed=true. Connection tools retain their explicit identity fields; the ordinary Goal-tool omission rule does not apply to them.

For a new project, state its display name and the create-and-bind effect, then call context_create_and_bind with display_name, actor_id, user_confirmed=true and idempotency_key when that precise operation is authorized. A clear current request or answer already authorizing that name and operation is sufficient; do not ask again. If either the name or creation intent remains ambiguous, clarify only that gap.

Use rebind_confirmed=true only when the user authorized switching an existing binding. An explicit instruction to switch already supplies that authority; an unrelated approval does not.

## Refresh without binding again

For mcp.context_refresh_required:

1. Call context_resolve once for the current Session.
2. If bound, retry the failed call unchanged, including the original idempotency key.
3. Otherwise follow the actual resolution state above; do not continue the dependent Goal write.
4. If the same refresh failure repeats after bound resolution, report the discontinuity rather than looping or weakening Session isolation.

Returned recovery fields such as next_action=context_resolve_then_retry, requires_bind=false and retry_same_idempotency_key=true describe this recovery step, not permission to switch projects.

## An older Runtime reader

catalog.reader_too_old means a Runtime/catalog version mismatch. Report the actual and supported schema versions; do not edit or roll back the database. The running MCP process cannot hot-reload itself.

Continue from an available new or forked Session with a compatible reader; ask for a new one only when needed. Before writing there, verify the actual host-visible task focus and call context_resolve. Navigation alone does not prove that the next message reached the new task. A suggested project still follows normal selection rules. Preserve the old task and its work; do not terminate it automatically or route writes through CLI/SQLite.

## Project operations have different effects

- context_list_projects is read-only.
- context_reject_suggestion records an explicitly rejected candidate when the Host has stable Session identity. With no stable identity, do not claim the rejection was persisted.
- context_unbind disconnects this Session while preserving the project. With binding_scope=workspace and project_id, it removes that one workspace association.
- project_delete permanently removes the named managed project, its database and bindings. Use delete_confirmed=true only with explicit authority for that deletion. Existing backend guards on historical active work still apply; report a blocked result without trying removed execution commands.
- A pending cleanup receipt is unfinished. Retry only the same operation and key.

Use the user's existing authorization for the precise effect. Choosing another project, rejecting a suggestion, disconnecting and deleting are not interchangeable. Show user-facing project names; keep internal IDs and paths out of ordinary explanations.

## A Goal opened beside a Runtime

After connection resolves, read the explicit Goal using molis_work_v1_goal_state. A Host-provided MOLIS_WORK_GOAL_ID identifies page context; it does not itself authorize doing the work.

When the user asks to advance it, continue from current agreement, requirements, progress and gaps. Updating another Goal never silently retargets the existing terminal. Do not invent MOLIS_WORK_WORK_CONTEXT_ID or MOLIS_WORK_PANEL_ID, ask the user to paste a Session ID, or send to a terminal as part of Goal navigation.

## Recoverable Goal trash

Goal trash preserves the original ID, facts and relationship history. It differs from permanent project deletion.

- molis_work_v1_goal_trash_list uses an empty ordinary input and is read-only.
- molis_work_v1_goal_trash and molis_work_v1_goal_restore take flat goal_id, reason, user_confirmed=true and idempotency_key. Omit board/actor fields and the old payload envelope.
- Use the exact Goal and the user's explicit instruction to trash or restore it. If the requested effect is ambiguous, clarify it; do not repeat a clear instruction.

Read the result literally: blocked means no transition; trashed is recoverable; restored keeps relations with unavailable endpoints inactive and identifies pending_relation_ids. already_trashed and already_active report existing state. After restoring, goal_state describes current work. Never force historical active work closed or invent a per-Goal permanent deletion route.

Project binding does not grant access to project content. Connection responses read project guidance and recovery goals through the client’s explicit action grants. If `project_guidance_error` or `resume_error` is present, the corresponding content is null, not empty or absent from the project. Preserve a valid bound connection; do not bind again to repair content access. For authorization errors, explain the exact missing access and direct the user to system capabilities → external access. For `actions.service_unavailable`, restore the existing Home service before retrying the read. Never fall back to another project, Home, or local database. A focus outside the first directory page additionally requires `goals.directory.read`.
