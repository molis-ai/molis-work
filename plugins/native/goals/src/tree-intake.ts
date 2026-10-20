import type { ActionIntake, ActionResultView } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Where a plan in hand becomes proposed goal steps (context-program §21.10). `goals.tree.submit` only files a proposal that the person
 * approves in Goals, so the entry is `proposes`: the surface always shows a card first, there is nothing to undo (withdrawing a proposal is
 * the approval decision, `goals.tree.decide`, which an undo must not stand in for), and the rules alone never push it for a passage.
 * The query named in `prepare` computes the whole proposal from the selection without a model.
 */
export const GOALS_TREE_INTAKE: ActionIntake = {
  intake_id: "breakdown", item_kind: "goal_tree_proposal", title: "目标步骤", verb: "拆成目标步骤", effect: "proposes",
  describe: "一段计划或一串步骤：拆成可以跟踪、验收的目标步骤，只是提议，要在 Goals 里确认才生效；不是随手记一件事，也不是已经定下的目标",
  examples: ["把这周的发布计划拆成目标步骤", "把这几条拆成可以推进的目标", "这段方案变成可以验收的步骤"],
  prepare: { capability_id: "goals.fragment.offers", version: 1 },
};

/** What the card says once the proposal is filed: it is not in force yet, and the way on is Goals. */
export const GOALS_TREE_SUBMIT_RESULT: ActionResultView = {
  summary: "已提交目标提案：要在 Goals 里确认才生效",
  link: { label: "去 Goals 确认", href_template: "/projects/{project_id}/?openPlugin=goals#{/proposal/proposal_id}" },
};
