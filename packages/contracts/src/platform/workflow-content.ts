import type { ActionDefinition, ActionExecutionContext, ActionHandlerBinding, ActionReference, ActionSchema } from "./actions.js";

/** Content handoffs are one explicit workflow protocol, not a claim that every action returns text. */
export type WorkflowContentRole = "list" | "read" | "receive" | "create";
export interface WorkflowContentStation {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly role: WorkflowContentRole;
  readonly protocol: 1;
  /** `false` on every role of a station that only starts a run; a station that receives says nothing. */
  readonly receives?: false;
}
export interface WorkflowContentBinding {
  readonly provider_id: string;
  readonly actions: Readonly<Partial<Record<WorkflowContentRole, ActionReference>>>;
}
export interface WorkflowPayload {
  readonly title: string;
  readonly body: string;
  readonly url?: string | null;
  readonly source?: string | null;
  readonly feed_item_id?: string | null;
}
export interface WorkflowItemRef { readonly plugin: string; readonly item_id: string; readonly title: string }
export interface WorkflowStartItem { readonly item_id: string; readonly title: string; readonly caption: string; readonly at: string | null }
/** The version each role of the protocol is at now. A role changes shape only by raising its own number here: a station declares
 * every role at this version (the platform refuses another), so a saved reference to an older one stays pinned and reports why. */
export const WORKFLOW_CONTENT_VERSIONS = { list: 1, read: 1, receive: 2, create: 1 } as const;

export interface WorkflowReceiveInput extends WorkflowPayload {
  /** One delivery. A receiver makes one object for a request id and returns that same object when the id arrives again (a retry
   * after a crash or a lost race). The entry point that makes the delivery gives it, never a drafter or a model; who delivered is
   * read from the trusted call context (`caller.audience`), never from this input. 1 to 160 characters. */
  readonly request_id: string;
}

const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema =>
  ({ type: "object", properties, required, additionalProperties: false });
