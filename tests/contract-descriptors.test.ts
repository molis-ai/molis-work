import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { ContractDescriptor } from "@molis-ai/molis-work-contracts/platform/package";
import { BLUEPRINTS_PROVIDER_ID, blueprintsErrors, servicesBlueprintsContract } from "@molis-ai/molis-work-contracts/services/blueprints";
import { servicesHomeContract } from "@molis-ai/molis-work-contracts/services/home";
import { servicesSessionsContract } from "@molis-ai/molis-work-contracts/services/sessions";
import { servicesSurfaceCompositionContract } from "@molis-ai/molis-work-contracts/services/surface-composition";

// The contracts whose provider is a later batch (scene/page, scenes, Sessions). Each says so in its descriptor, so a reader
// (and the interface) can tell a declared contract from a running service; and the scene owner's refusals are declared once, because
// callers and the future system.blueprints provider have to tell them apart (specs/scene-and-page-contract/spec.md, error model).

const later: ReadonlyArray<[string, ContractDescriptor]> = [
  ["services/home", servicesHomeContract],
  ["services/blueprints", servicesBlueprintsContract],
  ["services/sessions", servicesSessionsContract],
];
const root = join(import.meta.dirname, "..");

// Batch 15 implemented the composition service (`system.surfaces` in horizontal/surfaces): its contract is partial, not contract-only.
test("the composition contract says its provider runs now, and names an SSOT that exists", () => {
  assert.equal(servicesSurfaceCompositionContract.kind, "service");
  assert.equal(servicesSurfaceCompositionContract.maturity, "partial");
  assert.ok(existsSync(join(root, servicesSurfaceCompositionContract.ssot)));
});

test("the contract-first services say so in their descriptor, and each names an SSOT that exists", () => {
  for (const [name, descriptor] of later) {
    assert.equal(descriptor.kind, "service", name);
    assert.equal(descriptor.maturity, "contract-only", `${name} is declared before its provider exists`);
    assert.ok(existsSync(join(root, descriptor.ssot)), `${name}: ${descriptor.ssot} does not exist`);
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
