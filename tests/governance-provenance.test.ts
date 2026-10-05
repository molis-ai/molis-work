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
