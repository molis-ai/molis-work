// S-upgrade-too-new-untouched, the files' half: the owners that used to take a file they could not read for an empty one and then write over it
// (upgrade-chain-design §2.6), and the writers that did something else first and only then met the refusal. Temporary Homes only.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { BROWSER_SITES_FILE, BrowserSiteDecisions, COMPUTER_RECORD_FILE, ComputerRecords, ComputerSettings, dismissMolisWorkOnboarding, fileAccountSecrets, homeUpgradeDescriptors, markProjectOpened, ModelProviderStore, ONBOARDING_FILE, PersonalAuth, PROJECT_ARRIVAL_FILE, readMolisWorkOnboardingState, readProjectArrival, setProjectDescription, upgradeTarget, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { JELLY_MODEL_CONFIGURATION, jellyServiceActions } from "@molis-ai/molis-work-plugin-jelly";
import { assertVersionedFileWritable, createFileSecretStore, LocalSqliteStorage, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { person, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { sha256, upgradeTestHome } from "./fixtures/home-upgrade-home.js";

const place = (home: string, relative: string, value: unknown) => {
  const file = join(home, relative);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
  chmodSync(file, 0o600);
  return file;
};
const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const temporaryFiles = (file: string) => readdirSync(dirname(file)).filter(name => name.endsWith(".tmp"));
/** The version this build reads at a path of the upgrade process, so "one ahead" follows the code. */
const versionAt = (pattern: string) => {
  const descriptor = homeUpgradeDescriptors().find(item => item.pattern === pattern);
  assert.ok(descriptor, `${pattern} is in the upgrade process`);
  return upgradeTarget(descriptor);
};

test("S-upgrade-too-new-untouched: `browser/sites.json` one version ahead: read as the default, saving refused, the file unchanged", t => {
  const { home } = upgradeTestHome(t), file = place(home, "browser/sites.json", { version: BROWSER_SITES_FILE.version + 1, assistant: false, sites: [{ scope: "https://a.example", decision: "block", at: "x" }] }), before = sha256(file);
  const sites = new BrowserSiteDecisions(home);
  assert.deepEqual(sites.list(), []);
  assert.throws(() => sites.set("https://b.example", "allow"), { code: "storage.store_too_new" });
  assert.throws(() => sites.setAssistantEnabled(false), { code: "storage.store_too_new" });
  assert.equal(sha256(file), before);
  assert.deepEqual(readdirSync(dirname(file)), ["sites.json"], "and no temporary file");
  // A refused save is not in force either: the browser goes on deciding as it did before it was asked.
  assert.deepEqual(sites.list(), [], "the refused allow is not taken");
  assert.equal(sites.assistantEnabled, true, "the refused switch is not taken");
});

test("S-upgrade-too-new-untouched: `jelly/preferences.json` one version ahead or unreadable: the model choice is refused before anything it would change", async t => {
  // The fixture removes this Home after its Host has closed.
  const home = await mkdtemp(join(tmpdir(), "molis-too-new-preference-")), relative = join("jelly", "preferences.json");
  await withMolisWorkProjectCatalog({ homeDirectory: home }, () => undefined);
  const file = place(home, relative, { schema_version: versionAt(relative) + 1, provider_id: "later", model_id: "later" });
  const { host } = await serveHomeRuntime(t, { homeDirectory: home });
  const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "还没有地址", token: "too-new-preference-fixture" }));
  // The save that does the most before its file: a provider of Jelly's own, and the first address the connection is pinned to.
  const save = () => host.homeActionClient().invoke(person(["jelly:settings"]), jellyServiceActions.saveModelSettings,
    { base_url: "https://unwritten.example/v1", model_id: "unwritten", connection_id: connection.connection_id });
  for (const [contents, code] of [[null, "storage.store_too_new"], ["{", "storage.schema_version_mismatch"]] as const) {
    if (contents !== null) place(home, relative, contents);
    const before = sha256(file);
    await assert.rejects(save(), { code });
    assert.equal(sha256(file), before, code);
    assert.deepEqual(temporaryFiles(file), [], `${code}: and no temporary file`);
  }
  const catalog = new LocalSqliteStorage(join(home, "projects", "catalog.db"));
  try {
    const providers = new ModelProviderStore({ db: catalog.db, secrets: runWithMolisWorkHome(home, () => createFileSecretStore()) });
    assert.equal(providers.get(JELLY_MODEL_CONFIGURATION.custom_provider.provider_id), null, "no provider of Jelly's own was made");
  } finally { catalog.close(); }
  // Not pinned by the refused save: another address can still be the connection's first.
  withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", "https://first-target.example/v1"));
});

