import type { AgentHost, AgentStartAuthority } from "@molis-ai/molis-work-service-agent-host";
import type { AgentPendingQuestion, AgentRecoveryReport, AgentRunView, AgentSessionRef, AgentTextMaterial, AgentToolActivity } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { actionEffect, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import {
  ASSISTANT_INSTALL_ID, ASSISTANT_PERSONAL_OWNER, ASSISTANT_PLUGIN_ID,
  type AssistantActivity, type AssistantContextSnapshot, type AssistantControl, type AssistantRecovery, type AssistantMaterial, type AssistantPendingReview, type AssistantRound,
  type AssistantScope, type AssistantSendInput, type AssistantSendResult, type AssistantWork, type AssistantWorkState, type AssistantWorkView,
} from "@molis-ai/molis-work-contracts/services/assistant";
import { ASSISTANT_ROLE_ID } from "./assistant-agent.js";
import { AssistantStoreError, type AssistantStore, type StoredRound, type StoredWork } from "./assistant-store.js";

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

/** Titles of the capabilities a scope offered at its latest round start, to name them in the activity. */
type CapabilityTitles = Map<string, { title: string; provider: string }>;

/** Activity in the person's terms: what was looked up, read or changed — not the tool log. */
export function presentActivity(activity: readonly AgentToolActivity[], titles: CapabilityTitles | undefined): AssistantActivity[] {
  const verbs: Record<string, string> = { "find-capabilities": "lookup", "read-capability": "read", "change-capability": "change", "ask-user": "ask", "update-todo": "todo" };
  return activity.flatMap(item => {
    if (item.name === "reasoning" || item.name === "context-remaining") return [];
    const verb = verbs[item.name] ?? item.name;
    const named = titles?.get(item.target);
    const target = (verb === "read" || verb === "change") && named ? `${named.provider} · ${named.title}` : item.target;
    const reason = item.state !== "failed" ? undefined : /EFFECT_NOT_AUTHORIZED/.test(item.summary) ? "not-authorized" as const
      : /reject|declin|拒绝/i.test(item.summary) ? "declined" as const : undefined;
    const detail = item.state === "failed" && item.output ? item.output.replace(/\s+/g, " ").trim().slice(0, 300) : "";
    return [{ call_id: item.call_id, verb, target, state: item.state, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}), ...(item.sequence !== undefined ? { sequence: item.sequence } : {}) }];
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
    const claim = this.store.claimRequest(this.actorId, String(input.request_id ?? ""));
    if (!claim.claimed) return claim.result;
    let work: StoredWork | undefined;
    try {
      work = input.work_id ? this.store.get(this.actorId, input.work_id) : await this.createWork(text, input.scope, context, caller);
      const result = await this.dispatch(work, text, materials, context);
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
    if (!review || review.run?.session_id !== work.session_id || review.board_id !== ownerOf(work)) throw new AssistantError("assistant.scope", "这项确认不属于这项工作");
    if (!["approve", "reject"].includes(input.decision)) throw new AssistantError("assistant.invalid", "请选择允许或拒绝");
    await host.reviews.respond({ review_id: review.review_id, decision: input.decision, actor_id: this.actorId, ...(input.note ? { note: String(input.note).slice(0, 2000) } : {}) });
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

  private async createWork(text: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot | null, caller: AssistantCaller): Promise<StoredWork> {
    const wanted: AssistantScope = scope ?? (caller.project_ref ? { kind: "project", project_id: caller.project_ref.project_id } : { kind: "personal" });
    if (wanted.kind === "project" && wanted.project_id !== caller.project_ref?.project_id) {
      throw new AssistantError("assistant.scope", "只能在当前打开的项目里为它新建工作；个人工作不需要项目");
    }
    const scopeTitle = wanted.kind === "project" ? await this.ports.projectTitle?.(wanted.project_id).catch(() => null) : null;
    return this.store.create({ actor_id: this.actorId, title: titleFrom(text), scope: wanted, origin: context?.source ?? null, ...(scopeTitle ? { scope_title: scopeTitle } : {}),
      ...(wanted.kind === "project" ? { project_ref: caller.project_ref! } : {}) });
  }

  private async dispatch(work: StoredWork, text: string, materials: AssistantMaterial[], context: AssistantContextSnapshot | null): Promise<AssistantSendResult> {
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
      const document = review.document as { summary?: string; fields?: Array<{ label: string; value: string }> };
      return { review_id: review.review_id, run_id: review.run?.run_id ?? null, summary: document.summary ?? "需要你确认的操作",
        fields: (document.fields ?? []).map(field => ({ label: field.label, value: field.value })), requested_at: review.requested_at, expires_at: review.expires_at };
    });
  }

  private roundView(round: StoredRound, view: AgentRunView | undefined, titles: CapabilityTitles | undefined): AssistantRound {
    return { run_id: round.run_id, text: round.text, context: round.context, started_at: round.started_at,
      materials: round.materials.map(({ text: _text, ...rest }) => rest),
      phase: view?.phase ?? "unknown", turns: view?.turns ?? [], activity: presentActivity(view?.activity ?? [], titles), awaiting_input: view?.awaiting_input ?? [],
      ...(view?.usage ? { usage: view.usage } : {}), ...(view?.stop_reason ? { stop_reason: view.stop_reason } : {}), ended_at: view?.ended_at ?? null };
  }

  private publicWork(work: StoredWork, state: AssistantWorkState): AssistantWork {
    const { actor_id: _actor, project_ref: _ref, ...rest } = work;
    return { ...rest, state };
  }

  /** A runtime failure in words the person can act on; codes stay for the surface. */
  private explain(error: unknown): AssistantError {
    if (error instanceof AssistantStoreError) return new AssistantError(error.code, error.message);
    const code = (error as { code?: string })?.code ?? "";
    const message = error instanceof Error ? error.message : String(error);
    if (code === "agent.model_not_configured" || /没有配置可用的模型/.test(message)) return new AssistantError("assistant.model_missing", "还没有配置可用的模型，助理无法开始工作", undefined, "打开模型设置");
    if (code === "agent.session_busy") return new AssistantError("assistant.busy", message);
    if (code === "agent.storage_busy") return new AssistantError("assistant.runtime_busy", "Agent 执行服务正由另一个进程使用，稍后再试", undefined, "关闭另一个正在运行的 Molis 服务后重试");
    return new AssistantError(code || "assistant.failed", message || "这次没有完成");
  }
}
