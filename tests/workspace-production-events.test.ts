import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { DEMO_PROJECT_ID, LocalProjectDatabase, seedDemoBoard, filesOutputsRefresh, handleProjectPluginHttp, observeReviewSettlements, openProjectVersionStores, type ReviewSettlement } from "@molis-ai/molis-work-app-local-host";
import { ensureProjectPlugins, releaseProjectPlugins } from "../apps/local-host/dist/project-plugins.js";
import { pluginActions } from "./fixtures/plugin-actions.js";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";

const FILES = "io.molis.work.files", GIT = "io.molis.work.git", EVENT = `${GIT}.operation-updated`;
// G2b (PG-044): the Host sends a settled review to the installation that asked for it as `host.review.settled@1` (S-54); Git
// subscribes and publishes its own `operation-updated`, which Files reads again on.
test("committed SDK receipts notify real project consumers once; history, other projects, other installations and stopped plugins do not", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "workspace-notifications-")), file = join(root, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  let queue = new AgentReviewQueue();
  queue.observeSettlement(() => { throw new Error("broken unrelated projection"); });
  const makeAdapter = () => createPrologueNodeAdapter({ app: { appId: "molis.events.test", appVersion: "1.0.0" }, storageRoot: join(root, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => { throw new Error("manual Effects must not request a model"); } });
  let adapter = await makeAdapter();
  const base = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user" };
  const ports = { ...base, observeReviewSettlements: (listener: (settlement: ReviewSettlement) => void) => observeReviewSettlements(queue, DEMO_PROJECT_ID, listener),
    escapeHtml: String, translate: (value: string) => value };
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://fixture"), ports, filesOutputsRefresh)
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
    const drain = async () => { await platform.hostEvents.drain(); await platform.events.drain(); };
    let filesRevision = await revision(FILES), gitRevision = await revision(GIT);
    // The installation that asked, as the Host records it when the review is requested: Git's own unless a test says otherwise.
    const asking = (plugin_id = GIT) => ({ plugin_id, install_id: platform.supervisor.state(plugin_id)!.install_id!, holds: () => true });
    const prepare = async (id: string, outcome: "succeeded" | "failed" | "unknown", board = DEMO_PROJECT_ID, authority = asking()) => adapter.gitReviews!.prepare({ project_id: board, workspace_id: id, operation_id: id,
      document: { kind: "git-index", action: "stage", workspace_name: "fixture", files: [{ path: "note", before_text: "before", after_text: "after", before_mode: "100644", after_mode: "100644" }] } },
      { authority, check: async () => {}, execute: async () => {
        await writeFile(join(root, id), "executed once");
        if (outcome !== "succeeded") throw Object.assign(new Error(outcome), outcome === "unknown" ? { code: "EFFECT_RECONCILE_REQUIRED" } : {});
      } });
    for (const outcome of ["succeeded", "failed", "unknown"] as const) {
      const request = await prepare(`operation-${outcome}`, outcome), before = log().length;
      assert.equal(log().length, before, "preparation is not execution");
      await queue.respond({ review_id: request.review_id, decision: "approve", actor_id: "tester" });
      await drain();
      assert.equal(await readFile(join(root, `operation-${outcome}`), "utf8"), "executed once");
      assert.equal(log().length, before + 1);
      assert.deepEqual(log().at(-1)!.payload, { workspace_id: `operation-${outcome}`, operation_id: `operation-${outcome}`, outcome });
      assert.notEqual(await revision(FILES), filesRevision);assert.notEqual(await revision(GIT), gitRevision);
      filesRevision = await revision(FILES);gitRevision = await revision(GIT);
      await queue.refresh(DEMO_PROJECT_ID);await platform.events.resume(DEMO_PROJECT_ID);await drain();
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
    // Another installation's review goes to that installation, never to Git, even though it settled in Git's project (S-54).
    const others = await prepare("operation-files", "succeeded", DEMO_PROJECT_ID, asking(FILES));
    await queue.respond({ review_id: others.review_id, decision: "approve", actor_id: "tester" });
    const forged = await prepare("operation-forged", "succeeded", DEMO_PROJECT_ID, { ...asking(), install_id: "another-install" });
    await queue.respond({ review_id: forged.review_id, decision: "approve", actor_id: "tester" });
    await drain();
    assert.equal(await readFile(join(root, "operation-files"), "utf8"), "executed once");
    assert.equal(log().length, 3, "a rejected review, another project's, another plugin's and another installation's settlements reach no Git publication");
    const install = platform.supervisor.state(GIT)!.install_id!;
    platform.supervisor.revoke(GIT);await platform.runtime.stop(install);
    const stopped = await prepare("operation-stopped", "succeeded", DEMO_PROJECT_ID, { plugin_id: GIT, install_id: install, holds: () => true });
    await queue.respond({ review_id: stopped.review_id, decision: "approve", actor_id: "tester" });
    await drain();
    assert.equal(log().length, 3, "a stopped activation has no publication authority");
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);await adapter.close();
    queue = new AgentReviewQueue();adapter = await makeAdapter();
    const restored = (await ensureProjectPlugins(ports)).platform!;
    await queue.refresh(DEMO_PROJECT_ID);await restored.hostEvents.drain();await restored.events.drain();
    assert.equal(restored.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT).length, 3, "SDK recovery restores receipts without producing new notifications");
    assert.notEqual(await revision(FILES), filesRevision, "new epoch makes reconnecting views read current facts");
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await releaseProjectPlugins(store, DEMO_PROJECT_ID);await adapter.close();store.close();await rm(root, { recursive: true, force: true });
  }
});

