// UPG1-12: the real register. Every store's and file's steps are checked against its version, so the day one goes up with a gap this goes red
// on its own. All are at their first version today and the steps are empty; the test runs anyway. Nothing here opens a Home.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CATALOG_BASELINE, homeStores, homeUpgradeDescriptors, PROJECT_DATABASE_BASELINE, upgradeFingerprint, type HomeUpgradeDescriptor } from "@molis-ai/molis-work-app-local-host";
import { upgradeStepProblems } from "../scripts/gates/initial-versions.mjs";

const stepsOf = (descriptor: HomeUpgradeDescriptor) => "file" in descriptor ? descriptor.file.upgrades : descriptor.baseline.upgrades ?? [];
const versionOf = (descriptor: HomeUpgradeDescriptor) => "file" in descriptor ? descriptor.file.version : descriptor.baseline.version;

/** What the checklist says upgrades, on its own line. The tables inside a project store are plugin tables (U1-f), and an account Home holds the same stores as any other. */
const checklistUpgrades = () => readFileSync(new URL("../docs/releases/CHECKLIST.md", import.meta.url), "utf8").split("\n")
  .filter(line => line.startsWith("| ") && /低版本升级/.test(line))
  .map(line => /^\| [^|]+\| `([^`]+)`/.exec(line)?.[1]).filter((place): place is string => place !== undefined && !place.includes("#"))
  .map(place => place.replace(/^spaces\/<spaceId>\//, "").replace(/<[^>]+>/g, "*"));

test("UPG1-12: every registered store and file has its steps in a row: `from` runs from 1 to version - 1, each once", () => {
  const descriptors = homeUpgradeDescriptors();
  assert.ok(descriptors.length > 20, "the platform's stores are registered as soon as the Host's package is loaded");
  for (const descriptor of descriptors) {
    assert.deepEqual(upgradeStepProblems(versionOf(descriptor), stepsOf(descriptor).map(step => step.from)), [], descriptor.pattern);
    if (!("file" in descriptor)) assert.ok(descriptor.baseline.schema.length > 0, `${descriptor.pattern} has something to compare an upgraded store with`);
  }
});

test("UPG1-12: the process looks after everything the checklist says upgrades, and the catalog comes first", () => {
  const descriptors = homeUpgradeDescriptors(), patterns = new Set(descriptors.map(({ pattern }) => pattern));
  assert.deepEqual(checklistUpgrades().filter(place => !patterns.has(place)), []);
  const first = descriptors[0]!, second = descriptors[1]!;
  assert.equal(first.pattern, join("projects", "catalog.db"));
  assert.ok("baseline" in first && first.baseline === CATALOG_BASELINE);
  assert.ok("baseline" in second && second.baseline === PROJECT_DATABASE_BASELINE);
  for (const store of homeStores().stores) if (store.library) assert.ok(descriptors.some(descriptor => "baseline" in descriptor && descriptor.baseline === store.library!.baseline), store.path);
});

test("UPG1-12: a store is listed once, and comparing the fingerprint opens nothing and builds no catalog", () => {
  const descriptors = homeUpgradeDescriptors();
  assert.equal(new Set(descriptors.map(({ pattern }) => pattern)).size, descriptors.length);
  const counting = descriptors.map(descriptor => "baseline" in descriptor && descriptor.baseline === CATALOG_BASELINE
    ? { ...descriptor, baseline: { version: CATALOG_BASELINE.version, get schema(): string { throw new Error("the fingerprint read the catalog's schema"); } } } : descriptor);
  assert.match(upgradeFingerprint(counting), /^[0-9a-f]{64}$/);
});

test("UPG1-12: left out on purpose: the old Alchemist's two stores (user 2026-11-08) keep version 1 and their own refusal until the plugin is redone", () => {
  assert.equal(homeUpgradeDescriptors().some(({ pattern }) => pattern.startsWith("alchemist")), false);
});

test("UPG1-07: only the map's version of the secrets file is in the chain: the sealed envelope and the Home payload stay at 1 (user 2026-11-08)", () => {
  const versions = JSON.parse(readFileSync(new URL("../tooling/versions.json", import.meta.url), "utf8")) as { versions: Record<string, number> };
  assert.equal(versions.versions["format.secret-store.envelope"], 1);
  assert.equal(versions.versions["format.secret-store.home-payload"], 1);
  assert.ok(homeUpgradeDescriptors().some(descriptor => "file" in descriptor && descriptor.pattern === join("feed", "secrets.json")));
});
