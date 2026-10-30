import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { AssistantService, AssistantStore, LocalHost, assistantAuthority } from "@molis-ai/molis-work-app-local-host";
import { reply } from "./fixtures/fixture-replies.js";
import { roundParts } from "./fixtures/round-parts.js";
import { answeringEndingReviews } from "./fixtures/ending-review.js";

async function until<T>(read: () => T | Promise<T>, what = "state"): Promise<NonNullable<T>> {
  for (let i = 0; i < 600; i++) { const value = await read(); if (value) return value as NonNullable<T>; await new Promise(resolve => setTimeout(resolve, 20)); }
  throw new Error(`Expected ${what} not reached`);
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * One Home: a parent that delegates the given sub-tasks and ends its round, children held until released, and every
 * model request the parent's later rounds make. `authority` may refuse a start (a revoked scope, a Host gone away).
 */
async function fixture(t: TestContext, name: string, children: string[], options: { refuse?: () => string | undefined } = {}) {
  const home = await mkdtemp(join(tmpdir(), `molis-handback-${name}-`));
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "board", storage_key: "memory:project" };
  const releases = new Map(children.map(title => [title, Promise.withResolvers<void>()]));
  const later: string[] = [];
  let parentStep = 0;
  const parentScript = [...children.map(title => () => reply({ name: "delegate-work", input: { title, brief: `起草「${title}」。`, acceptance: "一段话" } })),
    () => reply(undefined, "已交给子任务，它们还在做，做完我再汇总。")];
  t.mock.method(globalThis, "fetch", answeringEndingReviews(text => reply(undefined, text), async (_url: unknown, init: RequestInit) => {
    const raw = typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array);
    const body = JSON.parse(raw), said = JSON.stringify(body.messages);
    if (said.includes("委托的子任务")) {
      const title = children.find(item => said.includes(`起草「${item}」`))!;
      await Promise.race([releases.get(title)!.promise, new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(init.signal!.reason), { once: true }))]);
      return reply(undefined, `「${title}」的草稿：三句话。`);
    }
    if (parentStep < parentScript.length) return parentScript[parentStep++]!();
    later.push(raw);
    return reply(undefined, "已核对子任务的结果，汇总好了。");
  }));
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: `io.molis.work.handback-${name}`, appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(":memory:"));
  const services: AssistantService[] = [];
  /** Runs before the parent's start is authorised (a sub-task's start is not held): a test holds a start here. */
  const hooks: { beforeAuthority?: () => Promise<void> } = {};
  // The work's root on its graph: what it waits for and what goes on after (specs/prologue-adoption §6.0n).
  const nodes = () => adapter.collaboration!.works!.read(store.get("web-user", sent.work.work_id).graph_id!);
  const root = async () => (await nodes()).find(node => node.node_id === "work")!;
  const open = (): AssistantService => {
    const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
      authority: async work => {
        if (!work.delegated_by) await hooks.beforeAuthority?.();
        const refused = options.refuse?.(); if (refused) throw new Error(refused); return assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)); },
      projectTitle: async () => "项目" }, "web-user");
    services.push(service);
    return service;
  };
  const service = open();
  t.after(async () => { for (const opened of services) opened.continuations.close(); for (const release of releases.values()) release.resolve(); await adapter.close(); await local.close(); await rm(home, { recursive: true, force: true }); });
  const sent = await service.send({ text: "把这两段分给子任务起草，做完汇总", request_id: `req-${name}` }, { project_ref: project });
  const started = await until(async () => { const view = await service.read(sent.work.work_id); return view.work.state === "completed" && view.delegated?.length === children.length && view.delegated.every(child => child.state === "running") ? view : undefined; }, "parent ended, sub-tasks running");
  return { service, store, adapter, hooks, open, root, nodes, parentId: sent.work.work_id, children: started.delegated!, release: (title: string) => releases.get(title)!.resolve(), later, rounds: () => store.rounds(sent.work.work_id) };
}

