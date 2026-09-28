import type { AgentHost, AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentPendingQuestion, AgentRecoveryReport, AgentReviewRequest, AgentRunView, AgentSessionRef, AgentTextMaterial, AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { actionEffect, actionFieldLabel, actionFieldValue, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID,
  type AssistantActivity, type AssistantCard, type AssistantContextSnapshot, type AssistantControl, type AssistantRecovery, type AssistantMaterial, type AssistantPendingReview, type AssistantRound,
  type AssistantScope, type AssistantSendInput, type AssistantSendResult, type AssistantWork, type AssistantWorkState, type AssistantWorkView,
} from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_ROLE_ID } from "./assistant-agent.js";
import { AssistantStoreError, type AssistantStore, type StoredCard, type StoredRound, type StoredWork } from "./assistant-store.js";
import { assertActionInput } from "@molis-ai/molis-work-kernel";
import type { AgentActionOffer } from "@molis-ai/molis-work-contracts/services/agent-host";
import { randomUUID } from "node:crypto";
import { CodingExecutor, CodingUnavailable, type CodingSessionRead, type PersonActions } from "./assistant-coding.js";

const RUNTIME = "prologue";
const MAX_TEXT = 20_000;
const MAX_MATERIALS = 20;
const MAX_MATERIAL_TEXT = 60_000;
/** Enough for a real piece of business work with its lookups; a round never runs unbounded. */
const ROUND_TURNS = 24;
/** The directory lists at most this many; the gateway itself searches all of them. */
const MAX_ACTION_TOOLS = 1000;

export class AssistantError extends Error {
  constructor(readonly code: string, message: string, readonly work?: AssistantWork, readonly action?: string) {
    super(message);
    this.name = "AssistantError";
  }
}

export interface AssistantServicePorts {
  /** The Home's Agent Host, ready to run. */
  host(): Promise<AgentHost>;
  authority(work: StoredWork): Promise<AgentStartAuthority>;
  /** How the person names a project, for the round's own description of where it runs. */
  projectTitle?(projectId: string): Promise<string | null>;
  /** IANA zone the person works in, so "tomorrow" means their tomorrow. */
  timeZone?: string;
  /** The person's own actions in a work's project, for driving a plugin's Agent (Coding) as its page would. */
  personActions?(work: StoredWork): Promise<PersonActions>;
}

/** Where a Send came from: the page's own project, when there is one. Only used to scope a new work. */
export interface AssistantCaller {
  project_ref?: LocalHostProjectReference;
}

const sessionRef = (work: StoredWork): AgentSessionRef => ({ session_id: work.session_id!, runtime_id: RUNTIME });
const ownerOf = (work: StoredWork) => work.project_ref?.board_id ?? ASSISTANT_PERSONAL_OWNER;

function stateOf(phase: AgentRunView["phase"] | null | undefined, recovery: boolean): AssistantWorkState {
  if (recovery) return "needs-check";
  switch (phase) {
    case undefined: case null: return "idle";
    case "starting": case "running": case "compacting": return "running";
    case "awaiting-input": return "waiting-input";
    case "awaiting-review": return "waiting-review";
    case "paused": return "paused";
    case "completed": return "completed";
    case "failed": return "failed";
    case "cancelled": case "stopped": return "stopped";
    case "reconcile-required": return "needs-check";
  }
}

function titleFrom(text: string): string {
  const line = text.split(/\r?\n/).map(part => part.trim()).find(Boolean) ?? "新工作";
  return line.length > 40 ? line.slice(0, 39) + "…" : line;
}

function checkText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim()) throw new AssistantError("assistant.invalid", `${field}不能为空`);
  if (value.length > max) throw new AssistantError("assistant.invalid", `${field}超过 ${max} 字，请缩短或作为附件添加`);
  return value;
}

function checkMaterials(value: unknown): AssistantMaterial[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MATERIALS) throw new AssistantError("assistant.invalid", `一次最多带 ${MAX_MATERIALS} 份材料`);
  let total = 0;
  return value.map((raw, index) => {
    const item = raw as AssistantMaterial;
    if (!item || typeof item !== "object" || !["selection", "object", "text", "file", "image"].includes(item.kind)
      || typeof item.title !== "string" || typeof item.explicit !== "boolean" || item.text !== undefined && typeof item.text !== "string") {
      throw new AssistantError("assistant.invalid", `第 ${index + 1} 份材料格式无效`);
    }
    total += item.text?.length ?? 0;
    if (total > MAX_MATERIAL_TEXT) throw new AssistantError("assistant.invalid", "材料正文合计过长，请只带需要的片段");
    return { material_id: String(item.material_id || `m${index + 1}`).slice(0, 80), kind: item.kind, title: item.title.slice(0, 200), explicit: item.explicit,
      ...(item.source ? { source: { surface: String(item.source.surface).slice(0, 80), ...(item.source.plugin_id ? { plugin_id: String(item.source.plugin_id).slice(0, 120) } : {}), ...(item.source.title ? { title: String(item.source.title).slice(0, 200) } : {}) } } : {}),
      ...(item.object ? { object: { kind: String(item.object.kind).slice(0, 80), id: String(item.object.id).slice(0, 200), ...(item.object.version !== undefined ? { version: item.object.version } : {}), ...(item.object.title ? { title: String(item.object.title).slice(0, 200) } : {}) } } : {}),
      ...(item.text !== undefined ? { text: item.text } : {}), ...(item.draft ? { draft: true } : {}) };
  });
}

function checkContext(value: unknown): AssistantContextSnapshot | null {
  if (value === undefined || value === null) return null;
  const context = value as AssistantContextSnapshot;
  if (!context || typeof context !== "object" || !context.source || typeof context.source.surface !== "string") throw new AssistantError("assistant.invalid", "当前页面信息格式无效");
  const selection = context.selection && typeof context.selection.text === "string" ? { text: context.selection.text.slice(0, 8000), ...(context.selection.truncated || context.selection.text.length > 8000 ? { truncated: true } : {}) } : undefined;
  return { source: { surface: context.source.surface.slice(0, 80), ...(context.source.plugin_id ? { plugin_id: String(context.source.plugin_id).slice(0, 120) } : {}), ...(context.source.title ? { title: String(context.source.title).slice(0, 200) } : {}) },
    ...(context.object ? { object: { kind: String(context.object.kind).slice(0, 80), id: String(context.object.id).slice(0, 200), ...(context.object.version !== undefined ? { version: context.object.version } : {}), ...(context.object.title ? { title: String(context.object.title).slice(0, 200) } : {}) } } : {}),
    ...(selection ? { selection } : {}), ...(context.unsaved ? { unsaved: true } : {}), captured_at: typeof context.captured_at === "string" ? context.captured_at : new Date().toISOString() };
}

