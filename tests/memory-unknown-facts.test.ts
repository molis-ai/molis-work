import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { MemoryEvidenceInput } from "@molis-ai/molis-work-contracts/services/memory";
import type { MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { memoryServiceHome } from "./fixtures/memory-service-home.js";

const caller = (operation_id: string): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a",
  consumer: "ui", person: true, current_scene: "common", purpose: "management", operation_id });
const classification = { scenes: ["common"], lifecycle: "long-term" };
const evidence = [{ kind: "external-note", text: "A historical observation", ref: "external:note-7" },
  { kind: "object", ref: '{ "kind": "document", "id": "doc-1" }' }];

/** RAC-2375: a current SDK shape 8 record with absent facts, written through its public storage owner. */
async function historical(f: Awaited<ReturnType<typeof memoryServiceHome>>) {
  await f.close();
  const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
  const { createRuntime } = await import(requireSdk.resolve("@prologue/sdk"));
  const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
  const runtime = await createRuntime({ app: { appId: "io.molis.work", appVersion: "1.0.0" }, host: createNodeHost({ storageRoot: join(f.home, "sdk") }) });
  try {
    await runtime.store.commit({ kind: "memories", id: "owner.project-project-a.historical.v1", expectedVersion: 0,
      metadata: { scope: "owner.project-project-a", rowId: "historical", version: 1, state: "active", shape: 8 },
      secureBody: new TextEncoder().encode(JSON.stringify({ id: "historical", scope: "project", owner: "project-a", version: 1,
        text: "Historical publication convention", origin: "Imported record", tags: [], tombstoned: false,
        meta: { kind: "convention", source: "auto", classification, evidence }, createdAtMs: 0, updatedAtMs: 0 })) });
  } finally { await runtime.shutdown(); }
  return f.open();
}

test("old unknown facts stay unknown through state edits, content edits, history and restart", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] });
  let service = await historical(f);
  const [before] = await f.raw().list("project", "project-a"); assert.ok(before);
  const [item] = (await service.list(caller("read"), { scope: "project" })).items; assert.ok(item);
  assert.deepEqual([item.basis, item.approved_by, item.created_at, item.updated_at], [null, null, null, null]);
  assert.deepEqual(item.evidence[0], { ...evidence[0], at: null });
  assert.equal(item.evidence[1]!.at, null);
  assert.deepEqual((await f.raw().list("project", "project-a"))[0], before, "projection does not rewrite the SDK row");
  assert.deepEqual(f.ledger().revisions(item.memory_id), []);
  const disabled = await service.change(caller("disable"), { memory_id: item.memory_id, action: "disable", expected_version: item.version });
  assert.equal(disabled.memory!.version, item.version + 1, "state-only change does not normalize metadata first");
  const saved = (await f.raw().list("project", "project-a"))[0]!;
  assert.deepEqual(saved.meta, before.meta, "unknown kind and opaque or formatted references remain exact");
  await service.change(caller("enable"), { memory_id: item.memory_id, action: "enable", expected_version: saved.version });
  const enabled = (await f.raw().list("project", "project-a"))[0]!;
  const edited = await service.change(caller("edit"), { memory_id: item.memory_id, action: "update", text: "Edited publication convention", expected_version: enabled.version });
  assert.deepEqual([edited.memory!.basis, edited.memory!.approved_by, edited.memory!.created_at], [null, null, null]);
  assert.deepEqual((await f.raw().list("project", "project-a"))[0]!.meta, before.meta);
  await f.close(); service = await f.open();
  const reopened = (await service.list(caller("reopen"))).items[0]!;
  assert.deepEqual([reopened.basis, reopened.approved_by, reopened.created_at, reopened.evidence], [null, null, null, item.evidence]);
  assert.deepEqual(f.ledger().revisions(item.memory_id)[0]!.snapshot!.meta, before.meta);
});

test("unknown basis export and import stay unknown and do not become inferred candidates", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a", "project-b"] });
  const service = await historical(f), pack = await service.exportScope(caller("export"), "project");
  assert.equal(pack.entries[0]!.basis, null);
  assert.equal("evidence" in pack.entries[0]!, false, "export still excludes source quotations");
  const target = { ...caller("import"), project_id: "project-b" };
  assert.deepEqual(await service.importScope(target, "project", pack), { written: 1, skipped: 0, refused: 0 });
  const imported = (await service.list(target, { scope: "project" })).items[0]!;
  assert.deepEqual([imported.basis, imported.approved_by, imported.source], [null, null, "imported"]);
  assert.deepEqual(await service.candidates(target), []);
  const row = (await f.raw(target).list("project", "project-b"))[0]!;
  assert.equal(row.meta.basis, undefined); assert.equal(row.meta.approved_by, undefined);
});

