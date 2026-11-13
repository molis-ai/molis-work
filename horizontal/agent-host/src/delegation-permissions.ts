import type { AgentDelegationMode, AgentDelegationSelection, AgentDelegationState, AgentDelegationSubject } from "@molis-ai/molis-work-contracts/services/agent-host";
import { currentDelegation, delegationModeRank } from "./delegation-state.js";

export interface WorkDelegationPermission {
  /** The actual work epoch captured with this permission, including when the selected grant is ongoing. */
  readonly work_epoch: string;
  readonly mode: AgentDelegationMode | "original";
  /** Only automatic has a reusable source. Confirm/read-only never borrow an old scope. */
  readonly automatic: { readonly state: AgentDelegationState; readonly selection: AgentDelegationSelection } | null;
  /** Original work AND ongoing limits, including unset choices. The owner alone maintains this synchronous fence. */
  assertCurrent(): void;
}

export function ongoingDelegationSubject(subject: AgentDelegationSubject): AgentDelegationSubject {
  return { kind: "ongoing", actor_id: subject.actor_id, project_id: subject.project_id, executor: structuredClone(subject.executor) };
}

/** An expired/revoked choice remains a choice. It must never restore an older policy or ongoing permission. */
function mode(selection: AgentDelegationSelection | undefined, now: number): AgentDelegationMode | undefined {
  if (!selection) return undefined;
  if (selection.mode !== "automatic") return selection.mode;
  return selection.revoked_at !== null || !selection.scopes.length || selection.expires_at !== null && Date.parse(selection.expires_at) <= now ? "confirm" : "automatic";
}

export function workDelegationPermission(work: AgentDelegationState, ongoing: AgentDelegationState | undefined, now: number): Omit<WorkDelegationPermission, "assertCurrent" | "work_epoch"> {
  const current = currentDelegation(work), persistent = currentDelegation(ongoing);
  const currentMode = mode(current, now), ongoingMode = mode(persistent, now);
  const strongest = [currentMode, ongoingMode].filter((value): value is AgentDelegationMode => value !== undefined)
    .sort((left, right) => delegationModeRank(right) - delegationModeRank(left))[0];
  if (!strongest) return { mode: "original", automatic: null };
  if (strongest !== "automatic") return { mode: strongest, automatic: null };
  const state = current ? work : ongoing!, selection = current ?? persistent!;
  return { mode: "automatic", automatic: { state, selection } };
}
