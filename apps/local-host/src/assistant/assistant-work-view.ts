import type { AssistantRound, AssistantWork, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentRunView } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { StoredWork } from "./assistant-store.js";

/** The fields `T` may leave out. */
type OptionalOf<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/**
 * A work as the person sees it: the `AssistantWork` contract's fields, each taken by name from what is stored. Whatever
 * else a stored body holds (the host's own bookkeeping, or a key an older version wrote) never reaches the view.
 * Both halves name every field the contract has, so a field the contract gains and this leaves out does not compile.
 */
export function workView(work: StoredWork, state: AssistantWorkState, delegated_by: AssistantWork["delegated_by"]): AssistantWork {
  const view: AssistantWork = {
    work_id: work.work_id, executor: work.executor, revision: work.revision, title: work.title, scope: work.scope, origin: work.origin, state,
    session_id: work.session_id, draft: work.draft, created_at: work.created_at, updated_at: work.updated_at, archived: work.archived,
  };
  const optional: { [K in OptionalOf<AssistantWork>]-?: AssistantWork[K] | undefined } = {
    reply_target: work.reply_target, scope_title: work.scope_title, character: work.character, delegated_by, budget_tokens: work.budget_tokens,
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
