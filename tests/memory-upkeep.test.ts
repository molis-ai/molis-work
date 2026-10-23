import assert from "node:assert/strict";
import test from "node:test";
import { MemoryService, type MemoryCaller } from "@molis-ai/molis-work-service-memory";
import type { MemoryWriteRequest } from "@molis-ai/molis-work-contracts/services/memory";
import { memoryServiceHome, observeMemoryBackend, scriptedMemoryExtraction, originalMemorySources } from "./fixtures/memory-service-home.js";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { readerOutcome } from "../apps/local-host/dist/memory/memory-upkeep.js";

async function memoryHome(t: Parameters<typeof memoryServiceHome>[0], clock: { now: Date }) {
  const extraction = scriptedMemoryExtraction();
  const originals = originalMemorySources(["project-a"], () => clock.now.getTime());
  const env = await memoryServiceHome(t, { projects: ["project-a"], now: () => clock.now, sources: originals.port, generate: extraction.generate });
  return { ...env, async automatic(memory: MemoryService, operation: string, scope: "personal" | "project", text: string, kind: "preference" | "convention") {
    memory.savePrefs(person(), scope, "assisted");
    const sources = [originals.add(`${operation}:input-1`, text), originals.add(`${operation}:input-2`, text), originals.add(`${operation}:trigger`, "以后按这些要求执行")];
    extraction.set([{ text, kind, scope, basis: "explicit", quote: text }]);
    const learned = await memory.learnFromWork({ ...assistant(operation), operation_id: operation }, {
      said: sources.map(source => source.text), sources,
    });
    assert.equal(learned.formation.outcome, "completed");
    assert.equal(learned.recording_error, undefined);
    const [result] = learned.learned;
    assert.equal(result!.outcome, "written", "upkeep starts with a real source-bound SDK promotion");
    return (await memory.list(person(), { scope })).items.find(item => item.memory_id === result!.memory_id)!;
  } };
}

const person = (project: string | null = "project-a"): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project, consumer: "ui", person: true });
const assistant = (work = "work-1"): MemoryCaller => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: "project-a", consumer: "assistant", work: { work_id: work, title: work } });
/** The Assistant's way of keeping something: the Host hands the gate the messages the person typed (the third argument), and `said` points at one of them. These tests state that message in `said`. */
const keep = (memory: MemoryService, caller: MemoryCaller, request: MemoryWriteRequest) => memory.write(caller, request, { originals: request.said ? [request.said] : [] });

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
  const expectedIds = (await memory.list(person(), { scope: "personal" })).items.map(item => item.memory_id).sort();
  const cleared = await memory.clearScope(person(), "personal", again.fingerprint);
  assert.deepEqual({ ...cleared, items: [...cleared.items].sort((a, b) => a.memory_id.localeCompare(b.memory_id)) }, {
    removed: 4, complete: true, items: expectedIds.map(memory_id => ({ memory_id, outcome: "completed" })),
  });
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
  // The task a memory applies to is free text too.
  await memory.write(person(), { scope: "personal", text: "提交前先跑检查", kind: "convention", applies: { task: "改 /Users/someone/code/goalboard 里的代码时" } });
  const pack = await memory.exportScope(person(), "personal");
  assert.equal(pack.format, "molis.memory");
  assert.equal(pack.version, 2);
  const text = JSON.stringify(pack);
  assert.doesNotMatch(text, /\/Users\/someone/, "no absolute path");
  assert.ok(pack.redactions.some(item => item.kind === "absolute-path" && item.count >= 1), "says what was taken out");
  assert.equal(pack.entries.find(item => item.text === "周报用要点列表")?.applies.task, "写周报时");
  assert.equal(pack.entries.find(item => item.text === "提交前先跑检查")?.applies.task, "改 [path] 里的代码时");
  assert.ok(pack.redactions.some(item => item.kind === "absolute-path" && item.count >= 2), "the path in the task is counted too");

  // When the runtime cannot screen the text, or screening fails, nothing is exported: never the text as it was.
  const unscreened = (backend: ReturnType<typeof env.raw>) => new MemoryService({ backend, ledger: env.ledger(), timeZone: "Asia/Shanghai", now: () => clock.now });
  const noScreen = observeMemoryBackend(env.raw(), bound => { const { screen: _screen, ...rest } = bound; return rest; });
  const failedScreen = observeMemoryBackend(env.raw(), bound => ({ ...bound, screen: async () => { throw new Error("screen is down"); } }));
  for (const backend of [noScreen, failedScreen]) {
    await assert.rejects(unscreened(backend).exportScope(person(), "personal"), (error: { code?: string; message?: string }) => {
      assert.equal(error.code, "memory.unavailable");
      assert.doesNotMatch(String(error.message), /\/Users\/someone/);
      return true;
    });
  }

  // Into another scope: the first time writes, the second skips everything.
  assert.deepEqual(await memory.importScope(person(), "project", pack), { written: 3, skipped: 0, refused: 0 });
  assert.deepEqual(await memory.importScope(person(), "project", pack), { written: 0, skipped: 3, refused: 0 });
  const imported = (await memory.list(person(), { scope: "project" })).items;
  assert.ok(imported.every(item => item.source === "imported" && /导入/.test(item.origin)));
  // A damaged or unknown package: refused whole, nothing written.
  const before = (await memory.list(person(), { scope: "project" })).items.length;
  await assert.rejects(memory.importScope(person(), "project", { ...pack, version: 1 }), /版本 1 不认识/);
  await assert.rejects(memory.importScope(person(), "project", { ...pack, version: 3 }), /版本 3 不认识/);
  await assert.rejects(memory.importScope(person(), "project", { ...pack, entries: [...pack.entries.map(item => ({ ...item, text: `${item.text}（新）` })), { text: "", kind: "preference" }] }), /第 4 条/);
  assert.equal((await memory.list(person(), { scope: "project" })).items.length, before);
  // A package carrying a secret: that entry is refused, the rest still go in.
  const withSecret = { ...pack, entries: [{ text: "API key 是 sk-proj-abcdefghijklmnopqrstu12345", kind: "fact" as const, source: "manual" as const, basis: "explicit" as const, applies: {}, origin: "x", expires_at: null, classification: pack.entries[0]!.classification }] };
  assert.deepEqual(await memory.importScope(person(), "project", withSecret), { written: 0, skipped: 0, refused: 1 });
});

