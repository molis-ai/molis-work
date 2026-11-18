import type { AssistantWorkView } from "@molis-ai/molis-work-contracts/services/assistant";
import type { MemoryChange } from "@molis-ai/molis-work-contracts/services/memory";
import type { AssistantServicePorts } from "./assistant-service-shared.js";
import type { AssistantStore } from "./assistant-store.js";
import { assistantSessionLifecycleProblem } from "./assistant-session-lifecycle.js";
import { assistantFailure } from "./assistant-error.js";
import { stateOf } from "./assistant-present.js";
import { cardView } from "./assistant-card-view.js";
import type { AssistantWorkReads } from "./assistant-work-reads.js";
import type { AssistantDispatch } from "./assistant-dispatch.js";
import type { AssistantContinuations } from "./assistant-continuations.js";
import type { AssistantDelegations } from "./assistant-delegation.js";
import type { AssistantSdkSubtasks } from "./assistant-sdk-subtasks.js";
import type { AssistantFollowUps } from "./assistant-followups.js";
import type { AssistantJobs } from "./assistant-jobs.js";
import type { AssistantMemoryBridge } from "./assistant-memory-bridge.js";
import type { AssistantBudget } from "./assistant-budget.js";
import type { AssistantOffers } from "./assistant-offers.js";
import type { AssistantNotices } from "./assistant-notices.js";
import type { AssistantRound, AssistantWork, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { StoredWork } from "./assistant-store.js";
import { workTitle } from "./assistant-work-title.js";
import { characterSelectionView } from "./assistant-characters.js";

/** The fields `T` may leave out. */
type OptionalOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/**
 * A work as the person sees it: the `AssistantWork` contract's fields, each taken by name from what is stored. Whatever
 * else a stored body holds (the host's own bookkeeping, or a key an older version wrote) never reaches the view.
 * Both halves name every field the contract has, so a field the contract gains and this leaves out does not compile.
 */
export function workView(work: StoredWork, state: AssistantWorkState, delegated_by: AssistantWork["delegated_by"]): AssistantWork {
  const view: AssistantWork = {
    work_id: work.work_id, executor: work.executor, revision: work.revision, title: workTitle(work), scope: work.scope, origin: work.origin, state,
    session_id: work.session_id, draft: work.draft, draft_revision: work.draft_revision, created_at: work.created_at, updated_at: work.updated_at, archived: work.archived,
  };
  const optional: { [K in OptionalOf<AssistantWork>]-?: AssistantWork[K] | undefined } = {
    reply_target: work.reply_target, scope_title: work.scope_title, delegated_by, budget_tokens: work.budget_tokens, ask_each_step: work.ask_each_step,
    character: undefined, character_selection_required: undefined, ...characterSelectionView(work.character),
    main: work.main, serves: work.serves, line_event: work.line_event,
  };
  // An optional field is in the view only when the work has it.
  for (const key of Object.keys(optional) as Array<keyof typeof optional>) if (optional[key] !== undefined) Object.assign(view, { [key]: optional[key] });
  return view;
}

/** The model a round really ran on, from the run's own frozen start and switch (specs/visual-ui-experience VUX-11); none without a run. */
export function roundModel(run: AgentRunView | undefined): Pick<AssistantRound, "model"> {
  if (!run?.frozen?.model_id) return {};
  const { model_id, model_context } = run.frozen, now = run.model_switch?.now;
  return { model: { model_id, ...(now && now !== model_id ? { now } : {}), ...(model_context ? { window_tokens: model_context.window_tokens } : {}) } };
}

type WorkViewLinks = {
  reads: Pick<AssistantWorkReads, "named" | "assistantPart" | "executorPart" | "publicWork" | "workObjects">;
  dispatcher: Pick<AssistantDispatch, "carried" | "settleUnsent">;
  continuations: Pick<AssistantContinuations, "state">;
  delegations: Pick<AssistantDelegations, "parts">;
  sdkSubtasks: Pick<AssistantSdkSubtasks, "list">;
  followUps: Pick<AssistantFollowUps<StoredWork>, "list" | "claim">;
  jobs: Pick<AssistantJobs, "views">;
  memory: Pick<AssistantMemoryBridge, "memoryCandidates" | "memoryTrail">;
  budget: Pick<AssistantBudget, "workUsage">;
  offers: Pick<AssistantOffers, "sweep">;
};

export async function listWorkViews(store: AssistantStore, ports: AssistantServicePorts, actorId: string, reads: Pick<AssistantWorkReads, "stateFor" | "publicWork" | "named">, notices: Pick<AssistantNotices, "notice">): Promise<AssistantWork[]> {
    const works = store.list(actorId);
    if (!works.length) return [];
    const host = await ports.host();
    return Promise.all(works.map(async work => {
      const state = await reads.stateFor(host, work);
      notices.notice(work, state);
      return reads.publicWork(await reads.named(work), state);
    }));
  }

export async function readWorkView(workId: string, store: AssistantStore, ports: AssistantServicePorts, actorId: string, link: WorkViewLinks): Promise<AssistantWorkView> {
    const work = await link.reads.named(store.get(actorId, workId));
    // One work, whoever ran each round: the Assistant's own session, and the executor's session it carries or handed to.
    const assistant = work.session_id ? await link.reads.assistantPart(work) : null;
    const carried = await link.dispatcher.carried(work).catch(() => null);
    const plugin = carried ? await link.reads.executorPart(work, carried) : null;
    const rounds = link.dispatcher.settleUnsent(work, [...(assistant?.rounds ?? []), ...(plugin?.rounds ?? [])].sort((a, b) => a.started_at.localeCompare(b.started_at)));
    const latest = rounds.at(-1);
    const problem = await assistantSessionLifecycleProblem(ports, work) ?? assistant?.problem ?? plugin?.problem;
    const state = plugin?.unreadable && work.executor.kind === "plugin" ? "needs-check"
      : await link.continuations.state(work, stateOf(latest && latest.phase !== "unknown" ? latest.phase : latest ? null : undefined, Boolean(assistant?.recovery || plugin?.recovery)));
    const shown: StoredWork = work.executor.kind === "plugin" && plugin?.mode ? { ...work, executor: { ...work.executor, mode: plugin.mode } } : work;
    // Its task board: the sub-tasks it handed out, each as its own work.
    const delegated = await link.delegations.parts(work);
    const sdk_subtasks = work.session_id ? await link.sdkSubtasks.list(work.work_id).then(children => ({ children }), error => ({ error: assistantFailure(error).message })) : undefined;
    const scheduled = link.followUps.list(work.work_id);
    const claim = scheduled.length ? await link.followUps.claim() : null;
    const unsettled = store.unsettled(actorId, work.work_id, true);
    const jobs = await link.jobs.views(work);
    const undoable = store.undos(actorId, work.work_id).slice(-10).map(({ work_id: _work, reference, input: _input, told: _told, ...view }) => ({ ...view, capability_id: reference.capability_id }));
    const memory_candidates = await link.memory.memoryCandidates(work.work_id);
    const { changes: memory_changes } = await link.memory.memoryTrail(work, rounds, store.rounds(work.work_id), assistant?.memory ?? new Map()).catch(() => ({ changes: [] as MemoryChange[] }));
    const usage = work.executor.kind === "plugin" ? null : await link.budget.workUsage(work).catch(() => null);
    await link.offers.sweep(work);
    return { work: link.reads.publicWork(shown, state), ...(sdk_subtasks ? { sdk_subtasks } : {}), rounds, reviews: [...(assistant?.reviews ?? []), ...(plugin?.reviews ?? [])],
      cards: store.cards(work.work_id).map(card => cardView(card)), objects: await link.reads.workObjects(work), ...(delegated.length ? { delegated } : {}),
      ...(scheduled.length ? { scheduled } : {}), ...(claim ? { schedule_survives_close: claim.survives_window_close } : {}), ...(unsettled.length ? { unsettled } : {}), ...(jobs.length ? { jobs } : {}), ...(undoable.length ? { undoable } : {}), ...(memory_candidates.length ? { memory_candidates } : {}), ...(memory_changes.length ? { memory_changes } : {}),
      ...(usage && (usage.rounds || usage.budget_tokens !== null) ? { usage } : {}), ...(problem ? { problem } : {}),
      ...assistant?.queued, ...(plugin?.queued_inputs ? { queued_inputs: plugin.queued_inputs } : {}) };
  }
