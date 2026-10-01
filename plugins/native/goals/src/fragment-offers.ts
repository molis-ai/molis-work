import {
  FRAGMENT_ANY_OBJECT, defineFragmentOffersAction, type FragmentActionOffer, type FragmentOfferChoice, type FragmentOffersInput,
} from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * What Goals offers for part of anything the person is reading or writing (specs/archive/contextual-interaction §3.3 S2, S5):
 * - a plan becomes proposed steps: a structure proposal that creates nothing until the person approves it in Goals;
 * - a task just ticked, in something that belongs to a Goal, becomes that Goal's progress.
 * Both write, so the surface shows them as prepared cards the person confirms; preparing only reads the Goal's cursor.
 */
export const GOALS_FRAGMENT_CHOICES: readonly FragmentOfferChoice[] = [
  { offer_id: "breakdown", title: "拆成目标步骤", intent: "organize", apply: "record", hint: "把一段计划拆成可以跟踪的目标步骤，提交后在 Goals 里确认才生效",
    action: { capability_id: "goals.tree.submit", version: 1 }, granularities: ["range", "block", "blocks"] },
  { offer_id: "progress", title: "记录进展", intent: "advance", apply: "record", hint: "把刚完成的这一步记为所属 Goal 的进展",
    action: { capability_id: "goals.progress.record", version: 1 }, granularities: ["range", "block"], roles: ["task", "list"], requires: ["goal"] },
];

export const goalsFragmentOffersAction = defineFragmentOffersAction("goals.fragment.offers", [FRAGMENT_ANY_OBJECT], "选中的内容可以推进的目标", ["goals:read"], GOALS_FRAGMENT_CHOICES);

const MAX_STEPS = 6;
const clip = (text: string, max: number) => text.length > max ? text.slice(0, max - 1) + "…" : text;

/** The steps a passage names: one per selected part, or one per clause of a single part. */
export function planSteps(input: FragmentOffersInput): string[] {
  const parts = input.fragment.targets.map(target => target.text.trim()).filter(Boolean);
  const clauses = parts.length > 1 ? parts : (parts[0] ?? "").split(/[。；;\n]+|[，,](?=[^，,]{6,})/u);
  // A list marker is not part of the step (“1.”, “2、”, “-”); a leading number that is content (“2026 年”) stays.
  return clauses.map(part => part.replace(/^\s*(?:[-*•]|\d{1,2}[.、)）])\s*/u, "").trim()).filter(part => part.length >= 4)
    .slice(0, MAX_STEPS).map(part => clip(part.replace(/[。；;，,]+$/u, ""), 80));
}

export interface GoalsFragmentPorts {
  /** The Goal's current event cursor, or null when it is gone or not readable here. */
  cursor(goalId: string): number | null;
}

export function prepareGoalsFragmentOffers(input: FragmentOffersInput, ports: GoalsFragmentPorts): FragmentActionOffer[] {
  const { fragment, request_id } = input;
  const offers: FragmentActionOffer[] = [];
  const source = `${fragment.object.kind}:${fragment.object.id}`;
  const from = fragment.object.title ? `「${fragment.object.title}」` : "选中的内容";
  const steps = planSteps(input);
  if (fragment.granularity !== "word" && fragment.granularity !== "objects" && steps.length) {
    const goal = fragment.goal;
    const ids = steps.map((_, index) => `goal-${request_id.slice(0, 36)}-${index + 1}`);
    const explanation = (index: number) => ({ problem: `${from}里的计划还只是文字，无法跟踪`, expected_effect: `“${steps[index]}”成为可以推进和验收的目标步骤`,
      non_goals: ["不修改原文"], depends_on_item_ids: [] as string[] });
    const items = steps.flatMap((title, index) => [
      { item_id: `step-${index + 1}`, kind: "goal", operation: "create", payload: { goal_id: ids[index], title, why: `来自${from}中选中的计划` },
        source_refs: [source], reason: "按选中的计划文字拆出的一步", confidence: 0.6, explanation: explanation(index) },
      ...(goal ? [{ item_id: `part-${index + 1}`, kind: "relation", operation: "create",
        payload: { from_goal_id: ids[index], to_goal_id: goal.id, type: "part_of", reason: `“${title}”是「${goal.title}」的一步` },
        source_refs: [source], reason: "新步骤属于文档所属的目标", confidence: 0.6,
        explanation: { ...explanation(index), depends_on_item_ids: [`step-${index + 1}`] } }] : []),
    ]);
    const placement = goal ? `，放在「${goal.title}」下` : "";
    offers.push({ offer_id: "breakdown", title: "拆成目标步骤", action: { capability_id: "goals.tree.submit", version: 1 }, input: {
      ...(goal ? { root_goal_id: goal.id } : {}), summary: clip(`把${from}里的计划拆成 ${steps.length} 个目标步骤${placement}`, 200),
      narrative: { why_now: `正在${from}里整理这段计划`, problem: "计划写在文字里，没有可以跟踪的步骤", main_path: steps,
        expected_effect: "每一步都能在 Goals 里推进、记录进展和验收", non_goals: ["不修改原文"] },
      items, idempotency_key: request_id },
      summary: `在 Goals 里提交结构提案：新建 ${steps.length} 个步骤${placement}（${steps.map(step => `“${clip(step, 20)}”`).join("、")}）。提交后要在 Goals 里确认才会生效。`,
      editable: ["summary"] });
  }
  const done = fragment.targets.find(target => target.role === "task" || target.role === "list")?.text.trim();
  const cursor = fragment.goal && done ? ports.cursor(fragment.goal.id) : null;
  if (fragment.goal && done && cursor !== null) {
    const summary = clip(`完成：${done}`, 200);
    offers.push({ offer_id: "progress", title: "记录进展", action: { capability_id: "goals.progress.record", version: 1 },
      input: { goal_id: fragment.goal.id, idempotency_key: request_id, based_on_cursor: cursor, summary },
      summary: `为「${fragment.goal.title}」记录一条进展：${summary}`, editable: ["summary", "next_step"] });
  }
  return offers;
}
