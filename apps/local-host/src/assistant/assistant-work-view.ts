import type { AssistantWork, AssistantWorkState } from "@molis-ai/molis-work-contracts/services/assistant";
import type { StoredWork } from "./assistant-store.js";

/**
 * A work as the person sees it: the `AssistantWork` contract's fields, each taken by name from what is stored. Whatever
 * else a stored body holds (the host's own bookkeeping, or a key an older version wrote) never reaches the view.
 */
export function workView(work: StoredWork, state: AssistantWorkState, delegated_by: AssistantWork["delegated_by"]): AssistantWork {
  const { reply_target, scope_title, character, budget_tokens } = work;
  return {
    work_id: work.work_id, executor: work.executor, revision: work.revision, title: work.title, scope: work.scope, origin: work.origin, state,
    session_id: work.session_id, draft: work.draft, created_at: work.created_at, updated_at: work.updated_at, archived: work.archived,
    ...(reply_target !== undefined ? { reply_target } : {}), ...(scope_title !== undefined ? { scope_title } : {}),
    ...(character !== undefined ? { character } : {}), ...(delegated_by ? { delegated_by } : {}),
    ...(budget_tokens !== undefined ? { budget_tokens } : {}),
  };
}
