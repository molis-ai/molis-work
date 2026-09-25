import type { WorkflowContentBinding, WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
export type { WorkflowStartItem } from "@molis-ai/molis-work-contracts/platform/actions";
import {
  WorkflowError,
  advanceInstance,
  aiHandoffPrompt,
  applyFunctionRule,
  linkReadiness,
  parseAiHandoff,
  parseChain,
  withPendingLinks,
  type WorkflowChain,
  type WorkflowHandoff,
  type WorkflowInstance,
  type WorkflowItemRef,
  type WorkflowPayload,
} from "./model.js";
import type { WorkflowsPluginRouteHandler, WorkflowsPluginRouteResponse } from "./routes.js";
import type { WorkflowsStore } from "./store.js";

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

/** Cross-plugin content is supplied by the bound, authenticated action client. */
export interface WorkflowsRoutePorts {
  readonly projectId: string;
  stations(): Promise<readonly WorkflowStationInfo[]>;
  resolveStation(station: WorkflowChain["stations"][number]): Promise<WorkflowChain["stations"][number]>;
  aiAvailable(): boolean;
  completeText?(prompt: string): Promise<string>;
  listStartItems(plugin: string): Promise<readonly WorkflowStartItem[]>;
  createBlank(plugin: string, title: string, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
  read(item: WorkflowItemRef, content?: WorkflowContentBinding): Promise<WorkflowPayload>;
  receive(plugin: string, payload: WorkflowPayload, context: { instance_id: string; step: number; title?: string }, content?: WorkflowContentBinding): Promise<WorkflowItemRef>;
  changed?(): void;
}

export function createWorkflowsRouteHandlers(
  store: WorkflowsStore,
  ports: WorkflowsRoutePorts,
): Record<string, WorkflowsPluginRouteHandler> {
  const projectId = ports.projectId;
  const stationMap = async () => new Map((await ports.stations()).map((station) => [station.plugin, station]));
  const validChain = async (value: unknown): Promise<WorkflowChain> => {
    const chain = parseChain(value);
    return { ...chain, stations: await Promise.all(chain.stations.map(station => ports.resolveStation(station))) };
  };
  const describeChain = async <T extends WorkflowChain>(chain: T): Promise<T> => ({ ...chain,
    stations: await Promise.all(chain.stations.map(async station => {
      try { await ports.resolveStation(station); return { ...station, availability: { available: true } }; }
      catch (error) { return { ...station, availability: { available: false, reason: error instanceof Error ? error.message : "站点不可用" } }; }
    })),
  });
  const labelOf = async (plugin: string) => (await stationMap()).get(plugin)?.label ?? plugin;
  const liveInstance = (instanceId: string): WorkflowInstance => {
    const instance = store.instance(instanceId, projectId);
    try {
      return withPendingLinks(instance, store.get(instance.workflow_id, projectId));
    } catch {
      return instance;
    }
  };

  return {
    "workflows.list": async () => ({
      status: 200,
      body: { workflows: await Promise.all(store.list(projectId).map(describeChain)), stations: await ports.stations(), ai_available: ports.aiAvailable() },
    }),
    "workflows.create": async ({ request }) => ({
      status: 200,
      body: { workflow: store.create({ project_id: projectId, title: text(request.body.title, 120), chain: await validChain(request.body.chain) }) },
    }),
    "workflows.get": async ({ params }) => ({
      status: 200,
      body: { workflow: await describeChain(store.get(params.id!, projectId)), instances: store.instances(params.id!, projectId), ai_available: ports.aiAvailable() },
    }),
    "workflows.update": async ({ params, request }) => {
      const revision = Number(request.body.revision);
      if (!Number.isInteger(revision)) throw new WorkflowError("workflows.invalid", "缺少流程版本");
      const workflow = store.update(params.id!, projectId, {
        revision,
        title: request.body.title === undefined ? undefined : text(request.body.title, 120),
        chain: request.body.chain === undefined ? undefined : await validChain(request.body.chain),
      });
      return { status: 200, body: { workflow } };
    },
    "workflows.delete": ({ params }) => {
      store.delete(params.id!, projectId);
      return { status: 200, body: { ok: true } };
    },
    "workflows.station_items": async ({ params }) => {
      const info = (await stationMap()).get(params.plugin!);
      if (!info?.supported) throw new WorkflowError("workflows.invalid", "这个插件暂不能串进流程");
      return { status: 200, body: { items: await ports.listStartItems(params.plugin!), can_start_blank: info.can_start_blank } };
    },
    "workflows.instance_start": async ({ params, request }) => {
      const stored = store.get(params.id!, projectId);
      const workflow = { ...stored, ...await validChain(stored) };
      if (workflow.stations.length < 2) throw new WorkflowError("workflows.invalid", "流程至少要有两站才能开始");
      const first = workflow.stations[0]!.plugin;
      const itemId = text(request.body.item_id, 200);
      let item: WorkflowItemRef;
      if (itemId) {
        const payload = await ports.read({ plugin: first, item_id: itemId, title: "" }, workflow.stations[0]!.content);
        item = { plugin: first, item_id: itemId, title: payload.title };
      } else {
        if (!(await stationMap()).get(first)?.can_start_blank) throw new WorkflowError("workflows.invalid", `请先在 ${await labelOf(first)} 里选一条内容`);
        item = await ports.createBlank(first, text(request.body.title, 120) || `${workflow.title} · 新的一次`, workflow.stations[0]!.content);
      }
      const instance = store.startInstance(workflow, item);
      ports.changed?.();
      return { status: 200, body: { instance } };
    },
    "workflows.instance_get": async ({ params }) => {
      const instance = liveInstance(params.id!);
      return { status: 200, body: { instance: { ...instance, chain: await describeChain(instance.chain) }, workflow_title: workflowTitle(store, instance), ai_available: ports.aiAvailable() } };
    },
    "workflows.instance_preview": async ({ params, request }) => {
      const instance = liveInstance(params.id!);
      const from = handoffIndex(instance, request.body.from);
      const link = instance.chain.links[from]!;
      const readiness = linkReadiness(link, ports.aiAvailable());
      const input = await readStep(ports, instance, from, labelOf);
      const output = link.kind === "function" && readiness.ready ? applyFunctionRule(link, input) : null;
      return { status: 200, body: { from, link, readiness, input, output } };
    },
    "workflows.instance_continue": async ({ params, request }) => {
      let instance = liveInstance(params.id!);
      if (typeof request.body.updated_at === "string" && request.body.updated_at !== instance.updated_at) {
        throw new WorkflowError("workflows.conflict", "这一次刚被推进过，已载入最新进度");
      }
      const from = handoffIndex(instance, request.body.from);
      const resolved = { ...instance.chain, stations: await Promise.all(instance.chain.stations.map((station, index) =>
        index < from ? station : ports.resolveStation(station))) };
      if (instance.chain.stations.some(station => !station.content)) {
        instance = store.saveInstance(instance, { ...instance, chain: resolved, updated_at: new Date().toISOString() });
      }
      const link = instance.chain.links[from]!;
      const readiness = linkReadiness(link, ports.aiAvailable());
      if (!readiness.ready) throw new WorkflowError("workflows.not_ready", `这一段还没接上：${readiness.reason}`);
      const nextPlugin = instance.chain.stations[from + 1]!.plugin;
      const input = await readStep(ports, instance, from, labelOf);
      let output: WorkflowPayload;
      let actor: WorkflowHandoff["actor"];
      let rule: string | undefined;
      if (link.kind === "manual") {
        const edited = { title: text(request.body.title, 200), body: text(request.body.body, 100_000) };
        if (!edited.title || !edited.body.trim()) throw new WorkflowError("workflows.invalid", "交过去的内容需要标题和正文");
        const unchanged = edited.title === input.title.trim() && edited.body === input.body.trim();
        output = { ...input, ...edited, feed_item_id: unchanged ? input.feed_item_id ?? null : null };
        actor = "person";
      } else if (link.kind === "function") {
        output = applyFunctionRule(link, input);
        actor = "function";
        rule = `标题：${link.title_template || "{标题}"}\n正文：${link.body_template}`;
      } else {
        if (!ports.completeText) throw new WorkflowError("workflows.not_ready", "这一段还没接上：还没有可用的文字模型");
        const prompt = aiHandoffPrompt(link, input, await labelOf(instance.chain.stations[from]!.plugin), await labelOf(nextPlugin));
        output = parseAiHandoff(await ports.completeText(prompt), input);
        actor = "ai";
        rule = link.instructions;
      }
      if (!output.body.trim()) throw new WorkflowError("workflows.invalid", "交接后的正文是空的，没有交过去");
      const at = new Date().toISOString();
      const arrived = await ports.receive(nextPlugin, output, { instance_id: instance.instance_id, step: from + 1, title: instance.title }, instance.chain.stations[from + 1]!.content);
      const handoff: WorkflowHandoff = { kind: link.kind, actor, at, input, output, ...(rule ? { rule } : {}) };
      const next = store.saveInstance(instance, advanceInstance(instance, from, handoff, arrived, at));
      ports.changed?.();
      return { status: 200, body: { instance: next } };
    },
    "workflows.instance_stop": ({ params }) => ({
      status: 200,
      body: { instance: store.stopInstance(params.id!, projectId) },
    }),
  };
}

export function workflowsRouteErrorResponse(error: unknown): WorkflowsPluginRouteResponse {
  const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
  const message = error instanceof Error ? error.message : "工作流程请求失败";
  if (code === "workflows.not_found") return { status: 404, body: { error: message, code } };
  if (code === "workflows.conflict") return { status: 409, body: { error: message, code } };
  if (code.startsWith("actions.")) return { status: code.includes("forbidden") ? 403 : 400, body: { error: message, code } };
  if (code.startsWith("workflows.")) return { status: 400, body: { error: message, code } };
  return { status: 400, body: { error: message } };
}

function handoffIndex(instance: WorkflowInstance, raw: unknown): number {
  const from = Number(raw ?? instance.current);
  if (!Number.isInteger(from) || from < 0 || from >= instance.chain.links.length) {
    throw new WorkflowError("workflows.invalid", "这一步后面没有下一站");
  }
  if (instance.status !== "active") throw new WorkflowError("workflows.invalid", instance.status === "done" ? "这一次已经走完" : "这一次已经结束");
  if (from !== instance.current) throw new WorkflowError("workflows.conflict", "这一步已经交过了");
  return from;
}

async function readStep(
  ports: WorkflowsRoutePorts,
  instance: WorkflowInstance,
  index: number,
  labelOf: (plugin: string) => Promise<string>,
): Promise<WorkflowPayload> {
  const item = instance.steps[index]?.item;
  if (!item) throw new WorkflowError("workflows.invalid", "这一步还没有内容");
  try {
    return await ports.read(item, instance.chain.stations[index]!.content);
  } catch (error) {
    if (error instanceof WorkflowError || (error instanceof Error && "code" in error)) throw error;
    throw new WorkflowError("workflows.missing", `这一次在 ${await labelOf(item.plugin)} 里的内容已经读不到了（可能被删除）`);
  }
}

function workflowTitle(store: WorkflowsStore, instance: WorkflowInstance): string {
  try {
    return store.get(instance.workflow_id, instance.project_id).title;
  } catch {
    return "已删除的流程";
  }
}

function text(value: unknown, max: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new WorkflowError("workflows.invalid", "字段须为文字");
  return value.slice(0, max).trim();
}
