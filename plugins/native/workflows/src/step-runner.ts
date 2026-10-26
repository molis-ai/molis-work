/**
 * What a station of a workflow is, against the caller's own directory: the actions a step can run and the mapping that fills them, a station
 * resolved to what it is now, the content of a step read back, and an action step run with the handoff mapped into its fields.
 * `createWorkflowsActionHandlers` binds these to the actions; they hold no state of their own.
 */
import { presentActionResult, type ActionExecutionContext, type ActionReference, type ActionResultPresentation, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { isActionStation, mapActionInput, type WorkflowActionStep, type WorkflowInstance, type WorkflowItemRef, type WorkflowPayload, type WorkflowStation } from "./model.js";
import type { WorkflowsStore } from "./store.js";
import type { WorkflowContentPorts, WorkflowsActionPorts } from "./actions.js";
import { withPending } from "./continuation.js";
import { workflowsErrors } from "./error.js";

export type Pending = NonNullable<WorkflowInstance["steps"][number]["pending"]>;
/** What a step needs of the handler that runs it: its project, and the one write the handler makes (authority is checked again inside it). */
export interface RunScope {
  readonly projectId: string;
  commit<T>(caller: ActionExecutionContext, run: (store: WorkflowsStore) => T): Promise<T>;
}

/** One input field of a candidate action, as the mapping editor shows it. */
interface WorkflowActionField { readonly name: string; readonly type: string; readonly required: boolean; readonly title?: string; readonly enum?: readonly (string | number | boolean)[] }
/** A registered command a workflow step can run: grouped by provider, filled by mapping. */
export interface WorkflowActionChoice {
  readonly ref: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly title: string;
  readonly description: string;
  readonly group: string;
  readonly fields: readonly WorkflowActionField[];
  readonly available: boolean;
  readonly reason?: string;
}

const MAPPABLE = new Set(["string", "number", "integer", "boolean"]);
function fieldsOf(view: ActionView): WorkflowActionField[] | null {
  const schema = view.action.input_schema as { type?: unknown; properties?: Record<string, { type?: unknown; enum?: unknown[]; title?: unknown; description?: unknown }>; required?: unknown };
  if (schema.type !== "object" || !schema.properties) return null;
  const required = Array.isArray(schema.required) ? schema.required.filter((name): name is string => typeof name === "string") : [];
  const fields = Object.entries(schema.properties).map(([name, property]) => {
    const type = Array.isArray(property?.type) ? String(property.type.find(item => item !== "null") ?? "") : String(property?.type ?? (property?.enum ? "string" : ""));
    return { name, type, required: required.includes(name), ...(typeof property?.title === "string" || typeof property?.description === "string" ? { title: String(typeof property.title === "string" ? property.title : property.description).slice(0, 120) } : {}),
      ...(Array.isArray(property?.enum) ? { enum: property.enum.filter((value): value is string | number | boolean => ["string", "number", "boolean"].includes(typeof value)) } : {}) };
  });
  // A step fills flat fields; a required object or list cannot be mapped from handed-over text.
  return fields.some(field => field.required && !MAPPABLE.has(field.type)) ? null : fields;
}

/** Commands that accept flat input and are offered to workflows: the directory, not a Host list, decides what can be a step. */
export function workflowActionChoices(directory: readonly ActionView[]): WorkflowActionChoice[] {
  return directory.flatMap(view => {
    if (view.operation !== "command" || view.action.kind === "judgment" || !view.action.audiences.includes("workflow") || view.action.workflow_content
      || view.capability_id.startsWith("workflows.")) return [];
    const fields = fieldsOf(view);
    if (!fields) return [];
    return [{ ref: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, title: view.action.title,
      description: view.action.description, group: view.provider.title, fields, available: view.availability.available,
      ...(view.availability.available ? {} : { reason: view.availability.reason }) }];
  });
}

/** Why a saved mapping no longer fits the action's current contract, or null when it does. */
function actionMappingProblem(step: WorkflowActionStep, choice: Pick<WorkflowActionChoice, "fields">): string | null {
  for (const field of choice.fields) if (field.required && !step.mapping[field.name]) return `还没填「${field.title ?? field.name}」`;
  for (const [name, source] of Object.entries(step.mapping)) {
    const field = choice.fields.find(item => item.name === name);
    if (!field) return `动作已不再接受「${name}」`;
    if (!MAPPABLE.has(field.type)) return `「${field.title ?? name}」不能从交过来的内容填写`;
    if ("from" in source) { if (field.type !== "string" || field.enum) return `「${field.title ?? name}」需要固定值`; continue; }
    const value = source.value;
    const typed = field.type === "string" ? typeof value === "string" : field.type === "boolean" ? typeof value === "boolean"
      : typeof value === "number" && (field.type === "number" || Number.isInteger(value));
    if (!typed) return `「${field.title ?? name}」的固定值类型不对`;
    if (field.enum && !field.enum.includes(value)) return `「${field.title ?? name}」的固定值不在可选范围内`;
  }
  return null;
}

/** Other actions as this caller reaches them through the workflow: the directory is read once per call; every invocation is still checked by the kernel. */
export function reachFor(ports: Pick<WorkflowsActionPorts, "actions">, caller: ActionExecutionContext) {
  const reach = ports.actions(caller);
  let views: Promise<readonly ActionView[]> | undefined;
  const all = () => views ??= reach.discover();
  return {
    all,
    find: async (ref: ActionReference) => (await all()).find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id),
    invoke: (ref: ActionReference & { provider_id: string }, input: unknown) => reach.invoke(ref, input),
    check: (ref: ActionReference & { provider_id: string }, input: unknown) => reach.check(ref, input),
  };
}
export type Reach = ReturnType<typeof reachFor>;

