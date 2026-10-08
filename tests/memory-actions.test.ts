import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { memoryHostFor } from "../apps/local-host/src/memory/memory-host.js";
import { LOCAL_OWNER_PERMISSIONS } from "../apps/local-host/src/local-owner-permissions.js";
import { assistantAuthority } from "../apps/local-host/src/assistant/assistant-authority.js";

const person: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [...MEMORY_PERMISSIONS] };
const agent: ActionCallContext = { actor_id: "agent:coding-1", actor_kind: "runtime", project_id: null, audience: "agent", permissions: [...MEMORY_PERMISSIONS] };

test("memory is one system.memory provider in the shared directory: the person manages it, agents read and write by the gate, the local person owns what agents keep", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  assert.ok(memoryHostFor(host), "registered with the Agent service of this Home");
  assert.ok(LOCAL_OWNER_PERMISSIONS.includes("memory:recall") && LOCAL_OWNER_PERMISSIONS.includes("memory:configure"), "the person holds every memory permission");
  const client = host.homeActionClient();
  const views = await client.discover(person);
  const memoryViews = views.filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID);
  assert.deepEqual(memoryViews.map(view => view.capability_id).sort(), ["memory.candidates.accept", "memory.candidates.discard", "memory.candidates.list", "memory.change", "memory.changes.list",
    "memory.changes.undo", "memory.export", "memory.history", "memory.import", "memory.list", "memory.pairs.list", "memory.pairs.resolve", "memory.prefs.read", "memory.prefs.write",
    "memory.recall", "memory.scope.clear", "memory.scope.preview", "memory.signals.report", "memory.upkeep.run", "memory.write"]);
  const agentViews = (await client.discover(agent)).filter(view => view.provider.provider_id === MEMORY_PROVIDER_ID).map(view => view.capability_id).sort();
  assert.deepEqual(agentViews, ["memory.list", "memory.recall", "memory.write"], "agents see reading and the gated write, never management");

  const asPerson = bindActionClient(client, () => person), asAgent = bindActionClient(client, () => agent);
  // An agent must bring a quote of the person's words, but the Host holds none of the person's messages for it to be checked against: what an agent writes is a suggestion, never "you said".
  await assert.rejects(asAgent.invoke(memoryActions.write, { scope: "personal", text: "喜欢简短" }), /原话/);
  const suggested = await asAgent.invoke(memoryActions.write, { scope: "personal", text: "回答用要点列表", said: "回答用要点列表" });
  assert.deepEqual([suggested.outcome, suggested.memory, suggested.candidate?.text, suggested.candidate?.basis], ["candidate", null, "回答用要点列表", "inferred"]);
  assert.match(suggested.reason, /没有保存/);
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items, [], "nothing was recorded as the person's words");
  // It becomes a memory when the person accepts it: the local person's personal memory, as accepted.
  const kept = await asPerson.invoke(memoryActions.accept, { candidate_id: suggested.candidate!.candidate_id });
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items.map(item => [item.text, item.source]), [["回答用要点列表", "accepted"]]);
  // The person's page recalls as the interface consumer; an agent as Agent work.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下", used_for: "Coding 工作" });
  assert.deepEqual(recalled.items.map(item => item.text), ["回答用要点列表"]);
  await asPerson.invoke(memoryActions.savePrefs, { scope: "personal", prefs: { consumers: { agent: false } } });
  const off = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.equal(off.state, "off");
  assert.match(off.reason ?? "", /Agent 工作/);
  // Management is the person's own: an agent cannot reach it at all.
  await assert.rejects(client.invoke(agent, { capability_id: memoryActions.change.capability_id, version: 1, provider_id: MEMORY_PROVIDER_ID }, { memory_id: kept.memory!.memory_id, action: "remove" }));
  // Undo and history by the person.
  const history = await asPerson.invoke(memoryActions.history, { memory_id: kept.memory!.memory_id });
  assert.equal(history.revisions.length, 1);
  const removed = await asPerson.invoke(memoryActions.change, { memory_id: kept.memory!.memory_id, action: "remove" });
  assert.equal(removed.memory, null);
  assert.equal((await asPerson.invoke(memoryActions.list, {})).items.length, 0);
  // The Assistant keeps and reads memories only through its own tools, under its own switches: its gateway never offers these.
  const assistant = assistantAuthority(host, { work_id: "work-1", session_id: null, project_ref: null } as never, () => new Set());
  const gateway = await (await assistant.actions!("prologue")).discover();
  assert.ok(gateway.length > 0);
  assert.equal(gateway.some(view => view.provider.provider_id === MEMORY_PROVIDER_ID), false);
  // Interface signals report as the person.
  const signal = await asPerson.invoke(memoryActions.signal, { event_id: "evt-00000001", signal: "accepted", subject: { capability_id: "pages.polish", label: "润色" } });
  assert.equal(signal.state, "counted");
});

test("memory.recall cancelled while it waits for the store settles nothing: no receipts, nothing shown as 最近用于", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-recall-cancel-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const service = memoryHostFor(host)!.service;
  const client = host.homeActionClient();
  const asAgent = bindActionClient(client, () => agent), asPerson = bindActionClient(client, () => person);
  await asPerson.invoke(memoryActions.write, { scope: "personal", text: "回答用要点列表" });
  const recallRef = { capability_id: memoryActions.recall.capability_id, version: 1, provider_id: MEMORY_PROVIDER_ID };

  // The call is stopped while it is reading the store: the read finishes, the call's own effect check refuses, and no receipt is written.
  const controller = new AbortController();
  const backend = (service as unknown as { ports: { backend: { list: (...args: unknown[]) => Promise<unknown> } } }).ports.backend;
  const list = backend.list.bind(backend);
  backend.list = async (...args) => { controller.abort(); return list(...args); };
  try { await assert.rejects(client.invoke({ ...agent, signal: controller.signal }, recallRef, { query: "总结一下" })); }
  finally { backend.list = list; }
  assert.deepEqual(service.uses({}), [], "a stopped recall leaves no 最近用于");

  // Not stopped: the receipt is written as before.
  const recalled = await asAgent.invoke(memoryActions.recall, { query: "总结一下" });
  assert.deepEqual(service.uses({ receipt_id: recalled.receipt_id }).map(use => use.state), ["used"]);
});