// specs/prologue-adoption §4.6 (item 14): a sub-task that finishes after its delegating work's round ended hands its
// result back once, and the work goes on by itself in one round the Host writes — with the result as material,
// started like any other round.
test("sub-tasks that finish after their delegating work's round ended hand back once: the work goes on by itself in one Host-written round", { timeout: 90_000 }, async t => {
  const { service, parentId, children, release, later, rounds, root } = await fixture(t, "once", ["开头", "结尾"]);
  assert.equal((await root()).state, "waiting", "the work's root waits for its parts");
  assert.equal((await root()).continuation?.state, "armed");
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "first sub-task done");
  await pause(400);
  assert.equal(rounds().length, 1, "one sub-task still running: the work waits for both");
  assert.equal((await root()).continuation?.state, "armed", "a wait on every part: one back is not enough");
  // The second settles 400 ms after the first: one round for both. (Both results and the person's own round arriving
  // together is PA-08, the next test.)
  release("结尾");
  const done = await until(async () => { const view = await service.read(parentId); return view.rounds.length === 2 && view.work.state === "completed" ? view : undefined; }, "the hand-back round");
  const handBack = rounds()[1]!;
  assert.equal(handBack.written_by, "host", "the Host wrote it, not the person");
  assert.match(handBack.text, /^（子任务都已交回）请核对「开头」「结尾」的结果/);
  assert.equal(later.length, 1);
  assert.match(roundParts(later[0]!).data, /子任务交回/, "the results come as the round's material");
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  assert.match(later[0]!, /「结尾」的草稿：三句话/);
  assert.match(done.rounds[1]!.turns.map(turn => turn.text).join("\n"), /汇总好了/);
  // The round took the root's continuation up, under its request key: the Host starting again (as after a restart) starts
  // nothing, and the work's next round is not told again.
  const taken = await root();
  assert.equal(taken.continuation?.state, "started");
  await service.notices.attachSchedule();
  await pause(500);
  assert.equal(rounds().length, 2, "no second hand-back round");
  await service.send({ work_id: parentId, text: "谢谢", request_id: "req-once-thanks" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 3, "the person's round");
  // The role names the section too (what reaches a round is data); what counts is whether the data carries it.
  assert.doesNotMatch(roundParts(later.at(-1)!).data, /子任务交回/, "what was handed back is not told again");
});