test("upkeep switches off expired and long-unused automatic memories, merges automatic duplicates, hands the person's own to them, and every step is undoable", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const expiring = (await memory.write(person(), { scope: "personal", text: "九月底前周报发给王总", expires_at: "2026-10-01T00:00:00.000Z" })).memory!;
  const auto1 = await env.automatic(memory, "work-1", "project", "周报把风险放在最前面", "convention");
  const auto2 = (await memory.offer(assistant("work-2"), { scope: "project", text: "周报把风险放在最前面。", kind: "convention", basis: "repeated", why: "两次", from: "extraction" }));
  assert.equal(auto2.outcome, "duplicate", "the gate already refuses an exact repeat");
  const auto3 = await env.automatic(memory, "work-3", "project", "周报要把风险放到最前面", "convention");
  const said1 = (await keep(memory, assistant(), { scope: "personal", text: "回答用要点列表", said: "回答用要点列表" })).memory!;
  const said2 = (await memory.write(person(), { scope: "personal", text: "回答要用要点列表" })).memory!;
  const oldAuto = await env.automatic(memory, "work-4", "personal", "邮件落款写全名", "preference");

  // Advance the shared Service/Node clock 91 days beyond the stored creation times: automatic values unused for 90 days are disabled.
  const written = (await memory.list(person(), { scope: "all" })).items;
  assert.ok(written.some(item => item.memory_id === oldAuto.memory_id) && written.some(item => item.memory_id === auto1.memory_id));
  clock.now = new Date(Math.max(...written.map(item => { assert.ok(item.created_at, "new writes have a known creation time"); return Date.parse(item.created_at); })) + 91 * 86_400_000);
  // The model finds the near-duplicates (their wording differs too much for the character-pair rule).
  const maintenance = { ...person(null), operation_id: "581868a5-78c4-4c1a-883f-67734cba5c23" };
  const report = await memory.upkeep(maintenance, { projects: ["project-a"], tidy: async entries => ({ duplicates: ([[auto1.memory_id, auto3.memory_id], [said1.memory_id, said2.memory_id]] as Array<[string, string]>)
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
  const survivor = personal.find(item => item.memory_id === auto1.memory_id)!;
  assert.equal(survivor.state, "disabled");
  assert.equal(survivor.version, 3, "one merge update followed by one conditional disable");
  assert.deepEqual(survivor.evidence, [...auto1.evidence, ...auto3.evidence], "disabling retains all merged provenance");
  const beforeRetry = memory.changes(person(), { limit: 50 });
  await env.close();
  memory = await env.open();
  const retry = await memory.upkeep(maintenance, { projects: ["project-a"] });
  assert.deepEqual([retry.expired, retry.unused, retry.merged], [0, 0, 0]);
  assert.deepEqual((await memory.list(person())).items.find(item => item.memory_id === auto1.memory_id), survivor);
  assert.deepEqual(memory.changes(person(), { limit: 50 }), beforeRetry, "the same operation after restart does not add changes");
  // The person's own words are never merged: the pair goes to them.
  const pairs = await memory.pairs(person());
  assert.deepEqual(pairs.map(pair => [pair.kind, [pair.a.memory_id, pair.b.memory_id].sort().join()]), [["duplicate", [said1.memory_id, said2.memory_id].sort().join()]]);
  await memory.resolvePair(person(), pairs[0]!.pair_id, "a");
  assert.equal((await memory.list(person())).items.find(item => item.memory_id === pairs[0]!.b.memory_id)!.state, "disabled");
  assert.equal((await memory.pairs(person())).length, 0);

  // Undo cannot silently renew an expired value; merge undo still restores its original value.
  const changes = memory.changes(person(), { limit: 50 });
  await assert.rejects(memory.undo(person(), changes.find(change => change.memory_id === expiring.memory_id && change.kind === "auto_disabled")!.change_id), /到期|有效期/);
  const back = (await memory.list(person())).items.find(item => item.memory_id === expiring.memory_id)!;
  assert.deepEqual([back.state, back.expires_at], ["disabled", "2026-10-01T00:00:00.000Z"]);
  await memory.undo(person(), changes.find(change => change.kind === "merged")!.change_id);
  assert.ok((await memory.list(person())).items.some(item => item.text === "周报要把风险放到最前面"), "merge undone");
  // Nothing was ever deleted by upkeep: a second pass with nothing new does nothing more.
  const quiet = await memory.upkeep(person(null), { projects: ["project-a"] });
  assert.deepEqual([quiet.expired, quiet.merged], [0, 0]);
});

test("upkeep retains short child operations for a long parent when a merge is retried after restart", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = await env.automatic(memory, "merge-keep", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "merge-drop", "project", "发布之前先跑全量回归", "convention");
  clock.now = new Date(Math.max(Date.parse(keep.created_at!), Date.parse(drop.created_at!)) + 91 * 86_400_000);
  const maintenance = { ...person(), operation_id: "m".repeat(200) };
  const calls: Array<{ kind: string; operation_id: string; expected_version: number }> = [];
  let failRemoval = true;
  const controlled = () => new MemoryService({ ledger: env.ledger(), timeZone: "Asia/Shanghai", now: () => clock.now,
    backend: observeMemoryBackend(env.raw(), bound => ({ ...bound,
      update: async input => { calls.push({ kind: "update", operation_id: input.operation_id, expected_version: input.expected_version }); return bound.update(input); },
      disable: async input => { calls.push({ kind: "disable", operation_id: input.operation_id, expected_version: input.expected_version }); return bound.disable(input); },
      tombstone: async input => {
        calls.push({ kind: "remove", operation_id: input.operation_id, expected_version: input.expected_version });
        if (failRemoval) { failRemoval = false; throw new Error("isolated removal unavailable"); }
        return bound.tombstone(input);
      },
    })),
  });
  const options = { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id] as [string, string]], conflicts: [] }) };
  memory = controlled();
  await assert.rejects(memory.upkeep(maintenance, options), /isolated removal unavailable/);
  const afterMerge = (await memory.list(person())).items.find(item => item.memory_id === keep.memory_id)!;
  assert.equal(afterMerge.version, 2, "the real SDK committed the merge before removal failed");
  assert.deepEqual(afterMerge.evidence, [...keep.evidence, ...drop.evidence]);
  assert.ok((await memory.list(person())).items.some(item => item.memory_id === drop.memory_id));
  const linked = env.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${keep.memory_id}`)!.body;
  assert.deepEqual(linked, { sources: ["merge-keep:input-1", "merge-keep:input-2", "merge-drop:input-1", "merge-drop:input-2"].map(event_id => ({ event_id, version: "1" })) });

  await env.close();
  await env.open();
  memory = controlled();
  const report = await memory.upkeep(maintenance, options);
  assert.deepEqual([report.merged, report.unused], [1, 1]);
  const survivor = (await memory.list(person())).items.find(item => item.memory_id === keep.memory_id)!;
  assert.deepEqual([survivor.state, survivor.version], ["disabled", 3]);
  assert.deepEqual(survivor.evidence, afterMerge.evidence, "replaying a committed merge does not append its provenance twice");
  assert.ok(!(await memory.list(person())).items.some(item => item.memory_id === drop.memory_id));
  assert.deepEqual(calls.filter(call => call.kind === "update").map(call => [call.operation_id, call.expected_version]),
    Array.from({ length: 3 }, () => [calls[0]!.operation_id, 1]), "retry and the post-removal confirmation both retain the original CAS, not a new write");
  assert.ok(calls.every(call => call.operation_id.length <= 200), "the parent and full target identity remain in the ledger, not the SDK operation ID");
  assert.notEqual(calls.find(call => call.kind === "disable")!.operation_id, calls[0]!.operation_id);
  const changes = memory.changes(person(), { limit: 50 });
  assert.equal(changes.filter(change => change.kind === "merged").length, 1);
  assert.equal(changes.filter(change => change.kind === "auto_disabled").length, 1);
  const completedCalls = calls.length;
  await env.close();
  await env.open();
  memory = controlled();
  const retry = await memory.upkeep(maintenance, options);
  assert.deepEqual([retry.merged, retry.unused], [0, 0]);
  assert.equal(calls.length, completedCalls, "completed steps are not dispatched again");
  assert.deepEqual(memory.changes(person(), { limit: 50 }), changes);
  assert.deepEqual(env.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${keep.memory_id}`)!.body, linked);
});

