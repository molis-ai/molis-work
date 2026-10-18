import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter, registerAgentHostCapabilities } from "@molis-ai/molis-work-service-agent-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { agentHostCapabilities, type AgentRunRef } from "@molis-ai/molis-work-contracts/services/agent-host";
import { hostQuestionTypes, hostReferenceKinds } from "@molis-ai/molis-work-app-local-host";
import { cogniaModelResponse, cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

// S-33 (specs/ai-interaction-experience §15.9, BL-156): a round a normal shutdown parked on its question is answered under the
// authority of the moment the answer is written, never the authority it had when it asked. Revoked, switched off, the wrong
// project, an answer its own checks refuse, or a round closed instead: refused, and nothing new is written anywhere.

const owner = { project_id: "parked", plugin_id: "io.molis.work.test", install_id: "test", actor_id: "person" };
const role = { role_id: "helper", version: 1, workspace: "business" as const, execution: "operate" as const, prompts: [], host_tools: ["ask-user"] };
const ASKED = { why: "约复盘会", questions: [{ id: "minutes", type: "number", prompt: "时长", min: 15, max: 120, integer: true, unit: "分钟" },
  { id: "goal", type: "reference", prompt: "关联的 Goal", refKinds: ["goal"], required: false }] };

/** Every file under the runtime's storage, by content: what a refusal must leave exactly as it was. */
async function written(root: string): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    files.set(path.slice(root.length), createHash("sha256").update(await readFile(path)).digest("hex"));
  }
  return files;
}

async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
  for (const deadline = Date.now() + 20_000; ; await new Promise(resolve => setTimeout(resolve, 10))) {
    const found = await read();
    if (found !== undefined) return found;
    assert.ok(Date.now() < deadline, what);
  }
}

/** A round that asked, parked by a normal shutdown and read back by a new adapter on the same storage. */
async function parked(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "molis-parked-answer-"));
  const bodies: string[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    bodies.push(await new Request(input, init).text());
    return bodies.length === 1 ? cogniaScriptedResponse({ name: "ask-user", input: ASKED }) : cogniaModelResponse("好的，45 分钟。");
  });
  const known = new Map([["goal g1", "发布清单"]]);
  const make = () => createPrologueNodeAdapter({ app: { appId: "io.molis.parked-answer-test", appVersion: "1.0.0" }, storageRoot: join(root, "runtime"),
    questionTypes: hostQuestionTypes(), referenceKinds: hostReferenceKinds(), reviewQueue: new AgentReviewQueue(),
    readReferences: async (_owner, picked) => picked.map(ref => known.has(`${ref.kind} ${ref.id}`) ? { label: known.get(`${ref.kind} ${ref.id}`)! } : null),
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: "https://1.1.1.1/v1/messages", model: "fixture", credential_ref: "fixture" }),
    resolveCredential: () => "test-only" });
  let adapter = await make();
  t.after(async () => { await adapter.close(); await rm(root, { recursive: true, force: true }); });
  const session = await adapter.createSession({ ...owner, workspace: "business", title: "Parked" });
  const start = () => adapter.start({ ...owner, session, workspace: "business", role_id: "helper", role, task: "约一个复盘会" });
  const asked = await start();
  const question = await until(async () => (await adapter.read(asked.ref)).awaiting_input.find(item => item.answerable && item.kind === "questionnaire"), "the round did not reach its question");
  await adapter.close(); adapter = await make();
  const view = await adapter.read(asked.ref);
  const reread = view.awaiting_input.find(item => item.pending_id === question.pending_id);
  assert.equal(reread?.answerable, true, "after the restart the parked question can be answered");
  assert.equal(reread?.parked, true);
  const answer = (answers: Array<{ question: number; value: unknown }>) => ({ kind: "answer" as const, pending_id: question.pending_id, pending_revision: question.pending_revision!, answers: answers as never });
  return { root, bodies, known, session, run: asked.ref as AgentRunRef, answer, start, adapter: () => adapter };
}

/** A refusal that wrote nothing: the storage is as it was, and the same question still takes its answer. */
async function refusedWithNothingWritten(fixture: Awaited<ReturnType<typeof parked>>, refuse: () => Promise<unknown>, expected: (error: unknown) => boolean) {
  const before = await written(fixture.root);
  await assert.rejects(refuse(), expected);
  assert.deepEqual(await written(fixture.root), before, "nothing new in the Prologue session or the Host's records");
  const again = (await fixture.adapter().recovery!.inspect(fixture.session)).runs.find(run => run.run_id === fixture.run.run_id);
  assert.equal(again?.can_answer, true, "the round is still parked on its open question");
}