// PA-08 (specs/prologue-adoption §5.3): both sub-tasks' results and the person's own round arrive together. Both results
// land in the same tick; the hand-back they set going is held at its start (the barrier) while the person's round goes in.
// The parent Session gains one Run, the continuation is taken up once, and the Host coming back starts nothing.
test("PA-08: two sub-task results and the person's own round arriving together start one parent Run; the continuation is taken up once and the Host coming back starts nothing", { timeout: 90_000 }, async t => {
  const { service, open, hooks, adapter, store, parentId, release, later, rounds, root } = await fixture(t, "together", ["开头", "结尾"]);
  const parentSession = { session_id: store.get("web-user", parentId).session_id! };
  const runs = async () => (await adapter.readSession(parentSession)).runs.length;
  assert.equal(await runs(), 1);
  const entered = Promise.withResolvers<void>(), held = Promise.withResolvers<void>();
  // The parent's next start (the hand-back, once both are back) waits here until the person's round has gone in.
  hooks.beforeAuthority = async () => { hooks.beforeAuthority = undefined; entered.resolve(); await held.promise; };
  release("开头"); release("结尾");
  await entered.promise;
  assert.equal(rounds().length, 1, "the hand-back is held before it starts");
  await service.send({ work_id: parentId, text: "两段都交回了吧？我来接着核对", request_id: "req-together-person" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 2, "the person's round");
  held.resolve();
  await until(() => service.notices.notices(null).find(item => item.work_id === parentId && /没有自动接着做/.test(item.text)), "the held hand-back refused");
  assert.equal(await runs(), 2, "the parent Session gained one Run: the person's");
  assert.equal(rounds().length, 2);
  assert.equal(rounds()[1]!.written_by, undefined, "the person's round, not one the Host wrote");
  assert.equal(later.length, 1, "one model request after the parent's own round");
  assert.match(roundParts(later[0]!).data, /子任务交回/, "the person's round took up what came back");
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  assert.match(later[0]!, /「结尾」的草稿：三句话/);
  assert.equal((await root()).continuation?.state, "started", "taken up by the person's round");
  // The Host comes back (a new service on the same store): nothing is started again.
  const reopened = open();
  await reopened.notices.attachSchedule();
  await pause(500);
  assert.equal(await runs(), 2, "no Run after the Host comes back");
  assert.equal(rounds().length, 2);
  assert.equal(later.length, 1);
  // Taken up once: the person's next round is not told again.
  await reopened.send({ work_id: parentId, text: "谢谢", request_id: "req-together-thanks" }, {});
  await until(async () => (await reopened.read(parentId)).work.state === "completed" && rounds().length === 3, "the person's next round");
  assert.doesNotMatch(roundParts(later.at(-1)!).data, /子任务交回/, "what was handed back is not told again");
});

// A delegation the person closed does not come back by itself: the work they stopped, or a sub-task someone stopped,
// waits for their next round, which is told what happened.
test("no hand-back round when the person stopped the delegating work; their next round is told what the sub-tasks did", { timeout: 90_000 }, async t => {
  const { service, parentId, children, release, later, rounds, root } = await fixture(t, "stopped", ["开头", "结尾"]);
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "first sub-task done");
  // The person stops the work: its wait ends before the sub-task still running stops with it, so that stop is not what
  // the work waited for, and the finished one does not move it on.
  await service.control(parentId, { kind: "stop" });
  assert.equal((await root()).continuation?.state, "cancelled", "the person's stop ends the work's wait");
  await until(async () => (await service.read(children[1]!.work_id)).work.state === "stopped", "second sub-task stopped");
  await pause(600);
  assert.equal(rounds().length, 1, "nothing starts after the person stopped it");
  assert.equal(later.length, 0);
  assert.equal((await root()).continuation?.state, "cancelled");
  await service.send({ work_id: parentId, text: "子任务做得怎么样？", request_id: "req-stopped-ask" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 2, "the person's round");
  assert.match(later[0]!, /子任务交回/);
  assert.match(later[0]!, /「开头」：已完成/);
  assert.match(later[0]!, /「结尾」：被停止了/);
});

test("a sub-task someone stopped is not news enough to move its delegating work on", { timeout: 90_000 }, async t => {
  const { service, parentId, children, rounds, later, root } = await fixture(t, "child-stopped", ["开头"]);
  await service.control(children[0]!.work_id, { kind: "stop" });
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "stopped", "sub-task stopped");
  await pause(600);
  assert.equal(rounds().length, 1);
  assert.equal(later.length, 0);
  assert.equal((await service.read(parentId)).work.state, "completed");
  // What it waited for is over; the continuation waits for the work's next round, which takes it up.
  assert.equal((await root()).continuation?.state, "eligible");
  await service.send({ work_id: parentId, text: "子任务停了，接着做吧", request_id: "req-child-stopped-ask" }, {});
  await until(async () => (await service.read(parentId)).work.state === "completed" && rounds().length === 2, "the person's round");
  assert.equal((await root()).continuation?.state, "started", "the person's round took it up");
  assert.match(later[0]!, /「开头」：被停止了/);
});

// The hand-back round starts like any round: refused (the scope revoked, the Host away), it tells the person why and
// starts nothing; once the Host is back (a restart: a new service on the same store), it is taken up once.
test("a refused hand-back tells the person why; after a restart it is taken up once", { timeout: 90_000 }, async t => {
  let refusing: string | undefined;
  const { service, open, parentId, children, release, rounds, later, root } = await fixture(t, "refused", ["开头"], { refuse: () => refusing });
  refusing = "这个项目的授权已撤回";
  release("开头");
  await until(async () => (await service.read(children[0]!.work_id)).work.state === "completed", "sub-task done");
  const notice = await until(() => service.notices.notices(null).find(item => item.work_id === parentId && /子任务都已交回，但没有自动接着做：这个项目的授权已撤回/.test(item.text)), "the notice");
  assert.equal(notice.kind, "needs-decision");
  assert.equal(rounds().length, 1, "nothing started");
  assert.equal((await root()).continuation?.state, "eligible", "a refused start leaves the continuation where it was");
  // The Host comes back.
  refusing = undefined;
  const restarted = open();
  assert.equal(await restarted.notices.attachSchedule(), true);
  await until(async () => (await restarted.read(parentId)).work.state === "completed" && rounds().length === 2, "the hand-back round after the restart");
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  assert.equal((await root()).continuation?.state, "started");
  await restarted.notices.attachSchedule();
  await pause(500);
  assert.equal(rounds().length, 2, "taken up once");
});

