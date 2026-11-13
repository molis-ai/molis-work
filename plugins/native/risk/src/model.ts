import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";

export const RISK_STATUSES = ["open", "mitigating", "accepted", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const RISK_LEVELS = ["high", "medium", "low"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];
export const RISK_EVENT_KINDS = ["created", "updated", "status", "note", "linked", "unlinked"] as const;
export type RiskEventKind = (typeof RISK_EVENT_KINDS)[number];
/** The fields a person edits; each change is one `updated` event naming the fields, never their old or new words. */
export const RISK_EDIT_FIELDS = ["title", "statement", "impact", "likelihood", "treatment", "owner_name"] as const;
export type RiskEditField = (typeof RISK_EDIT_FIELDS)[number];

export const RISK_LIMITS = { title: 200, statement: 8000, treatment: 8000, owner_name: 80, note: 4000, links: 20 } as const;

export interface RiskRecord {
  risk_id: string;
  title: string;
  statement: string;
  impact: RiskLevel;
  likelihood: RiskLevel;
  treatment: string;
  owner_name: string | null;
  status: RiskStatus;
  revision: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

/** An object the risk is about (a Goal, a Coding session, a Feed message, a 成果): its owner's kind and id, nothing copied. */
export interface RiskLink { subject: ActionSubject; added_by: string; added_at: string }

export interface RiskEvent {
  event_id: string;
  kind: RiskEventKind;
  /** Plain values only: the new status, the fields changed, the note as written, the object linked. Never a translated sentence. */
  detail: { status?: RiskStatus; previous_status?: RiskStatus; fields?: RiskEditField[]; text?: string; subject?: ActionSubject };
  actor_id: string;
  at: string;
}

/** A row of the overview: the risk and what it is linked to, read together in one statement. */
export interface RiskRow extends RiskRecord { links: ActionSubject[] }

export interface RiskListFilter {
  status?: "open" | "closed" | "all";
  impact?: RiskLevel;
  owner_name?: string;
  goal_id?: string;
  unlinked?: boolean;
}

/** How serious a risk is, by where it sits on the impact × likelihood grid. */
export function riskSeverity(risk: Pick<RiskRecord, "impact" | "likelihood">): "high" | "medium" | "low" {
  const score = (level: RiskLevel) => (level === "high" ? 3 : level === "medium" ? 2 : 1);
  const product = score(risk.impact) * score(risk.likelihood);
  return product >= 6 ? "high" : product >= 3 ? "medium" : "low";
}
