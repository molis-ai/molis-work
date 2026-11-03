import type { InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import type { PluginModelResult } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError, retainActionAuthority, defineActionUsagesAction, referencesAction, type ActionAvailability, type ActionDefinition, type ActionExecutionContext, type ActionHandlerBinding, type ActionReference, type ActionSchema, type ActionUsage, type ActionView, type WorkflowContentBinding, type WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  applyFunctionRule, linkReadiness, parseChain, withPendingLinks,
  isActionStation, WORKFLOW_PAYLOAD_FIELDS, WORKFLOWS_PLUGIN_ID,
  type Workflow, type WorkflowChain, type WorkflowInstance, type WorkflowItemRef, type WorkflowLink, type WorkflowPayload, type WorkflowStation,
} from "./model.js";
import type { WorkflowSummary, WorkflowsStore, WorkflowsStores } from "./store.js";
import { createWorkflowsSearchHandlers, workflowsSearchActions } from "./search.js";
import { workflowsErrors } from "./error.js";
import { createWorkflowRunControls } from "./run-control.js";
import { createWorkflowContinuation, handoffIndex } from "./continuation.js";
import { prepareHandoff, workflowJudgmentChoices, type WorkflowJudgmentChoice } from "./handoff.js";
import { labelOf, readStep, reachFor, resolveStation, runActionStep, workflowActionChoices, type Reach, type WorkflowActionChoice } from "./step-runner.js";

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
  /** False for a station that only starts a run: it stands first and is never handed content. */
  readonly receives?: boolean;
}

