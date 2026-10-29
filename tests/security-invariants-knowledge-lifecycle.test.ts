import assert from "node:assert/strict";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import test, { type TestContext } from "node:test";
import { homeSqlitePath, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { knowledgeActions, type KnowledgeCardsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openTestHome } from "./fixtures/test-home.js";
import { seedConfiguredModels } from "./fixtures/configured-models.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { isKnowledgeOrganize, organizedCardFor } from "./fixtures/knowledge-organize.js";
import { untilSetup } from "./fixtures/connector-assistant-model.js";

/** Hold the actual SDK's first HTTP request after receiving the full material. */
async function heldModel(t: TestContext, home: string) {
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
  await seedConfiguredModels(home, [{ provider_id: "fixture", model_id: "fixture-model" }], `http://127.0.0.1:${address.port}`);
  return { started: started.promise, release: () => release.resolve(), disconnected: disconnected.promise, sent };
}

for (const change of ["exclude", "delete"] as const) {
  test(`SYS-01 SYS-02 real Host and SDK stop queued knowledge after ${change}`, { timeout: 60_000 }, async t => {
    const home = await openTestHome(t), project = await home.createProject("并发资料", ["artifacts"]);
    const prefix = `/projects/${project.project_id}`;
    for (const name of ["A", "B"]) await home.web.post(prefix + "/api/artifacts/import", { source: "file", filename: `${name}.md`, content: `${name} private body` });
    const listed = await untilSetup(async () => {
      const result = await home.web.get<KnowledgeCardsResponse>(prefix + "/api/knowledge/overview");
      return !result.listing && result.cards.length === 2 ? result : undefined;
    }, "both sources are indexed before the model is configured");
    const model = await heldModel(t, home.home);
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
