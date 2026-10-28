// The lifecycle a shipped plugin goes through on Plugin Runtime (W6-02, RAC-1030–RAC-1034 and RAC-1090 on), one walk for every
// plugin the product ships: each in a one-off Home with the product's Host and web server. What the person wrote stays through
// removal from the project and adding back, through a revoked permission and its return, and through an upgrade; uninstalled,
// nothing of it is left to call, after a restart too. The upgrade a shipped plugin gets is a newer build of its package: the Home's
// installation record was written by an older build, and the next start moves the same installation onto this build.
// The tests that use it say which plugins they walk and which they leave to someone else.
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, projectActionAvailability, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { isLocalHostHttpError } from "@molis-ai/molis-work-test-kit/local-host-http";
import { serveTestHost, type TestHostServer, type TestProject } from "./test-home.js";

export type Web = TestHostServer["web"];
/** One shipped plugin: where its supervisor runs it, and how the person writes one thing in it and reads back what is there. */
export interface Shipped {
  /** The key the project's plugin list gives it (`/api/settings/projects/<id>/plugins`). */
  readonly key: string;
  readonly plugin_id: string;
  readonly scope: "home" | "project";
  /** A project does not start with it (it is neither personal nor on by default): the person adds it when making the project. */
  readonly joins?: true;
  /** It cannot be taken out of a project (常开): the walk shows the refusal where the others are removed and added back. Its
   * installation carries the Host's own 常开 agreement, which the walk takes back before uninstalling (S-34). */
  readonly always_on?: true;
  /**
   * A dual-instance plugin: the Home half holds what the person writes and is the one the walk follows (its `home`-scope actions);
   * each project's own half is a second installation that the Home half's uninstall does not touch.
   */
  readonly dual?: true;
  /**
   * A project plugin that is not personal: taking it out of the project stops the project's installation (`disabled`) and adding it
   * back runs it again, where a personal plugin's installation keeps running whoever may reach it (apps/local-host/src/project-plugin-enablement.ts).
   */
  readonly stops_when_removed?: true;
  /** Another plugin's key whose removal takes this one out of the project (it needs that one, or that one embeds it); adding this back brings it too. */
  readonly removed_by?: string;
  /** The required permission the walk takes back; `storage:private` unless the plugin keeps nothing of its own. */
  readonly revoke?: string;
  /** What `titles` answers after `write("first")`; `["first"]` unless the plugin names what it keeps otherwise. */
  readonly kept?: readonly string[];
  write(web: Web, routes: string, title: string): Promise<unknown>;
  titles(web: Web, routes: string): Promise<string[]>;
}

/** What the person's own list shows of a thing: its title. */
export const titlesOf = (items: ReadonlyArray<{ title: string }>) => items.map(item => item.title);

type HostOptions = NonNullable<ConstructorParameters<typeof MolisWorkLocalHost>[0]>;
/** The product's Host over the product's web server, as tests/fixtures/test-home.ts makes it, here opened again on the same Home. */
export async function serve(home: string, host: Partial<HostOptions> = {}) {
  const local = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: projectId => withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.listWorkspaceDirectory(projectId)),
    actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home), ...host });
  const served = await serveTestHost(null, { home, host: local });
  return { ...served, host: local, async shut() { await served.close(); await local.close(); } };
}
export type Served = Awaited<ReturnType<typeof serve>>;

/** What a request answered: 200, or the refusal's status and code. */
export async function answer(request: Promise<unknown>): Promise<number | string> {
  try { await request; return 200; } catch (error) {
    if (isLocalHostHttpError(error)) return error.code ? `${error.status} ${error.code}` : error.status;
    throw error;
  }
}

/** The actions the build declares for the plugin, as the person's directory in a project names them. */
export function declared(pluginId: string): string[] {
  const entry = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === pluginId);
  assert.ok(entry, pluginId);
  return (entry.manifest.actions ?? []).filter(action => action.action.audiences.includes("user")).map(action => `${action.capability_id}@${action.version}`).sort();
}