/** Cross-plugin content, bound per call to the caller's own authority. */
export interface WorkflowContentPorts {
  stations(): Promise<readonly WorkflowStationInfo[]>;
  resolveStation(station: WorkflowChain["stations"][number]): Promise<WorkflowChain["stations"][number]>;
  listStartItems(plugin: string): Promise<readonly WorkflowStartItem[]>;
  createBlank(plugin: string, title: string, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
  read(item: WorkflowItemRef, content?: WorkflowContentBinding): Promise<WorkflowPayload>;
  /** Receivers return the same item for the same request id: a workflow's is the one for an instance and a step (`workflowRequestId`). */
  receive(plugin: string, payload: WorkflowPayload, requestId: string, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
}

/** Other registered actions, reached as the call's original caller (a step's action, a judgment rule on a link). */
interface WorkflowActionReach {
  discover(): Promise<readonly ActionView[]>;
  invoke(reference: ActionReference & { provider_id: string }, input: unknown): Promise<unknown>;
  /** Refuses as `invoke` would (a target this caller cannot reach, an input its schema rejects) without running the target or logging a call. */
  check(reference: ActionReference & { provider_id: string }, input: unknown): Promise<void>;
}

/**
 * Where the handlers read and write (`read`, `write`) and how they reach the rest of the directory. `content` and `actions` are given
 * the call's own authority and bound to it: every nested call is the original caller's, under the workflow audience.
 */
export interface WorkflowsActionPorts extends WorkflowsStores {
  content(caller: ActionExecutionContext): WorkflowContentPorts;
  actions(caller: ActionExecutionContext): WorkflowActionReach;
  /** Whether the text model can be used now, and why not in the person's words. */
  textModel(): ActionAvailability;
  /** The full result, so the synchronous `validateResult()` can run inside the write transaction. */
  complete?(prompt: InstructedPrompt, options: { signal?: AbortSignal; beforeDispatch(): void | Promise<void> }): Promise<PluginModelResult>;
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
  stop: define<{ id: string }, { instance: WorkflowInstance }>("instances.stop", "结束一次运行", "取消当前尚未提交的步骤；已发生的外部结果保留，未知结果不自动重派", "command",
    object({ id }), object({ instance }), write),
  searchEntries: workflowsSearchActions.entries,
  subject: workflowsSearchActions.subject,
};
export const WORKFLOWS_ACTIONS: readonly ActionDefinition[] = Object.values(workflowsActions);
export const WORKFLOWS_ACTION_PERMISSIONS = [...new Set(WORKFLOWS_ACTIONS.flatMap(definition => definition.action.permissions))];

export function createWorkflowsActionHandlers(projectId: string, ports: WorkflowsActionPorts): ActionHandlerBinding[] {
  const runs = createWorkflowRunControls(projectId, ports.read);
  type ContinueInput = (typeof workflowsActions.continue) extends ActionDefinition<infer I, unknown> ? I : never;
  const scoped = (caller: ActionExecutionContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与流程所在项目不一致");
    // The workflow is the consumer of each station: the port reaches the directory as the original caller under that audience, so the
    // caller's permissions and exact grants still bound every nested call.
    return ports.content(caller);
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, content: WorkflowContentPorts, caller: ActionExecutionContext, reach: Reach, original: ActionExecutionContext) => Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: async (caller, input) => {
      const run = definition === workflowsActions.continue ? runs.acquire((input as ContinueInput).id, caller) : null;
      try {
        const execution = run?.caller ?? caller;
        const authority = retainActionAuthority(execution, { ...definition, provider_id: WORKFLOWS_PLUGIN_ID }, execution.beforeEffect);
        return await handle(input as I, scoped(authority), execution, reachFor(ports, authority), caller);
      } finally { run?.release(); }
    },
  });
  const validChain = async (content: WorkflowContentPorts, value: unknown, reach: Reach): Promise<WorkflowChain> => {
    const parsed = parseChain(value);
    if (parsed.stations[0] && isActionStation(parsed.stations[0])) throw workflowsErrors.invalid("第一站要选一个能挑出内容的插件，动作只能接在后面");
    const stations = await Promise.all(parsed.stations.map(station => resolveStation(reach, content, station)));
    return { ...parsed, stations: await sourcesFirst(stations, plugin => labelOf(content, plugin)) };
  };
  const describe = async <T extends WorkflowChain>(content: WorkflowContentPorts, chainValue: T, reach: Reach): Promise<T> => ({ ...chainValue,
    stations: await Promise.all(chainValue.stations.map(async station => {
      try { await resolveStation(reach, content, station); return { ...station, availability: { available: true } }; }
      catch (error) { return { ...station, availability: { available: false, reason: error instanceof Error ? error.message : "站点不可用" } }; }
    })),
  });
  const live = (store: WorkflowsStore, instanceId: string): WorkflowInstance => {
    const current = store.instance(instanceId, projectId);
    try { return withPendingLinks(current, store.get(current.workflow_id, projectId)); } catch { return current; }
  };
  const changed = <T>(value: T) => { ports.changed?.(); return value; };
  /** One write: the call's `beforeEffect()` is awaited first, then its authority and signal are checked again inside the transaction, before the first SQL. */
  const commit = <T>(caller: ActionExecutionContext, run: (store: WorkflowsStore) => T): Promise<T> =>
    ports.write(caller, store => { caller.assert_authority_current?.(); caller.signal?.throwIfAborted(); return run(store); });
  const scope = { projectId, commit, ports };
  return [
    bind(workflowsActions.list, async (_input, content, _caller, reach) => ({
      workflows: await Promise.all(ports.read(store => store.list(projectId)).map(row => describe(content, row, reach))),
      stations: await content.stations(), ai_available: ports.textModel().available })),
    bind(workflowsActions.get, async (input, content, _caller, reach) => {
      const { workflow: row, instances } = ports.read(store => ({ workflow: store.get(input.id, projectId), instances: store.instances(input.id, projectId) }));
      return { workflow: await describe(content, row, reach), instances, ai_available: ports.textModel().available };
    }),
    bind(workflowsActions.create, async (input, content, caller, reach) => {
      const chainValue = await validChain(content, input.chain, reach);
      return changed({ workflow: await commit(caller, store => store.create({ project_id: projectId, title: input.title ?? "", chain: chainValue })) });
    }),
    bind(workflowsActions.update, async (input, content, caller, reach) => {
      const chainValue = input.chain === undefined ? undefined : await validChain(content, input.chain, reach);
      return changed({ workflow: await commit(caller, store => store.update(input.id, projectId, { revision: input.revision, title: input.title, chain: chainValue })) });
    }),
    bind(workflowsActions.delete, async (input, _content, caller) => {
      await commit(caller, store => store.delete(input.id, projectId));
      return changed({ ok: true as const });
    }),
    bind(workflowsActions.stationItems, async (input, content) => {
      const info = (await content.stations()).find(station => station.plugin === input.plugin);
      if (!info?.supported) throw workflowsErrors.invalid("这个插件暂不能串进流程");
      return { items: await content.listStartItems(input.plugin), can_start_blank: info.can_start_blank };
    }),
    bind(workflowsActions.start, async (input, content, caller, reach) => {
      const stored = ports.read(store => store.get(input.id, projectId));
      const current = { ...stored, ...await validChain(content, stored, reach) };
      if (current.stations.length < 2) throw workflowsErrors.invalid("流程至少要有两站才能开始");
      const first = current.stations[0]!;
      const itemId = input.item_id?.trim();
      let item: WorkflowItemRef;
      if (itemId) {
        item = { plugin: first.plugin, item_id: itemId, title: (await content.read({ plugin: first.plugin, item_id: itemId, title: "" }, first.content)).title };
      } else {
        const info = (await content.stations()).find(station => station.plugin === first.plugin);
        if (!info?.can_start_blank) throw workflowsErrors.invalid(`请先在 ${info?.label ?? first.plugin} 里选一条内容`);
        await caller.beforeEffect();
        item = await content.createBlank(first.plugin, input.title?.trim() || `${current.title} · 新的一次`, first.content);
      }
      return changed({ instance: await commit(caller, store => store.startInstance(current, item)) });
    }),
    bind(workflowsActions.instance, async (input, content, _caller, reach) => {
      const { current, title } = ports.read(store => { const current = live(store, input.id); return { current, title: workflowTitle(store, current) }; });
      return { instance: { ...current, chain: await describe(content, current.chain, reach) }, workflow_title: title, ai_available: ports.textModel().available };
    }),
    bind(workflowsActions.preview, async (input, content) => {
      const current = ports.read(store => live(store, input.id));
      const from = handoffIndex(current, input.from);
      const link = current.chain.links[from]!;
      const readiness = linkReadiness(link, ports.textModel());
      const handed = await readStep(content, current, from);
      return { from, link, readiness, input: handed, output: link.kind === "function" && readiness.ready ? applyFunctionRule(link, handed) : null };
    }),
    bind(workflowsActions.continue, createWorkflowContinuation<Reach>({ projectId, read: ports.read, write: ports.write, commit, live, changed,
      prepareHandoff: (caller, content, reach, current, from, input) => prepareHandoff(scope, caller, content, reach, current, from, input),
      runActionStep: (caller, reach, current, from, pending, target, retry) => runActionStep(scope, caller, reach, current, from, pending, target, retry) })),
    bind(workflowsActions.usages, async input => ({ usages: ports.read(store => store.list(projectId)).flatMap(flow => workflowUsages(flow, input.action)) })),
    bind(workflowsActions.stop, async (input, _content, caller) => {
      const instance = await commit(caller, store => { const stopped = store.stopInstance(input.id, projectId); runs.stop(input.id); return stopped; });
      return changed({ instance });
    }),
    bind(workflowsActions.actionSteps, async (_input, _content, _caller, reach) => ({ actions: workflowActionChoices(await reach.all()), fields: WORKFLOW_PAYLOAD_FIELDS })),
    bind(workflowsActions.judgments, async (_input, _content, _caller, reach) => ({ judgments: workflowJudgmentChoices(await reach.all()) })),
    ...createWorkflowsSearchHandlers(projectId, ports.read),
  ];
}

/** A station that only provides content (the 成果库) starts a run; nothing is handed to it. */
async function sourcesFirst(stations: WorkflowStation[], labelOf: (plugin: string) => Promise<string>): Promise<WorkflowStation[]> {
  const late = stations.find((station, index) => index > 0 && !isActionStation(station) && !station.content?.actions.receive);
  if (late) throw workflowsErrors.invalid(`「${await labelOf(late.plugin)}」只能作为第一站：它提供内容，不接收交过来的内容`);
  return stations;
}

const CONTENT_ROLE: Readonly<Record<string, string>> = { list: "列出内容", read: "读取内容", receive: "接收内容", create: "新建空白内容" };
const FIELD_NAME: Readonly<Record<string, string>> = { title: "标题", body: "正文", source: "来源", url: "链接", date: "日期" };
/** Every place in one workflow that names this capability, in the words the editor uses. */
function workflowUsages(flow: Pick<Workflow, "workflow_id" | "title" | "stations" | "links">, action: ActionReference): ActionUsage[] {
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

function workflowTitle(store: WorkflowsStore, current: WorkflowInstance): string {
  try { return store.get(current.workflow_id, current.project_id).title; } catch { return "已删除的流程"; }
}
