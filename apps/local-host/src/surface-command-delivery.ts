import { ActionError, requireSynchronous, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { sameReference } from "./contextual/contextual-service.js";

/** Dispatch asks once at admission; the original command asks again at beforeEffect. An allowed effect can outlive its reply. */
export function observeSurfaceCommand(caller: ActionCallContext, reference: ActionReference) {
  let admitted = false, effectChecked = false, effectAllowed = false;
  const observed = {
    ...caller,
    async validate_authority(target: ActionReference) {
      await caller.validate_authority?.(target);
      if (sameReference(target, reference)) { effectChecked ||= admitted; admitted = true; }
    },
    assert_authority_current(target?: ActionReference, permissions?: readonly string[]) {
      requireSynchronous(caller.assert_authority_current?.(target, permissions));
      if (effectChecked && target && sameReference(target, reference)) effectAllowed = true;
    },
  };
  return { caller: observed, mayHaveWritten(error: unknown) {
    return effectAllowed || error instanceof ActionError
      && (error.code === "actions.output_invalid_after_effect" || error.code === "actions.outcome_unknown");
  } };
}
