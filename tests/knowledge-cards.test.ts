import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, bindSearchEntriesHandler, defineSearchEntriesAction, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { knowledgeManageActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, type KnowledgeDraft, type KnowledgeDraftInput } from "@molis-ai/molis-work-service-knowledge";
import { clearKnowledgeProject, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// specs/project-knowledge K1: cards and outlines organized from each piece, kept apart from what the person wrote on them.

const agent = (permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext => ({ ...person("a", permissions), audience: "agent", actor_id: "agent:assistant" });
const owner = person("a");
const LONG = ["# 背景", "项目要在十月完成内部试用。".repeat(400), "", "# 账号", "每人一个账号，编号 MW-0042。".repeat(300), "", "# 反馈", "反馈写进 Goal。".repeat(400)].join("\n");

async function fixture(t: import("node:test").TestContext, options: { quota?: { pieces: number; chars: number }; writer?: (input: KnowledgeDraftInput) => Promise<KnowledgeDraft> } = {}) {
  const f = await referenceOwners(t);
  const cards = openKnowledgeCards({ homeDirectory: f.home });
  t.after(() => cards.close());
  const written: KnowledgeDraftInput[] = [];
  const writer = options.writer ?? (async (input: KnowledgeDraftInput): Promise<KnowledgeDraft> => {
    written.push(input);
    return { title: `${input.title}（整理）`, brief: `讲的是${input.title}。`, keywords: ["内测通行证", input.title], sections: input.sections.map(section => ({ anchor: section.anchor, summary: `${section.title}这一节` })) };
  });
  let model = true;
  const organizer = new KnowledgeOrganizer({ store: cards, catalog: async projectId => knowledgeCatalog(f.index, projectId), writer: () => model ? writer : null,
    ...(options.quota ? { quota: options.quota } : {}), clock: () => new Date("2026-10-19T08:00:00Z") });
  const knowledge = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards });
  // The catalog is what search indexed: a search by the owner brings project a's sources into the index.
  const indexAll = async () => { await f.search.query(f.access(owner), { query: "试用", scope: "project", limit: 30 }); };
  return { ...f, cards, organizer, knowledge, manage: new KnowledgeCards(cards, organizer), written, indexAll, noModel: () => { model = false; } };
}
const card = (f: { cards: ReturnType<typeof openKnowledgeCards> }, id: string, kind = id.startsWith("p") ? "page" : "goal") => f.cards.get("a", { kind, id })!;

test("PMAT-05 a piece in the catalog gets a card waiting for organizing, and waits again when its revision changes", async t => {
  const f = await fixture(t);
  f.noModel();
  await f.indexAll();
  await f.organizer.kick("a");
  assert.deepEqual(f.cards.list("a").map(item => [item.subject.id, item.state]).sort(), [["g1", "pending"], ["g2", "pending"], ["g3", "listed"], ["p1", "pending"]],
    "without a model every card waits (the locked goal was indexed without its text, so it is only listed); nothing of project b is here");
  assert.equal(f.written.length, 0);
  assert.equal(card(f, "p1").title, "试用说明", "until organized, the card carries the owner's title");
  f.pages.set("p1", { id: "p1", title: "试用说明", body: "试用手册第二版", version: 2 });
  await f.search.rebuild(f.access(owner), { scope: "project" });
  await f.organizer.reconcile("a");
  assert.deepEqual([card(f, "p1").state, card(f, "p1").revision, card(f, "p1").organized_revision], ["pending", "2", null]);
});

test("PMAT-06 organizing writes a title, a brief and keywords, and section notes for a long piece, read back only for that revision", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: LONG, version: 4 });
  await f.indexAll();
  await f.organizer.kick("a");
  const page = card(f, "p1");
  assert.equal(page.state, "ready");
  assert.deepEqual([page.title, page.brief, page.organized_revision], ["试用说明（整理）", "讲的是试用说明。", "4"]);
  assert.deepEqual(page.keywords, ["内测通行证", "试用说明"]);
  assert.deepEqual(page.outline.map(note => [note.anchor, note.summary]), [["h1", "背景这一节"], ["h2", "账号这一节"], ["h3", "反馈这一节"]]);
  assert.equal(card(f, "g1").outline.length, 0, "a short piece gets a card but no outline");
  const sent = f.written.find(input => input.title === "试用说明")!;
  assert.ok(sent.text.length <= 12_000 && sent.text.includes("[h2]"), "a long piece sends each section's opening, within the limit");
  const outline = await f.knowledge.outline(f.access(agent()), { subject: { kind: "page", id: "p1" } });
  assert.equal(outline.sections.find(section => section.anchor === "h2")!.summary, "账号这一节");
  f.pages.set("p1", { id: "p1", title: "试用说明", body: LONG, version: 5 });
  const later = await f.knowledge.outline(f.access(agent()), { subject: { kind: "page", id: "p1" } });
  assert.ok(later.sections.every(section => section.summary === null), "notes from revision 4 say nothing about revision 5");
});