for (const deletion of ["remove", "clear"] as const) test(`upkeep merge keeps original sources and candidates until the person chooses ${deletion}`, { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = await env.automatic(memory, "source-keep", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "source-drop", "project", "发布之前先跑全量回归", "convention");
  const refs = ["source-keep:input-1", "source-keep:input-2", "source-drop:input-1", "source-drop:input-2"].map(event_id => ({ event_id, version: "1" }));
  const candidates = await env.raw().candidates.list("project", "project-a");
  assert.equal(candidates.length, 2, "both real source-bound promotions retain their canonical candidate");
  assert.ok(memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", refs));
  const report = await memory.upkeep({ ...person(), operation_id: `merge-before-${deletion}` }, { projects: ["project-a"],
    tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) });
  assert.equal(report.merged, 1);
  assert.equal(memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", refs), true, "maintenance did not forget any contributing original");
  assert.deepEqual(await env.raw().candidates.list("project", "project-a"), candidates, "maintenance does not erase the existing candidates");
  assert.deepEqual(env.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${keep.memory_id}`)!.body, { sources: refs });
  const merged = memory.changes(person()).find(change => change.kind === "merged")!;
  assert.equal(merged.undoable, true, "the existing merge undo remains available");
  await env.close(); memory = await env.open();
  assert.equal(memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", refs), true, "the originals remain available after restart");
  const survivor = (await memory.list(person(), { scope: "project" })).items;
  assert.equal(survivor.length, 1);
  assert.deepEqual(survivor[0]!.evidence, [...keep.evidence, ...drop.evidence]);
  if (deletion === "remove") {
    await memory.change({ ...person(), operation_id: "person-forgets-survivor" }, { action: "remove", memory_id: survivor[0]!.memory_id, expected_version: survivor[0]!.version });
  } else {
    const preview = await memory.previewScope(person(), "project");
    const cleared = await memory.clearScope(person(), "project", preview.fingerprint);
    assert.equal(cleared.complete, true); assert.equal(cleared.removed, 1);
  }
  assert.deepEqual((await memory.list(person(), { scope: "project" })).items, []);
  assert.deepEqual(await env.raw().candidates.list("project", "project-a"), []);
  assert.ok(refs.every(ref => !memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", [ref])), "the person's deletion suppresses the full merged union");
  await assert.rejects(memory.undo(person(), merged.change_id), /没有这次变动|不能撤销/);
  assert.deepEqual((await memory.list(person(), { scope: "project" })).items, [], "merge undo cannot restore a forgotten item");
});

test("contradictions the model finds go to the person; until settled, recall takes the person's own words and names the other; an object gone pauses what rests on it", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  const table = await env.automatic(memory, "work-1", "project", "周报用表格", "convention");
  const bullets = (await keep(memory, assistant(), { scope: "project", text: "周报用要点列表", said: "周报用要点列表" })).memory!;
  const doc = (await keep(memory, assistant(), { scope: "project", text: "方案结构按「背景-目标-计划」", said: "方案结构按「背景-目标-计划」", rests_on: { kind: "page", id: "page-1" } })).memory!;
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
  const keep = await env.automatic(memory, "work-1", "project", "发布前先跑全量回归", "convention");
  await env.automatic(memory, "work-2", "project", "发布之前先跑全量回归", "convention");
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

test("upkeep recovers a committed pause after the ledger fails, survives restart and can undo the exact change", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const original = (await memory.write(person(), { scope: "project", text: "发布文档附核对表", rests_on: { kind: "page", id: "release-page" } })).memory!;
  const operation = { ...person(), operation_id: "upkeep-pause-receipt" };
  const save = env.ledger().saveChange.bind(env.ledger());
  t.mock.method(env.ledger(), "saveChange", (record: Parameters<typeof save>[0]) => {
    if (record.kind === "paused") throw new Error("ledger unavailable after SDK commit");
    return save(record);
  });
  await assert.rejects(memory.upkeep(operation, { projects: ["project-a"], objectState: async () => "missing" }), /ledger unavailable/);
  const committed = (await memory.list(person())).items.find(item => item.memory_id === original.memory_id)!;
  assert.equal(committed.state, "paused");
  assert.equal(committed.version, original.version + 1);
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 0);
  await env.close();
  memory = await env.open();
  await memory.upkeep({ ...person(), operation_id: "next-scheduled-maintenance" }, { projects: ["project-a"], objectState: async () => "missing" });
  const changes = memory.changes(person()).filter(change => change.kind === "paused");
  assert.equal(changes.length, 1, "the original operation must recover the missing change, not skip the already paused entry");
  assert.equal(env.ledger().change(changes[0]!.change_id)!.applied_version, committed.version);
  await memory.upkeep(operation, { projects: ["project-a"], objectState: async () => "missing" });
  assert.equal((await memory.list(person())).items.find(item => item.memory_id === original.memory_id)!.version, committed.version);
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 1);
  await memory.undo(person(), changes[0]!.change_id);
  assert.equal((await memory.list(person())).items.find(item => item.memory_id === original.memory_id)!.state, "active");
});

for (const failure of ["before-remove", "after-remove", "ledger-transaction"] as const) {
  test(`upkeep merge recovers ${failure} from original versions, then preserves one usable undo after restart`, { timeout: 60_000 }, async t => {
    const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
    const env = await memoryHome(t, clock);
    let memory = await env.open();
    const kept = await env.automatic(memory, "recovery-a", "project", "发布前先跑完整回归", "convention");
    clock.now = new Date(clock.now.getTime() + 1_000);
    const dropped = await env.automatic(memory, "recovery-b", "project", "发布之前先跑完整回归", "convention");
    const operation = { ...person(), operation_id: "merge-recovery-parent" };
    let armed = true;
    const backend = observeMemoryBackend(env.raw(), bound => ({ ...bound, tombstone: async input => {
      if (armed && failure === "before-remove") { armed = false; throw new Error("before-remove"); }
      const result = await bound.tombstone(input);
      if (armed && failure === "after-remove") { armed = false; throw new Error("after-remove"); }
      return result;
    } }));
    const saveMarker = env.ledger().setMarker.bind(env.ledger());
    t.mock.method(env.ledger(), "setMarker", (...args: Parameters<typeof saveMarker>) => {
      if (armed && failure === "ledger-transaction" && args[1] === "memory-operation:upkeep-pending" && (args[2] as { plans?: string[] }).plans?.length === 0) {
        armed = false; throw new Error("ledger-transaction");
      }
      return saveMarker(...args);
    });
    memory = new MemoryService({ backend, ledger: env.ledger(), now: () => clock.now });
    const options = { projects: ["project-a"], tidy: async () => ({ duplicates: [[kept.memory_id, dropped.memory_id] as [string, string]], conflicts: [] }) };
    await assert.rejects(memory.upkeep(operation, options), new RegExp(failure));
    assert.equal((await env.raw().list("project", "project-a")).find(entry => entry.memory_id === kept.memory_id)!.version, kept.version + 1);
    assert.equal(memory.changes(person()).filter(change => change.kind === "merged").length, 0);
    assert.ok(env.ledger().revisions(dropped.memory_id).length > 0, "a missing ledger receipt must not erase the only original undo history");
    await env.close();
    memory = await env.open();
    await memory.upkeep({ ...person(), operation_id: "a-new-scheduler-pass" }, options);
    const merge = memory.changes(person()).filter(change => change.kind === "merged");
    assert.equal(merge.length, 1);
    assert.equal(env.ledger().change(merge[0]!.change_id)!.applied_version, kept.version + 1);
    assert.equal((await memory.list(person())).items.length, 1);
    assert.equal(env.ledger().revisions(dropped.memory_id).length, 0, "history cleanup happens only with the committed change");
    await memory.upkeep(operation, options);
    assert.equal(memory.changes(person()).filter(change => change.kind === "merged").length, 1);
    assert.equal((await memory.list(person())).items[0]!.version, kept.version + 1);
    await memory.undo(person(), merge[0]!.change_id);
    assert.deepEqual((await memory.list(person())).items.map(item => item.text).sort(), [kept.text, dropped.text].sort());
  });
}

test("upkeep object-restored undo restores the original pause reason and rejects later edits", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  const original = (await memory.write(person(), { scope: "project", text: "发布文档附检查表", rests_on: { kind: "page", id: "release" } })).memory!;
  await memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "missing" });
  const paused = (await memory.list(person())).items.find(item => item.memory_id === original.memory_id)!;
  await memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "ok" });
  const resumed = memory.changes(person()).find(change => change.kind === "resumed")!;
  assert.equal(resumed.undoable, true);
  await memory.undo(person(), resumed.change_id);
  const undone = (await memory.list(person())).items.find(item => item.memory_id === original.memory_id)!;
  assert.equal(undone.state, "paused");
  assert.equal(undone.state_reason, paused.state_reason);
  await memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "ok" });
  const next = memory.changes(person()).find(change => change.kind === "resumed" && change.state === "active")!;
  await memory.change(person(), { memory_id: original.memory_id, action: "update", text: "人工改成提交前复核" });
  await assert.rejects(memory.undo(person(), next.change_id), /新版本/);
});

for (const later of ["edit", "forget"] as const) test(`pending upkeep refuses ${later} rather than inventing a ledger receipt`, { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const original = (await memory.write(person(), { scope: "project", text: "发布前核对引用", rests_on: { kind: "page", id: "release" } })).memory!;
  const save = env.ledger().saveChange.bind(env.ledger());
  const fault = t.mock.method(env.ledger(), "saveChange", (record: Parameters<typeof save>[0]) => {
    if (record.kind === "paused") throw new Error("receipt interrupted");
    return save(record);
  });
  await assert.rejects(memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "missing" }), /receipt interrupted/);
  fault.mock.restore();
  await memory.change(person(), { memory_id: original.memory_id, action: later === "forget" ? "remove" : "update", ...(later === "edit" ? { text: "人工后继决定" } : {}) });
  const before = env.ledger().revisions(original.memory_id);
  await env.close(); memory = await env.open();
  await assert.rejects(memory.upkeep(person(), { projects: ["project-a"], objectState: async () => "missing" }));
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 0);
  assert.deepEqual(env.ledger().revisions(original.memory_id), before);
  const entries = (await memory.list(person())).items;
  if (later === "forget") assert.deepEqual(entries, []);
  else assert.equal(entries[0]!.text, "人工后继决定");
});

test("forgetting a partially merged survivor suppresses every original and blocks pending maintenance", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = await env.automatic(memory, "partial-a", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "partial-b", "project", "发布之前先跑全量回归", "convention");
  const fault = new MemoryService({ ledger: env.ledger(), now: () => clock.now,
    backend: observeMemoryBackend(env.raw(), bound => ({ ...bound, tombstone: async () => { throw new Error("remove not dispatched"); } })) });
  await assert.rejects(fault.upkeep(person(), { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) }), /not dispatched/);
  await memory.change(person(), { memory_id: keep.memory_id, action: "remove" });
  const sources = ["partial-a:input-1", "partial-a:input-2", "partial-b:input-1", "partial-b:input-2"].map(event_id => ({ event_id, version: "1" }));
  assert.ok(sources.every(source => !memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", [source])));
  await env.close(); memory = await env.open();
  await assert.rejects(memory.upkeep(person(), { projects: ["project-a"] }), /删除|遗忘/);
  assert.ok(!(await memory.list(person())).items.some(item => item.memory_id === keep.memory_id));
  assert.equal(memory.changes(person()).filter(change => change.kind === "merged").length, 0);
});

test("cancellation after the real maintenance preview prepares no new history or SDK state", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  const memory = await env.open();
  const original = (await memory.write(person(), { scope: "project", text: "提交前核对列表", rests_on: { kind: "page", id: "release" } })).memory!;
  const before = env.ledger().revisions(original.memory_id), controller = new AbortController();
  let previewed = false;
  const cancelling = new MemoryService({ ledger: env.ledger(), now: () => clock.now,
    backend: observeMemoryBackend(env.raw(), bound => ({ ...bound, previewMutation: async input => {
      await bound.previewMutation(input); previewed = true; controller.abort();
    } })) });
  await assert.rejects(cancelling.upkeep({ ...person(), signal: controller.signal }, { projects: ["project-a"], objectState: async () => "missing" }));
  assert.equal(previewed, true, "cancellation occurs after an actual accepted SDK preview");
  assert.deepEqual(env.ledger().revisions(original.memory_id), before);
  assert.equal((await memory.list(person())).items[0]!.version, original.version);
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 0);
});

test("merge undo only recreates the removed item and leaves a later human survivor edit untouched", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock), memory = await env.open();
  const keep = await env.automatic(memory, "undo-a", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "undo-b", "project", "发布之前先跑全量回归", "convention");
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) });
  const merge = memory.changes(person()).find(change => change.kind === "merged")!;
  await memory.change(person(), { memory_id: keep.memory_id, action: "update", text: "人工新决定：先做发布审阅" });
  const before = (await env.raw().list("project", "project-a")).find(entry => entry.memory_id === keep.memory_id)!;
  await memory.undo(person(), merge.change_id);
  assert.deepEqual((await env.raw().list("project", "project-a")).find(entry => entry.memory_id === keep.memory_id), before);
  assert.equal((await memory.list(person())).items.find(item => item.memory_id !== keep.memory_id)!.text, drop.text);
});

test("concurrent maintenance passes cannot lose an in-flight plan or leave a second stale plan", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock), memory = await env.open();
  const original = (await memory.write(person(), { scope: "project", text: "发布前核对发布页", rests_on: { kind: "page", id: "release" } })).memory!;
  let arrived = 0, release!: () => void;
  const together = new Promise<void>(resolve => { release = resolve; });
  const racing = new MemoryService({ ledger: env.ledger(), now: () => clock.now,
    backend: observeMemoryBackend(env.raw(), bound => ({ ...bound, previewMutation: async input => {
      await bound.previewMutation(input); arrived++; if (arrived === 2) release(); await together;
    } })) });
  const options = { projects: ["project-a"], objectState: async () => "missing" as const };
  const outcomes = await Promise.allSettled(["pass-a", "pass-b"].map(operation_id => racing.upkeep({ ...person(), operation_id }, options)));
  assert.equal(arrived, 2); assert.ok(outcomes.some(item => item.status === "fulfilled"));
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 1);
  assert.equal((await memory.list(person())).items[0]!.version, original.version + 1);
  await memory.upkeep(person(), options);
  assert.equal(memory.changes(person()).filter(change => change.kind === "paused").length, 1);
});

test("an automatic merge without the exact prior history fails before either formal item changes", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock), memory = await env.open();
  const keep = await env.automatic(memory, "missing-a", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "missing-b", "project", "发布之前先跑全量回归", "convention");
  const before = await env.raw().list("project", "project-a"), revisions = env.ledger().revisions.bind(env.ledger());
  t.mock.method(env.ledger(), "revisions", (id: string) => id === drop.memory_id ? [] : revisions(id));
  await assert.rejects(memory.upkeep(person(), { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) }), /未执行.*安全历史/);
  assert.deepEqual(await env.raw().list("project", "project-a"), before);
  assert.equal(memory.changes(person()).filter(change => change.kind === "merged").length, 0);
});

for (const failure of ["final-receipt", "creation-history"] as const) test(`recreate undo retries after ${failure} fails without losing the restored source identities`, { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = await env.automatic(memory, "receipt-keep", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "receipt-drop", "project", "发布之前先跑全量回归", "convention");
  const sources = env.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${drop.memory_id}`)!.body;
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) });
  const merge = memory.changes(person()).find(change => change.kind === "merged")!;
  const save = env.ledger().saveChange.bind(env.ledger());
  const fault = t.mock.method(env.ledger(), "saveChange", (record: Parameters<typeof save>[0]) => {
    if (failure === "final-receipt" && record.change_id === merge.change_id && record.state === "undone") throw new Error("undo receipt interrupted");
    return save(record);
  });
  const revision = env.ledger().addRevision.bind(env.ledger());
  const historyFault = t.mock.method(env.ledger(), "addRevision", (...args: Parameters<typeof revision>) => {
    if (failure === "creation-history" && args[0] !== keep.memory_id && args[0] !== drop.memory_id) throw new Error("undo history interrupted");
    return revision(...args);
  });
  await assert.rejects(memory.undo({ ...person(), operation_id: "first-recreate-undo" }, merge.change_id), /undo (receipt|history) interrupted/);
  const written = await env.raw().list("project", "project-a");
  assert.equal(written.length, 2, "the real SDK creation completed before the final undo receipt failed");
  const restored = written.find(entry => entry.memory_id !== keep.memory_id)!;
  const changes = memory.changes(person(), { limit: 50 }).filter(change => change.memory_id === restored.memory_id);
  fault.mock.restore(); historyFault.mock.restore();
  await env.close(); memory = await env.open();
  const result = await memory.undo({ ...person(), operation_id: "a-new-undo-request" }, merge.change_id);
  assert.equal(result.change.state, "undone");
  assert.deepEqual(await env.raw().list("project", "project-a"), written, "a new request does not repeat the completed creation");
  const after = memory.changes(person(), { limit: 50 }).filter(change => change.memory_id === restored.memory_id);
  assert.equal(after.length, 1);
  if (failure === "final-receipt") assert.deepEqual(after, changes);
  assert.equal(env.ledger().revisions(restored.memory_id).length, 1);
  assert.deepEqual(env.ledger().marker(LOCAL_PERSON_ACTOR_ID, `memory-source-links:${restored.memory_id}`)?.body, sources);
});

