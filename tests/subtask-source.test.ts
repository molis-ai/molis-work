import assert from "node:assert/strict";
import test from "node:test";
import { createAgentSubtaskSource, type AgentSubtaskSourcePorts } from "@molis-ai/molis-work-plugin-sdk/subtask-conversation";
import type { AgentSubagentConversation } from "@molis-ai/molis-work-contracts/services/agent-host";
import type { MwSubtaskConversationView } from "@molis-ai/molis-work-plugin-sdk/ui";

const signal = () => new AbortController().signal;
const data = (target: string, phase: AgentSubagentConversation["phase"] = "completed"): AgentSubagentConversation => ({
  child: { subagent_id: target, parent_run: { session_id: "parent", run_id: "parent-run" }, child_run: { session_id: target, run_id: `${target}-r1` }, role_id: "writer", task: target, state: "completed", result: "kept", workspace_path: null },
  phase, messages: [], questions: [], approvals: [],
});
function fixture() {
  const storage = new Map<string, string>(), accepted = new Map<string, string>();
  let posts = 0, readPhase: AgentSubagentConversation["phase"] = "completed", settle: (() => void) | undefined;
  const ports: AgentSubtaskSourcePorts = {
    drafts: { compareAndSwap: async (key, expected, value) => { if ((storage.get(key) ?? null) !== expected) return false; if (value === null) storage.delete(key); else storage.set(key, value); return true; }, read: async key => storage.get(key) ?? null, write: async (key, value) => { if (value === null) storage.delete(key); else storage.set(key, value); } }, labels: {} as AgentSubtaskSourcePorts["labels"], text: key => key,
    read: async target => ({ conversation: data(target, readPhase), parent: { target: "parent", title: "parent" } }),
    command: async (target, command) => { posts++; await new Promise<void>(resolve => { settle = resolve; }); accepted.set(command.request_id, target); throw new Error("response lost after acceptance"); },
    check: async (target, id) => accepted.get(id) === target ? { state: "applied", run: data(target).child.child_run! } : { state: "unknown" },
  };
  const view = async (source: ReturnType<typeof createAgentSubtaskSource>, target: string): Promise<MwSubtaskConversationView> => { const result = await source.read(target, signal()); assert.equal(result.state, "available"); return (result as { view: MwSubtaskConversationView }).view; };
  return { ports, view, phase: (phase: typeof readPhase) => { readPhase = phase; }, release: () => settle?.(), posts: () => posts };
}

test("SAI-04/10/11: an accepted late A settles only A's submitted draft; remount queries its original request without sending again", async () => {
  const f = fixture(), source = createAgentSubtaskSource(f.ports), a = await f.view(source, "A"), b = await f.view(source, "B");
  const inputA = source.composer(a), inputB = source.composer(b);
  await inputA.draft.adapter.write("sent A"); await inputB.draft.adapter.write("kept B");
  const send = inputA.submit({ text: "sent A", materials: [], controls: {}, request_id: "request-a" }, signal());
  // Wait for the transport, after the original request was durably retained.
  while (!f.posts()) await new Promise(resolve => setTimeout(resolve, 1));
  await inputA.draft.adapter.write("new A after send");
  const restored = createAgentSubtaskSource(f.ports), pending = await f.view(restored, "A");
  assert.equal(pending.pending?.requestId, "request-a"); assert.equal((await restored.act(pending, pending.pending!.check, "ui-query-key", signal())).state, "unknown");
  f.release(); assert.equal((await send).state, "sent");
  assert.equal(await inputA.draft.adapter.read(signal()), "new A after send");
  assert.equal(await inputB.draft.adapter.read(signal()), "kept B");
  assert.equal((await restored.act(pending, pending.pending!.check, "ui-query-key", signal())).state, "applied"); assert.equal(f.posts(), 1);
  const reopened = createAgentSubtaskSource(f.ports);
  assert.equal((await f.view(reopened, "A")).pending, undefined);
  assert.equal(await reopened.composer(await f.view(reopened, "A")).draft.adapter.read(signal()), "new A after send");
});

