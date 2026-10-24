import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryPageRequest, MemoryPageResponse } from "@molis-ai/molis-work-contracts/services/memory";
import { MemoryService, characterOwner, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";
import { openPrologueMemoryAdoption } from "@molis-ai/molis-work-service-agent-host";
import { memoryServiceHome, observeMemoryBackend } from "./fixtures/memory-service-home.js";

const person: MemoryCaller = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "ui", person: true, purpose: "management" };
const meta = { kind: "convention", source: "manual", classification: { scenes: ["common"], lifecycle: "long-term" } };
async function pages(service: MemoryService, request: MemoryPageRequest) {
  const result: MemoryPageResponse[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.page(person, { ...request, ...(cursor ? { cursor } : {}) }); result.push(page);
    assert.ok(result.length < 20, "bounded continuation must make progress");
    assert.ok(page.exhausted || page.cursor, "an unfinished page must remain continuable");
    cursor = page.cursor;
  } while (cursor);
  return result;
}

test("formal management uses bounded SDK pages, resumes after reopen and never calls full list", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] }); await f.open();
  for (let index = 0; index < 5; index++) await f.raw().write({ scope: "personal", owner: person.actor_id,
    operation_id: `page-${index}`, text: `Distinct convention ${index}`, origin: "person", meta });
  let scans = 0;
  const service = () => new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    list: async () => { assert.fail("management pages must not call full list"); },
    page: async input => { scans++; assert.equal(input.scan_limit, 2); return bound.page(input); },
  })), managementPages: { scanLimit: 2 } });
  const first = await service().page(person, { scope: "personal", limit: 2 });
  assert.equal(first.items.length, 2); assert.equal(scans, 1); assert.equal(first.exhausted, false);
  assert.deepEqual(first.total, { kind: "unknown" }); assert.equal(first.scanned, "unknown");
  assert.deepEqual(Object.values(first.cost), ["unknown", "unknown", "unknown", "unknown", "unknown"]);
  await f.close(); await f.open();
  const second = await service().page(person, { scope: "personal", limit: 2, cursor: first.cursor });
  const last = await service().page(person, { scope: "personal", limit: 2, cursor: second.cursor });
  assert.equal(scans, 3); assert.equal(last.exhausted, true); assert.deepEqual(last.total, { kind: "unknown" });
  assert.equal(new Set([...first.items, ...second.items, ...last.items].map(item => item.memory_id)).size, 5);
  const all = await f.memory().withCaller({ ...person, current_scene: "common" }).page({ scope: "user", owner: person.actor_id });
  assert.deepEqual(all.total, { kind: "exact", value: 5 }, "one complete authorized SDK page has a precise total");
});

test("project pages include each current Character once; scope and query changes invalidate continuation", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] }), service = await f.open();
  await service.write(person, { scope: "personal", text: "Personal only" });
  await service.write(person, { scope: "project", text: "Project only" });
  for (const id of ["writer", "reviewer"]) await service.write({ ...person, character: { id, title: id } }, { scope: "character", text: `Role ${id}` });
  const result = await pages(service, { scope: "project", limit: 1 });
  assert.deepEqual(result.flatMap(page => page.items.map(item => item.text)).sort(), ["Project only", "Role reviewer", "Role writer"]);
  assert.ok(result.every(page => page.items.length <= 1 && page.total.kind === "unknown"));
  assert.equal(result[0]!.items[0]!.scope, "project");
  assert.equal(result[0]!.items[0]!.owner, "project-a");
  for (const item of result.flatMap(page => page.items).filter(item => item.scope === "character"))
    assert.equal(item.owner, characterOwner("project-a", item.character_id!));
  assert.ok(result.flatMap(page => page.items).every(item => item.owner !== item.character_title));
  const first = result[0]!;
  await assert.rejects(service.page(person, { scope: "project", limit: 1, cursor: first.cursor, query: "changed" }), { code: "memory.conflict" });
  await assert.rejects(service.page({ ...person, project_id: "project-b" }, { scope: "project", limit: 1, cursor: first.cursor }), { code: "memory.conflict" });
  await service.write({ ...person, character: { id: "new-role", title: "New role" } }, { scope: "character", text: "New role rule" });
  await assert.rejects(service.page(person, { scope: "project", limit: 1, cursor: first.cursor }), { code: "memory.conflict" });
  const selected = await service.page(person, { scope: "character", character_id: "writer" });
  assert.deepEqual(selected.items.map(item => item.character_id), ["writer"]);
  await assert.rejects(service.page(person, { scope: "character", character_id: "not-owned" }), { code: "memory.scope", kind: "forbidden" });
});

