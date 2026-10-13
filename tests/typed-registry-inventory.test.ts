import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities } from "@molis-ai/molis-work-contracts/services/agent-host";
import { scheduleCapabilities } from "@molis-ai/molis-work-contracts/services/scheduler";
import { projectsCapabilities, projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
  writerDirectoryCapabilities, writerIntegrationCapabilities } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { goalPluginActions } from "@molis-ai/molis-work-contracts/modules/goal-actions";
import type { HostCapabilityDescriptor } from "@molis-ai/molis-work-contracts/platform/app-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";

const workspaceEntries = [projectsCapabilities.listWorkspaces, projectsCapabilities.readWorkspace,
  ...Object.values(projectSettingsCapabilities)];
const internalServices = [...Object.values(agentHostCapabilities), ...Object.values(scheduleCapabilities),
  prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability,
  ...Object.values(writerDirectoryCapabilities), ...Object.values(writerIntegrationCapabilities)];
const keys = (entries: readonly HostCapabilityDescriptor[]) => entries.filter(entry => !entry.action)
  .map(({ capability_id, version, operation }) => `${capability_id}@${version}:${operation}`).sort();

test("W3-07-9-01: the assembled Host registers only the remaining internal services and exposes Goals through actions", async () => {
  const home = await mkdtemp(join(tmpdir(), "typed-registry-inventory-"));
  const databasePath = join(home, "project.db");
  seedDemoBoard(databasePath);
  const ref = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const workspace = { workspace_id: "work", canonical_path: home, display_name: "Inventory", realpath_verified: true };
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, workspacesFor: () => [workspace], workspaceFor: () => workspace });
  try {
    await host.withProject(ref, () => undefined);
    assert.deepEqual(keys(workspaceEntries), [], "all five workspace entries already carry action metadata");
    assert.deepEqual(keys(host.status().capabilities), keys(internalServices));
    for (const definition of workspaceEntries) assert.equal(host.client(ref).availability(definition).available, true, definition.capability_id);
    const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user" as const, audience: "management" as const,
      project_id: ref.project_id, permissions: ["goals:read", "goals:write"] };
    const directory = await host.actionClient(ref).discover(caller);
    for (const definition of Object.values(goalPluginActions)) {
      assert.ok(directory.some(entry => entry.capability_id === definition.capability_id && entry.version === definition.version), definition.capability_id);
      assert.ok(!host.status().capabilities.some(entry => !entry.action && entry.capability_id === definition.capability_id), definition.capability_id);
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});

test("W3-07-9-01: absent workspace wiring registers none of its five actions and does not change the typed inventory", async () => {
  const home = await mkdtemp(join(tmpdir(), "typed-registry-no-workspace-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "unopened-project.db"), projectId: DEMO_PROJECT_ID });
  try {
    assert.deepEqual(keys(host.status().capabilities), keys(internalServices));
    for (const definition of workspaceEntries) {
      assert.ok(!host.status().capabilities.some(entry => entry.capability_id === definition.capability_id), definition.capability_id);
      const availability = host.client(ref).availability(definition);
      assert.equal(availability.available, false, definition.capability_id);
      assert.equal(!availability.available && availability.code, "actions.dependency_missing", definition.capability_id);
    }
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
