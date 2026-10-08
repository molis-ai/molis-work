import { instructed, type InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { WORKFLOWS_AI_HANDOFF } from "./prompts.js";
import type { ActionResultPresentation, WorkflowContentBinding, WorkflowItemRef, WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
export type { WorkflowItemRef, WorkflowPayload } from "@molis-ai/molis-work-contracts/platform/actions";
/** Workflows: pure data rules. No storage, no network, no plugin internals. */

export const WORKFLOWS_PLUGIN_ID = "io.molis.work.native.workflows";
export const WORKFLOWS_PROJECT_PLUGIN_ID = "workflows";

export type WorkflowLinkKind = "function" | "ai" | "manual" | "judgment";

/** One handoff between two stations. Fields that do not belong to `kind` are kept so switching back restores them. */
export interface WorkflowLink {
  readonly kind: WorkflowLinkKind;
  /** Function: the fixed rule. Placeholders are listed in WORKFLOW_TEMPLATE_FIELDS. */
  readonly title_template: string;
  readonly body_template: string;
  /** AI: what the next step needs from this one. */
  readonly instructions: string;
  /** Judgment: the exact published Choice rule that checks this step, and the results that let the content through. */
  readonly judgment?: { readonly capability_id: string; readonly version: number; readonly provider_id: string; readonly title?: string };
  readonly pass?: readonly string[];
}

export interface WorkflowStation {
  readonly station_id: string;
  /** Project plugin id of an existing plugin (feed, inbox, pages, lingguang …); `action` for a step that runs one action. */
  readonly plugin: string;
  readonly content?: WorkflowContentBinding;
  /** An action step: the exact registered action it runs and how its input is filled from what arrives. */
  readonly action?: WorkflowActionStep;
}

/** Where one input field of an action step comes from: a field of what the previous step handed over, or a fixed value. */
export type WorkflowFieldSource =
  | { readonly from: WorkflowPayloadField }
  | { readonly value: string | number | boolean };
export type WorkflowPayloadField = "title" | "body" | "source" | "url" | "date";
export const WORKFLOW_PAYLOAD_FIELDS: readonly WorkflowPayloadField[] = ["title", "body", "source", "url", "date"];

export interface WorkflowActionStep {
  readonly ref: { readonly capability_id: string; readonly version: number; readonly provider_id: string };
  readonly title: string;
  /** Provider label for the visual group; identity is `ref`. */
  readonly group?: string;
  readonly mapping: Readonly<Record<string, WorkflowFieldSource>>;
}

export function isActionStation(station: Pick<WorkflowStation, "action">): station is WorkflowStation & { action: WorkflowActionStep } {
  return !!station.action;
}

/** Fills an action's input from the handed-over content. Unmapped fields are left out; the action's own contract checks the rest. */
export function mapActionInput(step: WorkflowActionStep, payload: WorkflowPayload, now = new Date()): Record<string, unknown> {
  const fields: Record<WorkflowPayloadField, string> = { title: payload.title, body: payload.body, source: payload.source ?? "", url: payload.url ?? "", date: now.toISOString().slice(0, 10) };
  return Object.fromEntries(Object.entries(step.mapping).map(([name, source]) => [name, "from" in source ? fields[source.from] : source.value]));
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

export type WorkflowHandoffActor = "function" | "ai" | "person" | "judgment";

export interface WorkflowHandoff {
  /** Fixed delivery identity `instance_id:from`; receivers return the same item for it, so a retry never delivers twice. */
  readonly key?: string;
  readonly kind: WorkflowLinkKind;
  readonly actor: WorkflowHandoffActor;
  readonly at: string;
  /** What the step held when it was handed over. */
  readonly input: WorkflowPayload;
  /** What arrived at the next step. For AI this is what it organised; people can read it here. */
  readonly output: WorkflowPayload;
  /** AI: the instruction it followed. Function: the rule. Manual: nothing. */
  readonly rule?: string;
  /** Judgment: the rule's answer; the content only went on because the answer was one of `pass`. */
  readonly verdict?: WorkflowVerdict;
}

export interface WorkflowVerdict {
  readonly choice: string | null;
  readonly passed: boolean;
  readonly status: "ok" | "needs_review";
  readonly function_key: string;
  readonly version: number;
  readonly confidence: number | null;
}

export type WorkflowStepStatus = "pending" | "current" | "done";

/** Why a judgment held this step's content back. The step keeps it, so the run reads the same after a reload. */
export interface WorkflowHold {
  readonly at: string;
  readonly reason: string;
  readonly verdict?: WorkflowVerdict;
}

export interface WorkflowStep {
  readonly station_id: string;
  readonly plugin: string;
  readonly status: WorkflowStepStatus;
  readonly item: WorkflowItemRef | null;
  readonly arrived_at: string | null;
  /** Filled once this step has been handed to the next one. */
  readonly handoff: WorkflowHandoff | null;
  /** A judgment held this step's content back and the run stopped here; the run's `stopped` is read from it. */
  readonly held?: WorkflowHold;
  /** Saved before delivery: a retry after a crash or a lost race re-sends exactly this, instead of asking the model again. */
  /** attempted_at: an action step was called and its result never confirmed; attempt_error: what that call said when it failed after starting. */
  readonly pending?: WorkflowHandoff & { readonly key: string; readonly attempted_at?: string; readonly attempt_error?: string };
  /** An action step keeps what it received (the next handoff reads it) and what the action returned. */
  readonly payload?: WorkflowPayload;
  readonly result?: unknown;
  readonly result_presentation?: ActionResultPresentation;
  readonly result_truncated?: true;
}

export function handoffKey(instance: Pick<WorkflowInstance, "instance_id">, from: number): string {
  return `${instance.instance_id}:${from}`;
}

/**
 * The concurrency token (`updated_at`) a write leaves behind: `at` when it is later than the token the change was
 * computed from, otherwise one millisecond after it. A save inside the same millisecond as the last one, or one stamped
 * with an earlier time, would leave the token as it was and let a call that read the old state through.
 */
export function nextUpdatedAt(previous: string, at: string = new Date().toISOString()): string {
  const before = Date.parse(previous);
  if (!Number.isFinite(before) || Date.parse(at) > before) return at;
  return new Date(before + 1).toISOString();
}

/** The reason a run stopped when a judgment held its content back: the held step has it, whoever reads the run. */
export function stoppedOf(status: WorkflowInstanceStatus, steps: readonly WorkflowStep[]): WorkflowInstance["stopped"] {
  if (status !== "stopped") return undefined;
  const from = steps.findIndex(step => step.held);
  const held = steps[from]?.held;
  return held ? { at: held.at, from, reason: held.reason, ...(held.verdict ? { verdict: held.verdict } : {}) } : undefined;
}

/** A judgment held step `from`'s content back: the run stops at that step and keeps why. */
export function holdInstance(instance: WorkflowInstance, from: number, held: WorkflowHold): WorkflowInstance {
  if (instance.status !== "active") throw new WorkflowError("workflows.invalid", "这一次已经结束");
  if (from !== instance.current) throw new WorkflowError("workflows.conflict", "这一步已经交过了，请刷新后再看");
  const steps = instance.steps.map((step, index) => index === from ? { ...step, held } : step);
  return { ...instance, status: "stopped", steps, stopped: stoppedOf("stopped", steps), updated_at: held.at };
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
  /** Why a run stopped before its last station, when a judgment held the content back. Read from the held step, never stored apart from it. */
  readonly stopped?: { readonly at: string; readonly from: number; readonly reason: string; readonly verdict?: WorkflowVerdict };
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
  if (link.kind === "judgment") {
    if (!link.judgment) return { ready: false, reason: "还没选判断规则" };
    return link.pass?.length ? { ready: true, reason: "" } : { ready: false, reason: "还没选哪些结果可以交过去" };
  }
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
  const raw = (value && typeof value === "object" ? value : {}) as { station_id?: unknown; plugin?: unknown; content?: unknown; action?: unknown };
  const plugin = typeof raw.plugin === "string" ? raw.plugin.trim() : "";
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(plugin)) throw new WorkflowError("workflows.invalid", "站点插件无效");
  const stationId = typeof raw.station_id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(raw.station_id)
    ? raw.station_id : crypto.randomUUID();
  if (raw.action !== undefined) {
    if (plugin !== "action" || raw.content !== undefined) throw new WorkflowError("workflows.invalid", "动作步骤只能引用一个动作");
    return { station_id: stationId, plugin, action: parseActionStep(raw.action) };
  }
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

function parseActionStep(value: unknown): WorkflowActionStep {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const ref = (raw.ref && typeof raw.ref === "object" ? raw.ref : {}) as Record<string, unknown>;
  if (typeof ref.capability_id !== "string" || !/^[a-z0-9][a-z0-9_.-]{0,160}$/i.test(ref.capability_id) || !Number.isInteger(ref.version) || Number(ref.version) < 1
    || typeof ref.provider_id !== "string" || !ref.provider_id.trim() || ref.provider_id.length > 300) throw new WorkflowError("workflows.invalid", "动作步骤引用无效");
  const mappingRaw = (raw.mapping && typeof raw.mapping === "object" && !Array.isArray(raw.mapping) ? raw.mapping : {}) as Record<string, unknown>;
  const entries = Object.entries(mappingRaw);
  if (entries.length > 40) throw new WorkflowError("workflows.invalid", "动作步骤的字段过多");
  const mapping: Record<string, WorkflowFieldSource> = {};
  for (const [name, source] of entries) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name) || !source || typeof source !== "object") throw new WorkflowError("workflows.invalid", "字段映射无效");
    const entry = source as Record<string, unknown>;
    if ("from" in entry) {
      if (!WORKFLOW_PAYLOAD_FIELDS.includes(entry.from as WorkflowPayloadField)) throw new WorkflowError("workflows.invalid", `字段 ${name} 的来源无效`);
      mapping[name] = { from: entry.from as WorkflowPayloadField };
    } else if ("value" in entry && ["string", "number", "boolean"].includes(typeof entry.value)) {
      if (typeof entry.value === "string" && entry.value.length > 8000) throw new WorkflowError("workflows.invalid", `字段 ${name} 的固定值过长`);
      mapping[name] = { value: entry.value as string | number | boolean };
    } else throw new WorkflowError("workflows.invalid", `字段 ${name} 的映射无效`);
  }
  return { ref: { capability_id: ref.capability_id, version: Number(ref.version), provider_id: ref.provider_id },
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 200) : ref.capability_id,
    ...(typeof raw.group === "string" && raw.group.trim() ? { group: raw.group.trim().slice(0, 120) } : {}), mapping };
}

