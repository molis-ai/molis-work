import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ActionService } from "@molis-ai/molis-work-kernel";
import {
  ActionError,
  bindSearchEntriesHandler,
  defineSearchEntriesAction,
  defineSearchQueryAction,
  defineSubjectContextAction,
  inspectActionDeclarations,
  searchEntriesPage,
  subjectContext,
  type ActionAvailability,
  type ActionCallContext,
  type SearchEntry,
} from "@molis-ai/molis-work-contracts/platform/actions";
import { SEARCH_PROVIDER_ID, searchActions } from "@molis-ai/molis-work-contracts/services/search";
import { homeSqlitePath, openTextSearchIndex } from "@molis-ai/molis-work-storage";
import { SearchService } from "@molis-ai/molis-work-service-search";

type Note = { id: string; title: string; body: string; version: number; secret?: boolean };
interface Source {
  notes: Map<string, Note>;
  lists: number;
  reads: number;
  fail: boolean;
  availability: ActionAvailability;
}

const kinds = [{ kind: "note", title: "笔记", surface: "notes" }];
const entries = defineSearchEntriesAction("notes.search.entries", kinds, "笔记", ["notes:read"]);
const reader = defineSubjectContextAction("notes.subject.read", "note", "笔记", ["notes:read"]);
const personalKinds = [{ kind: "memo", title: "备忘", surface: "memos" }];
const personalEntries = defineSearchEntriesAction("memos.search.entries", personalKinds, "备忘", ["memos:read"], "home");
const personalReader = defineSubjectContextAction("memos.subject.read", "memo", "备忘", ["memos:read"]);
// Personal readers are Home-scoped once the subject protocol allows it; until then this source indexes summaries only.
const personalQuery = defineSearchQueryAction("memos.search.query", personalKinds, "备忘按需", ["memos:read"], "home");

function source(notes: Note[] = []): Source {
  return { notes: new Map(notes.map(note => [note.id, note])), lists: 0, reads: 0, fail: false, availability: { available: true } };
}
function register(service: ActionService, state: Source, provider: { provider_id: string; project_id?: string; plugin_id?: string }) {
  return service.registerProvider({
    provider: { title: "笔记插件", kind: "plugin", plugin_id: provider.plugin_id ?? "notes", ...provider },
    availability: () => state.availability,
    definitions: [entries, reader],
    handlers: [
      bindSearchEntriesHandler(entries, () => {
        state.lists += 1;
        if (state.fail) throw new ActionError("notes.broken", "笔记库暂时打不开");
        return [...state.notes.values()].map((note): SearchEntry => ({ subject: { kind: "note", id: note.id }, revision: String(note.version), title: note.title,
          summary: note.secret ? "（私密）" : "", updated_at: null, content: note.secret ? "summary" : "context", open: { surface: "notes", id: note.id } }));
      }),
      { ...reader, handle: (_caller, input) => {
        state.reads += 1;
        const note = state.notes.get((input as { subject_id: string }).subject_id);
        if (!note) throw new ActionError("actions.subject_unavailable", "笔记已删除");
        return subjectContext({ subject: { kind: "note", id: note.id }, revision: String(note.version), title: note.title, content: note.body, goal_ids: [], session_id: null });
      } },
    ],
  });
}
function registerPersonal(service: ActionService, memos: Note[], onDemand: Note[] = []) {
  return service.registerProvider({
    provider: { provider_id: "memos", plugin_id: "memos", title: "备忘插件", kind: "plugin" },
    definitions: [personalEntries, personalQuery],
    handlers: [
      bindSearchEntriesHandler(personalEntries, () => memos.map(memo => ({ subject: { kind: "memo", id: memo.id }, revision: String(memo.version), title: memo.title,
        summary: memo.body, updated_at: null, content: "summary" as const, open: null }))),
      { ...personalQuery, handle: (_caller, input) => ({ hits: onDemand.filter(memo => memo.body.includes((input as { query: string }).query)).map(memo => ({
        subject: { kind: "memo", id: memo.id }, revision: String(memo.version), title: memo.title, snippet: memo.body.slice(0, 40), updated_at: null, open: null })) }) },
    ],
  });
}

