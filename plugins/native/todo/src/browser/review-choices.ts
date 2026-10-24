import type { TodoBatch, TodoCandidate } from "@molis-ai/molis-work-contracts/modules/todo";
import type { CandidateChoice, CandidateDecision, TodoPage } from "./types.js";

type ExistingRelation = NonNullable<TodoCandidate["existing"]>["relation"];

/** What applying a candidate does: add it, or change the todo it meets. */
type ApplyAction = "add" | "merge" | "update" | "complete" | "reopen";
const ACTION_OF: Record<ExistingRelation, Exclude<ApplyAction, "add">> = { same: "merge", update: "update", conflict: "update", maybe_done: "complete", reopen: "reopen" };

/** What a candidate's choice is now (made on first sight from the candidate's own preselection). */
export function choiceFor(page: TodoPage, candidate: TodoCandidate): CandidateChoice {
  let choice = page.state.choices.get(candidate.candidate_id);
  if (!choice) {
    choice = { picked: candidate.selected, edits: {}, accept: new Set(), editing: false };
    page.state.choices.set(candidate.candidate_id, choice);
  }
  return choice;
}
export const actionFor = (candidate: TodoCandidate): ApplyAction => (candidate.existing ? ACTION_OF[candidate.existing.relation] : "add");

/** What "apply" would do for the candidates the person kept, in words ("加入 2 项待办、合并 1 项"); empty when none is kept. */
export function applyLabel(page: TodoPage, batch: TodoBatch): string {
  const { L } = page;
  const counts: Record<ApplyAction, number> = { add: 0, merge: 0, update: 0, complete: 0, reopen: 0 };
  for (const candidate of batch.candidates) if (!candidate.decision && choiceFor(page, candidate).picked) counts[actionFor(candidate)] += 1;
  const parts: string[] = [];
  if (counts.add) parts.push(L("todo.review.apply-add", { count: counts.add }));
  if (counts.merge) parts.push(L("todo.review.apply-merge", { count: counts.merge }));
  if (counts.update) parts.push(L("todo.review.apply-update", { count: counts.update }));
  if (counts.complete) parts.push(L("todo.review.apply-complete", { count: counts.complete }));
  if (counts.reopen) parts.push(L("todo.review.apply-reopen", { count: counts.reopen }));
  return parts.join("、");
}

/** The decisions for the candidates the person kept, with their edits and the protected fields they accepted. */
export function keptDecisions(page: TodoPage, batch: TodoBatch): CandidateDecision[] {
  return batch.candidates.filter((candidate) => !candidate.decision && choiceFor(page, candidate).picked).map((candidate) => {
    const choice = choiceFor(page, candidate);
    const decision: CandidateDecision = { candidate_id: candidate.candidate_id, action: actionFor(candidate) };
    if (Object.keys(choice.edits).length) decision.edits = choice.edits;
    if (choice.accept.size) decision.accept_protected = [...choice.accept];
    return decision;
  });
}
