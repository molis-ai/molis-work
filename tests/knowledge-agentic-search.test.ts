import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, RoundBudget, knowledgeCatalog, knowledgeCutPieces, knowledgeRef, locateSections, type KnowledgeDraft, type KnowledgeDraftInput,
  type KnowledgeLocateDraftInput } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// specs/project-knowledge K4 (§6.2): the steps an agent takes to find something, after Claude Code, Codex and PageIndex — look
// at what the project holds, narrow down by words, look at a piece's section tree, find exact lines, read from a line.

const agent = (call_id?: string, permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext =>
  ({ ...person("a", permissions), audience: "agent", actor_id: "agent:assistant", ...(call_id ? { call_id } : {}) });
const owner = person("a");
const MANUAL = ["# 试用手册", "开头的说明。", "", "## 账号", "每人一个账号。", "", "### 编号", "内测通行证 MW-0042。", "", "## 反馈", "反馈写进 Goal。", "", "# 附录", "联系方式。"].join("\n");

async function fixture(t: import("node:test").TestContext, budget?: RoundBudget) {
  const f = await referenceOwners(t);
  const cards = openKnowledgeCards({ homeDirectory: f.home });
  t.after(() => cards.close());
  const writer = async (input: KnowledgeDraftInput): Promise<KnowledgeDraft> =>
    ({ title: input.title, brief: `讲的是${input.title}。`, keywords: [input.title], sections: input.sections.map(section => ({ anchor: section.anchor, summary: `${section.title}这一节` })) });
  const organizer = new KnowledgeOrganizer({ store: cards, catalog: async projectId => knowledgeCatalog(f.index, projectId), writer: () => writer, clock: () => new Date("2026-10-19T08:00:00Z") });
  const knowledge = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards, cut: projectId => knowledgeCutPieces(f.index, projectId),
    related: (projectId, query, limit, snippets) => f.index.related(projectId, query, limit, snippets).map(document => ({ snippet: document.snippet, kind: document.kind, id: document.object_id })), ...(budget ? { budget } : {}) });
  const indexAll = async () => { await f.search.query(f.access(owner), { query: "试用", scope: "project", limit: 30 }); await organizer.reconcile("a"); };
  return { ...f, cards, organizer, knowledge, manage: new KnowledgeCards(cards, organizer), indexAll };
}

test("PMAT-26 list shows what the project holds as cards the caller may see, by source, newest first, without text", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  await f.indexAll();
  await f.organizer.kick("a");
  const listed = await f.knowledge.list(f.access(agent()), {});
  assert.deepEqual(listed.pieces.map(piece => piece.subject.id).sort(), ["g1", "g2", "g3", "p1"], "every piece of project a the caller's sources list; project b's goal is not one");
  assert.deepEqual(listed.sources.map(source => [source.plugin_title, source.count]).sort(), [["Goals", 3], ["Pages", 1]]);
  const page = listed.pieces.find(piece => piece.subject.id === "p1")!;
  assert.equal(page.brief, "讲的是试用手册。");
  assert.ok(!JSON.stringify(listed).includes("MW-0042"), "no original text");
  const pages = await f.knowledge.list(f.access(agent()), { plugins: ["pages"] });
  assert.deepEqual([pages.total, pages.pieces.length, pages.sources.length], [1, 1, 2], "a filter narrows the pieces, the source counts stay whole");
  const paged = await f.knowledge.list(f.access(agent()), { limit: 2, offset: 2 });
  assert.deepEqual([paged.total, paged.pieces.length], [4, 2]);

  // Kept from agents, or from a source the caller cannot read, is not listed.
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: true });
  assert.ok(!(await f.knowledge.list(f.access(agent()), {})).pieces.some(piece => piece.subject.id === "p1"));
  const noGoals = await f.knowledge.list(f.access(agent(undefined, ["pages:read", "search:read"])), {});
  assert.deepEqual(noGoals.pieces.map(piece => piece.subject.id), [], "without goals:read the goals are not shown");
  await assert.rejects(() => f.knowledge.list(f.access({ ...agent(), project_id: null }), {}), (error: unknown) => error instanceof ActionError && error.code === "knowledge.scope");
});

