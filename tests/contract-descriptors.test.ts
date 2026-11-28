import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { integrationLiveFailure } from "@molis-ai/molis-work-contracts/platform/plugin";
import { BLUEPRINTS_PROVIDER_ID, blueprintsErrors, servicesBlueprintsContract } from "@molis-ai/molis-work-contracts/services/blueprints";
import { servicesHomeContract } from "@molis-ai/molis-work-contracts/services/home";
import { SEARCH_PROVIDER_UNAVAILABLE } from "@molis-ai/molis-work-contracts/services/search";
import { servicesSessionsContract } from "@molis-ai/molis-work-contracts/services/sessions";
import { servicesSurfaceCompositionContract } from "@molis-ai/molis-work-contracts/services/surface-composition";

const root = join(import.meta.dirname, "..");

test("composition, external sessions, scene adoption and home identify their running providers and SSOT", () => {
  const contracts = [servicesSurfaceCompositionContract, servicesSessionsContract, servicesBlueprintsContract, servicesHomeContract];
  assert.ok(contracts.length > 0);
  for (const contract of contracts) {
    assert.equal(contract.kind, "service");
    assert.equal(contract.maturity, "partial");
    assert.ok(existsSync(join(root, contract.ssot)), contract.ssot);
  }
});

test("the scene owner declares the four refusals the spec names, once", () => {
  const kinds: ReadonlyArray<[string, string]> = [
    ["part_unsupported", "invalid"],
    ["step_conflict", "conflict"],
    ["dependency_unmet", "unavailable"],
    ["preview_expired", "not_found"],
  ];
  assert.deepEqual(Object.keys(blueprintsErrors).sort(), kinds.map(([name]) => name).sort());
  for (const [name, kind] of kinds) {
    const error = blueprintsErrors[name as keyof typeof blueprintsErrors]("合同测试");
    assert.equal(error.code, `blueprints.${name}`);
    assert.equal(error.kind, kind, `blueprints.${name}`);
  }
  assert.equal(BLUEPRINTS_PROVIDER_ID, "system.blueprints");
});

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
