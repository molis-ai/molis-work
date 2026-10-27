import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { dualPlugin } from "./fixtures/dual-plugin.js";

// BL-588, S-75 ⑥ (RAC-996): in the resident Host, what runs in its process without `host` trust is the Host's test fixtures, as the very objects it
// was given, and nothing else: another unsigned definition is refused by the project's Runtime and by the Home's alike.

const denied = (error: unknown) => error instanceof ActionError && error.code === "plugin.in_process_denied";

test("RAC-996 S-75 the project's and the Home's Runtime run the Host's fixtures and refuse any other unsigned code in the process", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "in-process-host-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "进程内", actor_id: "owner" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const given = dualPlugin("inproc"), other = dualPlugin("outsider");
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, pluginFixtures: { home: [{ definition: given.home, dual_instance: true }], project: [given.project] } });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });

  const homePlatform = await host.homePlugins!.ready();
  assert.equal(homePlatform.supervisor.state(given.id)?.status, "running", homePlatform.supervisor.state(given.id)?.message ?? "the Home's fixture runs");
  await host.localPersonContext(reference); // looking at the project's actions starts its Runtime
  const projectPlatform = await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, runtime.project_id));
  assert.ok(projectPlatform, "the project's platform is running");
  assert.equal(projectPlatform.supervisor.state(given.id)?.status, "running", "the project's fixture runs");

  for (const [where, platform, definition] of [["Home", homePlatform, other.home], ["project", projectPlatform, other.project]] as const) {
    assert.throws(() => platform.runtime.install({ definition, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), denied, `${where}: a definition the Host was not given`);
    assert.deepEqual(platform.runtime.list().filter(record => record.plugin_id === other.id), [], `${where}: nothing of it was installed`);
  }
  // Being the same plugin by name is not being the fixture: a copy of a fixture's definition is another object.
  assert.throws(() => homePlatform.runtime.install({ definition: { ...given.home }, deployment: "local", grants: [], trust: UNSIGNED_TRUST }), denied);
});
