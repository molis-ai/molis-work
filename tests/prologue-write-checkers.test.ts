import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MolisWorkLocalHost, composeAgentHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentWriteCheckerActions, type AgentWriteCheckerList } from "@molis-ai/molis-work-contracts/services/agent-host";

test("BL221-REFUSAL-03 a malformed persisted checker is refused without rewriting it or another workspace", { timeout: 30_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "bl221-write-checkers-"));
  const home = join(root, "home"), storageRoot = join(root, "runtime");
  const workspaces = ["broken", "healthy"].map(id => ({ workspace_id: id, canonical_path: join(root, id), realpath_verified: true, display_name: id }));
  await Promise.all(workspaces.map(workspace => mkdir(workspace.canonical_path)));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Write checkers", actor_id: "web-user" }));
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const person = { actor_id: "web-user", project_id: reference.project_id, audience: "user" as const, permissions: ["projects:settings"] };
  const checker = { checker_id: "node", display_name: "Node", executable: "node", args: ["--check", "{file}"], applies_to: [".js"], cwd: ".", timeout_ms: 30_000 };
  let models = 0;
  const open = () => {
    const host = new MolisWorkLocalHost({ completeText: null });
    const composition = composeAgentHost({ localHost: host, homeDirectory: home, workspaceFor: () => workspaces[0]!, workspacesFor: () => workspaces,
      prologue: { storageRoot, modelConfiguration: async () => { models++; throw new Error("this checker test never calls a model"); } } });
    return { host, composition, client: host.actionClient(reference) };
  };
  let active: ReturnType<typeof open> | undefined;
  const close = async () => { if (active) { const current = active; active = undefined; await current.composition.dispose(); await current.host.close(); } };
  try {
    active = open();
    for (const workspace of workspaces) await active.client.invoke(person, agentWriteCheckerActions.save, {
      workspace_id: workspace.workspace_id, expected_version: 0, checkers: [checker],
    });
    const expected = { lists: workspaces.map(workspace => ({ workspace_id: workspace.workspace_id, version: 1, checkers: [checker] })) };
    assert.deepEqual(await active.client.invoke(person, agentWriteCheckerActions.list, {}), expected, "both valid records use the production list");
    await close();
    const records = join(storageRoot, "records");
    // The real SDK scopes kind directories by its app identity; use the record it actually saved.
    const kind = (await readdir(records)).find(name => name.endsWith("~molis-write-checkers"));
    assert.ok(kind, "the production save persisted the SDK checker kind");
    const directory = join(records, kind);
    const files = await Promise.all((await readdir(directory)).filter(name => name.endsWith(".json")).map(async name => {
      const path = join(directory, name), text = await readFile(path, "utf8");
      return { path, text, record: JSON.parse(text) as { metadata: { workspace_id: string; checkers: Array<Record<string, unknown>> } } };
    }));
    const broken = files.find(file => file.record.metadata.workspace_id === "broken")!;
    const healthy = files.find(file => file.record.metadata.workspace_id === "healthy")!;
    assert.ok(broken && healthy, "the save produced records for both workspaces, without reproducing the private record id");
    broken.record.metadata.checkers[0]!.args = [17];
    const malformed = JSON.stringify(broken.record);
    await writeFile(broken.path, malformed);
    active = open();
    await assert.rejects(active.client.invoke(person, agentWriteCheckerActions.list, {}), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "agent.write_checker_unreadable");
      assert.equal(error.kind, "internal");
      return true;
    });
    assert.equal(await readFile(broken.path, "utf8"), malformed, "rejecting an unreadable record does not repair or replace it");
    assert.equal(await readFile(healthy.path, "utf8"), healthy.text, "the healthy workspace is unchanged");
    await close();
    await writeFile(broken.path, broken.text);
    active = open();
    assert.deepEqual(await active.client.invoke(person, agentWriteCheckerActions.list, {}) as { lists: AgentWriteCheckerList[] }, expected,
      "after restoring valid persisted data, the same public list returns both original versions and checkers");
    assert.equal(models, 0, "listing checkers never calls the model configuration");
  } finally { try { await close(); } finally { await rm(root, { recursive: true, force: true }); } }
});