test("unknown timestamps have no fresh boost and cannot establish ninety days of disuse", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await historical(f);
  const known = await f.raw().write({ scope: "project", owner: "project-a", operation_id: "known", text: "Historical publication convention current",
    origin: "Known current record", meta: { kind: "convention", source: "auto", classification, basis: "repeated", approved_by: { by: "person" } } });
  const listed = await service.list(caller("list"), { scope: "project" });
  assert.equal(listed.items[0]!.memory_id, known.memory_id);
  const recall = await service.recall(caller("recall"), { query: "publication convention", scopes: ["project"] }, { readMode: "explicit" });
  assert.equal(recall.items[0]!.memory_id, known.memory_id);
  const report = await service.upkeep(caller("upkeep"), { projects: ["project-a"] });
  assert.equal(report.unused, 0); assert.equal(report.merged, 0, "unknown creation order is not invented for automatic merge");
  assert.equal((await service.list(caller("after"))).items.find(item => item.memory_id !== known.memory_id)!.state, "active");
});

test("undo recreates the saved unknown basis, approval and evidence rather than approving old content", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const meta = { kind: "convention" as const, source: "auto" as const, classification, evidence };
  const first = await f.raw().write({ scope: "project", owner: "project-a", operation_id: "first", text: "Published release notes have a concise final summary", origin: "First record", meta });
  const second = await f.raw().write({ scope: "project", owner: "project-a", operation_id: "second", text: "Published release notes have concise final summary", origin: "Second record", meta });
  // Record the safe history through the public edit path without inventing missing approval or basis.
  for (const entry of [first, second]) {
    const confirmed = await service.change(caller(`confirm-${entry.memory_id}`), {
      memory_id: entry.memory_id, action: "update", expected_version: entry.version, text: entry.text,
    });
    const current = (await f.raw().list("project", "project-a")).find(item => item.memory_id === entry.memory_id)!;
    assert.equal(current.version, confirmed.memory!.version);
    assert.deepEqual(current.meta, entry.meta); assert.equal(current.origin, entry.origin);
  }
  const report = await service.upkeep(caller("merge"), { projects: ["project-a"] }); assert.equal(report.merged, 1);
  const change = (await service.changes(caller("changes"))).find(item => item.kind === "merged")!; assert.ok(change);
  const keep = (await f.raw().list("project", "project-a"))[0]!;
  const removed = keep.memory_id === first.memory_id ? second : first;
  await service.undo(caller("undo"), change.change_id);
  const restored = (await f.raw().list("project", "project-a")).find(item => item.text === removed.text)!; assert.ok(restored);
  assert.equal(restored.meta.basis, undefined); assert.equal(restored.meta.approved_by, undefined);
  assert.deepEqual(restored.meta.evidence, removed.meta.evidence);
  assert.equal(f.ledger().change(change.change_id)!.state, "undone");
});

test("new formation rejects unknown basis, evidence kinds and missing times without candidates", async t => {
  const f = await memoryServiceHome(t, { projects: ["project-a"] }), service = await f.open();
  const input = { scope: "project" as const, kind: "convention" as const, text: "Publication changes need a summary", basis: "repeated" as const,
    why: "Observed publication convention", from: "extraction" as const };
  for (const [index, change] of [ { basis: null }, { evidence: [{ kind: "external-note", at: new Date().toISOString() }] },
    { evidence: [{ kind: "said", at: null }] } ].entries()) {
    const invalid = { ...input, ...change } as Parameters<typeof service.offer>[1];
    await assert.rejects(service.offer(caller(`offer-${index}`), invalid), { code: "memory.invalid" });
    await assert.rejects(service.propose(caller(`propose-${index}`), invalid), { code: "memory.invalid" });
  }
  assert.deepEqual(await f.raw().list("project", "project-a"), []);
  assert.deepEqual(await f.raw().candidates.list("project", "project-a"), []);
  const fresh: MemoryEvidenceInput = { kind: "said", text: input.text, at: new Date().toISOString() };
  const proposal = await service.propose(caller("valid"), { ...input, basis: "explicit", evidence: [fresh] });
  assert.equal(proposal.basis, "explicit"); assert.equal(proposal.state, "pending");
});
