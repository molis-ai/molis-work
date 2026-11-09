import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, DEMO_PROJECT_ID, workspaceRefFor } from "@molis-ai/molis-work-app-local-host";
import { projectDirectoryActions, projectSettingsCapabilities, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
  workspaceReadActions, writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { goalPluginActions } from "@molis-ai/molis-work-plugin-goals/contract";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

// The project's Runtime pick (BL-372) is registered for every project, whether or not the Host knows folders.
const runtimeEntries = [projectSettingsCapabilities.runtime, projectSettingsCapabilities.selectRuntime];
// The Host's reads of a project folder, registered only when the Host knows the folders.
const workspaceEntries = [workspaceReadActions.git, workspaceReadActions.file];
// The project's inputs and output (specs/shared-sources-and-surfaces §3), answered from the Home catalog for every project;
// the browsing folder is page state and has no action any more (SSC-05).
const directoryEntries = Object.values(projectDirectoryActions);
// Git's and the parallel writers' Host side: eight plugin-only actions (PG-035), no longer typed entries.
const gitHostActions = [prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
  ...Object.values(writerDirectoryCapabilities), ...Object.values(writerIntegrationCapabilities)];
const keys = (entries: readonly HostCapabilityDescriptor[]) => entries.filter(entry => !entry.action)
  .map(({ capability_id, version, operation }) => `${capability_id}@${version}:${operation}`).sort();

test("W3-07-9-01: the assembled Host registers no typed entry and exposes Goals through actions", async () => {
  const home = await mkdtemp(join(tmpdir(), "typed-registry-inventory-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const project = await catalog.createProject({ display_name: "Inventory", actor_id: LOCAL_PERSON_ACTOR_ID });
  catalog.close();
  const ref = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const host: MolisWorkLocalHost = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    workspacesFor: projectId => withCatalog({ homeDirectory: home }, item => item.listWorkspaceDirectory(projectId)),
    workspaceFor: projectId => withCatalog({ homeDirectory: home }, item => workspaceRefFor(item, projectId)) });
  const withCatalog = host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  try {
    await host.withProject(ref, () => undefined);
    assert.deepEqual(keys([...workspaceEntries, ...directoryEntries]), [], "the workspace and directory entries all carry action metadata");
    assert.deepEqual(keys(host.status().capabilities), [], "the Agent Host's were the last typed entries (R8 batch 4)");
    for (const definition of gitHostActions) {
      assert.ok(host.status().capabilities.find(row => row.capability_id === definition.capability_id)?.action, `${definition.capability_id} is registered as an action`);
    }
    const user = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, audience: "user" as const,
      project_id: ref.project_id, permissions: ["goals:read", "goals:write", "projects:settings", "workspace:read"] };
    const workspaceDirectory = await host.actionClient(ref).discover(user);
    for (const definition of [...workspaceEntries, ...directoryEntries]) {
      assert.ok(workspaceDirectory.some(row => row.capability_id === definition.capability_id && row.availability.available), definition.capability_id);
    }
    assert.deepEqual(workspaceDirectory.filter(row => row.capability_id.startsWith("projects.settings.") && !runtimeEntries.some(entry => entry.capability_id === row.capability_id)), [],
      "no project setting says where a panel browses (SSC-05)");
    // A change of the project's folders is made and read back through the actions, as the browsing choice once was.
    const folder = join(home, "output");
    await mkdir(folder);
    const { revision } = await host.actionClient(ref).invoke(user, projectDirectoryActions.get, {}) as ProjectDirectories;
    await host.actionClient(ref).invoke(user, projectDirectoryActions.setOutput, { workspace_path: folder, expected_revision: revision });
    const read = await host.actionClient(ref).invoke(user, projectDirectoryActions.get, {}) as ProjectDirectories;
    assert.equal(read.directories.find(row => row.roles.includes("output"))?.canonical_path, await realpath(folder));
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, audience: "user" as const,
      project_id: ref.project_id, permissions: ["goals:read", "goals:write"] };
    const directory = await host.actionClient(ref).discover(caller);
    for (const definition of Object.values(goalPluginActions)) {
      assert.ok(directory.some(entry => entry.capability_id === definition.capability_id && entry.version === definition.version), definition.capability_id);
      assert.ok(!host.status().capabilities.some(entry => !entry.action && entry.capability_id === definition.capability_id), definition.capability_id);
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("W3-07-9-01: absent workspace wiring registers neither workspace read and does not change the typed inventory", async () => {
  const home = await mkdtemp(join(tmpdir(), "typed-registry-no-workspace-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "unopened-project.db"), projectId: DEMO_PROJECT_ID });
  try {
    assert.deepEqual(keys(host.status().capabilities), [], "no typed entry either way");
    for (const definition of runtimeEntries) assert.ok(host.status().capabilities.find(entry => entry.capability_id === definition.capability_id)?.action, definition.capability_id);
    for (const definition of workspaceEntries) {
      assert.ok(!host.status().capabilities.some(entry => entry.capability_id === definition.capability_id), definition.capability_id);
      const availability = host.client(ref).availability(definition);
      assert.equal(availability.available, false, definition.capability_id);
      assert.equal(!availability.available && availability.code, "actions.dependency_missing", definition.capability_id);
    }
    // Without the Home catalog nothing answers the project's folders: they are unavailable, never an empty answer.
    for (const definition of directoryEntries) assert.equal(host.client(ref).availability(definition).available, false, definition.capability_id);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
