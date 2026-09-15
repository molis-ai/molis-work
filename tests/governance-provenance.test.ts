import assert from "node:assert/strict";
import test from "node:test";
import { GovernanceError, GovernanceProvenance } from "@molis-ai/molis-work-module-governance-collaboration";
import type { ContractFieldSource, ContractProposalRecord, LegacyGovernanceSnapshot } from "@molis-ai/molis-work-contracts/modules/governance-collaboration";

const provenance = new GovernanceProvenance();
const source = (field: ContractFieldSource["field"]): ContractFieldSource => ({ field, source_kind: "user_answer",
  source_refs: ["clarification-turn:original"], confidence: 1, rationale: "Explicit user requirement",
  status: "proposed", requires_user_confirmation: true });

test("native proposal provenance sorts sources and rejects premature confirmation without changing input", () => {
  const input = { source_refs: [" repo:z ", "message:a", "repo:z", " "], reason: " User requirement ", confidence: 0 };
  const before = structuredClone(input);
  assert.deepEqual(provenance.normalizeProposalSource(input, 2), {
    source_refs: ["message:a", "repo:z"], reason: "User requirement", confidence: 0, requires_user_confirmation: true,
  });
  assert.deepEqual(input, before);
  assert.equal(provenance.normalizeProposalSource({ ...input, confidence: 1, requires_user_confirmation: true }, 0).confidence, 1);
  const cases = [
    { input: { ...input, source_refs: [" "] }, code: "goal_tree_proposal.source_required", message: "第 3 个条目至少需要一个来源引用" },
    { input: { ...input, reason: " " }, code: "goal_tree_proposal.reason_required", message: "第 3 个条目必须说明业务理由" },
    ...[-1, 2, NaN, Infinity].map((confidence) => ({ input: { ...input, confidence },
      code: "goal_tree_proposal.confidence_invalid", message: "第 3 个条目的置信度必须在 0 到 1 之间" })),
    { input: { ...input, requires_user_confirmation: false }, code: "goal_tree_proposal.user_confirmation_required",
      message: "Goal Tree 提案的每个条目都必须等待用户确认，不能提前物化为正式事实" },
  ];
  for (const entry of cases) assert.throws(() => provenance.normalizeProposalSource(entry.input, 2), (error) => {
    assert.ok(error instanceof GovernanceError);
    assert.equal(error.code, entry.code);
    assert.equal(error.message, entry.message);
    return true;
  });
});

test("malformed proposal sources report all missing facts without inventing confidence or provenance", () => {
  assert.throws(() => provenance.normalizeProposalSource({ reason: "已讨论的方案" } as never, 0), error => {
    assert.ok(error instanceof GovernanceError);
    assert.deepEqual((error.details.issues as Array<{ path: string }>).map(issue => issue.path), ["items[0].source_refs", "items[0].confidence"]);
    return true;
  });
});

test("legacy projections retain sources, minimum confidence, payloads, decisions and distinct state mappings", () => {
  const at = "2026-09-01T00:00:00Z";
  const decidedAt = "2026-09-02T00:00:00Z";
  const proposal: ContractProposalRecord = {
    proposal_id: "old-contract", board_id: "project", goal_id: "goal", submitted_by: "runtime", discovered_in_run_id: "run",
    proposed_goal: { goal_id: "goal", title: "Original goal", outcome: "Original outcome", why: "Reason", business_logic: "Original behavior", acceptance_criteria: [] },
    field_sources: [{ ...source("title"), source_refs: ["repo:z", "message:a"], confidence: 0.8 },
      { ...source("outcome"), source_kind: "runtime_inference", source_refs: ["message:a"], confidence: 0.2 }],
    review_policy: { goal_mode: "preferred", required_capabilities: [], self_verification: true, cross_reviewers: 0,
      adversarial_reviewers: 0, human_approval: false, max_lease_seconds: 60 },
    proposed_impacts: [], proposed_risks: [], dependency_rewire_ids: ["old-rewire"],
    state: "approved", decision: { reason: "User approved" }, created_at: at, decided_at: decidedAt,
  };
  const snapshot: LegacyGovernanceSnapshot = {
    contract_proposals: [proposal, { ...proposal, proposal_id: "empty-history", field_sources: [], state: "pending", decided_at: null }],
    candidates: [{ candidate_id: "candidate", board_id: "project", submitted_by: "author", discovered_in_run_id: null,
      proposed_goal: proposal.proposed_goal, proposed_relations: [], proposed_impacts: [], proposed_risks: [],
      blocking_mode: "current_run", state: "dismissed", decision: { reason: "Not needed" }, created_at: at, decided_at: decidedAt }],
    rewires: [{ rewire_id: "rewire", board_id: "project", candidate_id: "candidate",
      proposal: { formal_goal_id: "goal", relations: [{ from_goal_id: "one", to_goal_id: "two" }] },
      impact: { superseded_by_goal_tree_proposal_id: "native-proposal" }, state: "applied", created_at: at, decided_at: decidedAt }],
  };
  const original = structuredClone(snapshot);
  const result = provenance.legacyProposalView(snapshot);
  assert.deepEqual(snapshot, original);
  assert.deepEqual(result.map((record) => [record.proposal_id, record.state, record.items[0]!.state]), [
    ["legacy-contract-proposal:old-contract", "approved", "approved"],
    ["legacy-contract-proposal:empty-history", "pending", "pending"],
    ["legacy-candidate:candidate", "dismissed", "dismissed"],
    ["legacy-rewire:rewire", "approved", "applied"],
  ]);
  const item = result[0]!.items[0]!;
  assert.deepEqual(item.source_refs, ["message:a", "repo:z"]);
  assert.equal(item.confidence, 0.2);
  assert.equal(item.requires_user_confirmation, true);
  assert.deepEqual(item.payload, { proposed_goal: proposal.proposed_goal, field_sources: proposal.field_sources,
    review_policy: proposal.review_policy, proposed_impacts: [], proposed_risks: [], dependency_rewire_ids: ["old-rewire"] });
  assert.deepEqual(result[0]!.decision, { reason: "User approved" });
  assert.equal(result[0]!.updated_at, decidedAt);
  assert.equal(item.created_at, at);
  assert.deepEqual(result[1]!.items[0]!.source_refs, ["legacy-contract-proposal:empty-history"]);
  assert.equal(result[1]!.items[0]!.confidence, 1);
  assert.equal(result[1]!.updated_at, at);
  assert.equal(result[2]!.items[0]!.payload.blocking_mode, "current_run");
  assert.equal(result[3]!.submitted_by, "legacy-runtime");
  assert.equal(result[3]!.decision?.superseded_by_goal_tree_proposal_id, "native-proposal");
  for (const state of ["pending", "confirmed", "rejected"] as const) {
    snapshot.rewires[0]!.state = state;
    const view = provenance.legacyProposalView(snapshot)[3]!;
    assert.equal(view.state, state === "confirmed" ? "approved" : state);
    assert.equal(view.items[0]!.state, state === "confirmed" ? "approved" : state);
  }
});