/** Split a long text into materials the runtime accepts (each at most 20,000 characters with its header). */
function chunked(base: Omit<AgentTextMaterial, "text" | "material_id">, id: string, text: string): AgentTextMaterial[] {
  const size = 18_000;
  const parts = Math.max(1, Math.ceil(text.length / size));
  return Array.from({ length: parts }, (_, index) => ({ ...base, material_id: parts === 1 ? id : `${id}.${index + 1}`,
    title: parts === 1 ? base.title : `${base.title}（${index + 1}/${parts}）`, text: text.slice(index * size, (index + 1) * size) }));
}

/** A result in a line the person can read: what was made or changed, by its name; never the whole payload. */
function summarizeResult(result: unknown): string {
  const named = (value: unknown): string | null => {
    if (!value || typeof value !== "object") return null;
    const row = value as Record<string, unknown>;
    for (const key of ["title", "name", "display_name"]) if (typeof row[key] === "string" && row[key]) return row[key] as string;
    for (const key of ["item", "document", "record", "result", "created", "updated"]) { const inner = named(row[key]); if (inner) return inner; }
    return null;
  };
  if (typeof result === "string") return result.length > 200 ? `${result.slice(0, 199)}…` : result || "已完成";
  const name = named(result);
  return name ? `「${name.slice(0, 120)}」` : "";
}

type SchemaProperties = Record<string, { title?: string; description?: string; properties?: SchemaProperties; type?: unknown }>;
const labelOf = (properties: SchemaProperties | undefined, key: string) => actionFieldLabel(key, properties?.[key]);
const plainObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value) && (value as { type?: unknown }).type !== "doc";

export function cardView(card: StoredCard): AssistantCard {
  const properties = (card.input_schema.properties ?? {}) as SchemaProperties;
  const input = plainObject(card.input) ? card.input : null;
  const missingField = (key: string) => card.missing.some(item => item.field === key);
  const fields: AssistantCard["fields"] = [];
  if (input || card.missing.length) {
    for (const key of [...new Set([...(input ? Object.keys(input) : []), ...card.missing.map(item => item.field)])]) {
      const value = input?.[key];
      const editable = card.editable.includes(key) || missingField(key);
      // One level of nesting is shown field by field, the way the person reads it; the parent's permission carries down.
      if (plainObject(value)) {
        for (const [child, inner] of Object.entries(value)) {
          if (inner === undefined || inner === null || inner === "") continue;
          fields.push({ key: `${key}.${child}`, label: labelOf(properties[key]?.properties, child), value: actionFieldValue(child, inner), editable: editable || card.editable.includes(`${key}.${child}`) });
        }
        continue;
      }
      fields.push({ key, label: labelOf(properties, key), value: value !== undefined ? actionFieldValue(key, value) : "", editable });
    }
  } else fields.push({ key: "", label: "内容", value: actionFieldValue("", card.input), editable: false });
  return { card_id: card.card_id, revision: card.revision, run_id: card.run_id, title: card.title, summary: card.summary, provider: card.provider,
    capability_title: card.capability_title, capability_id: card.reference.capability_id, effect: card.effect, fields, missing: card.missing, status: card.status,
    ...(card.outcome ? { outcome: card.outcome } : {}), created_at: card.created_at, updated_at: card.updated_at };
}

/** The changed middle of a text, as - and + lines: what an approval of this edit actually lets happen. */
function changedLines(before: string | null, after: string): string {
  const a = (before ?? "").split("\n"), b = after.split("\n");
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  const removed = a.slice(head, a.length - tail).map(line => `- ${line}`), added = b.slice(head, b.length - tail).map(line => `+ ${line}`);
  const lines = [...(head ? [`@@ 第 ${head + 1} 行起`] : []), ...removed, ...added];
  const text = lines.join("\n");
  return text.length > 6000 ? `${text.slice(0, 6000)}\n…（其余改动见 Coding 页面）` : text || "（内容没有变化）";
}

/** A held effect in the person's words, by what it is: a business change, a file edit, a command, an MCP call, a rewind. */
function describeReview(document: AgentReviewRequest["document"]): { summary: string; fields: Array<{ label: string; value: string }> } {
  switch (document.kind) {
    case "tool-operation": return { summary: document.summary, fields: document.fields.map(field => ({ label: field.label, value: field.value })) };
    case "text-edit": return { summary: `${document.exists ? "修改文件" : "新建文件"} ${document.target_path}`,
      fields: [{ label: "改动", value: changedLines(document.before_text, document.after_text) }, ...(document.concurrent?.length ? [{ label: "注意", value: `另有会话正在改这个文件：${document.concurrent.join("、")}` }] : [])] };
    case "command": return { summary: document.background ? "在后台运行命令" : "运行命令",
      fields: [{ label: "命令", value: [document.command, ...document.args].join(" ") }, { label: "目录", value: document.cwd || "." }, ...(document.escalate ? [{ label: "注意", value: "需要更高权限" }] : [])] };
    case "mcp": return { summary: `MCP · ${document.server} · ${document.tool}`, fields: [{ label: "参数", value: document.arguments_json }] };
    case "rewind": return { summary: "回退到检查点", fields: document.files.map(file => ({ label: { restore: "恢复", delete: "删除", create: "新建" }[file.change], value: file.path })) };
    default: return { summary: "需要你确认的操作", fields: [{ label: "内容", value: JSON.stringify(document, null, 2).slice(0, 4000) }] };
  }
}

/** Titles of the capabilities a scope offered at its latest round start, to name them in the activity. */
type CapabilityTitles = Map<string, { title: string; provider: string }>;

