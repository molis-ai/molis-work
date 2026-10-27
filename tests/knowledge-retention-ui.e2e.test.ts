import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { resetSecretStoreCache, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { KnowledgeCardRecord, KnowledgeCardsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";
import { organizedCardFor } from "./fixtures/knowledge-organize.js";

async function eventually(check: () => boolean | Promise<boolean>, message: string) {
  for (const deadline = Date.now() + 20_000; !await check();) {
    assert.ok(Date.now() < deadline, message);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}

// The initial pending card comes from an actual Coding source while no model is configured. Archive/restore, the summary-only
// Alchemist source, all UI responses and organizing use the production process and SQLite. Only the model endpoint is a fixture.
// The queue-drain zero-call policy is covered in knowledge-retention-policy; here all traffic during the visible journey is counted.
test("MEM-40 S-71 restored context cards offer explicit organizing while summary cards do not; real model success and failure reach the page", { timeout: 120_000 }, async t => {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache(); });
  const traffic: string[] = [];
  let rejectModel = false;
  const model = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    traffic.push(raw); // Includes every request; no aside/review filter changes the count.
    if (rejectModel) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { type: "invalid_request_error", message: "Fixture model refused this explicit request" } })); return;
    }
    const result = cogniaModelResponse(organizedCardFor(raw));
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}`;
  const browser = await openGoalBrowser(t, "user", undefined, undefined, undefined, undefined, { processServer: true }); if (!browser) return;
  const { homeDirectory, projectId, origin, command, sessionId, evaluate, waitFor, click, navigate } = browser;
  assert.ok(projectId); assert.ok(browser.restartServer);
  const prefix = `/projects/${projectId}`;
  await withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    for (const plugin_id of ["coding", "alchemist"]) catalog.addProjectPlugin({ project_id: projectId, plugin_id, actor_id: "web-user" });
  });
  const call = async <T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
    const response = await fetch(origin + prefix + path, { method,
      headers: { origin, "content-type": "application/json", "x-molis-work-control-token": browser.controlToken, "x-molis-work-idempotency-key": randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await response.text(); assert.ok(response.ok, `${path}: ${response.status} ${text}`); return JSON.parse(text) as T;
  };
  const created = await call<{ session: { session_id: string } }>("/api/plugins/io.molis.work.coding/sessions", { title: "恢复后由我整理的项目说明" });
  const id = created.session.session_id, source = { kind: "coding_session", id }, sourcePath = `/api/plugins/io.molis.work.coding/sessions/${id}`;
  const { direction } = await call<{ direction: { id: string } }>("/api/alchemist/studio/api/v1/directions", { title: "只提供摘要的研究方向", description: "记录访谈原句与待验证假设，正文不交给资料整理模型。" });
  const summary = { kind: "alchemist-direction", id: direction.id };
  const card = (subject = source): KnowledgeCardRecord | null => {
    const file = join(homeDirectory, "knowledge", "knowledge.db"); if (!existsSync(file)) return null;
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      const row = db.prepare("SELECT body FROM knowledge_cards WHERE project_id = ? AND kind = ? AND object_id = ?").get(projectId, subject.kind, subject.id);
      return row ? JSON.parse(String(row.body)) as KnowledgeCardRecord : null;
    } finally { db.close(); }
  };
  await eventually(async () => {
    await call("/api/knowledge/overview"); return card()?.state === "pending" && card(summary)?.state === "listed";
  }, "both real owners are indexed before a model is configured");
  const original = card()!;
  assert.equal(original.content_policy, "context"); assert.ok(original.retention?.source_identity);
  assert.equal(card(summary)!.content_policy, "summary"); assert.equal(card(summary)!.can_organize, false);
  const preview = await call<{ archive_decision: unknown }>(sourcePath + "/archive-preview");
  await call(sourcePath, { archive: true, archive_decision: preview.archive_decision }, "PATCH");
  const restoring = await call<{ unarchive_decision: unknown }>(sourcePath + "/unarchive-preview");
  await call(sourcePath + "/unarchive", { unarchive_decision: restoring.unarchive_decision });
  await call("/api/knowledge/overview");
  assert.equal(card()!.state, "listed"); assert.equal(card()!.revision, original.revision); assert.equal(card()!.can_organize, true);
  // The shared browser fixture has Goals seed data. Keep any unrelated context cards out of this model journey explicitly.
  const before = await call<KnowledgeCardsResponse>("/api/knowledge/overview");
  for (const other of before.cards) if (other.subject.id !== source.id && other.subject.id !== summary.id && other.state !== "listed")
    await call("/api/knowledge/exclude", { subject: other.subject, excluded: true });
  await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
    const connection = withConnectorConnections(homeDirectory, store => {
      const value = store.createToken({ serviceId: "model-api", displayName: "Knowledge UI loopback", token: "fixture-only" });
      store.assertTarget(value.connection_id, "model-api", endpoint); return value;
    });
    catalog.models.upsert({ credential_ref: connection.credential_ref, provider_id: "knowledge-ui", display_name: "Knowledge UI loopback", base_url: endpoint,
      api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
  }));
  await browser.restartServer();
  const restored = await call<KnowledgeCardsResponse>("/api/knowledge/overview");
  assert.ok(restored.cards.length >= 2);
  assert.ok(restored.cards.every(card => card.excluded || card.state !== "pending"), "the fixture has no unrelated automatic model work queued");
  await command("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.organizeResponses=[];const originalFetch=window.fetch;
    window.fetch=async(input,init)=>{const response=await originalFetch(input,init);
      if(String(input?.url||input).includes('/api/knowledge/organize')&&(init?.method||'GET')==='POST')
        organizeResponses.push({status:response.status,body:await response.clone().json()});
      return response;};` }, sessionId);
  await browser.setViewport(1360, 1000);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/knowledge" }, sessionId));
  const contextRow = `[data-knowledge-subject=${JSON.stringify(`${source.kind}:${source.id}`)}]`;
  const summaryRow = `[data-knowledge-subject=${JSON.stringify(`${summary.kind}:${summary.id}`)}]`;
  const organize = contextRow + " .knowledge-detail-actions > button[type=button]";
  await waitFor(`document.querySelector(${JSON.stringify(contextRow)})?.textContent.includes('待手动整理') && document.querySelector(${JSON.stringify(summaryRow)})?.textContent.includes('只列标题')`);
  await click(summaryRow + " .knowledge-title");
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(summaryRow)}).textContent`), /主人只让出标题和摘要/);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(summaryRow + " .knowledge-detail-actions > button[type=button]")}).hidden`), true);
  await click(contextRow + " .knowledge-title");
  assert.match(await evaluate<string>(`document.querySelector(${JSON.stringify(contextRow)}).textContent`), /恢复后未自动整理，可按需手动整理/);
  assert.equal(await evaluate(`(() => {const b=document.querySelector(${JSON.stringify(organize)});const r=b.getBoundingClientRect();return !b.hidden&&!b.disabled&&r.width>0&&r.height>0;})()`), true);
  assert.equal(traffic.length, 0, "restore, process restart and opening both real card details made no model request");
  assert.equal(card()!.state, "listed");

  await click(organize);
  await waitFor("organizeResponses.length === 1 && document.querySelector('[data-settings-toast], [data-toast]')?.textContent.includes('已排进整理队列')");
  assert.equal(await evaluate("organizeResponses[0].status"), 200);
  assert.equal(await evaluate("organizeResponses[0].body.queued"), 1);
  await eventually(() => card()?.state === "ready", "the explicit request completes through the real model");
  await evaluate("(() => {const select=document.querySelector('[data-knowledge-filter=state]');select.value='ready';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor(`document.querySelector(${JSON.stringify(contextRow)})?.textContent.includes('已整理')`);
  assert.equal(traffic.length, 1); assert.ok(card()!.brief); assert.equal(card()!.organized_revision, card()!.revision);
  assert.equal(card(summary)!.state, "listed");

  rejectModel = true;
  await click(organize);
  await waitFor("organizeResponses.length === 2 && organizeResponses[1].body.queued === 1");
  await eventually(() => card()?.state === "failed", "the real model refusal is persisted as a failure");
  await evaluate("(() => {const select=document.querySelector('[data-knowledge-filter=state]');select.value='failed';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
  await waitFor(`document.querySelector(${JSON.stringify(contextRow + " .knowledge-failed")})?.textContent.includes('整理失败：')`);
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(contextRow + " .knowledge-failed button")})?.textContent`), "重试");
  assert.equal(traffic.length, 2, "only the two explicit clicks sent requests, including the refused one");
  assert.equal(card(summary)!.state, "listed"); assert.equal(card(summary)!.can_organize, false);
});
