import { presentActionResult, type ActionResultPresentation, ActionError, retainActionAuthority, defineActionUsagesAction, referencesAction, type ActionCallContext, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionReference, type ActionSchema, type ActionUsage, type ActionView, type WorkflowContentBinding, type WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  WorkflowError, advanceInstance, aiHandoffPrompt, applyFunctionRule, handoffKey, linkReadiness, parseAiHandoff, parseChain, withPendingLinks,
  isActionStation, mapActionInput, WORKFLOW_PAYLOAD_FIELDS, WORKFLOWS_PLUGIN_ID,
  type Workflow, type WorkflowActionStep, type WorkflowChain, type WorkflowHandoff, type WorkflowInstance, type WorkflowItemRef, type WorkflowLink, type WorkflowPayload, type WorkflowStation, type WorkflowVerdict,
} from "./model.js";
import type { WorkflowSummary, WorkflowsStore } from "./store.js";

/** One input field of a candidate action, as the mapping editor shows it. */
export interface WorkflowActionField { readonly name: string; readonly type: string; readonly required: boolean; readonly title?: string; readonly enum?: readonly (string | number | boolean)[] }
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
export function actionMappingProblem(step: WorkflowActionStep, choice: Pick<WorkflowActionChoice, "fields">): string | null {
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

/** A published Choice rule a link can use to decide whether content goes on. */
export interface WorkflowJudgmentChoice {
  readonly ref: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly title: string;
  readonly description: string;
  readonly choices: readonly string[];
  readonly available: boolean;
  readonly reason?: string;
}

/** Choice rules come from the caller's directory: a published judgment whose result names a finite set of answers. */
export function workflowJudgmentChoices(directory: readonly ActionView[]): WorkflowJudgmentChoice[] {
  return directory.flatMap(view => {
    if (view.action.kind !== "judgment" || view.operation !== "command" || !view.action.audiences.includes("workflow")) return [];
    const data = (view.action.output_schema?.properties as Record<string, { properties?: Record<string, { enum?: unknown[] }> }> | undefined)?.data;
    const choices = data?.properties?.choice?.enum?.filter((value): value is string => typeof value === "string") ?? [];
    if (!choices.length) return [];
    return [{ ref: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, title: view.action.title,
      description: view.action.description, choices, available: view.availability.available,
      ...(view.availability.available ? {} : { reason: view.availability.reason }) }];
  });
}

/** A plugin as the chain editor sees it. Only plugins the Host can read from and hand to may join a chain. */
export interface WorkflowStationInfo {
  readonly plugin: string;
  readonly label: string;
  readonly icon: string;
  readonly supported: boolean;
  /** Why an unsupported plugin cannot join yet. */
  readonly reason?: string;
  /** Starting a run here can begin from an empty item instead of an existing one. */
  readonly can_start_blank: boolean;
}

/** Cross-plugin content, bound per call to the caller's own authority. */
export interface WorkflowContentPorts {
  stations(): Promise<readonly WorkflowStationInfo[]>;
  resolveStation(station: WorkflowChain["stations"][number]): Promise<WorkflowChain["stations"][number]>;
  listStartItems(plugin: string): Promise<readonly WorkflowStartItem[]>;
  createBlank(plugin: string, title: string, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
  read(item: WorkflowItemRef, content?: WorkflowContentBinding): Promise<WorkflowPayload>;
  /** Receivers return the same item for the same `instance_id` and `step`. */
  receive(plugin: string, payload: WorkflowPayload, context: { instance_id: string; step: number; title?: string }, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
}

/** Other registered actions, reached with the same caller's authority (a judgment rule on a link). */
export interface WorkflowActionReach {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ActionReference & { provider_id: string }, input: unknown): Promise<unknown>;
}

export interface WorkflowsActionPorts {
  withStore<T>(run: (store: WorkflowsStore) => T | Promise<T>): Promise<T>;
  content(caller: ActionCallContext): WorkflowContentPorts;
  actions(caller: ActionCallContext): WorkflowActionReach;
  /** The Host's full schema validator, also used by actual action dispatch. */
  assertInput(schema: ActionSchema, input: unknown): void;
  aiAvailable(): boolean;
  completeText?(prompt: string, options: { signal?: AbortSignal; beforeDispatch(): void | Promise<void> }): Promise<string>;
  changed?(): void;
}

const text = { type: "string" };
const id = { type: "string", minLength: 1, maxLength: 200 };
const object = (properties: Record<string, unknown>, required = Object.keys(properties)): ActionSchema => ({ type: "object", properties, required, additionalProperties: false });
const chain = { type: "object", properties: { stations: { type: "array", maxItems: 12 }, links: { type: "array" } }, required: ["stations"] };
const workflow = { type: "object", required: ["workflow_id", "title", "stations", "links", "revision"] };
const instance = { type: "object", required: ["instance_id", "workflow_id", "status", "current", "chain", "steps"] };
const payload = { type: "object", required: ["title", "body"] };
const read = ["workflows:read"], write = ["workflows:write"];
function define<I, O>(name: string, title: string, description: string, operation: "query" | "command", input: ActionSchema, output: ActionSchema,
  permissions: readonly string[], execution?: ActionDefinition["action"]["execution"]): ActionDefinition<I, O> {
  // Handoffs wait on other plugins and on a model; the store's revisions and delivery keys keep concurrent calls safe.
  return { capability_id: `workflows.${name}`, version: 1, operation, action: { title, description, ...(execution ? { execution } : {}), kind: operation === "query" ? "query" : "operation",
    scope: "project", scheduling: "concurrent", audiences: ["user", "agent", "mcp"], permissions, subject_kinds: ["workflow"], input_schema: input, output_schema: output } };
}

export const workflowsActions = {
  list: define<Record<string, never>, { workflows: WorkflowSummary[]; stations: readonly WorkflowStationInfo[]; ai_available: boolean }>("list", "工作流程列表",
    "列出本项目的流程、每站当前可用性，以及可以串进流程的插件", "query", object({}),
    object({ workflows: { type: "array", items: workflow }, stations: { type: "array" }, ai_available: { type: "boolean" } }), read),
  get: define<{ id: string }, { workflow: Workflow; instances: WorkflowInstance[]; ai_available: boolean }>("get", "读取工作流程", "读取一条流程及它的每一次运行",
    "query", object({ id }), object({ workflow, instances: { type: "array", items: instance }, ai_available: { type: "boolean" } }), read),
  create: define<{ title?: string; chain?: unknown }, { workflow: Workflow }>("create", "新建工作流程", "按站点与交接方式新建流程；站点固定到当时授权的能力版本",
    "command", object({ title: { type: "string", maxLength: 200 }, chain }, []), object({ workflow }), write),
  update: define<{ id: string; revision: number; title?: string; chain?: unknown }, { workflow: Workflow }>("update", "修改工作流程",
    "按读取时的版本保存标题或站点；过期修改被拒绝", "command", object({ id, revision: { type: "integer", minimum: 1 }, title: { type: "string", maxLength: 200 }, chain }, ["id", "revision"]),
    object({ workflow }), write),
  delete: define<{ id: string }, { ok: true }>("delete", "删除工作流程", "从列表移除流程；已有运行的历史保留", "command", object({ id }), object({ ok: { const: true } }), write),
  stationItems: define<{ plugin: string }, { items: readonly WorkflowStartItem[]; can_start_blank: boolean }>("stations.items", "起点可选内容",
    "列出第一站可以用来开始一次运行的已有内容", "query", object({ plugin: { type: "string", pattern: "^[a-z][a-z0-9-]{1,40}$" } }),
    object({ items: { type: "array" }, can_start_blank: { type: "boolean" } }), read),
  start: define<{ id: string; item_id?: string; title?: string }, { instance: WorkflowInstance }>("instances.start", "开始一次运行",
    "从第一站的已有内容或空白内容开始一次运行", "command", object({ id, item_id: { type: "string", maxLength: 200 }, title: { type: "string", maxLength: 200 } }, ["id"]),
    object({ instance }), write),
  instance: define<{ id: string }, { instance: WorkflowInstance; workflow_title: string; ai_available: boolean }>("instances.get", "读取一次运行",
    "读取运行进度、每一步的交接记录和站点可用性", "query", object({ id }), object({ instance, workflow_title: text, ai_available: { type: "boolean" } }), read),
  preview: define<{ id: string; from?: number }, { from: number; link: WorkflowLink; readiness: { ready: boolean; reason: string }; input: WorkflowPayload; output: WorkflowPayload | null }>(
    "instances.preview", "预览交接", "读取当前一步交出去前的内容；模板转换会给出交接后的样子，不调用模型、不写入", "query",
    object({ id, from: { type: "integer", minimum: 0 } }, ["id"]),
    object({ from: { type: "integer" }, link: { type: "object" }, readiness: { type: "object" }, input: payload, output: { anyOf: [payload, { type: "null" }] } }), read),
  continue: define<{ id: string; from?: number; updated_at?: string; title?: string; body?: string; retry_action?: boolean }, { instance: WorkflowInstance }>("instances.continue", "交给下一站",
    "按这一段的交接方式（判断规则、模板转换、AI 整理或人工交接）把内容交给下一站；下一站是动作时按字段映射执行。同一步重试只交付一次；动作结果未确认时需明确 retry_action 才会重新执行", "command",
    object({ id, from: { type: "integer", minimum: 0 }, updated_at: text, title: { type: "string", maxLength: 400 }, body: { type: "string", maxLength: 100_000 }, retry_action: { type: "boolean" } }, ["id"]),
    object({ instance }), [...write, "model:invoke"], { cost: "metered" }),
  actionSteps: define<Record<string, never>, { actions: WorkflowActionChoice[]; fields: readonly string[] }>("steps.actions", "可放进流程的动作",
    "列出可以作为一步执行的已注册动作，按提供方分组，并给出每个输入字段；交过来的标题、正文、来源、链接和日期可以映射进去", "query", object({}),
    object({ actions: { type: "array" }, fields: { type: "array", items: text } }), read),
  judgments: define<Record<string, never>, { judgments: WorkflowJudgmentChoice[] }>("judgments.list", "可用的判断规则",
    "列出可以放在一段交接上的已发布 Choice 判断规则及其可选结果", "query", object({}), object({ judgments: { type: "array" } }), read),
  /** Saved references to a capability: action steps, judgment links and pinned content stations. */
  usages: defineActionUsagesAction("workflows.usages", "流程里的使用位置", read),
  stop: define<{ id: string }, { instance: WorkflowInstance }>("instances.stop", "结束一次运行", "结束还在进行的一次运行，已交接的内容保留", "command",
    object({ id }), object({ instance }), write),
};
export const WORKFLOWS_ACTIONS: readonly ActionDefinition[] = Object.values(workflowsActions);
export const WORKFLOWS_ACTION_PERMISSIONS = [...new Set(WORKFLOWS_ACTIONS.flatMap(definition => definition.action.permissions))];

export function createWorkflowsActionHandlers(projectId: string, ports: WorkflowsActionPorts): ActionHandlerBinding[] {
  type Pending = NonNullable<WorkflowInstance["steps"][number]["pending"]>;
  type ContinueInput = (typeof workflowsActions.continue) extends ActionDefinition<infer I, unknown> ? I : never;
  const scoped = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与流程所在项目不一致");
    // The workflow is the consumer of each station; the caller's permissions and exact grants still bound every nested call.
    return ports.content({ ...caller, audience: "workflow" });
  };
  /** Other actions as this caller reaches them through the workflow: the directory is read once per call; every invocation is still checked by the kernel. */
  const reachFor = (caller: ActionCallContext) => {
    const reach = ports.actions({ ...caller, audience: "workflow" });
    let views: Promise<readonly ActionView[]> | undefined;
    const all = () => views ??= reach.discover();
    return {
      all,
      find: async (ref: ActionReference) => (await all()).find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id),
      invoke: (ref: ActionReference & { provider_id: string }, input: unknown) => reach.invoke(ref, input),
    };
  };
  type Reach = ReturnType<typeof reachFor>;
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, content: WorkflowContentPorts, caller: ActionExecutionContext, reach: Reach) => Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => {
      const authority = retainActionAuthority(caller, { ...definition, provider_id: WORKFLOWS_PLUGIN_ID }, caller.beforeEffect);
      return handle(input as I, scoped(authority), caller, reachFor(authority));
    },
  });
  /** An action step resolves against the caller's own directory; its mapping must still fit the action's contract. */
  const resolveAction = async (reach: Reach, station: WorkflowStation & { action: WorkflowActionStep }): Promise<WorkflowActionChoice> => {
    const ref = station.action.ref;
    const view = await reach.find(ref);
    const choice = view && workflowActionChoices([view])[0];
    if (!choice) throw new WorkflowError("workflows.unavailable", `动作「${station.action.title}」v${ref.version} 已不可用或不再接受流程调用；原引用已保留，请重新选择`);
    if (!choice.available) throw new WorkflowError("workflows.unavailable", `动作「${station.action.title}」暂不可用：${choice.reason}`);
    const problem = actionMappingProblem(station.action, choice);
    if (problem) throw new WorkflowError("workflows.not_ready", `动作「${station.action.title}」的字段映射需要调整：${problem}`);
    return choice;
  };
  const resolveStation = async (reach: Reach, content: WorkflowContentPorts, station: WorkflowStation) =>
    isActionStation(station) ? (await resolveAction(reach, station), station) : content.resolveStation(station);
  const validChain = async (content: WorkflowContentPorts, value: unknown, reach: Reach): Promise<WorkflowChain> => {
    const parsed = parseChain(value);
    if (parsed.stations[0] && isActionStation(parsed.stations[0])) throw new WorkflowError("workflows.invalid", "第一站要选一个能挑出内容的插件，动作只能接在后面");
    return { ...parsed, stations: await Promise.all(parsed.stations.map(station => resolveStation(reach, content, station))) };
  };
  const describe = async <T extends WorkflowChain>(content: WorkflowContentPorts, chainValue: T, reach: Reach): Promise<T> => ({ ...chainValue,
    stations: await Promise.all(chainValue.stations.map(async station => {
      try { await resolveStation(reach, content, station); return { ...station, availability: { available: true } }; }
      catch (error) { return { ...station, availability: { available: false, reason: error instanceof Error ? error.message : "站点不可用" } }; }
    })),
  });
  const labelOf = async (content: WorkflowContentPorts, plugin: string) => (await content.stations()).find(station => station.plugin === plugin)?.label ?? plugin;
  const live = (store: WorkflowsStore, instanceId: string): WorkflowInstance => {
    const current = store.instance(instanceId, projectId);
    try { return withPendingLinks(current, store.get(current.workflow_id, projectId)); } catch { return current; }
  };
  const readStep = async (content: WorkflowContentPorts, current: WorkflowInstance, index: number): Promise<WorkflowPayload> => {
    // An action step hands on what it received; the action's result stays in its record.
    if (isActionStation(current.chain.stations[index]!)) {
      const payload = current.steps[index]?.payload;
      if (!payload) throw new WorkflowError("workflows.invalid", "这一步还没有收到内容");
      return payload;
    }
    const item = current.steps[index]?.item;
    if (!item) throw new WorkflowError("workflows.invalid", "这一步还没有内容");
    try { return await content.read(item, current.chain.stations[index]!.content); }
    catch (error) {
      if (error instanceof WorkflowError || (error instanceof Error && "code" in error)) throw error;
      throw new WorkflowError("workflows.missing", `这一次在 ${await labelOf(content, item.plugin)} 里的内容已经读不到了（可能被删除）`);
    }
  };
  const changed = <T>(value: T) => { ports.changed?.(); return value; };
  /** The run with this step's handoff fixed (or its attempt recorded), ready to be saved against the version it was read at. */
  const withPending = (instance: WorkflowInstance, from: number, pending: Pending): WorkflowInstance => ({ ...instance,
    steps: instance.steps.map((step, index) => index === from ? { ...step, pending } : step), updated_at: new Date().toISOString() });
  /** Runs the link's exact rule on the step's content, with the caller's own authority; a changed or revoked rule stops here. */
  const judge = async (reach: Reach, link: WorkflowLink, handed: WorkflowPayload): Promise<WorkflowVerdict> => {
    const ref = link.judgment!;
    const view = await reach.find(ref);
    if (!view) throw new WorkflowError("workflows.not_ready", "这一段的判断规则已不可用或版本已变化；原引用已保留，请重新选择");
    if (!view.availability.available) throw new WorkflowError("workflows.not_ready", `这一段的判断规则暂不可用：${view.availability.reason}`);
    const content = [handed.title, handed.body].filter(Boolean).join("\n\n").slice(0, 8000);
    const result = await reach.invoke({ capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }, { content }) as
      { status: "ok" | "needs_review"; function_key: string; version: number; data: { choice?: string | null }; confidence: number | null };
    const choice = result.data?.choice ?? null;
    return { choice, status: result.status, passed: result.status === "ok" && !!choice && (link.pass ?? []).includes(choice),
      function_key: result.function_key, version: result.version, confidence: result.confidence ?? null };
  };
  /**
   * What this link hands on — by rule, template, model or the person — fixed and saved before anything reaches the next
   * station. A judgment that holds the content back stops the run instead.
   */
  const prepareHandoff = async (caller: ActionExecutionContext, content: WorkflowContentPorts, reach: Reach, current: WorkflowInstance, from: number,
    input: ContinueInput): Promise<{ stopped: WorkflowInstance } | { instance: WorkflowInstance; pending: Pending }> => {
    const resolved = { ...current.chain, stations: await Promise.all(current.chain.stations.map((station, index) => index < from ? station : resolveStation(reach, content, station))) };
    const link = current.chain.links[from]!;
    const readiness = linkReadiness(link, ports.aiAvailable());
    if (!readiness.ready) throw new WorkflowError("workflows.not_ready", `这一段还没接上：${readiness.reason}`);
    const handed = await readStep(content, current, from);
    let output: WorkflowPayload, actor: WorkflowHandoff["actor"], rule: string | undefined, judged: WorkflowVerdict | undefined;
    if (link.kind === "manual") {
      const edited = { title: (input.title ?? "").trim().slice(0, 200), body: (input.body ?? "").trim() };
      if (!edited.title || !edited.body) throw new WorkflowError("workflows.invalid", "交过去的内容需要标题和正文");
      const unchanged = edited.title === handed.title.trim() && edited.body === handed.body.trim();
      output = { ...handed, ...edited, feed_item_id: unchanged ? handed.feed_item_id ?? null : null };
      actor = "person";
    } else if (link.kind === "judgment") {
      // The rule only decides whether this content goes on; what goes on is the step's own content.
      const verdict = await judge(reach, link, handed);
      if (!verdict.passed) {
        await caller.beforeEffect();
        const at = new Date().toISOString();
        const reason = verdict.status === "needs_review" ? "判断需要人确认，这一次没有交过去" : `判断结果是「${verdict.choice ?? "无"}」，不在可以交过去的结果里`;
        return { stopped: await ports.withStore(store => store.saveInstance(current, { ...current, status: "stopped", stopped: { at, from, reason, verdict }, updated_at: at })) };
      }
      output = handed; actor = "judgment"; judged = verdict;
      rule = link.judgment!.title ?? link.judgment!.capability_id;
    } else if (link.kind === "function") {
      output = applyFunctionRule(link, handed);
      actor = "function";
      rule = `标题：${link.title_template || "{标题}"}\n正文：${link.body_template}`;
    } else {
      if (!ports.completeText) throw new WorkflowError("workflows.not_ready", "这一段还没接上：还没有可用的文字模型");
      const prompt = aiHandoffPrompt(link, handed, await labelOf(content, current.chain.stations[from]!.plugin), await labelOf(content, current.chain.stations[from + 1]!.plugin));
      caller.signal?.throwIfAborted();
      output = parseAiHandoff(await ports.completeText(prompt, { signal: caller.signal, beforeDispatch: caller.beforeEffect }), handed);
      actor = "ai";
      rule = link.instructions;
    }
    if (!output.body.trim()) throw new WorkflowError("workflows.invalid", "交接后的正文是空的，没有交过去");
    const pending: Pending = { key: handoffKey(current, from), kind: link.kind, actor, at: new Date().toISOString(), input: handed, output,
      ...(rule ? { rule } : {}), ...(judged ? { verdict: judged } : {}) };
    await caller.beforeEffect();
    // Losing a race here delivers nothing: the other call's fixed handoff wins.
    return { pending, instance: await ports.withStore(store => store.saveInstance(current, { ...withPending(current, from, pending), chain: resolved })) };
  };
  /**
   * Runs an action step with the fixed handoff mapped into its fields. Actions carry no delivery key, so a run whose result
   * was never confirmed is not repeated unless the person says so; the attempt is recorded before the call.
   */
  const runActionStep = async (caller: ActionExecutionContext, reach: Reach, current: WorkflowInstance, from: number, pending: Pending, target: WorkflowStation & { action: WorkflowActionStep },
    retry: boolean): Promise<{ instance: WorkflowInstance; arrived: WorkflowItemRef; arrival: { payload: WorkflowPayload; result: unknown; result_presentation?: ActionResultPresentation; result_truncated?: true } }> => {
    if (pending.attempted_at && !retry) {
      throw new WorkflowError("workflows.uncertain", `上次执行「${target.action.title}」${pending.attempt_error ? `时出错（${pending.attempt_error}）` : "没有确认结果"}；请先到${target.action.group ?? "对应插件"}确认是否已经生效，再决定是否重试`);
    }
    const choice = await resolveAction(reach, target);
    const mapped = mapActionInput(target.action, pending.output);
    const definition = (await reach.find(choice.ref))!.action;
    ports.assertInput(definition.input_schema, mapped);
    const attempt: Pending = { ...pending, attempted_at: new Date().toISOString() };
    await caller.beforeEffect();
    const instance = await ports.withStore(store => store.saveInstance(current, withPending(current, from, attempt)));
    let result: unknown;
    try { result = await reach.invoke(choice.ref, mapped); }
    catch (error) {
      // A provider may write before propagating a downstream authorization/validation error.
      // Once invoked, no error code proves that nothing happened: only an explicit retry may resend.
      const settled = { ...attempt, attempt_error: (error instanceof Error ? error.message : String(error)).slice(0, 400) };
      await caller.beforeEffect();
      await ports.withStore(store => store.saveInstance(instance, withPending(instance, from, settled))).catch(() => undefined);
      throw error;
    }
    const presentation = presentActionResult(definition.result_view, result, projectId);
    const encoded = JSON.stringify(result ?? null);
    return { instance, arrived: { plugin: "action", item_id: `${choice.ref.capability_id}@${choice.ref.version}:${attempt.key}`, title: target.action.title },
      arrival: { payload: attempt.output, result: encoded.length > 20_000 ? { truncated: true, bytes: encoded.length } : result ?? null,
        ...(presentation ? { result_presentation: presentation } : {}), ...(encoded.length > 20_000 ? { result_truncated: true } : {}) } };
  };
  return [
    bind(workflowsActions.list, async (_input, content, _caller, reach) => ({
      workflows: await Promise.all((await ports.withStore(store => store.list(projectId))).map(row => describe(content, row, reach))),
      stations: await content.stations(), ai_available: ports.aiAvailable() })),
    bind(workflowsActions.get, async (input, content, _caller, reach) => {
      const { workflow: row, instances } = await ports.withStore(store => ({ workflow: store.get(input.id, projectId), instances: store.instances(input.id, projectId) }));
      return { workflow: await describe(content, row, reach), instances, ai_available: ports.aiAvailable() };
    }),
    bind(workflowsActions.create, async (input, content, caller, reach) => {
      const chainValue = await validChain(content, input.chain, reach);
      await caller.beforeEffect();
      return changed({ workflow: await ports.withStore(store => store.create({ project_id: projectId, title: input.title ?? "", chain: chainValue })) });
    }),
    bind(workflowsActions.update, async (input, content, caller, reach) => {
      const chainValue = input.chain === undefined ? undefined : await validChain(content, input.chain, reach);
      await caller.beforeEffect();
      return changed({ workflow: await ports.withStore(store => store.update(input.id, projectId, { revision: input.revision, title: input.title, chain: chainValue })) });
    }),
    bind(workflowsActions.delete, async (input, _content, caller) => {
      await caller.beforeEffect();
      await ports.withStore(store => store.delete(input.id, projectId));
      return changed({ ok: true as const });
    }),
    bind(workflowsActions.stationItems, async (input, content) => {
      const info = (await content.stations()).find(station => station.plugin === input.plugin);
      if (!info?.supported) throw new WorkflowError("workflows.invalid", "这个插件暂不能串进流程");
      return { items: await content.listStartItems(input.plugin), can_start_blank: info.can_start_blank };
    }),
    bind(workflowsActions.start, async (input, content, caller, reach) => {
      const stored = await ports.withStore(store => store.get(input.id, projectId));
      const current = { ...stored, ...await validChain(content, stored, reach) };
      if (current.stations.length < 2) throw new WorkflowError("workflows.invalid", "流程至少要有两站才能开始");
      const first = current.stations[0]!;
      const itemId = input.item_id?.trim();
      let item: WorkflowItemRef;
      if (itemId) {
        item = { plugin: first.plugin, item_id: itemId, title: (await content.read({ plugin: first.plugin, item_id: itemId, title: "" }, first.content)).title };
      } else {
        const info = (await content.stations()).find(station => station.plugin === first.plugin);
        if (!info?.can_start_blank) throw new WorkflowError("workflows.invalid", `请先在 ${info?.label ?? first.plugin} 里选一条内容`);
        await caller.beforeEffect();
        item = await content.createBlank(first.plugin, input.title?.trim() || `${current.title} · 新的一次`, first.content);
      }
      await caller.beforeEffect();
      return changed({ instance: await ports.withStore(store => store.startInstance(current, item)) });
    }),
    bind(workflowsActions.instance, async (input, content, _caller, reach) => {
      const { current, title } = await ports.withStore(store => { const current = live(store, input.id); return { current, title: workflowTitle(store, current) }; });
      return { instance: { ...current, chain: await describe(content, current.chain, reach) }, workflow_title: title, ai_available: ports.aiAvailable() };
    }),
    bind(workflowsActions.preview, async (input, content) => {
      const current = await ports.withStore(store => live(store, input.id));
      const from = handoffIndex(current, input.from);
      const link = current.chain.links[from]!;
      const readiness = linkReadiness(link, ports.aiAvailable());
      const handed = await readStep(content, current, from);
      return { from, link, readiness, input: handed, output: link.kind === "function" && readiness.ready ? applyFunctionRule(link, handed) : null };
    }),
    bind(workflowsActions.continue, async (input, content, caller, reach) => {
      let current = await ports.withStore(store => live(store, input.id));
      if (input.updated_at !== undefined && input.updated_at !== current.updated_at) {
        throw new WorkflowError("workflows.conflict", "这一次刚被推进过，已载入最新进度");
      }
      const from = handoffIndex(current, input.from);
      let pending = current.steps[from]!.pending;
      if (!pending) {
        const prepared = await prepareHandoff(caller, content, reach, current, from, input);
        if ("stopped" in prepared) return changed({ instance: prepared.stopped });
        ({ instance: current, pending } = prepared);
      } else if (current.chain.links[from]!.kind === "manual" && input.body !== undefined
        && ((input.title ?? "").trim().slice(0, 200) !== pending.output.title || (input.body ?? "").trim() !== pending.output.body)) {
        throw new WorkflowError("workflows.conflict", "这一步已经在交接另一份内容，已载入最新进度");
      }
      await caller.beforeEffect();
      const target = current.chain.stations[from + 1]!;
      let arrived: WorkflowItemRef;
      let arrival: { payload?: WorkflowPayload; result?: unknown; result_presentation?: ActionResultPresentation; result_truncated?: true } = {};
      if (isActionStation(target)) ({ instance: current, arrived, arrival } = await runActionStep(caller, reach, current, from, pending, target, input.retry_action === true));
      else arrived = await content.receive(target.plugin, pending.output, { instance_id: current.instance_id, step: from + 1, title: current.title }, target.content);
      await caller.beforeEffect();
      const { attempted_at: _attempted, attempt_error: _error, ...recorded } = pending;
      try {
        const base = current;
        return changed({ instance: await ports.withStore(store => store.saveInstance(base, advanceInstance(base, from, recorded, arrived, recorded.at, arrival))) });
      } catch (error) {
        // Another call already recorded this exact delivery: reuse it rather than report a failure that did not happen.
        const latest = await ports.withStore(store => store.instance(current.instance_id, projectId));
        if (latest.steps[from]?.handoff?.key === recorded.key) return { instance: latest };
        throw error;
      }
    }),
    bind(workflowsActions.usages, async input => ({ usages: await ports.withStore(store => store.list(projectId)).then(rows => rows.flatMap(flow => workflowUsages(flow, input.action))) })),
    bind(workflowsActions.stop, async (input, _content, caller) => {
      await caller.beforeEffect();
      return changed({ instance: await ports.withStore(store => store.stopInstance(input.id, projectId)) });
    }),
    bind(workflowsActions.actionSteps, async (_input, _content, _caller, reach) => ({ actions: workflowActionChoices(await reach.all()), fields: WORKFLOW_PAYLOAD_FIELDS })),
    bind(workflowsActions.judgments, async (_input, _content, _caller, reach) => ({ judgments: workflowJudgmentChoices(await reach.all()) })),
  ];
}

