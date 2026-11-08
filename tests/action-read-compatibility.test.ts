import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEMO_PROJECT_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { MolisWorkLocalHost, molisWorkHostProjectReference, type MolisWorkProjectCatalog } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { goalEventHistoryKinds, materializeGoalEventHistory } from "./goal-event-history-fixture.js";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { readEveryParameterlessAction, registerProjectCopy } from "./fixtures/parameterless-reads.js";

async function probe(t: test.TestContext, databasePath: string, projectId: string) {
  const web = await serveHomeRuntime(t, { workspacesFor: undefined });
  const projectName = `Read historical project ${projectId}`;
  const copy = await registerProjectCopy(web.host, web.home, withMolisWorkProjectCatalog, databasePath, projectId, projectName);
  const { broken, read } = await readEveryParameterlessAction(web.host, copy, projectId, { projectReachThroughSettings: async () => {
    const response = await web.request(`/projects/${encodeURIComponent(projectId)}/api/settings/plugin-project-reach/list`, { method: "POST", body: {} });
    assert.equal(response.status, 200, await response.clone().text());
    assert.deepEqual(await response.json(), { plugins: [], project_name: projectName, capabilities: [] });
  } });
  assert.deepEqual(broken.map(item => `${item.action}: ${item.code}: ${item.message}`), []);
  assert.ok(read.has("goals.snapshot.read"), "the historical project snapshot must actually succeed");
  assert.ok(read.has("plugins.project_reach.list"), "the real project settings read must actually succeed");
  assert.ok(read.size > 10, "the directory must actually be read");
}

for (const kind of goalEventHistoryKinds) {
  test(`every parameterless read accepts the history-carrying ${kind} project`, { timeout: 60_000 }, async t => {
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
  // The project's folders are read from the Home catalog (`projects.directories.get@1`, project-workspace-actions.ts), as the production
  // Host is wired: here the catalog's read of them fails. The project is a standalone copy the catalog has no plugin record of.
  const catalog: Pick<MolisWorkProjectCatalog, "projectDirectories" | "projectPluginMembership"> = {
    projectDirectories: () => { reads++; throw failure; },
    projectPluginMembership: () => { throw Object.assign(new Error("standalone project"), { code: "catalog.project_not_found" }); },
  };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  host.configurePersonalPlanning(home, async (_options, operation) => operation(catalog as MolisWorkProjectCatalog));
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
    assert.ok(reads >= 2, "the project's folders must actually be read");
  } finally { await host.close(); }

  // With no Home catalog wired, nothing can answer the project's folders: the state says so instead of showing none.
  const bare = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const state = (await bare.inspectActions(base, ref)).find(view => view.capability_id === "coding.state" && view.version === 1);
    assert.ok(state);
    await assert.rejects(bare.actionClient(ref).invoke({ ...base, permissions: state.action.permissions }, state, {}),
      { code: "actions.service_unavailable", message: "项目目录服务尚未装配" });
  } finally { await bare.close(); }
});