test("PMAT-27 the outline is a tree: each section names its parent and line, and a heading's anchor reads it with its subsections", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  const outline = await f.knowledge.outline(f.access(agent()), { subject: { kind: "page", id: "p1" } });
  assert.deepEqual(outline.sections.map(section => [section.anchor, section.title, section.level, section.parent, section.line]),
    [["h1", "试用手册", 1, null, 1], ["h2", "账号", 2, "h1", 4], ["h3", "编号", 3, "h2", 7], ["h4", "反馈", 2, "h1", 10], ["h5", "附录", 1, null, 13]]);
  const topLevel = outline.sections.filter(section => section.parent === null).reduce((sum, section) => sum + section.length, 0);
  assert.equal(topLevel, MANUAL.length, "the top-level sections cover the text exactly once");
  const account = await f.knowledge.read(f.access(agent()), { subject: { kind: "page", id: "p1" }, anchor: "h2" });
  assert.ok(account.text.startsWith("## 账号") && account.text.includes("MW-0042") && !account.text.includes("## 反馈"), account.text);
  assert.deepEqual([account.start_line, account.end_line], [4, 9]);
});

test("PMAT-28 read by line: a line grep found is where reading starts, with the lines it covers and how many there are", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  const subject = { kind: "page", id: "p1" };
  const [hit] = (await f.knowledge.grep(f.access(agent()), { pattern: "MW-0042", subjects: [subject], context_lines: 0 })).matches;
  assert.equal(hit!.line, 8);
  const read = await f.knowledge.read(f.access(agent()), { subject, line: hit!.line - 1, max_lines: 2 });
  assert.equal(read.text, "### 编号\n内测通行证 MW-0042。\n");
  assert.deepEqual([read.start_line, read.end_line, read.total_lines, read.remaining], [7, 8, 14, 0], "the asked lines are all there; the rest of the text is told by total_lines");
  const tail = await f.knowledge.read(f.access(agent()), { subject, line: 14 });
  assert.deepEqual([tail.text, tail.remaining], ["联系方式。", 0]);
  for (const input of [{ subject, line: 15 }, { subject, line: 2, anchor: "h1" }, { subject, line: 2, offset: 3 }]) {
    await assert.rejects(() => f.knowledge.read(f.access(agent()), input), (error: unknown) => error instanceof ActionError && error.code === "knowledge.invalid", JSON.stringify(input));
  }
});

test("PMAT-29 grep without a scope looks through the project's catalog; it can give only which pieces match, and takes other wordings", async t => {
  const f = await fixture(t, new RoundBudget(5_000));
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  f.goals.set("g2", { id: "g2", title: "试用反馈整理", body: "收集试用反馈\n编号 MW-0042 的反馈最多", version: 2 });
  await f.indexAll();

  const lines = await f.knowledge.grep(f.access(agent("r1")), { pattern: "MW-0042", context_lines: 0 });
  assert.equal(lines.catalog, true);
  assert.deepEqual(lines.matches.map(match => [match.subject.id, match.line]).sort(), [["g2", 2], ["p1", 8]]);
  assert.deepEqual(lines.found.map(item => [item.subject.id, item.lines]).sort(), [["g2", 1], ["p1", 1]]);
  assert.ok(lines.searched >= 2 && lines.unread.every(item => item.subject.id !== "gb"), "only this project's pieces are read");

  const before = lines.round_chars_left!;
  const subjects = await f.knowledge.grep(f.access(agent("r1")), { pattern: "反馈", output: "subjects" });
  assert.deepEqual(subjects.matches, [], "no text");
  assert.equal(subjects.round_chars_left, before, "counts do not spend the round's fill of original text");
  assert.deepEqual(subjects.found.map(item => [item.subject.id, item.title, item.lines]).sort(), [["g2", "试用反馈整理", 2], ["p1", "试用手册", 2]]);
  assert.ok(subjects.found.every((item, index) => index === 0 || subjects.found[index - 1]!.lines >= item.lines), "most matching lines first");

  const either = await f.knowledge.grep(f.access(agent()), { pattern: "联系方式", alternatives: ["收集试用"], output: "subjects" });
  assert.deepEqual(either.found.map(item => item.subject.id).sort(), ["g2", "p1"], "a line with any of the wordings matches");

  // Kept from agents: not read, and not reported as unreadable either.
  f.manage.exclude(owner, { subject: { kind: "page", id: "p1" }, excluded: true });
  const kept = await f.knowledge.grep(f.access(agent()), { pattern: "MW-0042", output: "subjects" });
  assert.deepEqual([kept.found.map(item => item.subject.id), kept.unread.map(item => item.subject.id)], [["g2"], []]);
});