test("a full pending upkeep slot refuses another scope without ledger or SDK writes", { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock), memory = await env.open();
  await memory.write(person(), { scope: "project", text: "项目发布前核对清单", rests_on: { kind: "page", id: "project-release" } });
  const personal = (await memory.write(person(null), { scope: "personal", text: "我的发布检查清单", rests_on: { kind: "page", id: "personal-release" } })).memory!;
  const save = env.ledger().saveChange.bind(env.ledger());
  const fault = t.mock.method(env.ledger(), "saveChange", (record: Parameters<typeof save>[0]) => {
    if (record.kind === "paused") throw new Error("pending project receipt");
    return save(record);
  });
  await assert.rejects(memory.upkeep(person(), { projects: ["project-a"], objectState: async ref => ref.id === "project-release" ? "missing" : "ok" }), /pending project receipt/);
  fault.mock.restore();
  const pending = env.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:upkeep-pending");
  const writes = [t.mock.method(env.ledger(), "setMarker"), t.mock.method(env.ledger(), "addRevision"), t.mock.method(env.ledger(), "saveChange")];
  const before = await env.raw().list("personal", LOCAL_PERSON_ACTOR_ID);
  await assert.rejects(memory.upkeep(person(null), { projects: [], objectState: async () => "missing" }), /在途|未完成/);
  assert.ok(writes.every(mock => mock.mock.callCount() === 0), "capacity refusal does not prepare a new identity, history or change");
  assert.deepEqual(env.ledger().marker(LOCAL_PERSON_ACTOR_ID, "memory-operation:upkeep-pending"), pending);
  assert.deepEqual(await env.raw().list("personal", LOCAL_PERSON_ACTOR_ID), before);
  assert.equal((await memory.list(person(null))).items.find(item => item.memory_id === personal.memory_id)!.state, "active");
});

