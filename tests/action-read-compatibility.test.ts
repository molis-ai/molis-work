import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import test from "node:test";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { BUILTIN_PLUGIN_REGISTRY, DEMO_PROJECT_ID, PROJECT_SCOPED_PLUGIN_IDS, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { goalEventHistoryKinds, materializeGoalEventHistory } from "./goal-event-history-fixture.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";

/**
 * Reads echo what is stored. One historical record that an output contract no longer admits makes the whole read
 * fail (a project page that does not open). Every parameterless read in the directory runs here over real historical
 * dumps and the demo seed. An unexpected error is a broken read, not an acceptable business result.
 */
const needsNothing = (view: ActionView) => view.operation === "query"
  && view.action.input_schema?.type === "object" && !((view.action.input_schema.required as unknown[] | undefined)?.length);

// These fixtures deliberately contain neither model settings nor a managed workspace.
// Match the exact capability/version AND code; unknown exceptions still fail the gate.
const unavailableInFixture: Record<string, string> = {
  "alchemist.runtime.verify@1": "alchemist.runtime_not_configured",
  "git.operations@1": "actions.dependency_missing",
  "git.pr-support@1": "actions.dependency_missing",
  "git.results@1": "actions.dependency_missing",
  "git.state@2": "actions.dependency_missing",
  "git.summary@1": "actions.dependency_missing",
};

async function probe(t: test.TestContext, databasePath: string, projectId: string) {
  const web = await serveHomeRuntime(t, { workspacesFor: undefined });
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: web.home });
  let copy: string;
  const projectName = `Read historical project ${projectId}`;
  try {
    // Restore the dump under its own id, through the catalog table's owner; neither data nor identity is rewritten.
    const storage = new LocalSqliteStorage(catalog.databasePath);
    try {
      const projects = new ProjectsModule({ db: storage.db, projects_directory: catalog.projectsDirectory, plugins: BUILTIN_PLUGIN_REGISTRY });
      const record = projects.lifecycle.prepareRecord({ project_id: projectId, display_name: projectName, data_class: "user" });
      copy = record.database_path;
      mkdirSync(dirname(copy), { recursive: true }); copyFileSync(databasePath, copy);
      projects.lifecycle.register(record, "project.created", "fixture-restore");
      for (const plugin_id of PROJECT_SCOPED_PLUGIN_IDS) projects.commands.addProjectPlugin({ project_id: projectId, plugin_id, actor_id: "fixture-restore" });
    } finally { storage.close(); }
    assert.equal(catalog.getProject(projectId).database_path, copy);
  } finally { catalog.close(); }
  const host = web.host, ref = molisWorkHostProjectReference({ databasePath: copy, projectId });
  const broken: string[] = [], read = new Set<string>();
  const base = { actor_id: "web-user", project_id: projectId, audience: "user" as const, permissions: [] };
  for (const view of (await host.inspectActions(base, ref)).filter(needsNothing)) {
    const caller = { ...base, permissions: view.action.permissions };
    const client = view.action.scope === "home" ? host.homeActionClient() : host.actionClient(ref);
    try {
      if (view.capability_id === "plugins.project_reach.list" && view.version === 2) {
        // T145: even a read needs the project's actual settings door, not an invented user_action or a forbidden allowlist.
        await assert.rejects(client.invoke(caller, view, {}), { code: "actions.forbidden", message: "项目同意只接受本人在对应项目设置里的操作" });
        const response = await web.request(`/projects/${encodeURIComponent(projectId)}/api/settings/plugin-project-reach/list`, { method: "POST", body: {} });
        assert.equal(response.status, 200, await response.clone().text());
        assert.deepEqual(await response.json(), { plugins: [], project_name: projectName, capabilities: [] });
      } else {
        await client.invoke(view.action.scope === "home" ? { ...caller, project_id: null } : caller, view, {});
      }
      read.add(view.capability_id);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code && unavailableInFixture[`${view.capability_id}@${view.version}`] === code) continue;
      broken.push(`${view.capability_id}@${view.version}: ${code ?? "unexpected_error"}: ${(error as Error).message}`);
    }
  }
  assert.deepEqual(broken, []);
  assert.ok(read.has("goals.snapshot.read"), "the historical project snapshot must actually succeed");
  assert.ok(read.has("plugins.project_reach.list"), "the real project settings read must actually succeed");
  assert.ok(read.size > 10, "the directory must actually be read");
}

for (const kind of goalEventHistoryKinds) {
  test(`every parameterless read accepts the historical v35 ${kind} project`, { timeout: 60_000 }, async t => {
    const fixture = materializeGoalEventHistory(kind);
    t.after(() => rmSync(fixture.directory, { recursive: true, force: true }));
    // The dump predates the Molis Work rename and keeps the board id it was recorded with.
    await probe(t, fixture.path, "goalboard-v1-demo");
  });
}

test("every parameterless read accepts the demo seed project", { timeout: 60_000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), "action-read-demo-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "demo.sqlite"); seedDemoBoard(databasePath);
  await probe(t, databasePath, DEMO_PROJECT_ID);
});

// READFIX-01 / READFIX-02: missing workspace is optional; actual refusals from a configured workspace stay visible.
test("Coding state propagates workspace permission and availability failures", async t => {
  const home = mkdtempSync(join(tmpdir(), "action-read-workspace-refusal-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  await new MolisWorkLocalHost({ homeDirectory: home, completeText: null }).close();
  const copy = join(home, "project.sqlite"); seedDemoBoard(copy);
  let failure = new ActionError("actions.forbidden", "workspace-refusal-fixture");
  let reads = 0;
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspacesFor: () => { reads++; throw failure; } });
  const ref = molisWorkHostProjectReference({ databasePath: copy, projectId: DEMO_PROJECT_ID });
  const base = { actor_id: "web-user", project_id: DEMO_PROJECT_ID, audience: "user" as const, permissions: [] };
  try {
    const state = (await host.inspectActions(base, ref)).find(view => view.capability_id === "coding.state" && view.version === 1);
    assert.ok(state);
    const caller = { ...base, permissions: state.action.permissions };
    for (const code of ["actions.forbidden", "actions.connection_unavailable"]) {
      failure = new ActionError(code, "workspace-refusal-fixture");
      await assert.rejects(host.actionClient(ref).invoke(caller, state, {}), { code, message: "workspace-refusal-fixture" });
    }
    assert.ok(reads >= 2, "the configured workspace must actually be read");
  } finally { await host.close(); }
});
