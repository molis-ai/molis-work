import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentHost, AgentReviewQueue, createPrologueNodeAdapter } from "@molis-ai/molis-work-service-agent-host";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import { openMemoryLedger } from "@molis-ai/molis-work-storage";
import type { MemoryLedgerPort } from "@molis-ai/molis-work-contracts/services/memory";
import { prologueMemoryBackend } from "../apps/local-host/src/memory/memory-host.js";
import { readerOutcome } from "../apps/local-host/src/memory/memory-upkeep.js";

async function memoryHome(t: { after(fn: () => Promise<void> | void): void }, clock: { now: Date }) {
  const home = await mkdtemp(join(tmpdir(), "molis-memory-upkeep-"));
  let adapter: Awaited<ReturnType<typeof createPrologueNodeAdapter>> | null = null, ledger: MemoryLedgerPort | null = null, host: AgentHost | null = null;
  const open = async () => {
    const queue = new AgentReviewQueue();
    host = new AgentHost({ reviews: queue });
    adapter = await createPrologueNodeAdapter({ app: { appId: "io.molis.work.memory-upkeep-test", appVersion: "1.0.0" }, storageRoot: join(home, "sdk"), reviewQueue: queue,
      modelConfiguration: async () => null as never, resolveCredential: () => null });
    host.register(adapter);
    ledger = openMemoryLedger({ homeDirectory: home });
    const current = host;
    return new MemoryService({ backend: prologueMemoryBackend(async () => current.adapter("prologue").memory!), ledger, timeZone: "Asia/Shanghai", now: () => clock.now });
  };
  const close = async () => { ledger?.close(); ledger = null; await adapter?.close(); adapter = null; };
  t.after(async () => { await close(); await rm(home, { recursive: true, force: true }); });
  return { open, close, ledger: () => ledger!, raw: () => prologueMemoryBackend(async () => host!.adapter("prologue").memory!) };
}

const person = (project: string | null = "project-a"): MemoryCaller => ({ actor_id: "web-user", project_id: project, consumer: "ui", person: true });
const assistant = (work = "work-1"): MemoryCaller => ({ actor_id: "web-user", project_id: "project-a", consumer: "assistant", work: { work_id: work, title: work } });

test("clearing a scope previews first; anything written after the preview makes the confirmation fail and nothing goes", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  for (const text of ["一", "二", "三"]) await memory.write(person(), { scope: "personal", text: `偏好${text}` });
  await memory.write(person(), { scope: "project", text: "项目约定" });
  const preview = await memory.previewScope(person(), "personal");
  assert.equal(preview.count, 3);
  await memory.write(person(), { scope: "personal", text: "预览之后又记的一条" });
  await assert.rejects(memory.clearScope(person(), "personal", preview.fingerprint), /重新预览/);
  assert.equal((await memory.list(person(), { scope: "personal" })).items.length, 4, "nothing was removed");
  const again = await memory.previewScope(person(), "personal");
  assert.deepEqual(await memory.clearScope(person(), "personal", again.fingerprint), { removed: 4 });
  assert.equal((await memory.list(person(), { scope: "personal" })).items.length, 0);
  assert.equal((await memory.list(person(), { scope: "project" })).items.length, 1, "the project's memories stay");
  assert.equal(memory.changes(person(), { scope: "personal" })[0]!.kind, "cleared");
  await assert.rejects(memory.previewScope(assistant(), "personal"), /只有本人/);
});

test("export has a version and no secrets or absolute paths; importing twice adds nothing; a damaged package writes nothing", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  await memory.write(person(), { scope: "personal", text: "周报用要点列表", kind: "preference", applies: { task: "写周报时" } });
  await memory.write(person(), { scope: "personal", text: "代码都在 /Users/someone/code/goalboard 下面" });
  const pack = await memory.exportScope(person(), "personal");
  assert.equal(pack.format, "molis.memory");
  assert.equal(pack.version, 1);
  const text = JSON.stringify(pack);
  assert.doesNotMatch(text, /\/Users\/someone/, "no absolute path");
  assert.ok(pack.redactions.some(item => item.kind === "absolute-path" && item.count >= 1), "says what was taken out");
  assert.equal(pack.entries.find(item => item.text === "周报用要点列表")?.applies.task, "写周报时");

  // Into another scope: the first time writes, the second skips everything.
  assert.deepEqual(await memory.importScope(person(), "project", pack), { written: 2, skipped: 0, refused: 0 });
  assert.deepEqual(await memory.importScope(person(), "project", pack), { written: 0, skipped: 2, refused: 0 });
  const imported = (await memory.list(person(), { scope: "project" })).items;
  assert.ok(imported.every(item => item.source === "imported" && /导入/.test(item.origin)));
  // A damaged or unknown package: refused whole, nothing written.
  const before = (await memory.list(person(), { scope: "project" })).items.length;
  await assert.rejects(memory.importScope(person(), "project", { ...pack, version: 2 }), /版本 2 不认识/);
  await assert.rejects(memory.importScope(person(), "project", { ...pack, entries: [...pack.entries.map(item => ({ ...item, text: `${item.text}（新）` })), { text: "", kind: "preference" }] }), /第 3 条/);
  assert.equal((await memory.list(person(), { scope: "project" })).items.length, before);
  // A package carrying a secret: that entry is refused, the rest still go in.
  const withSecret = { ...pack, entries: [{ text: "API key 是 sk-proj-abcdefghijklmnopqrstu12345", kind: "fact" as const, source: "manual" as const, basis: "explicit" as const, applies: {}, origin: "x", expires_at: null }] };
  assert.deepEqual(await memory.importScope(person(), "project", withSecret), { written: 0, skipped: 0, refused: 1 });
});