test("search and classification filtering retain bounded empty continuation and never invent a filtered total", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); await f.open();
  for (const [index, text] of ["Alpha rule", "Beta rule", "Needle rule"].entries()) await f.raw().write({ scope: "personal", owner: person.actor_id,
    operation_id: `search-${index}`, text, origin: "person", meta });
  const service = new MemoryService({ ledger: f.ledger(), backend: f.raw(), managementPages: { scanLimit: 1 } });
  const all = await pages(service, { scope: "personal", query: "not-present", limit: 1 });
  assert.equal(all.length, 3); assert.ok(all.every(page => page.items.length === 0 && page.total.kind === "unknown"));
  assert.equal(all[0]!.exhausted, false); assert.equal(all.at(-1)!.exhausted, true);
  const found = await pages(service, { scope: "personal", query: "needle", limit: 1 });
  assert.deepEqual(found.flatMap(page => page.items.map(item => item.text)), ["Needle rule"]);
  const filtered = await pages(service, { scope: "personal", filter: { scenes: ["coding"] }, limit: 1 });
  assert.deepEqual(filtered.flatMap(page => page.items), []);
});

test("off management preserves actual expired state and all six kinds without widening write classification", async t => {
  let now = Date.UTC(2026, 9, 23);
  const f = await memoryServiceHome(t, { projects: ["project-a"], now: () => new Date(now) }), service = await f.open();
  for (const kind of ["preference", "convention", "fact", "experience", "habit", "project-decision"]) await f.raw().write({ scope: "personal", owner: person.actor_id,
    operation_id: kind, text: `Managed ${kind}`, origin: "person", meta: { ...meta, kind } });
  const expiring = await f.raw().write({ scope: "personal", owner: person.actor_id, operation_id: "expiring", text: "Expiring active rule", origin: "person",
    meta: { ...meta, classification: { scenes: ["common"], lifecycle: "short-term" }, expires_at_ms: now + 1000 } });
  now += 2000; service.savePrefs(person, "personal", "off");
  const result = await service.page(person, { scope: "personal" });
  assert.equal(result.items.length, 7); assert.deepEqual(result.total, { kind: "exact", value: 7 });
  assert.deepEqual(new Set(result.items.map(item => item.kind)), new Set(["preference", "convention", "fact", "experience", "habit", "project-decision"]));
  const expired = result.items.find(item => item.memory_id === expiring.memory_id)!;
  assert.equal(expired.state, "active"); assert.equal(expired.expired, true); assert.equal(expired.state_reason, null);
  assert.deepEqual((await service.page(person, { scope: "personal", filter: { expired: true, states: ["active"] } })).items.map(item => item.memory_id), [expiring.memory_id]);
  await assert.rejects(service.page({ ...person, person: false }, { scope: "personal" }), { code: "memory.forbidden" });
  await assert.rejects(f.memory().withCaller({ ...person, project_id: "project-a", current_scene: "common" }).page({ scope: "project", owner: "foreign" }), { code: "MEMORY_SCOPE_DENIED" });
});

