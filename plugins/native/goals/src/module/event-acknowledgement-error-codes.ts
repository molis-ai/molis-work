import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

const goals_event_acknowledgement = defineErrorCodes("goals.event_acknowledgement", {
  cursor_before_reference: "invalid",
  cursor_invalid: "invalid",
  reference_kind: "invalid",
  reference_missing: "not_found",
});

export const acknowledgementErrors = {
  "goals.event_acknowledgement.cursor_before_reference": goals_event_acknowledgement.cursor_before_reference,
  "goals.event_acknowledgement.cursor_invalid": goals_event_acknowledgement.cursor_invalid,
  "goals.event_acknowledgement.reference_kind": goals_event_acknowledgement.reference_kind,
  "goals.event_acknowledgement.reference_missing": goals_event_acknowledgement.reference_missing,
} as const;