test("a settled operation reaches Git even when another installation's action settled it: the Host delivers it outside every action", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "workspace-notifications-scope-")), file = join(root, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  let settle: ((settlement: ReviewSettlement) => void) | undefined, armed = false, gitInstall = "";
  const failures: unknown[] = [], update = { workspace_id: "inside", operation_id: "inside-files", outcome: "succeeded" } as const;
  const browsing = (definition: { capability_id: string }) => definition.capability_id === projectSettingsCapabilities.browsingWorkspace.capability_id;
  const ports = { store, ...openProjectVersionStores(store), projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user",
    observeReviewSettlements: (listener: (settlement: ReviewSettlement) => void) => { settle = listener; return () => { settle = undefined; }; },
    capabilities: {
      availability: (definition: { capability_id: string }) => browsing(definition) ? { available: true } : { available: false, code: "fixture.missing", reason: "Fixture has only browsing settings" },
      async invoke<Input, Output>(definition: { capability_id: string }, _input: Input): Promise<Output> {
        if (!browsing(definition)) throw new Error(`Unexpected capability ${definition.capability_id}`);
        // Host work a Files action set off settles a Git operation while that action is still running.
        if (armed) {
          armed = false;
          try { settle!({ recipient: { plugin_id: GIT, install_id: gitInstall }, payload: { review_id: "review-inside", kind: "git-operation", ...update } }); } catch (error) { failures.push(error); }
        }
        return { workspace_id: "one", display_name: "One", canonical_path: "/one", realpath_verified: true } as Output;
      } } };
  try {
    const platform = (await ensureProjectPlugins(ports)).platform!;
    await platform.wiring.drain();
    gitInstall = platform.supervisor.state(GIT)!.install_id!;
    armed = true;
    const read = await platform.router().dispatch({ method: "GET", pathname: "/api/plugins/io.molis.work.files/state", actor_id: "web-user", query: {} });
    assert.equal(read?.status, 200);
    assert.equal(armed, false, "the Files action asked the Host for its workspace");
    await platform.hostEvents.drain(); await platform.events.drain();
    assert.deepEqual(failures, [], "Git's publication answers to Git's installation, not to the Files action it landed in");
    assert.deepEqual(platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT).map(event => event.payload), [update]);
  } finally {
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); await rm(root, { recursive: true, force: true });
  }
});

// BL-379 (PG-044): a settlement goes as `host.review.settled@1` only to the installation that asked (S-54), so Coding's worktree
// and integration reviews never reach Git. The Host also broadcasts `host.workspace.changed@1` for every one, whoever asked.
test("BL-379 a settled workspace operation another installation asked for makes Git's and Files' pages read again, whatever the outcome", { timeout: 60_000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), "workspace-changed-")), file = join(root, "board.db");
  seedDemoBoard(file);
  const store = new LocalProjectDatabase(file);
  let settle: ((settlement: ReviewSettlement) => void) | undefined;
  const ports = { store, projectId: DEMO_PROJECT_ID, actions: pluginActions(store, DEMO_PROJECT_ID), actorId: "web-user",
    observeReviewSettlements: (listener: (settlement: ReviewSettlement) => void) => { settle = listener; return () => { settle = undefined; }; } };
  try {
    const platform = (await ensureProjectPlugins(ports)).platform!;
    await platform.wiring.drain();
    assert.ok(settle, "the Host forwards this project's settlements");
    const coding = platform.supervisor.state("io.molis.work.coding")?.install_id;
    const revisions = () => [platform.viewRevision(FILES), platform.viewRevision(GIT)];
    const cases: { kind: "git-worktree" | "git-integration"; outcome: "succeeded" | "failed" | "unknown"; recipient: ReviewSettlement["recipient"] }[] = [
      { kind: "git-worktree", outcome: "succeeded", recipient: coding ? { plugin_id: "io.molis.work.coding", install_id: coding } : null },
      // The activation that asked has stopped: the operation ran all the same.
      { kind: "git-integration", outcome: "failed", recipient: null },
      { kind: "git-worktree", outcome: "unknown", recipient: null },
    ];
    for (const [index, { kind, outcome, recipient }] of cases.entries()) {
      const before = revisions();
      settle!({ recipient, payload: { review_id: `review-${index}`, kind, operation_id: `operation-${index}`, workspace_id: "one", outcome } });
      await platform.hostEvents.drain(); await platform.events.drain();
      const after = revisions();
      assert.notEqual(after[0], before[0], `${kind} ${outcome}: Files' pages read again`);
      assert.notEqual(after[1], before[1], `${kind} ${outcome}: Git's pages read again`);
    }
    assert.deepEqual(platform.events.log(DEMO_PROJECT_ID).filter(event => event.event_type_id === EVENT), [],
      "Git publishes `operation-updated` only for operations it asked for");
  } finally {
    await releaseProjectPlugins(store, DEMO_PROJECT_ID); store.close(); await rm(root, { recursive: true, force: true });
  }
});