test("PMAT-31 a subject project knowledge does not have is refused as not a piece here, saying to copy the subject as given; a known piece keeps its owner's reason", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  await f.indexAll();
  const unknown = (error: unknown) => error instanceof ActionError && error.code === "knowledge.unknown" && /照抄/.test(error.message);
  // An id the owner of a readable kind does not have is not a piece here.
  const copy = { kind: "page", id: "p1-copy" };
  await assert.rejects(() => f.knowledge.read(f.access(agent()), { subject: copy }), unknown);
  await assert.rejects(() => f.knowledge.outline(f.access(agent()), { subject: copy }), unknown);
  // A kind no reader is offered for keeps the directory's own refusal (S-41: a kind the caller may not read looks the same).
  await assert.rejects(() => f.knowledge.read(f.access(agent()), { subject: { kind: "doc", id: "p1" } }), (error: unknown) => error instanceof ActionError && error.code === "actions.subject_unavailable");
  const named = await f.knowledge.grep(f.access(agent()), { pattern: "MW-0042", subjects: [{ kind: "page", id: "p1-copy" }] });
  assert.match(JSON.stringify(named.unread), /照抄/u);
  // A piece with a card that its owner now refuses keeps the owner's own reason.
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 3, refuse: true });
  await assert.rejects(() => f.knowledge.read(f.access(agent()), { subject: { kind: "page", id: "p1" } }), (error: unknown) => error instanceof ActionError && error.code === "pages.locked");
});

test("PMAT-32 a grep over the whole project finds a wording past what the index holds of a long piece; kept or unreadable ones stay out", async t => {
  const f = await fixture(t);
  // A long log: the wording is only past the first 32,000 characters, so no search hit names the piece.
  const filler = Array.from({ length: 2400 }, (_, index) => `第 ${index + 1} 次例会：库存与排班照常。`).join("\n");
  f.pages.set("p9", { id: "p9", title: "例会纪要汇编", body: `${filler}\n第 2401 次例会：地钉换成 7075 铝合金，每枚加 1.2 元。`, version: 1 });
  await f.indexAll();
  assert.ok(f.index.documents("a").some(document => document.object_id === "p9" && document.content.length === 32_000), "the index holds only the start");
  const plain = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards: f.cards });
  assert.deepEqual((await plain.grep(f.access(agent()), { pattern: "7075" })).matches, [], "without the long pieces, the index alone never makes p9 a candidate");

  const found = await f.knowledge.grep(f.access(agent()), { pattern: "7075" });
  assert.deepEqual(found.matches.map(match => [match.subject.id, match.line]), [["p9", 2401]]);
  assert.equal(found.catalog, true);
  assert.deepEqual((await f.knowledge.grep(f.access(agent()), { pattern: "7075", output: "subjects" })).found.map(row => [row.subject.id, row.lines]), [["p9", 1]]);

  // The same rule as list: a caller who cannot read pages is not shown it, and one kept from agents is not read at all.
  const noPages = await f.knowledge.grep(f.access(agent(undefined, ["goals:read", "search:read"])), { pattern: "7075" });
  assert.deepEqual([noPages.matches, noPages.unread], [[], []]);
  f.manage.exclude(owner, { subject: { kind: "page", id: "p9" }, excluded: true });
  const kept = await f.knowledge.grep(f.access(agent()), { pattern: "7075" });
  assert.deepEqual([kept.matches, kept.unread], [[], []]);
});

