import assert from "node:assert/strict";
import test from "node:test";
import { integrationLiveFailure } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SEARCH_PROVIDER_UNAVAILABLE } from "@molis-ai/molis-work-contracts/services/search";

// F5/F6 of the 2026-11-11 code-quality review: the failed-live-sync result (catalog and GitHub providers) and the
// unavailable-provider search refusal (Host route and RSS integration) are contract values, defined once.

test("a failed live integration sync result has one shape for every provider", () => {
  assert.deepEqual(integrationLiveFailure("network", "offline"), {
    ok: false, mode: "live", failure: "network", message: "offline",
    action: undefined, httpStatus: undefined, retryAfterAt: undefined,
  });
  assert.deepEqual(integrationLiveFailure("rate_limited", "slow down", { action: "wait", httpStatus: 429, retryAfterAt: "2026-11-12T00:00:00.000Z" }), {
    ok: false, mode: "live", failure: "rate_limited", message: "slow down",
    action: "wait", httpStatus: 429, retryAfterAt: "2026-11-12T00:00:00.000Z",
  });
});

test("the unavailable-provider search refusal is one contract value both route resolvers throw with", () => {
  assert.deepEqual(SEARCH_PROVIDER_UNAVAILABLE, {
    code: "provider_unavailable", retryable: false, sideEffectState: "none", recoveryAction: "change_provider",
  });
});
