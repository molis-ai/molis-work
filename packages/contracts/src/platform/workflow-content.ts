import type { ActionCallContext, ActionDefinition, ActionHandlerBinding, ActionReference, ActionSchema } from "./actions.js";

/** Content handoffs are one explicit workflow protocol, not a claim that every action returns text. */
export type WorkflowContentRole = "list" | "read" | "receive" | "create";
export interface WorkflowContentStation {
  readonly id: string;
  readonly title: string;
  readonly icon: string;
  readonly role: WorkflowContentRole;
  readonly protocol: 1;
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
export interface WorkflowReceiveInput {
  readonly payload: WorkflowPayload;
  readonly context: { readonly instance_id: string; readonly step: number; readonly title?: string };
}

const text = { type: "string" };
const nullableText = { type: ["string", "null"] };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema =>
  ({ type: "object", properties, required, additionalProperties: false });
const item = object({ plugin: { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" }, item_id: { type: "string", minLength: 1 }, title: text });
const payload = object({ title: text, body: text, url: nullableText, source: nullableText, feed_item_id: nullableText }, ["title", "body"]);
export const WORKFLOW_CONTENT_SCHEMAS = {
  list: { input: object({}), output: { type: "array", items: object({ item_id: { type: "string", minLength: 1 }, title: text, caption: text, at: nullableText }) } },
  read: { input: object({ item_id: { type: "string", minLength: 1 } }), output: payload },
  receive: { input: object({ payload, context: object({ instance_id: { type: "string", minLength: 1 }, step: { type: "integer", minimum: 0 }, title: text }, ["instance_id", "step"]) }), output: item },
  create: { input: object({ title: text }), output: item },
} as const;

export interface WorkflowContentActions {
  readonly list: ActionDefinition<Record<string, never>, readonly WorkflowStartItem[]>;
  readonly read: ActionDefinition<{ item_id: string }, WorkflowPayload>;
  readonly receive: ActionDefinition<WorkflowReceiveInput, WorkflowItemRef>;
  readonly create?: ActionDefinition<{ title: string }, WorkflowItemRef>;
}

/** A plugin declares the protocol once; all consumers use these very definitions. */
export function defineWorkflowContentActions(station: { id: string; title: string; icon: string; create?: boolean;
  read_permissions: readonly string[]; write_permissions: readonly string[] }): WorkflowContentActions {
  const define = <I, O>(role: WorkflowContentRole): ActionDefinition<I, O> => ({
    capability_id: `${station.id}.content.${role}`, version: 1,
    operation: role === "read" || role === "list" ? "query" : "command",
    action: { title: `${station.title} · ${{ list: "可交接内容", read: "读取内容", receive: "接收内容", create: "新建空白内容" }[role]}`,
      description: `按工作流内容合同${{ list: "列出全部可选内容", read: "读取现有内容", receive: "写入交接内容", create: "创建空白内容" }[role]}`,
      kind: role === "read" || role === "list" ? "query" : "operation", scope: "project",
      audiences: ["user", "agent", "workflow", "mcp"], subject_kinds: [station.id],
      permissions: role === "read" || role === "list" ? station.read_permissions : station.write_permissions,
      input_schema: WORKFLOW_CONTENT_SCHEMAS[role].input, output_schema: WORKFLOW_CONTENT_SCHEMAS[role].output,
      input_type: `molis.workflow.content.${role}.input.v1`, output_type: `molis.workflow.content.${role}.output.v1`,
      workflow_content: { id: station.id, title: station.title, icon: station.icon, role, protocol: 1 },
    },
  });
  return { list: define("list"), read: define("read"), receive: define("receive"), ...(station.create ? { create: define<{ title: string }, WorkflowItemRef>("create") } : {}) };
}

export interface WorkflowContentHandlers {
  list(caller: ActionCallContext): readonly WorkflowStartItem[] | Promise<readonly WorkflowStartItem[]>;
  read(input: { item_id: string }, caller: ActionCallContext): WorkflowPayload | Promise<WorkflowPayload>;
  receive(input: WorkflowReceiveInput, caller: ActionCallContext): WorkflowItemRef | Promise<WorkflowItemRef>;
  create?(input: { title: string }, caller: ActionCallContext): WorkflowItemRef | Promise<WorkflowItemRef>;
}
export function bindWorkflowContentHandlers(definitions: WorkflowContentActions, handlers: WorkflowContentHandlers): ActionHandlerBinding[] {
  return Object.entries(definitions).map(([role, definition]) => {
    const handler = handlers[role as WorkflowContentRole];
    if (!handler) throw new Error(`工作流内容能力缺少实现：${definition.capability_id}`);
    return { capability_id: definition.capability_id, version: definition.version,
      handle: (caller, input) => role === "list" ? handlers.list(caller) : (handler as (value: unknown, caller: ActionCallContext) => unknown)(input, caller) };
  });
}