test("S-upgrade-too-new-untouched: `config/onboarding.json` one version ahead or unreadable: no way in makes a project or the personal space", async t => {
  // A new Home first, as a first run finds it (the fixture's, removed after its Host has closed); the record is what a newer build left there.
  const { home, host, request } = await serveHomeRuntime(t), relative = join("config", "onboarding.json");
  const file = place(home, relative, { schema_version: ONBOARDING_FILE.version + 1, first_run: "pending" });
  const post = async (path: string, body: unknown) => {
    const response = await request(path, { method: "POST", body });
    return { status: response.status, body: await response.json() as { error?: string; code?: string } };
  };
  const journey = randomUUID();
  assert.equal((await post("/api/onboarding/context", { id: journey })).status, 201);
  const untouchedJourney = await (await request(`/api/onboarding/context/${journey}`)).json() as Record<string, unknown>;
  for (const [contents, code, status] of [[null, "storage.store_too_new", 503], ["{", "storage.schema_version_mismatch", 400]] as const) {
    if (contents !== null) place(home, relative, contents);
    const before = sha256(file);
    // The context journey's adoption: refused before the accepted text is kept, so the journey is where it was.
    const adopted = await post(`/api/onboarding/context/${journey}/adopt`, { title: "不会建的项目", blank: true });
    assert.equal(adopted.status, 400, code);
    assert.match(adopted.body.error ?? "", /config\/onboarding\.json/u, `${code}: the person is told which record stopped it`);
    assert.deepEqual(await (await request(`/api/onboarding/context/${journey}`)).json(), untouchedJourney, `${code}: the journey is as it was`);
    // The blank start (the personal space) and the first-run project with its Goal.
    const personal = await post("/api/onboarding/personal", {});
    assert.deepEqual([personal.status, personal.body.code], [status, code], "personal");
    const initialized = await post("/api/onboarding/initialize", { project_name: "不会建的项目", outcome: "看见第一个结果", user_confirmed: true });
    assert.deepEqual([initialized.status, initialized.body.code], [status, code], "initialize");
    assert.equal(sha256(file), before, code);
    assert.deepEqual(temporaryFiles(file), [], `${code}: and no temporary file`);
  }
  const projects = await host.configurePersonalPlanning(home, withMolisWorkProjectCatalog)({ homeDirectory: home }, catalog => catalog.listProjects().map(project => project.project_id));
  assert.deepEqual(projects, [], "no project and no personal space");
});

test("S-upgrade-too-new-untouched: `feed/secrets.json` one version ahead or unreadable: a login is refused before it sends anything or spends its code", async t => {
  const relative = join("feed", "secrets.json"), callback = "http://127.0.0.1:4173/account/callback";
  const config = { authOrigin: "https://auth.example", clientId: "too-new-vault" };
  for (const [contents, code] of [[null, "storage.store_too_new"], ["{", "storage.schema_version_mismatch"]] as const) {
    const { home } = upgradeTestHome(t), sent: string[] = [];
    let state = "";
    // Only the Auth peer is synthetic; the vault is the Home's real one, through the same store and check the account HTTP owner uses.
    const http: typeof fetch = async (url, init) => {
      const at = new URL(String(url)).pathname;
      sent.push(at);
      if (at === "/api/v1/auth/transactions") { state = JSON.parse(String(init?.body)).state; return Response.json({ data: { loginUrl: `${config.authOrigin}/login` } }); }
      if (at === "/oauth2/token") return Response.json({ access_token: "synthetic-vault-access", refresh_token: "synthetic-vault-refresh", expires_in: 3600 });
      return Response.json({ data: { userId: "vault-person", displayName: "Vault", emails: [], applicationId: "work", clientId: config.clientId } });
    };
    const auth = runWithMolisWorkHome(home, () => new PersonalAuth(config, fileAccountSecrets(), http));
    // Someone is signed in and is switching accounts when the vault turns out to be a newer build's, or damaged.
    await auth.begin(callback);
    await auth.complete("first-code", state);
    const lease = auth.accountLease(), generation = auth.accountGeneration();
    await auth.begin(callback, false, true);
    const file = place(home, relative, contents ?? { ...json(join(home, relative)), version: versionAt(relative) + 1 }), before = sha256(file);
    sent.length = 0;
    await assert.rejects(auth.complete("second-code", state), { code });
    assert.deepEqual(sent, [], `${code}: the code is not exchanged and no profile is read`);
    assert.equal(auth.accountGeneration(), generation, `${code}: the signed-in account is not invalidated`);
    assert.doesNotThrow(() => lease.assertCurrent(), `${code}: and its lease still holds`);
    await assert.rejects(auth.begin(callback), { code });
    assert.deepEqual(sent, [], `${code}: no new login is started either`);
    assert.equal(auth.loginPending(), false, code);
    assert.equal(sha256(file), before, code);
    assert.deepEqual(temporaryFiles(file), [], `${code}: and no temporary file`);
  }
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
  await t.test("computer/records/<id>/record.json: not shown, not finished, not removed", t => {
    const id = "abcd1234", relative = `computer/records/${id}/record.json`;
    refusals(t, relative, COMPUTER_RECORD_FILE.version, "version", home => {
      const records = new ComputerRecords(home);
      assert.equal(records.get(id), null);
      assert.deepEqual(records.list(), []);
      assert.equal(records.finish(id, { outcome: "completed", conclusion: "", unfinished: [] }), null);
      assert.equal(records.step(id, { kind: "note" } as never), null);
      // Removing goes by the id alone: a record this build does not show is not this build's to take away.
      assert.throws(() => records.remove(id), { code: "storage.store_too_new" });
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
