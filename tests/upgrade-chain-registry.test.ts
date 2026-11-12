// UPG1-12: the real register. Every store's and file's steps are checked against its version, so the day one goes up with a gap this goes red
// on its own. A store at its first version has no steps, and this test still runs for it; when one goes up, the same test checks the new steps.
// Nothing here opens a Home.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { CATALOG_BASELINE, homeStores, homeUpgradeDescriptors, PROJECT_DATABASE_BASELINE, upgradeFingerprint, upgradeTarget, type HomeUpgradeDescriptor } from "@molis-ai/molis-work-app-local-host";
import { PERSISTENT_FORMAT_LOCATIONS } from "../scripts/golden/formats.mjs";
import { upgradeStepProblems } from "../scripts/gates/initial-versions.mjs";

/** A plugin's tables keep their steps in the plugin's declaration; the descriptor says which version has none (U1-f). */
const stepsOf = (descriptor: HomeUpgradeDescriptor) => "file" in descriptor ? descriptor.file.upgrades.map(step => step.from)
  : "tables" in descriptor ? Array.from({ length: descriptor.tables.version - 1 }, (_, index) => index + 1).filter(from => descriptor.tables.problem(from) === undefined)
  : (descriptor.baseline.upgrades ?? []).map(step => step.from);

/** What the checklist says upgrades, on its own line, a plugin's tables in a project store (`…#<store>`) among them; an account Home holds the same stores as any other. */
const checklistUpgrades = () => readFileSync(new URL("../docs/releases/CHECKLIST.md", import.meta.url), "utf8").split("\n")
  .filter(line => line.startsWith("| ") && /低版本升级/.test(line))
  .map(line => /^\| [^|]+\| `([^`]+)`/.exec(line)?.[1]).filter((place): place is string => place !== undefined)
  .map(place => place.replace(/^spaces\/<spaceId>\//, "").replace(/<[^>]+>/g, "*"));

test("UPG1-12: every registered store and file has its steps in a row: `from` runs from 1 to version - 1, each once", () => {
  const descriptors = homeUpgradeDescriptors();
  assert.ok(descriptors.length > 20, "the platform's stores are registered as soon as the Host's package is loaded");
  for (const descriptor of descriptors) {
    assert.deepEqual(upgradeStepProblems(upgradeTarget(descriptor), stepsOf(descriptor)), [], descriptor.pattern);
    if ("baseline" in descriptor) assert.ok(descriptor.baseline.schema.length > 0, `${descriptor.pattern} has something to compare an upgraded store with`);
  }
});

test("UPG1-12: the process looks after everything the checklist says upgrades, and the catalog comes first", () => {
  const descriptors = homeUpgradeDescriptors(), patterns = new Set(descriptors.map(({ pattern }) => pattern));
  assert.deepEqual(checklistUpgrades().filter(place => !patterns.has(place)), []);
  const first = descriptors[0]!, second = descriptors[1]!;
  assert.equal(first.pattern, join("projects", "catalog.db"));
  assert.ok("baseline" in first && first.baseline === CATALOG_BASELINE);
  assert.ok("baseline" in second && second.baseline === PROJECT_DATABASE_BASELINE);
  const tables = descriptors.filter(descriptor => "tables" in descriptor), after = descriptors.indexOf(second);
  assert.ok(tables.length > 0 && tables.every(descriptor => descriptor.pattern.startsWith(`${second.pattern}#`) && descriptors.indexOf(descriptor) > after),
    "each plugin's tables come after the file they are in");
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

test("UPG-07: the last-used language is a versioned file in the chain, with the reading and the golden location the format table names", () => {
  const descriptor = homeUpgradeDescriptors().find(item => "file" in item && item.pattern === join("config", "ui-locale.json"));
  assert.ok(descriptor && "file" in descriptor, "config/ui-locale.json is a descriptor of the upgrade process");
  assert.equal(descriptor.file.version, 1);
  assert.deepEqual(descriptor.file.upgrades, [], "at 1 it has no steps, and the step check above runs anyway");
  assert.deepEqual(PERSISTENT_FORMAT_LOCATIONS["format.ui.last-locale"], { file: "config/ui-locale.json", field: "schema_version" });
  const versions = JSON.parse(readFileSync(new URL("../tooling/versions.json", import.meta.url), "utf8")) as { versions: Record<string, number> };
  assert.equal(versions.versions["format.ui.last-locale"], 1, "the table names the format the descriptor's version carries");
});

test("UPG1-07: only the map's version of the secrets file is in the chain: the sealed envelope and the Home payload stay at 1 (user 2026-11-08)", () => {
  const versions = JSON.parse(readFileSync(new URL("../tooling/versions.json", import.meta.url), "utf8")) as { versions: Record<string, number> };
  assert.equal(versions.versions["format.secret-store.envelope"], 1);
  assert.equal(versions.versions["format.secret-store.home-payload"], 1);
  assert.ok(homeUpgradeDescriptors().some(descriptor => "file" in descriptor && descriptor.pattern === join("feed", "secrets.json")));
});
