import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_BOARD_ID, seedDemoBoard, releaseCodingSurface } from "@molis-ai/molis-work-app-local-host";
import { CodingSessionStore } from "@molis-ai/molis-work-plugin-coding";
import { agentHostCapabilities as agent } from "@molis-ai/molis-work-contracts/services/agent-host";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";

test("Coding freezes original multi-edit reviews, binds feedback to exact lines and restores the same output without runtime reads", async () => {
  const root = mkdtempSync(join(tmpdir(), "coding-changeset-http-")), path = join(root, "board.db"); seedDemoBoard(path);
  const store = new LocalProjectDatabase(path), sessions = new CodingSessionStore(store.db);
  for (const id of ["app", "foreign"]) { sessions.create({ board_id: DEMO_BOARD_ID, session_id: id, title: id, runtime_id: "prologue", at: new Date().toISOString() }); sessions.setRuntimeSession(DEMO_BOARD_ID, id, id === "app" ? "sdk" : "other-sdk", new Date().toISOString()); }
  const ref = { session_id: "sdk", run_id: "r" };
  let readable = true, reads = 0;
  const rows = [false, true].map((applied, n) => ({ request: { review_id: `review-${n}`, board_id: DEMO_BOARD_ID, plugin_id: "io.molis.work.coding", run: ref, kind: "text-edit",
    document: { kind: "text-edit", target_path: "cart.mjs", exists: true, before_text: n ? "new\r\n" : "old\r\n", after_text: n ? "latest <script>\n" : "new\r\n" } },
    receipt: { review_id: `review-${n}`, status: "approved", effect_settled: applied, effect_error: null } }));
  const host = () => ({ store, homeDirectory: root, boardId: DEMO_BOARD_ID, actions: pluginActions(store, DEMO_BOARD_ID), actorId: "web-user", goalTitle: () => undefined, escapeHtml: String, translate: (s: string) => s,
    execution: { ready: async () => {}, models: async () => [] }, capabilities: { async invoke<I, O>(definition: { capability_id: string }, args: I): Promise<O> {
      // Files also refreshes project browsing settings before dispatch; count only Agent reads.
      if ([agent.readSession.capability_id, agent.readRun.capability_id, agent.readRunReviews.capability_id].includes(definition.capability_id)) reads++;
      if (!readable) throw new Error("runtime unavailable");
      if (definition.capability_id === agent.readSession.capability_id) return { runs: (args as any[])[0].session_id === "sdk" ? [ref] : [] } as O;
      if (definition.capability_id === agent.readRun.capability_id) return { ref, phase: "completed" } as O;
      if (definition.capability_id === agent.readRunReviews.capability_id) return structuredClone(rows) as O;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } } });
  const server = createServer((req, res) => { void handleCodingPluginHttp(req, res, new URL(req.url!, "http://localhost"), host()).catch(error => { res.writeHead(500); res.end(String(error)); }); });
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
    await releaseCodingSurface(store, DEMO_BOARD_ID);
    assert.deepEqual((await request()).body, before.body); assert.equal(reads, priorReads);
    assert.deepEqual((await request(catalogPath)).body, catalog.body);
    assert.equal((await request(prefix+'/feedback', 'POST', { comments })).status, 200);
    assert.equal(reads, priorReads);
    const diff = await request(`/api/plugins/io.molis.work.diff/state?artifact_id=${encodeURIComponent(saved.body.reference.artifact_id)}&version=1&change_index=1`);
    assert.equal(diff.status, 200); assert.equal(diff.body.view.rows.at(-1).text, 'latest <script>');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await releaseCodingSurface(store, DEMO_BOARD_ID); store.close(); rmSync(root, { recursive: true, force: true }); }
});
