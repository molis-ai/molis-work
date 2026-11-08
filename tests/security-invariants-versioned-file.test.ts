// S-upgrade-too-new-untouched, the files' half: the owners that used to take a file they could not read for an empty one and then write over it
// (upgrade-chain-design §2.6). Temporary Homes only.
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { BROWSER_SITES_FILE, BrowserSiteDecisions, COMPUTER_RECORD_FILE, ComputerRecords, ComputerSettings, dismissMolisWorkOnboarding, markProjectOpened, ONBOARDING_FILE, PROJECT_ARRIVAL_FILE, readMolisWorkOnboardingState, readProjectArrival, setProjectDescription } from "@molis-ai/molis-work-app-local-host";
import { assertVersionedFileWritable } from "@molis-ai/molis-work-storage";
import { sha256, upgradeTestHome } from "./fixtures/home-upgrade-home.js";

const place = (home: string, relative: string, value: unknown) => {
  const file = join(home, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  chmodSync(file, 0o600);
  return file;
};
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

test("S-upgrade-too-new-untouched: `browser/sites.json` one version ahead: read as the default, saving refused, the file unchanged", t => {
  const { home } = upgradeTestHome(t), file = place(home, "browser/sites.json", { version: BROWSER_SITES_FILE.version + 1, assistant: false, sites: [{ scope: "https://a.example", decision: "block", at: "x" }] }), before = sha256(file);
  const sites = new BrowserSiteDecisions(home);
  assert.deepEqual(sites.list(), []);
  assert.throws(() => sites.set("https://b.example", "allow"), { code: "storage.store_too_new" });
  assert.throws(() => sites.setAssistantEnabled(false), { code: "storage.store_too_new" });
  assert.equal(sha256(file), before);
  assert.deepEqual(readdirSync(dirname(file)), ["sites.json"], "and no temporary file");
});

const refusals = (t: TestContext, relative: string, version: number, field: "version" | "schema_version", use: (home: string) => void) => {
  const { home } = upgradeTestHome(t), file = place(home, relative, { [field]: version + 1 }), before = sha256(file);
  use(home);
  assert.equal(sha256(file), before, relative);
};

test("S-upgrade-too-new-untouched: the other files that used to read as empty: nothing replaces one that is too new", async t => {
  await t.test("computer/settings.json: off, and the switch refuses", t => refusals(t, "computer/settings.json", 1, "version", home => {
    const settings = new ComputerSettings(home);
    assert.equal(settings.enabled, false);
    assert.throws(() => settings.setEnabled(true), { code: "storage.store_too_new" });
  }));
  await t.test("config/onboarding.json", t => refusals(t, "config/onboarding.json", ONBOARDING_FILE.version, "schema_version", home => {
    assert.equal(readMolisWorkOnboardingState(home).first_run, "pending");
    assert.throws(() => dismissMolisWorkOnboarding(home, "first_run"), { code: "storage.store_too_new" });
  }));
  await t.test("config/project-arrival.json: remembering is best effort, and it remembers nothing", t => refusals(t, "config/project-arrival.json", PROJECT_ARRIVAL_FILE.version, "schema_version", home => {
    assert.equal(readProjectArrival(home).last_project_id, null);
    markProjectOpened(home, "project-a");
    setProjectDescription(home, "project-a", "words");
  }));
  await t.test("computer/records/<id>/record.json: not shown, not finished", t => {
    const id = "abcd1234", relative = `computer/records/${id}/record.json`;
    refusals(t, relative, COMPUTER_RECORD_FILE.version, "version", home => {
      const records = new ComputerRecords(home);
      assert.equal(records.get(id), null);
      assert.deepEqual(records.list(), []);
      assert.equal(records.finish(id, { outcome: "completed", conclusion: "", unfinished: [] }), null);
      assert.equal(records.step(id, { kind: "note" } as never), null);
    });
  });
});

test("S-upgrade-too-new-untouched: a damaged file is not replaced either, and a missing one is still written", t => {
  const { home } = upgradeTestHome(t), damaged = place(home, "browser/sites.json", "{"), before = sha256(damaged);
  const sites = new BrowserSiteDecisions(home);
  assert.throws(() => sites.set("https://b.example", "allow"), { code: "storage.schema_version_mismatch" });
  assert.equal(sha256(damaged), before);
  const fresh = upgradeTestHome(t);
  new BrowserSiteDecisions(fresh.home).set("https://b.example", "allow");
  assert.equal(json(join(fresh.home, "browser", "sites.json")).version, BROWSER_SITES_FILE.version);
  assert.doesNotThrow(() => assertVersionedFileWritable(BROWSER_SITES_FILE, join(fresh.home, "browser", "sites.json")));
});
