import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AgentHost } from "@molis-ai/molis-work-service-agent-host";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isTerminalAgentPhase } from "@molis-ai/molis-work-contracts/services/agent-host";
import { isSubjectReader, type ActionSubjectContext, type ActionView, type WorkExecutorSession } from "@molis-ai/molis-work-contracts/platform/actions";
import { describeReview } from "./assistant-review-words.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import { roundModel, workView } from "./assistant-work-view.js";
import type { AssistantMethod, AssistantPendingReview, AssistantRound, AssistantWork, AssistantWorkState, AssistantWorkView, AssistantRelatedWork, AssistantWorkObject, AssistantDiagnostics, AssistantRoundDiagnostics } from "@molis-ai/molis-work-contracts/services/assistant";
import { L } from "../web-locale.js";
import { identity } from "./assistant-relations.js";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { assistantErrors } from "./assistant-errors.js";
import type { PersonActions } from "./assistant-executor.js";
import { queuedInputs } from "./assistant-inputs.js";
import { ownerOf } from "./assistant-round-start.js";
import { sessionProblem } from "./assistant-parked-answer.js";
import { RUNTIME, sessionRef, belongsElsewhere, HANDOVER_MARK, whereNow, type AssistantServicePorts, type AssistantCaller } from "./assistant-service-shared.js";
import { stateOf, spokenTurns, roundDiagnostics, stopInWords, presentActivity, type CapabilityTitles } from "./assistant-present.js";
import type { AssistantDispatch } from "./assistant-dispatch.js";
import type { AssistantOutcomes } from "./assistant-outcomes.js";
import type { AssistantRoundMaterials } from "./assistant-round-materials.js";

export type AssistantWorkReadsLinks = Pick<AssistantOutcomes, "capabilityTitles" | "rememberTitle" | "rememberedTitle"> & Pick<AssistantDispatch, "executorOf"> & Pick<AssistantRoundMaterials, "holdsImage"> & { continuations: Pick<AssistantContinuations, "state">; delegations: Pick<AssistantDelegations, "shown"> };

/**
 * Reading a work: its rounds in the Assistant's session and the executor's, its state, the objects it relates to as
 * their owners have them now, the methods its scope offers, and diagnostics. Only its ports reach the Host; the other
 * collaborators come through `link`.
 */
export class AssistantWorkReads {
  constructor(private readonly store: Pick<AssistantStore, "get" | "objectTitleById" | "relations" | "rounds" | "roundsSince">, private readonly ports: AssistantServicePorts, private readonly actorId: string, private readonly now: () => Date, private readonly link: AssistantWorkReadsLinks) {}

  /** Works started before scope titles were kept still show their project's name. */
  async named(work: StoredWork): Promise<StoredWork> {
    if (work.scope.kind !== "project" || work.scope_title) return work;
    const title = await this.ports.projectTitle?.(work.scope.project_id).catch(() => null);
    return title ? { ...work, scope_title: title } : work;
  }

  /** The rounds run in the Assistant's own session. */
  async assistantPart(work: StoredWork): Promise<{ rounds: AssistantRound[]; reviews: AssistantPendingReview[]; recovery: boolean; problem?: { message: string; action?: string };
    memory: Map<string, import("@molis-ai/molis-work-contracts/services/agent-host").AgentMemoryRecallFact>;
    queued: Pick<AssistantWorkView, "queued_inputs"> }> {
    const host = await this.ports.host();
    const adapter = host.adapter(RUNTIME);
    const stored = this.store.rounds(work.work_id).filter(round => round.executor !== "plugin");
    const session = await adapter.readSession(sessionRef(work)).catch(() => null);
    const recovery = session?.recovery;
    const views = new Map<string, AgentRunView>();
    // Older rounds first come from the session's own record; a run the store knows but the runtime lost reads as unknown.
    await Promise.all(stored.slice(-30).map(async round => {
      const view = await adapter.read({ session_id: work.session_id!, run_id: round.run_id }).catch(() => null);
      if (view) views.set(round.run_id, view);
    }));
    const titles = await this.link.capabilityTitles(work);
    const rounds: AssistantRound[] = stored.slice(-30).map(round => ({ ...this.roundView(round, views.get(round.run_id), titles), executor: "assistant" as const }));
    // Only a round that is really waiting on a decision shows one; a review left behind by an ended round is not offered.
    const waiting = new Set(rounds.filter(round => round.phase === "awaiting-review").map(round => round.run_id));
    // What each run really took from memory, from the runtime's own event.
    const memory = new Map([...views].filter(([, view]) => view.memory_recalled).map(([runId, view]) => [runId, view.memory_recalled!]));
    return { rounds, reviews: this.reviewsFor(host, work).filter(review => review.run_id !== null && waiting.has(review.run_id)), recovery: Boolean(recovery), memory,
      queued: queuedInputs(session),
      ...sessionProblem(recovery, rounds, session) };
  }

