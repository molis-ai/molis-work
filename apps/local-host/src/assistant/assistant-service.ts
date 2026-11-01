import type { MethodHandoff } from "./assistant-work-reads.js";
import { sentOriginal } from "./assistant-round-start.js";
import { memoryInputSource } from "../memory/memory-source-identity.js";
import { assistantFailure } from "./assistant-error.js";
import { AssistantContinuations } from "./assistant-continuations.js";
import { controlAssistantWork } from "./assistant-work-control.js";
import { AssistantFollowUps } from "./assistant-followups.js";
import type { AgentDelegation } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { waitForAssistantWork } from "./assistant-wait.js";
import { AssistantDelegations } from "./assistant-delegation.js";
import { cardView } from "./assistant-card-view.js";
import { AssistantOffers } from "./assistant-offers.js";
import type { AssistantCharacterChoice, AssistantCharacterRef, AssistantContextSnapshot, AssistantControl, AssistantRecovery, AssistantScope, AssistantSendInput, AssistantSendResult, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { withinTime } from "./assistant-material-scan.js";
import { adoptSession } from "./assistant-executor-session.js";
import { linkSent } from "./assistant-relations.js";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { AssistantJobs } from "./assistant-jobs.js";
import { assistantErrors } from "./assistant-errors.js";
import type { MemoryChange } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryService } from "@molis-ai/molis-work-service-memory";
import { inputsOf, withdrawInput } from "./assistant-inputs.js";
import { checkLanding } from "./assistant-landing.js";
import { reaskMaterial, reaskTask } from "./assistant-reask.js";
import { checkHeldImages, checkMaterials } from "./assistant-send-materials.js";
import { RUNTIME, MAX_TEXT, sessionRef, checkText, assertSendCurrent, type AssistantServicePorts, type AssistantCaller } from "./assistant-service-shared.js";
import { stateOf, titleFrom, recoveryView, type CapabilityTitles } from "./assistant-present.js";
import { AssistantWorkReads } from "./assistant-work-reads.js";
import { AssistantDispatch } from "./assistant-dispatch.js";
import { AssistantOutcomes } from "./assistant-outcomes.js";
import { AssistantRoundMaterials } from "./assistant-round-materials.js";
import { AssistantMemoryBridge } from "./assistant-memory-bridge.js";
import { AssistantBudget } from "./assistant-budget.js";
import { AssistantNotices } from "./assistant-notices.js";

export type { AssistantServicePorts, AssistantCaller } from "./assistant-service-shared.js";
export { holdingRule } from "./assistant-notices.js";
export { spokenTurns, stopInWords, presentActivity } from "./assistant-present.js";
/** Recall words: the platform memory's own (Chinese two-character pieces and Latin words). */
export { recallKeywords } from "@molis-ai/molis-work-service-memory";
export { sameLocalTimeLater } from "./assistant-followups.js";

function checkContext(value: unknown): AssistantContextSnapshot | null {
  if (value === undefined || value === null) return null;
  const context = value as AssistantContextSnapshot;
  if (!context || typeof context !== "object" || !context.source || typeof context.source.surface !== "string") throw assistantErrors.invalid("当前页面信息格式无效");
  const selection = context.selection && typeof context.selection.text === "string" ? { text: context.selection.text.slice(0, 8000), ...(context.selection.truncated || context.selection.text.length > 8000 ? { truncated: true } : {}) } : undefined;
  return { source: { surface: context.source.surface.slice(0, 80), ...(context.source.plugin_id ? { plugin_id: String(context.source.plugin_id).slice(0, 120) } : {}), ...(context.source.title ? { title: String(context.source.title).slice(0, 200) } : {}) },
    ...(context.object ? { object: { kind: String(context.object.kind).slice(0, 80), id: String(context.object.id).slice(0, 200), ...(context.object.version !== undefined ? { version: context.object.version } : {}), ...(context.object.title ? { title: String(context.object.title).slice(0, 200) } : {}) } } : {}),
    ...(selection ? { selection } : {}), ...(context.unsaved ? { unsaved: true } : {}), ...checkLanding(context), captured_at: typeof context.captured_at === "string" ? context.captured_at : new Date().toISOString() };
}