test("adopted unclassified formal data stays unclassified and reads do not rewrite its canonical entry", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] });
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(f.home, "sdk") }) });
  try { await runtime.store.commit({ kind: "memories", id: "owner.project-project-a.historical.v1", expectedVersion: 0,
    metadata: { scope: "owner.project-project-a", rowId: "historical", version: 1, state: "active", shape: 2 },
    secureBody: new TextEncoder().encode(JSON.stringify({ id: "historical", scope: "project", owner: "project-a", version: 1,
      text: "Historical rule", origin: "Imported record", tags: [], tombstoned: false,
      meta: { kind: "convention", source: "manual" }, createdAtMs: 100, updatedAtMs: 100 })) });
  } finally { await runtime.shutdown(); }
  const maintenance = await openPrologueMemoryAdoption({ appVersion: "1.0.0", storageRoot: join(f.home, "sdk"), scopes: [{ scope: "project", owner: "project-a" }],
    policy: memoryRuntimePolicy(() => undefined).policy });
  try { assert.equal((await maintenance.adopt({ kind: "memory", scope: "project", owner: "project-a" })).outcome, "completed"); }
  finally { await maintenance.close(); }
  const service = await f.open(), before = await f.raw().list("project", "project-a");
  const result = await service.page(person, { scope: "project", filter: { unclassified: true } });
  assert.equal(result.items.length, 1); assert.equal(result.items[0]!.classification, null); assert.deepEqual(result.total, { kind: "unknown" });
  assert.deepEqual((await service.page(person, { scope: "project", filter: { scenes: ["common"] } })).items, []);
  assert.deepEqual(await f.raw().list("project", "project-a"), before);
  await f.close(); await f.open(); assert.deepEqual(await f.raw().list("project", "project-a"), before);
});

test("cancellation and a changed current owner set cannot return an already-read page", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), original = await f.open();
  await original.write(person, { scope: "project", text: "Project rule" });
  const controller = new AbortController(); let after: (() => Promise<void>) | undefined;
  const service = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    page: async input => { const result = await bound.page(input); await after?.(); return result; },
  })) });
  after = async () => { controller.abort(); };
  await assert.rejects(service.page({ ...person, signal: controller.signal }, { scope: "project" }), { name: "AbortError" });
  after = async () => { await original.write({ ...person, character: { id: "late", title: "Late" } }, { scope: "character", text: "Late role rule" }); };
  await assert.rejects(service.page(person, { scope: "project" }), { code: "memory.conflict" });
  assert.equal((await original.page(person, { scope: "project" })).items.length, 1, "failed queries do not mutate the formal entry");
});

test("non-product source metadata is not relabelled and an empty projected page retains SDK continuation", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }); await f.open();
  await f.raw().write({ scope: "personal", owner: person.actor_id, operation_id: "external-source", text: "External source rule", origin: "external",
    meta: { ...meta, source: "external-observation" } });
  await f.raw().write({ scope: "personal", owner: person.actor_id, operation_id: "known-source", text: "Known source rule", origin: "person", meta });
  const seen: Array<Awaited<ReturnType<ReturnType<typeof f.raw>["page"]>>> = [];
  const service = new MemoryService({ ledger: f.ledger(), backend: observeMemoryBackend(f.raw(), bound => ({ ...bound,
    page: async input => { const result = await bound.page(input); seen.push(result); return result; },
  })) });
  const result = await pages(service, { scope: "personal", limit: 1 });
  assert.deepEqual(result.flatMap(page => page.items.map(item => item.text)), ["Known source rule"]);
  const omitted = result.findIndex(page => page.items.length === 0); assert.ok(omitted >= 0);
  assert.equal(seen[omitted]!.items[0]!.meta.source, "external-observation");
  assert.equal(result[omitted]!.exhausted, seen[omitted]!.exhausted);
  assert.equal(result[omitted]!.stopped, seen[omitted]!.stopped);
  assert.equal(result[omitted]!.scanned, seen[omitted]!.scanned);
  assert.deepEqual(result[omitted]!.total, { kind: "unknown" });
  assert.equal(!!result[omitted]!.cursor, !!seen[omitted]!.cursor);
});
