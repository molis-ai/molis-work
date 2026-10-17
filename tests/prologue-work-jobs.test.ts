import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { codingAgentManifest, codingPrompts } from "@molis-ai/molis-work-plugin-coding";
import { reply } from "./fixtures/fixture-replies.js";

// specs/prologue-adoption §6.0o: a job a work follows is a step under the work's root that no session holds. The Host's
// wait on the owner's status query ends it the way the job ended; nothing goes on from it, the work's wait for its parts
// does not wait for it, and no round stands on it. Each look is checked against the work's authority as it is then.

const until = async (what: string, check: () => boolean | Promise<boolean>, ms = 20_000) => {
  for (const deadline = Date.now() + ms; !(await check());) { if (Date.now() > deadline) throw new Error(`timed out: ${what}`); await new Promise(resolve => setTimeout(resolve, 25)); }
};
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const status: ActionDefinition = { capability_id: "fixture.jobs.status", version: 1, operation: "query", action: { title: "Job status", description: "Read a job's status", kind: "query", scope: "project",
  audiences: ["agent"], permissions: [], subject_kinds: [], input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
  output_schema: { type: "object", properties: { status: { type: "string" } }, required: ["status"] } } };

/** A work's graph on the real Node adapter, a status query behind the Host's action service, and the work's authority as the Host gives it. */
async function world(t: TestContext, script: (hold: () => PromiseWithResolvers<void>) => Array<() => Response | Promise<Response>> = () => []) {
  const root = await mkdtemp(join(tmpdir(), "molis-work-jobs-"));
  const held: Array<() => void> = [], hold = () => { const one = Promise.withResolvers<void>(); held.push(one.resolve); return one; };
  const answers = script(hold);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => (answers[calls++] ?? (() => reply(undefined, "好的。")))());
  const job = { state: "running", looks: 0, inputs: [] as unknown[] };
  const local = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const project = { project_id: "project", storage_key: "memory:project" };
  local.actionRegistry(project).registerProvider({ provider: { provider_id: "fixture.jobs", kind: "plugin", title: "Jobs" }, definitions: [status],
    handlers: [{ ...status, handle(_context, input) { job.looks++; job.inputs.push(input); return { status: job.state }; } }] });
  const caller = { actor_id: "agent:assistant", actor_kind: "runtime" as const, audience: "agent" as const, project_id: project.project_id, permissions: [] };
  /** The work's authority: none once the work is gone; asked at every look, with where the look is. */
  const work = { gone: false, asked: [] as Array<{ graph_id: string; node_id: string }> };
  const workAuthority = async (at: { graph_id: string; node_id: string }) => {
    work.asked.push(at);
    if (work.gone) return undefined;
    const client = local.actionClient(project);
    return { actions: { client: { discover: () => client.discover(caller), invoke: (reference: never, input: unknown) => client.invoke(caller, reference, input) } } };
  };
  const queue = new AgentReviewQueue();
  const open = () => createPrologueNodeAdapter({ app: { appId: "io.molis.work-jobs", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"), reviewQueue: queue,
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "fixture-only",
    checks: { workAuthority } });
  let adapter = await open();
  const host = new AgentHost({ reviews: queue }); host.register(adapter);
  t.after(async () => { for (const go of held) go(); await adapter.close(); await local.close(); await rm(root, { recursive: true, force: true }); });
  const owner = { project_id: "project", plugin_id: "io.molis.work.coding", install_id: "installed", actor_id: "person" };
  const directory = { canonical_path: root, realpath_verified: true };
  const authority = { manifest: codingAgentManifest, prompts: codingPrompts, authorizedDirectories: [root] };
  const session = await adapter.createSession({ ...owner, directory, title: "Work" });
  const part = await adapter.createSession({ ...owner, directory, title: "Part" });
  const works = () => adapter.collaboration!.works!;
  const { graph_id } = await works().open({ key: "jobs", session_id: session.session_id, title: "Work" });
  const read = () => works().read(graph_id);
  const step = async (id: string) => (await read()).find(node => node.node_id === id);
  const follow = (key = "k1", job_id = "job-1") => works().follow({ graph_id, key, job_id, title: "Jobs · Start research", deadline_ms: 3_600_000, every: { first_ms: 1000, max_ms: 1000 },
    query: { action: { capability_id: "fixture.jobs.status", version: 1, provider_id: "fixture.jobs" }, input: { id: job_id }, path: ["status"], done: ["completed"], failed: ["failed"] } });
  const start = (task: string) => host.start("prologue", { ...owner, directory, session, role_id: "builder", task }, authority);
  const ended = async (ref: AgentRunRef) => {
    await until("the round ends", async () => {
      for (const review of queue.list("project", "pending")) await queue.respond({ review_id: review.review_id, decision: "approve", actor_id: "person" });
      return ["completed", "failed", "stopped", "cancelled", "reconcile-required"].includes((await adapter.read(ref)).phase);
    });
    return adapter.read(ref);
  };
  /** The Host stops and starts again on the same storage, with the same authority behind its checks. */
  const restart = async (meanwhile?: () => void) => { await adapter.close(); meanwhile?.(); adapter = await open(); };
  return { works, graph_id, session, part, job, work, read, step, follow, start, ended, restart, models: () => calls, adapter: () => adapter };
}

