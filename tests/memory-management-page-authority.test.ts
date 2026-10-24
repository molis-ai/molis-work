import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { createPrologueNodeAdapter, type PrologueNodeAdapterOptions } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy, prologueMemoryBackend, type MemoryRuntimePolicyOwner } from "@molis-ai/molis-work-app-local-host";
import { MemoryService } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";

const person = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "a", consumer: "ui", person: true, current_scene: "common", purpose: "management" as const };

test("SDK management scope and diagnostic permission are checked again before a real Node page returns", async t => {
  const home = await mkdtemp(join(tmpdir(), "molis-page-authority-")), ledger = openMemoryLedger({ homeDirectory: home });
  let alive = true, service!: MemoryService, queryChecks = 0, entryChecks = 0, mode: "normal" | "deny" | "revoke" | "redact" = "normal";
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | undefined;
  t.after(async () => { await adapter?.close(); ledger.close(); await rm(home, { recursive: true, force: true }); });
  const owner: MemoryRuntimePolicyOwner = { alive: () => alive, prefsFor: (scope, project) => service.prefsFor(person.actor_id, scope, project),
    owners: project => ledger.owners(project), candidateOwners: project => ledger.candidateOwners(project),
    projectExists: async id => ["a", "b"].includes(id), deletingProject: () => undefined };
  const policy = memoryRuntimePolicy(() => owner);
  const memory: NonNullable<PrologueNodeAdapterOptions["memory"]> = { ...policy,
    async authorize(caller, requests) { entryChecks++; return policy.authorize(caller, requests); },
    async authorizeManagement(caller, request) {
      queryChecks++;
      if (mode === "deny" || mode === "revoke" && queryChecks === 2) alive = false;
      const permission = await policy.authorizeManagement(caller, request);
      return { ...permission, storageCost: mode === "redact" && queryChecks === 2 ? "redacted" : "visible" };
    },
    promotion: { policy: "memory.write-gate", version: 3, decide: (caller, request) => service.promotion.decide(caller, request),
      undo: { prepare: (caller, request) => service.promotion.undo.prepare(caller, request), record: (caller, request) => service.promotion.undo.record(caller, request) } },
  };
  adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), memory,
    modelConfiguration: async () => { assert.fail("management must not call a model"); } });
  service = new MemoryService({ ledger, backend: prologueMemoryBackend(async () => adapter!.memory!) });
  const bound = adapter.memory!.withCaller(person);
  const entry = await bound.write({ scope: "project", owner: "a", operation_id: "stored", text: "Canonical convention", origin: "person",
    meta: { kind: "convention", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" } } });
  mode = "deny"; queryChecks = entryChecks = 0;
  await assert.rejects(bound.page({ scope: "project", owner: "a" }), { code: "MEMORY_SCOPE_DENIED" });
  assert.equal(queryChecks, 1); assert.equal(entryChecks, 0, "rejected query never begins per-entry admission");
  alive = true; mode = "revoke"; queryChecks = 0;
  await assert.rejects(bound.page({ scope: "project", owner: "a" }), { code: "MEMORY_SCOPE_DENIED" }); assert.equal(queryChecks, 2);
  alive = true; mode = "redact"; queryChecks = 0;
  const redacted = await bound.page({ scope: "project", owner: "a" });
  assert.equal(queryChecks, 2); assert.deepEqual(redacted.items.map(item => [item.memory_id, item.version]), [[entry.memory_id, entry.version]]);
  assert.equal(redacted.scanned, "unknown"); assert.ok(Object.values(redacted.cost).every(value => value === "unknown"));
  assert.equal(redacted.stopped, "unknown"); assert.deepEqual(redacted.total, { kind: "exact", value: 1 });
  mode = "normal"; queryChecks = 0;
  const visible = await bound.page({ scope: "project", owner: "a" });
  assert.equal(typeof visible.scanned, "number"); assert.equal(typeof visible.cost.body_reads, "number");
  assert.deepEqual(await bound.list("project", "a"), [entry], "failed management queries do not change the stored version or contents");
});
