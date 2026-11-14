import { createHash } from "node:crypto";
import type { Effect } from "@prologue/sdk";
import type { ReviewReference } from "@molis-ai/molis-work-contracts/services/agent-host";
import { REVIEW_DECISION_SCHEMA_VERSION, ReviewDecisionStore, reviewProposalVersion } from "../review-decisions.js";
import { agentErrors } from "../errors.js";
import type { PrologueEffects } from "./prologue-effects.js";

const FIRST_COMMIT = 1; // A decision is written once, against an absent record.

/** SDK ledger revisions advance when answered; only original identity and frozen proposal participate. */
export function prologueReviewReference(owner: Omit<ReviewReference["owner"], "kind">, id: string, effect: Effect, scope?: unknown, pendingId = effect.pending?.ref.id): ReviewReference {
  if (!pendingId) throw agentErrors.review_unreadable("原操作缺少待批身份");
  const { kind, subject, reviewRef, inputFingerprint, origin } = effect.proposal;
  let input = subject.what === "tool" ? subject.input : undefined;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { /* Non-JSON original tool input remains exact text. */ }
  }
  const fixedOwner = { kind: "agent-review" as const, project_id: owner.project_id, plugin_id: owner.plugin_id, install_id: owner.install_id };
  return { owner: fixedOwner, id, version: reviewProposalVersion({ owner: fixedOwner, id,
    effect_id: effect.ref.id, pending_id: pendingId,
    proposal: { kind, subject: subject.what === "tool" ? { ...subject, input } : subject, reviewRef, inputFingerprint, origin }, scope }) };
}

/** Separate from the SDK session index and Git recovery projections; no historical format is rewritten. */
export function createPrologueReviewDecisions(effects: PrologueEffects, appId: string): ReviewDecisionStore {
  const kind = `molis-review-decision-${createHash("sha256").update(appId).digest("hex").slice(0, 24)}`;
  const { storage } = effects.host;
  return new ReviewDecisionStore({
    withControl: (control, work) => effects.call({ beforeEffect: control.beforeEffect, assert_current: control.assertCurrent }, work),
    async read(id) {
      const record = await storage.get({ kind, id });
      if (!record) return undefined;
      if (record.tombstoned || record.version !== FIRST_COMMIT || record.metadata.schema !== REVIEW_DECISION_SCHEMA_VERSION) throw agentErrors.review_unreadable("批准决定的存储记录不可读，不能重新决定");
      const bytes = await storage.readSecure({ kind, id });
      try { return JSON.parse(new TextDecoder().decode(bytes)); }
      finally { bytes.fill(0); }
    },
    async create(id, value, control) {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      try {
        await effects.call({ beforeEffect: control.beforeEffect, assert_current: control.assertCurrent }, async () => {
          await storage.commit({ kind, id, expectedVersion: 0, metadata: { schema: REVIEW_DECISION_SCHEMA_VERSION }, secureBody: bytes });
        });
      } finally { bytes.fill(0); }
    },
  });
}
