import type { WorkflowContentBinding, WorkflowItemRef, WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
export type { WorkflowItemRef, WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
/** Workflows: pure data rules. No storage, no network, no plugin internals. */

export const WORKFLOWS_PLUGIN_ID = "io.molis.work.native.workflows";
export const WORKFLOWS_PROJECT_PLUGIN_ID = "workflows";

export type WorkflowLinkKind = "function" | "ai" | "manual";

/** One handoff between two stations. Fields that do not belong to `kind` are kept so switching back restores them. */
export interface WorkflowLink {
  readonly kind: WorkflowLinkKind;
  /** Function: the fixed rule. Placeholders are listed in WORKFLOW_TEMPLATE_FIELDS. */
  readonly title_template: string;
  readonly body_template: string;
  /** AI: what the next step needs from this one. */
  readonly instructions: string;
}

export interface WorkflowStation {
  readonly station_id: string;
  /** Project plugin id of an existing plugin (feed, inbox, pages, lingguang …). */
  readonly plugin: string;
  readonly content?: WorkflowContentBinding;
}

export interface WorkflowChain {
  readonly stations: readonly WorkflowStation[];
  /** Always stations.length - 1 entries; links[i] hands stations[i] to stations[i + 1]. */
  readonly links: readonly WorkflowLink[];
}

export interface Workflow extends WorkflowChain {
  readonly workflow_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

export type WorkflowHandoffActor = "function" | "ai" | "person";

export interface WorkflowHandoff {
  readonly kind: WorkflowLinkKind;
  readonly actor: WorkflowHandoffActor;
  readonly at: string;
  /** What the step held when it was handed over. */
  readonly input: WorkflowPayload;
  /** What arrived at the next step. For AI this is what it organised; people can read it here. */
  readonly output: WorkflowPayload;
  /** AI: the instruction it followed. Function: the rule. Manual: nothing. */
  readonly rule?: string;
}

export type WorkflowStepStatus = "pending" | "current" | "done";

export interface WorkflowStep {
  readonly station_id: string;
  readonly plugin: string;
  readonly status: WorkflowStepStatus;
  readonly item: WorkflowItemRef | null;
  readonly arrived_at: string | null;
  /** Filled once this step has been handed to the next one. */
  readonly handoff: WorkflowHandoff | null;
}

export type WorkflowInstanceStatus = "active" | "done" | "stopped";

export interface WorkflowInstance {
  readonly instance_id: string;
  readonly workflow_id: string;
  readonly project_id: string;
  readonly title: string;
  readonly status: WorkflowInstanceStatus;
  /** Index of the step the work has reached. */
  readonly current: number;
  /** The chain as it was when this instance started; later edits to the workflow do not rewrite history. */
  readonly chain: WorkflowChain;
  readonly steps: readonly WorkflowStep[];
  readonly created_at: string;
  readonly updated_at: string;
}

export const WORKFLOW_TEMPLATE_FIELDS = ["标题", "正文", "来源", "链接", "日期"] as const;

export class WorkflowError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkflowError";
    this.code = code;
  }
}

export function manualLink(): WorkflowLink {
  return { kind: "manual", title_template: "", body_template: "", instructions: "" };
}

export function newStation(plugin: string): WorkflowStation {
  return { station_id: crypto.randomUUID(), plugin };
}

/** Whether a link can actually hand over. `aiAvailable` is the Host's answer about a configured text model. */
export function linkReadiness(link: WorkflowLink, aiAvailable: boolean): { ready: boolean; reason: string } {
  if (link.kind === "manual") return { ready: true, reason: "" };
  if (link.kind === "function") {
    return link.body_template.trim()
      ? { ready: true, reason: "" }
      : { ready: false, reason: "还没写交接规则" };
  }
  if (!link.instructions.trim()) return { ready: false, reason: "还没写 AI 要整理成什么" };
  if (!aiAvailable) return { ready: false, reason: "还没有可用的文字模型" };
  return { ready: true, reason: "" };
}

/** Normalise a chain from untrusted input. Unknown plugins are refused by the caller, not silently dropped. */
export function parseChain(value: unknown): WorkflowChain {
  const input = (value && typeof value === "object" ? value : {}) as { stations?: unknown; links?: unknown };
  const stations = Array.isArray(input.stations) ? input.stations.map(parseStation) : [];
  const rawLinks = Array.isArray(input.links) ? input.links : [];
  const links = stations.slice(1).map((_, index) => parseLink(rawLinks[index]));
  if (stations.length > 12) throw new WorkflowError("workflows.invalid", "一条流程最多 12 站");
  return { stations, links };
}

function parseStation(value: unknown): WorkflowStation {
  const raw = (value && typeof value === "object" ? value : {}) as { station_id?: unknown; plugin?: unknown; content?: unknown };
  const plugin = typeof raw.plugin === "string" ? raw.plugin.trim() : "";
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(plugin)) throw new WorkflowError("workflows.invalid", "站点插件无效");
  const stationId = typeof raw.station_id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(raw.station_id)
    ? raw.station_id : crypto.randomUUID();
  if (raw.content !== undefined) {
    const content = raw.content as WorkflowContentBinding;
    if (!content || typeof content.provider_id !== "string" || !content.provider_id.trim()
      || !content.actions || typeof content.actions !== "object" || Array.isArray(content.actions)) {
      throw new WorkflowError("workflows.invalid", "站点能力引用无效");
    }
    for (const [role, ref] of Object.entries(content.actions)) {
      if (!["list", "read", "receive", "create"].includes(role) || !ref || typeof ref.capability_id !== "string"
        || !ref.capability_id.trim() || !Number.isInteger(ref.version) || ref.version < 1) {
        throw new WorkflowError("workflows.invalid", "站点能力版本无效");
      }
    }
    return { station_id: stationId, plugin, content };
  }
  return { station_id: stationId, plugin };
}

