import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Database from "better-sqlite3";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { alchemistActions as a, alchemistLegacyActions as old, ALCHEMIST_ACTION_PERMISSIONS, createAlchemistStudioRuntime } from "@molis-ai/molis-work-plugin-alchemist";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { controlledAlchemistAi } from "./fixtures/alchemist-actions.js";
import { seedAlchemistLegacy } from "./fixtures/alchemist-legacy.js";

async function setup(t: test.TestContext) {
  const home = await mkdtemp(join(tmpdir(), "alchemist-host-lifecycle-")), hosts: MolisWorkLocalHost[] = [];
  const beforeClose: Array<() => void> = [];
  const { ai, requests } = controlledAlchemistAi();
  const ref = molisWorkHostProjectReference({ databasePath: join(home, "project.sqlite"), boardId: "board-a", projectId: "project-a" });
  const open = async (actor: string) => {
    const host = new MolisWorkLocalHost({ homeDirectory: home, alchemist: { ai: () => ai, pulseSourceMode: "fixture" } }); hosts.push(host);
    await host.withProject(ref, r => r.coordinator.initializeBoard({ board_id: ref.board_id, title: "Host lifecycle", actor_id: "setup", idempotency_key: "init" }));
    const caller: ActionCallContext = { actor_id: actor, project_id: ref.project_id, audience: "user", permissions: ALCHEMIST_ACTION_PERMISSIONS };
    const client = host.actionClient(ref), bound = bindActionClient(client, () => caller);
    return { host, caller, client, bound };
  };
  t.after(async () => { beforeClose.forEach(release => release()); await Promise.all(hosts.map(host => host.close())); await rm(home, { recursive: true, force: true }); });
  return { home, ai, requests, ref, open, beforeClose, path: join(home, "alchemist/projects/project-a/studio.sqlite") };
}

test("Alchemist Host discovery is inert; one owner closing cannot cancel another owner's job, and concurrent actors stay separate", { timeout: 30_000 }, async t => {
  const f = await setup(t), first = await f.open("alice"), second = await f.open("bob");
  const catalog = await first.bound.discover();
  assert.ok(catalog.some(item => item.capability_id === a.directionCreate.capability_id && item.availability.available));
  await assert.rejects(access(f.path), { code: "ENOENT" }); assert.equal(f.requests.length, 0);
  const { direction } = await first.bound.invoke(a.directionCreate, { description: "多个 Host 共用同一份后台研究任务" });
  await second.bound.invoke(a.bootstrap, {});
  const generate = f.ai.generate, entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let jobActor: string | undefined;
  f.ai.generate = async input => { jobActor = input.actorId; entered.resolve(); await release.promise; return generate(input); };
  // Release in cleanup even if an assertion fails before the normal release.
  f.beforeClose.push(() => release.resolve());
  const receipt = await second.bound.invoke(a.explorationStart, { id: direction.id });
  await entered.promise;
  assert.equal(jobActor, "bob");
  await first.host.close();
  assert.equal((await second.bound.invoke(a.runEvents, { id: receipt.jobId! })).status, "running");
  release.resolve();
  let exploration;
  for (let n = 0; n < 100; n++) {
    exploration = (await second.bound.invoke(a.explorationGet, { id: receipt.runId })).exploration;
    if (["completed", "failed", "cancelled"].includes(exploration.status)) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(exploration!.status, "completed"); assert.equal(f.requests.length, 1);
  const kept = await second.bound.invoke(a.cardKeep, { id: exploration!.cards[0]!.id }); assert.equal(kept.version.revision.actorId, "bob");
  const third = await f.open("carol"), both = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>();
  const actors: string[] = [];
  f.ai.generate = async input => { actors.push(input.actorId!); if (actors.length === 2) both.resolve(); await finish.promise; return generate(input); };
  f.beforeClose.push(() => finish.resolve());
  const message = { body: "当前方向的风险是什么", context: { kind: "direction" as const, label: direction.title, directionId: direction.id } };
  const left = second.bound.invoke(a.conversationSend, message), right = third.bound.invoke(a.conversationSend, message);
  await both.promise; assert.deepEqual(actors.sort(), ["bob", "carol"]); finish.resolve();
  const replies = await Promise.all([left, right]);
  assert.deepEqual(replies.map(reply => reply.message.actorId), ["bob", "carol"]);
  assert.deepEqual(replies.map(reply => "assistantMessage" in reply ? reply.assistantMessage.actorId : null), ["bob", "carol"]);
  await Promise.all([second.host.close(), third.host.close()]);
  const reopened = await f.open("dave");
  assert.equal((await reopened.bound.invoke(a.ideaGet, { id: kept.idea.id, version: 1 })).version.revision.actorId, "bob");
  assert.equal((await reopened.bound.invoke(a.conversationList, {})).messages.length, 4);
});

test("Alchemist queued jobs keep their original actor after restart; legacy reads retain old data without opening Studio", async t => {
  const f = await setup(t), caller = await f.open("new-reader");
  seedAlchemistLegacy(f.home);
  const legacy = await caller.bound.invoke(old.export, {});
  assert.equal(legacy.label, "历史演示数据（不作为真实研究）"); assert.equal(legacy.directions[0]!.decisions[0]!.reason, "历史判断理由");
  assert.equal((await caller.bound.invoke(old.get, { id: "old-direction" })).cards[0]!.origin, "demo");
  assert.equal((await caller.bound.invoke(old.list, {})).directions[0]!.kept_count, 1);
  await assert.rejects(access(f.path), { code: "ENOENT" });
  // A queued Studio task from the previous process, using its real invocation and persistent job input.
  const original = createAlchemistStudioRuntime({ databasePath: f.path, ai: f.ai });
  let receipt: { runId: string; jobId?: string };
  try {
    const actions = original.actionsFor("original-actor");
    const { direction } = await actions.invoke(a.directionCreate, { description: "重启后沿用已保存的任务发起者身份" });
    receipt = await actions.invoke(a.explorationStart, { id: direction.id });
  } finally { await original.close(); }
  const db = new Database(f.path);
  try { assert.equal(JSON.parse((db.prepare("SELECT input_json FROM jobs WHERE id = ?").get(receipt!.jobId) as { input_json: string }).input_json).actorId, "original-actor"); }
  finally { db.close(); }
  await caller.bound.invoke(a.bootstrap, {});
  let state = "queued";
  for (let n = 0; n < 100; n++) {
    state = (await caller.bound.invoke(a.runEvents, { id: receipt!.jobId! })).status;
    if (state === "completed" || state === "failed") break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(state, "completed"); assert.equal(f.requests[0]!.actorId, "original-actor");
  assert.equal((await caller.bound.invoke(old.get, { id: "old-direction" })).direction.updated_at, "2024-02-01");
});