export class AssistantService {
  /** The maps a round being started keeps until it is recorded, shared by the collaborators that prepare it. */
  private readonly starting = new Map<string, string>();
  private readonly titles = new Map<string, CapabilityTitles>();
  private readonly recalled = new Map<string, string>();
  private readonly chosenMemory = new Map<string, Awaited<ReturnType<MemoryService["forRun"]>>>();
  private readonly memorySourceWithdrawals = new Set<(eventId: string) => void>();
  /** Sub-tasks this person's works hand out, and what they hand back. */
  private readonly delegations: AssistantDelegations;
  readonly offers: AssistantOffers;
  readonly continuations: AssistantContinuations;
  /** Background work this person's works started, followed on their graphs. */
  readonly jobs: AssistantJobs;
  /** The reminders, timed rounds and attention rules of this person. */
  readonly followUps: AssistantFollowUps<StoredWork>;
  /** Reading a work, running its rounds, what the person decides, what a round is given, memory, usage and notices (each its own collaborator). */
  readonly reads: AssistantWorkReads;
  readonly dispatcher: AssistantDispatch;
  readonly outcomes: AssistantOutcomes;
  readonly materials: AssistantRoundMaterials;
  readonly memory: AssistantMemoryBridge;
  readonly budget: AssistantBudget;
  readonly notices: AssistantNotices;
  constructor(private readonly store: AssistantStore, private readonly ports: AssistantServicePorts, private readonly actorId: string,
    private readonly now = () => new Date()) {
    this.continuations = new AssistantContinuations({ store, actorId, host: () => ports.host(), holdSetups: ports.holdSetups,
      start: (work, text, current, continued_from) => this.dispatcher.dispatch(work, text, [], null, undefined, "host", current, undefined, undefined, { byHost: true, continued_from }),
      changed: async (work, alive) => { const current = store.get(actorId, work.work_id), state = await this.reads.stateSafely(current); if (alive() && store.get(actorId, work.work_id).revision === current.revision) this.notices.notice(current, state); } });
    this.jobs = new AssistantJobs({ store, actorId, host: () => ports.host(), actions: async work => (await ports.authority(work)).actions?.(RUNTIME) });
    this.offers = new AssistantOffers({ store, actorId, now: () => this.now(), ...(ports.timeZone ? { timeZone: ports.timeZone } : {}),
      readSubject: (work, subject) => this.materials.readSubject(work, subject), authority: work => ports.authority(work, { source: "card" }), jobs: this.jobs,
      createWork: (title, scope, context, caller) => this.createWork(title, scope, context, caller, undefined), fail: (code, message) => assistantErrors[code.slice("assistant.".length) as keyof typeof assistantErrors](message) });
    this.followUps = new AssistantFollowUps<StoredWork>({ actorId, records: store.followUps, now: () => this.now(), ...(ports.timeZone ? { timeZone: ports.timeZone } : {}),
      work: workId => store.get(actorId, workId), notify: (notice, dedupe) => store.raiseNotice(actorId, notice, dedupe) !== null,
      setting: key => store.setting(actorId, key), setSetting: (key, value) => store.setSetting(actorId, key, value),
      rules: () => store.rules(actorId), setRules: rules => store.setRules(actorId, rules), pages: () => ports.pages(),
      // Each look at the Plugins is bounded in time, so one that does not answer cannot hold the sweep.
      ...(ports.homeActions ? { homeActions: async () => { const actions = await withinTime(ports.homeActions!());
        return { discover: () => withinTime(actions.discover()), invoke: (reference, input) => withinTime(actions.invoke(reference, input)) }; } } : {}),
      host: () => ports.host(), state: (host, work) => this.reads.stateFor(host, work), schedule: () => this.notices.schedule(),
      send: (work, text, request_id, stillCurrent) => this.send({ work_id: work.work_id, text, request_id }, {}, "host", stillCurrent) });
    this.delegations = new AssistantDelegations({ store, actorId, host: () => ports.host(), ...(ports.characters ? { characters: project => ports.characters!(project) } : {}),
      stateOf: (host, work) => this.reads.stateFor(host, work), latestRun: (host, work) => this.reads.latestRun(host, work), chooseCharacter: (work, choice) => this.chooseCharacter(work, choice),
      lastReply: async work => [...((await this.reads.assistantPart(work)).rounds.at(-1)?.turns ?? [])].reverse().find(turn => turn.kind === "assistant" && turn.text?.trim())?.text?.trim(),
      read: workId => this.read(workId),
      notify: (work, text, key) => void this.store.raiseNotice(actorId, { kind: "needs-decision", work_id: work.work_id, work_title: work.title, text }, key),
      // A start the Host writes happens once per key: a repeated settle finds it claimed.
      dispatch: async (work, text, materials, writtenBy, request, stillCurrent) => {
        assertSendCurrent(stillCurrent);
        if (request && !store.claimRequest(actorId, request).claimed) return;
        try { const result = await this.dispatcher.dispatch(work, text, materials, null, undefined, writtenBy, stillCurrent, undefined, undefined, { byHost: Boolean(writtenBy) }); if (request) store.finishRequest(actorId, request, result); return result; }
        catch (error) { if (request) store.releaseRequest(actorId, request); throw error; }
      } });
    this.reads = new AssistantWorkReads(store, ports, actorId, now, { capabilityTitles: (...a) => this.outcomes.capabilityTitles(...a), rememberTitle: (...a) => this.outcomes.rememberTitle(...a), rememberedTitle: (...a) => this.outcomes.rememberedTitle(...a), executorOf: (...a) => this.dispatcher.executorOf(...a), holdsImage: (...a) => this.materials.holdsImage(...a), continuations: this.continuations, delegations: this.delegations });
    this.dispatcher = new AssistantDispatch(store, ports, actorId, now, this.starting, this.titles, this.recalled, this.chosenMemory, { assistantPart: (...a) => this.reads.assistantPart(...a), workObjects: (...a) => this.reads.workObjects(...a), stateSafely: (...a) => this.reads.stateSafely(...a), publicWork: (...a) => this.reads.publicWork(...a), readSubject: (...a) => this.materials.readSubject(...a), roundMaterials: (...a) => this.materials.roundMaterials(...a), assertBudget: (...a) => this.budget.assertBudget(...a), workUsage: (...a) => this.budget.workUsage(...a), memoryForRound: (...a) => this.memory.memoryForRound(...a), notice: (...a) => this.notices.notice(...a), read: (...a) => this.read(...a), continuations: this.continuations, delegations: this.delegations });
    this.outcomes = new AssistantOutcomes(store, ports, actorId, now, this.titles, { executorOf: (...a) => this.dispatcher.executorOf(...a), dispatch: (...a) => this.dispatcher.dispatch(...a), latestRun: (...a) => this.reads.latestRun(...a), read: (...a) => this.read(...a), jobs: this.jobs });
    this.materials = new AssistantRoundMaterials(store, ports, actorId, now, this.starting, this.chosenMemory, { workObjects: (...a) => this.reads.workObjects(...a), related: (...a) => this.reads.related(...a), methods: (...a) => this.reads.methods(...a), readMethod: (...a) => this.reads.readMethod(...a), memoryTools: (...a) => this.memory.memoryTools(...a), jobs: this.jobs, delegations: this.delegations });
    this.memory = new AssistantMemoryBridge(store, ports, actorId, this.recalled, this.chosenMemory, this.memorySourceWithdrawals, { assistantPart: (...a) => this.reads.assistantPart(...a), continuations: this.continuations });
    this.budget = new AssistantBudget(store, ports, actorId, now, { read: (...a) => this.read(...a), delegations: this.delegations });
    this.notices = new AssistantNotices(store, ports, actorId, now, { assistantPart: (...a) => this.reads.assistantPart(...a), workObjects: (...a) => this.reads.workObjects(...a), continuations: this.continuations, followUps: this.followUps, jobs: this.jobs, delegations: this.delegations });
  }