test("upkeep switches off expired and long-unused automatic memories, merges automatic duplicates, hands the person's own to them, and every step is undoable", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  const expiring = (await memory.write(person(), { scope: "personal", text: "九月底前周报发给王总", expires_at: "2026-10-01T00:00:00.000Z" })).memory!;
  const auto1 = (await memory.offer(assistant("work-1"), { scope: "project", text: "周报把风险放在最前面", kind: "convention", basis: "repeated", why: "两次", from: "extraction" })).memory!;
  const auto2 = (await memory.offer(assistant("work-2"), { scope: "project", text: "周报把风险放在最前面。", kind: "convention", basis: "repeated", why: "两次", from: "extraction" }));
  assert.equal(auto2.outcome, "duplicate", "the gate already refuses an exact repeat");
  const auto3 = (await memory.offer(assistant("work-3"), { scope: "project", text: "周报要把风险放到最前面", kind: "convention", basis: "repeated", why: "两次", from: "extraction" })).memory!;
  const said1 = (await memory.write(assistant(), { scope: "personal", text: "回答用要点列表", said: "以后回答都用要点列表" })).memory!;
  const said2 = (await memory.write(person(), { scope: "personal", text: "回答要用要点列表" })).memory!;
  const oldAuto = (await memory.offer(assistant("work-4"), { scope: "personal", text: "邮件落款写全名", kind: "preference", basis: "repeated", why: "两次", from: "extraction" })).memory!;

  clock.now = new Date("2027-01-15T08:00:00.000Z");
  // The model finds the near-duplicates (their wording differs too much for the character-pair rule).
  const report = await memory.upkeep(person(null), { projects: ["project-a"], tidy: async entries => ({ duplicates: ([[auto1.memory_id, auto3.memory_id], [said1.memory_id, said2.memory_id]] as Array<[string, string]>)
    .filter(([a, b]) => entries.some(item => item.memory_id === a) && entries.some(item => item.memory_id === b)), conflicts: [] }) });
  assert.equal(report.expired, 1);
  assert.equal(report.unused, 2, "automatic ones unused for 90 days (the older survivor of the merge and the e-mail one)");
  assert.equal(report.merged, 1);
  const personal = (await memory.list(person())).items;
  assert.equal(personal.find(item => item.memory_id === expiring.memory_id)!.state, "disabled");
  assert.match(personal.find(item => item.memory_id === expiring.memory_id)!.state_reason!, /到期/);
  assert.equal(personal.find(item => item.memory_id === oldAuto.memory_id)!.state_reason, "90 天没有用到");
  assert.ok(!personal.some(item => item.memory_id === auto3.memory_id), "the newer automatic duplicate was merged into the older one");
  assert.ok(personal.some(item => item.memory_id === auto1.memory_id));
  // The person's own words are never merged: the pair goes to them.
  const pairs = await memory.pairs(person());
  assert.deepEqual(pairs.map(pair => [pair.kind, [pair.a.memory_id, pair.b.memory_id].sort().join()]), [["duplicate", [said1.memory_id, said2.memory_id].sort().join()]]);
  await memory.resolvePair(person(), pairs[0]!.pair_id, "a");
  assert.equal((await memory.list(person())).items.find(item => item.memory_id === pairs[0]!.b.memory_id)!.state, "disabled");
  assert.equal((await memory.pairs(person())).length, 0);

  // Undo each: expiry cleared and on again; the merged one comes back; the unused one back on.
  const changes = memory.changes(person(), { limit: 50 });
  await memory.undo(person(), changes.find(change => change.memory_id === expiring.memory_id && change.kind === "auto_disabled")!.change_id);
  const back = (await memory.list(person())).items.find(item => item.memory_id === expiring.memory_id)!;
  assert.deepEqual([back.state, back.expires_at], ["active", null]);
  await memory.undo(person(), changes.find(change => change.kind === "merged")!.change_id);
  assert.ok((await memory.list(person())).items.some(item => item.text === "周报要把风险放到最前面"), "merge undone");
  // Nothing was ever deleted by upkeep: a second pass with nothing new does nothing more.
  const quiet = await memory.upkeep(person(null), { projects: ["project-a"] });
  assert.deepEqual([quiet.expired, quiet.merged], [0, 0]);
});