test("PMAT-06 a draft without keywords and with stray section notes still makes a card: only notes naming a given section with a summary are kept", async t => {
  // What MiniMax was measured writing (spec §14 K1): no keywords field, a note carrying the section's title, a repeated and an invented anchor.
  const f = await fixture(t, { writer: async () => ({ title: "试用说明", brief: "讲内部试用。",
    sections: [{ anchor: "h1" }, { anchor: "h1", summary: "背景" }, { anchor: "h1", summary: "又是背景" }, { anchor: "# 为什么", summary: "编的" }, { summary: "没有编号" }, { anchor: "h3", summary: "反馈" }] }) });
  f.pages.set("p1", { id: "p1", title: "试用说明", body: LONG, version: 4 });
  await f.indexAll();
  await f.organizer.kick("a");
  const page = card(f, "p1");
  assert.equal(page.state, "ready");
  assert.deepEqual(page.keywords, []);
  assert.deepEqual(page.outline.map(note => [note.anchor, note.title, note.summary]), [["h1", "背景", "背景"], ["h3", "反馈", "反馈"]]);
});

test("PMAT-06 search finds a piece by its card's own words, and shows the brief, never the text", async t => {
  const f = await fixture(t);
  await f.indexAll();
  await f.organizer.kick("a");
  const found = await f.knowledge.search(f.access(agent()), { query: "内测通行证" });
  assert.deepEqual(found.cards.map(item => [item.subject.id, item.matched]).sort(), [["g1", "card"], ["g2", "card"], ["p1", "card"]],
    "only a card says 内测通行证 (the locked goal was never organized)");
  const page = found.cards.find(item => item.subject.id === "p1")!;
  assert.deepEqual([page.brief, page.keywords[0]], ["讲的是试用说明。", "内测通行证"]);
  const byText = await f.knowledge.search(f.access(agent()), { query: "试用" });
  assert.equal(byText.cards.find(item => item.subject.id === "p1")!.title, "试用说明（整理）", "a hit from the text carries its card");
});

test("PMAT-04 a piece whose owner lets out only its title and summary is listed, never sent to a model", async t => {
  const f = await fixture(t);
  const secrets = defineSearchEntriesAction("vault.search.entries", [{ kind: "secret", title: "保险箱", surface: "vault" }], "保险箱", []);
  f.actions.registerProvider({ provider: { provider_id: "vault", plugin_id: "vault", title: "Vault", kind: "plugin", project_id: "a" }, definitions: [secrets],
    handlers: [bindSearchEntriesHandler(secrets, () => [{ subject: { kind: "secret", id: "s1" }, revision: "1", title: "试用账号清单", summary: "试用期间的账号", updated_at: null, content: "summary", open: { surface: "vault", id: "s1" } }])] });
  await f.indexAll();
  await f.organizer.kick("a");
  const listed = f.cards.get("a", { kind: "secret", id: "s1" })!;
  assert.deepEqual([listed.state, listed.content_policy, listed.title, listed.brief], ["listed", "summary", "试用账号清单", "试用期间的账号"]);
  assert.ok(!f.written.some(input => input.title === "试用账号清单"), "nothing of it reaches the model");
  assert.equal(f.manage.organize(owner, { subjects: [{ kind: "secret", id: "s1" }] }).queued, 0, "asking again does not send it either");
});

test("PMAT-43 a piece kept from agents and a piece with no readable text go to no model; letting the piece back organizes it", async t => {
  const f = await fixture(t);
  f.pages.set("p9", { id: "p9", title: "空白页", body: "", version: 1 });
  await f.indexAll();
  await f.organizer.reconcile("a");
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: true });
  await f.organizer.kick("a");
  assert.deepEqual([card(f, "p1").state, card(f, "p1").excluded], ["pending", true], "kept back, it waits");
  assert.equal(card(f, "p9").state, "listed", "nothing to read in it: listed by its own title");
  assert.ok(!f.written.some(input => input.title === "试用说明" || input.title === "空白页"), JSON.stringify(f.written.map(input => input.title)));
  const used = f.organizer.quota("a").used_pieces;
  assert.equal(f.manage.organize(owner, { subjects: [{ kind: "page", id: "p1" }] }).queued, 0, "asking to organize it does not send it either");
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: false });
  await f.organizer.kick("a");
  assert.equal(card(f, "p1").state, "ready");
  assert.equal(f.organizer.quota("a").used_pieces, used + 1, "organized once it is let back");
});

