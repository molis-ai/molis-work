import { createHash } from "node:crypto";
import { ActionError, bindActionHandler, type ActionHandlerBinding, type InferActionInput } from "@molis-ai/molis-work-contracts/platform/actions";
import type { TrustedReviewOffer } from "@molis-ai/molis-work-contracts/services/project-approvals";
import type { ReviewTarget } from "@molis-ai/molis-work-contracts/platform/ui";
import { canonicalJsonText, isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { goalEntryActions, type GoalDecisionActionInput } from "./contract/goal-actions.js";
import type { GoalTreeProposalDecideInput, GoalTreeProposalRecord } from "./contract/governance-collaboration.js";
import type { GoalEventDecisionRequestView, GoalEventStateView } from "./contract/goals.js";

type TreeDraft = Omit<GoalTreeProposalDecideInput, "authority" | "project_id" | "runtime_actor_id">;
type Request = InferActionInput<typeof import("@molis-ai/molis-work-contracts/services/project-approvals").TRUSTED_REVIEW_OWNER_DRAFT_INPUT_SCHEMA>;
type Owner = ReviewTarget["owner"];
type Choice = TrustedReviewOffer["request"]["choices"][number];
const missing = () => new ActionError("actions.missing", "找不到本项目的原目标或待审提案");
const stale = () => new ActionError("actions.conflict", "目标或提案内容已变化，请刷新后再审");
const version = (facts: unknown) => createHash("sha256").update(canonicalJsonText(facts, "null")).digest("hex");

export function eventDecisionVersion(state: GoalEventStateView): string {
  return version([state.goal_id, state.goal_event_cursor, state.intent.title, state.config.version,
    state.agreement, state.work_status, state.can_record, state.pending_decisions,
    state.requirements.map(row => [row.requirement_id, row.bound_type_ids]),
    state.concerns.map(row => [row.concern_id, row.title, row.statement, row.status])]);
}

export function treeDecisionVersion(proposal: GoalTreeProposalRecord): string {
  return version([proposal.proposal_id, proposal.version, proposal.state, proposal.summary, proposal.narrative, proposal.items]);
}

function option(id: string, label: Choice["label"], available: boolean, accepts: readonly string[] = [], returns: readonly string[] = []): Choice {
  return { id, label, accepts, returns, availability: available ? { available: true }
    : { available: false, code: "actions.conflict", reason: { literal: "这项决定当前已经不可用" } } };
}

/**
 * A Goal decision accepts or returns no requirement: that is the platform's own review card (`acceptance.decide@1`, contract-design §10.3),
 * so Goals' card lists none. A scope's requirement ids are still checked for shape.
 */
function draftReview(request: GoalEventDecisionRequestView | null, command: GoalDecisionActionInput) {
  const ids = command.scope?.requirement_ids ?? request?.scope.requirement_ids ?? [];
  if (!Array.isArray(ids) || ids.some(id => typeof id !== "string") || command.scope && !isRecord(command.scope)) throw missing();
  return { requirements: [], accepts: [], returns: [] };
}

function eventOffer(input: Request, readState: (id: string) => GoalEventStateView, goalForRequest: (id: string) => string | null): TrustedReviewOffer {
  const draft = input.draft as (GoalDecisionActionInput & { observed_version?: string }) | undefined;
  const goalId = draft?.goal_id ?? goalForRequest(input.request_id);
  if (typeof goalId !== "string" || !goalId.trim()) throw missing();
  const state = readState(goalId);
  const target = { subject: { kind: "goal", id: state.goal_id }, version: eventDecisionVersion(state) };
  const request = state.pending_decisions.find(row => row.request_id === (draft?.request_id ?? input.request_id)) ?? null;
  if (draft) {
    if (draft.observed_version !== undefined && draft.observed_version !== target.version) throw stale();
    if (input.request_id !== (draft.request_id ?? draft.idempotency_key)) throw missing();
    const { observed_version: _, ...command } = draft;
    const label = request?.options.find(row => row.option_id === command.selected_option_id)?.label ?? command.conclusion;
    if (typeof label !== "string" || !label.trim()) throw new ActionError("actions.input_invalid", "请给出本人决定的结论");
    const { requirements, accepts, returns } = draftReview(request, command);
    return { target, request: { summary: request?.question ?? state.intent.title, requirements, approver: { kind: "person" },
      choices: [option("apply", { literal: label }, state.can_record && (!!request || !draft.request_id), accepts, returns)], expires_at: null },
    commands: { apply: command } };
  }
  if (!request) throw missing();
  const select = request.purpose === "agreement_change" ? [
    { id: "authorize", label: "批准约定变更", effects: [{ kind: "authorize_agreement_change" }] },
    { id: "deny", label: "拒绝约定变更", effects: [{ kind: "deny_action", action: request.scope.action ?? "set_agreement" }] },
  ] : request.options.map(row => ({ id: row.option_id, label: row.label, effects: undefined }));
  // Business options carry words and impact. Only this owner's explicit agreement-change alternatives define their effect.
  const explicitEffects = request.purpose === "agreement_change" || !request.scope.requirement_ids.length && !request.scope.concern_ids.length && !request.scope.action;
  const choices = select.map(row => {
    const choice = option(row.id, { literal: row.label }, state.can_record && explicitEffects);
    return explicitEffects ? choice : { ...choice, availability: { available: false as const, code: "actions.input_invalid",
      reason: { literal: "请先选择决定的具体作用范围和效果" } } };
  });
  return { target, request: { summary: request.question, requirements: [], approver: { kind: "person" }, choices, expires_at: null },
    commands: explicitEffects ? Object.fromEntries(select.map(row => [row.id, { goal_id: goalId, request_id: request.request_id,
      ...(row.effects ? { effects: row.effects } : { selected_option_id: row.id }),
      conclusion: row.label, idempotency_key: request.request_id, scope: request.scope }])) : {} };
}

function treeOffer(input: Request, readProposal: (id: string) => GoalTreeProposalRecord, owner: Owner): TrustedReviewOffer {
  const draft = input.draft as (TreeDraft & { observed_version?: string }) | undefined;
  const proposalId = draft?.proposal_id ?? input.request_id;
  if (typeof proposalId !== "string" || !proposalId.trim()) throw missing();
  const proposal = readProposal(proposalId);
  const target = { subject: { kind: "goal-tree-proposal", id: proposal.proposal_id }, version: treeDecisionVersion(proposal) };
  const pending = proposal.items.filter(row => row.state === "pending");
  const undecided = proposal.items.filter(row => row.state === "pending" || row.state === "conflict");
  const canDecide = ["pending", "partially_applied"].includes(proposal.state) && undecided.length > 0;
  const requirements = undecided.map(item => ({
    id: item.item_id, version: version(item),
    target: { owner, subject: { kind: "goal-tree-item", id: item.item_id }, version: version(item) },
    statement: item.reason, requires_person: true, evidence: [],
  }));
  if (draft) {
    if (draft.observed_version !== undefined && draft.observed_version !== target.version) throw stale();
    if (input.request_id !== draft.idempotency_key) throw missing();
    const { observed_version: _, ...command } = draft;
    const whole = command.confirm_all_pending === true;
    const items = Array.isArray(command.decisions) ? command.decisions : [];
    const accepted = whole ? pending.map(item => item.item_id) : items.filter(row => row?.decision === "confirm").map(row => row.item_id);
    const returned = items.filter(row => row?.decision === "reject" || row?.decision === "revise").map(row => row.item_id);
    return { target, request: { summary: proposal.summary, requirements, approver: { kind: "person" },
      choices: [option("apply", { literal: whole ? "确认整份目标树提案" : "提交这些条目的决定" },
        canDecide && (!whole || pending.length === proposal.items.length), accepted, returned)], expires_at: null },
    commands: { apply: command }, ...(whole ? { whole_choices: ["apply"] } : {}) };
  }
  return { target, round_id: target.version, request: { summary: proposal.summary, requirements, approver: { kind: "person" },
    choices: [option("confirm", { literal: "确认整份目标树提案" }, canDecide && pending.length === proposal.items.length, pending.map(item => item.item_id)),
      option("return", { literal: "退回仍未决定的条目" }, canDecide, [], undecided.map(item => item.item_id))], expires_at: null },
  commands: {
    confirm: { proposal_id: proposalId, confirm_all_pending: true, reason: "本人确认整份提案", idempotency_key: target.version },
    return: { proposal_id: proposalId, decisions: undecided.map(item => ({ item_id: item.item_id, decision: "reject", reason: "本人退回条目" })),
      idempotency_key: target.version },
  }, whole_choices: ["confirm"] };
}

export function goalsDecisionOfferHandlers(readState: (id: string) => GoalEventStateView,
  readProposal: (id: string) => GoalTreeProposalRecord, goalForRequest: (id: string) => string | null, owner: Owner): ActionHandlerBinding[] {
  return [
    bindActionHandler(goalEntryActions.eventReview, input => eventOffer(input, readState, goalForRequest)),
    bindActionHandler(goalEntryActions.treeReview, input => treeOffer(input, readProposal, owner)),
  ];
}