  async list(): Promise<AssistantWork[]> {
    const works = this.store.list(this.actorId);
    if (!works.length) return [];
    const host = await this.ports.host();
    return Promise.all(works.map(async work => {
      const state = await this.reads.stateFor(host, work);
      this.notices.notice(work, state);
      return this.reads.publicWork(await this.reads.named(work), state);
    }));
  }

  async read(workId: string): Promise<AssistantWorkView> {
    const work = await this.reads.named(this.store.get(this.actorId, workId));
    // One work, whoever ran each round: the Assistant's own session, and the executor's session it carries or handed to.
    const assistant = work.session_id ? await this.reads.assistantPart(work) : null;
    const carried = await this.dispatcher.carried(work).catch(() => null);
    const plugin = carried ? await this.reads.executorPart(work, carried) : null;
    const rounds = this.dispatcher.settleUnsent(work, [...(assistant?.rounds ?? []), ...(plugin?.rounds ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at)));
    const latest = rounds.at(-1);
    const problem = assistant?.problem ?? plugin?.problem;
    const state = plugin?.unreadable && work.executor.kind === "plugin" ? "needs-check"
      : await this.continuations.state(work, stateOf(latest && latest.phase !== "unknown" ? latest.phase : latest ? null : undefined, Boolean(assistant?.recovery || plugin?.recovery)));
    const shown: StoredWork = work.executor.kind === "plugin" && plugin?.mode ? { ...work, executor: { ...work.executor, mode: plugin.mode } } : work;
    // Its task board: the sub-tasks it handed out, each as its own work.
    const delegated = await this.delegations.parts(work);
    const scheduled = this.followUps.list(work.work_id);
    const claim = scheduled.length ? await this.followUps.claim() : null;
    const unsettled = this.store.unsettled(this.actorId, work.work_id, true);
    const jobs = await this.jobs.views(work);
    const undoable = this.store.undos(this.actorId, work.work_id).slice(-10).map(({ work_id: _work, reference, input: _input, told: _told, ...view }) => ({ ...view, capability_id: reference.capability_id }));
    const memory_candidates = await this.memory.memoryCandidates(work.work_id);
    const { changes: memory_changes } = await this.memory.memoryTrail(work, rounds, this.store.rounds(work.work_id), assistant?.memory ?? new Map()).catch(() => ({ changes: [] as MemoryChange[] }));
    const usage = work.executor.kind === "plugin" ? null : await this.budget.workUsage(work).catch(() => null);
    await this.offers.sweep(work);
    return { work: this.reads.publicWork(shown, state), rounds, reviews: [...(assistant?.reviews ?? []), ...(plugin?.reviews ?? [])],
      cards: this.store.cards(work.work_id).map(card => cardView(card)), objects: await this.reads.workObjects(work), ...(delegated.length ? { delegated } : {}),
      ...(scheduled.length ? { scheduled } : {}), ...(claim ? { schedule_survives_close: claim.survives_window_close } : {}), ...(unsettled.length ? { unsettled } : {}), ...(jobs.length ? { jobs } : {}), ...(undoable.length ? { undoable } : {}), ...(memory_candidates.length ? { memory_candidates } : {}), ...(memory_changes.length ? { memory_changes } : {}),
      ...(usage && (usage.rounds || usage.budget_tokens !== null) ? { usage } : {}), ...(problem ? { problem } : {}),
      ...assistant?.queued };
  }

