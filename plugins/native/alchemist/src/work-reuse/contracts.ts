import { z } from "zod";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { Evidence, LensReport } from "../studio/domain/research/report.js";

const id = z.string().trim().min(1).max(500);
const text = z.string().trim().min(1).max(2000);
export const reuseReferenceSchema = z.strictObject({ artifact_id: id, version: z.number().int().positive() });
export const reuseSelectionSchema = z.strictObject({
  artifacts: z.array(z.strictObject({ reference: reuseReferenceSchema, reason: text })).max(12),
  methodIds: z.array(id).max(20),
});
export const reuseMethodSchema = z.strictObject({ id, version: z.number().int().positive(), methodChange: text,
  positiveExamples: z.array(text), negativeExamples: z.array(text) });
const adoptedArtifacts = z.array(z.strictObject({ reference: reuseReferenceSchema, reason: text, title: z.string().optional(), contentUnavailable: z.boolean().optional() })).max(12);
export const reuseSnapshotSchema = z.strictObject({ actorId: id, artifacts: adoptedArtifacts,
  methods: z.array(reuseMethodSchema) });
export const reuseCandidateInputSchema = z.strictObject({ intent: text, directionId: id.optional(), reportId: id.optional(),
  references: z.array(reuseReferenceSchema).max(40).optional() });
export const reuseCandidateSchema = z.strictObject({ reference: reuseReferenceSchema, title: z.string(), sourcePlugin: id,
  createdAt: z.string(), warnings: z.array(z.string()), excerpt: z.string().max(1600) });
export const reuseCandidatesSchema = z.strictObject({ available: z.boolean(), artifacts: z.array(reuseCandidateSchema),
  methods: z.array(reuseMethodSchema), truncated: z.boolean() });
export const reuseAssessInputSchema = reuseCandidateInputSchema.extend({ references: z.array(reuseReferenceSchema).max(12),
  methodIds: z.array(id).max(20), modelId: id.optional() });
export const reuseAssessmentSchema = z.strictObject({ recommendations: z.array(z.strictObject({
  key: id, suitability: z.enum(["applicable", "needs_review", "not_applicable"]),
  reason: text, applicableWhen: z.array(text).min(1).max(8), invalidWhen: z.array(text).min(1).max(8),
  recheck: z.array(text).max(8),
})).max(32), runtimeLabel: z.string() });
export const reuseFeedbackSchema = z.strictObject({ planId: id, explanation: z.string().max(4000), preparation: z.string().max(4000),
  corrections: z.string().max(4000), result: z.string().trim().min(1).max(4000) });
export const reuseReceiptSchema = z.strictObject({ planId: id, runId: id, consumedAt: z.string(),
  artifacts: adoptedArtifacts, methods: z.array(reuseMethodSchema),
  relationState: z.enum(["pending", "recorded", "not_needed"]), feedback: reuseFeedbackSchema.omit({ planId: true }).nullable() });
export const reuseReviseSchema = z.strictObject({ id, expectedVersion: z.number().int().positive(), methodChange: text,
  positiveExamples: z.array(text).max(20), negativeExamples: z.array(text).max(20) });
export type ReuseSelection = z.infer<typeof reuseSelectionSchema>;
export type ReuseSnapshot = z.infer<typeof reuseSnapshotSchema>;
export type ReuseCandidates = z.infer<typeof reuseCandidatesSchema>;
export type ReuseReceipt = z.infer<typeof reuseReceiptSchema>;

/** All callbacks belong to the trusted Host. They must recheck revocable authority,
 * exact version, project and privacy at each read/write. No credential or grant is persisted here. */
export interface WorkReuseHostPort {
  projectId: string;
  /** Original Artifact storage board resolved by the Host; never rewrite Artifact.board_id. */
  boardId: string;
  /** Rebind a trusted Studio/job actor to CURRENT authority, including after restart. */
  callerFor(actorId: string, signal?: AbortSignal): Promise<ActionCallContext>;
  listArtifacts(caller: ActionCallContext): Promise<readonly ArtifactReference[]>;
  readArtifact(caller: ActionCallContext, reference: ArtifactReference): Promise<ArtifactVersionRecord | null>;
  publishReport(caller: ActionCallContext, input: { report: LensReport; evidence: readonly Evidence[]; title: string }): Promise<ArtifactReference>;
  /** Idempotent Context Ledger edges from the exact source versions to this plan/run. */
  linkConsumption(caller: ActionCallContext, input: { planId: string; runId: string; references: readonly ArtifactReference[] }): Promise<void>;
}