/** The parked answer, under the authority the call carries as the gateway hands it to the adapter. */
const under = (fixture: Awaited<ReturnType<typeof parked>>, fence: { beforeEffect(): Promise<void>; assert_current(): void }, value = 45) =>
  fixture.adapter().withEffect!(fence, () => fixture.adapter().control(fixture.run, fixture.answer([{ question: 0, value }, { question: 1, value: null }])));

test("S-33 a round authorized when it asked, revoked after the restart, takes no answer and writes nothing", { timeout: 60_000 }, async t => {
  const fixture = await parked(t);
  const revoked = () => { throw new ActionError("actions.forbidden", "授权已撤回"); };
  await refusedWithNothingWritten(fixture, () => under(fixture, { beforeEffect: async () => {}, assert_current: revoked }),
    error => error instanceof ActionError && error.code === "actions.forbidden");
  await under(fixture, { beforeEffect: async () => {}, assert_current: () => {} });
  assert.equal((await fixture.adapter().readSession(fixture.session)).recovery, undefined, "authorized again, the same answer is taken");
});

test("S-33 a revocation that lands while the answer's own checks wait is refused at the write", { timeout: 60_000 }, async t => {
  const fixture = await parked(t);
  // Every wait before the write (the gateway's own recheck) lets the revocation in; the last, synchronous check sees it.
  let current = true;
  await refusedWithNothingWritten(fixture, () => under(fixture, { beforeEffect: async () => { current = false; }, assert_current: () => { if (!current) throw new ActionError("actions.forbidden", "授权已撤回"); } }),
    error => error instanceof ActionError && error.code === "actions.forbidden");
});

test("S-33 a plugin switched off, or a caller in another project, is refused before the answer is read", { timeout: 60_000 }, async t => {
  const fixture = await parked(t);
  const host = new AgentHost(), handlers = new Map<string, Function>();
  host.register(fixture.adapter());
  registerAgentHostCapabilities({ register(definition, handler) { handlers.set(definition.capability_id, handler); return () => {}; } },
    { agentHost: () => host, projectId: () => owner.project_id, authority: () => ({ manifest: { roles: [role], prompts: [] }, authorizedDirectories: [] }) });
  const control = handlers.get(agentHostCapabilities.controlRun.capability_id)!;
  const invocation = (plugin: typeof owner & { project_id: string | null }, active: () => void) => ({ consumer: "plugin" as const,
    plugin: { ...plugin, assertActive: active, declaration: { manifest: {} as never } }, assertAuthorityCurrent: active, async beforeEffect() {} });
  const off = () => { throw new ActionError("actions.plugin_disabled", "插件已停用"); };
  await refusedWithNothingWritten(fixture, () => control({}, [fixture.session, fixture.run, fixture.answer([{ question: 0, value: 45 }, { question: 1, value: null }])], invocation(owner, off)),
    error => error instanceof ActionError && error.code === "actions.plugin_disabled");
  await refusedWithNothingWritten(fixture, () => control({}, [fixture.session, fixture.run, fixture.answer([{ question: 0, value: 45 }, { question: 1, value: null }])], invocation({ ...owner, project_id: "elsewhere" }, () => {})),
    error => error instanceof ActionError && error.code === "agent.session_unknown");
});

test("S-33 an answer its question refuses, or a pick the person may not hand over (S-26), writes nothing", { timeout: 60_000 }, async t => {
  const fixture = await parked(t);
  const open = { beforeEffect: async () => {}, assert_current: () => {} };
  await refusedWithNothingWritten(fixture, () => under(fixture, open, 500), error => error instanceof ActionError && error.code === "agent.answer_invalid");
  await refusedWithNothingWritten(fixture, () => fixture.adapter().withEffect!(open, () => fixture.adapter().control(fixture.run,
    fixture.answer([{ question: 0, value: 45 }, { question: 1, value: [{ kind: "goal", id: "someone-elses", label: "别人的" }] }]))),
  error => error instanceof ActionError && error.code === "agent.answer_invalid");
});

test("S-33 a parked round can be closed without its answer; once closed, an answer is refused and writes nothing", { timeout: 60_000 }, async t => {
  const fixture = await parked(t);
  const report = await fixture.adapter().recovery!.inspect(fixture.session);
  const round = report.runs.find(run => run.run_id === fixture.run.run_id)!;
  assert.equal(round.can_close, true, "answerable, it can still be closed");
  await fixture.adapter().recovery!.close(fixture.session, round.run_id, round.version);
  const before = await written(fixture.root);
  await assert.rejects(under(fixture, { beforeEffect: async () => {}, assert_current: () => {} }), error => error instanceof ActionError && error.code === "agent.pending_not_open");
  assert.deepEqual(await written(fixture.root), before, "the refused answer wrote nothing");
});
