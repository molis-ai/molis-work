import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// Keep the ledger's current caller-error classification at the common transport.
export const ledgerErrors = defineErrorCodes("context_ledger", {
  access_denied: "invalid",
  invalid_reference: "invalid",
  scope_mismatch: "invalid",
  key_conflict: "invalid",
});
