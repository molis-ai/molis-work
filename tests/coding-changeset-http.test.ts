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

// specs/ai-interaction-experience AC-09 (Coding's Diff): the edits reviewed are the ones frozen, feedback lands on their lines.
test("AC-09: Coding freezes original multi-edit reviews, binds feedback to exact lines and restores the same output without runtime reads", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-changeset-http-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  for (const id of ["app", "foreign"]) { await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() }); await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, id, id === "app" ? "sdk" : "other-sdk", new Date().toISOString()); }
  const ref = { session_id: "sdk", run_id: "r" };
  let readable = true, reads = 0;
  const rows = [false, true].map((applied, n) => ({ request: { reference: { owner: { kind: "agent-review" as const, project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding", install_id: "install" }, id: `review-${n}`, version: "proposal-1" }, review_id: `review-${n}`, project_id: DEMO_PROJECT_ID, plugin_id: "io.molis.work.coding", run: ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: "cart.mjs", exists: true, before_text: n ? "new\r\n" : "old\r\n", after_text: n ? "latest <script>\n" : "new\r\n" } },
    receipt: { review_id: `review-${n}`, status: "approved", effect_settled: applied, effect_error: null } }));
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: root, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user", escapeHtml: String, translate: (s: string) => s,
    agentHost: { async invoke<I, O>(definition: { capability_id: string }, args: I): Promise<O> {
      // Files also refreshes project browsing settings before dispatch; count only Agent reads.
      if ([agent.readSession.capability_id, agent.readRun.capability_id, agent.readRunReviews.capability_id].includes(definition.capability_id)) reads++;
      if (!readable) throw new Error("runtime unavailable");
      if (definition.capability_id === agent.readSession.capability_id) return { runs: (args as any[])[0].session_id === "sdk" ? [ref] : [] } as O;
      if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "completed" } as O;
      if (definition.capability_id === agent.readRunReviews.capability_id) return structuredClone(rows) as O;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((req, res) => { void handleProjectPluginHttp(req, res, new URL(req.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { res.writeHead(500); res.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const prefix = '/api/plugins/io.molis.work.coding/sessions/app/runs/r/changeset';
  const request = async (url = prefix, method = "GET", body?: unknown) => { const result = await fetch(`http://127.0.0.1:${address.port}${url}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) }); return { status: result.status, body: await result.json() }; };
  try {
    const preview = await request(); assert.equal(preview.status, 200, JSON.stringify(preview.body)); assert.equal(preview.body.reference, null);
    assert.equal(preview.body.change.files.length, 2); assert.equal(preview.body.change.files[0].review.execution, "unknown"); assert.equal(preview.body.change.files[1].review.execution, "applied");
    const priorMissing = reads;
    assert.equal((await request(prefix+'?fixed=1')).status, 400);
    assert.equal(reads, priorMissing, "missing fixed artifacts must not read runtime to rebuild");
    const saved = await request(prefix, "POST"); assert.equal(saved.status, 200); assert.equal(saved.body.output, null);
    assert.equal((await request(prefix.replace('/app/', '/foreign/'))).status, 400);
    const reading = await request(prefix+'?change_index=1'); assert.match(reading.body.html, /latest &lt;script&gt;/); assert.doesNotMatch(reading.body.html, /latest <script>/);
    const auto = await request(prefix+'?change_index=1&net=auto');
    assert.equal(auto.body.view_mode, "write", "第一次写入结果未知时不拼净变更");
    assert.deepEqual(auto.body.net_groups, [{ path: "cart.mjs", indices: [0, 1], available: false, reason: "有写入未批准或执行结果不确定，只能逐次查看" }]);
    assert.match(reading.body.html, /评论修改后第 1 行/);
    // VUX-33: the reader asks for side by side; the same write, the same escaping and line feedback, in two columns.
    assert.match(reading.body.html, /data-mode="unified"/); assert.doesNotMatch(reading.body.html, /mw-diff-split/);
    const split = await request(prefix+'?change_index=1&layout=split'); assert.match(split.body.html, /data-mode="split"/); assert.match(split.body.html, /<ol class="mw-diff-rows mw-diff-split"/);
    assert.match(split.body.html, /latest &lt;script&gt;/); assert.doesNotMatch(split.body.html, /latest <script>/); assert.match(split.body.html, /评论修改后第 1 行/);
    assert.match((await request(prefix+'?change_index=1&layout=columns')).body.html, /data-mode="unified"/, "an unknown layout reads as unified");
    // VUX-33 复制补丁: the write on show as a patch git takes, each line with its own ending (the CRLF stays), the same in either layout.
    assert.equal(reading.body.patch, "--- a/cart.mjs\n+++ b/cart.mjs\n@@ -1 +1 @@\n-new\r\n+latest <script>\n");
    assert.equal(split.body.patch, reading.body.patch);
    const comments = [{ change_index: 1, side: "before", line: 1, comment: "请保留原行尾", text: "forged" }];
    const feedback = await request(prefix+'/feedback', 'POST', { comments }); assert.equal(feedback.status, 200); assert.match(feedback.body.task, /new\\r\\n/); assert.doesNotMatch(feedback.body.task, /forged/);
    assert.equal((await request(prefix+'/feedback', 'POST', { comments: [{ ...comments[0], line: 3 }] })).status, 400);
    assert.equal((await request(prefix+'/feedback', 'POST', { comments: [{ ...comments[0], change_index: 200 }] })).status, 400);
    assert.equal((await request(prefix+'/output', 'POST', { expected_reference: null })).status, 200);
    const catalogPath = '/api/plugins/io.molis.work.coding/artifacts';
    const catalog = await request(catalogPath);
    assert.equal(catalog.status, 200); assert.equal(catalog.body.artifacts.length, 1);
    const entry = catalog.body.artifacts[0];
    assert.equal(entry.kind, "changeset"); assert.equal(entry.file_count, 2);
    assert.deepEqual(entry.reference, saved.body.reference); assert.equal(entry.change, undefined);
    const shelfResults = await request('/api/plugins/io.molis.work.shelf/project-results');
    assert.equal(shelfResults.status, 200);
    assert.deepEqual(shelfResults.body.results[0].reference, saved.body.reference);
    assert.equal(shelfResults.body.results[0].connected, true, "selected Coding output reaches Shelf through its declared input");
    const shelfPreview = await request('/api/plugins/io.molis.work.shelf/project-result?artifact_id='+encodeURIComponent(saved.body.reference.artifact_id)+'&version=1');
    assert.equal(shelfPreview.status, 200); assert.match(shelfPreview.body.text, /修改 1/); assert.match(shelfPreview.body.text, /修改 2/);
    assert.match(shelfPreview.body.text, /保存时执行状态：执行结果未知/); assert.match(shelfPreview.body.text, /保存时执行状态：已执行/);
    readable = false; const priorReads = reads;
    assert.deepEqual((await request(prefix, 'POST')).body.reference, saved.body.reference);
    const before = await request();
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);
    assert.deepEqual((await request()).body, before.body); assert.equal(reads, priorReads);
    assert.deepEqual((await request(catalogPath)).body, catalog.body);
    assert.equal((await request(prefix+'/feedback', 'POST', { comments })).status, 200);
    assert.equal(reads, priorReads);
    const diff = await request(`/api/plugins/io.molis.work.diff/state?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1&change_index=1`);
    assert.equal(diff.status, 200); assert.equal(diff.body.view.rows.at(-1).text, 'latest <script>');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});

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

// specs/post-anticorruption-roadmap/reference/batches/99.md#acceptance DEL-01～DEL-06, DEL-08.
test("DEL-01～06 DEL-08: the fixed change set lists what a confirmed integration of this round's subtask brought back, removals included, and nothing a command, a worktree integration or an unknown outcome may have", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-changeset-deletions-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = codingSessions(store);
  await sessions.create(noEffect, { project_id: DEMO_PROJECT_ID, session_id: "app", title: "app", runtime_id: "prologue", at: new Date().toISOString() });
  await sessions.setRuntimeSession(noEffect, DEMO_PROJECT_ID, "app", "sdk", new Date().toISOString());
  const edit = { request: { reference: { owner, id: "edit", version: "proposal-1" }, review_id: "edit", project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: "cart.mjs", exists: true, before_text: "old\n", after_text: "new\n" } }, receipt: settled("edit") };
  // DEL-03: a delete command that ran and exited 0 is only its text; it proves no path.
  const command = { request: { reference: { owner, id: "rm", version: "proposal-1" }, review_id: "rm", project_id: DEMO_PROJECT_ID, plugin_id: CODING, run: ref, kind: "command",
    document: { kind: "command", command: "rm", args: ["cmd.ts"], cwd: ".", timeout_ms: 1000 } }, receipt: settled("rm") };
  const child = integration("child", [{ path: "src/gone.ts", before_text: "was\nhere\n", after_text: null }, { path: "src/kept.ts", before_text: "a\n", after_text: "b\n" },
    { path: "src/new.ts", before_text: null, after_text: "n\n" }], settled("child"), "writer-1");
  const rows = [edit, command, child,
    // DEL-02: a worktree the session ran in may hold several rounds and its integration brings all of them back, so even a
    // confirmed one names no single round: nothing listed.
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
    // DEL-08: the same integration's additions and changes are listed with its deletion, from that one receipt.
    const expected = ["cart.mjs modified edit applied 1 1", "src/gone.ts deleted child applied 0 2", "src/kept.ts modified child applied 1 1", "src/new.ts added child applied 1 0"];
    const preview = await request(); assert.equal(preview.status, 200, JSON.stringify(preview.body));
    assert.deepEqual(listed(preview.body), expected, "DEL-01/02/03/04/08: what a confirmed subtask integration brought back, each once, after the round's writes");
    assert.equal(preview.body.change.applied, true);
    // DEL-05: the fixed version holds the deletions; reopened, it shows them without reading the runtime again.
    const saved = await request(prefix, "POST"); assert.equal(saved.status, 200); assert.deepEqual(listed(saved.body), expected);
    assert.deepEqual((await request(prefix, "POST")).body.reference, saved.body.reference, "DEL-04: saving again keeps the same fixed version");
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
    // DEL-08: a file the subtask added reads as created from nothing.
    assert.match((await request(prefix + "?fixed=1&change_index=3")).body.patch, /^--- \/dev\/null\n\+\+\+ b\/src\/new\.ts\n/);
    const diff = await request(`/api/plugins/io.molis.work.diff/state?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1&change_index=1`);
    assert.equal(diff.status, 200); assert.equal(diff.body.view.files[1].kind, "deleted"); assert.deepEqual(diff.body.view.rows.map((row: { kind: string }) => row.kind), ["delete", "delete"]);
    { const output = await fetch(`http://127.0.0.1:${address.port}${prefix}/output`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expected_reference: null }) }); assert.equal(output.status, 200, await output.text()); }
    const shared = await request(`/api/plugins/io.molis.work.shelf/project-result?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1`);
    assert.equal(shared.status, 200); assert.match(shared.body.text, /## 修改 2 · src\/gone\.ts[^#]*修改后：文件已删除/);
    assert.doesNotMatch(shared.body.text, /maybe\.ts|lost\.ts|fail\.ts|kept-by-person\.ts|waiting\.ts|cmd\.ts|later\.ts|old\.cfg/);
    const catalog = await request(`/api/plugins/${CODING}/artifacts`); assert.equal(catalog.body.artifacts[0].file_count, 4);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