const owner = (project_id: string | null): ActionCallContext => ({ actor_id: "web-user", project_id, audience: "user", permissions: ["notes:read", "memos:read", "search:read"] });

async function fixture(t: import("node:test").TestContext, options: { freshMs?: number } = {}) {
  const home = await mkdtemp(join(tmpdir(), "system-search-"));
  const actions = new ActionService();
  let now = 1_000_000;
  let index = openTextSearchIndex({ homeDirectory: home });
  const make = () => new SearchService({ index, clock: () => now, freshMs: options.freshMs ?? 60_000, budgetMs: 5_000, refreshDelayMs: 5,
    indexer: async project_id => ({ client: actions, caller: owner(project_id) }) });
  let search = make();
  t.after(async () => { await search.close(); index.close(); await rm(home, { recursive: true, force: true }); });
  return {
    home, actions,
    get search() { return search; },
    tick(ms: number) { now += ms; },
    async reopen(damage: "none" | "remove" | "corrupt" = "none") {
      await search.close(); index.close();
      if (damage !== "none") for (const suffix of ["", "-wal", "-shm"]) { const file = homeSqlitePath(home, "search") + suffix; if (existsSync(file)) rmSync(file); }
      if (damage === "corrupt") writeFileSync(homeSqlitePath(home, "search"), Buffer.alloc(8192, 0x5a));
      index = openTextSearchIndex({ homeDirectory: home }); search = make();
    },
  };
}
const ask = (f: { actions: ActionService; search: SearchService }, caller: ActionCallContext, query: string, extra: Record<string, unknown> = {}) =>
  f.search.query({ client: f.actions, caller }, { query, ...extra });
const ids = (response: { hits: Array<{ subject: { id: string } }> }) => response.hits.map(hit => hit.subject.id).sort();

test("search source protocol rejects declarations that do not honor the canonical contract", () => {
  assert.deepEqual(inspectActionDeclarations([entries, reader, personalEntries, personalQuery], undefined), []);
  const broken = { ...entries, action: { ...entries.action, search_source: { kinds: [{ kind: "other", title: "别的", surface: "notes" }] } } };
  assert.match(inspectActionDeclarations([broken], undefined).join(), /搜索来源协议/);
  const badSurface = { ...entries, action: { ...entries.action, search_source: { kinds: [{ kind: "note", title: "笔记", surface: "not a surface" }] } } };
  assert.match(inspectActionDeclarations([badSurface], undefined).join(), /搜索来源协议/);
  const loose = { ...entries, action: { ...entries.action, output_schema: { type: "object" } } };
  assert.match(inspectActionDeclarations([loose], undefined).join(), /搜索来源协议/);
  const page = searchEntriesPage([3, 1, 2].map(n => ({ subject: { kind: "note", id: `n${n}` }, revision: "1", title: "", summary: "", updated_at: null, content: "summary" as const, open: null })), { cursor: null, limit: 2 });
  assert.deepEqual(page.entries.map(entry => entry.subject.id), ["n1", "n2"]);
  const rest = searchEntriesPage([3, 1, 2].map(n => ({ subject: { kind: "note", id: `n${n}` }, revision: "1", title: "", summary: "", updated_at: null, content: "summary" as const, open: null })), { cursor: page.next_cursor, limit: 2 });
  assert.deepEqual(rest.entries.map(entry => entry.subject.id), ["n3"]);
  assert.equal(rest.next_cursor, null);
  assert.equal(rest.collection_revision, page.collection_revision);
});

