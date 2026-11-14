// What a golden Home holds and how it gets there (specs/upgrade-continuity/golden-replay-design.md §2, §3): projects, every owner's data through
// that owner's own actions and settings entries, an installed third-party plugin. The exceptions are recorded in the manifest's `imports`: the Goal
// event history, which has no write action and comes from its existing dump, and the libraries that can only be there empty. The ledger of plugin
// libraries is empty only in a Home without the signed sample: an account Home, and a generation that could not run the sandbox.
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { goldenFailure } from "./failure.mjs";
import { installHomeLibrarySample } from "./home-library-sample.mjs";
import { enterHome, goldenActions, loadGoldenWrites, openGoldenHost, root } from "./session.mjs";

const local = await import("@molis-ai/molis-work-app-local-host");
const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
const { KnowledgeOrganizer } = await import("@molis-ai/molis-work-service-knowledge");
const { ObservationLayer } = await import("@molis-ai/molis-work-service-observation");
const { addProjectPlugin, createProject, LocalHostHttpClient } = await import("@molis-ai/molis-work-test-kit/local-host-http");
const { verifyPluginPackageSignature } = await import("@molis-ai/molis-work-plugin-runtime");
const { openBaselineHomeSqlite, bindDatabaseSpace, readStorageSpace } = await import("@molis-ai/molis-work-storage");
const { SYNC_STORE_BASELINE } = await import("@molis-ai/molis-work-module-sync-replication");
const { materializeGoalEventHistory } = await import(new URL("../../tests/goal-event-history-fixture.ts", import.meta.url).href);
const { registerProjectCopy } = await import(new URL("../../tests/fixtures/parameterless-reads.ts", import.meta.url).href);
const { expectAnswer, installedPluginSession } = await import("../replay-plugins/signed-session.mjs");

const GOAL_HISTORY_KIND = "approved-completed";
const GOAL_HISTORY_PROJECT = "goalboard-v1-demo";
const CORPUS = path.join(root, "tests/fixtures/replay-plugins/corpus.json");
const EMPTY_HOME_LIBRARIES = ["plugin-directories", "plugin-libraries", "plugin-originals"];

/** A generation explicitly reconciles the cards once. Automatic model jobs would record uses and change the cards between steps. */
export function holdAutomaticKnowledgeOrganization() {
  const kick = KnowledgeOrganizer.prototype.kick;
  KnowledgeOrganizer.prototype.kick = () => Promise.resolve();
  return () => { KnowledgeOrganizer.prototype.kick = kick; };
}

/**
 * A generation writes no work records. Every call the Host settles is one (batch 28), numbered and given its id in the order concurrent calls
 * finish, and that order is the machine's: search refreshes its known sources in parallel, 800 ms after a change, so two generations hold the
 * same calls in another order, under other ids and evidence nonces, and shift the seeded stream the next encryption draws from. The library is
 * still opened by its owner and kept with its current structure, in both Homes; recorded in the manifest's `imports`.
 */
export function holdObservationRecords() {
  const methods = ["observed", "sink", "reportAction"];
  const originals = Object.fromEntries(methods.map(name => [name, ObservationLayer.prototype[name]]));
  for (const name of methods) ObservationLayer.prototype[name] = function (...args) {
    this.writer.enqueue = () => undefined;
    return originals[name].apply(this, args);
  };
  return () => { Object.assign(ObservationLayer.prototype, originals); };
}

/** The third-party sample: the one corpus entry that has a write, read back through its own action. */
export function thirdPartySample() {
  const sample = JSON.parse(readFileSync(CORPUS, "utf8")).samples.find(item => item.source.kind === "signed-package" && item.write);
  const file = name => path.resolve(path.dirname(CORPUS), name);
  const { bundle } = verifyPluginPackageSignature(JSON.parse(readFileSync(file(sample.source.path), "utf8")));
  const { bundle: upgrade } = verifyPluginPackageSignature(JSON.parse(readFileSync(file(sample.source.upgrade_path), "utf8")));
  return { ...sample, packageFile: file(sample.source.path), upgradeFile: file(sample.source.upgrade_path), pluginId: bundle.payload.manifest.plugin_id,
    publisher: bundle.payload.manifest.publisher.signature, version: bundle.payload.manifest.version, upgradeVersion: upgrade.payload.manifest.version };
}

/** A dump that has fallen behind the code is refreshed, not converted: this is the check the design asks to run first. */
function assertGoalHistoryCurrent(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    if (db.prepare("PRAGMA user_version").get().user_version !== local.PROJECT_DATABASE_BASELINE.version) throw goldenFailure("golden.goal_history_version_mismatch", "tests/fixtures/goal-event-history");
  } finally { db.close(); }
}

async function createRootProjects(session, step) {
  const web = new LocalHostHttpClient({ origin: session.origin, controlToken: readFileSync(path.join(session.home, "config/web-control-token"), "utf8").trim() });
  await step("projects:primary");
  const primary = await createProject(web, "金样工作项目");
  for (const plugin_id of local.PROJECT_SCOPED_PLUGIN_IDS) await addProjectPlugin(web, primary.project_id, plugin_id);
  await step("projects:demo");
  const demo = await session.http("/api/settings/demo", { body: { action: "create", user_confirmed: true } });
  await step("projects:goal-history");
  const fixture = materializeGoalEventHistory(GOAL_HISTORY_KIND);
  try {
    assertGoalHistoryCurrent(fixture.path);
    const history = { project_id: GOAL_HISTORY_PROJECT, database_path: await registerProjectCopy(session.host, session.home, withMolisWorkProjectCatalog, fixture.path, GOAL_HISTORY_PROJECT, "金样历史项目") };
    // The dump belongs to no Home until its project is first opened here.
    await goldenActions(session, history, "seed").call("goals.list");
    return { primary, demo: { project_id: demo.project.project_id, database_path: demo.project.database_path }, history };
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
}

/** An account Home has no web surface to ask, so its project comes from the offline catalog, before its Host holds the Home. */
async function createAccountProject(home, step) {
  await step("projects:primary");
  return { primary: await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "金样账号项目", actor_id: "owner" });
    for (const plugin_id of local.PROJECT_SCOPED_PLUGIN_IDS) await catalog.addProjectPlugin({ project_id: created.project_id, plugin_id, actor_id: "owner" });
    return created;
  }) };
}

