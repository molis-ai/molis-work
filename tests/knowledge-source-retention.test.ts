import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import type { KnowledgeCardRecord } from "@molis-ai/molis-work-contracts/services/knowledge";
import { webServerProcess } from "./fixtures/web-server-process.js";
import { asideReply } from "./fixtures/ending-review.js";
import { isKnowledgeOrganize } from "./fixtures/knowledge-organize.js";
import { cogniaModelResponse } from "./fixtures/cognia-model-response.js";

async function eventually(check: (deadline: number) => boolean | Promise<boolean>, message: string) {
  const deadline = Date.now() + 20_000;
  for (;;) {
    assert.ok(Date.now() < deadline, message);
    const ready = await check(deadline);
    assert.ok(Date.now() < deadline, message);
    if (ready) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(40, Math.max(0, deadline - Date.now()))));
  }
}

// MEM-40 / S-71: production HTTP, Plugin Runtime, real SDK and SQLite. The loopback server counts every model request.
test("MEM-40 S-71 Coding archive immediately hides the original Knowledge card and restore/restart send no new model requests", { timeout: 90_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "knowledge-retention-")), workspace = join(home, "workspace");
  t.after(() => rm(home, { recursive: true, force: true }));
  const traffic: string[] = [];
  let holdKnowledge = false;
  let entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  const model = createServer(async (request, response) => {
    let raw = ""; for await (const chunk of request) raw += chunk;
    traffic.push(raw);
    if (holdKnowledge && isKnowledgeOrganize(raw)) { entered.resolve(); await release.promise; }
    const text = asideReply(raw) ?? "A preserved Coding discussion about retention.";
    const result = cogniaModelResponse(text);
    response.writeHead(200, { "content-type": "text/event-stream" }); response.end(await result.text());
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { release.resolve(); model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const endpoint = `http://127.0.0.1:${(model.address() as { port: number }).port}`;
  const previousBackend = process.env.MOLIS_WORK_SECRET_BACKEND;
  process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (previousBackend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previousBackend; });
  const project = await runWithMolisWorkHome(home, async () => {
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    try {
      await mkdir(workspace);
      const project = await catalog.createProject({ display_name: "Retention integration", actor_id: "web-user" });
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
      const connection = withConnectorConnections(home, store => {
        const connection = store.createToken({ serviceId: "model-api", displayName: "Loopback", token: "fixture-only" });
        store.assertTarget(connection.connection_id, "model-api", endpoint); return connection;
      });
      catalog.models.upsert({ credential_ref: connection.credential_ref, provider_id: "fixture", display_name: "Loopback", base_url: endpoint,
        api_format: "anthropic-messages", models: [{ model_id: "fixture", enabled: true }] });
      return project;
    } finally { catalog.close(); }
  });
  const token = randomUUID(), server = await webServerProcess(home, token);
  t.after(() => server.close());
  const call = async (path: string, body?: unknown, method = body === undefined ? "GET" : "POST", deadline?: number) => {
    const response = await fetch(`${server.origin}/projects/${project.project_id}${path}`, { method,
      ...(deadline === undefined ? {} : { signal: AbortSignal.timeout(Math.max(0, deadline - Date.now())) }),
      headers: { origin: server.origin, "content-type": "application/json", "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID() },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(result)}`); return result;
  };
  const row = (id: string): { card_id: number; card: KnowledgeCardRecord } | null => {
    const path = join(home, "knowledge", "knowledge.db"); if (!existsSync(path)) return null;
    const db = new DatabaseSync(path, { readOnly: true });
    try {
      const found = db.prepare("SELECT card_id, body FROM knowledge_cards WHERE project_id = ? AND kind = 'coding_session' AND object_id = ?").get(project.project_id, id);
      return found ? { card_id: Number(found.card_id), card: JSON.parse(String(found.body)) } : null;
    } finally { db.close(); }
  };
  await call("/api/workspaces", { workspace_path: workspace, user_confirmed: true });
  const { workspaces } = await call("/api/project-settings/workspaces"), workspace_id = workspaces[0].workspace_id;
  await call("/api/project-settings/workspaces", { workspace_id });
  const created = await call("/api/plugins/io.molis.work.coding/sessions", { title: "Retention discussion" });
  const id = created.session.session_id, subject = { kind: "coding_session", id }, path = `/api/plugins/io.molis.work.coding/sessions/${id}`;
  await call(path + "/runs", { task: "Explain retention.", intent: "discuss", workspace_id, provider_id: "fixture", model_id: "fixture" });
  await eventually(async deadline => (await call(path, undefined, "GET", deadline)).session.state === "done", "Coding finishes through the real SDK");
  const initialRevision: string = (await call(path + "/subject")).revision;
  await call("/api/knowledge/overview");
  const observed: { card: ReturnType<typeof row>; revision: string | null } = { card: null, revision: null };
  let original!: NonNullable<ReturnType<typeof row>>;
  try {
    await eventually(async deadline => {
      let current = observed.card = row(id);
      if (current?.card.state !== "ready") return false;
      // GET can project a completed Run before Coding's follower persists its source state.
      // Read the current source only after organizing; this query never kicks another pass.
      observed.revision = (await call(path + "/subject", undefined, "GET", deadline)).revision;
      current = observed.card = row(id);
      if (current?.card.state !== "ready" || current.card.revision !== observed.revision || current.card.organized_revision !== observed.revision) return false;
      original = current;
      return true;
    }, "the current source is organized");
  } catch (error) {
    try { t.diagnostic(JSON.stringify({ event: "knowledge_source_organization_failed", initial_revision: initialRevision, current_revision: observed.revision,
      card: observed.card ? { card_id: observed.card.card_id, state: observed.card.card.state, revision: observed.card.card.revision,
        organized_revision: observed.card.card.organized_revision, has_error: Boolean(observed.card.card.error) } : null,
      model_requests: { total: traffic.length, ...traffic.reduce((counts, raw) => {
        if (isKnowledgeOrganize(raw)) counts.knowledge++;
        else if (asideReply(raw) !== undefined) counts.ending_review++;
        else counts.other++;
        return counts;
      }, { knowledge: 0, ending_review: 0, other: 0 }) } })); }
    catch { /* Diagnostics must not replace the original failure. */ }
    throw error;
  }
  assert.ok(original.card.retention?.source_identity);
  const archive = async () => { const preview = await call(path + "/archive-preview"); await call(path, { archive: true, archive_decision: preview.archive_decision }, "PATCH"); };
  const restore = async () => { const preview = await call(path + "/unarchive-preview"); await call(path + "/unarchive", { unarchive_decision: preview.unarchive_decision }); };
  const hidden = async () => {
    assert.ok(!(await call("/api/knowledge/overview")).cards.some((card: KnowledgeCardRecord) => card.subject.id === id));
    assert.ok(!(await call("/api/knowledge/search?q=Retention")).cards.some((card: KnowledgeCardRecord) => card.subject.id === id));
  };
  const requests = traffic.length;
  await archive(); await hidden();
  assert.deepEqual(row(id), original, "archive keeps the original SQLite row, organized revision and person fields");
  await server.restart(); await hidden();
  await restore(); await call("/api/knowledge/overview");
  assert.equal(row(id)?.card_id, original.card_id); assert.equal(row(id)?.card.state, "ready");
  assert.equal(row(id)?.card.organized_revision, original.card.organized_revision);
  assert.equal(traffic.length, requests, "all actual model traffic stays unchanged across archive, restart and restore");

  // Explicit organizing is the only new request; finish that original request while the source is hidden.
  holdKnowledge = true;
  await call("/api/knowledge/organize", { subjects: [subject] });
  await entered.promise;
  const dispatched = traffic.length;
  await archive(); await hidden();
  release.resolve();
  await eventually(() => row(id)?.card.state === "ready", "the already dispatched result settles to the hidden original");
  assert.equal(row(id)?.card_id, original.card_id);
  await restore(); await call("/api/knowledge/overview"); await server.restart(); await call("/api/knowledge/overview");
  assert.equal(traffic.length, dispatched, "settling and restoring never resend the original model request");
  assert.ok(traffic.some(isKnowledgeOrganize), "the production organizer really reached the loopback model");
});
