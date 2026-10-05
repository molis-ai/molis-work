import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/src/project-plugins.js";
import { observeGitOperations } from "../apps/local-host/src/git-operation-notifications.js";
import { handleCodingPluginHttp } from "../apps/local-host/src/coding-surface.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

const FILES = "io.molis.work.files", GIT = "io.molis.work.git", EVENT = `${GIT}.operation-updated`;
test("committed SDK receipts notify real project consumers once; history, other projects and stopped plugins do not", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "workspace-notifications-")), file = join(root, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  let queue = new AgentReviewQueue();
  queue.observeSettlement(() => { throw new Error("broken unrelated projection"); });
  const makeAdapter = () => createPrologueNodeAdapter({ app: { appId: "molis.events.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => { throw new Error("manual Effects must not request a model"); } });
  let adapter = await makeAdapter();
  const base = { store, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user", goalTitle: () => undefined };
  const ports = { ...base, observeGitOperations: (listener: Parameters<typeof observeGitOperations>[2]) => observeGitOperations(queue, DEMO_PROJECT_ID, listener),
    escapeHtml: String, translate: (value: string) => value };
  const server = createServer((request, response) => { void handleCodingPluginHttp(request, response, new URL(request.url!, "http://fixture"), ports)
    .then(handled => { if (!handled) { response.writeHead(404); response.end(); } }).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();assert.ok(address && typeof address !== "string");
  const revision = async (plugin: string) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/plugins/${plugin}/view-revision`);
    assert.equal(response.status, 200);assert.equal(response.headers.get("cache-control"), "no-store");
    return (await response.json()).revision;
  };
  try {
    // Discovery may precede the web/Agent adapter. Late wiring must connect without restarting the plugin.
    const platform = (await ensureProjectPlugins(base)).platform!;
    await ensureProjectPlugins(ports);await platform.wiring.drain();
    const log = () => platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT);
    let filesRevision = await revision(FILES), gitRevision = await revision(GIT);
    const prepare = async (id: string, outcome: "succeeded" | "failed" | "unknown", board = DEMO_PROJECT_ID) => adapter.gitReviews!.prepare({ project_id: board, workspace_id: id, operation_id: id,
      document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [{ path: "note", before_text: "before", after_text: "after", before_mode: "100644", after_mode: "100644" }] } },
      { check: async () => {}, execute: async () => {
        await writeFile(join(root, id), "executed once");
        if (outcome !== "succeeded") throw Object.assign(new Error(outcome), outcome === "unknown" ? { code: "EFFECT_RECONCILE_REQUIRED" } : {});
      } });
    for (const outcome of ["succeeded", "failed", "unknown"] as const) {
      const request = await prepare(`operation-${outcome}`, outcome), before = log().length;
      assert.equal(log().length, before, "preparation is not execution");
      await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
      await platform.events.drain();
      assert.equal(await readFile(join(root, `operation-${outcome}`), "utf8"), "executed once");
      assert.equal(log().length, before + 1);
      assert.deepEqual(log().at(-1)!.payload, { workspace_id: `operation-${outcome}`, operation_id: `operation-${outcome}`, outcome });
      assert.notEqual(await revision(FILES), filesRevision);assert.notEqual(await revision(GIT), gitRevision);
      filesRevision = await revision(FILES);gitRevision = await revision(GIT);
      await queue.refresh(DEMO_PROJECT_ID);await platform.events.resume(DEMO_PROJECT_ID);await platform.events.drain();
      const receipt = queue.receipt(request.review_id)!;
      if (receipt.effect_uncertain) queue.uncertain(request.review_id, receipt.effect_uncertain);
      else queue.settle(request.review_id, { ok: receipt.effect_settled, ...(receipt.effect_error ? { error: receipt.effect_error } : {}) });
      assert.equal(log().length, before + 1, "ordinary reads and repeat receipts never manufacture another operation");
      assert.equal(await revision(FILES), filesRevision);
    }
    const rejected = await prepare("operation-rejected", "succeeded");
    await queue.respond({ review_id: rejected.review_id, decision: "reject", actor_id: "tester" });
    const foreign = await prepare("operation-foreign", "succeeded", "other-board");
    await queue.respond({ review_id: foreign.review_id, decision: "approve", actor_id: "tester" });
    assert.equal(log().length, 3);
    const install = platform.supervisor.state(GIT)!.install_id!;
    platform.supervisor.revoke(GIT);await platform.runtime.stop(install);
    const stopped = await prepare("operation-stopped", "succeeded");
    await queue.respond({ review_id: stopped.review_id, decision: "approve", actor_id: "tester" });
    assert.equal(log().length, 3, "a stopped activation has no publication authority");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);await adapter.close();
    queue = new AgentReviewQueue();adapter = await makeAdapter();
    const restored = (await ensureProjectPlugins(ports)).platform!;
    await queue.refresh(DEMO_PROJECT_ID);await restored.events.drain();
    assert.equal(restored.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT).length, 3, "SDK recovery restores receipts without producing new notifications");
    assert.notEqual(await revision(FILES), filesRevision, "new epoch makes reconnecting views read current facts");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);await adapter.close();store.close();await rm(root, { recursive: true, force: true });
  }
});