test("content that was never opened is found: Chinese, short words, prefixes, full-width and mixed text", async t => {
  const f = await fixture(t);
  const notes = source([
    { id: "plan", title: "第四季度计划要点", body: "预算控制在50万以内。上线前完成法务审核。", version: 1 },
    { id: "design", title: "Molis Work 搜索设计", body: "search-v2方案 与 OKR 对齐；Q4 目标", version: 1 },
    { id: "noise", title: "无关", body: "预先算好控制台的数据", version: 1 },
  ]);
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  const first = await ask(f, owner("a"), "预算");
  assert.deepEqual(ids(first), ["plan"]);
  assert.equal(first.status, "complete");
  assert.equal(first.hits[0]!.open?.surface, "notes");
  assert.equal(first.hits[0]!.locator.field, "content");
  assert.equal(first.hits[0]!.locator.text, "预算");
  assert.deepEqual(first.hits[0]!.snippet.slice(first.hits[0]!.highlights[0]![0], first.hits[0]!.highlights[0]![1]), "预算");
  for (const [query, expected] of [["法务", ["plan"]], ["Q4", ["design"]], ["q4", ["design"]], ["ＯＫＲ", ["design"]], ["sea", ["design"]], ["search方案", ["design"]],
    ["50万", ["plan"]], ["控制", ["noise", "plan"]], ["算控", ["plan"]], ["季度 预算", ["plan"]], ["不存在的词", []]] as const) {
    assert.deepEqual(ids(await ask(f, owner("a"), query)), [...expected].sort(), query);
  }
  // One pass read every body once; later queries reuse the index.
  assert.equal(notes.reads, 3);
});

test("create, change and delete are reflected after the owner's command settles, from any entry", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "n1", title: "周报", body: "本周完成支付接入", version: 1 }]);
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  assert.deepEqual(ids(await ask(f, owner("a"), "支付")), ["n1"]);
  notes.notes.set("n2", { id: "n2", title: "新建的", body: "支付回调重试", version: 1 });
  notes.notes.set("n1", { id: "n1", title: "周报", body: "本周完成对账", version: 2 });
  f.search.markChanged("notes-a", "a");
  assert.deepEqual(ids(await ask(f, owner("a"), "支付")), ["n2"]);
  assert.deepEqual(ids(await ask(f, owner("a"), "对账")), ["n1"]);
  const readsBefore = notes.reads;
  notes.notes.delete("n2");
  f.search.markChanged("notes-a", "a");
  assert.deepEqual(ids(await ask(f, owner("a"), "支付")), []);
  assert.equal(notes.reads, readsBefore, "a removal reads no bodies");
  // A change nobody announced (a background writer) is still picked up once the source is no longer fresh.
  notes.notes.set("n3", { id: "n3", title: "后台写入", body: "同步来的对账单", version: 1 });
  assert.deepEqual(ids(await ask(f, owner("a"), "对账单")), []);
  f.tick(61_000);
  assert.deepEqual(ids(await ask(f, owner("a"), "对账单")), ["n3"]);
});

test("project, personal and grant scopes: nothing leaks to a caller who cannot read the source", async t => {
  const f = await fixture(t);
  register(f.actions, source([{ id: "a1", title: "A 项目合同", body: "甲方付款条款", version: 1 }]), { provider_id: "notes", project_id: "a" });
  register(f.actions, source([{ id: "b1", title: "B 项目合同", body: "乙方付款条款", version: 1 }]), { provider_id: "notes", project_id: "b" });
  registerPersonal(f.actions, [{ id: "m1", title: "个人备忘：付款", body: "记得付款", version: 1 }]);
  assert.deepEqual(ids(await ask(f, owner("a"), "付款")), ["a1", "m1"]);
  assert.deepEqual(ids(await ask(f, owner("b"), "付款")), ["b1", "m1"]);
  assert.deepEqual(ids(await ask(f, owner("a"), "付款", { scope: "project" })), ["a1"]);
  assert.deepEqual(ids(await ask(f, owner("a"), "付款", { scope: "personal" })), ["m1"]);
  assert.deepEqual(ids(await ask(f, owner(null), "付款")), ["m1"]);
  await assert.rejects(ask(f, owner(null), "付款", { scope: "project" }), (error: { code?: string }) => error.code === "actions.project_required");
  // An external client granted only the personal source sees only it; the project's notes stay invisible.
  const client: ActionCallContext = { actor_id: "mcp-client", project_id: "a", audience: "mcp", permissions: ["memos:read", "search:read"],
    allowed_actions: [{ capability_id: personalEntries.capability_id, version: 1, provider_id: "memos" }] };
  assert.deepEqual(ids(await ask(f, client, "付款")), ["m1"]);
  // Granted the listing but not the reader: titles and summaries only, never reader-provided body text.
  const listingOnly: ActionCallContext = { ...client, permissions: ["notes:read", "search:read"], allowed_actions: [{ capability_id: entries.capability_id, version: 1, provider_id: "notes" }] };
  assert.deepEqual(ids(await ask(f, listingOnly, "甲方")), []);
  assert.deepEqual(ids(await ask(f, listingOnly, "合同")), []);
  const withReader: ActionCallContext = { ...listingOnly, allowed_actions: [...listingOnly.allowed_actions!, { capability_id: reader.capability_id, version: 1, provider_id: "notes" }] };
  assert.deepEqual(ids(await ask(f, withReader, "甲方")), ["a1"]);
  // Opening checks the same authority again.
  const hit = (await ask(f, owner("a"), "甲方")).hits[0]!;
  assert.equal((await f.search.open({ client: f.actions, caller: withReader }, { hit_id: hit.hit_id })).state, "ok");
  assert.equal((await f.search.open({ client: f.actions, caller: client }, { hit_id: hit.hit_id })).state, "unavailable");
  assert.equal((await f.search.open({ client: f.actions, caller: owner("b") }, { hit_id: hit.hit_id })).state, "unavailable");
});