  /** A work's view when it differs from `since`, or as it is once the wait runs out: the page follows a live work this way. */
  waitForChange(workId: string, since: string | null, timeoutMs: number, signal?: AbortSignal) {
    return waitForAssistantWork({ store: this.store, actorId: this.actorId, host: () => this.ports.host(), read: () => this.read(workId),
      executorRun: async work => { const carried = await this.dispatcher.carried(work).catch(() => null);
        return carried ? (await (await this.dispatcher.executorOf(work, carried.plugin_id)).read(carried.session_id, 1).catch(() => null))?.runs.at(-1)?.ref : undefined; } }, workId, since, timeoutMs, signal);
  }

  /**
   * One press of Send. It starts a round when the work is idle, reaches the running round when one is under way, and
   * answers the round's open question when that is what the round is waiting for. A repeated press returns the first
   * outcome and does nothing more. A round whose words the person did not write is marked (`writtenBy` for Host code, `input.written_by` from a page).
   */
  async send(input: AssistantSendInput, caller: AssistantCaller, writtenBy?: StoredRound["written_by"], stillCurrent?: () => boolean): Promise<AssistantSendResult> {
    const text = input?.reask !== undefined ? reaskTask() : checkText(input?.text, "要发送的内容", MAX_TEXT);
    const original_input = sentOriginal(input, caller.original_input, writtenBy);
    let materials = checkMaterials(input.materials);
    checkHeldImages(materials, this.materials.images);
    const context = checkContext(input.context);
    const choice = input.executor;
    if (choice !== undefined && choice.kind !== "assistant" && !(choice.kind === "plugin" && typeof choice.plugin_id === "string" && choice.plugin_id)) throw assistantErrors.invalid("不认识的执行者");
    if (input.mode !== undefined && (input.work_id || choice?.kind !== "plugin" || typeof input.mode !== "string" || !input.mode)) throw assistantErrors.invalid("只有交给执行方插件的新工作可以在这里选择第一轮的方式");
    if (input.executor_session_id !== undefined && (input.work_id || choice?.kind !== "plugin" || typeof input.executor_session_id !== "string" || !input.executor_session_id)) {
      throw assistantErrors.invalid("只有交给执行方插件的新工作可以接着一个已有的会话");
    }
    const claim = this.store.claimRequest(this.actorId, String(input.request_id ?? ""));
    if (!claim.claimed) return claim.result;
    let work: StoredWork | undefined, inputHold: ReturnType<AssistantContinuations["begin"]> | undefined;
    try {
      const created = !input.work_id;
      work = input.work_id ? this.store.get(this.actorId, input.work_id) : await this.createWork(text, input.scope, context, caller, choice);
      if (work.reply_target && caller.thread_request !== work.thread_round?.attempt_id) throw assistantErrors.scope("请在原评论内继续这项讨论");
      if (created && input.executor_session_id) work = await adoptSession(this.store, this.actorId, work, await this.dispatcher.executorOf(work), input.executor_session_id);
      if (!writtenBy && !input.written_by && work.executor.kind === "assistant") {
        inputHold = this.continuations.begin(work, text); work = inputHold.work;
        const previous = stillCurrent; stillCurrent = () => inputHold!.current() && (!previous || previous());
      }
      work = await this.chooseCharacter(work, input.character);
      if (materials.some(item => item.reference)) materials = await this.materials.readReferences(work, materials);
      const handoffs: MethodHandoff[] = [];
      if (materials.some(item => item.kind === "method")) materials = await this.materials.chosenMethods(work, materials, handoffs);
      if (input.reask !== undefined) materials = [...materials, await reaskMaterial(work, input.reask, this.store.rounds(work.work_id), (await this.ports.host()).adapter(RUNTIME))];
      assertSendCurrent(stillCurrent);
      linkSent(this.store.relations, work, materials, created ? context : null);
      const result = await this.dispatcher.dispatch(work, text, materials, context, input.work_id ? undefined : input.mode, writtenBy ?? input.written_by, stillCurrent, caller.beforeStart, caller.assertBeforeStart, { id: input.request_id, target: input.target, byHost: Boolean(writtenBy ?? input.written_by) || input.reask !== undefined || !original_input, about: input.about, original_input }, { assertCurrent: () => { for (const item of handoffs) item.assertCurrent(); }, accepted: () => { for (const item of handoffs) item.accepted(); } });
      if (inputHold) { inputHold.accept(); const current = this.store.get(this.actorId, work.work_id); result.work = this.reads.publicWork(current, await this.reads.stateSafely(current)); }
      this.store.finishRequest(this.actorId, input.request_id, result);
      return result;
    } catch (error) {
      this.store.releaseRequest(this.actorId, input.request_id);
      if (stillCurrent && !stillCurrent()) throw error;
      // Nothing the person typed is lost: an unsent message stays as the work's draft (a re-ask's words are the Host's: the draft stays).
      if (work && !work.reply_target) {
        const kept = input.reask === undefined ? this.store.update(this.actorId, work.work_id, null, { draft: text }, false) : work;
        const failure = assistantFailure(error);
        throw new ActionError(failure.code, failure.message, { kind: failure.kind, cause: failure,
          details: { ...failure.details, work: this.reads.publicWork(kept, await this.reads.stateSafely(kept)) } });
      }
      throw assistantFailure(error);
    } finally { inputHold?.end(); }
  }

