import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores } from "@molis-ai/molis-work-app-local-host";
import { agentHostCapabilities as agent, type AgentReviewReceipt } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";

const CODING = "io.molis.work.coding";
const ref = { session_id: "sdk", run_id: "r" };
const owner = { kind: "agent-review" as const, project_id: DEMO_PROJECT_ID, plugin_id: CODING, install_id: "install" };
const settled = (id: string): AgentReviewReceipt => ({ review_id: id, status: "approved", decided_by: "web-user", decided_at: null, note: null, effect_settled: true, effect_error: null });

/** A reviewed integration of this round's result: a child's (`subagent_id`) or, without one, the round's own worktree. */
function integration(id: string, files: Array<{ path: string; before_text: string | null; after_text: string | null }>, receipt: AgentReviewReceipt | null, subagent_id?: string) {
  return { request: { reference: { owner, id, version: "proposal-1" }, review_id: id, project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: null,
    operation: { operation_id: `op-${id}`, workspace_id: "work", kind: "git-integration" }, kind: "git-integration",
    document: { kind: "git-integration", target_directory: "/work", source: { ...ref, ...(subagent_id ? { subagent_id } : {}), branch: "writer/x", base_commit: "abc", directory: "/work-x" },
      files: files.map(file => ({ ...file, before_mode: file.before_text === null ? null : "100644", after_mode: file.after_text === null ? null : "100644" })) } }, receipt };
}

