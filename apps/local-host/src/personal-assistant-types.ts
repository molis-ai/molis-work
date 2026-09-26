import type { ActionCallContext, ActionClient, ActionReference, ActionSubject, ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import type { HomeActionOffer } from "./home-offer-actions.js";

export type AssistantCategory = "requirement_change" | "follow_up" | "risk";
export type AssistantStatus = "ready" | "snoozed" | "dismissed" | "expired" | "executing" | "needs_check" | "completed";
export interface AssistantPreferences {
  revision: number; enabled: boolean; disabled_categories: AssistantCategory[];
  quiet_until: string | null; max_visible: number; instructions: string;
  character: ArtifactReference | null;
}
export const DEFAULT_ASSISTANT_PREFERENCES: AssistantPreferences = {
  revision: 0, enabled: true, disabled_categories: [], quiet_until: null, max_visible: 1, instructions: "", character: null,
};
export interface AssistantSource { source_id: string; name: string; connection_id: string | null; external_id: string | null; source_revision: string; authorization_revision: string | null; occurred_at: string; observed_at: string }
export interface AssistantMaterial {
  key: string; role: "change" | "project"; context: ActionSubjectContext; reader: ActionReference; source: AssistantSource | null;
}
export interface AssistantEvidence { material_key: string; quote: string }
export interface AssistantResult { title: string; result: unknown }
export interface AssistantSuggestion {
  id: string; revision: number; fingerprint: string; proposal_key: string; request_id: string; status: AssistantStatus;
  title: string; reason: string; category: AssistantCategory; evidence: AssistantEvidence[];
  materials: AssistantMaterial[]; subject: ActionSubject; offer: HomeActionOffer;
  created_at: string; expires_at: string; remind_at: string | null;
  character: ArtifactReference | null; character_title: string; result: AssistantResult | null; issue: string | null;
}
export interface AssistantAssessment {
  outcome: "suggested" | "nothing_to_do" | "needs_review" | "quiet";
  suggestions: AssistantSuggestion[]; message: string;
}
export interface AssistantAnalysisInput {
  current_time: string;
  materials: AssistantMaterial[]; offers: Array<{ key: string; title: string; subject: ActionSubject }>;
  instructions: string; character: ArtifactReference | null;
}
/** Host composition supplies the existing Prologue run, never a vendor completion fallback. */
export interface AssistantAnalysisPort {
  /** Host-only guard: re-run after preparation and immediately before model dispatch; never serialize it with materials. */
  analyze(input: AssistantAnalysisInput, caller: ActionCallContext, beforeDispatch: () => Promise<void>): Promise<{ text: string; character_title: string; runtime: "prologue" }>;
}
export interface PersonalAssistantPorts {
  actions: ActionClient; analysis: AssistantAnalysisPort;
  home_provider_id: string;
  /** Host verifies current source/connection authorization; internal materials return null. */
  inspectMaterial: (subject: ActionSubject, caller: ActionCallContext) => Promise<AssistantSource | null>;
  /** Reuse owner returns stable original subjects; facts/methods remain in their owning module. */
  reuseSubjects?: (input: { materials: AssistantMaterial[]; instructions: string }, caller: ActionCallContext) => Promise<ActionSubject[]>;
  /** Original business owner can recover a completed request after a disconnected response. Must recheck original result-read authority through ActionClient. Never re-executes. */
  recover?: (requestId: string, offer: HomeActionOffer, caller: ActionCallContext) => Promise<AssistantResult | null>;
}