const FIRE = "库房里着火了，员工第一步该做什么？";

test("PMAT-34 a whole question no piece holds word for word is filled with pieces that hold some of its words, marked related; kept or unreadable ones stay out", async t => {
  const f = await fixture(t);
  f.pages.set("p2", { id: "p2", title: "仓库安全", body: "库房起火时先按下警铃并报警，再按路线疏散。", version: 1 });
  await f.indexAll();
  await f.organizer.kick("a");
  const strict = await f.search.query(f.access(agent()), { query: FIRE, scope: "project", limit: 10 });
  assert.deepEqual(strict.hits, [], "the system search still wants every word: search.query is unchanged");
  const found = await f.knowledge.search(f.access(agent()), { query: FIRE });
  assert.equal(found.cards[0]?.subject.id, "p2", JSON.stringify(found.cards.map(card => card.subject.id)));
  assert.deepEqual([found.cards[0]!.matched, found.cards[0]!.hint], ["related", "讲的是仓库安全。"], "marked related, with the card's brief instead of a passage");
  assert.ok(!JSON.stringify(found).includes("警铃"), "no original text");
  const asked = await f.knowledge.search(f.access({ ...owner, audience: "user" }), { query: FIRE });
  assert.match(asked.cards.find(card => card.subject.id === "p2")?.hint ?? "", /起火|警铃/u, "the person is shown where the words meet in its text (PMAT-46)");

  // A search every word of which a piece holds comes first, unmarked.
  const exact = await f.knowledge.search(f.access(agent()), { query: "库房起火" });
  assert.deepEqual([exact.cards[0]?.subject.id, exact.cards[0]?.matched], ["p2", "content"]);

  const noPages = await f.knowledge.search(f.access(agent(undefined, ["goals:read", "search:read"])), { query: FIRE });
  assert.ok(!noPages.cards.some(card => card.subject.kind === "page"), "a caller who cannot read pages is not shown one");
  f.manage.exclude(owner, { subject: { kind: "page", id: "p2" }, excluded: true });
  assert.ok(!(await f.knowledge.search(f.access(agent()), { query: FIRE })).cards.some(card => card.subject.id === "p2"), "one kept from agents is not added");
});

test("PMAT-35 PMAT-36 a round's catalog is whole when small, otherwise the pieces related to the round first; list orders by related_to the same way", async t => {
  const f = await fixture(t);
  f.pages.set("p2", { id: "p2", title: "仓库安全", body: "库房起火时先按下警铃并报警，再按路线疏散。", version: 1 });
  for (let index = 0; index < 45; index += 1) f.pages.set(`q${index}`, { id: `q${index}`, title: `周报 ${index + 1}`, body: `第 ${index + 1} 周：销售照常。`, version: 1 });
  await f.indexAll();
  const views = async (caller = agent()) => f.actions.discover(caller);
  // A caller who cannot read pages sees only the three goals (the rule list applies): the whole catalog.
  const small = await f.knowledge.catalog("a", await views(agent(undefined, ["goals:read", "search:read"])), FIRE);
  assert.deepEqual([small.whole, small.total, small.pieces.map(piece => piece.subject.kind)], [true, 3, ["goal", "goal", "goal"]]);
  assert.ok(!JSON.stringify(small).includes("十月内部试用"), "cards only");

  const large = await f.knowledge.catalog("a", await views(), FIRE);
  assert.deepEqual([large.whole, large.total, large.pieces.length], [false, 50, 20]);
  assert.equal(large.pieces[0]!.subject.id, "p2", "the piece related to the round's words comes first");
  const listed = await f.knowledge.list(f.access(agent()), { related_to: FIRE, limit: 3 });
  assert.deepEqual([listed.total, listed.pieces[0]!.subject.id], [50, "p2"]);
});

