import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import test from "node:test";

import { EvidenceVerificationModule } from "@molis-ai/molis-work-module-evidence-verification";
import { DEMO_BOARD_ID, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { materializeGoalEventV35Fixture } from "./goal-event-v35-fixture.js";
import { insertHistoricalEvidence, insertHistoricalEvidenceCorrection } from "./historical-sql-fixture.js";

// Locator/file-path reading replacements (do not duplicate here):
// tests/v1.test.ts — Markdown anchor preflight, external file URI, registered worktree
// tests/artifact-clipboard.e2e.test.ts — real Chrome copy of the exact Unicode locator

test("Evidence public query reads historical records, corrections and project references", () => {
  const fixture = materializeGoalEventV35Fixture("legacy");
  const store = new LocalProjectDatabase(fixture.path);
  try {
    const evidence = new EvidenceVerificationModule({ db: store.db });
    const originalId = "evidence-3aaba898-2eb4-4565-acbb-13cccced105f";
    const listed = evidence.query.listEvidence(DEMO_BOARD_ID);
    const original = listed.find((item) => item.evidence_id === originalId);
    assert.ok(original);
    assert.deepEqual(evidence.query.getEvidence(DEMO_BOARD_ID, originalId), original);
    assert.equal(original.goal_id, "CORE");
    assert.equal(original.locator, "command://pnpm-test");
    assert.equal(original.result, "passed");
    assert.equal(original.producer_actor_id, "runtime-core");
    assert.deepEqual(original.criterion_ids, ["CORE-C1"]);
    const submitted = store.db.prepare(
      "SELECT seq FROM events WHERE board_id = ? AND object_id = ? AND type = 'evidence.submitted' ORDER BY seq DESC LIMIT 1",
    ).get(DEMO_BOARD_ID, originalId) as { seq: number } | undefined;
    assert.ok(submitted);
    const review = evidence.query.getReviewReference(originalId);
    assert.ok(review);
    assert.equal(review.evidence.evidence_id, originalId);
    assert.equal(review.submitted_event_seq, submitted.seq);
    assert.deepEqual(review.evidence, original);
    const reference = evidence.query.getProjectReferenceSource(DEMO_BOARD_ID, originalId);
    assert.equal(reference?.evidence_id, originalId);
    assert.equal(reference?.locator, original.locator);

    insertHistoricalEvidence(store.db, {
      evidence_id: "evidence-historical-replacement",
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      producer_actor_id: "runtime-core",
      kind: "test",
      locator: "command://replacement-check",
      result: "failed",
      criterion_ids: ["CORE-C1"],
    });
    insertHistoricalEvidenceCorrection(store.db, {
      correction_id: "correction-historical-core",
      board_id: DEMO_BOARD_ID,
      goal_id: "CORE",
      target_evidence_id: originalId,
      action: "supersede",
      replacement_evidence_id: "evidence-historical-replacement",
      actor_id: "runtime-core",
      reason: "the first check was invalid",
    });
    const corrected = evidence.query.getEvidence(DEMO_BOARD_ID, originalId);
    assert.equal(corrected?.lifecycle_state, "superseded");
    assert.equal(corrected?.correction?.action, "supersede");
    assert.equal(corrected?.correction?.replacement_evidence_id, "evidence-historical-replacement");
    assert.deepEqual(
      evidence.query.listCorrections(DEMO_BOARD_ID).find((item) => item.target_evidence_id === originalId),
      corrected?.correction,
    );
    const replacement = evidence.query.getEvidence(DEMO_BOARD_ID, "evidence-historical-replacement");
    assert.equal(replacement?.lifecycle_state, "effective");
    assert.equal(replacement?.result, "failed");
  } finally {
    store.close();
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
