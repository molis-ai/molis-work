import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { memoryActions, MEMORY_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/memory";
import type { AgentActionClient } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, defaultPrefs, MEMORY_GATE_POLICY, MEMORY_GATE_VERSION } from "@molis-ai/molis-work-service-memory";
import { acquireStorageOwner, initializeMemoryForgetting, openMemoryLedger } from "@molis-ai/molis-work-storage";
import { memoryRuntimePolicy, prologueMemoryBackend } from "@molis-ai/molis-work-app-local-host";
import { cogniaScriptedResponse } from "./fixtures/cognia-model-response.js";

type Request = { messages: Array<{ content: string | Array<{ type: string; content?: string; text?: string }> }>; tools?: Array<{ name: string }> };
for (const change of ["unchanged", "remove", "class-off"] as const) test(`C1 actual App projection hides never-admitted A while valid B dispatches after ${change}`, { timeout: 20_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-c1-omitted-")), seen: Request[] = [];
  const inB = Promise.withResolvers<void>(), releaseB = Promise.withResolvers<void>();
  const storageOwner = acquireStorageOwner(join(home, "agent-runtime"));
  initializeMemoryForgetting({ homeDirectory: home, storageOwner, assertCurrent() {} });
  const ledger = openMemoryLedger({ homeDirectory: home, storageOwner });
  for (const key of ["personal", "project-default"] as const) ledger.savePrefs(LOCAL_PERSON_ACTOR_ID, key, defaultPrefs(key === "personal" ? "personal" : "project", "reviewed"));
  const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "c1-project", consumer: "agent", plugin_id: "io.molis.work.coding", current_scene: "coding" } as const;
  const person = { ...caller, consumer: "ui", person: true, purpose: "management" } as const;
  let service!: MemoryService, alive = true, expanding = false, recalledBoth = false, countA = 0, held = false, aId = "", bId = "";
  const policy = memoryRuntimePolicy(() => ({ alive: () => alive, prefsFor: (scope, project) => service.prefsFor(caller.actor_id, scope, project),
    forgettingPhase: () => service.forgettingPhase(), owners: project => ledger.owners(project),
    candidateOwners: project => ledger.candidateOwners(project), projectExists: async project => project === caller.project_id, deletingProject: () => undefined }));
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body) as Request; seen.push(request);
    const result = seen.length === 1 ? cogniaScriptedResponse({ name: request.tools!.find(tool => tool.name.startsWith("molis-action-"))!.name, input: { scope: "project" } })
      : cogniaScriptedResponse(undefined, "完成。");
    res.writeHead(result.status, Object.fromEntries(result.headers)); res.end(await result.text());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  t.after(async () => { releaseB.resolve(); alive = false; await adapter?.close(); ledger.close(); storageOwner.release(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); });
  adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "agent-runtime"), storageOwner,
    memory: { ...policy, promotion: { policy: MEMORY_GATE_POLICY, version: MEMORY_GATE_VERSION, decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } }, async authorize(trusted, requests) {
      const reads = requests.filter(one => one.action === "read" && one.readMode === "explicit");
      if (expanding && reads.length === 2 && reads.some(one => one.target.ref.id === aId) && reads.some(one => one.target.ref.id === bId)) recalledBoth = true;
      if (recalledBoth && reads.length === 1) {
        if (reads[0]!.target.ref.id === aId) countA++;
        if (!held && countA >= 3 && reads[0]!.target.ref.id === bId) { held = true; inB.resolve(); await releaseB.promise; }
      }
      return policy.authorize(trusted, requests);
    } },
    modelConfiguration: async () => ({ protocol: "anthropic-compatible", endpoint: `http://127.0.0.1:${address.port}/v1/messages`, model: "fixture", credential_ref: "fixture" }), resolveCredential: () => "test-only" });
  service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter!.memory!) });
  const b = await service.write(person, { scope: "project", kind: "fact", text: "VALID_B" });
  const a = await service.write(person, { scope: "project", kind: "convention", text: "NEVER_ADMITTED_A ".repeat(15) }); assert.ok(a.memory && b.memory); aId = a.memory.memory_id; bId = b.memory.memory_id;
  service.savePrefs(person, "project", { plugins: { [caller.plugin_id]: { allowed: true, kinds: ["convention", "fact"] } }, class_restrictions: ["convention", "fact"].map(kind => ({
    selector: { consumer: "agent" as const, current_scene: "coding" as const, kind }, read: "explicit-only" as const, form: "inherit" as const,
  })) });
  const chosen = await service.forRun(caller, {}); assert.ok(chosen);
  const view: ActionView = { ...memoryActions.list, provider: { provider_id: MEMORY_PROVIDER_ID, title: "Memory", kind: "system" }, availability: { available: true } };
  const client: AgentActionClient = { discover: async () => [view], invoke: async (_ref, _input, signal, control) => {
    assert.ok(control); control.assert_current();
    const result = await service.list({ ...caller, class_restrictions: chosen.class_restrictions, context_selection: true, purpose: "task", signal }, { scope: "project" });
    expanding = true; return result;
  } };
  const owner = { ...caller, install_id: "c1-install" }, session = await adapter.createSession({ ...owner, workspace: "business", title: "Omitted authority" });
  const handle = await adapter.start({ ...owner, session, workspace: "business", role_id: "reader", task: "Inspect saved material", role: { role_id: "reader", version: 1,
    workspace: "business", execution: "read-only", host_tools: [], prompts: [], memory: { ...chosen, skip: true, task: false, budget_chars: 100 }, actions: { tools: [view], client } } });
  await Promise.race([inB.promise, new Promise<never>((_resolve, reject) => { const timer = setTimeout(() => reject(new Error(`canonical B barrier not reached; seen=${seen.length}; A=${countA}; joint=${recalledBoth}`)), 5000); timer.unref(); })]); assert.equal(countA, 3);
  if (change === "remove") await service.change(person, { memory_id: aId, expected_version: a.memory.version, action: "remove" });
  if (change === "class-off") service.savePrefs(person, "project", { class_restrictions: [{ selector: { consumer: "agent", current_scene: "coding", kind: "convention" }, read: "off", form: "inherit" }] });
  releaseB.resolve();
  let result;
  for (const until = Date.now() + 10_000;; await new Promise(resolve => setTimeout(resolve, 10))) {
    result = await adapter.read(handle.ref); if (["completed", "failed", "cancelled"].includes(result.phase)) break;
    assert.ok(Date.now() < until, "the original Run reaches a terminal state");
  }
  assert.equal(result.phase, "completed", result.stop_reason); assert.equal(seen.length, 2);
  const sent = JSON.stringify(seen[1]); assert.equal(sent.includes(aId), false); assert.doesNotMatch(sent, /NEVER_ADMITTED_A/); assert.ok(sent.includes(bId)); assert.match(sent, /VALID_B/);
  const tools = seen[1]!.messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(block => block.type === "tool_result") : []);
  assert.equal(tools.length, 1); const receipt = JSON.parse(tools[0]!.content!);
  assert.equal(receipt.outcome, "queued"); assert.equal(Object.hasOwn(receipt, "omitted"), false); assert.equal(Object.hasOwn(receipt, "queued"), false);
  assert.ok(result.memory_recalled?.contexts?.some(context => context.status === "response-observed" && context.references.some(ref => ref.memory_id === bId)));
});