function parseLink(value: unknown): WorkflowLink {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const kind = raw.kind === "function" || raw.kind === "ai" || raw.kind === "manual" || raw.kind === "judgment" ? raw.kind : "manual";
  const text = (field: unknown, max: number) => typeof field === "string" ? field.slice(0, max) : "";
  // Fields of the other kinds are kept, so switching back restores what was written.
  const judgment = parseJudgmentRef(raw.judgment);
  const pass = Array.isArray(raw.pass) ? [...new Set(raw.pass.filter((value): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value)))].slice(0, 8) : undefined;
  return {
    kind,
    title_template: text(raw.title_template, 400),
    body_template: text(raw.body_template, 8000),
    instructions: text(raw.instructions, 4000),
    ...(judgment ? { judgment } : {}),
    ...(pass ? { pass } : {}),
  };
}

function parseJudgmentRef(value: unknown): WorkflowLink["judgment"] | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.capability_id !== "string" || !/^functions\.published\.[a-z0-9][a-z0-9_.-]{0,120}$/.test(raw.capability_id)
    || !Number.isInteger(raw.version) || Number(raw.version) < 1 || typeof raw.provider_id !== "string" || !raw.provider_id.trim()) {
    throw new WorkflowError("workflows.invalid", "判断规则引用无效");
  }
  return { capability_id: raw.capability_id, version: Number(raw.version), provider_id: raw.provider_id,
    ...(typeof raw.title === "string" ? { title: raw.title.slice(0, 200) } : {}) };
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

