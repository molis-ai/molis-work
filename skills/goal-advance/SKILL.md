---
name: goal-advance
description: Use Molis Work in the current Runtime conversation to connect a user-selected project, create or find Goals, record work, and follow current requirements, decisions, and completion. Use when the user explicitly asks to use, open, connect, plan, continue, or advance Molis Work.
---

# Molis Work Runtime

Stay in the current conversation. Molis Work stores shared project and Goal facts; perform the user's actual work with the tools appropriate to that work, then record its meaningful results through Molis Work MCP.

Molis Work MCP has connection tools (molis_work_v1_context_*) and action tools. Every Goal operation is an action tool named `molis_work_v1_action_<action>__v<version>`, for example `molis_work_v1_action_goals.list__v1`; this skill names them by action (`goals.list`).

## Connect and work

1. Call read-only molis_work_v1_context_resolve first. Reuse a bound connection. If the user has already selected a named project and exactly one returned project matches, bind it without repeating the question. Otherwise resolve the choice using [project-connection.md](references/project-connection.md).
2. Use goals.list to find existing work, then goals.state.read with the explicit goal_id. For a new intent, goals.create needs only a recognizable title and an idempotency key. Include a result or requirements when actually known; no planning template or invented inputs are required.
3. Work within the user's authorization. Save a plain observation or partial result with goals.note. For structured results, register useful local types (goals.events.configure) and use goals.events.report; its receipt gives saved facts and current gaps. See [execution.md](references/execution.md) for actual calls.
4. Read [protocol.md](references/protocol.md) before the first write. Add or revise the current agreement when needed. A concrete commitment change or required human acceptance uses a saved decision from the protected user interface; ordinary notes and reports need no additional approval. Continue independent work while that specific decision is pending.
5. Submit goals.closure.submit only with a supported result and current versions. A saved closure report may still be unmet: report completion_applied, not merely recorded. To start another round after completion or cancellation, use goals.work.resume with a reason. Ordinary notes do not reopen work.

The Host injects project and operator identity for Goal actions. Omit project_id, database/Web paths, actor_id, actor_kind, audit_actor_id, runtime_actor_id, source_kind and authority fields; explicit goal_id still identifies the intended Goal. Connection and project-management tools have their own schemas. A selected Goal in the UI is context, not permission to start work or retarget a terminal. Never require a fixed phrase or verbatim repetition.

Each action tool appears only after the user grants that exact action to this client in the current project. A project binding does not grant actions. If a required tool is absent or returns mcp.tool_disabled / mcp.action_revoked, explain the specific missing capability and direct the user to **Capabilities → External access** for this client/project. Do not grant permissions yourself, rebind the project as a workaround, or replace a pending write with another tool name. After authorization, refresh discovery and retry with the same action, Session context and idempotency key.

## Read further when needed

- Complex work, professional methods, real dependencies or a tree change: [planning.md](references/planning.md). Planning is optional; a Goal can be useful before it has a full plan.
- Binding, project choice, connection recovery or Goal trash/restore: [project-connection.md](references/project-connection.md).
- Explicitly opening Web, reaching a protected user decision, or diagnosing actions.service_unavailable: [service-start.md](references/service-start.md). Goal work does not require opening a page; forwarded actions do require the same Home's system service to be running.

Treat context_resolve.runtime_prompt_prefix as saved project guidance. To persist new guidance, show the precise category and text and obtain authority for that addition or edit; do not promote a temporary inference into project instructions.

Goal state changes use the host-provided Goal action tools. If MCP fails, report the failure and use documented connection recovery. Do not switch databases, use SQLite or management CLI as a hidden fallback, create another Runtime, or change terminal bindings.
