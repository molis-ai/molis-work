import assert from "node:assert/strict";
import test from "node:test";
import { ensureProjectRoot } from "./fixtures/goals-board.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitActions, GIT_ACTIONS } from "@molis-ai/molis-work-plugin-git";
import { prepareGitIndexCapability, prepareGitOperationCapability, readGitOperationsCapability, readGitResultsCapability } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { directoriesOf } from "./fixtures/catalog-host.js";

test("Git production Host actions keep fixed ownership, reject impersonation and need their review backend", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "git-host-actions-"));
  await writeFile(join(home, "note.txt"), "固定🙂\n");
  execFileSync("git", ["init", "-q", home]);
  execFileSync("git", ["-C", home, "add", "note.txt"]);
  const workspace = { workspace_id: "fixture", canonical_path: await realpath(home), display_name: "Fixture", realpath_verified: true };
  let reads = 0;
  // No Home: a Host with one always starts the system Agent service, which provides the Git review backend this test registers itself.
  const host = new MolisWorkLocalHost({ completeText: null,
    workspacesFor: async () => { reads++; return [workspace]; },
    directoriesFor: directoriesOf([workspace]),
  });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project" });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private", "workspace:read"] };
  const client = host.actionClient(reference), bound = bindActionClient(client, () => caller);
  try {
    // The project's plugins start as the workbench starts them on opening the project; this Host has no Home, so no Goals is among them.
    await ensureProjectRoot(host, reference);
    await startProjectPlugins(host, reference);
    const directory = await client.discover(caller);
    // Actions that need the Host review backend: staging, its results, and commit/branch/push/PR with their log.
    const reviewActions = [gitActions.prepareIndex.capability_id, gitActions.results.capability_id, gitActions.saveResult.capability_id,
      gitActions.operations.capability_id, gitActions.prepareOperation.capability_id];
    for (const definition of GIT_ACTIONS) assert.equal(directory.find(row => row.capability_id === definition.capability_id)?.availability.available, !reviewActions.includes(definition.capability_id), definition.capability_id);
    assert.equal(reads, 0, "registration must not perform business reads");
    const stateOf = async (id: string) => (await client.discover(caller)).find(row => row.capability_id === id)!.availability;
    await assert.rejects(bound.invoke(gitActions.prepareIndex, { workspace_id: "fixture", path: ["note.txt"], action: "stage", revision: "unused", operation_id: "no-handler" }), { code: "actions.dependency_missing" });
    assert.equal(reads, 0, "missing review dependency is checked before even reading the workspace");
    let reviewed = 0;
    const stopWrongVersion = host.registerAction({ ...prepareGitIndexCapability, version: 2 }, () => { reviewed++; return { review_id: "wrong" }; });
    assert.equal((await stateOf(gitActions.prepareIndex.capability_id)).available, false); stopWrongVersion();
    const stopPrepare = host.registerAction(prepareGitIndexCapability, () => { reviewed++; return { review_id: "fixture" }; });
    const stopResults = host.registerAction(readGitResultsCapability, () => { reviewed++; return []; });
    const stopOperation = host.registerAction(prepareGitOperationCapability, () => { reviewed++; return { review_id: "fixture" }; });
    const stopOperations = host.registerAction(readGitOperationsCapability, () => { reviewed++; return []; });
    for (const id of reviewActions) assert.equal((await stateOf(id)).available, true);
    assert.equal(reviewed, 0); assert.equal(reads, 0);
    stopPrepare(); assert.equal((await stateOf(gitActions.prepareIndex.capability_id)).available, false);
    assert.equal((await stateOf(gitActions.results.capability_id)).available, true);
    stopResults(); assert.equal((await stateOf(gitActions.results.capability_id)).available, false);
    stopOperation(); assert.equal((await stateOf(gitActions.prepareOperation.capability_id)).available, false);
    stopOperations(); assert.equal((await stateOf(gitActions.operations.capability_id)).available, false);
    assert.equal((await stateOf(gitActions.summary.capability_id)).available, true, "reading where the repository stands needs no review backend");
    assert.equal((await stateOf(gitActions.state.capability_id)).available, true, "read-only Git needs no review backend");
    const foreign = { ...caller, actor_id: "runtime:foreign", audience: "mcp" as const };
    const foreignDirectory = await client.discover(foreign);
    // The side panel's file source is for the local person only (specs/archive/side-panel): an external client never sees it.
    for (const definition of GIT_ACTIONS.filter(definition => !definition.action.audiences.includes("mcp"))) {
      assert.equal(foreignDirectory.some(row => row.capability_id === definition.capability_id), false, definition.capability_id);
    }
    for (const definition of GIT_ACTIONS.filter(definition => definition.action.audiences.includes("mcp"))) {
      const item = foreignDirectory.find(row => row.capability_id === definition.capability_id)!;
      assert.deepEqual(item.availability, { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" });
    }
    await assert.rejects(client.invoke(foreign, gitActions.state, {}), { code: "actions.owner_mismatch" });
    assert.equal(reads, 0);
    const git = await bound.invoke(gitActions.state, {});
    assert.equal(git.view.phase, "ready"); assert.equal(git.view.staged[0]?.path[0], "note.txt");
    const diff = await bound.invoke(gitActions.selectDiff, { workspace_id: "fixture", path: ["note.txt"], side: "index" });
    assert.equal(diff.result.outcome, "diff"); assert.ok(diff.selected?.reference);
    const published = await host.withProject(reference, runtime => runtime.processItems.query.getArtifactVersion("project", diff.selected!.reference));
    assert.equal(published?.owner_actor_id, "web-user");
    await host.closeProject(reference);
    assert.deepEqual((await bound.invoke(gitActions.state, {})).selected, diff.selected);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