test("PMAT-38 locate shows the model section trees without text and returns only sections that are there, with the line to read from", async t => {
  const f = await fixture(t);
  // Long enough to be organized with section notes; p2 is short, so it has none.
  f.pages.set("p1", { id: "p1", title: "试用手册", body: `${MANUAL}\n${"附录里的其他说明。".repeat(300)}`, version: 2 });
  f.pages.set("p2", { id: "p2", title: "仓库安全", body: "# 消防\n库房起火先报警。\n\n# 疏散\n按路线走。", version: 1 });
  await f.indexAll();
  await f.organizer.kick("a");
  const shown: KnowledgeLocateDraftInput[] = [];
  const locator = async (input: KnowledgeLocateDraftInput) => {
    shown.push(input);
    return { sections: [{ piece: 2, anchor: "h1", reason: "消防一节讲起火" }, { piece: 2, anchor: "h1", reason: "重复" }, { piece: 1, anchor: "h99", reason: "编造的节" },
      { piece: 7, anchor: "h1", reason: "没有这一份" }, { piece: 1, anchor: "h3", reason: "编号一节" }] };
  };
  const asked = f.access(agent());
  const outline = (subject: { kind: string; id: string }) => f.knowledge.outline(asked, { subject });
  const subjects = [{ kind: "page", id: "p1" }, { kind: "page", id: "p2" }, { kind: "page", id: "nope" }];
  const found = await locateSections({ question: "库房着火第一步做什么？", subjects }, outline, locator);
  assert.deepEqual(found.sections.map(section => [section.subject.id, section.anchor, section.title, section.line, section.reason]),
    [["p2", "h1", "消防", 1, "消防一节讲起火"], ["p1", "h3", "编号", 7, "编号一节"]], "a repeated, invented or unknown piece's section is left out");
  assert.deepEqual(found.unread.map(row => row.subject.id), ["nope"]);
  assert.deepEqual(found.unsummarized.map(subject => subject.id), ["p2"], "p2 has no section notes: chosen by headings alone");
  assert.equal(shown[0]!.pieces[0]!.sections.find(section => section.anchor === "h2")?.summary, "账号这一节", "section notes go to the model");
  assert.ok(!JSON.stringify(shown).includes("MW-0042") && !JSON.stringify(shown).includes("先报警"), "no text goes to the model");

  await assert.rejects(() => locateSections({ question: "q", subjects }, outline, null), (error: unknown) => error instanceof ActionError && error.code === "knowledge.no_model");
  const revoked = async () => { throw new ActionError("actions.authority_revoked", "已撤销"); };
  await assert.rejects(() => locateSections({ question: "q", subjects }, outline, locator, revoked), (error: unknown) => error instanceof ActionError && error.code === "actions.authority_revoked",
    "a call no longer current when the model answers returns nothing");
  const noPages = await locateSections({ question: "q", subjects: [{ kind: "page", id: "p1" }] }, subject => f.knowledge.outline(f.access(agent(undefined, ["goals:read", "search:read"])), { subject }), locator);
  assert.deepEqual([noPages.sections, noPages.unread.length], [[], 1], "a tree the caller cannot read is not shown to the model");
});