test("SAI-05: explicit continue only enables this stopped execution; opening or stale consent never starts a run", async () => {
  const f = fixture(); f.phase("stopped"); const source = createAgentSubtaskSource(f.ports), view = await f.view(source, "A");
  assert.equal(view.inputUnavailable, "continue-note"); assert.equal(f.posts(), 0);
  assert.equal((await source.act(view, view.actions![0]!, "enable-a", signal())).state, "applied");
  assert.equal((await f.view(source, "A")).inputUnavailable, undefined); assert.equal(f.posts(), 0);
  assert.equal((await f.view(source, "B")).inputUnavailable, "continue-note");
  assert.equal((await f.view(createAgentSubtaskSource(f.ports), "A")).inputUnavailable, "continue-note");
});


test("SAI-08: a permission refusal is explicit denial, not a transient failure that retains an accessible view", async () => {
  const f = fixture(), source = createAgentSubtaskSource({ ...f.ports, read: async () => { throw Object.assign(new Error("no longer permitted"), { status: 403 }); } });
  assert.deepEqual(await source.read("A", signal()), { state: "denied", reason: "unavailable" });
});


test("SAI-04/11: a late receipt loses its CAS to a newer draft in another page and preserves that draft", async () => {
  const f = fixture(), compare = f.ports.drafts.compareAndSwap;
  let held = false, release!: () => void;
  const source = createAgentSubtaskSource({ ...f.ports, drafts: { ...f.ports.drafts, compareAndSwap: async (key, expected, value) => {
    if (!held && expected?.includes('"pending"') && !value?.includes('"pending"')) { held = true; await new Promise<void>(resolve => { release = resolve; }); }
    return compare(key, expected, value);
  } } });
  const view = await f.view(source, "A"), input = source.composer(view);
  const sending = input.submit({ text: "first", controls: {}, materials: [], request_id: "late" }, signal());
  while (!f.posts()) await new Promise(resolve => setTimeout(resolve, 1)); f.release();
  while (!held) await new Promise(resolve => setTimeout(resolve, 1));
  const other = createAgentSubtaskSource(f.ports), otherInput = other.composer(await f.view(other, "A"));
  await otherInput.draft.adapter.write("written in the other page"); release();
  assert.equal((await sending).state, "sent");
  assert.equal(await otherInput.draft.adapter.read(signal()), "written in the other page");
  assert.equal((await f.view(other, "A")).pending, undefined);
});

test("SAI-04/06: an unknown accepted answer retains its original reference while a distinct queued resume proceeds once across pages", async () => {
  const f = fixture(); let current = data("A", "awaiting-input"), resumes = 0;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  f.ports.read = async () => ({ conversation: current, parent: { target: "parent", title: "parent" } });
  f.ports.check = async () => ({ state: "unknown" });
  f.ports.command = async (_target, input) => {
    if (input.kind === "answer") {
      current = { ...current, phase: "failed", queued_answer: { pending_id: input.pending_id, pending_revision: input.pending_revision } };
      return { state: "unknown" };
    }
    assert.equal(input.kind, "resume-answer"); resumes++; entered.resolve(); await release.promise;
    current = { ...current, phase: "completed", child: { ...current.child, child_run: { session_id: "A", run_id: "A-r2" } } }; delete current.queued_answer;
    return { state: "applied", run: current.child.child_run! };
  };
  const first = createAgentSubtaskSource(f.ports), initial = await f.view(first, "A");
  const answer = await first.act(initial, { id: "answer", ref: JSON.stringify({ pending_id: "q", pending_revision: 1, answers: [{ question: 0, value: 45 }] }), label: "Answer" }, "unknown-answer", signal());
  assert.equal(answer.state, "unknown");
  const second = createAgentSubtaskSource(f.ports), before = await f.view(second, "A");
  assert.equal(before.pending?.requestId, "unknown-answer"); assert.equal(before.pending?.blocking, true);
  const resume = before.actions!.find(action => action.id === "resume-answer")!; assert.equal(resume.pendingSafe, true);
  const continuing = second.act(before, resume, "resume-original-answer", signal()); await entered.promise;
  const competing = await first.act(before, resume, "competing-resume", signal()); assert.equal(competing.state, "not-applied"); assert.equal(resumes, 1);
  release.resolve(); assert.equal((await continuing).state, "applied");
  const reopened = createAgentSubtaskSource(f.ports), after = await f.view(reopened, "A");
  assert.equal(after.pending?.requestId, "unknown-answer", "the old receipt is neither discarded nor guessed successful");
  assert.equal(after.pending?.blocking, false, "an old exact-question scope cannot lock the new Run");
  assert.equal((await reopened.check("A", "unknown-answer", signal())).state, "unknown"); assert.equal(resumes, 1, "querying never resumes again");
});