async function installThirdParty(session, project, step) {
  const sample = thirdPartySample();
  await step("third-party:install");
  const confirmed = await session.cli(sample.packageFile, project.project_id, "--confirm", "--pin-as", "金样测试发布者");
  if (confirmed.code !== 0) throw goldenFailure("golden.third_party_install_failed", sample.id);
  const plugin = installedPluginSession(() => session.host, { home: session.home, ref: local.molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }), projectId: project.project_id, pluginId: sample.pluginId, publisher: sample.publisher });
  await plugin.installed(sample.version);
  await step("third-party:write");
  expectAnswer(sample.write, await plugin.invoke(sample.write));
  expectAnswer(sample.action, await plugin.invoke(sample.action));
}

/** The sync library has no write action. Its owner's baseline makes the current structure and the account's binding; nothing else writes it. */
function createAccountSyncLibrary(home) {
  const db = openBaselineHomeSqlite(home, "sync", SYNC_STORE_BASELINE);
  try { bindDatabaseSpace(db, readStorageSpace(home)); } finally { db.close(); }
}

/**
 * Libraries a golden cannot put a row in, each for the reason in the manifest's `imports`, whose owner's current structure still has to be there for
 * an upgrade to walk. Home-level ones from the registry, Alchemist's per project from its owner, which opens one the moment it is asked to search.
 */
async function createEmptyLibraries(home, projects) {
  for (const store of EMPTY_HOME_LIBRARIES) openBaselineHomeSqlite(home, store, local.homeStores().get(store).library.baseline).close();
  await local.createAlchemistSearchPort({ homeDirectory: home, projectId: projects.primary.project_id }).shutdown();
}

/**
 * A card's number is the order the organizer's timers happened to fire in, across projects, and a contentless index holds that number, so nothing
 * after the fact can make it stable. The cards hold nothing the catalog does not (no model, no edits), and with the search index complete the owner
 * rebuilds them in one pass, project by project, after the search index finishes. Recorded in the manifest's `imports`.
 * This runs after the owners' write cases, so the case that writes to this library says so and runs here, on the cards that stay.
 */
async function cardsInOneOrder(home, account, projects, named, seed) {
  const personal = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listProjects().find(project => project.project_id === "personal"));
  const holders = Object.values({ ...projects, ...(personal ? { personal } : {}) }).sort((a, b) => a.project_id < b.project_id ? -1 : a.project_id > b.project_id ? 1 : 0);
  rmSync(path.join(home, "knowledge"), { recursive: true, force: true });
  await named("knowledge-rebuild");
  const session = await openGoldenHost(home, { web: !account });
  try {
    for (const project of holders) {
      const { call } = goldenActions(session, project, "seed");
      // A source can report the previous index as ready while catch-up runs. Rebuild once, then wait for the fresh listing.
      await call("search.rebuild", { scope: "project" }, { project_owner: true });
      for (let attempt = 0; ; attempt++) {
        const { sources } = await call("search.status", { scope: "project" }, { project_owner: true });
        if (sources.every(source => ["ready", "disabled", "unavailable"].includes(source.state))) break;
        if (attempt === 119) throw goldenFailure("golden.knowledge_index_unsettled", project.project_id);
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const { listing } = await call("knowledge.list", {}, { project_owner: true });
      if (listing) throw goldenFailure("golden.knowledge_index_unsettled", project.project_id);
    }
    await named("knowledge-settle");
    await seed(session, projects, write => write.afterKnowledgeRebuild);
    await named("knowledge-edit-settle");
  } finally { await session.close(); }
}

/**
 * One whole Home, root or account. The Host is closed on return, including on failure; a Home whose Host is still running cannot be captured.
 * Returns the projects so the manifest can name them.
 */
export async function populateHome(home, { step, label, withThirdParty, account }) {
  const named = name => step(`${label}:${name}`);
  enterHome(home);
  const accountProjects = account ? await createAccountProject(home, named) : undefined;
  const session = await openGoldenHost(home, { web: !account });
  const seed = async (host, { primary }, wanted) => {
    const actions = goldenActions(host, primary, "seed");
    for (const write of (await loadGoldenWrites()).filter(wanted)) {
      if (account && write.webSurface) continue;
      await named(`write:${write.owner}`);
      try { await write.run(actions); } catch (error) { error.where = `${label}/write/${write.owner}`; throw error; }
    }
  };
  try {
    const projects = accountProjects ?? await createRootProjects(session, named);
    await seed(session, projects, write => !write.afterKnowledgeRebuild);
    if (withThirdParty) {
      await installThirdParty(session, projects.primary, named);
      await installHomeLibrarySample(session, projects.primary, named);
    }
    await named("settle");
    await session.close();
    await cardsInOneOrder(home, account, projects, named, seed);
    await createEmptyLibraries(home, projects);
    if (account) createAccountSyncLibrary(home);
    return Object.fromEntries(Object.entries(projects).map(([role, project]) => [role, { project_id: project.project_id, database: path.relative(session.home, project.database_path) }]));
  } catch (error) {
    await session.close().catch(() => undefined);
    throw error;
  }
}