test("summary-only content keeps its body out of the index", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "s1", title: "加密材料", body: "只在原处解密的正文", version: 1, secret: true }]);
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  assert.deepEqual(ids(await ask(f, owner("a"), "加密")), ["s1"]);
  assert.deepEqual(ids(await ask(f, owner("a"), "解密")), []);
  assert.equal(notes.reads, 0, "a summary-only entry is never read for indexing");
});

test("open verifies the object: a deleted one is reported and leaves the index", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "gone", title: "要删的", body: "临时方案", version: 1 }]);
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  const hit = (await ask(f, owner("a"), "临时")).hits[0]!;
  const ok = await f.search.open({ client: f.actions, caller: owner("a") }, { hit_id: hit.hit_id });
  assert.equal(ok.state, "ok");
  assert.deepEqual(ok.state === "ok" && ok.open, { surface: "notes", id: "gone" });
  notes.notes.delete("gone");
  const missing = await f.search.open({ client: f.actions, caller: owner("a") }, { hit_id: hit.hit_id });
  assert.equal(missing.state, "missing");
  assert.deepEqual(ids(await ask(f, owner("a"), "临时")), []);
  await assert.rejects(f.search.open({ client: f.actions, caller: owner("a") }, { hit_id: "not-a-hit" }), (error: { code?: string }) => error.code === "actions.input_invalid");
});

test("a failing source keeps what it had, reports it, and recovers", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "kept", title: "稳定内容", body: "索引里保留的正文", version: 1 }]);
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  assert.deepEqual(ids(await ask(f, owner("a"), "保留")), ["kept"]);
  notes.fail = true;
  notes.notes.clear();
  f.search.markChanged("notes-a", "a");
  const failing = await ask(f, owner("a"), "保留");
  assert.deepEqual(ids(failing), ["kept"], "a failed pass never deletes");
  assert.equal(failing.status, "partial");
  assert.equal(failing.sources[0]!.state, "stale");
  assert.match(failing.sources[0]!.reason ?? "", /打不开/);
  notes.fail = false;
  f.tick(11_000);
  const recovered = await ask(f, owner("a"), "保留");
  assert.deepEqual(ids(recovered), []);
  assert.equal(recovered.status, "complete");
  assert.equal(recovered.sources[0]!.state, "ready");
});

test("a source that has never indexed and fails is reported, not hidden", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "x", title: "x", body: "x", version: 1 }]);
  notes.fail = true;
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  const response = await ask(f, owner("a"), "x");
  assert.equal(response.status, "partial");
  assert.equal(response.sources[0]!.state, "failed");
});