for (const later of ["edit", "forget"] as const) test(`recreate undo after an interrupted final receipt preserves a later ${later}`, { timeout: 60_000 }, async t => {
  const clock = { now: new Date("2026-09-30T08:00:00.000Z") };
  const env = await memoryHome(t, clock);
  let memory = await env.open();
  const keep = await env.automatic(memory, "later-keep", "project", "发布前先跑全量回归", "convention");
  const drop = await env.automatic(memory, "later-drop", "project", "发布之前先跑全量回归", "convention");
  await memory.upkeep(person(), { projects: ["project-a"], tidy: async () => ({ duplicates: [[keep.memory_id, drop.memory_id]], conflicts: [] }) });
  const merge = memory.changes(person()).find(change => change.kind === "merged")!;
  const save = env.ledger().saveChange.bind(env.ledger());
  const fault = t.mock.method(env.ledger(), "saveChange", (record: Parameters<typeof save>[0]) => {
    if (record.change_id === merge.change_id && record.state === "undone") throw new Error("final undo receipt interrupted");
    return save(record);
  });
  await assert.rejects(memory.undo({ ...person(), operation_id: "undo-before-later-action" }, merge.change_id), /receipt interrupted/);
  fault.mock.restore();
  const restored = (await env.raw().list("project", "project-a")).find(entry => entry.memory_id !== keep.memory_id)!;
  await memory.change(person(), { memory_id: restored.memory_id, expected_version: restored.version,
    action: later === "edit" ? "update" : "remove", ...(later === "edit" ? { text: "人工后续决定：发布前做专项审阅" } : {}) });
  const before = await env.raw().list("project", "project-a");
  await env.close(); memory = await env.open();
  if (later === "edit") assert.equal((await memory.undo({ ...person(), operation_id: "retry-after-edit" }, merge.change_id)).change.state, "undone");
  else {
    const refs = ["later-drop:input-1", "later-drop:input-2"].map(event_id => ({ event_id, version: "1" }));
    assert.equal(memory.sourceAllowed(LOCAL_PERSON_ACTOR_ID, "project", "project-a", refs), false);
    await assert.rejects(memory.undo({ ...person(), operation_id: "retry-after-forget" }, merge.change_id), /遗忘|删除/);
  }
  assert.deepEqual(await env.raw().list("project", "project-a"), before, "retry neither changes the later decision nor creates a second copy");
});
