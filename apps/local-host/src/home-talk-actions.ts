import { ACTION_SUBJECT_SCHEMA, SUBJECT_CONTEXT_OUTPUT_SCHEMA, ActionError, resolveActionSubject, type ActionSubject, type ActionSubjectContext,
  type ActionCallContext, type ActionClient, type ActionDefinition, type ActionHandlerBinding, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { workActions, publicWorkSessionSchema, type PublicWorkSession, type WorkSessionDirectory } from "@molis-ai/molis-work-plugin-work";

export interface HomeTalkPreparation {
  context: ActionSubjectContext;
  reader: ActionReference;
  candidates: PublicWorkSession[];
  selected_session_id: string | null;
  selection: "associated" | "choose";
}
export const homeTalkActions = {
  prepareTalk: { capability_id: "home.talk.prepare", version: 1, operation: "query", action: {
    title: "准备围绕事项发消息", description: "从插件声明的上下文能力读取当前事项，并列出准确关联或需明确选择的会话；不会发送消息。",
    kind: "query", scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "workflow", "mcp"], permissions: ["home:read", "sessions:read"], subject_kinds: [],
    required_actions: [{ capability_id: workActions.directory.capability_id, version: 1, provider_id: "io.molis.work.sessions" }],
    input_schema: { type: "object", properties: { subject: ACTION_SUBJECT_SCHEMA }, required: ["subject"], additionalProperties: false },
    output_schema: { type: "object", properties: { context: SUBJECT_CONTEXT_OUTPUT_SCHEMA, reader: { type: "object", properties: { capability_id: { type: "string" }, version: { type: "integer" }, provider_id: { type: "string" } }, required: ["capability_id", "version", "provider_id"], additionalProperties: false },
      candidates: { type: "array", items: publicWorkSessionSchema }, selected_session_id: { type: ["string", "null"] }, selection: { enum: ["associated", "choose"] } },
      required: ["context", "reader", "candidates", "selected_session_id", "selection"], additionalProperties: false },
  } } as ActionDefinition<{ subject: ActionSubject }, HomeTalkPreparation>,
};
export const HOME_TALK_PERMISSIONS = ["home:read", "sessions:read", "goals:read", "feed:read", "inbox:read"] as const;
export function createHomeTalkHandlers(projectId: string, client: ActionClient): ActionHandlerBinding[] {
  return [{ ...homeTalkActions.prepareTalk, async handle(caller: ActionCallContext, input) {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "首页上下文不属于当前项目");
    const { subject } = input as { subject: ActionSubject };
    const first = await resolveActionSubject(client, caller, subject);
    const directory = await client.invoke(caller, { ...workActions.directory, provider_id: "io.molis.work.sessions" }, {}) as WorkSessionDirectory;
    // A source can change or lose permission while the Session service starts. Return only a current snapshot.
    const latest = await resolveActionSubject(client, caller, subject);
    if (JSON.stringify(first.reader) !== JSON.stringify(latest.reader) || JSON.stringify(first.context) !== JSON.stringify(latest.context)) {
      throw new ActionError("actions.subject_changed", "事项在准备期间发生变化，请重新载入");
    }
    const { context, reader } = latest;
    const runtimes = new Map(directory.runtimes.map(row => [row.runtime_id, row.capabilities]));
    const associated = !!context.session_id || context.goal_ids.length > 0;
    const candidates = directory.records.map(row => row.session).filter(session => session.project_id === projectId && session.status !== "closed"
      && !!session.native_runtime_session_id && runtimes.get(session.runtime_id)?.message === "native"
      && (context.session_id ? session.session_id === context.session_id : context.goal_ids.length ? !!session.current_goal_id && context.goal_ids.includes(session.current_goal_id) : true));
    return { context, reader, candidates, selection: associated ? "associated" : "choose",
      selected_session_id: associated && candidates.length === 1 ? candidates[0]!.session_id : null } satisfies HomeTalkPreparation;
  } }];
}