  /** The rounds run in the executor's session the work carries, read through the executor's own actions. */
  async executorPart(work: StoredWork, carried: { plugin_id: string; session_id: string }): Promise<{ rounds: AssistantRound[]; reviews: AssistantPendingReview[]; recovery: boolean; unreadable?: boolean;
    mode?: string; problem?: { message: string; action?: string } }> {
    let read: WorkExecutorSession;
    try { read = await (await this.link.executorOf(work, carried.plugin_id)).read(carried.session_id, 6); }
    catch (error) { return { rounds: [], reviews: [], recovery: false, unreadable: true, problem: { message: `执行方的会话暂时读不到：${error instanceof Error ? error.message : String(error)}` } }; }
    const stored = new Map(this.store.rounds(work.work_id).map(round => [round.run_id, round]));
    const rounds: AssistantRound[] = read.runs.map(run => {
      const own = stored.get(run.ref.run_id);
      const first = run.turns.find(turn => turn.kind === "user")?.text ?? "";
      const view = this.roundView(own ?? { run_id: run.ref.run_id, text: first, materials: [], context: null, started_at: run.started_at }, run, undefined);
      // The handover note travels in the executor's task; the person's own message is what they read as theirs.
      const turns = own ? view.turns.map(turn => turn.kind === "user" && turn.text?.startsWith(HANDOVER_MARK) ? { ...turn, text: own.text } : turn) : view.turns;
      return { ...view, turns, executor: "plugin" as const };
    });
    const host = await this.ports.host();
    const waiting = new Set(rounds.filter(round => round.phase === "awaiting-review").map(round => round.run_id));
    const reviews = read.runtime_session_id ? this.reviewsFor(host, { ...work, session_id: read.runtime_session_id }).filter(review => review.run_id !== null && waiting.has(review.run_id)) : [];
    return { rounds, reviews, recovery: Boolean(read.recovery), ...(read.mode ? { mode: read.mode } : {}),
      ...(read.recovery ? { problem: { message: read.recovery.message, action: L("到执行方的页面核对") } } : {}) };
  }

  /**
   * The objects a work relates to, read again from their owners. Nothing is copied: the owner says what it is now,
   * and the work compares that with the revision it recorded — which is how an edit the person made by hand shows up.
   */
  async workObjects(work: StoredWork): Promise<AssistantWorkObject[]> {
    const all = this.store.relations.forWork(identity(work));
    // The session that carries the work is shown once, as the session, even when the work also started from it.
    const relations = all.filter(row => !(row.relation === "origin" && all.some(other => other.relation === "session" && other.object.kind === row.object.kind && other.object.id === row.object.id)));
    if (!relations.length) return [];
    // An object no reader can read keeps the name its page gave it when a round started there, not its identifier.
    const named = new Map<string, string>();
    for (const round of this.store.rounds(work.work_id)) {
      const object = round.context?.object;
      if (object?.title) named.set(`${object.kind}:${object.id}`, object.title);
    }
    const nameOf = (object: { kind: string; id: string }) => named.get(`${object.kind}:${object.id}`) || this.link.rememberedTitle(object) || object.id;
    let actions: PersonActions | null = null;
    let readers: readonly ActionView[] = [];
    try { actions = await this.ports.scopeActions?.(work) ?? null; readers = actions ? (await actions.discover()).filter(view => isSubjectReader(view.action)) : []; }
    catch { actions = null; }
    return Promise.all(relations.slice(-40).map(async relation => {
      const base = { relation: relation.relation, subject: { kind: relation.object.kind, id: relation.object.id }, recorded_revision: relation.object.revision, recorded_at: relation.recorded_at };
      const reader = readers.find(view => view.action.subject_kinds.includes(relation.object.kind) && view.availability.available);
      if (!actions || !reader) return { ...base, title: nameOf(relation.object), current_revision: null, state: "unavailable" as const };
      try {
        const context = await actions.invoke({ capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: relation.object.id }) as ActionSubjectContext;
        if (belongsElsewhere(work, context)) {
          const moved = await whereNow(work, actions, relation.object);
          return { ...base, title: moved?.title ?? context.title ?? nameOf(relation.object), current_revision: null, state: "moved" as const, ...(moved ? { moved_to: moved.to } : {}) };
        }
        const changed = relation.object.revision !== null && context.revision !== relation.object.revision;
        if (context.title) this.link.rememberTitle(relation.object, context.title);
        return { ...base, title: context.title || nameOf(relation.object), current_revision: context.revision, state: changed ? "changed" as const : "current" as const,
          ...(context.open ? { open: context.open } : {}) };
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (/not_found|missing|deleted/.test(code)) {
          // Not here any more may mean moved: the placement service says where, and the work names it without reading it.
          const moved = await whereNow(work, actions, relation.object);
          if (moved) return { ...base, title: moved.title, current_revision: null, state: "moved" as const, moved_to: moved.to };
          return { ...base, title: nameOf(relation.object), current_revision: null, state: "missing" as const };
        }
        return { ...base, title: nameOf(relation.object), current_revision: null, state: "unavailable" as const };
      }
    }));
  }

