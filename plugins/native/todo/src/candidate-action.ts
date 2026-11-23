import type { TodoCandidate } from "./contract.js";

type ExistingRelation = NonNullable<TodoCandidate["existing"]>["relation"];

/** What applying a candidate does: add it, or change the todo it meets. */
export type ApplyAction = "add" | "merge" | "update" | "complete" | "reopen";
const ACTION_OF: Record<ExistingRelation, Exclude<ApplyAction, "add">> = { same: "merge", update: "update", conflict: "update", maybe_done: "complete", reopen: "reopen" };

export const actionFor = (candidate: TodoCandidate): ApplyAction => (candidate.existing ? ACTION_OF[candidate.existing.relation] : "add");