/** Activity in the person's terms: what was looked up, read or changed — not the tool log. */
/** The modes a Coding round can run in, as Coding's own page offers them. */
const CODING_MODES: readonly string[] = ["discuss", "plan", "edit", "execute", "review", "collaborate", "parallel"];

export function presentActivity(activity: readonly AgentToolActivity[], titles: CapabilityTitles | undefined, ended = false): AssistantActivity[] {
  const verbs: Record<string, string> = { "find-capabilities": "lookup", "read-capability": "read", "change-capability": "change", "ask-user": "ask", "update-todo": "todo",
    // A professional Agent's own tools, as the person reads them: on files and commands, never a business capability.
    "read": "file-read", "read-file": "file-read", "list": "file-list", "search": "file-search", "edit": "file-change", "edit-file": "file-change",
    "write": "file-change", "run-command": "command", "command-output": "command-output", "await-commands": "command-output", "find-tools": "lookup-tools" };
  return activity.flatMap(item => {
    if (item.name === "reasoning" || item.name === "context-remaining") return [];
    const verb = verbs[item.name] ?? item.name;
    const named = titles?.get(item.target);
    const target = (verb === "read" || verb === "change") && named ? `${named.provider} · ${named.title}` : item.target;
    const reason = item.state !== "failed" ? undefined : /EFFECT_NOT_AUTHORIZED/.test(item.summary) ? "not-authorized" as const
      : /TOOL_INTERRUPTED/.test(`${item.summary} ${item.output ?? ""}`) ? "interrupted" as const
      : /reject|declin|拒绝/i.test(item.summary) ? "declined" as const : undefined;
    // A round that is over has nothing still going on: a step it never closed is one whose outcome nobody recorded.
    const state = ended && item.state === "started" ? "unknown" as const : item.state;
    const detail = item.state === "failed" && item.output ? item.output.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    const capability = (verb === "read" || verb === "change") && item.target ? { capability_id: item.target } : {};
    return [{ call_id: item.call_id, verb, target, state, ...capability, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}), ...(item.sequence !== undefined ? { sequence: item.sequence } : {}) }];
  });
}

export class AssistantService {
  private readonly titles = new Map<string, CapabilityTitles>();
  constructor(private readonly store: AssistantStore, private readonly ports: AssistantServicePorts, private readonly actorId: string,
    private readonly now = () => new Date()) {}

  async list(): Promise<AssistantWork[]> {
    const works = this.store.list(this.actorId);
    if (!works.length) return [];
    const host = await this.ports.host();
    return Promise.all(works.map(async work => this.publicWork(await this.named(work), await this.stateFor(host, work))));
  }

  /** Works started before scope titles were kept still show their project's name. */
  private async named(work: StoredWork): Promise<StoredWork> {
    if (work.scope.kind !== "project" || work.scope_title) return work;
    const title = await this.ports.projectTitle?.(work.scope.project_id).catch(() => null);
    return title ? { ...work, scope_title: title } : work;
  }

  async read(workId: string): Promise<AssistantWorkView> {
    const work = await this.named(this.store.get(this.actorId, workId));
    if (work.executor.kind === "coding") return this.codingRead(work);
    const host = await this.ports.host();
    const adapter = host.adapter(RUNTIME);
    const stored = this.store.rounds(work.work_id);
    let recovery: { required: true; reason: string } | undefined;
    const views = new Map<string, AgentRunView>();
    if (work.session_id) {
      const session = await adapter.readSession(sessionRef(work)).catch(() => null);
      recovery = session?.recovery;
      // Older rounds first come from the session's own record; a run the store knows but the runtime lost reads as unknown.
      await Promise.all(stored.slice(-30).map(async round => {
        const view = await adapter.read({ session_id: work.session_id!, run_id: round.run_id }).catch(() => null);
        if (view) views.set(round.run_id, view);
      }));
    }
    const titles = this.titles.get(ownerOf(work));
    const rounds: AssistantRound[] = stored.slice(-30).map(round => this.roundView(round, views.get(round.run_id), titles));
    const latest = rounds.at(-1);
    const state = stateOf(latest && latest.phase !== "unknown" ? latest.phase : latest ? null : undefined, Boolean(recovery));
    // Only a round that is really waiting on a decision shows one; a review left behind by an ended round is not offered.
    const waiting = new Set(rounds.filter(round => round.phase === "awaiting-review").map(round => round.run_id));
    return { work: this.publicWork(work, state), rounds, reviews: work.session_id ? this.reviewsFor(host, work).filter(review => review.run_id !== null && waiting.has(review.run_id)) : [],
      cards: this.store.cards(work.work_id).map(card => cardView(card)),
      ...(recovery ? { problem: { message: recovery.reason, action: "核对上一轮的实际结果后再继续" } } : {}) };
  }

  /**
   * One press of Send. It starts a round when the work is idle, reaches the running round when one is under way, and
   * answers the round's open question when that is what the round is waiting for. A repeated press returns the first
   * outcome and does nothing more.
   */
  async send(input: AssistantSendInput, caller: AssistantCaller): Promise<AssistantSendResult> {
    const text = checkText(input?.text, "要发送的内容", MAX_TEXT);
    const materials = checkMaterials(input.materials);
    const context = checkContext(input.context);
    if (input.mode !== undefined && (input.work_id || input.executor !== "coding" || !CODING_MODES.includes(input.mode))) throw new AssistantError("assistant.invalid", "只有新的 Coding 工作可以在这里选择第一轮的方式");
    const claim = this.store.claimRequest(this.actorId, String(input.request_id ?? ""));
    if (!claim.claimed) return claim.result;
    let work: StoredWork | undefined;
    try {
      work = input.work_id ? this.store.get(this.actorId, input.work_id) : await this.createWork(text, input.scope, context, caller, input.executor);
      const result = await this.dispatch(work, text, materials, context, input.work_id ? undefined : input.mode);
      this.store.finishRequest(this.actorId, input.request_id, result);
      return result;
    } catch (error) {
      this.store.releaseRequest(this.actorId, input.request_id);
      // Nothing the person typed is lost: an unsent message stays as the work's draft.
      if (work) {
        const kept = this.store.update(this.actorId, work.work_id, null, { draft: text }, false);
        const failure = error instanceof AssistantError ? error : this.explain(error);
        throw new AssistantError(failure.code, failure.message, this.publicWork(kept, await this.stateSafely(kept)), failure.action);
      }
      throw error instanceof AssistantError ? error : this.explain(error);
    }
  }