test("W2-18-JOB-STEP-01: a followed job is a step under the root no session holds; its owner's query ends it once, and following it again changes nothing", { timeout: 60_000 }, async t => {
  const w = await world(t);
  const heard: string[] = [];
  const off = w.works().onJobEnded(ended => heard.push(ended.node_id));
  t.after(off);
  assert.deepEqual(await w.follow(), { node_id: "job.k1" });
  const following = await w.step("job.k1");
  assert.deepEqual([following?.parent, following?.session_id, following?.state, following?.job?.job_id, following?.job?.ended], ["work", undefined, "running", "job-1", undefined]);
  const before = await w.read();
  assert.deepEqual(await w.follow(), { node_id: "job.k1" }, "the same key is the same step");
  assert.deepEqual(await w.read(), before, "following it again changes nothing");
  // Asked with the input that names the job, and its latest word kept.
  await until("the owner is asked", () => w.job.looks > 0);
  assert.deepEqual(w.job.inputs[0], { id: "job-1" });
  await until("its word is kept", async () => (await w.step("job.k1"))?.job?.said === "running");
  w.job.state = "completed";
  await until("the job's step ends", async () => (await w.step("job.k1"))?.state === "succeeded");
  const done = await w.step("job.k1");
  assert.deepEqual([done?.job?.ended, done?.job?.said, typeof done?.job?.ended_at], ["done", "completed", "string"]);
  const looks = w.job.looks;
  await pause(2500);
  assert.equal(w.job.looks, looks, "nothing is asked once the job ended");
  assert.deepEqual(heard, ["job.k1"], "its end is heard once");
  assert.equal(w.models(), 0, "no model was asked");
  assert.ok(w.work.asked.every(at => at.graph_id === w.graph_id && at.node_id === "job.k1"), "each look asked for the authority of the work on that step");
});

test("W2-18-JOB-STEP-02: the work's wait for its parts does not wait for a job, and no round of the work stands on the job's step", { timeout: 60_000 }, async t => {
  let go!: PromiseWithResolvers<void>, holding!: PromiseWithResolvers<void>;
  const w = await world(t, hold => {
    go = hold(); holding = hold();
    return [async () => { holding.resolve(); await go.promise; return reply(undefined, "交出去了。"); }, () => reply(undefined, "接着做完了。")];
  });
  await w.follow();
  const round = await w.start("交出 p-1。");
  await holding.promise;
  await w.works().add({ graph_id: w.graph_id, node_id: "p-1", session_id: w.part.session_id, title: "p-1", wait_reason: "等交出去的子任务都结束" });
  // A job followed after that hangs its own wait on its own step: the session's wait is still the root's.
  await w.follow("k2", "job-2");
  const [view] = await w.adapter().collaboration!.read("project", w.session.session_id);
  assert.deepEqual(view?.wait?.conditions.map(condition => [condition.kind, condition.ref]), [["node", `${w.graph_id}/p-1`]], "the root waits for the part only, and that is the session's wait");
  go.resolve();
  assert.equal((await w.ended(round.ref)).phase, "completed");
  await w.works().end({ graph_id: w.graph_id, node_id: "p-1", note: "做完了" });
  await until("the work may go on with the job still running", async () => (await w.step("work"))?.continuation?.state === "eligible");
  assert.equal((await w.step("job.k1"))?.state, "running");
  // The next round stands on the root: the job's step is not ended with it.
  const next = await w.start("接着做。");
  assert.equal((await w.ended(next.ref)).phase, "completed");
  const job = await w.step("job.k1");
  assert.deepEqual([job?.state, job?.session_id], ["running", undefined], "no round took the job's step");
});

test("W2-18-JOB-STEP-03: after a restart the job is still looked at, with the work's authority, and its end ends the step", { timeout: 60_000 }, async t => {
  const w = await world(t);
  await w.follow();
  await until("the owner is asked", () => w.job.looks > 0);
  await w.restart();
  const looks = w.job.looks;
  await until("asked again after the restart", () => w.job.looks > looks);
  w.job.state = "completed";
  await until("the job's step ends", async () => (await w.step("job.k1"))?.state === "succeeded");
  assert.equal((await w.step("job.k1"))?.job?.ended, "done");
});

test("W2-18-JOB-STEP-04: a job that ended while the Host was down ends its step once when it starts again, and is heard at once", { timeout: 60_000 }, async t => {
  const w = await world(t);
  await w.follow();
  await until("the owner is asked", () => w.job.looks > 0);
  await w.restart(() => { w.job.state = "failed"; });
  await until("the job's step ends", async () => (await w.step("job.k1"))?.state === "failed");
  const heard: string[] = [];
  t.after(w.works().onJobEnded(ended => heard.push(ended.node_id)));
  await until("an end that came before the listener is heard at once", () => heard.length > 0);
  const after = await w.read(), looks = w.job.looks;
  await pause(2500);
  assert.deepEqual(await w.read(), after, "ended once: nothing changes after");
  assert.equal(w.job.looks, looks);
  assert.deepEqual(heard, ["job.k1"]);
  const job = after.find(node => node.node_id === "job.k1")?.job;
  assert.deepEqual([job?.ended, job?.said], ["failed", "failed"]);
});

test("W2-18-JOB-STEP-05: a job whose work is gone is not asked about; its step is held, as no longer checkable", { timeout: 60_000 }, async t => {
  const w = await world(t);
  w.work.gone = true;
  await w.follow();
  await until("held for a person", async () => (await w.step("job.k1"))?.state === "needs-reconciliation");
  const job = (await w.step("job.k1"))?.job;
  assert.deepEqual([job?.ended, typeof job?.ended_at, w.job.looks], ["unchecked", "string", 0], "refused before anything was asked");
});