test("disable, re-enable and uninstall follow the plugin's lifecycle", async t => {
  const f = await fixture(t);
  const notes = source([{ id: "n", title: "停用测试", body: "灵光一闪", version: 1 }]);
  const dispose = register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  assert.deepEqual(ids(await ask(f, owner("a"), "灵光")), ["n"]);
  notes.availability = { available: false, code: "actions.plugin_disabled", reason: "此项目未启用该插件" };
  const disabled = await ask(f, owner("a"), "灵光");
  assert.deepEqual(ids(disabled), []);
  assert.equal(disabled.sources[0]!.state, "disabled");
  notes.availability = { available: true };
  assert.deepEqual(ids(await ask(f, owner("a"), "灵光")), ["n"]);
  dispose();
  f.search.markChanged("notes-a", "a");
  const gone = await ask(f, owner("a"), "灵光");
  assert.equal(gone.status, "empty_scope");
  // Reinstalled later, nothing stale comes back with it.
  notes.notes.clear();
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  // The Host announces every registration, as it does for every settled command.
  f.search.markChanged("notes-a", "a");
  assert.deepEqual(ids(await ask(f, owner("a"), "灵光")), []);
});

test("restart keeps the index; a deleted or corrupt index file is rebuilt with the same results", async t => {
  const f = await fixture(t);
  const notes = source(Array.from({ length: 1200 }, (_, index) => ({ id: `n${index}`, title: `记录 ${index}`, body: index % 100 === 0 ? `关键词 甲乙丙 ${index}` : `普通内容 ${index}`, version: 1 })));
  register(f.actions, notes, { provider_id: "notes-a", project_id: "a" });
  const before = ids(await ask(f, owner("a"), "甲乙丙", { limit: 50 }));
  assert.equal(before.length, 12);
  assert.ok(notes.lists >= 3, "more than one page was listed");
  await f.reopen();
  const reads = notes.reads;
  assert.deepEqual(ids(await ask(f, owner("a"), "甲乙丙", { limit: 50 })), before);
  assert.equal(notes.reads, reads, "an unchanged collection is not read again after restart");
  await f.reopen("remove");
  assert.deepEqual(ids(await ask(f, owner("a"), "甲乙丙", { limit: 50 })), before);
  await f.reopen("corrupt");
  assert.deepEqual(ids(await ask(f, owner("a"), "甲乙丙", { limit: 50 })), before);
  const rebuilt = await f.search.rebuild({ client: f.actions, caller: owner("a") }, { scope: "project" });
  assert.equal(rebuilt.cleared, 1200);
  assert.deepEqual(ids(await ask(f, owner("a"), "甲乙丙", { limit: 50 })), before);
});

test("pages through results with a cursor bound to the query", async t => {
  const f = await fixture(t);
  register(f.actions, source(Array.from({ length: 7 }, (_, index) => ({ id: `p${index}`, title: `分页 ${index}`, body: "同样的词", version: 1 }))), { provider_id: "notes-a", project_id: "a" });
  const one = await ask(f, owner("a"), "同样", { limit: 3 });
  const two = await ask(f, owner("a"), "同样", { limit: 3, cursor: one.next_cursor });
  const three = await ask(f, owner("a"), "同样", { limit: 3, cursor: two.next_cursor });
  assert.equal(three.next_cursor, null);
  assert.equal(new Set([...one.hits, ...two.hits, ...three.hits].map(hit => hit.subject.id)).size, 7);
  await assert.rejects(ask(f, owner("a"), "别的词", { cursor: one.next_cursor }), (error: { code?: string }) => error.code === "actions.input_invalid");
});

test("an on-demand source is searched at query time and never persisted", async t => {
  const f = await fixture(t);
  registerPersonal(f.actions, [], [{ id: "live", title: "按需", body: "只在查询时出现的正文", version: 1 }]);
  const response = await ask(f, owner(null), "查询时");
  assert.deepEqual(ids(response), ["live"]);
  assert.equal(response.hits[0]!.plugin_id, "memos");
  await f.reopen();
  assert.deepEqual(ids(await ask(f, owner(null), "查询时")), ["live"]);
});

test("the Host's search actions are well-formed directory entries", () => {
  assert.deepEqual(inspectActionDeclarations(Object.values(searchActions), undefined), []);
  assert.equal(SEARCH_PROVIDER_ID, "system.search");
  void personalReader;
});
