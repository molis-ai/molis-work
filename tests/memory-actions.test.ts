import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { MEMORY_PERMISSIONS, MEMORY_PROVIDER_ID, memoryActions } from "@molis-ai/molis-work-contracts/services/memory";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import { memoryHostFor } from "../apps/local-host/src/memory/memory-host.js";
import { ASSISTANT_STORE_NAME, AssistantStore } from "../apps/local-host/src/assistant/assistant-store.js";
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
  // An agent keeps something only with the person's words; it is the local person's personal memory.
  await assert.rejects(asAgent.invoke(memoryActions.write, { scope: "personal", text: "喜欢简短" }), /原话/);
  const kept = await asAgent.invoke(memoryActions.write, { scope: "personal", text: "回答用要点列表", said: "以后回答都用要点列表" });
  assert.equal(kept.outcome, "written");
  assert.deepEqual((await asPerson.invoke(memoryActions.list, {})).items.map(item => [item.text, item.source]), [["回答用要点列表", "said"]]);
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

test("the Assistant's first-version tables in <Home>/assistant move into the platform once when the memory host starts", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-migration-"));
  const db = openHomeSqliteDatabase(home, ASSISTANT_STORE_NAME);
  const legacy = new AssistantStore(db);
  legacy.setMemoryPrefs("web-user", { form: true, use_personal: false, use_project: true, learn_personal: true, learn_project: false });
  legacy.setMemoryDisabled("web-user", "memory-legacy-1", true);
  legacy.saveMemoryCandidate("web-user", { candidate_id: "candidate-legacy-1", work_id: "work-1", work_title: "周报", scope: "personal", text: "周报用要点", why: "两次", applies: "写周报时",
    state: "pending", created_at: new Date().toISOString() });
  db.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  t.after(async () => { await host.close(); await rm(home, { recursive: true, force: true }); });
  const asPerson = bindActionClient(host.homeActionClient(), () => person);
  const prefs = await asPerson.invoke(memoryActions.prefs, { scope: "personal" });
  assert.equal(prefs.prefs.consumers.assistant, false, "use_personal off moved to 助理 can use personal memories: off");
  assert.equal(prefs.prefs.learn_from_work, true);
  const { candidates } = await asPerson.invoke(memoryActions.candidates, {});
  // Moved into Prologue's persistent candidate box (a new id there), with what explains it kept by the Host.
  assert.deepEqual(candidates.map(item => [item.text, item.why, item.applies.task, item.work?.title]), [["周报用要点", "两次", "写周报时", "周报"]]);
  assert.notEqual(candidates[0]!.candidate_id, "candidate-legacy-1");
  assert.deepEqual(memoryHostFor(host)!.service.assistantPrefs("web-user"), { form: true, use_personal: false, use_project: true, learn_personal: true, learn_project: false });
});