function parseLink(value: unknown): WorkflowLink {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const kind = raw.kind === "function" || raw.kind === "ai" || raw.kind === "manual" ? raw.kind : "manual";
  const text = (field: unknown, max: number) => typeof field === "string" ? field.slice(0, max) : "";
  return {
    kind,
    title_template: text(raw.title_template, 400),
    body_template: text(raw.body_template, 8000),
    instructions: text(raw.instructions, 4000),
  };
}

/** Insert a plugin into gap `gap` (0 = before the first station, stations.length = after the last). */
export function insertStation(chain: WorkflowChain, gap: number, station: WorkflowStation): WorkflowChain {
  const stations = [...chain.stations];
  const links = [...chain.links];
  const at = Math.max(0, Math.min(gap, stations.length));
  stations.splice(at, 0, station);
  if (stations.length === 1) return { stations, links: [] };
  if (at === 0) links.unshift(manualLink());
  else if (at === stations.length - 1) links.push(manualLink());
  // The handoff that used to reach the old next station now reaches the new one; the new station hands on by hand.
  else links.splice(at, 0, manualLink());
  return { stations, links };
}

/** Remove a station. Its incoming handoff is kept and now reaches the station after it. */
export function removeStation(chain: WorkflowChain, index: number): WorkflowChain {
  if (index < 0 || index >= chain.stations.length) return chain;
  const last = chain.stations.length - 1;
  const stations = chain.stations.filter((_, i) => i !== index);
  const links = [...chain.links];
  if (links.length) links.splice(index === 0 ? 0 : index === last ? last - 1 : index, 1);
  return { stations, links };
}

/** Move a station into another gap (gap numbers refer to the chain before the move). */
export function moveStation(chain: WorkflowChain, from: number, gap: number): WorkflowChain {
  if (from < 0 || from >= chain.stations.length) return chain;
  if (gap === from || gap === from + 1) return chain;
  const station = chain.stations[from]!;
  const removed = removeStation(chain, from);
  return insertStation(removed, gap > from ? gap - 1 : gap, station);
}

export function setLink(chain: WorkflowChain, index: number, link: WorkflowLink): WorkflowChain {
  if (index < 0 || index >= chain.links.length) return chain;
  const links = [...chain.links];
  links[index] = link;
  return { stations: chain.stations, links };
}