test("contradictions the model finds go to the person; until settled, recall takes the person's own words and names the other; an object gone pauses what rests on it", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  const table = (await memory.offer(assistant("work-1"), { scope: "project", text: "周报用表格", kind: "convention", basis: "repeated", why: "两次", from: "extraction" })).memory!;
  const bullets = (await memory.write(assistant(), { scope: "project", text: "周报用要点列表", said: "周报以后都用要点列表" })).memory!;
  const doc = (await memory.write(assistant(), { scope: "project", text: "方案结构按「背景-目标-计划」", said: "记住这份方案的结构", rests_on: { kind: "page", id: "page-1" } })).memory!;
  const report = await memory.upkeep(person(), { projects: ["project-a"],
    tidy: async entries => ({ duplicates: [], conflicts: entries.some(item => item.memory_id === table.memory_id) ? [{ a: table.memory_id, b: bullets.memory_id, why: "周报格式一个说表格一个说要点" }] : [] }),
    objectState: async ref => ref.id === "page-1" ? "missing" : "unknown" });
  assert.equal(report.tidied, true);
  assert.equal(report.paused, 1);
  const [pair] = await memory.pairs(person());
  assert.equal(pair!.kind, "conflict");
  const recalled = await memory.recall(assistant("work-9"), { query: "写周报" });
  assert.ok(recalled.items.some(item => item.memory_id === bullets.memory_id));
  assert.ok(!recalled.items.some(item => item.memory_id === table.memory_id));
  assert.deepEqual(recalled.omitted.find(item => item.memory_id === table.memory_id)?.reason, "conflict");
  // Paused because its object is gone: listed with the reason, never recalled.
  const paused = (await memory.list(person())).items.find(item => item.memory_id === doc.memory_id)!;
  assert.equal(paused.state, "paused");
  assert.match(paused.state_reason!, /依据已不存在/);
  assert.ok(!(await memory.recall(assistant("work-9"), { query: "方案结构" })).items.some(item => item.memory_id === doc.memory_id));
  // The object is back: it resumes.
  const again = await memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "ok" });
  assert.equal(again.resumed, 1);
  assert.equal((await memory.list(person())).items.find(item => item.memory_id === doc.memory_id)!.state, "active");
  // The model is asked again only when something changed.
  let asked = 0;
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async () => { asked += 1; return { duplicates: [], conflicts: [] }; } });
  assert.equal(asked, 1, "the resume changed the scope");
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async () => { asked += 1; return { duplicates: [], conflicts: [] }; } });
  assert.equal(asked, 1, "nothing changed since: no model call");
});

test("a deleted memory does not come back through upkeep, a merge record or a restart", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = (await memory.offer(assistant("work-1"), { scope: "project", text: "发布前先跑全量回归", kind: "experience", basis: "repeated", why: "两次", from: "extraction" })).memory!;
  await memory.offer(assistant("work-2"), { scope: "project", text: "发布之前先跑全量回归", kind: "experience", basis: "repeated", why: "两次", from: "extraction" });
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async entries => ({ duplicates: [[entries[0]!.memory_id, entries[1]!.memory_id]], conflicts: [] }) });
  const merged = memory.changes(person()).find(change => change.kind === "merged")!;
  assert.equal(merged.undoable, true);
  await memory.change(person(), { memory_id: keep.memory_id, action: "remove" });
  assert.equal(memory.changes(person()).find(change => change.change_id === merged.change_id)!.undoable, false, "the merge record no longer carries the deleted text");
  assert.ok(!JSON.stringify(env.ledger().changes("web-user", 100)).includes("全量回归"), "recent changes keep none of its words");
  assert.ok(!JSON.stringify(await env.raw().candidates.list("project", "project-a")).includes("全量回归"), "nor does the candidate it was promoted from");
  await env.close();
  memory = await env.open();
  assert.equal((await memory.list(person())).items.length, 0);
  assert.equal((await memory.recall(assistant(), { query: "发布 回归" })).items.length, 0);
});

test("a reader that says the object is gone, archived or not ours pauses what rests on it; a failing service changes nothing", () => {
  for (const code of ["goals.not_found", "actions.subject_unavailable", "todo.not_found", "actions.forbidden"]) assert.equal(readerOutcome(code), "missing", code);
  for (const code of ["actions.service_unavailable", "actions.timeout", ""]) assert.equal(readerOutcome(code), "unknown", code);
});