  /**
   * Methods Plugins offer for business work that this scope can use: registered with the Host, and their Plugin has
   * something available here (not turned off in this project). Discoverable is not adopted: a round takes one when
   * the person chooses it or the round reads it, and only for that round.
   */
  async methods(work: StoredWork | null, caller: AssistantCaller = {}): Promise<AssistantMethod[]> {
    if (!this.ports.methods) return [];
    let actions: PersonActions | null = null;
    try { actions = await this.ports.scopeActions?.(work ?? ({ project_ref: caller.project_ref ?? undefined } as StoredWork)) ?? null; } catch { actions = null; }
    const live = new Set((actions ? await actions.discover().catch(() => [] as ActionView[]) : []).filter(view => view.availability.available).map(view => view.provider.provider_id));
    // Read after the scope is open: opening it starts its plugins, and a plugin's methods are registered by its running definition (PG-051).
    return this.ports.methods.list().filter(method => live.has(method.owner_id)).map(method => ({ method_id: method.key, plugin_id: method.owner_id,
      plugin_title: method.source.kind === "plugin" ? method.source.title : method.owner_id, version: method.version, name: method.name, summary: method.summary }));
  }

  /** One method's body for a round, when this work's scope can use it. */
  async readMethod(work: StoredWork | null, methodId: string): Promise<AssistantMethod & { body: string }> {
    const found = (await this.methods(work)).find(method => method.method_id === methodId);
    if (!found || !this.ports.methods) throw assistantErrors.invalid(`没有可用的方法「${methodId}」（插件没有提供、已停用，或不在这个范围）`);
    const body = this.ports.methods.read(found.plugin_id, methodId.slice(found.plugin_id.length + 1), found.version).body;
    return { ...found, body };
  }

  /** A work of this person, as stored (for the Assistant's own actions acting for it); null when it is not theirs. */
  workRecord(workId: string): StoredWork | null {
    try { return this.store.get(this.actorId, workId); } catch { return null; }
  }

  /** Which object kind each surface's tab items are, as plugins declare their search sources (kind and surface). */
  async surfaceKinds(caller: AssistantCaller): Promise<Record<string, string>> {
    let actions: PersonActions | null = null;
    try { actions = await this.ports.scopeActions?.({ project_ref: caller.project_ref ?? undefined } as StoredWork) ?? null; } catch { return {}; }
    if (!actions) return {};
    const seen = new Map<string, Set<string>>();
    for (const view of await actions.discover().catch(() => [] as ActionView[])) {
      for (const item of view.action.search_source?.kinds ?? []) {
        if (item.surface) seen.set(item.surface, (seen.get(item.surface) ?? new Set<string>()).add(item.kind));
      }
    }
    // A surface that lists more than one kind cannot say which one its open tab is.
    return Object.fromEntries([...seen].filter(([, kinds]) => kinds.size === 1).map(([surface, kinds]) => [surface, [...kinds][0]!]));
  }