// specs/backlog/BL-coding-changeset-deleted-kind DEL-01～DEL-06.
test("DEL-01～06: the fixed change set lists the files a confirmed integration of this round removed, and nothing a command or an unknown outcome may have", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-changeset-deletions-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "app", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", new Date().toISOString());
  const edit = { request: { reference: { owner, id: "edit", version: "proposal-1" }, review_id: "edit", project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: "cart.mjs", exists: true, before_text: "old\n", after_text: "new\n" } }, receipt: settled("edit") };
  // DEL-03: a delete command that ran and exited 0 is only its text; it proves no path.
  const command = { request: { reference: { owner, id: "rm", version: "proposal-1" }, review_id: "rm", project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: ref, kind: "command",
    document: { kind: "command", command: "rm", args: ["cmd.ts"], cwd: ".", timeout_ms: 1000 } }, receipt: settled("rm") };
  const child = integration("child", [{ path: "src/gone.ts", before_text: "was\nhere\n", after_text: null }, { path: "src/kept.ts", before_text: "a\n", after_text: "b\n" }], settled("child"), "writer-1");
  const rows = [edit, command, child,
    // DEL-02: a round that ran in its own worktree, its delete command's result brought back by a confirmed integration.
    integration("worktree", [{ path: "old.cfg", before_text: "x=1\n", after_text: null }], settled("worktree")),
    // DEL-03: unknown, failed, rejected and pending integrations remove nothing that can be shown.
    integration("unknown", [{ path: "maybe.ts", before_text: "m\n", after_text: null }], { ...settled("unknown"), effect_settled: false, effect_uncertain: "结果不确定" }, "writer-2"),
    integration("lost", [{ path: "lost.ts", before_text: "l\n", after_text: null }], { ...settled("lost"), delivery_error: "未送达" }, "writer-2"),
    integration("failed", [{ path: "fail.ts", before_text: "f\n", after_text: null }], { ...settled("failed"), effect_settled: false, effect_error: "写入失败" }, "writer-2"),
    integration("rejected", [{ path: "kept-by-person.ts", before_text: "k\n", after_text: null }], { ...settled("rejected"), status: "rejected", effect_settled: false }, "writer-2"),
    integration("pending", [{ path: "waiting.ts", before_text: "w\n", after_text: null }], { ...settled("pending"), status: "pending", effect_settled: false }, "writer-2"),
    // DEL-04: the same receipt read twice counts once.
    structuredClone(child)];
  let readable = true, reads = 0;
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user", escapeHtml: String, translate: (s: string) => s,
    agentHost: { async invoke<I, O>(definition: { capability_id: string }, _args: I): Promise<O> {
      if ([agent.readSession.capability_id, agent.readRun.capability_id, agent.readRunReviews.capability_id].includes(definition.capability_id)) reads++;
      if (!readable) throw new Error("runtime unavailable");
      if (definition.capability_id === agent.readSession.capability_id) return { runs: [ref] } as O;
      if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "completed" } as O;
      if (definition.capability_id === agent.readRunReviews.capability_id) return structuredClone(rows) as O;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((req, res) => { void handleProjectPluginHttp(req, res, new URL(req.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { res.writeHead(500); res.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const prefix = `/api/plugins/${CODING}/sessions/app/runs/r/changeset`;
  const request = async (url = prefix, method = "GET") => { const result = await fetch(`http://127.0.0.1:${address.port}${url}`, { method }); return { status: result.status, body: await result.json() }; };
  const listed = (body: { change: { files: Array<{ path: string; kind: string; added_lines: number; removed_lines: number; review: { review_id: string; execution: string } }> } }) =>
    body.change.files.map(file => [file.path, file.kind, file.review.review_id, file.review.execution, file.added_lines, file.removed_lines].join(" "));
  try {
    const expected = ["cart.mjs modified edit applied 1 1", "src/gone.ts deleted child applied 0 2", "old.cfg deleted worktree applied 0 1"];
    const preview = await request(); assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual(listed(preview.body), expected, "DEL-01/02/03/04: confirmed integration deletions only, each once, after the round's writes");
    assert.equal(preview.body.change.applied, true);
    // DEL-05: the fixed version holds the deletions; reopened, it shows them without reading the runtime again.
    const saved = await request(prefix, "POST"); assert.equal(saved.status, 200); assert.deepEqual(listed(saved.body), expected);
    rows.push(integration("later", [{ path: "later.ts", before_text: "z\n", after_text: null }], settled("later"), "writer-3"));
    readable = false; const before = reads;
    const reopened = await request(prefix + "?fixed=1"); assert.equal(reopened.status, 200);
    assert.deepEqual(listed(reopened.body), expected, "DEL-05: the fixed list stays as it was saved"); assert.deepEqual(reopened.body.reference, saved.body.reference);
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    assert.deepEqual(listed((await request(prefix + "?fixed=1")).body), expected, "DEL-05: reopened after a restart"); assert.equal(reads, before);
    // DEL-06: the reader, the copied patch, Diff and the shared text all say the file is gone.
    const gone = await request(prefix + "?fixed=1&change_index=1");
    assert.equal(gone.body.patch, "--- a/src/gone.ts\n+++ /dev/null\n@@ -1,2 +0,0 @@\n-was\n-here\n");
    assert.match(gone.body.html, /data-kind="delete"/); assert.doesNotMatch(gone.body.html, /data-kind="insert"/);
    const diff = await request(`/api/plugins/io.molis.work.diff/state?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1&change_index=1`);
    assert.equal(diff.status, 200); assert.equal(diff.body.view.files[1].kind, "deleted"); assert.deepEqual(diff.body.view.rows.map((row: { kind: string }) => row.kind), ["delete", "delete"]);
    { const output = await fetch(`http://127.0.0.1:${address.port}${prefix}/output`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_reference: null }) }); assert.equal(output.status, 200, await output.text()); }
    const shared = await request(`/api/plugins/io.molis.work.shelf/project-result?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1`);
    assert.equal(shared.status, 200); assert.match(shared.body.text, /## 修改 2 · src\/gone\.ts[\s\S]*修改后：文件已删除/);
    assert.doesNotMatch(shared.body.text, /maybe\.ts|lost\.ts|fail\.ts|kept-by-person\.ts|waiting\.ts|cmd\.ts|later\.ts/);
    const catalog = await request(`/api/plugins/${CODING}/artifacts`); assert.equal(catalog.body.artifacts[0].file_count, 3);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