/** Where the plugin is, for one Host: its routes in the project, the person's directory, and its installation. */
export function viewOf(served: Served, project: TestProject, plugin: Pick<Shipped, "key" | "plugin_id" | "scope" | "dual">) {
  const routes = `/projects/${encodeURIComponent(project.project_id)}/api/plugins/${plugin.plugin_id}`;
  const platform = async () => plugin.scope === "home" ? await served.host.homePlugins!.ready()
    : await served.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, project.project_id));
  return {
    routes,
    platform: async () => { const running = await platform(); assert.ok(running, `${plugin.key}: the ${plugin.scope} platform runs`); return running; },
    /** The plugin's actions the person may call in the project now: those of the half the walk follows, or of the scope asked for. */
    async callable(scope: "home" | "project" | undefined = plugin.dual ? "home" : undefined) {
      const views = await served.host.actionClient(project.reference).discover(await served.host.localPersonContext(project.reference));
      return views.filter(view => view.provider.plugin_id === plugin.plugin_id && view.availability.available && (scope === undefined || view.action.scope === scope))
        .map(view => `${view.capability_id}@${view.version}`).sort();
    },
    async installation() {
      const record = (await platform())?.runtime.list().find(item => item.plugin_id === plugin.plugin_id);
      return record ? { install_id: record.install_id, state: record.state, version: record.version, trust: record.publisher_trust, grants: [...record.grants] } : null;
    },
  };
}

