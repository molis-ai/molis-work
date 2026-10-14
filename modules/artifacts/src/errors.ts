import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

// Keep the current HTTP classification while removing the Host-selected error factory (W3-02-I1).
export const artifactErrors = defineErrorCodes("artifacts.artifact", {
  board_mismatch: "invalid",
  content_invalid: "invalid",
  digest_invalid: "invalid",
  hash_mismatch: "invalid",
  input_invalid: "invalid",
  metadata_invalid: "invalid",
  not_found: "invalid",
  not_owner: "invalid",
  origin_invalid: "invalid",
  owner_invalid: "invalid",
  payload_invalid: "invalid",
  producer_mismatch: "invalid",
  scope_invalid: "invalid",
  supersession_invalid: "invalid",
  supersession_missing: "invalid",
  team_share_not_authorized: "invalid",
  type_undeclared: "invalid",
  version_conflict: "invalid",
  version_not_increasing: "invalid",
});
