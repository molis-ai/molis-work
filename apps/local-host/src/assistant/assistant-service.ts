import { readWorkView, listWorkViews } from "./assistant-work-view.js";
import { AssistantSdkSubtasks } from "./assistant-sdk-subtasks.js";
import { AssistantWorkSubtasks } from "./assistant-work-subtasks.js";
import { AssistantSubtaskReports } from "./assistant-subtask-reports.js";
import { assertSubtaskWork } from "./assistant-subtask-binding.js";
import { subtaskInputSessions } from "./assistant-subtask-inputs.js";
import { changeAssistantSessionLifecycle } from "./assistant-session-lifecycle.js";
import type { CharacterRoleCatalog } from "@molis-ai/molis-work-contracts/modules/characters";
import { assertStoredCharacter, catalogChoice, parseRoleRef, roleKey, storedCharacter } from "./assistant-characters.js";
import type { MethodHandoff } from "./assistant-signed-materials.js";
import { sentOriginal } from "./assistant-round-start.js";
import { memoryInputSource } from "../memory/memory-source-identity.js";
import { assistantFailure } from "./assistant-error.js";
import { AssistantContinuations } from "./assistant-continuations.js";
import { controlAssistantWork } from "./assistant-work-control.js";
import { AssistantFollowUps } from "./assistant-followups.js";
import type { AgentDelegation, AgentDelivery } from "@molis-ai/molis-work-contracts/services/agent-host";
import { ACCEPTANCE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { runBackgroundWork } from "../web-locale.js";
import { say } from "@molis-ai/molis-work-plugin-sdk/ui";
import { waitForAssistantWork } from "./assistant-wait.js";
import { AssistantDelegations } from "./assistant-delegation.js";
import { AssistantOffers } from "./assistant-offers.js";
import type { AssistantCharacterRef, AssistantContextSnapshot, AssistantControl, AssistantRecovery, AssistantScope, AssistantSendInput, AssistantSendResult, AssistantWork, AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import { withinTime } from "./assistant-material-scan.js";
import { adoptSession } from "./assistant-executor-session.js";
import { linkSent } from "./assistant-relations.js";
import type { AssistantStore, StoredRound, StoredWork } from "./assistant-store.js";
import { AssistantJobs } from "./assistant-jobs.js";
import { AGENT_STEER_MODES } from "@molis-ai/molis-work-contracts/services/agent-inputs";
import { assistantErrors } from "./assistant-errors.js";
import { renameWork } from "./assistant-work-title.js";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import type { MemoryService } from "@molis-ai/molis-work-service-memory";
import { assertRoundToAddress, inputsOf, withdrawInput } from "./assistant-inputs.js";
import { hasExternalSessionContext } from "./assistant-external-sessions.js";
import { checkLanding } from "./assistant-landing.js";
import { reaskMaterial, reaskTask } from "./assistant-reask.js";
import { readComposerMaterials, sendScope } from "./assistant-composer-materials.js";
import { eventServes, lineEventsFor, mainSendInput } from "./assistant-line-actions.js";
import { AssistantReportRounds } from "./assistant-task-reports.js";
import { checkHeldImages, checkMaterials } from "./assistant-send-materials.js";
import { RUNTIME, MAX_TEXT, sessionRef, checkText, assertSendCurrent, type AssistantServicePorts, type AssistantCaller } from "./assistant-service-shared.js";
import { titleFrom, recoveryView, type CapabilityTitles } from "./assistant-present.js";
import { AssistantWorkReads } from "./assistant-work-reads.js";
import { AssistantDispatch } from "./assistant-dispatch.js";
import { AssistantOutcomes } from "./assistant-outcomes.js";
import { AssistantRoundMaterials } from "./assistant-round-materials.js";
import { AssistantMemoryBridge } from "./assistant-memory-bridge.js";
import { AssistantBudget } from "./assistant-budget.js";
import { AssistantNotices } from "./assistant-notices.js";
import type { AgentActionReviewControl } from "@molis-ai/molis-work-contracts/services/agent-host";
import { holdAssistantWorkLifetime } from "./assistant-work-permissions.js";

export type { AssistantServicePorts, AssistantCaller } from "./assistant-service-shared.js";
export { holdingRule } from "./assistant-notices.js";
export { spokenTurns, stopInWords, presentActivity, TOOL_ACTIVITY_VERBS } from "./assistant-present.js";
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

async function holdExistingWorkLifetime(ports: Pick<AssistantServicePorts, "host">, existing: StoredWork) {
  const host = await ports.host().catch(() => null);
  return host ? holdAssistantWorkLifetime(host, existing) : undefined;
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
  readonly workSubtasks: AssistantWorkSubtasks;
  readonly materials: AssistantRoundMaterials;
  readonly memory: AssistantMemoryBridge;
  readonly budget: AssistantBudget;
  readonly notices: AssistantNotices;
  /** Tasks no conversation started, reported in the project's main conversation once they end (`reports_to: "assistant"`). */
  readonly reports: AssistantReportRounds;
  readonly sdkSubtasks: AssistantSdkSubtasks;
  readonly subtaskReports: AssistantSubtaskReports;
  constructor(private readonly store: AssistantStore, private readonly ports: AssistantServicePorts, private readonly actorId: string,
    private readonly now = () => new Date()) {
    this.continuations = new AssistantContinuations({ store, actorId, host: () => ports.host(), holdSetups: ports.holdSetups,
      notify: (work, text, key) => void this.store.raiseNotice(actorId, { kind: "needs-decision", work_id: work.work_id, work_title: work.title, text }, key),
      start: (work, text, current, continued_from) => this.hostStarted(() => this.dispatcher.dispatch(work, text, [], null, undefined, "host", current, undefined, undefined, { byHost: true, continued_from })),
      changed: async (work, alive) => { const current = store.get(actorId, work.work_id), state = await this.reads.stateSafely(current); if (alive() && store.get(actorId, work.work_id).revision === current.revision) this.notices.notice(current, state); void this.delegations.roundEnded(current).catch(() => undefined); } });
    this.jobs = new AssistantJobs({ store, actorId, host: () => ports.host(), actions: async work => (await ports.authority(work)).actions?.(RUNTIME) });
    this.offers = new AssistantOffers({ store, actorId, now: () => this.now(), ...(ports.timeZone ? { timeZone: ports.timeZone } : {}), ...(ports.scopeActions ? { personActions: ports.scopeActions } : {}),
      readSubject: (work, subject) => this.materials.readSubject(work, subject), authority: work => ports.authority(work, { source: "card" }), jobs: this.jobs, personRan: (work, view, input, output) => this.outcomes.recordResult(work, view, input, output, false),
      createWork: (title, scope, context, caller) => this.createWork(title, scope, context, caller, undefined), fail: (code, message) => assistantErrors[code.slice("assistant.".length) as keyof typeof assistantErrors](message) });
    this.followUps = new AssistantFollowUps<StoredWork>({ actorId, records: store.followUps, now: () => this.now(), ...(ports.timeZone ? { timeZone: ports.timeZone } : {}),
      work: workId => store.get(actorId, workId), notify: (notice, dedupe) => store.raiseNotice(actorId, notice, dedupe) !== null,
      holdWork: async work => {
        const local = store.permissionTransitions.holdWorkInput(work.work_id);
        try {
          const host = await ports.host(), lifetime = await holdAssistantWorkLifetime(host, work);
          return { release: local.release, assertCurrent: () => { local.assertCurrent(); lifetime?.(); } };
        } catch (error) { local.release(); throw error; }
      },
      setting: key => store.setting(actorId, key), setSetting: (key, value) => store.setSetting(actorId, key, value),
      rules: () => store.rules(actorId), setRules: rules => store.setRules(actorId, rules), pages: () => ports.pages(),
      // Each look at the Plugins is bounded in time, so one that does not answer cannot hold the sweep.
      ...(ports.homeActions ? { homeActions: async () => { const actions = await withinTime(ports.homeActions!());
        return { discover: () => withinTime(actions.discover()), invoke: (reference, input) => withinTime(actions.invoke(reference, input)) }; } } : {}),
      host: () => ports.host(), state: (host, work) => this.reads.stateFor(host, work), schedule: () => this.notices.schedule(),
      send: (work, words, request_id, stillCurrent) => this.hostStarted(() => this.send({ work_id: work.work_id, text: say.text(words), request_id }, {}, "host", stillCurrent)) });
    this.delegations = new AssistantDelegations({ store, actorId, subtaskReports: { kick: id => this.subtaskReports.kick(id), attach: () => this.subtaskReports.attach() }, stepGate: this.continuations.stepGate, host: () => ports.host(), ...(ports.characters ? { characters: project => ports.characters!(project) } : {}),
      stateOf: (host, work) => this.reads.stateFor(host, work), latestRun: (host, work) => this.reads.latestRun(host, work), chooseCharacter: (work, choice) => this.chooseCharacter(work, choice),
      lastReply: async work => [...((await this.reads.assistantPart(work)).rounds.at(-1)?.turns ?? [])].reverse().find(turn => turn.kind === "assistant" && turn.text?.trim())?.text?.trim(),
      read: workId => this.read(workId),
      lineEvents: async work => lineEventsFor(await (await ports.authority(work)).actions?.(RUNTIME)),
      // As the work itself: its own authority (an action the person switched off for the Assistant is refused here too) and its session.
      acceptance: async (work, signal) => {
        const actions = await (await ports.authority(work)).actions?.(RUNTIME);
        return actions ? { invoke: async (action, input) => await actions.invoke({ capability_id: action.capability_id, version: action.version, provider_id: ACCEPTANCE_PROVIDER_ID }, input, signal) as never } : undefined;
      },
      notify: (work, text, key) => void this.store.raiseNotice(actorId, { kind: "needs-decision", work_id: work.work_id, work_title: work.title, text }, key),
      // A start the Host writes happens once per key: a repeated settle finds it claimed.
      dispatch: async (work, text, materials, writtenBy, request, stillCurrent) => {
        assertSendCurrent(stillCurrent);
        if (request && !store.requests.claimRequest(actorId, request, work.work_id).claimed) return;
        let handed = false;
        try { const result = await this.hostStarted(() => this.dispatcher.dispatch(work, text, materials, null, undefined, writtenBy, stillCurrent, undefined, undefined, { byHost: Boolean(writtenBy), handed: () => { handed = true; } })); if (request) store.requests.finishRequest(actorId, request, result); return result; }
        catch (error) { if (request && !handed) store.requests.releaseRequest(actorId, request); throw error; }
      } });
    this.reads = new AssistantWorkReads(store, ports, actorId, now, { capabilityTitles: (...a) => this.outcomes.capabilityTitles(...a), rememberTitle: (...a) => this.outcomes.rememberTitle(...a), rememberedTitle: (...a) => this.outcomes.rememberedTitle(...a), executorOf: (...a) => this.dispatcher.executorOf(...a), holdsImage: (...a) => this.materials.holdsImage(...a), continuations: this.continuations, delegations: this.delegations });
    this.dispatcher = new AssistantDispatch(store, ports, actorId, now, this.starting, this.titles, this.recalled, this.chosenMemory, { assistantPart: (...a) => this.reads.assistantPart(...a), workObjects: (...a) => this.reads.workObjects(...a), stateSafely: (...a) => this.reads.stateSafely(...a), publicWork: (...a) => this.reads.publicWork(...a), readSubject: (...a) => this.materials.readSubject(...a), roundMaterials: (...a) => this.materials.roundMaterials(...a), assertBudget: (...a) => this.budget.assertBudget(...a), workUsage: (...a) => this.budget.workUsage(...a), memoryForRound: (...a) => this.memory.memoryForRound(...a), notice: (...a) => this.notices.notice(...a), read: (...a) => this.read(...a), continuations: this.continuations, delegations: this.delegations });
    this.outcomes = new AssistantOutcomes(store, ports, actorId, now, this.titles, { executorOf: (...a) => this.dispatcher.executorOf(...a), dispatch: (...a) => this.dispatcher.dispatch(...a), latestRun: (...a) => this.reads.latestRun(...a), read: (...a) => this.read(...a), jobs: this.jobs, stepGate: this.continuations.stepGate });
    this.workSubtasks = new AssistantWorkSubtasks(store, ports, actorId, { outcomes: this.outcomes, dispatch: (...args) => this.dispatcher.dispatch(...args), executorOf: (...args) => this.dispatcher.executorOf(...args), parentOf: work => this.delegations.parentOf(work), read: workId => this.read(workId),
      applyControl: (work, control, caller) => controlAssistantWork(work, control, { store, actorId, continuations: this.continuations, delegations: this.delegations,
        host: () => ports.host(), executor: (current, fence) => this.dispatcher.executorOf(current, undefined, fence ? { control: fence } : undefined), latest: (host, current) => this.reads.latestRun(host, current), cancelSetups: ports.cancelSetups, retainSetups: ports.retainSetups }, caller) });
    this.materials = new AssistantRoundMaterials(store, ports, actorId, now, this.starting, this.chosenMemory, { workObjects: (...a) => this.reads.workObjects(...a), related: (...a) => this.reads.related(...a), methods: (...a) => this.reads.methods(...a), readRole: (...a) => this.reads.readRole(...a), readSkills: (...a) => this.reads.readSkills(...a), memoryTools: (...a) => this.memory.memoryTools(...a), jobs: this.jobs, delegations: this.delegations });
    this.memory = new AssistantMemoryBridge(store, ports, actorId, this.recalled, this.chosenMemory, this.memorySourceWithdrawals, { assistantPart: (...a) => this.reads.assistantPart(...a), continuations: this.continuations });
    this.budget = new AssistantBudget(store, ports, actorId, now, { read: (...a) => this.read(...a), delegations: this.delegations });
    this.notices = new AssistantNotices(store, ports, actorId, now, { assistantPart: (...a) => this.reads.assistantPart(...a), workObjects: (...a) => this.reads.workObjects(...a), continuations: this.continuations, followUps: this.followUps, jobs: this.jobs, delegations: this.delegations });
    this.sdkSubtasks = new AssistantSdkSubtasks(store, actorId, ports, (...args) => this.notices.subtaskResult(...args));
    this.subtaskReports = new AssistantSubtaskReports({ store, actorId, signal: this.continuations.signal, host: () => ports.host(), authority: (...args) => ports.authority(...args),
      parent: work => this.delegations.parentOf(work), inputSessions: work => subtaskInputSessions(work, { store, actorId, adapter: ports.host().then(host => host.adapter(RUNTIME)), personActions: ports.personActions, executor: (current, pluginId) => this.dispatcher.executorOf(current, pluginId) }), watch: (work, run) => this.continuations.watch(work, run), result: (...args) => this.notices.subtaskResult(...args) });
    this.reports = new AssistantReportRounds({ store, actorId, session: async work => (await this.ports.host()).adapter(RUNTIME).readSession(sessionRef(work)),
      continuation: async work => (await this.continuations.view(work).catch(() => undefined))?.continuation?.state,
      start: (work, text) => this.hostStarted(() => this.dispatcher.dispatch(work, text, [], null, undefined, "host", undefined, undefined, undefined, { byHost: true, report_only: true })),
      follows: async (projectId, jobId) => {
        for (const work of store.list(actorId)) if (work.project_ref?.project_id === projectId && (await this.jobs.views(work).catch(() => [])).some(job => job.job_id === jobId)) return true;
        return false;
      } });
  }

  list(): Promise<AssistantWork[]> { return listWorkViews(this.store, this.ports, this.actorId, this.reads, this.notices); }

  /** The same business owner, without reading a Run, an executor or conversation contents. */
  memorySessionBinding(workId: string): { session_id: string | null; project_ref: LocalHostProjectReference | null; archived: boolean } {
    const work = this.store.get(this.actorId, workId);
    if (work.scope.kind === "project" && work.project_ref?.project_id !== work.scope.project_id
      || work.scope.kind === "personal" && work.project_ref) throw assistantErrors.conflict("原助理会话的项目归属不可确认");
    return { session_id: work.session_id, project_ref: work.project_ref ? { ...work.project_ref } : null, archived: work.archived };
  }

  read(workId: string): Promise<AssistantWorkView> {
    return readWorkView(workId, this.store, this.ports, this.actorId, { reads: this.reads, dispatcher: this.dispatcher, continuations: this.continuations,
      delegations: this.delegations, sdkSubtasks: this.sdkSubtasks, followUps: this.followUps, jobs: this.jobs, memory: this.memory, budget: this.budget, offers: this.offers });
  }

  /** A work's view when it differs from `since`, or as it is once the wait runs out: the page follows a live work this way. */
  waitForChange(workId: string, since: string | null, timeoutMs: number, signal?: AbortSignal) {
    return waitForAssistantWork({ store: this.store, actorId: this.actorId, host: () => this.ports.host(), read: () => this.read(workId),
      executorRun: async work => { const carried = await this.dispatcher.carried(work).catch(() => null);
        return carried ? (await (await this.dispatcher.executorOf(work, carried.plugin_id)).read(carried.session_id, 1).catch(() => null))?.runs.at(-1)?.ref : undefined; } }, workId, since, timeoutMs, signal);
  }

  /**
   * Work the Host starts by itself runs in a language scope of its own, the one last used as of now, so it does not keep the language of the
   * page whose request its async chain happened to begin in (FSS-69).
   */
  private hostStarted<T>(fn: () => T): T {
    const locale = this.ports.lastLocale?.();
    return locale ? runBackgroundWork(locale, fn) : fn();
  }

  /**
   * One press of Send. It starts a round when the work is idle, reaches the running round when one is under way, and
   * answers the round's open question when that is what the round is waiting for. A repeated press returns the first
   * outcome and does nothing more. A round whose words the person did not write is marked (`writtenBy` for Host code, `input.written_by` from a page).
   */
  async send(input: AssistantSendInput, caller: AssistantCaller, writtenBy?: StoredRound["written_by"], stillCurrent?: () => boolean): Promise<AssistantSendResult> {
    const text = input?.reask !== undefined ? reaskTask() : checkText(input?.text, "要发送的内容", MAX_TEXT);
    if (input) input = mainSendInput(this.store, this.actorId, input, to => sendScope(to.scope, caller, to.executor));
    const original_input = sentOriginal(input, caller.original_input, writtenBy);
    let materials = checkMaterials(input.materials);
    checkHeldImages(materials, image => this.materials.holdsImage(image));
    const context = checkContext(input.context);
    const choice = input.executor;
    if (choice !== undefined && choice.kind !== "assistant" && !(choice.kind === "plugin" && typeof choice.plugin_id === "string" && choice.plugin_id)) throw assistantErrors.invalid("不认识的执行者");
    if (input.mode !== undefined && (input.work_id || choice?.kind !== "plugin" || typeof input.mode !== "string" || !input.mode)) throw assistantErrors.invalid("只有交给执行方插件的新工作可以在这里选择第一轮的方式");
    if (input.executor_session_id !== undefined && (input.work_id || choice?.kind !== "plugin" || typeof input.executor_session_id !== "string" || !input.executor_session_id)) {
      throw assistantErrors.invalid("只有交给执行方插件的新工作可以接着一个已有的会话");
    }
    if (input.delivery !== undefined && !(AGENT_STEER_MODES as readonly unknown[]).includes(input.delivery)) throw assistantErrors.invalid("delivery 只能是 next-boundary、interrupt 或 after-run");
    if (input.delivery !== undefined && (!input.work_id || input.target === "answer")) throw assistantErrors.invalid("送达方式只用在已有工作的补充上，新工作和回答问题都不带");
    if (input.submission_id !== undefined && (typeof input.submission_id !== "string" || !/^[A-Za-z0-9-]{8,80}$/.test(input.submission_id))) throw assistantErrors.invalid("提交内容标识无效");
    if (input.draft_revision !== undefined && (!input.work_id || !Number.isSafeInteger(input.draft_revision) || input.draft_revision < 1)) throw assistantErrors.invalid("草稿版本无效");
    if (input.subtask) {
      if (input.work_id !== input.subtask.binding?.work_id || !["send", "continue"].includes(input.subtask.operation)
        || input.character !== undefined || input.reask !== undefined || input.target === "answer" || input.delivery !== undefined) throw assistantErrors.invalid("Invalid subtask input target");
      // A completed request remains readable after this child advances or is taken back.
      // Fresh requests are checked below, before any Work input or execution effect.
      this.store.get(this.actorId, input.work_id);
    }
    const claim = this.store.requests.claimRequest(this.actorId, String(input.request_id ?? ""), input.work_id);
    if (!claim.claimed) { if (input.work_id) this.subtaskReports.kick(input.work_id); return claim.result; }
    let handed = false, accepted = false;
    let work: StoredWork | undefined, inputHold: ReturnType<AssistantContinuations["begin"]> | undefined, draftCurrent = () => false;
    let originalInput: ReturnType<AssistantStore["permissionTransitions"]["holdWorkInput"]> | undefined, assertInput: (() => void) | undefined;
    try {
      const created = !input.work_id;
      const existing = input.work_id ? this.store.get(this.actorId, input.work_id) : undefined;
      if (existing) originalInput = this.store.permissionTransitions.holdWorkInput(existing.work_id);
      const assertLifetime = existing && existing.executor.kind === "assistant" && !existing.reply_target && !(input.delivery === "after-run" && input.target !== "answer")
        ? await holdExistingWorkLifetime(this.ports, existing) : undefined;
      const scope = existing ?? { project_ref: sendScope(input.scope, caller, choice).kind === "project" ? caller.project_ref : undefined };
      materials = await readComposerMaterials(materials, scope, this.ports);
      await caller.beforeStart?.();
      assertSendCurrent(stillCurrent);
      originalInput?.assertCurrent(); assertLifetime?.();
      requireSynchronous(caller.assertBeforeStart?.());
      const serves = existing ? undefined : await eventServes(input, this.ports.scopeActions && (() => this.ports.scopeActions!({ project_ref: caller.project_ref })));
      originalInput?.assertCurrent(); assertLifetime?.();
      requireSynchronous(caller.assertBeforeStart?.());
      work = existing ? this.store.get(this.actorId, existing.work_id) : await this.createWork(text, input.scope, context, caller, choice, input.main === true, serves);
      this.store.permissionTransitions.assertWorkPermissionTransitionFree(work.work_id);
      if (work.archived || work.delegated_by?.taken_back_at) throw assistantErrors.state("这项工作已经归档或收回");
      const workId = work.work_id;
      const original = work;
      assertInput = () => {
        this.store.permissionTransitions.assertWorkPermissionTransitionFree(workId); originalInput?.assertCurrent(); assertLifetime?.();
        const current = this.store.get(this.actorId, workId);
        if (current.archived || current.delegated_by?.taken_back_at || current.executor.kind !== original.executor.kind)
          throw assistantErrors.state("工作已结束或交给另一执行方");
        requireSynchronous(caller.assertBeforeStart?.());
      };
      assertInput();
      this.store.requests.bindWork(this.actorId, input.request_id, work.work_id);
      if (input.subtask) await this.workSubtasks.assert(input.subtask.binding, input.subtask.operation);
      const draftWorkId = work.work_id, ownsDraft = input.draft_revision === undefined || input.draft_revision === work.draft_revision;
      let savedDraft = work.draft_revision; draftCurrent = () => ownsDraft && this.store.get(this.actorId, draftWorkId).draft_revision === savedDraft;
      // Before the input hold and the material links: a work with no session yet has no round to interrupt or wait behind.
      if (!created) assertRoundToAddress(Boolean(work.executor.kind === "plugin" ? work.executor.session_id : work.session_id), input.delivery);
      if (work.reply_target && caller.thread_request !== work.thread_round?.attempt_id) throw assistantErrors.scope("请在原评论内继续这项讨论");
      if (created && input.executor_session_id) work = await adoptSession(this.store, this.actorId, work, await this.dispatcher.executorOf(work), input.executor_session_id, assertInput);
      if (!writtenBy && !input.written_by && work.executor.kind === "assistant") {
        inputHold = this.continuations.begin(work, text, draftCurrent()); work = inputHold.work; savedDraft = work.draft_revision;
        const previous = stillCurrent; stillCurrent = () => inputHold!.current() && (!previous || previous());
      }
      work = await this.chooseCharacter(work, input.character, assertInput);
      // A new work of the Assistant's own takes the role a new task gets (task → project default → my default → the Assistant), once;
      // a main conversation is with the counterpart it names.
      if (created && input.character === undefined && !work.main && !work.delegated_by && work.executor.kind === "assistant" && this.ports.resolveRole) work = await defaultCharacter(this.store, this.actorId, this.ports.resolveRole, work, assertInput);
      if (created && work.main && work.character) work = this.store.update(this.actorId, work.work_id, null, { title: `与「${work.character.title}」的对话` }, false);
      if (materials.some(item => item.reference)) materials = await this.materials.readReferences(work, materials);
      const handoffs: MethodHandoff[] = [];
      if (materials.some(item => item.kind === "method")) materials = await this.materials.chosenMethods(work, materials, handoffs);
      if (input.reask !== undefined) materials = [...materials, await reaskMaterial(work, input.reask, this.store.rounds(work.work_id), (await this.ports.host()).adapter(RUNTIME))];
      await caller.beforeStart?.();
      assertSendCurrent(stillCurrent);
      assertInput();
      linkSent(this.store.relations, work, materials, created ? context : null);
      const beforeStart = async () => { await caller.beforeStart?.(); if (input.subtask && !accepted) await this.workSubtasks.assert(input.subtask.binding, input.subtask.operation); };
      const assertBeforeStart = () => { assertInput!(); if (input.subtask) assertSubtaskWork(this.store, this.actorId, input.subtask.binding); };
      const result = await this.dispatcher.dispatch(work, text, materials, context, input.work_id ? undefined : input.mode, writtenBy ?? input.written_by, stillCurrent, beforeStart, assertBeforeStart, { id: input.request_id, subtask: input.subtask, handed: () => { handed = true; }, target: input.target, delivery: input.delivery, byHost: Boolean(writtenBy ?? input.written_by) || input.reask !== undefined || !original_input, about: input.about, original_input, reply_locale: caller.reply_locale, draftCurrent, ...(input.auto_skills === false ? { auto_skills: false as const } : {}) }, { assertCurrent: () => { for (const item of handoffs) item.assertCurrent(); }, accepted: () => { accepted = true; for (const item of handoffs) item.accepted(); } });
      if (inputHold) { inputHold.accept(); const current = this.store.get(this.actorId, work.work_id); result.work = this.reads.publicWork(current, await this.reads.stateSafely(current)); }
      if (input.submission_id !== undefined) result.submission_id = input.submission_id;
      this.store.requests.finishRequest(this.actorId, input.request_id, result);
      return result;
    } catch (error) {
      // The model preflight explicitly rejects before the Runtime can admit any Run.
      const uncertain = handed && !(error instanceof ActionError && error.code === "agent.model_not_configured");
      if (!uncertain) this.store.requests.releaseRequest(this.actorId, input.request_id);
      if (stillCurrent && !stillCurrent()) throw error;
      // Nothing the person typed is lost: an unsent message stays as the work's draft (a re-ask's words are the Host's: the draft stays).
      if (work && !work.reply_target) {
        const canKeep = () => {
          try { assertInput?.(); return true; } catch { return false; }
        };
        const kept = input.reask === undefined && draftCurrent() && canKeep() ? this.store.update(this.actorId, work.work_id, null, { draft: text }, false) : this.store.get(this.actorId, work.work_id);
        const cause = assistantFailure(error);
        const failure = uncertain ? assistantErrors.pending_request(`${cause.message}。原输入可能已受理，请先核对这次请求再发送`) : cause;
        throw new ActionError(failure.code, failure.message, { kind: failure.kind, cause: failure,
          details: { ...failure.details, work: this.reads.publicWork(kept, await this.reads.stateSafely(kept)) } });
      }
      throw assistantFailure(error);
    } finally { inputHold?.end(); originalInput?.release(); if (work?.delegated_by) this.subtaskReports.kick(work.work_id); }
  }

  readSubtask(workId: string) { return this.workSubtasks.conversation(workId); }
  checkSubtaskRequest(workId: string, requestId: string) { return this.workSubtasks.checkRequest(workId, requestId); }

  async control(workId: string, control: AssistantControl, caller?: AgentActionReviewControl): Promise<AssistantWorkView> {
    const work = this.store.get(this.actorId, workId);
    if (control.subtask) return this.workSubtasks.stop(workId, control, caller);
    if (control?.kind === "withdraw") {
      await withdrawInput(work, this.store.rounds(work.work_id), control, { executor: () => this.dispatcher.executorOf(work), runtime: async () => inputsOf((await this.ports.host()).adapter(RUNTIME)),
        beforeWithdraw: (session_id, input_id) => { const source = memoryInputSource({ actor_id: this.actorId, session_id, input_id, kind: "supplement" }); for (const cancel of this.memorySourceWithdrawals) cancel(source.event_id); } });
    } else await controlAssistantWork(work, control, this.controlPorts(), caller);
    return this.read(workId);
  }

  private controlPorts(): Parameters<typeof controlAssistantWork>[2] {
    return { store: this.store, actorId: this.actorId, continuations: this.continuations, delegations: this.delegations,
      host: () => this.ports.host(), executor: (work, control) => this.dispatcher.executorOf(work, undefined, { control }), latest: (host, work) => this.reads.latestRun(host, work), cancelSetups: this.ports.cancelSetups, retainSetups: this.ports.retainSetups };
  }

  /** Only the committed project deletion owner calls this, including for idle and never-started works. */
  async closeForProjectDeletion(workId: string): Promise<void> {
    const work = this.store.get(this.actorId, workId);
    await controlAssistantWork(work, { kind: "stop" }, this.controlPorts(), undefined,
      (member, host, control) => this.followUps.stopForArchive(member.work_id, { adapter: host.adapter(RUNTIME), control }));
  }

  saveDraft(workId: string, draft: string): AssistantWork {
    if (typeof draft !== "string" || draft.length > MAX_TEXT) throw assistantErrors.invalid("草稿过长");
    const work = this.store.update(this.actorId, workId, null, { draft }, false);
    return this.reads.publicWork(work, "idle");
  }

  async rename(workId: string, revision: number, title: string): Promise<AssistantWork> {
    const work = renameWork(this.store, this.actorId, workId, revision, title);
    return this.reads.publicWork(work, await this.reads.stateSafely(work));
  }

  /** Put away (or back). Putting away is quiet: it waits for no round in progress here or in what it handed out, and takes its timed rounds with it. */
  async archive(workId: string, archived: boolean, caller?: AgentActionReviewControl): Promise<AssistantWork> {
    const original = this.store.get(this.actorId, workId);
    const children = this.store.delegatedBy(this.actorId, original, "any");
    const release = this.store.permissionTransitions.holdWorkPermissions([workId, ...children.map(item => item.work_id)], true, archived ? "archive" : "restore");
    let work: StoredWork;
    try { work = await changeAssistantSessionLifecycle(this.store, this.ports, this.actorId, this.reads, this.followUps, this.starting, original, [original, ...children], archived, caller); }
    finally { release(); }
    const hasSession = work.session_id || work.executor.kind === "plugin" && work.executor.session_id;
    return this.reads.publicWork(work, hasSession ? await this.reads.stateSafely(work) : "idle");
  }

  private async createWork(text: string, scope: AssistantScope | undefined, context: AssistantContextSnapshot | null, caller: AssistantCaller, choice: AssistantSendInput["executor"], main = false, serves?: StoredWork["serves"]): Promise<StoredWork> {
    const wanted = sendScope(scope, caller, choice);
    // Chosen only among the executors this project offers now, and kept by the plugin's id.
    const executor = choice?.kind === "plugin" ? await this.dispatcher.executorOf({ project_ref: caller.project_ref }, choice.plugin_id) : null;
    const scopeTitle = wanted.kind === "project" ? await this.ports.projectTitle?.(wanted.project_id).catch(() => null) : null;
    await caller.beforeStart?.(); requireSynchronous(caller.assertBeforeStart?.());
    return this.store.create({ actor_id: this.actorId, title: main ? "" : titleFrom(text), scope: wanted, origin: context && !hasExternalSessionContext(context) ? context.source : null, ...(scopeTitle ? { scope_title: scopeTitle } : {}), ...(main ? { main: true as const } : {}), ...(serves ? { serves } : {}),
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

  /** A delegated work's delivery report, when it was handed requirements (assistant-delegation.ts). */
  delivery(work: StoredWork): AgentDelivery | undefined { return this.delegations.delivery(work); }
  /** The delegation tools of a round of `parent` (assistant-delegation.ts). */
  delegation(parent: StoredWork): AgentDelegation | undefined { return this.delegations.of(parent); }

  takeBack(childId: string, caller?: AgentActionReviewControl): Promise<AssistantWorkView> { return this.delegations.takeBack(childId, caller); }

  /**
   * The roles the person may choose for a work, read once (`characters.roles.list`): this project's members in project work, their
   * originals in personal work, with the defaults and the role a new task gets. Only the Assistant's own rounds use them.
   */
  async characters(workId: string | undefined, caller: AssistantCaller): Promise<CharacterRoleCatalog | null> {
    const work = workId ? this.store.get(this.actorId, workId) : undefined;
    const project = work ? work.project_ref ?? null : caller.project_ref ?? null;
    if (!this.ports.characters || work?.executor.kind === "plugin") return null;
    return this.ports.characters(project);
  }

  /** The person's choice of Character for this work from its next round on: checked now, never swapped for another. */
  private chooseCharacter(work: StoredWork, choice: AssistantCharacterRef | null | undefined, assertCurrent?: () => void): Promise<StoredWork> {
    return chooseCharacter(this.store, this.actorId, this.ports.characters, work, choice, assertCurrent);
  }
}

/** The effective role for a new work, kept as its stable choice; the Assistant itself keeps none. */
async function defaultCharacter(store: AssistantStore, actorId: string, resolveRole: NonNullable<AssistantServicePorts["resolveRole"]>, work: StoredWork,
  assertCurrent?: () => void): Promise<StoredWork> {
  const resolved = await resolveRole(work.project_ref ?? null);
  if (!resolved) return work;
  const ref = resolved.selection.kind === "assistant" ? null : resolved.selection;
  if (!ref || !resolved.title || resolved.effective.kind !== "role") return work;
  const version = resolved.effective.version, character_id = version.kind === "personal" ? version.character_id : version.original.character_id;
  assertCurrent?.();
  return store.update(actorId, work.work_id, null, { character: { ref, title: resolved.title, character_id } }, false);
}

/** A choice of role checked against the roles the person may choose for this work now; a role that cannot run is refused, never swapped. */
async function chooseCharacter(store: AssistantStore, actorId: string, characters: AssistantServicePorts["characters"], work: StoredWork,
  choice: AssistantCharacterRef | null | undefined, assertCurrent?: () => void): Promise<StoredWork> {
  if (choice === undefined) {
    if (work.executor.kind === "assistant") assertStoredCharacter(work.character);
    return work;
  }
  if (choice === null) {
    assertCurrent?.();
    return work.character !== undefined ? store.update(actorId, work.work_id, null, { character: undefined }, false) : work;
  }
  const ref = parseRoleRef(choice);
  if (!ref) throw assistantErrors.invalid("角色选择无效");
  if (work.executor.kind === "plugin") throw assistantErrors.invalid("这项工作由执行方插件负责，它的角色在插件自己的会话里选择");
  if (!characters) throw assistantErrors.invalid("角色服务尚未接通");
  const catalog = await characters(work.project_ref ?? null), found = catalog ? catalogChoice(catalog, ref) : null;
  if (!found) throw assistantErrors.invalid(work.project_ref ? "这个项目里没有这个角色" : "没有这个角色");
  if (!found.available) throw assistantErrors.character_unavailable("所选角色已停用或还没保存成版本，请另选一个，或不指定角色", { action: "重新选择角色" });
  const held = storedCharacter(work.character);
  if (held && roleKey(held.ref) === roleKey(ref) && held.title === found.character.title && held.character_id === found.character.character_id) return work;
  assertCurrent?.();
  return store.update(actorId, work.work_id, null, { character: found.character }, false);
}
