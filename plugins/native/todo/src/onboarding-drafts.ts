import { createActionDefinition } from "@molis-ai/molis-work-plugin-sdk";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import type { ActionDefinition, InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import { withProjectReach } from "./reach.js";
import {
  ONBOARDING_DRAFT_GET_INPUT_SCHEMA, ONBOARDING_DRAFT_GET_RESULT_SCHEMA, ONBOARDING_DRAFT_INPUT_SCHEMA, ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA,
  ONBOARDING_DRAFT_KEEP_RESULT_SCHEMA, ONBOARDING_DRAFT_RESULT_SCHEMA, type OnboardingDraftBatch, type OnboardingDraftCandidate,
} from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import type { TextArg, TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import type { TodoBatch, TodoCandidate } from "./contract.js";
import { TODO_BATCH_SUBJECT_KIND } from "./batch-kind.js";
import { actionFor } from "./candidate-action.js";
import type { TodoCandidateDecision } from "./organize.js";

// Onboarding's drafts (specs/plugin-equal-standing/contract-design.md §2.5): the platform hands Todo the materials by the `drafts`
// intake and names no plugin. Three actions of their own, beside `todo.organize.*` (which Todo's page, the Assistant, agents and MCP keep
// using unchanged): they share the organizer and its request key (`todoRequestKey`, no action id in it), so one `request_id` is one batch
// whichever action it came by. What onboarding sees is the platform's shape, converted here from the batch Todo keeps.

const define = <I, O>(name: string, version: number, title: string, description: string, operation: "query" | "command", input: object, output: object,
  permissions: readonly string[], extra: Partial<ActionDefinition["action"]> = {}): ActionDefinition<I, O> =>
  withProjectReach(createActionDefinition<I, O>(`todo.onboarding.${name}`, operation, { title, description, scope: "home", audiences: ["user"], permissions: [...permissions],
    subject_kinds: [TODO_BATCH_SUBJECT_KIND], input_schema: input as ActionDefinition["action"]["input_schema"], output_schema: output as ActionDefinition["action"]["output_schema"], ...extra }, version));

const get = { capability_id: "todo.onboarding.get", version: /* @version action.todo.onboarding.get */ 1 } as const;
const keep = { capability_id: "todo.onboarding.keep", version: /* @version action.todo.onboarding.keep */ 1 } as const;

export const todoOnboardingActions = {
  draft: define<InferActionInput<typeof ONBOARDING_DRAFT_INPUT_SCHEMA>, { batch: OnboardingDraftBatch }>("draft", /* @version action.todo.onboarding.draft */ 1, "从上手材料起草待办",
    "上手时读给定材料，起草一份待你确认的待办；不直接新建待办，同一请求标识重试返回同一份", "command", ONBOARDING_DRAFT_INPUT_SCHEMA, ONBOARDING_DRAFT_RESULT_SCHEMA,
    ["todo:read", "todo:write", "model:invoke"], { execution: { cost: "metered" }, scheduling: "concurrent",
      intake: { intake_id: "onboarding.drafts", item_kind: TODO_BATCH_SUBJECT_KIND, accepts: [{ kind: "drafts", get, keep }] } }),
  get: define<InferActionInput<typeof ONBOARDING_DRAFT_GET_INPUT_SCHEMA>, { batches: OnboardingDraftBatch[] }>("get", get.version, "读取上手起草的待办", "按标识读取上手时起草的几份待办草稿的当前状态", "query",
    ONBOARDING_DRAFT_GET_INPUT_SCHEMA, ONBOARDING_DRAFT_GET_RESULT_SCHEMA, ["todo:read"]),
  keep: define<InferActionInput<typeof ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA>, { batch: OnboardingDraftBatch }>("keep", keep.version, "采用上手起草的待办", "把选中的草稿加入待办（与已有待办相同、要更新、可能已完成或要重开的，按关系处理）；已处理过的跳过", "command",
    ONBOARDING_DRAFT_KEEP_INPUT_SCHEMA, ONBOARDING_DRAFT_KEEP_RESULT_SCHEMA, ["todo:read", "todo:write"]),
};

/** The ring a kind of draft shows in, as the onboarding page drew it. */
const STATE: Record<TodoCandidate["kind"], OnboardingDraftCandidate["label"]["state"]> = { request: "answer", commitment: "running", waiting: "waiting", suggestion: "idle" };
const text = (name: string, value: string): TextArg => ({ name, kind: "text", text: value });
const ARG_TEXT = 2000;

/** The four short lines under a draft: when it is due (the date formatted when shown), who it waits on or that its owner is unclear, and a related todo. */
function meta(candidate: TodoCandidate): TextRef[] {
  const date: TextArg | null = candidate.due_date ? { name: "date", kind: "date", at: candidate.due_date, style: "month-day" } : null;
  return [
    ...(date ? [candidate.due_phrase ? { key: "todo.onboarding.due-written", args: [date, text("phrase", cutHead(candidate.due_phrase, ARG_TEXT))] } : { key: "todo.onboarding.due", args: [date] }] : []),
    ...(candidate.kind === "waiting" && candidate.waiting ? [{ key: "todo.onboarding.waiting-who", args: [text("who", cutHead(candidate.waiting.who, ARG_TEXT))] }]
      : candidate.owner.stated ? [] : [{ key: "todo.onboarding.owner-unclear" }]),
    ...(candidate.existing ? [{ key: "todo.onboarding.related-existing" }] : []),
  ];
}

/** A batch Todo keeps, in the platform's shape. Notes were written in words when the batch was drafted, so they stay those words. */
export function onboardingDraftBatch(batch: TodoBatch): OnboardingDraftBatch {
  return { batch_id: batch.batch_id, revision: batch.revision, notes: batch.notes.map(note => ({ literal: cutHead(note, ARG_TEXT) })), reference_only: batch.reference_only.length,
    candidates: batch.candidates.map(candidate => ({ candidate_id: candidate.candidate_id, title: cutHead(candidate.title, 500), selected: candidate.selected,
      label: { text: { key: `todo.onboarding.kind-${candidate.kind}` }, state: STATE[candidate.kind] }, meta: meta(candidate),
      ...(candidate.evidence[0] ? { evidence: cutHead(candidate.evidence[0].excerpt, 500) } : {}),
      decision: candidate.decision ? { item_id: candidate.decision.item_id } : null })) };
}

/**
 * What keeping the chosen drafts does to each, by how it meets an existing todo (this table was the Host's, `service.ts:775`, before the
 * move): a new one is added, the same one merged, a changed one updated, one that seems done completed, a closed one reopened. A draft
 * already decided is skipped, so a retry after a partial keep goes on where it stopped.
 */
export function keepDecisions(batch: TodoBatch, chosen: readonly string[]): TodoCandidateDecision[] {
  const wanted = new Set(chosen);
  return batch.candidates.filter(candidate => wanted.has(candidate.candidate_id) && !candidate.decision)
    .map(candidate => ({ candidate_id: candidate.candidate_id, action: actionFor(candidate) }));
}
