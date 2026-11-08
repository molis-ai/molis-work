import { captureHostLog, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { definePlugin, defineSearchEntriesAction, bindSearchEntriesHandler, defineSubjectContextAction, subjectContext } from "@molis-ai/molis-work-plugin-sdk";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { homeSqlitePath, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { knowledgeLocateData } from "@molis-ai/molis-work-service-knowledge";
import { knowledgeActions, type KnowledgeCardsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openTestHome } from "./fixtures/test-home.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { isKnowledgeOrganize, organizedCardFor } from "./fixtures/knowledge-organize.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

/** Hold the actual SDK's first HTTP request after receiving the full material. */
async function heldModel(t: TestContext, home: string, withCatalog: NonNullable<Parameters<typeof seedConfiguredModels>[3]>) {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), disconnected = Promise.withResolvers<void>();
  const sent: string[] = [];
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    assert.ok(isKnowledgeOrganize(body), "only the organizer sends a model request in this test");
    sent.push(JSON.parse(organizedCardFor(body)).title);
    if (sent.length === 1) {
      response.on("close", () => disconnected.resolve());
      started.resolve(); await release.promise;
    }
    if (response.destroyed) return;
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaModelResponse(organizedCardFor(body)).text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address === "object");
  await seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], `http://127.0.0.1:${address.port}`, withCatalog);
  return { started: started.promise, release: () => release.resolve(), disconnected: disconnected.promise, sent };
}

for (const change of ["exclude", "delete"] as const) {
  test(`SYS-01 SYS-02 real Host and SDK stop queued knowledge after ${change}`, { timeout: 60_000 }, async t => {
    const home = await openTestHome(t), project = await home.createProject("并发资料");
    const prefix = `/projects/${project.project_id}`;
    for (const name of ["A", "B"]) await home.web.post(prefix + "/api/artifacts/import", { source: "file", filename: `${name}.md`, content: `${name} private body` });
    const listed = await untilSetup(async () => {
      const result = await home.web.get<KnowledgeCardsResponse>(prefix + "/api/knowledge/overview");
      return !result.listing && result.cards.length === 2 ? result : undefined;
    }, "both sources are indexed before the model is configured");
    const model = await heldModel(t, home.home, home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog);
    const cards = openKnowledgeCards({ homeDirectory: home.home });
    try {
      const caller = await home.host.localPersonContext(project.reference);
      await home.host.actionClient(project.reference).invoke(caller, { ...knowledgeActions.read, provider_id: "system.knowledge" }, { subject: listed.cards[0]!.subject });
      assert.equal(cards.receipts(project.project_id, { limit: 10, offset: 0 }).total, 1, "deletion must clear an actual read receipt");
      await home.web.post(prefix + "/api/knowledge/organize", {});
      await model.started;
      const queued = listed.cards.find(card => card.title !== model.sent[0])!;
      if (change === "exclude") {
        await home.web.post(prefix + "/api/knowledge/exclude", { subject: queued.subject, excluded: true });
        model.release();
        await untilSetup(async () => cards.list(project.project_id).find(card => card.state === "ready"), "first draft commits");
        assert.equal(cards.get(project.project_id, queued.subject)?.excluded, true);
      } else {
        await home.web.post(`/api/settings/projects/${project.project_id}/delete`, { delete_confirmed: true, idempotency_key: "knowledge-delete" });
        await model.disconnected;
        model.release();
        // The record owners have finished deletion. A late provider response and another event-loop turn cannot recreate any row.
        await new Promise<void>(resolve => setImmediate(resolve));
        const db = new DatabaseSync(homeSqlitePath(home.home, "knowledge"), { readOnly: true });
        try {
          for (const table of ["knowledge_cards", "knowledge_usage", "knowledge_receipts"]) {
            assert.equal(db.prepare(`SELECT count(*) AS n FROM ${table} WHERE project_id = ?`).get(project.project_id)?.n, 0, table);
          }
        } finally { db.close(); }
      }
      assert.equal(model.sent.length, 1, "queued material never crosses the model HTTP boundary");
    } finally { model.release(); cards.close(); }
  });
}