test("PMAT-07 a field the person edited is not overwritten when the text changes; organizing's new wording waits as a suggestion to adopt", async t => {
  const f = await fixture(t);
  await f.indexAll();
  await f.organizer.kick("a");
  const edited = f.manage.edit(owner, { subject: { kind: "page", id: "p1" }, title: "试用手册（人写的）", keywords: ["手册"] });
  assert.deepEqual([edited.title, edited.edited], ["试用手册（人写的）", ["title", "keywords"]]);
  f.pages.set("p1", { id: "p1", title: "试用说明 v2", body: "试用手册第二版", version: 2 });
  await f.search.rebuild(f.access(owner), { scope: "project" });
  await f.organizer.kick("a");
  const after = card(f, "p1");
  assert.deepEqual([after.title, after.keywords, after.brief], ["试用手册（人写的）", ["手册"], "讲的是试用说明 v2。"], "edited fields keep the person's words; the rest follow the text");
  assert.deepEqual(after.suggestion, { title: "试用说明 v2（整理）", keywords: ["内测通行证", "试用说明 v2"] });
  const adopted = f.manage.edit(owner, { subject: { kind: "page", id: "p1" }, adopt: ["title"] });
  assert.deepEqual([adopted.title, adopted.edited, adopted.suggestion], ["试用说明 v2（整理）", ["keywords"], { keywords: ["内测通行证", "试用说明 v2"] }]);
});

for (const change of ["exclude", "remove-source", "summary-only"] as const) {
  test(`SYS-01 waiting for one draft rechecks the next piece after ${change}`, async t => {
    const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    const sent: string[] = [];
    const f = await fixture(t, { writer: async input => {
      sent.push(input.title);
      if (sent.length === 1) { started.resolve(); await release.promise; }
      return { title: input.title, brief: "整理" };
    } });
    f.goals.clear();
    f.pages.set("p2", { id: "p2", title: "第二份", body: "第二份私有正文", version: 1 });
    await f.indexAll();
    const pass = f.organizer.kick("a");
    try {
      await started.promise;
      const waiting = f.cards.list("a").find(row => row.title !== sent[0])!;
      if (change === "exclude") f.manage.exclude(owner, { subject: waiting.subject, excluded: true });
      else {
        if (change === "remove-source") f.pages.delete(waiting.subject.id);
        else f.pages.get(waiting.subject.id)!.refuse = true;
        await f.search.rebuild(f.access(owner), { scope: "project" });
      }
      release.resolve();
      await pass;
      assert.equal(sent.length, 1, "the queued piece never reaches the model");
      assert.equal(f.organizer.quota("a").used_pieces, 1);
    } finally { release.resolve(); await pass; await f.organizer.close(); }
  });
}

test("SYS-02 deletion rejects a draft even when the writer ignores cancellation, and no later kick recreates records", async t => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let sent = 0;
  const f = await fixture(t, { writer: async input => {
    sent++; started.resolve(); await release.promise;
    return { title: input.title, brief: "迟到结果" };
  } });
  await f.indexAll();
  const pass = f.organizer.kick("a");
  try {
    await started.promise;
    void f.organizer.kick("a");
    f.organizer.removeProject("a");
    f.cards.removeProject("a");
    release.resolve(); await pass;
    await f.organizer.kick("a");
    await f.organizer.reconcile("a");
    assert.equal(f.organizer.queue("a", undefined, true), 0);
    assert.equal(sent, 1);
    assert.deepEqual(f.cards.list("a"), []);
    assert.equal(f.organizer.quota("a").used_pieces, 0);
  } finally { release.resolve(); await pass; await f.organizer.close(); }
});