/** Function handoff: fill the fixed rule. Unknown placeholders stay visible rather than vanish. */
export function applyFunctionRule(link: WorkflowLink, input: WorkflowPayload, now = new Date()): WorkflowPayload {
  const values: Record<string, string> = {
    标题: input.title,
    正文: input.body,
    来源: input.source ?? "",
    链接: input.url ?? "",
    日期: now.toISOString().slice(0, 10),
  };
  const fill = (template: string) => template.replace(/\{([^{}]{1,8})\}/g, (match, name: string) => name in values ? values[name]! : match);
  // A line whose every placeholder came out empty (「链接：{链接}」 for a message without a link) is left out, not handed over half-empty.
  const fillLines = (template: string) => template.split("\n").flatMap((line) => {
    const names = [...line.matchAll(/\{([^{}]{1,8})\}/g)].map((match) => match[1]!).filter((name) => name in values);
    return names.length && names.every((name) => !values[name]!.trim()) ? [] : [fill(line)];
  }).join("\n").replace(/\n{3,}/g, "\n\n");
  const title = (link.title_template.trim() ? fill(link.title_template) : input.title).trim().slice(0, 200) || input.title;
  return { title, body: fillLines(link.body_template).trim(), url: input.url ?? null, source: input.source ?? null, feed_item_id: null };
}

export function aiHandoffPrompt(link: WorkflowLink, input: WorkflowPayload, from: string, to: string): string {
  return [
    "你在一条工作流程里负责一段交接：把上一步的结果整理成下一步能接着用的内容。",
    `上一步：${from}；下一步：${to}。`,
    `这段交接的要求：${link.instructions.trim()}`,
    "只依据下面的内容，不补充材料里没有的事实。",
    "输出格式：第一行是标题（不要加 # 或引号），空一行，然后是正文（可用 Markdown）。不要输出其他说明。",
    "",
    "上一步的内容：",
    `标题：${input.title}`,
    input.source ? `来源：${input.source}` : "",
    input.url ? `链接：${input.url}` : "",
    "正文：",
    input.body.slice(0, 60_000),
  ].filter((line) => line !== "").join("\n");
}

export function parseAiHandoff(text: string, input: WorkflowPayload): WorkflowPayload {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  const first = (lines[0] ?? "").replace(/^#+\s*/, "").replace(/^标题[:：]\s*/, "").trim();
  const body = lines.slice(1).join("\n").trim();
  return {
    title: (first || input.title).slice(0, 200),
    body: body || text.trim(),
    url: input.url ?? null,
    source: input.source ?? null,
    feed_item_id: null,
  };
}

export function startInstanceSteps(chain: WorkflowChain, first: WorkflowItemRef, at: string): WorkflowStep[] {
  return chain.stations.map((station, index) => ({
    station_id: station.station_id,
    plugin: station.plugin,
    status: index === 0 ? "current" : "pending",
    item: index === 0 ? first : null,
    arrived_at: index === 0 ? at : null,
    handoff: null,
  }));
}

/**
 * Handoffs a run has not crossed yet follow the workflow as it is now, so fixing a link lets a waiting run go on.
 * A handoff is matched by the two stations it joins; crossed handoffs, and pairs the workflow no longer has, stay as they were.
 */
export function withPendingLinks(instance: WorkflowInstance, workflow: WorkflowChain): WorkflowInstance {
  if (instance.status !== "active") return instance;
  let changed = false;
  const links = instance.chain.links.map((link, index) => {
    if (index < instance.current) return link;
    const from = instance.chain.stations[index]!.station_id;
    const to = instance.chain.stations[index + 1]!.station_id;
    const at = workflow.stations.findIndex((station, j) => station.station_id === from && workflow.stations[j + 1]?.station_id === to);
    const live = at >= 0 ? workflow.links[at] : undefined;
    if (!live || JSON.stringify(live) === JSON.stringify(link)) return link;
    changed = true;
    return live;
  });
  return changed ? { ...instance, chain: { stations: instance.chain.stations, links } } : instance;
}

/** Record one handoff and move the work to the next station. */
export function advanceInstance(
  instance: WorkflowInstance,
  from: number,
  handoff: WorkflowHandoff,
  arrived: WorkflowItemRef,
  at: string,
): WorkflowInstance {
  if (instance.status !== "active") throw new WorkflowError("workflows.invalid", "这一次已经结束");
  if (from !== instance.current) throw new WorkflowError("workflows.conflict", "这一步已经交过了，请刷新后再看");
  if (from >= instance.steps.length - 1) throw new WorkflowError("workflows.invalid", "已经是最后一站");
  const next = from + 1;
  const steps = instance.steps.map((step, index): WorkflowStep => {
    if (index === from) return { ...step, status: "done", handoff };
    if (index === next) return { ...step, status: next === instance.steps.length - 1 ? "done" : "current", item: arrived, arrived_at: at };
    return step;
  });
  const finished = next === instance.steps.length - 1;
  return { ...instance, steps, current: next, status: finished ? "done" : "active", updated_at: at };
}