  async control(workId: string, control: AssistantControl): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (control?.kind === "withdraw") {
      await withdrawInput(work, this.store.rounds(work.work_id), control, { executor: () => this.dispatcher.executorOf(work), runtime: async () => inputsOf((await this.ports.host()).adapter(RUNTIME)),
        beforeWithdraw: (session_id, input_id) => { const source = memoryInputSource({ actor_id: this.actorId, session_id, input_id, kind: "supplement" }); for (const cancel of this.memorySourceWithdrawals) cancel(source.event_id); } });
    } else await controlAssistantWork(work, control, { store: this.store, actorId: this.actorId, continuations: this.continuations, delegations: this.delegations,
      host: () => this.ports.host(), executor: work => this.dispatcher.executorOf(work), latest: (host, work) => this.reads.latestRun(host, work), cancelSetups: this.ports.cancelSetups, retainSetups: this.ports.retainSetups });
    return this.read(workId);
  }

  saveDraft(workId: string, draft: string): AssistantWork {
    if (typeof draft !== "string" || draft.length > MAX_TEXT) throw assistantErrors.invalid("草稿过长");
    const work = this.store.update(this.actorId, workId, null, { draft }, false);
    return this.reads.publicWork(work, "idle");
  }

  async rename(workId: string, revision: number, title: string): Promise<AssistantWork> {
    const work = this.store.update(this.actorId, workId, revision, { title: checkText(title, "标题", 120).trim() });
    return this.reads.publicWork(work, await this.reads.stateSafely(work));
  }

  /** Put away (or back). Putting away is quiet: it waits for no round in progress here or in what it handed out, and takes its timed rounds with it. */
  async archive(workId: string, archived: boolean): Promise<AssistantWork> {
    if (archived) {
      const host = await this.ports.host(), own = this.store.get(this.actorId, workId), group = [own, ...this.store.delegatedBy(this.actorId, own, "any")];
      if ((await Promise.all(group.map(item => this.reads.stateFor(host, item)))).some(state => ["running", "paused", "waiting-input", "waiting-review"].includes(state))) {
        throw assistantErrors.state("这项工作还有一轮在进行，先停止它再归档");
      }
      await this.followUps.stopForArchive(workId);
    }
    const work = this.store.update(this.actorId, workId, null, { archived });
    return this.reads.publicWork(work, await this.reads.stateSafely(work));
  }

  private async createWork(text: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot | null, caller: AssistantCaller,
    choice: AssistantSendInput["executor"]): Promise<StoredWork> {
    const wanted: AssistantScope = scope ?? (caller.project_ref ? { kind: "project", project_id: caller.project_ref.project_id } : { kind: "personal" });
    if (choice?.kind === "plugin" && wanted.kind !== "project") throw assistantErrors.scope("执行方插件在项目里工作；个人工作请交给助理");
    if (wanted.kind === "project" && wanted.project_id !== caller.project_ref?.project_id) {
      throw assistantErrors.scope("只能在当前打开的项目里为它新建工作；个人工作不需要项目");
    }
    // Chosen only among the executors this project offers now, and kept by the plugin's id.
    const executor = choice?.kind === "plugin" ? await this.dispatcher.executorOf({ project_ref: caller.project_ref }, choice.plugin_id) : null;
    const scopeTitle = wanted.kind === "project" ? await this.ports.projectTitle?.(wanted.project_id).catch(() => null) : null;
    return this.store.create({ actor_id: this.actorId, title: titleFrom(text), scope: wanted, origin: context?.source ?? null, ...(scopeTitle ? { scope_title: scopeTitle } : {}),
      ...(executor ? { executor: { kind: "plugin" as const, plugin_id: executor.provider.plugin_id, title: executor.provider.title, session_id: null } } : {}),
      ...(wanted.kind === "project" ? { project_ref: caller.project_ref! } : {}) });
  }

  /** What an interrupted round really did, from the runtime's receipts. Nothing is replayed. */
  async recovery(workId: string): Promise<AssistantRecovery> {
    const work = this.store.get(this.actorId, workId);
    if (!work.session_id) return { blockers: [], rounds: [] };
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    if (!adapter.recovery) throw assistantErrors.unsupported("当前运行时不能核对中断的执行");
    return recoveryView(await adapter.recovery.inspect(sessionRef(work)));
  }

  /** The person has checked the outcome: close the interrupted round so the work can go on. Never re-runs it. */
  async closeInterrupted(workId: string, input: { run_id: string; version: number }): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (!work.session_id || !this.store.rounds(work.work_id).some(round => round.run_id === input.run_id)) throw assistantErrors.scope("这一轮不属于这项工作");
    const adapter = (await this.ports.host()).adapter(RUNTIME);
    if (!adapter.recovery) throw assistantErrors.unsupported("当前运行时不能核对中断的执行");
    await adapter.recovery.close(sessionRef(work), String(input.run_id), Number(input.version));
    if (work.delegated_by) await this.delegations.closed(work);
    return this.read(workId);
  }

  /** The delegation tools of a round of `parent` (assistant-delegation.ts). */
  delegation(parent: StoredWork): AgentDelegation | undefined { return this.delegations.of(parent); }

  takeBack(childId: string): Promise<AssistantWorkView> { return this.delegations.takeBack(childId); }

  /** The Characters the person may choose for a work: only project work has them, and only the Assistant's own rounds use them. */
  async characters(workId: string | undefined, caller: AssistantCaller): Promise<AssistantCharacterChoice[]> {
    const work = workId ? this.store.get(this.actorId, workId) : undefined;
    const project = work ? work.project_ref : caller.project_ref;
    if (!project || !this.ports.characters || work?.executor.kind === "plugin") return [];
    return this.ports.characters(project);
  }

  /** The person's choice of Character for this work from its next round on: checked now, never swapped for another. */
  private async chooseCharacter(work: StoredWork, choice: AssistantCharacterRef | null | undefined): Promise<StoredWork> {
    if (choice === undefined) return work;
    if (choice === null) return work.character ? this.store.update(this.actorId, work.work_id, null, { character: undefined }, false) : work;
    if (typeof choice !== "object" || typeof choice.artifact_id !== "string" || !Number.isSafeInteger(choice.version)) throw assistantErrors.invalid("Character 版本引用无效");
    if (work.executor.kind === "plugin") throw assistantErrors.invalid("这项工作由执行方插件负责，它的角色在插件自己的会话里选择");
    if (!work.project_ref || !this.ports.characters) throw assistantErrors.invalid("Character 发布在项目里，个人工作暂时不能指定角色；在项目里发起这项工作就可以选择");
    const found = (await this.ports.characters(work.project_ref)).find(item => item.reference.artifact_id === choice.artifact_id && item.reference.version === choice.version);
    if (!found) throw assistantErrors.invalid("这个项目里没有这个 Character 版本");
    if (!found.available) throw assistantErrors.character_unavailable(found.reason ?? "所选 Character 版本不可用，请明确选择其他版本，或不指定角色", { action: "重新选择角色" });
    if (work.character?.artifact_id === choice.artifact_id && work.character.version === choice.version) return work;
    return this.store.update(this.actorId, work.work_id, null, { character: { artifact_id: choice.artifact_id, version: choice.version, title: found.title } }, false);
  }
}
