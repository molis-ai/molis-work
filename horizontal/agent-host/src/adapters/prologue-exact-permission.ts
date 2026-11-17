import { isDeepStrictEqual } from "node:util";
import { canonicalJsonText, redactSecrets } from "@molis-ai/molis-work-plugin-sdk";
import type { AgentExactDelegationScope, ReviewDecisionSource } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { ReviewDecisionControl } from "../review-decisions.js";
import type { PrologueWorkDelegation } from "./prologue-work-delegation.js";

export interface ExactPermission {
  readonly scope: AgentExactDelegationScope;
  readonly title: string;
  readonly control: ReviewDecisionControl;
  readonly work: PrologueWorkDelegation;
}

/** The exact proposal comes from the effect owner. Lossy or secret-bearing input has no reusable scope. */
export function reusableInput(input: unknown): string | undefined {
  try {
    const text = canonicalJsonText(input);
    if (text && text.length <= 12_000 && redactSecrets(text) === text && isDeepStrictEqual(JSON.parse(text), input)) return text;
  } catch { /* Unrepresentable values require the original review. */ }
}

export function matchExactPermission(held: ExactPermission, retain: (control: ReviewDecisionControl) => void) {
  const { scope, control, work } = held;
  const permission = work.permission, automatic = permission.automatic;
  if (permission.mode !== "automatic" || !automatic?.selection.scopes.some(row => isDeepStrictEqual(row, scope))) return undefined;
  const assertCurrent = () => { work.assertCurrent(); control.assertCurrent(); };
  const source: Extract<ReviewDecisionSource, { kind: "delegation" }> = { kind: "delegation", delegation: {
    id: automatic.selection.id, revision: automatic.selection.revision, work_epoch: permission.work_epoch, grantor_id: automatic.selection.granted_by,
  } };
  return { source, assertCurrent, beforeEffect: control.beforeEffect, activate: () => { assertCurrent(); retain(control); } };
}
