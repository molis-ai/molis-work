import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { filesActions, FILES_ACTIONS } from "@molis-ai/molis-work-plugin-files";
import { gitActions, GIT_ACTIONS } from "@molis-ai/molis-work-plugin-git";
import { prepareGitIndexCapability, readGitResultsCapability } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { bindActionClient, ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";

test("Files/Git production Host actions keep fixed ownership, reject impersonation and revalidate before publishing", { timeout: 30_000 }, async () => {
  const home = await mkdtemp(join(tmpdir(), "files-git-actions-"));
  await writeFile(join(home, "note.txt"), "固定🙂\n");
  execFileSync("git", ["init", "-q", home]);
  execFileSync("git", ["-C", home, "add", "note.txt"]);
  const workspace = { workspace_id: "fixture", canonical_path: await realpath(home), display_name: "Fixture", realpath_verified: true };
  let reads = 0, pauseAt = -1, release!: () => void, enter!: () => void, allowed = true, enabled = true;
  let barrier = Promise.resolve();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null,
    actionAvailability: (_caller, action) => !enabled && action.provider.plugin_id === "io.molis.work.files"
      ? { available: false, code: "actions.plugin_disabled", reason: "已停用" } : { available: true },
    workspacesFor: async () => { if (++reads === pauseAt) { enter(); await barrier; } return [workspace]; },
  });
  const reference = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), projectId: "project", boardId: "board" });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: "project", audience: "user", permissions: ["artifact:read", "artifact:write", "storage:private"],
    validate_authority: () => { if (!allowed) throw new ActionError("actions.revoked", "已撤权"); } };
  const client = host.actionClient(reference), bound = bindActionClient(client, () => caller);
  try {
    await host.withProject(reference, runtime => runtime.coordinator.initializeBoard({ board_id: "board", title: "Workspace actions", actor_id: caller.actor_id, idempotency_key: "init" }));
    const directory = await client.discover(caller);
    const reviewActions = [gitActions.prepareIndex.capability_id, gitActions.results.capability_id, gitActions.saveResult.capability_id];
    for (const definition of [...FILES_ACTIONS, ...GIT_ACTIONS]) assert.equal(directory.find(row => row.capability_id === definition.capability_id)?.availability.available, !reviewActions.includes(definition.capability_id), definition.capability_id);
    assert.equal(reads, 0, "registration must not perform business reads");
    const stateOf = async (id: string) => (await client.discover(caller)).find(row => row.capability_id === id)!.availability;
    await assert.rejects(bound.invoke(gitActions.prepareIndex, { workspace_id: "fixture", path: ["note.txt"], action: "stage", revision: "unused", operation_id: "no-handler" }), { code: "actions.dependency_missing" });
    assert.equal(reads, 0, "missing review dependency is checked before even reading the workspace");
    let reviewed = 0;
    const stopWrongVersion = host.registerCapability({ ...prepareGitIndexCapability, version: 2 }, () => { reviewed++; return { review_id: "wrong" }; });
    assert.equal((await stateOf(gitActions.prepareIndex.capability_id)).available, false); stopWrongVersion();
    const stopPrepare = host.registerCapability(prepareGitIndexCapability, () => { reviewed++; return { review_id: "fixture" }; });
    const stopResults = host.registerCapability(readGitResultsCapability, () => { reviewed++; return []; });
    for (const id of reviewActions) assert.equal((await stateOf(id)).available, true);
    assert.equal(reviewed, 0); assert.equal(reads, 0);
    stopPrepare(); assert.equal((await stateOf(gitActions.prepareIndex.capability_id)).available, false);
    assert.equal((await stateOf(gitActions.results.capability_id)).available, true);
    stopResults(); assert.equal((await stateOf(gitActions.results.capability_id)).available, false);
    assert.equal((await stateOf(gitActions.state.capability_id)).available, true, "read-only Git needs no review backend");
    const foreign = { ...caller, actor_id: "runtime:foreign", audience: "mcp" as const };
    const foreignDirectory = await client.discover(foreign);
    for (const definition of [...FILES_ACTIONS, ...GIT_ACTIONS]) {
      const item = foreignDirectory.find(row => row.capability_id === definition.capability_id)!;
      assert.deepEqual(item.availability, { available: false, code: "actions.owner_mismatch", reason: "此入口使用本地用户的个人状态与成果；当前调用者尚未接通独立归属，不能借用该用户身份" });
    }
    await assert.rejects(client.invoke(foreign, filesActions.open, { workspace_id: "fixture", path: ["note.txt"] }), { code: "actions.owner_mismatch" });
    assert.equal(reads, 0);
    await bound.invoke(filesActions.state, {});
    const opened = await bound.invoke(filesActions.open, { workspace_id: "fixture", path: ["note.txt"] });
    assert.equal(opened.result.outcome, "text");
    if (opened.result.outcome !== "text") throw new Error("expected text");
    const input = { workspace_id: "fixture", path: ["note.txt"], port: "before" as const, fingerprint: opened.result.fingerprint };
    const first = await bound.invoke(filesActions.capture, input);
    assert.equal(first.saved.artifact.artifact_id, "io.molis.work.files:before");
    assert.equal(first.saved.artifact.owner_actor_id, "web-user");
    assert.equal(first.saved.artifact.created_by, "web-user");
    assert.equal(first.saved.artifact.version, 1);
    const git = await bound.invoke(gitActions.state, {});
    assert.equal(git.view.phase, "ready"); assert.equal(git.view.staged[0]?.path[0], "note.txt");
    const diff = await bound.invoke(gitActions.selectDiff, { workspace_id: "fixture", path: ["note.txt"], side: "index" });
    assert.equal(diff.result.outcome, "diff"); assert.ok(diff.selected?.reference);
    const published = await host.withProject(reference, runtime => runtime.coordinator.artifacts.query.getArtifactVersion("board", diff.selected!.reference));
    assert.equal(published?.owner_actor_id, "web-user");
    for (const invalid of [{ ...input, actor_id: "other" }, { ...input, path: ["..", "secret"] }, { ...input, fingerprint: "stale" }]) {
      await assert.rejects(bound.invoke(filesActions.capture, invalid));
    }
    for (const mode of ["revoked", "disabled", "cancelled"] as const) {
      const entered = new Promise<void>(resolve => { enter = resolve; });
      barrier = new Promise<void>(resolve => { release = resolve; });
      pauseAt = reads + 3; // selected workspace after the real file read, before its fixed publication
      const controller = new AbortController();
      const pending = client.invoke({ ...caller, signal: controller.signal }, filesActions.capture, input);
      const rejection = assert.rejects(pending, mode === "revoked" ? { code: "actions.revoked" }
        : mode === "disabled" ? { code: "actions.plugin_disabled" } : { name: "AbortError" });
      await entered;
      if (mode === "revoked") allowed = false;
      if (mode === "disabled") enabled = false;
      if (mode === "cancelled") controller.abort();
      release(); await rejection;
      allowed = true; enabled = true; pauseAt = -1;
      assert.equal(await host.withProject(reference, runtime => runtime.coordinator.artifacts.query.latestArtifactVersion("board", first.saved.artifact.artifact_id)?.version), 1, mode);
    }
    const recovered = await bound.invoke(filesActions.capture, input);
    assert.equal(recovered.saved.artifact.version, 2);
    await host.closeProject(reference);
    const restored = await bound.invoke(filesActions.state, {});
    assert.deepEqual(restored.position, { workspace_id: "fixture", path: ["note.txt"] });
    assert.deepEqual((await bound.invoke(gitActions.state, {})).selected, diff.selected);
  } finally { release?.(); await host.close(); await rm(home, { recursive: true, force: true }); }
});