  /** The works that relate to an object in a project (or in the person's own scope), for that object's page. */
  async related(projectId: string | null, subject: { kind: string; id: string }): Promise<AssistantRelatedWork[]> {
    const rows = this.store.relations.forObject(projectId, subject);
    const out: AssistantRelatedWork[] = [];
    for (const row of rows) {
      let work: StoredWork;
      try { work = this.store.get(this.actorId, row.work_id); } catch { continue; }
      if (work.archived) continue;
      out.push({ work_id: work.work_id, title: work.title, state: await this.stateSafely(work), relation: row.relation, recorded_revision: row.object.revision, updated_at: work.updated_at });
    }
    return out.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  async latestRun(host: AgentHost, work: StoredWork): Promise<AgentRunView | null> {
    if (!work.session_id) return null;
    return (await host.adapter(RUNTIME).readSession(sessionRef(work))).latest_run;
  }

  async stateFor(host: AgentHost, work: StoredWork): Promise<AssistantWorkState> {
    if (work.executor.kind === "plugin") {
      if (!work.executor.session_id) return "idle";
      try { const read = await (await this.link.executorOf(work)).read(work.executor.session_id, 1); return stateOf(read.runs.at(-1)?.phase, Boolean(read.recovery)); }
      catch { return "needs-check"; }
    }
    if (!work.session_id) return "idle";
    const adapter = host.adapter(RUNTIME);
    try {
      if (adapter.readSessionStatus) {
        const { status } = await adapter.readSessionStatus(sessionRef(work));
        return this.link.continuations.state(work, stateOf(status.latest_phase, status.recovery));
      }
      const session = await adapter.readSession(sessionRef(work));
      return this.link.continuations.state(work, stateOf(session.latest_run?.phase, Boolean(session.recovery)));
    } catch { return "needs-check"; }
  }

  async stateSafely(work: StoredWork): Promise<AssistantWorkState> {
    try { return await this.stateFor(await this.ports.host(), work); } catch { return work.session_id ? "needs-check" : "idle"; }
  }

  private reviewsFor(host: AgentHost, work: StoredWork): AssistantPendingReview[] {
    const pending = host.reviews.list(ownerOf(work), "pending").filter(review => review.run?.session_id === work.session_id);
    if (!pending.length) return [];
    // A field that is just the identifier of an object this work knows reads as that object's name (seen: “对象 = 6d3502b1-…”).
    const titles = new Map<string, string>();
    for (const row of this.store.relations.forWork(identity(work))) {
      const title = this.link.rememberedTitle(row.object);
      if (title) titles.set(row.object.id, title);
    }
    for (const round of this.store.rounds(work.work_id)) if (round.context?.object?.title) titles.set(round.context.object.id, round.context.object.title);
    return pending.map(review => {
      const readable = describeReview(review.document);
      // Also an object another work made or a page named (titles are kept per person): a delete of one is the usual case.
      const titleOf = (value: string) => titles.get(value) ?? (/^[\w.:-]{8,200}$/.test(value) && /\d/.test(value) ? this.store.objectTitleById(this.actorId, value) : null);
      const fields = readable.fields.map(field => { const title = field.label === "完整参数" ? null : titleOf(field.value.trim()); return title ? { ...field, value: `「${title}」` } : field; });
      return { review_id: review.review_id, kind: review.document.kind, run_id: review.run?.run_id ?? null, summary: readable.summary, fields,
        requested_at: review.requested_at, expires_at: review.expires_at };
    });
  }

  /**
   * The developer diagnostics page: the runtime's own account of its assembly, and the Assistant's latest rounds of the
   * past week with the exact identities and versions they ran with. A plugin's rounds are traced by the plugin.
   */
  async diagnostics(limit = 15): Promise<AssistantDiagnostics> {
    const host = await this.ports.host();
    const adapter = host.adapter(RUNTIME);
    const since = new Date(this.now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recent = this.store.roundsSince(this.actorId, since).filter(({ round }) => round.executor !== "plugin").slice(0, Math.max(1, Math.min(limit, 50)));
    const works = new Map<string, StoredWork | null>();
    const workOf = (workId: string) => {
      if (!works.has(workId)) { try { works.set(workId, this.store.get(this.actorId, workId)); } catch { works.set(workId, null); } }
      return works.get(workId) ?? null;
    };
    const rounds = await Promise.all(recent.map(async ({ work_id, round }): Promise<AssistantRoundDiagnostics> => {
      const work = workOf(work_id);
      const view = work?.session_id ? await adapter.read({ session_id: work.session_id, run_id: round.run_id }).catch(() => null) : null;
      return roundDiagnostics(work_id, work, round, view);
    }));
    return { runtime: adapter.diagnostics?.() ?? null, rounds };
  }

  private roundView(round: StoredRound, view: AgentRunView | undefined, titles: CapabilityTitles | undefined): AssistantRound {
    return { run_id: round.run_id, text: round.text, context: round.context, started_at: round.started_at, ...(round.character ? { character: { ...round.character } } : {}), ...(round.written_by === "host" ? { written_by: "host" as const } : {}),
      materials: round.materials.map(({ text: _text, ...rest }) => rest.kind === "image" && rest.image && !this.link.holdsImage(rest.image) ? { ...rest, expired: true } : rest),
      phase: view?.phase ?? "unknown", turns: spokenTurns(view?.turns ?? []), activity: presentActivity(view?.activity ?? [], titles, view ? isTerminalAgentPhase(view.phase) : false), awaiting_input: view?.awaiting_input ?? [],
      ...(view?.usage ? { usage: view.usage } : {}), ...roundModel(view), ...(view?.stop_reason ? { stop_reason: stopInWords(view.stop_reason, round.work_budget) } : {}),
      ...(view?.todo?.length ? { steps: view.todo.map(({ id, text, state }) => ({ id, text, state })) } : {}), ...(view?.retry_wait ? { retry_wait: { ...view.retry_wait } } : {}), ended_at: view?.ended_at ?? null };
  }

  publicWork(work: StoredWork, state: AssistantWorkState): AssistantWork {
    return workView(work, state, this.link.delegations.shown(work));
  }
}