/** An action step resolves against the caller's own directory; its mapping must still fit the action's contract. */
export async function resolveAction(reach: Reach, station: WorkflowStation & { action: WorkflowActionStep }): Promise<WorkflowActionChoice> {
  const ref = station.action.ref;
  const view = await reach.find(ref);
  const choice = view && workflowActionChoices([view])[0];
  if (!choice) throw workflowsErrors.unavailable(`动作「${station.action.title}」v${ref.version} 已不可用或不再接受流程调用；原引用已保留，请重新选择`);
  if (!choice.available) throw workflowsErrors.unavailable(`动作「${station.action.title}」暂不可用：${choice.reason}`);
  const problem = actionMappingProblem(station.action, choice);
  if (problem) throw workflowsErrors.not_ready(`动作「${station.action.title}」的字段映射需要调整：${problem}`);
  return choice;
}
export async function resolveStation(reach: Reach, content: WorkflowContentPorts, station: WorkflowStation) {
  return isActionStation(station) ? (await resolveAction(reach, station), station) : content.resolveStation(station);
}

export async function labelOf(content: WorkflowContentPorts, plugin: string): Promise<string> {
  return (await content.stations()).find(station => station.plugin === plugin)?.label ?? plugin;
}

/** The content a step holds, read through its own station; an action step hands on what it received. */
export async function readStep(content: WorkflowContentPorts, current: WorkflowInstance, index: number): Promise<WorkflowPayload> {
  // An action step hands on what it received; the action's result stays in its record.
  if (isActionStation(current.chain.stations[index]!)) {
    const payload = current.steps[index]?.payload;
    if (!payload) throw workflowsErrors.invalid("这一步还没有收到内容");
    return payload;
  }
  const item = current.steps[index]?.item;
  if (!item) throw workflowsErrors.invalid("这一步还没有内容");
  try { return await content.read(item, current.chain.stations[index]!.content); }
  catch (error) {
    if (error instanceof Error && "code" in error) throw error;
    throw workflowsErrors.missing(`这一次在 ${await labelOf(content, item.plugin)} 里的内容已经读不到了（可能被删除）`);
  }
}

/**
 * Runs an action step with the fixed handoff mapped into its fields. Actions carry no delivery key, so a run whose result
 * was never confirmed is not repeated unless the person says so; the attempt is recorded before the call.
 */
export async function runActionStep(scope: RunScope, caller: ActionExecutionContext, reach: Reach, current: WorkflowInstance, from: number, pending: Pending, target: WorkflowStation & { action: WorkflowActionStep },
  retry: boolean): Promise<{ instance: WorkflowInstance; arrived: WorkflowItemRef; arrival: { payload: WorkflowPayload; result: unknown; result_presentation?: ActionResultPresentation; result_truncated?: true } }> {
  if (pending.attempted_at && !retry) {
    throw workflowsErrors.uncertain(`上次执行「${target.action.title}」${pending.attempt_error ? `时出错（${pending.attempt_error}）` : "没有确认结果"}；请先到${target.action.group ?? "对应插件"}确认是否已经生效，再决定是否重试`);
  }
  const choice = await resolveAction(reach, target);
  const mapped = mapActionInput(target.action, pending.output);
  const definition = (await reach.find(choice.ref))!.action;
  // The target's own refusal of this input comes before an attempt is recorded, so a bad mapping is fixed and run again without a retry.
  await reach.check(choice.ref, mapped);
  const attempt: Pending = { ...pending, attempted_at: new Date().toISOString() };
  const instance = await scope.commit(caller, store => store.saveInstance(current, withPending(current, from, attempt)));
  let result: unknown;
  try { result = await reach.invoke(choice.ref, mapped); }
  catch (error) {
    // A provider may write before propagating a downstream authorization/validation error.
    // Once invoked, no error code proves that nothing happened: only an explicit retry may resend.
    const settled = { ...attempt, attempt_error: (error instanceof Error ? error.message : String(error)).slice(0, 400) };
    await caller.beforeEffect();
    caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
    await scope.commit(caller, store => store.saveInstance(instance, withPending(instance, from, settled))).catch(() => undefined);
    caller.assert_authority_current?.(); caller.signal?.throwIfAborted();
    throw error;
  }
  const presentation = presentActionResult(definition.result_view, result, scope.projectId);
  const encoded = JSON.stringify(result ?? null);
  return { instance, arrived: { plugin: "action", item_id: `${choice.ref.capability_id}@${choice.ref.version}:${attempt.key}`, title: target.action.title },
    arrival: { payload: attempt.output, result: encoded.length > 20_000 ? { truncated: true, bytes: encoded.length } : result ?? null,
      ...(presentation ? { result_presentation: presentation } : {}), ...(encoded.length > 20_000 ? { result_truncated: true } : {}) } };
}