const CONTENT_ROLE: Readonly<Record<string, string>> = { list: "列出内容", read: "读取内容", receive: "接收内容", create: "新建空白内容" };
const FIELD_NAME: Readonly<Record<string, string>> = { title: "标题", body: "正文", source: "来源", url: "链接", date: "日期" };
/** Every place in one workflow that names this capability, in the words the editor uses. */
export function workflowUsages(flow: Pick<Workflow, "workflow_id" | "title" | "stations" | "links">, action: ActionReference): ActionUsage[] {
  const usages: ActionUsage[] = [];
  flow.stations.forEach((station, index) => {
    if (station.action && referencesAction(station.action.ref, action)) {
      const fields = Object.entries(station.action.mapping).map(([name, source]) => "from" in source ? `${name} ← ${FIELD_NAME[source.from] ?? source.from}` : `${name} = ${String(source.value)}`);
      usages.push({ usage_id: `${flow.workflow_id}:step:${station.station_id}`, title: `流程「${flow.title}」第 ${index + 1} 步`, enabled: true,
        detail: fields.length ? `执行这个动作；${fields.join("，")}` : "执行这个动作，不传入字段" });
    }
    for (const [role, ref] of Object.entries(station.content?.actions ?? {})) {
      if (ref && referencesAction(ref, action)) usages.push({ usage_id: `${flow.workflow_id}:station:${station.station_id}:${role}`, title: `流程「${flow.title}」第 ${index + 1} 站`,
        detail: `这一站用它${CONTENT_ROLE[role] ?? role}`, enabled: true });
    }
  });
  flow.links.forEach((link, index) => {
    if (link.kind !== "judgment" || !link.judgment || !referencesAction(link.judgment, action)) return;
    const pass = link.pass ?? [];
    usages.push({ usage_id: `${flow.workflow_id}:link:${index}`, title: `流程「${flow.title}」第 ${index + 1} → ${index + 2} 步的交接`, enabled: pass.length > 0,
      detail: pass.length ? `判断结果为 ${pass.join("、")} 时交给下一站` : "还没选哪些结果可以交过去" });
  });
  return usages;
}

function handoffIndex(current: WorkflowInstance, raw: unknown): number {
  const from = Number(raw ?? current.current);
  if (!Number.isInteger(from) || from < 0 || from >= current.chain.links.length) throw new WorkflowError("workflows.invalid", "这一步后面没有下一站");
  if (current.status !== "active") throw new WorkflowError("workflows.invalid", current.status === "done" ? "这一次已经走完" : "这一次已经结束");
  if (from !== current.current) throw new WorkflowError("workflows.conflict", "这一步已经交过了");
  return from;
}

function workflowTitle(store: WorkflowsStore, current: WorkflowInstance): string {
  try { return store.get(current.workflow_id, current.project_id).title; } catch { return "已删除的流程"; }
}