  async control(workId: string, control: AssistantControl): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (!["pause", "resume", "stop"].includes(control?.kind)) throw new AssistantError("assistant.invalid", "不支持的操作");
    if (work.executor.kind === "coding") {
      const coding = await this.coding(work);
      const latest = work.executor.session_id ? (await coding.read(work.executor.session_id, 1)).runs.at(-1) : undefined;
      if (!latest || isTerminalAgentPhase(latest.phase)) throw new AssistantError("assistant.state", "这项工作当前没有在执行的一轮");
      await coding.control(work.executor.session_id!, latest.ref.run_id, { kind: control.kind });
      return this.read(workId);
    }
    const host = await this.ports.host();
    const latest = await this.latestRun(host, work);
    if (!latest || isTerminalAgentPhase(latest.phase)) throw new AssistantError("assistant.state", "这项工作当前没有在执行的一轮");
    await host.adapter(RUNTIME).control(latest.ref, { kind: control.kind });
    // A stopped round's held effects will never run: withdraw them so no one approves a change nothing will make.
    if (control.kind === "stop") host.reviews.cancelPending(latest.ref.run_id, "这一轮已停止");
    return this.read(workId);
  }

  async answer(workId: string, input: { run_id: string; pending_id: string; pending_revision?: number; text?: string;
    answers?: ReadonlyArray<{ question: number; indexes: readonly number[]; other?: string }> }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (work.executor.kind === "coding") {
      const coding = await this.coding(work);
      const run = work.executor.session_id ? (await coding.read(work.executor.session_id, 6)).runs.find(item => item.ref.run_id === input.run_id) : undefined;
      const question = run?.awaiting_input.find(item => item.pending_id === input.pending_id);
      if (!run || !question || run.phase !== "awaiting-input") throw new AssistantError("assistant.stale", "这个问题已经结束或被替换，回答没有发送");
      await coding.control(work.executor.session_id!, run.ref.run_id, { kind: "answer", pending_id: input.pending_id, pending_revision: input.pending_revision ?? question.pending_revision ?? 1,
        ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
      return this.read(workId);
    }
    if (!this.store.rounds(work.work_id).some(round => round.run_id === input.run_id)) throw new AssistantError("assistant.scope", "这个问题不属于这项工作");
    const host = await this.ports.host();
    const run = await host.adapter(RUNTIME).read({ session_id: work.session_id!, run_id: input.run_id });
    const question = run.awaiting_input.find(item => item.pending_id === input.pending_id);
    // A late answer to a question that is already closed or replaced starts nothing.
    if (!question || run.phase !== "awaiting-input") throw new AssistantError("assistant.stale", "这个问题已经结束或被替换，回答没有发送");
    if (input.text !== undefined && (typeof input.text !== "string" || input.text.length > MAX_TEXT)) throw new AssistantError("assistant.invalid", "回答过长");
    await host.adapter(RUNTIME).control(run.ref, { kind: "answer", pending_id: input.pending_id,
      ...(input.pending_revision !== undefined ? { pending_revision: input.pending_revision } : question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}), ...(input.answers ? { answers: input.answers } : {}) });
    return this.read(workId);
  }

  async decide(workId: string, input: { review_id: string; decision: "approve" | "reject"; note?: string }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    const host = await this.ports.host();
    const review = host.reviews.get(String(input.review_id));
    // A Coding work's confirmations are Coding's own, in the same queue its page decides from.
    const session = work.executor.kind === "coding" && work.executor.session_id
      ? (await (await this.coding(work)).read(work.executor.session_id, 1)).session.runtime_session_id ?? null : work.session_id;
    if (!review || review.run?.session_id !== session || review.board_id !== ownerOf(work)) throw new AssistantError("assistant.scope", "这项确认不属于这项工作");
    if (!["approve", "reject"].includes(input.decision)) throw new AssistantError("assistant.invalid", "请选择允许或拒绝");
    await host.reviews.respond({ review_id: review.review_id, decision: input.decision, actor_id: this.actorId, ...(input.note ? { note: String(input.note).slice(0, 2000) } : {}) });
    return this.read(workId);
  }

  /** A Coding work, read from Coding's session: the same rounds, questions and confirmations its page shows. */
  private async codingRead(work: StoredWork): Promise<AssistantWorkView> {
    const executor = work.executor as Extract<StoredWork["executor"], { kind: "coding" }>;
    if (!executor.session_id) return { work: this.publicWork(work, "idle"), rounds: [], reviews: [], cards: [] };
    let read: CodingSessionRead;
    try { read = await (await this.coding(work)).read(executor.session_id, 6); }
    catch (error) { return { work: this.publicWork(work, "needs-check"), rounds: [], reviews: [], cards: [], problem: { message: `Coding 会话暂时读不到：${error instanceof Error ? error.message : String(error)}` } }; }
    const stored = new Map(this.store.rounds(work.work_id).map(round => [round.run_id, round]));
    const rounds: AssistantRound[] = read.runs.map(run => {
      const own = stored.get(run.ref.run_id);
      const first = run.turns.find(turn => turn.kind === "user")?.text ?? "";
      return this.roundView(own ?? { run_id: run.ref.run_id, text: first, materials: [], context: null, started_at: run.started_at }, run, undefined);
    });
    const latest = read.runs.at(-1);
    const state = stateOf(latest?.phase, Boolean(read.recovery_required));
    const host = await this.ports.host();
    const runtimeSession = read.session.runtime_session_id ?? null;
    const waiting = new Set(rounds.filter(round => round.phase === "awaiting-review").map(round => round.run_id));
    const reviews = runtimeSession ? this.reviewsFor(host, { ...work, session_id: runtimeSession }).filter(review => review.run_id !== null && waiting.has(review.run_id)) : [];
    const shown: StoredWork = { ...work, executor: { ...executor, ...(read.configuration?.intent ? { mode: read.configuration.intent } : {}) } };
    return { work: this.publicWork(shown, state), rounds, reviews, cards: [],
      ...(read.recovery_required ? { problem: { message: read.error ?? "Coding 会话有需要核对的中断操作", action: "打开 Coding 核对" } } : {}) };
  }

  /** A Coding work's next-round mode, kept on Coding's session so both entries agree. */
  async setExecutorMode(workId: string, mode: string): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (work.executor.kind !== "coding") throw new AssistantError("assistant.invalid", "这项工作不由专业 Agent 执行");
    if (!CODING_MODES.includes(mode)) throw new AssistantError("assistant.invalid", "不认识的方式");
    const coding = await this.coding(work);
    let sessionId = work.executor.session_id;
    if (!sessionId) {
      sessionId = await coding.createSession(work.title);
      this.store.update(this.actorId, work.work_id, null, { executor: { kind: "coding", title: "Coding Agent", session_id: sessionId } });
    }
    await coding.setMode(sessionId, mode);
    return this.read(workId);
  }

  /** What an interrupted round really did, from the runtime's receipts. Nothing is replayed. */
  async recovery(workId: string): Promise<AssistantRecovery> {
    const work = this.store.get(this.actorId, workId);
    if (!work.session_id) return { blockers: [], rounds: [] };
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    if (!adapter.recovery) throw new AssistantError("assistant.unsupported", "当前运行时不能核对中断的执行");
    return this.recoveryView(await adapter.recovery.inspect(sessionRef(work)));
  }

  /** The person has checked the outcome: close the interrupted round so the work can go on. Never re-runs it. */
  async closeInterrupted(workId: string, input: { run_id: string; version: number }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (!work.session_id || !this.store.rounds(work.work_id).some(round => round.run_id === input.run_id)) throw new AssistantError("assistant.scope", "这一轮不属于这项工作");
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    if (!adapter.recovery) throw new AssistantError("assistant.unsupported", "当前运行时不能核对中断的执行");
    await adapter.recovery.close(sessionRef(work), String(input.run_id), Number(input.version));
    return this.read(workId);
  }

  private recoveryView(report: AgentRecoveryReport): AssistantRecovery {
    return { blockers: [...report.blockers], rounds: report.runs.filter(run => !run.subagent).map(run => ({ run_id: run.run_id, version: run.version, can_close: run.can_close,
      blockers: [...run.blockers], operations: run.operations.map(operation => ({ summary: operation.summary, outcome: operation.outcome })) })) };
  }

  /**
   * Record a suggestion the round made, checked against the capability as it is now. A complete input must already
   * satisfy the capability's contract; one with declared missing fields waits for the person to supply them.
   */
  async recordOffer(work: StoredWork, offer: AgentActionOffer, views: readonly ActionView[]): Promise<{ offer_id: string }> {
    const ref = offer.reference;
    const view = views.find(row => row.capability_id === ref.capability_id && row.version === ref.version && row.provider.provider_id === ref.provider_id);
    if (!view || !view.availability.available) throw new AssistantError("assistant.action_revoked", "That capability is not available here; nothing was suggested.");
    const missing = (offer.missing ?? []).filter(item => item.field && item.question);
    if (!missing.length) assertActionInput(view.action.input_schema, offer.input);
    const at = this.now().toISOString();
    const card: StoredCard = { card_id: `card-${randomUUID()}`, work_id: work.work_id, revision: 1, run_id: this.store.rounds(work.work_id).at(-1)?.run_id ?? null,
      title: offer.title, summary: offer.summary, provider: view.provider.title, capability_title: view.action.title, effect: actionEffect(view.action, view.capability_id),
      reference: { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input: structuredClone(offer.input),
      input_schema: view.action.input_schema as Record<string, unknown>, editable: [...new Set(offer.editable ?? [])], missing,
      status: missing.length ? "needs-input" : "ready", created_at: at, updated_at: at };
    this.store.addCard(card);
    return { offer_id: card.card_id };
  }

  /**
   * The person clicked the card: run exactly what it shows, with their adjustments to its editable or missing fields.
   * The card is claimed first, so a second click, another tab or a retry after a restart cannot run it again.
   */
  async runCard(workId: string, cardId: string, input: { revision: number; values?: Record<string, string> }): Promise<AssistantCard> {
    const work = this.store.get(this.actorId, workId);
    let card = this.store.card(work.work_id, cardId);
    if (!["ready", "needs-input", "failed"].includes(card.status)) return cardView(card);
    if (card.revision !== Number(input.revision)) throw new AssistantError("assistant.conflict", "这个建议已经变化，请查看最新内容后再点");
    const values = input.values && typeof input.values === "object" ? input.values : {};
    const allowed = new Set([...card.editable, ...card.missing.map(item => item.field)]);
    const permitted = (key: string) => allowed.has(key) || key.includes(".") && allowed.has(key.split(".")[0]!);
    let prepared = structuredClone(card.input);
    if (Object.keys(values).length) {
      if (!prepared || typeof prepared !== "object" || Array.isArray(prepared)) throw new AssistantError("assistant.invalid", "这个建议没有可调整的字段");
      for (const [key, raw] of Object.entries(values)) {
        if (!permitted(key)) throw new AssistantError("assistant.invalid", `字段「${key}」不能在这里修改`);
        const [head, child] = key.split(".") as [string, string | undefined];
        const properties = card.input_schema.properties as SchemaProperties | undefined;
        const declared = child ? properties?.[head]?.properties?.[child]?.type : properties?.[head]?.type;
        let value: unknown = raw;
        if (declared !== "string" && typeof raw === "string") { try { value = JSON.parse(raw); } catch { value = raw; } }
        if (child) {
          const parent = (prepared as Record<string, unknown>)[head];
          if (!plainObject(parent)) throw new AssistantError("assistant.invalid", `字段「${key}」不能在这里修改`);
          parent[child] = value;
        } else (prepared as Record<string, unknown>)[key] = value;
      }
    }
    const stillMissing = card.missing.filter(item => { const value = (prepared as Record<string, unknown> | null)?.[item.field]; return value === undefined || value === null || value === ""; });
    if (stillMissing.length) throw new AssistantError("assistant.invalid", `还需要填写：${stillMissing.map(item => item.question).join("；")}`);
    const authority = await this.ports.authority(work);
    if (!authority.actions) throw new AssistantError("assistant.unsupported", "当前没有可用的业务能力");
    const client = await authority.actions(RUNTIME);
    const view = (await client.discover()).find(row => row.capability_id === card.reference.capability_id && row.version === card.reference.version && row.provider.provider_id === card.reference.provider_id);
    // The card runs what it shows or not at all: never another capability, version or provider.
    if (!view || !view.availability.available) return cardView(this.store.updateCard(card, card.revision, { status: "stale", outcome: view && !view.availability.available ? view.availability.reason : "这项能力已不可用或已对助理关闭" }));
    try { assertActionInput(view.action.input_schema, prepared); }
    catch (error) { throw new AssistantError("assistant.invalid", `填写的内容不符合要求：${error instanceof Error ? error.message : String(error)}`); }
    card = this.store.updateCard(card, card.revision, { status: "running", request_id: randomUUID(), input: prepared, missing: [], outcome: undefined });
    try {
      const result = await client.invoke(card.reference, prepared);
      const outcome = summarizeResult(result);
      return cardView(this.store.updateCard(card, card.revision, { status: "done", ...(outcome ? { outcome } : {}) }));
    } catch (error) {
      const code = (error as { code?: string }).code ?? "";
      const message = error instanceof Error ? error.message : String(error);
      // An unknown outcome is never offered again as a plain retry: it may already have happened.
      const unknown = /delivery_unknown|host_replaced/.test(code);
      // The data moved on since the suggestion: say so, and let the person ask for a fresh one; never re-aim it quietly.
      const moved = !unknown && (/conflict|stale|revision|version/i.test(code) || /已在其他窗口修改|版本|已变化|已更新|revision|version/i.test(message));
      return cardView(this.store.updateCard(card, card.revision, unknown ? { status: "unknown", outcome: `结果未确认：${message}。请到原处核对，不会自动重试` }
        : moved ? { status: "stale", outcome: `数据在建议之后变化了，这张卡没有执行（${message}）` } : { status: "failed", outcome: message }));
    }
  }

  dismissCard(workId: string, cardId: string): AssistantCard {
    const work = this.store.get(this.actorId, workId);
    const card = this.store.card(work.work_id, cardId);
    if (!["ready", "needs-input", "failed", "stale"].includes(card.status)) return cardView(card);
    return cardView(this.store.updateCard(card, card.revision, { status: "dismissed" }));
  }

  saveDraft(workId: string, draft: string): AssistantWork {
    if (typeof draft !== "string" || draft.length > MAX_TEXT) throw new AssistantError("assistant.invalid", "草稿过长");
    const work = this.store.update(this.actorId, workId, null, { draft }, false);
    return this.publicWork(work, "idle");
  }

  async rename(workId: string, revision: number, title: string): Promise<AssistantWork> {
    const work = this.store.update(this.actorId, workId, revision, { title: checkText(title, "标题", 120).trim() });
    return this.publicWork(work, await this.stateSafely(work));
  }

  async archive(workId: string, archived: boolean): Promise<AssistantWork> {
    const work = this.store.update(this.actorId, workId, null, { archived });
    return this.publicWork(work, await this.stateSafely(work));
  }

  private async createWork(text: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot | null, caller: AssistantCaller,
    executor: AssistantSendInput["executor"]): Promise<StoredWork> {
    const wanted: AssistantScope = scope ?? (caller.project_ref ? { kind: "project", project_id: caller.project_ref.project_id } : { kind: "personal" });
    if (executor === "coding" && wanted.kind !== "project") throw new AssistantError("assistant.scope", "Coding Agent 在项目里工作；个人工作请交给助理");
    if (executor !== undefined && executor !== "assistant" && executor !== "coding") throw new AssistantError("assistant.invalid", "不认识的执行者");
    if (wanted.kind === "project" && wanted.project_id !== caller.project_ref?.project_id) {
      throw new AssistantError("assistant.scope", "只能在当前打开的项目里为它新建工作；个人工作不需要项目");
    }
    const scopeTitle = wanted.kind === "project" ? await this.ports.projectTitle?.(wanted.project_id).catch(() => null) : null;
    return this.store.create({ actor_id: this.actorId, title: titleFrom(text), scope: wanted, origin: context?.source ?? null, ...(scopeTitle ? { scope_title: scopeTitle } : {}),
      ...(executor === "coding" ? { executor: { kind: "coding" as const, title: "Coding Agent", session_id: null } } : {}),
      ...(wanted.kind === "project" ? { project_ref: caller.project_ref! } : {}) });
  }

  private async coding(work: StoredWork): Promise<CodingExecutor> {
    if (!this.ports.personActions) throw new AssistantError("assistant.unsupported", "当前环境不能从这里使用 Coding Agent");
    return new CodingExecutor(await this.ports.personActions(work));
  }

  /** A work carried by Coding: its round starts, continues or is answered in Coding's own session. */
  private async codingDispatch(work: StoredWork, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, mode?: string): Promise<AssistantSendResult> {
    const coding = await this.coding(work);
    let sessionId = work.executor.kind === "coding" ? work.executor.session_id : null;
    if (!sessionId) {
      sessionId = await coding.createSession(work.title);
      work = this.store.update(this.actorId, work.work_id, null, { executor: { kind: "coding", title: "Coding Agent", session_id: sessionId } });
      // The mode chosen before the first Send is saved on the session, where the Coding page reads it too.
      if (mode) await coding.setMode(sessionId, mode);
    }
    const read = await coding.read(sessionId, 2);
    if (read.recovery_required) throw new AssistantError("assistant.needs_check", read.error ?? "Coding 会话有需要核对的中断操作", undefined, "打开 Coding 核对");
    const latest = read.runs.at(-1);
    if (latest && !isTerminalAgentPhase(latest.phase)) {
      const question = this.freeTextQuestion(latest.awaiting_input);
      if (latest.phase === "awaiting-input" && question && !materials.length) {
        await coding.control(sessionId, latest.ref.run_id, { kind: "answer", pending_id: question.pending_id, pending_revision: question.pending_revision ?? 1, text });
        return this.result(work, "answered", latest.ref.run_id);
      }
      await coding.control(sessionId, latest.ref.run_id, { kind: "steer", text: this.steerText(text, materials, context) });
      return this.result(work, "steered", latest.ref.run_id);
    }
    await coding.start(sessionId, this.steerText(text, materials, context), read);
    const after = await coding.read(sessionId, 1);
    const run = after.runs.at(-1);
    if (run) this.store.addRound(work.work_id, { run_id: run.ref.run_id, text, materials, context, started_at: this.now().toISOString() });
    return this.result(work, "started", run?.ref.run_id ?? "");
  }

  private async dispatch(work: StoredWork, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, mode?: string): Promise<AssistantSendResult> {
    if (work.executor.kind === "coding") return this.codingDispatch(work, text, materials, context, mode);
    const host = await this.ports.host();
    const adapter = host.adapter(RUNTIME);
    const authority = await this.ports.authority(work);
    if (!work.session_id) {
      const session = await host.createSession(RUNTIME, { board_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID,
        actor_id: this.actorId, title: work.title, workspace: "business", role_id: ASSISTANT_ROLE_ID }, authority);
      work = this.store.update(this.actorId, work.work_id, null, { session_id: session.session_id });
    }
    const session = await adapter.readSession(sessionRef(work));
    if (session.recovery) throw new AssistantError("assistant.needs_check", session.recovery.reason, undefined, "核对上一轮的实际结果后再继续");
    const latest = session.latest_run;
    if (latest && !isTerminalAgentPhase(latest.phase)) {
      if (latest.phase === "reconcile-required") throw new AssistantError("assistant.needs_check", "上一轮有结果未确认的操作，需要先核对", undefined, "打开这项工作核对");
      const question = this.freeTextQuestion(latest.awaiting_input);
      if (latest.phase === "awaiting-input" && question && !materials.length) {
        await adapter.control(latest.ref, { kind: "answer", pending_id: question.pending_id, ...(question.pending_revision !== undefined ? { pending_revision: question.pending_revision } : {}), text });
        return this.result(work, "answered", latest.ref.run_id);
      }
      await adapter.control(latest.ref, { kind: "steer", text: this.steerText(text, materials, context) });
      return this.result(work, "steered", latest.ref.run_id);
    }
    const offered = await this.actionTools(authority);
    this.titles.set(ownerOf(work), new Map(offered.map(view => [view.capability_id, { title: view.action.title, provider: view.provider.title }])));
    const handle = await host.start(RUNTIME, {
      board_id: ownerOf(work), plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID, actor_id: this.actorId,
      session: sessionRef(work), role_id: ASSISTANT_ROLE_ID, workspace: "business", task: text,
      action_gateway: true,
      text_materials: await this.roundMaterials(work, materials, context, offered),
      history: "session", budget: { max_turns: ROUND_TURNS }, skills: [], mcp_tools: [], mcp_sources: [], session_title: work.title,
    }, authority);
    this.store.addRound(work.work_id, { run_id: handle.ref.run_id, text, materials, context, started_at: this.now().toISOString() });
    return this.result(work, "started", handle.ref.run_id);
  }

  private async result(work: StoredWork, outcome: AssistantSendResult["outcome"], runId: string): Promise<AssistantSendResult> {
    // Sent text is no longer a draft; the work moves to the top of the list.
    const updated = this.store.update(this.actorId, work.work_id, null, { draft: "" });
    return { work: this.publicWork(updated, await this.stateSafely(updated)), outcome, run_id: runId };
  }

  /** Every action this scope offers to agents and can run now. The Host re-checks each one at start and at dispatch. */
  private async actionTools(authority: AgentStartAuthority): Promise<ActionView[]> {
    if (!authority.actions) return [];
    const client = await authority.actions(RUNTIME);
    const views = await client.discover();
    return views.filter(view => view.action.audiences.includes("agent") && view.availability.available && view.provider.provider_id)
      .slice(0, MAX_ACTION_TOOLS);
  }

  /** What exists, grouped by who provides it, so the round knows what to search for; schemas stay deferred until needed. */
  private directory(views: readonly ActionView[]): string {
    const groups = new Map<string, string[]>();
    for (const view of views) {
      const effect = actionEffect(view.action, view.capability_id);
      const mark = effect === "read" ? "" : effect === "irreversible" ? "（不可撤回）" : "（修改）";
      const list = groups.get(view.provider.title) ?? [];
      list.push(view.action.title + mark);
      groups.set(view.provider.title, list);
    }
    return ["本轮可用的业务能力（按提供方分组）。用 find-capabilities 按“提供方 名称”搜索取得准确标识与参数；读取类用 read-capability，标“修改”“不可撤回”的用 change-capability，执行前会请用户确认：",
      ...[...groups].map(([provider, titles]) => `- ${provider}：${titles.join("、")}`)].join("\n");
  }

  /** The round's situation and the person's materials, as marked data. Changing facts travel here, not in the role. */
  private async roundMaterials(work: StoredWork, materials: AssistantMaterial[], context: AssistantContextSnapshot | null, offered: readonly ActionView[]): Promise<AgentTextMaterial[]> {
    const zone = this.ports.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = this.now();
    const local = new Intl.DateTimeFormat("zh-CN", { timeZone: zone, dateStyle: "full", timeStyle: "short" }).format(now);
    const where = work.scope.kind === "personal" ? "个人工作（不属于任何项目，使用个人范围的能力）"
      : `项目「${(await this.ports.projectTitle?.(work.scope.project_id).catch(() => null)) ?? work.scope.project_id}」中的工作（只使用这个项目的能力与资料）`;
    const situation = [`现在是 ${local}（时区 ${zone}，${now.toISOString()}）。`, `这项工作：「${work.title}」，${where}。`,
      work.origin ? `工作最初从「${work.origin.title ?? work.origin.surface}」页面发起。` : ""].filter(Boolean).join("\n");
    const base = { source_artifact_id: work.work_id, source_version: 1 };
    const out: AgentTextMaterial[] = [{ ...base, material_id: "situation", title: "本轮情况", text: situation }];
    // What the person did with earlier suggestions since the last round: the next round goes on from there.
    const since = this.store.rounds(work.work_id).at(-1)?.started_at ?? "";
    const handled = this.store.cards(work.work_id).filter(card => card.updated_at > since && ["done", "failed", "unknown", "dismissed", "stale"].includes(card.status));
    if (handled.length) out.push(...chunked({ ...base, title: "用户对建议的处理" }, "cards", handled.map(card => `- 「${card.title}」：${{ done: "已执行", failed: "执行失败", unknown: "结果未确认", dismissed: "用户忽略", stale: "已失效" }[card.status as "done"]}${card.outcome ? `（${card.outcome.slice(0, 300)}）` : ""}`).join("\n")));
    out.push(...chunked({ ...base, title: "可用能力目录" }, "capabilities", offered.length ? this.directory(offered) : "本轮没有可用的业务能力。需要操作数据时，如实告诉用户缺少哪类能力或授权。"));
    if (context) {
      const lines = [`页面：${context.source.title ?? context.source.surface}${context.source.plugin_id ? `（${context.source.plugin_id}）` : ""}`,
        context.object ? `正在看的对象：${context.object.title ?? context.object.id}（${context.object.kind}${context.object.version !== undefined ? `，版本 ${context.object.version}` : ""}）` : "",
        context.unsaved ? "对象有未保存的修改：选区来自草稿，不是已保存版本。" : "",
        context.selection ? `选中的内容${context.selection.truncated ? "（已截断）" : ""}：\n${context.selection.text}` : ""].filter(Boolean).join("\n");
      out.push(...chunked({ ...base, title: "当前页面（发送时）" }, "page", lines));
    }
    for (const material of materials) {
      const head = [`${material.explicit ? "用户明确添加" : "来自当前页面，用户保留"}；类型：${material.kind}${material.draft ? "；未保存草稿" : ""}`,
        material.source ? `来源：${material.source.title ?? material.source.surface}` : "",
        material.object ? `对象：${material.object.title ?? material.object.id}（${material.object.kind}${material.object.version !== undefined ? `，版本 ${material.object.version}` : ""}）` : ""].filter(Boolean).join("\n");
      out.push(...chunked({ ...base, title: `材料：${material.title}` }, `material-${material.material_id}`, `${head}\n\n${material.text ?? "（没有可读正文）"}`));
    }
    return out.slice(0, 30);
  }

  /** A supplement reaches a running round as text; its materials go with it, marked as data. */
  private steerText(text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null): string {
    const parts = [text];
    if (context?.selection) parts.push(`【发送时的选区，数据】${context.selection.text.slice(0, 4000)}`);
    for (const material of materials) parts.push(`【附带材料「${material.title}」，数据】${(material.text ?? "").slice(0, 4000)}`);
    return parts.join("\n\n").slice(0, MAX_TEXT);
  }

  private freeTextQuestion(questions: readonly AgentPendingQuestion[]): AgentPendingQuestion | undefined {
    return questions.length === 1 && questions[0]!.allows_free_text && !questions[0]!.questions?.length ? questions[0] : undefined;
  }

  private async latestRun(host: AgentHost, work: StoredWork): Promise<AgentRunView | null> {
    if (!work.session_id) return null;
    return (await host.adapter(RUNTIME).readSession(sessionRef(work))).latest_run;
  }

  private async stateFor(host: AgentHost, work: StoredWork): Promise<AssistantWorkState> {
    if (work.executor.kind === "coding") {
      if (!work.executor.session_id) return "idle";
      try { const read = await (await this.coding(work)).read(work.executor.session_id, 1); return stateOf(read.runs.at(-1)?.phase, Boolean(read.recovery_required)); }
      catch { return "needs-check"; }
    }
    if (!work.session_id) return "idle";
    const adapter = host.adapter(RUNTIME);
    try {
      if (adapter.readSessionStatus) {
        const { status } = await adapter.readSessionStatus(sessionRef(work));
        return stateOf(status.latest_phase, status.recovery);
      }
      const session = await adapter.readSession(sessionRef(work));
      return stateOf(session.latest_run?.phase, Boolean(session.recovery));
    } catch { return "needs-check"; }
  }

  private async stateSafely(work: StoredWork): Promise<AssistantWorkState> {
    try { return await this.stateFor(await this.ports.host(), work); } catch { return work.session_id ? "needs-check" : "idle"; }
  }

  private reviewsFor(host: AgentHost, work: StoredWork): AssistantPendingReview[] {
    return host.reviews.list(ownerOf(work), "pending").filter(review => review.run?.session_id === work.session_id).map(review => {
      const readable = describeReview(review.document);
      return { review_id: review.review_id, kind: review.document.kind, run_id: review.run?.run_id ?? null, summary: readable.summary, fields: readable.fields,
        requested_at: review.requested_at, expires_at: review.expires_at };
    });
  }

  private roundView(round: StoredRound, view: AgentRunView | undefined, titles: CapabilityTitles | undefined): AssistantRound {
    return { run_id: round.run_id, text: round.text, context: round.context, started_at: round.started_at,
      materials: round.materials.map(({ text: _text, ...rest }) => rest),
      phase: view?.phase ?? "unknown", turns: view?.turns ?? [], activity: presentActivity(view?.activity ?? [], titles, view ? isTerminalAgentPhase(view.phase) : false), awaiting_input: view?.awaiting_input ?? [],
      ...(view?.usage ? { usage: view.usage } : {}), ...(view?.stop_reason ? { stop_reason: view.stop_reason } : {}), ended_at: view?.ended_at ?? null };
  }

  private publicWork(work: StoredWork, state: AssistantWorkState): AssistantWork {
    const { actor_id: _actor, project_ref: _ref, ...rest } = work;
    return { ...rest, state };
  }

  /** A runtime failure in words the person can act on; codes stay for the surface. */
  private explain(error: unknown): AssistantError {
    if (error instanceof AssistantStoreError) return new AssistantError(error.code, error.message);
    if (error instanceof CodingUnavailable) return new AssistantError("assistant.coding_unavailable", error.message, undefined, error.action);
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured" || /没有配置可用的模型/.test(message)) return new AssistantError("assistant.model_missing", "还没有配置可用的模型，助理无法开始工作", undefined, "打开模型设置");
    if (code === "agent.session_busy") return new AssistantError("assistant.busy", message);
    if (code === "agent.storage_busy") return new AssistantError("assistant.runtime_busy", "Agent 执行服务正由另一个进程使用，稍后再试", undefined, "关闭另一个正在运行的 Molis 服务后重试");
    return new AssistantError(code || "assistant.failed", message || "这次没有完成");
  }
}