/** The walk of one shipped plugin from a new project to its uninstall and a restart after it. */
export async function walk(plugin: Shipped, host: Partial<HostOptions> = {}) {
  const home = await mkdtemp(join(tmpdir(), `shipped-lifecycle-${plugin.key}-`));
  const build = BUILTIN_PLUGIN_CATALOG.find(item => item.manifest.plugin_id === plugin.plugin_id)!.manifest.version;
  const revoked = plugin.revoke ?? "storage:private", kept = plugin.kept ?? ["first"];
  let served = await serve(home, host);
  try {
    const project = await served.createProject("Lifecycle", plugin.joins ? [plugin.key] : []);
    const settings = `/api/settings/projects/${encodeURIComponent(project.project_id)}/plugins`;
    let at = viewOf(served, project, plugin);

    // Shipped: in every project from the start (or added as the person made it), run by its supervisor with the Host build's trust.
    // What the person may call: the actions it declares for them, but those that need a model (this Home has none).
    const callable = await at.callable();
    assert.ok(callable.length > 0 && callable.every(action => declared(plugin.plugin_id).includes(action)), `${plugin.key}: its own actions, for the person`);
    await plugin.write(served.web, at.routes, "first");
    assert.deepEqual(await plugin.titles(served.web, at.routes), kept);
    const first = await at.installation();
    assert.ok(first);
    assert.deepEqual({ state: first.state, version: first.version, trust: first.trust }, { state: "running", version: build, trust: "host" });

    // Taken out of the project: its routes and actions there are refused; a personal plugin's installation keeps running, a project plugin's stops.
    if (plugin.always_on) {
      // 常开: the project cannot take it out, and nothing of it changes.
      assert.equal(await answer(served.web.delete(settings, { plugin_id: plugin.key })), "400 catalog.plugin_always_on", `${plugin.key}: not removable`);
      assert.deepEqual(await plugin.titles(served.web, at.routes), kept, `${plugin.key}: still there`);
      assert.deepEqual(await at.callable(), callable);
    } else {
      assert.equal(await answer(served.web.delete(settings, { plugin_id: plugin.removed_by ?? plugin.key })), 200);
      assert.equal(await answer(plugin.titles(served.web, at.routes)), "403 actions.plugin_disabled", `${plugin.key}: removed from the project`);
      assert.deepEqual(await at.callable(), [], `${plugin.key}: nothing of it to call in the project`);
      assert.equal((await at.installation())?.state, plugin.stops_when_removed ? "disabled" : "running", `${plugin.key}: its installation after removal`);
      // Added back: what was written is there, in the same installation.
      assert.equal(await answer(served.web.post(settings, { plugin_id: plugin.key })), 200);
      assert.deepEqual(await plugin.titles(served.web, at.routes), kept, `${plugin.key}: added back, with its data`);
      assert.deepEqual(await at.callable(), callable);
      assert.deepEqual(await at.installation(), first, `${plugin.key}: the same installation, running`);
    }

    // A permission it requires taken back: it does not start, and nothing of it is called; given back, it runs with its data.
    const running = await at.platform();
    await running.runtime.stop(first.install_id);
    running.runtime.grant(first.install_id, first.grants.filter(permission => permission !== revoked));
    await assert.rejects(running.runtime.start(first.install_id), { code: "plugin.grant_denied" });
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "503 actions.plugin_unavailable", `${plugin.key}: revoked`);
    assert.deepEqual(await at.callable(), []);
    assert.equal((await at.installation())?.state, "disabled");
    running.runtime.grant(first.install_id, first.grants);
    await running.runtime.start(first.install_id);
    assert.deepEqual(await plugin.titles(served.web, at.routes), kept, `${plugin.key}: the permission given back`);

    // Upgrade: the Home last ran an older build of the plugin. The next start moves the same installation onto this build.
    await served.shut();
    const db = new DatabaseSync(plugin.scope === "home" ? homeSqlitePath(home, "plugin-runtime") : project.database_path);
    try {
      const records = new SqlitePluginRuntimeRepository(db), stored = records.get(first.install_id);
      assert.ok(stored);
      records.save({ ...stored, version: "0.2.0", manifest_digest: "sha256:an-older-build" });
    } finally { db.close(); }
    served = await serve(home, host);
    at = viewOf(served, project, plugin);
    assert.deepEqual(await plugin.titles(served.web, at.routes), kept, `${plugin.key}: the upgrade keeps its data`);
    assert.deepEqual(await at.installation(), { ...first, state: "running", version: build }, `${plugin.key}: the same installation, at this build`);
    assert.deepEqual(await at.callable(), callable);

    // Uninstalled: no route, no action, the record says so. A 常开 plugin cannot be uninstalled while its agreement stands (S-34):
    // the walk shows that refusal, takes the agreement back, and only then uninstalls; the agreement stays revoked across a restart.
    const upgraded = await at.platform();
    if (plugin.always_on) {
      await assert.rejects(upgraded.runtime.uninstall(first.install_id, { retain_private_data: false }), { code: "plugin.always_on" }, `${plugin.key}: 常开, cannot be uninstalled`);
      assert.equal((await at.installation())?.state, "running", `${plugin.key}: the refusal changes nothing`);
      assert.deepEqual(await plugin.titles(served.web, at.routes), kept, `${plugin.key}: the refusal keeps its data`);
      // The person takes the agreement back through the Host's own settings route (S-77), the way the settings page does.
      const listed = await served.web.post<{ consents: Array<{ consent_id: string; kind: string; revoked_at: string | null }> }>("/api/settings/plugin-consents/list", { plugin_id: plugin.plugin_id });
      const agreement = listed.consents.find(row => row.kind === "always_on" && row.revoked_at === null);
      assert.ok(agreement, `${plugin.key}: its installation carries the Host's 常开 agreement`);
      const { consent } = await served.web.post<{ consent: { revoked_at: string | null } }>("/api/settings/plugin-consents/revoke", { consent_id: agreement.consent_id });
      assert.notEqual(consent.revoked_at, null, `${plugin.key}: the agreement is taken back`);
    }
    await upgraded.runtime.stop(first.install_id);
    await upgraded.runtime.uninstall(first.install_id, { retain_private_data: false });
    assert.equal((await at.installation())?.state, "uninstalled");
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "404 actions.missing", `${plugin.key}: uninstalled, its route says so`);
    assert.deepEqual(await at.callable(), []);

    // Neither supervisor installs it again on the next start (W3-06-F-06 for the Home's, BL-755 for a project's).
    await served.shut();
    served = await serve(home, host);
    at = viewOf(served, project, plugin);
    assert.equal(await answer(plugin.titles(served.web, at.routes)), "404 actions.missing", `${plugin.key}: not there after a restart`);
    assert.equal((await at.installation())?.state, "uninstalled", `${plugin.key}: still uninstalled after a restart`);
    assert.deepEqual(await at.callable(), []);
    if (plugin.always_on) {
      const listed = await served.web.post<{ consents: Array<{ kind: string; revoked_at: string | null }> }>("/api/settings/plugin-consents/list", { plugin_id: plugin.plugin_id });
      const rows = listed.consents.filter(row => row.kind === "always_on");
      assert.ok(rows.length > 0 && rows.every(row => row.revoked_at !== null), `${plugin.key}: the agreement stays revoked, the Host does not agree again`);
    }
    if (plugin.dual) assert.ok((await at.callable("project")).length > 0, `${plugin.key}: the project's own half is another installation, still there`);
  } finally {
    await served.shut();
    await rm(home, { recursive: true, force: true });
  }
}