const item = object({ plugin: { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" }, item_id: { type: "string", minLength: 1 }, title: text });
const requestId = { type: "string", minLength: 1, maxLength: 160 };
const payloadProperties = { title: text, body: text, url: nullableText, source: nullableText, feed_item_id: nullableText };
const payload = object(payloadProperties, ["title", "body"]);
export const WORKFLOW_CONTENT_SCHEMAS = {
  list: { input: object({}), output: { type: "array", items: object({ item_id: { type: "string", minLength: 1 }, title: text, caption: text, at: nullableText }) } },
  read: { input: object({ item_id: { type: "string", minLength: 1 } }), output: payload },
  receive: { input: object({ ...payloadProperties, request_id: requestId }, ["title", "body", "request_id"]), output: item },
  create: { input: object({ title: text }), output: item },
} as const;

export interface WorkflowContentActions {
  readonly list: ActionDefinition<Record<string, never>, readonly WorkflowStartItem[]>;
  readonly read: ActionDefinition<{ item_id: string }, WorkflowPayload>;
  readonly receive: ActionDefinition<WorkflowReceiveInput, WorkflowItemRef>;
  readonly create?: ActionDefinition<{ title: string }, WorkflowItemRef>;
}
/** A station that only starts a run (the 成果库: its versions are read, never written by a workflow). */
export type WorkflowSourceContentActions = Omit<WorkflowContentActions, "receive">;
interface WorkflowStationSpec { id: string; title: string; icon: string; create?: boolean; subject_kind: string;
  read_permissions: readonly string[]; write_permissions: readonly string[];
  /** `concurrent` for a station whose receive waits for a model (the next-step judgment) after saving: it then runs beside the project's queue. */
  receive_scheduling?: "concurrent" }

const ROLE_TITLE = { list: "可交接内容", read: "读取内容", receive: "接收内容", create: "新建空白内容" } as const;
const ROLE_SUMMARY = { list: "列出全部可选内容", read: "读取现有内容", receive: "写入交接内容", create: "创建空白内容" } as const;
const isQueryRole = (role: WorkflowContentRole) => role === "read" || role === "list";

/** What a role takes and returns is named by its own version; what it returns stays at `output.v1` until a role changes it. */
function roleTypes(role: WorkflowContentRole) {
  return { input_type: `molis.workflow.content.${role}.input.v${WORKFLOW_CONTENT_VERSIONS[role]}`, output_type: `molis.workflow.content.${role}.output.v1` };
}

function roleStation(station: WorkflowStationSpec & { receive?: boolean }, role: WorkflowContentRole): WorkflowContentStation {
  return { id: station.id, title: station.title, icon: station.icon, role, protocol: 1, ...(station.receive === false ? { receives: false as const } : {}) };
}

/** One role of one station, at the role's current version. Every station gets its roles from here, so a version moves for all of them at once. */
function defineRole<I, O>(station: WorkflowStationSpec & { receive?: boolean }, role: WorkflowContentRole): ActionDefinition<I, O> {
  const query = isQueryRole(role);
  return {
    capability_id: `${station.id}.content.${role}`, version: WORKFLOW_CONTENT_VERSIONS[role], operation: query ? "query" : "command",
    action: { title: `${station.title} · ${ROLE_TITLE[role]}`, description: `按工作流内容合同${ROLE_SUMMARY[role]}`,
      kind: query ? "query" : "operation", scope: "project",
      ...(role === "receive" && station.receive_scheduling ? { scheduling: station.receive_scheduling } : {}),
      audiences: ["user", "agent", "workflow", "mcp"], subject_kinds: [station.subject_kind],
      permissions: query ? station.read_permissions : station.write_permissions,
      input_schema: WORKFLOW_CONTENT_SCHEMAS[role].input, output_schema: WORKFLOW_CONTENT_SCHEMAS[role].output,
      ...roleTypes(role), workflow_content: roleStation(station, role),
    },
  };
}

/**
 * A plugin declares the protocol once; all consumers use these very definitions. `subject_kind` names the kind of object
 * the station's content is, the kind its subject reader reads back (`tests/workflow-station-kinds.test.ts`); a station id
 * is not an object kind. `receive: false` declares a station that only starts a run: workflows put it first and never hand
 * content to it.
 */
export function defineWorkflowContentActions(station: WorkflowStationSpec & { receive: false }): WorkflowSourceContentActions;
export function defineWorkflowContentActions(station: WorkflowStationSpec & { receive?: true }): WorkflowContentActions;
export function defineWorkflowContentActions(station: WorkflowStationSpec & { receive?: boolean }): WorkflowContentActions | WorkflowSourceContentActions {
  return { list: defineRole(station, "list"), read: defineRole(station, "read"),
    ...(station.receive === false ? {} : { receive: defineRole<WorkflowReceiveInput, WorkflowItemRef>(station, "receive") }),
    ...(station.create ? { create: defineRole<{ title: string }, WorkflowItemRef>(station, "create") } : {}) };
}

export interface WorkflowContentHandlers {
  list(caller: ActionExecutionContext): readonly WorkflowStartItem[] | Promise<readonly WorkflowStartItem[]>;
  read(input: { item_id: string }, caller: ActionExecutionContext): WorkflowPayload | Promise<WorkflowPayload>;
  receive?(input: WorkflowReceiveInput, caller: ActionExecutionContext): WorkflowItemRef | Promise<WorkflowItemRef>;
  create?(input: { title: string }, caller: ActionExecutionContext): WorkflowItemRef | Promise<WorkflowItemRef>;
}
export function bindWorkflowContentHandlers(definitions: WorkflowContentActions | WorkflowSourceContentActions, handlers: WorkflowContentHandlers): ActionHandlerBinding[] {
  return Object.entries(definitions).map(([role, definition]) => {
    const handler = handlers[role as WorkflowContentRole];
    if (!handler) throw new Error(`工作流内容能力缺少实现：${definition.capability_id}`);
    return { capability_id: definition.capability_id, version: definition.version,
      handle: (caller, input) => role === "list" ? handlers.list(caller) : (handler as (value: unknown, caller: ActionExecutionContext) => unknown)(input, caller) };
  });
}
