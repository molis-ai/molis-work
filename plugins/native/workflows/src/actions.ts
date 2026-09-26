import { ActionError, type ActionCallContext, type ActionDefinition, type ActionHandlerBinding, type ActionReference, type ActionSchema, type ActionView, type WorkflowContentBinding, type WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  WorkflowError, advanceInstance, aiHandoffPrompt, applyFunctionRule, handoffKey, linkReadiness, parseAiHandoff, parseChain, withPendingLinks,
  type Workflow, type WorkflowChain, type WorkflowHandoff, type WorkflowInstance, type WorkflowItemRef, type WorkflowLink, type WorkflowPayload, type WorkflowVerdict,
} from "./model.js";

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
import type { WorkflowSummary, WorkflowsStore } from "./store.js";

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
  aiAvailable(): boolean;
  completeText?(prompt: string, options: { signal?: AbortSignal }): Promise<string>;
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
  permissions: readonly string[]): ActionDefinition<I, O> {
  // Handoffs wait on other plugins and on a model; the store's revisions and delivery keys keep concurrent calls safe.
  return { capability_id: `workflows.${name}`, version: 1, operation, action: { title, description, kind: operation === "query" ? "query" : "operation",
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
  continue: define<{ id: string; from?: number; updated_at?: string; title?: string; body?: string }, { instance: WorkflowInstance }>("instances.continue", "交给下一站",
    "按这一段的交接方式（模板转换、AI 整理或人工交接）把内容交给下一站；同一步重试只交付一次", "command",
    object({ id, from: { type: "integer", minimum: 0 }, updated_at: text, title: { type: "string", maxLength: 400 }, body: { type: "string", maxLength: 100_000 } }, ["id"]),
    object({ instance }), [...write, "model:invoke"]),
  judgments: define<Record<string, never>, { judgments: WorkflowJudgmentChoice[] }>("judgments.list", "可用的判断规则",
    "列出可以放在一段交接上的已发布 Choice 判断规则及其可选结果", "query", object({}), object({ judgments: { type: "array" } }), read),
  stop: define<{ id: string }, { instance: WorkflowInstance }>("instances.stop", "结束一次运行", "结束还在进行的一次运行，已交接的内容保留", "command",
    object({ id }), object({ instance }), write),
};
export const WORKFLOWS_ACTIONS: readonly ActionDefinition[] = Object.values(workflowsActions);
export const WORKFLOWS_ACTION_PERMISSIONS = [...new Set(WORKFLOWS_ACTIONS.flatMap(definition => definition.action.permissions))];

export function createWorkflowsActionHandlers(projectId: string, ports: WorkflowsActionPorts): ActionHandlerBinding[] {
  const scoped = (caller: ActionCallContext) => {
    if (caller.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "请求项目与流程所在项目不一致");
    // The workflow is the consumer of each station; the caller's permissions and exact grants still bound every nested call.
    return ports.content({ ...caller, audience: "workflow" });
  };
  const bind = <I, O>(definition: ActionDefinition<I, O>, handle: (input: I, content: WorkflowContentPorts, caller: ActionCallContext & { beforeEffect(): Promise<void> }) => Promise<O>): ActionHandlerBinding => ({
    capability_id: definition.capability_id, version: definition.version, handle: (caller, input) => handle(input as I, scoped(caller), caller),
  });
  const validChain = async (content: WorkflowContentPorts, value: unknown): Promise<WorkflowChain> => {
    const parsed = parseChain(value);
    return { ...parsed, stations: await Promise.all(parsed.stations.map(station => content.resolveStation(station))) };
  };
  const describe = async <T extends WorkflowChain>(content: WorkflowContentPorts, chainValue: T): Promise<T> => ({ ...chainValue,
    stations: await Promise.all(chainValue.stations.map(async station => {
      try { await content.resolveStation(station); return { ...station, availability: { available: true } }; }
      catch (error) { return { ...station, availability: { available: false, reason: error instanceof Error ? error.message : "站点不可用" } }; }
    })),
  });
  const labelOf = async (content: WorkflowContentPorts, plugin: string) => (await content.stations()).find(station => station.plugin === plugin)?.label ?? plugin;
  const live = (store: WorkflowsStore, instanceId: string): WorkflowInstance => {
    const current = store.instance(instanceId, projectId);
    try { return withPendingLinks(current, store.get(current.workflow_id, projectId)); } catch { return current; }
  };
  const readStep = async (content: WorkflowContentPorts, current: WorkflowInstance, index: number): Promise<WorkflowPayload> => {
    const item = current.steps[index]?.item;
    if (!item) throw new WorkflowError("workflows.invalid", "这一步还没有内容");
    try { return await content.read(item, current.chain.stations[index]!.content); }
    catch (error) {
      if (error instanceof WorkflowError || (error instanceof Error && "code" in error)) throw error;
      throw new WorkflowError("workflows.missing", `这一次在 ${await labelOf(content, item.plugin)} 里的内容已经读不到了（可能被删除）`);
    }
  };
  const changed = <T>(value: T) => { ports.changed?.(); return value; };
  /** Runs the link's exact rule on the step's content, with the caller's own authority; a changed or revoked rule stops here. */
  const judge = async (caller: ActionCallContext, link: WorkflowLink, handed: WorkflowPayload): Promise<WorkflowVerdict> => {
    const ref = link.judgment!;
    const reach = ports.actions({ ...caller, audience: "workflow" });
    const view = (await reach.discover()).find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    if (!view) throw new WorkflowError("workflows.not_ready", "这一段的判断规则已不可用或版本已变化；原引用已保留，请重新选择");
    if (!view.availability.available) throw new WorkflowError("workflows.not_ready", `这一段的判断规则暂不可用：${view.availability.reason}`);
    const content = [handed.title, handed.body].filter(Boolean).join("\n\n").slice(0, 8000);
    const result = await reach.invoke({ capability_id: ref.capability_id, version: ref.version, provider_id: ref.provider_id }, { content }) as
      { status: "ok" | "needs_review"; function_key: string; version: number; data: { choice?: string | null }; confidence: number | null };
    const choice = result.data?.choice ?? null;
    return { choice, status: result.status, passed: result.status === "ok" && !!choice && (link.pass ?? []).includes(choice),
      function_key: result.function_key, version: result.version, confidence: result.confidence ?? null };
  };
  return [
    bind(workflowsActions.list, async (_input, content) => ({
      workflows: await Promise.all((await ports.withStore(store => store.list(projectId))).map(row => describe(content, row))),
      stations: await content.stations(), ai_available: ports.aiAvailable() })),
    bind(workflowsActions.get, async (input, content) => {
      const { workflow: row, instances } = await ports.withStore(store => ({ workflow: store.get(input.id, projectId), instances: store.instances(input.id, projectId) }));
      return { workflow: await describe(content, row), instances, ai_available: ports.aiAvailable() };
    }),
    bind(workflowsActions.create, async (input, content, caller) => {
      const chainValue = await validChain(content, input.chain);
      await caller.beforeEffect();
      return changed({ workflow: await ports.withStore(store => store.create({ project_id: projectId, title: input.title ?? "", chain: chainValue })) });
    }),
    bind(workflowsActions.update, async (input, content, caller) => {
      const chainValue = input.chain === undefined ? undefined : await validChain(content, input.chain);
      await caller.beforeEffect();
      return changed({ workflow: await ports.withStore(store => store.update(input.id, projectId, { revision: input.revision, title: input.title, chain: chainValue })) });
    }),
    bind(workflowsActions.delete, async input => { await ports.withStore(store => store.delete(input.id, projectId)); return changed({ ok: true as const }); }),
    bind(workflowsActions.stationItems, async (input, content) => {
      const info = (await content.stations()).find(station => station.plugin === input.plugin);
      if (!info?.supported) throw new WorkflowError("workflows.invalid", "这个插件暂不能串进流程");
      return { items: await content.listStartItems(input.plugin), can_start_blank: info.can_start_blank };
    }),
    bind(workflowsActions.start, async (input, content, caller) => {
      const stored = await ports.withStore(store => store.get(input.id, projectId));
      const current = { ...stored, ...await validChain(content, stored) };
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
    bind(workflowsActions.instance, async (input, content) => {
      const { current, title } = await ports.withStore(store => { const current = live(store, input.id); return { current, title: workflowTitle(store, current) }; });
      return { instance: { ...current, chain: await describe(content, current.chain) }, workflow_title: title, ai_available: ports.aiAvailable() };
    }),
    bind(workflowsActions.preview, async (input, content) => {
      const current = await ports.withStore(store => live(store, input.id));
      const from = handoffIndex(current, input.from);
      const link = current.chain.links[from]!;
      const readiness = linkReadiness(link, ports.aiAvailable());
      const handed = await readStep(content, current, from);
      return { from, link, readiness, input: handed, output: link.kind === "function" && readiness.ready ? applyFunctionRule(link, handed) : null };
    }),
    bind(workflowsActions.continue, async (input, content, caller) => {
      let current = await ports.withStore(store => live(store, input.id));
      if (input.updated_at !== undefined && input.updated_at !== current.updated_at) {
        throw new WorkflowError("workflows.conflict", "这一次刚被推进过，已载入最新进度");
      }
      const from = handoffIndex(current, input.from);
      const key = handoffKey(current, from);
      let pending = current.steps[from]!.pending;
      if (!pending) {
        const resolved = { ...current.chain, stations: await Promise.all(current.chain.stations.map((station, index) => index < from ? station : content.resolveStation(station))) };
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
          const verdict = await judge(caller, link, handed);
          if (!verdict.passed) {
            await caller.beforeEffect();
            const at = new Date().toISOString();
            const reason = verdict.status === "needs_review" ? "判断需要人确认，这一次没有交过去" : `判断结果是「${verdict.choice ?? "无"}」，不在可以交过去的结果里`;
            const held = current;
            return changed({ instance: await ports.withStore(store => store.saveInstance(held, { ...held, status: "stopped", stopped: { at, from, reason, verdict }, updated_at: at })) });
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
          output = parseAiHandoff(await ports.completeText(prompt, { signal: caller.signal }), handed);
          actor = "ai";
          rule = link.instructions;
        }
        if (!output.body.trim()) throw new WorkflowError("workflows.invalid", "交接后的正文是空的，没有交过去");
        pending = { key, kind: link.kind, actor, at: new Date().toISOString(), input: handed, output, ...(rule ? { rule } : {}), ...(judged ? { verdict: judged } : {}) };
        await caller.beforeEffect();
        // The fixed handoff is saved before anything reaches the next station; losing a race here delivers nothing.
        const savedPending = pending;
        current = await ports.withStore(store => store.saveInstance(current, { ...current, chain: resolved,
          steps: current.steps.map((step, index) => index === from ? { ...step, pending: savedPending } : step), updated_at: new Date().toISOString() }));
      } else if (current.chain.links[from]!.kind === "manual" && input.body !== undefined
        && ((input.title ?? "").trim().slice(0, 200) !== pending.output.title || (input.body ?? "").trim() !== pending.output.body)) {
        throw new WorkflowError("workflows.conflict", "这一步已经在交接另一份内容，已载入最新进度");
      }
      await caller.beforeEffect();
      const arrived = await content.receive(current.chain.stations[from + 1]!.plugin, pending.output,
        { instance_id: current.instance_id, step: from + 1, title: current.title }, current.chain.stations[from + 1]!.content);
      const handoff = pending;
      try {
        const base = current;
        return changed({ instance: await ports.withStore(store => store.saveInstance(base, advanceInstance(base, from, handoff, arrived, handoff.at))) });
      } catch (error) {
        // Another call already recorded this exact delivery: reuse it rather than report a failure that did not happen.
        const latest = await ports.withStore(store => store.instance(current.instance_id, projectId));
        if (latest.steps[from]?.handoff?.key === key) return { instance: latest };
        throw error;
      }
    }),
    bind(workflowsActions.stop, async input => changed({ instance: await ports.withStore(store => store.stopInstance(input.id, projectId)) })),
    bind(workflowsActions.judgments, async (_input, _content, caller) => ({ judgments: workflowJudgmentChoices(await ports.actions({ ...caller, audience: "workflow" }).discover()) })),
  ];
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