test("PMAT-39 every listed piece has a short ref, the same one wherever it is given, and read, outline, grep and locate take it in place of the subject", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用手册", body: MANUAL, version: 2 });
  await f.indexAll();
  const asked = f.access(agent());
  const page = { kind: "page", id: "p1" }, ref = knowledgeRef(page);
  assert.match(ref, /^k[0-9a-f]{7}$/);
  assert.equal((await f.knowledge.list(asked, {})).pieces.find(piece => piece.subject.id === "p1")?.ref, ref);
  assert.equal((await f.knowledge.search(asked, { query: "试用手册" })).cards.find(card => card.subject.id === "p1")?.ref, ref);
  const grep = await f.knowledge.grep(asked, { pattern: "MW-0042", subjects: [ref], context_lines: 0 });
  assert.deepEqual(grep.matches.map(match => [match.ref, match.line]), [[ref, 8]], "grep takes refs and gives them back");
  assert.equal((await f.knowledge.outline(asked, { subject: ref })).subject.id, "p1");
  assert.ok((await f.knowledge.read(asked, { subject: ref.toUpperCase(), line: 8, max_lines: 1 })).text.includes("MW-0042"), "a ref is read without regard to case");
  const located = await locateSections({ question: "通行证编号", subjects: f.knowledge.named(asked, [ref]) }, subject => f.knowledge.outline(asked, { subject }),
    async () => ({ sections: [{ piece: 1, anchor: "h3", reason: "编号" }] }));
  assert.deepEqual(located.sections.map(section => [section.ref, section.anchor]), [[ref, "h3"]]);

  await assert.rejects(() => f.knowledge.read(asked, { subject: "k0000000" }), (error: unknown) => error instanceof ActionError && error.code === "knowledge.unknown" && /ref 照抄/.test(error.message));
  // A ref names the piece; it opens nothing the subject would not: the owner still decides with the caller's authority.
  await assert.rejects(() => f.knowledge.read(f.access(agent(undefined, ["goals:read", "search:read"])), { subject: ref }), (error: unknown) => error instanceof ActionError);
  f.manage.exclude(owner, { subject: page, excluded: true });
  await assert.rejects(() => f.knowledge.read(asked, { subject: ref }), (error: unknown) => error instanceof ActionError && error.code === "knowledge.excluded");
  assert.throws(() => f.knowledge.named(f.access({ ...agent(), project_id: null }), [ref]), (error: unknown) => error instanceof ActionError && error.code === "knowledge.scope");
});

test("PMAT-40 a grep of one piece that stops before its last match says the line to go on from, and from_line goes on from there", async t => {
  const f = await fixture(t);
  const body = Array.from({ length: 75 }, (_, index) => `### 巡检 ${index + 1}｜成都太古里店\n得分 ${index === 74 ? 71 : 90}。`).join("\n");
  f.pages.set("p1", { id: "p1", title: "巡检记录", body, version: 1 });
  await f.indexAll();
  const asked = f.access(agent()), ref = knowledgeRef({ kind: "page", id: "p1" });
  const first = await f.knowledge.grep(asked, { pattern: "太古里", subjects: [ref], context_lines: 0 });
  assert.deepEqual([first.matches.length, first.more, first.next_line, first.found[0]?.lines], [30, true, 60, 75], "30 of 75 matching lines, to line 59");
  const second = await f.knowledge.grep(asked, { pattern: "太古里", subjects: [ref], context_lines: 0, limit: 100, from_line: first.next_line! });
  assert.deepEqual([second.matches[0]?.line, second.matches.length, second.more, second.next_line, second.found[0]?.lines], [61, 45, false, null, 75]);
  assert.match(second.matches.at(-1)!.text, /巡检 75/u, "the last record is reached");
  // Where the round's fill stops it, the line to go on from is the first one not given.
  const tight = await fixture(t, new RoundBudget(100));
  tight.pages.set("p1", { id: "p1", title: "巡检记录", body, version: 1 });
  await tight.indexAll();
  const cut = await tight.knowledge.grep(tight.access(agent("r1")), { pattern: "太古里", subjects: [ref], context_lines: 0 });
  assert.ok(cut.more && cut.matches.length > 0 && cut.matches.length < 30);
  assert.equal(cut.next_line, cut.matches.at(-1)!.line + 2);
  // from_line is a line of the one piece named; several pieces, a glob or the whole project have no one line to go on from.
  for (const input of [{ subjects: [ref, { kind: "goal", id: "g1" }] }, {}, { subjects: [ref], glob: "**/*.md" }])
    await assert.rejects(() => f.knowledge.grep(asked, { pattern: "太古里", from_line: 3, ...input }), (error: unknown) => error instanceof ActionError && error.code === "knowledge.invalid");
  const several = await f.knowledge.grep(asked, { pattern: "太古里", subjects: [ref, { kind: "goal", id: "g1" }], context_lines: 0 });
  assert.deepEqual([several.more, several.next_line], [true, null]);
});
