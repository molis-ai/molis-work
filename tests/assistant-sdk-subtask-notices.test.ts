import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AssistantStore, AssistantService, installHostUiText } from "@molis-ai/molis-work-app-local-host";
import { ASSISTANT_INSTALL_ID, ASSISTANT_PLUGIN_ID } from "@molis-ai/molis-work-contracts/services/assistant";
import type { AgentSubagentView } from "@molis-ai/molis-work-contracts/services/agent-host";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";

installHostUiText();

test("SAI-07/10: original SDK results outside the page window survive notice recovery without restarting a parent", async t => {
  const directory = await mkdtemp(join(tmpdir(), "b59-sdk-notices-")), path = join(directory, "assistant.db");
  let db = new DatabaseSync(path), tick = Date.now(), store = new AssistantStore(db, () => new Date(tick++));
  t.after(async () => { db.close(); await rm(directory, { recursive: true, force: true }); });
  const owner = { actor_id: "web-user", project_id: "p", plugin_id: ASSISTANT_PLUGIN_ID, install_id: ASSISTANT_INSTALL_ID };
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.notice-test", appVersion: "1.0.0" }, storageRoot: join(directory, "sdk"),
    reviewQueue: queue, modelConfiguration: async () => null, resolveCredential: () => { throw new Error("notice cannot invoke a model"); } });
  t.after(() => adapter.close()); host.register(adapter);
  const session = await adapter.createSession({ ...owner, title: "Original parent", workspace: "business" });
  const parent = store.create({ actor_id: "web-user", title: "Original parent", scope: { kind: "project", project_id: "p" }, origin: null,
    project_ref: { project_id: "p", storage_key: "memory:p" } });
  store.update("web-user", parent.work_id, null, { session_id: session.session_id });
  for (let i = 0; i < 51; i++) store.create({ actor_id: "web-user", title: `Newer ${i}`, scope: { kind: "personal" }, origin: null });
  assert.equal(store.list("web-user").some(work => work.work_id === parent.work_id), false);
  const child: AgentSubagentView = { subagent_id: "child", parent_run: { session_id: session.session_id, run_id: "parent-run" },
    child_run: { session_id: "child-session", run_id: "child-run-2" }, role_id: "reader", role_version: 1, execution: "read-only",
    task: "Read", state: "completed", result: "Second result", workspace_path: null,
    budget: { attempt: 2, max_attempts: 2, prior_attempts: [{ attempt: 1, run_id: "child-run-1", state: "completed" }] } };
  let gate: Promise<void> | undefined, reading: (() => void) | undefined, reads = 0, starts = 0;
  const originalSession = await adapter.readSession(session);
  t.mock.method(adapter, "readSession", async () => ({ ...originalSession, runs: [child.parent_run] }));
  assert.ok(adapter.subagents);
  t.mock.method(adapter.subagents, "list", async () => { reads++; reading?.(); await gate; return [child]; });
  t.mock.method(host, "start", async () => { starts++; throw new Error("notice must never start a run"); });
  const open = () => new AssistantService(store, { pages: async () => [], host: async () => host,
    authority: async () => { throw new Error("read-only notice does not acquire execution authority"); }, projectTitle: async () => "Project" }, "web-user");
  let service = open();
  const subtasks = () => service.sdkSubtasks;
  await Promise.all([subtasks().noticeResults(), subtasks().noticeResults()]);
  assert.equal(reads, 1, "concurrent global notice reads share one original scan");
  const first = store.openNotices("web-user");
  assert.equal(first.length, 2, "both original attempts are recovered, including the older parent's result");
  for (const notice of first) store.settleNotices("web-user", { notice_id: notice.notice_id }, "seen");
  db.close(); db = new DatabaseSync(path); store = new AssistantStore(db); service = open();
  await subtasks().noticeResults();
  assert.equal(store.openNotices("web-user").length, 0, "a new service preserves durable read state for both attempts");
  const entered = Promise.withResolvers<void>(), released = Promise.withResolvers<void>();
  gate = released.promise; reading = entered.resolve;
  child.child_run = { session_id: "child-session", run_id: "child-run-3" };
  const late = subtasks().noticeResults(); await entered.promise;
  store.update("web-user", parent.work_id, null, { archived: true });
  released.resolve(); await late;
  assert.equal(store.openNotices("web-user").length, 0, "an archived parent cannot receive a late result notice");
  assert.equal(starts, 0);
});