test("PMAT-08 a piece kept back from agents is neither found nor read, and the refusal says why", async t => {
  const f = await fixture(t);
  await f.indexAll();
  await f.organizer.kick("a");
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: true });
  for (const query of ["试用说明", "内测通行证"]) {
    assert.ok(!(await f.knowledge.search(f.access(agent()), { query })).cards.some(item => item.subject.id === "p1"), `not found by ${query}`);
  }
  for (const call of [() => f.knowledge.read(f.access(agent()), { subject: { kind: "page", id: "p1" } }),
    () => f.knowledge.outline(f.access(agent()), { subject: { kind: "page", id: "p1" } })]) {
    await assert.rejects(call, (error: unknown) => error instanceof ActionError && error.code === "knowledge.excluded" && error.message.includes("不给 Agent 用"));
  }
  const grep = await f.knowledge.grep(f.access(agent()), { pattern: "试用", subjects: [{ kind: "page", id: "p1" }] });
  assert.deepEqual(grep.unread.map(item => item.subject.id), ["p1"]);
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: false });
  assert.equal((await f.knowledge.read(f.access(agent()), { subject: { kind: "page", id: "p1" } })).text, "试用手册");
});

test("PMAT-16 when the day's allowance is used up organizing stops for the person, and goes on only after they confirm", async t => {
  const f = await fixture(t, { quota: { pieces: 2, chars: 100_000 } });
  await f.indexAll();
  await f.organizer.kick("a");
  assert.equal(f.written.length, 2, "two pieces, then the model is not called again today");
  assert.equal(f.cards.list("a").filter(item => item.state === "over_quota").length, 1);
  const listed = f.manage.list(owner, {});
  assert.deepEqual([listed.quota.used_pieces, listed.quota.limit_pieces, listed.quota.reached], [2, 2, true]);
  await f.organizer.kick("a");
  assert.equal(f.written.length, 2, "kicking again does not go past the allowance");
  const confirmed = f.manage.organize(owner, { confirm_over_quota: true });
  assert.deepEqual([confirmed.queued, confirmed.quota.limit_pieces], [1, 4]);
  await f.organizer.kick("a");
  assert.equal(f.written.length, 3);
  assert.ok(f.cards.list("a").every(item => item.state === "ready" || item.state === "listed"));
});

test("PMAT-16 a failed organizing is recorded on the card and tried again only when asked", async t => {
  let fail = true;
  const f = await fixture(t, { writer: async input => {
    if (fail) throw new Error("模型两分钟内没有写完");
    return { title: input.title, brief: "简介", keywords: [], sections: [] };
  } });
  await f.indexAll();
  await f.organizer.kick("a");
  assert.deepEqual([card(f, "p1").state, card(f, "p1").error], ["failed", "模型两分钟内没有写完"]);
  fail = false;
  await f.organizer.kick("a");
  assert.equal(card(f, "p1").state, "failed", "not retried on its own");
  assert.equal(f.manage.organize(owner, {}).queued, 3);
  await f.organizer.kick("a");
  assert.deepEqual([card(f, "p1").state, card(f, "p1").brief], ["ready", "简介"]);
});

test("PMAT-07 a card the person edited stays when its piece leaves the catalog, and the store forgets a deleted project", async t => {
  const f = await fixture(t);
  await f.indexAll();
  await f.organizer.kick("a");
  f.manage.edit(owner, { subject: { kind: "goal", id: "g2" }, brief: "人写的简介" });
  f.goals.delete("g1"); f.goals.delete("g2");
  await f.search.rebuild(f.access(owner), { scope: "project" });
  await f.organizer.reconcile("a");
  assert.equal(f.cards.get("a", { kind: "goal", id: "g1" }), null, "an untouched card goes with its piece");
  assert.equal(card(f, "g2").state, "missing", "an edited one waits for its piece");
  assert.ok(!(await f.knowledge.search(f.access(agent()), { query: "人写的简介" })).cards.length, "a missing piece is not found");
  assert.equal(clearKnowledgeProject(f.home, "a"), 3, "the edited card, the listed one and the page's");
  assert.deepEqual(f.cards.list("a"), []);
});

test("PMAT-01 managing cards is the person's own: user-only actions under knowledge:manage", () => {
  const definitions = Object.values(knowledgeManageActions);
  assert.deepEqual(inspectActionDeclarations(definitions, undefined), []);
  for (const item of definitions) {
    assert.deepEqual(item.action.audiences, ["user"]);
    assert.deepEqual(item.action.permissions, ["knowledge:manage"]);
  }
  assert.deepEqual(definitions.map(item => item.operation), ["query", "command", "query", "command", "command", "command", "query"]);
  assert.equal(knowledgeManageActions.bindPreview.action.effect, "read");
  assert.equal(knowledgeManageActions.bindPreview.action.scheduling, "concurrent");
});
