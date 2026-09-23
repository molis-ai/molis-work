import type { LensCompatibilityKey } from "./lens.js";

export type ClaimStatus = "supported" | "tentative" | "disputed" | "unknown";

export interface Evidence {
  id: string;
  sourceId: string;
  sourceType: "official" | "user_signal" | "independent_analysis" | "repository";
  title: string;
  url: string;
  excerpt: string;
  capturedAt: string;
  contentHash: string;
}

export interface Claim {
  id: string;
  label: string;
  status: ClaimStatus;
  conclusion: string;
  rationale: string;
  supportingEvidenceIds: readonly string[];
  counterEvidenceIds: readonly string[];
  unknowns: readonly string[];
  changeConditions: readonly string[];
}

export interface LensReport {
  id: string;
  runId: string;
  revision: number;
  key: LensCompatibilityKey;
  status: "completed" | "partial";
  runtimeLabel: string;
  summary: string;
  judgments: readonly Claim[];
  createdAt: string;
}