export function aiHandoffPrompt(link: WorkflowLink, input: WorkflowPayload, from: string, to: string): InstructedPrompt {
  return instructed(WORKFLOWS_AI_HANDOFF, [
    `上一步：${from}；下一步：${to}。`,
    `这段交接的要求：${link.instructions.trim()}`,
    "",
    "上一步的内容：",
    `标题：${input.title}`,
    input.source ? `来源：${input.source}` : "",
    input.url ? `链接：${input.url}` : "",
    "正文：",
    input.body.slice(0, 60_000),
  ].filter((line) => line !== "").join("\n"));
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

/** Record one handoff and move the work to the next station. `at` is when the work arrives there; the handoff keeps its own time. */
export function advanceInstance(
  instance: WorkflowInstance,
  from: number,
  handoff: WorkflowHandoff,
  arrived: WorkflowItemRef,
  at: string,
  arrival: { readonly payload?: WorkflowPayload; readonly result?: unknown; readonly result_presentation?: ActionResultPresentation; readonly result_truncated?: true } = {},
): WorkflowInstance {
  if (instance.status !== "active") throw new WorkflowError("workflows.invalid", "这一次已经结束");
  if (from !== instance.current) throw new WorkflowError("workflows.conflict", "这一步已经交过了，请刷新后再看");
  if (from >= instance.steps.length - 1) throw new WorkflowError("workflows.invalid", "已经是最后一站");
  const next = from + 1;
  const steps = instance.steps.map((step, index): WorkflowStep => {
    if (index === from) { const { pending: _pending, ...rest } = step; return { ...rest, status: "done", handoff }; }
    if (index === next) return { ...step, status: next === instance.steps.length - 1 ? "done" : "current", item: arrived, arrived_at: at,
      ...(arrival.payload ? { payload: arrival.payload } : {}), ...(arrival.result !== undefined ? { result: arrival.result } : {}),
      ...(arrival.result_presentation ? { result_presentation: arrival.result_presentation } : {}), ...(arrival.result_truncated ? { result_truncated: true } : {}) };
    return step;
  });
  const finished = next === instance.steps.length - 1;
  return { ...instance, steps, current: next, status: finished ? "done" : "active", updated_at: at };
}