// A part's step end that could not be written is not swallowed: the diagnostics page shows it, and the step stays as
// the graph has it (its work still waits) until the Host's next start ends it (W2-18-HANDBACK-RESTART-01).
test("W2-18-HANDBACK-STEP-END-01: a part's step end that could not be written shows in the diagnostics", { timeout: 90_000 }, async t => {
  const { service, release, root, nodes, store, parentId } = await fixture(t, "unwritten", ["开头"]);
  const rename = fs.renameSync, failures = async () => (await service.reads.diagnostics()).runtime?.ledger_failures ?? [];
  let failing = true;
  // The SDK writes a graph as a temporary file renamed into place: from the part's answer on, no graph write lands.
  fs.renameSync = (from, to) => {
    if (failing && String(to).includes("~taskboards")) throw Object.assign(new Error("EIO: i/o error, rename"), { code: "EIO" });
    return rename(from, to);
  };
  syncBuiltinESMExports();
  t.after(() => { fs.renameSync = rename; syncBuiltinESMExports(); });
  release("开头");
  const shown = await until(async () => (await failures()).find(entry => entry.kind === "work-graph-step-end-failed"), "the unwritten step end in the diagnostics");
  failing = false;
  assert.match(String(shown.detail), /step ".+" of work graph .+: /);
  assert.equal((await nodes()).find(node => node.parent === "work")?.state, "running", "the graph keeps the step as it was written");
  assert.equal((await root()).continuation?.state, "armed", "the work still waits for the part");
  assert.equal(store.rounds(parentId).length, 1);
});

// The Host stopped between a part's round ending and its step's end being written (the fixture Host is killed at that write).
// After the restart the step ends as the round did, so what its work waited for is over, and the work goes on once.
test("W2-18-HANDBACK-RESTART-01: a part's round that ended just before the Host stopped ends its step after the restart; its work goes on once", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-handback-restart-")), database = join(home, "assistant.db");
  t.after(() => rm(home, { recursive: true, force: true }));
  const killed = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("./fixtures/assistant-handback-host.ts", import.meta.url)), home, database], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  let said: { parent?: string; survived?: boolean } = {}, stderr = "";
  killed.on("message", message => { said = { ...said, ...(message as object) }; });
  killed.stderr!.on("data", chunk => { stderr += String(chunk); });
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => killed.on("exit", (code, signal) => resolve({ code, signal })));
  assert.equal(exit.signal, "SIGKILL", `the Host was killed at the step's write: ${JSON.stringify({ exit, said })}\n${stderr.slice(-2000)}`);
  const later: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { later.push(typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as Uint8Array)); return reply(undefined, "已核对子任务的结果，汇总好了。"); });
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const queue = new AgentReviewQueue(), host = new AgentHost({ reviews: queue });
  const adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.handback-restart", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only" });
  host.register(adapter);
  const store = new AssistantStore(new DatabaseSync(database));
  const service: AssistantService = new AssistantService(store, { pages: async () => ["home"], host: async () => host,
    authority: async work => assistantAuthority(local, work, () => new Set(), undefined, undefined, service.delegation(work)), projectTitle: async () => "项目" }, "web-user");
  t.after(async () => { service.continuations.close(); await adapter.close(); await local.close(); store.db.close(); });
  const parent = store.get("web-user", said.parent!), graph = () => adapter.collaboration!.works!.read(parent.graph_id!);
  const part = await until(async () => (await graph()).find(node => node.parent === "work" && node.state === "succeeded"), "the part's step ended after the restart");
  assert.ok(part.ended_at);
  assert.equal(store.rounds(parent.work_id).length, 1);
  assert.equal(await service.notices.attachSchedule(), true);
  await until(async () => (await service.read(parent.work_id)).work.state === "completed" && store.rounds(parent.work_id).length === 2, "the hand-back round after the restart");
  assert.equal(store.rounds(parent.work_id)[1]!.written_by, "host");
  assert.match(roundParts(later[0]!).data, /子任务交回/);
  assert.match(later[0]!, /「开头」：已完成/);
  assert.match(later[0]!, /「开头」的草稿：三句话/);
  assert.equal((await graph()).find(node => node.node_id === "work")?.continuation?.state, "started");
  await service.notices.attachSchedule();
  await pause(500);
  assert.equal(store.rounds(parent.work_id).length, 2, "taken up once");
});