test("RAC-2446: what the Host measures for knowledge.locate is exactly the data string it sends to the model", { timeout: 60_000 }, async t => {
  // The locate data is measured by knowledgeLocateData(input) and sent as the data after the registered instruction. This drives the real
  // Host action and a local model stand-in that records what arrives, so a Host line that re-serializes the measured input differently
  // (pretty JSON, a different shape) is caught: the data part must be exactly knowledgeLocateData(parsed).
  const home = await openTestHome(t), project = await home.createProject("选节数据");
  const prefix = `/projects/${project.project_id}`;
  await home.web.post(prefix + "/api/artifacts/import", { source: "file", filename: "A.md", content: "# 一节\n检查选节的数据。\n" });
  const listed = await untilSetup(async () => {
    const result = await home.web.get<KnowledgeCardsResponse>(prefix + "/api/knowledge/overview");
    return !result.listing && result.cards.length === 1 ? result : undefined;
  }, "the source is indexed before the model is configured");
  const locateData: string[] = [];
  const model = createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const content = JSON.parse(raw).messages[0].content as string;
    // The locate request's data is the JSON object that starts with its question; a Host that re-serializes it differently is exactly what
    // this test catches (canonical `{"question":`, or a reformatted `{ ... "question"`).
    const canonical = content.indexOf('{"question":'), reformatted = content.search(/\{\s*"question"\s*:/u);
    const at = canonical >= 0 ? canonical : reformatted;
    if (at >= 0) {
      locateData.push(content.slice(at));
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(await cogniaModelResponse(JSON.stringify({ sections: [] })).text());
      return;
    }
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.end(await cogniaModelResponse(organizedCardFor(raw)).text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address === "object");
  await seedConfiguredModels(home.home, [{ provider_id: "fixture", model_id: "fixture-model" }], `http://127.0.0.1:${address.port}`, home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog);
  const caller = await home.host.localPersonContext(project.reference);
  await home.host.actionClient(project.reference).invoke(caller, { ...knowledgeActions.locate, provider_id: "system.knowledge" },
    { question: "这份资料讲什么？", subjects: [listed.cards[0]!.subject] });
  await untilSetup(async () => locateData.length ? locateData[0] : undefined, "the locate request reaches the model");
  const data = locateData[0]!;
  assert.equal(data, knowledgeLocateData(JSON.parse(data)), "the measured string is exactly the one sent");
  const parsed = JSON.parse(data) as { question: string; pieces: Array<{ piece: number }> };
  assert.deepEqual(Object.keys(parsed), ["question", "pieces"], "RAC-2741 the sent data carries exactly the question and the pieces, no other key");
  assert.equal(parsed.question, "这份资料讲什么？", "the question asked is the question sent");
  assert.equal(parsed.pieces[0]!.piece, 1, "the first piece is piece 1");
});

test("D0244-05 S-41 real Host and SDK refuse an old source's held model result and allow a new explicit organize", { timeout: 60_000 }, async t => {
  const id = "io.molis.work.example.quality-source", permission = "quality:read";
  const entries = defineSearchEntriesAction("quality.entries", 1, [{ kind: "quality_piece", title: "资料", surface: "quality" }], "资料", [permission]);
  const reader = defineSubjectContextAction("quality.read", 1, "quality_piece", "资料", [permission]);
  const definition = definePlugin({ manifest: { schema_version: 1, host_api_version: 1, plugin_id: id, version: "1.0.0", name: "来源探针", kind: "app",
    publisher: { publisher_id: "example", signature: "quality-source" }, entrypoints: [{ deployment: "local", entrypoint: "./index.js" }],
    permissions: [{ permission, required: true, reason: "读取测试资料" }], actions: [entries, reader], capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } },
    async start() { return { kind: "app", actions: [
      { ...entries, ...bindSearchEntriesHandler(entries, () => [{ subject: { kind: "quality_piece", id: "one" }, revision: "1", title: "来源探针资料", summary: "", updated_at: null, content: "context", open: null }]) },
      { ...reader, handle: () => subjectContext({ subject: { kind: "quality_piece", id: "one" }, revision: "1", title: "来源探针资料", content: "只有当前来源获准时才交模型。", goal_ids: [] }) },
    ] }; } });
  const home = await openTestHome(t, { host: { pluginFixtures: { home: [definition] } } }), project = await home.createProject("来源撤销");
  const platform = await home.host.homePlugins!.ready(), install = home.host.homePlugins!.installation(id)!;
  const prefix = `/projects/${project.project_id}`;
  const listed = await untilSetup(async () => {
    const result = await home.web.get<KnowledgeCardsResponse>(prefix + "/api/knowledge/overview");
    return !result.listing && result.cards.some(card => card.subject.kind === "quality_piece") ? result : undefined;
  }, "the actual source is indexed before any model is configured");
  const subject = listed.cards.find(card => card.subject.kind === "quality_piece")!.subject;
  const logs: HostLogEntry[] = []; t.after(captureHostLog(logs));
  const model = await heldModel(t, home.home, home.host.ensureWebCatalog(home.home, openMolisWorkProjectCatalog).withCatalog);
  const cards = openKnowledgeCards({ homeDirectory: home.home });
  try {
    await home.web.post(prefix + "/api/knowledge/organize", {}); await model.started;
    await platform.runtime.stop(install.install_id);
    await platform.supervisor.restart(id);
    model.release();
    await untilSetup(async () => logs.some(entry => entry.fields?.where === "knowledge.organize" && entry.error?.code === "actions.forbidden") || undefined,
      "the real model returned and the original source fence refused its result");
    assert.ok(!["ready", "failed"].includes(cards.get(project.project_id, subject)?.state ?? "missing"), "no late draft or business failure was saved");
    await home.web.get(prefix + "/api/knowledge/overview"); await home.web.post(prefix + "/api/knowledge/organize", {});
    await untilSetup(async () => cards.get(project.project_id, subject)?.state === "ready" || undefined, "a new authorized organize can complete");
    assert.ok(model.sent.length >= 2, "the fresh call actually used the real SDK model path");
  } finally { model.release(); cards.close(); }
});
