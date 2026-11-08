import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";

export const accountErrors = defineErrorCodes("account", {
  invalid_request: "invalid", invalid_configuration: "invalid", forbidden: "forbidden",
  login_required: "forbidden", conflict: "conflict", not_found: "not_found",
  rate_limited: "rate_limited", unavailable: "unavailable", upstream_invalid: "upstream",
  cancelled: "cancelled", timeout: "timeout",
});
