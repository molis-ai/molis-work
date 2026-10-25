import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_READ_MAX_CHARS, knowledgeActions, type KnowledgeListEntry, type KnowledgeListRequest, type KnowledgeListResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import { inspectActionDeclarations } from "@molis-ai/molis-work-plugin-sdk";
import { codingManifest, knowledgeCatalogMaterial, withKnowledgeTools } from "@molis-ai/molis-work-plugin-coding";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { KnowledgeService, PLAIN_SECTION_CHARS, grepLines, outlineOf } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// specs/project-knowledge K0: one set of actions every agent in a project reads knowledge through.

const reader = (permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext => ({ ...person("a", permissions), audience: "agent", actor_id: "agent:assistant" });
async function fixture(t: import("node:test").TestContext) {
  const f = await referenceOwners(t);
  const cards = openKnowledgeCards({ homeDirectory: f.home });
  t.after(() => cards.close());
  const knowledge = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards });
  return { ...f, knowledge };
}
const HANDBOOK = ["试用手册的开头说明。", "", "# 准备", "安装 Molis Work。", "", "## 账号", "每人一个账号，编号 MW-0042。", "", "```", "# 这不是标题", "```", "", "# 反馈", "把试用反馈写进 Goal。"].join("\n");

test("PRR-05 Coding consumes knowledge.list for the project catalog", () => {
  assert.ok(codingManifest.capabilities?.consumes.includes(knowledgeActions.list.capability_id), "the real client refuses an action the Manifest does not consume");
});

test("PMAT-01 PMAT-38 the seven knowledge actions are reads every audience reaches through the directory", () => {
  const definitions = Object.values(knowledgeActions);
  assert.deepEqual(definitions.map(item => item.capability_id), ["knowledge.list", "knowledge.search", "knowledge.outline", "knowledge.read", "knowledge.grep", "knowledge.glob", "knowledge.locate"]);
  assert.deepEqual(inspectActionDeclarations(definitions, undefined), []);
  for (const item of definitions) {
    assert.equal(item.action.kind, "query");
    assert.equal(item.action.effect, "read");
    assert.equal(item.action.scope, "project");
    assert.deepEqual(item.action.audiences, ["user", "agent", "workflow", "mcp", "plugin"]);
    if (item === knowledgeActions.locate) {
      assert.deepEqual(item.action.permissions, ["knowledge:read", "model:invoke"]);
      assert.deepEqual(item.action.execution, { cost: "metered" });
    } else assert.deepEqual(item.action.permissions, ["knowledge:read"]);
  }
  assert.equal(knowledgeActions.locate.operation, "query", "it stays a read; model:invoke keeps it out of external waits");
});

test("PMAT-09 search answers with cards from the caller's project only, never a quotable passage", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: `${"背景。".repeat(200)}试用手册在这里。${"后文。".repeat(200)}`, version: 2 });
  const found = await f.knowledge.search(f.access(reader()), { query: "试用" });
  const ids = found.cards.map(card => card.subject.id).sort();
  assert.ok(ids.includes("p1") && ids.includes("g1"));
  assert.ok(!ids.includes("gb"), "another project's goal is not a card");
  for (const card of found.cards) assert.ok(card.hint.length <= 160, "a card carries a short hint, not the text");
  const page = found.cards.find(card => card.subject.id === "p1")!;
  assert.deepEqual([page.plugin_title, page.title], ["Pages", "试用说明"]);
});

test("PMAT-06 the outline follows the owner's headings, outside code fences", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: HANDBOOK, version: 4 });
  const outline = await f.knowledge.outline(f.access(reader()), { subject: { kind: "page", id: "p1" } });
  assert.equal(outline.revision, "4");
  assert.deepEqual(outline.sections.map(section => [section.anchor, section.title, section.level, section.summary]),
    [["h0", "试用手册的开头说明。", 0, null], ["h1", "准备", 1, null], ["h2", "账号", 2, null], ["h3", "反馈", 1, null]], "no notes before the piece is organized");
  const total = outline.sections.filter(section => section.parent === null).reduce((sum, section) => sum + section.length, 0);
  assert.equal(total, HANDBOOK.length, "the top-level sections cover the text exactly once");
});

test("PMAT-06 text without headings is cut at paragraph breaks", () => {
  const paragraph = `${"字".repeat(900)}\n\n`;
  const text = paragraph.repeat(5);
  const sections = outlineOf(text);
  assert.ok(sections.length >= 2);
  for (const section of sections.slice(0, -1)) {
    assert.ok(section.length <= PLAIN_SECTION_CHARS);
    assert.ok(text.slice(section.start, section.start + section.length).endsWith("\n\n"), "a cut falls on a paragraph break");
  }
});

test("PMAT-45 headings on CRLF lines keep no carriage return; text with Chinese numbered headings and no Markdown ones is cut at them", () => {
  assert.deepEqual(outlineOf("# 第一节\r\n内容\r\n## 细节\r\n更多").map(section => section.title), ["第一节", "细节"]);
  const rules = ["员工守则", "第一章 总则", "适用于全体员工。", "第一条 目的", "为了规范管理，制定本守则。", "第二章 考勤", "一、上班时间", "九点上班。", "（一）迟到", "迟到要记录。", "二、请假", "提前申请。"].join("\n");
  const sections = outlineOf(rules);
  assert.deepEqual(sections.map(section => [section.title, section.level]),
    [["员工守则", 0], ["第一章 总则", 1], ["第一条 目的", 3], ["第二章 考勤", 1], ["一、上班时间", 2], ["（一）迟到", 3], ["二、请假", 2]]);
  assert.equal(sections.find(section => section.title === "（一）迟到")?.parent, sections.find(section => section.title === "一、上班时间")?.anchor);
  assert.deepEqual(outlineOf("一、只有一处编号\n正文。").map(section => section.anchor), ["p1"], "one numbered line is not a structure");
  assert.deepEqual(outlineOf("# 标题\n一、列表一\n二、列表二").map(section => section.title), ["标题"], "Markdown headings win when the text has them");
});

test("PMAT-45 grep shows a long line around its match, not only its first 400 characters", () => {
  const line = "前".repeat(1_000) + "口令是 MW-0042" + "后".repeat(1_000);
  const [hit] = grepLines(line, ["mw-0042"], 0, 5).hits;
  assert.ok(hit?.text.includes("MW-0042") && hit.text.startsWith("…") && hit.text.endsWith("…"), hit?.text);
  assert.ok(hit.text.length <= 402);
  assert.equal(grepLines("短行里的 MW-0042", ["MW-0042"], 0, 5).hits[0]?.text, "短行里的 MW-0042");
});

test("PMAT-06 PMAT-09 read returns the owner's original text of one section, with what is left", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: HANDBOOK, version: 4 });
  const access = f.access(reader());
  const section = await f.knowledge.read(access, { subject: { kind: "page", id: "p1" }, anchor: "h2" });
  assert.equal(section.layer, "original");
  assert.equal(section.revision, "4");
  assert.ok(section.text.startsWith("## 账号") && section.text.includes("MW-0042") && !section.text.includes("# 反馈"));
  assert.equal(section.remaining, 0);
  const part = await f.knowledge.read(access, { subject: { kind: "page", id: "p1" }, anchor: "h2", offset: 3, max_chars: 200 });
  assert.equal(part.start, section.start + 3);
  const long = "长".repeat(KNOWLEDGE_READ_MAX_CHARS + 500);
  f.pages.set("p1", { id: "p1", title: "长文", body: long, version: 5 });
  const first = await f.knowledge.read(access, { subject: { kind: "page", id: "p1" }, max_chars: KNOWLEDGE_READ_MAX_CHARS });
  assert.deepEqual([first.text.length, first.remaining], [KNOWLEDGE_READ_MAX_CHARS, 500], "a long piece says how much is left instead of cutting silently");
});

test("PMAT-06 an anchor the current text does not have is refused with its revision", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: HANDBOOK, version: 4 });
  await assert.rejects(() => f.knowledge.read(f.access(reader()), { subject: { kind: "page", id: "p1" }, anchor: "h9" }),
    (error: unknown) => error instanceof ActionError && error.code === "knowledge.anchor_unknown" && (error.details as { revision?: string } | undefined)?.revision === "4");
  await assert.rejects(() => f.knowledge.read(f.access(reader()), { subject: { kind: "page", id: "p1" }, anchor: "h1", offset: 10_000 }),
    (error: unknown) => error instanceof ActionError && error.code === "knowledge.invalid");
});

test("PMAT-09 grep finds literal text without case and names what it could not read", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: HANDBOOK, version: 4 });
  const found = await f.knowledge.grep(f.access(reader()), { pattern: "mw-0042", subjects: [{ kind: "page", id: "p1" }, { kind: "goal", id: "g3" }, { kind: "goal", id: "missing" }], context_lines: 1 });
  assert.deepEqual(found.matches.map(match => [match.subject.id, match.line, match.text, match.before, match.after]), [["p1", 7, "每人一个账号，编号 MW-0042。", ["## 账号"], [""]]]);
  assert.deepEqual(found.unread.map(item => item.subject.id), ["g3", "missing"], "a locked and a missing piece are named, not skipped");
  assert.equal(found.more, false);
  const regexLike = await f.knowledge.grep(f.access(reader()), { pattern: "MW-00.2", subjects: [{ kind: "page", id: "p1" }] });
  assert.equal(regexLike.matches.length, 0, "the pattern is literal text, never a regex");
  const limited = await f.knowledge.grep(f.access(reader()), { pattern: "#", subjects: [{ kind: "page", id: "p1" }], limit: 2 });
  assert.deepEqual([limited.matches.length, limited.more], [2, true]);
});

test("PMAT-24 a Coding round carries the knowledge open to its Agent now, inside its Character, besides the person's own picks", () => {
  const offered = (capability_id: string, available = true, provider_id = "system.knowledge"): ActionView => ({ capability_id, version: 1, operation: "query",
    provider: { provider_id, title: "项目资料", kind: "system" }, availability: available ? { available: true } : { available: false, code: "mcp.action_revoked", reason: "已撤销" },
    action: { ...knowledgeActions.read.action } }) as ActionView;
  const picked = [{ capability_id: "pages.subject.read", version: 2, provider_id: "pages" }];
  const directory = [offered("knowledge.search"), offered("knowledge.read"), offered("knowledge.grep", false), offered("pages.subject.read", true, "pages")];
  assert.deepEqual(withKnowledgeTools(picked, directory).map(ref => ref.capability_id), ["pages.subject.read", "knowledge.search", "knowledge.read"],
    "a revoked one is left out; a non-knowledge action is not added");
  assert.deepEqual(withKnowledgeTools([], directory, [{ capability_id: "knowledge.read", version: 1, provider_id: "system.knowledge" }]).map(ref => ref.capability_id), ["knowledge.read"],
    "a Character only narrows");
  assert.deepEqual(withKnowledgeTools([{ capability_id: "knowledge.read", version: 1, provider_id: "system.knowledge" }], directory).map(ref => ref.capability_id), ["knowledge.read", "knowledge.search"], "no duplicates");
});

test("PMAT-36 a Coding round that carries 「列出项目资料」 gets the catalog: whole when small, otherwise the pieces related to its words", async () => {
  const piece = (index: number): KnowledgeListEntry => ({ subject: { kind: "page", id: `p${index}` }, ref: `k000000${index % 10}`, revision: "1", title: `资料 ${index}`, plugin_id: "pages", plugin_title: "Pages",
    updated_at: null, brief: `第 ${index} 份的简介`, keywords: [], sections: 0, open: null });
  const asked: KnowledgeListRequest[] = [];
  const actions = (total: number, fail = false) => ({ invoke: async <Input, Output>(_definition: unknown, input: Input): Promise<Output> => {
    asked.push(input as KnowledgeListRequest);
    if (fail) throw new Error("来源暂时读不到");
    const limit = (input as KnowledgeListRequest).limit ?? 30;
    const response: KnowledgeListResponse = { total, sources: [], listing: false, pieces: Array.from({ length: Math.min(total, limit) }, (_, index) => piece(index + 1)) };
    return response as Output;
  } });
  const list = [{ capability_id: "knowledge.list", version: 1, provider_id: "system.knowledge" }];

  assert.equal(await knowledgeCatalogMaterial(actions(3), [], "仓库着火", "s1"), null, "a round without the list tool gets none");
  const small = await knowledgeCatalogMaterial(actions(3), list, "仓库着火", "s1");
  assert.ok(small?.text.startsWith("这个项目的资料一共 3 份，都列在下面。") && small.text.includes("- k0000002「资料 2」（Pages）：第 2 份的简介"), small?.text);
  assert.deepEqual([small!.title, asked.length], ["项目资料目录", 1]);

  asked.length = 0;
  const large = await knowledgeCatalogMaterial(actions(50), list, "仓库着火", "s1");
  assert.match(large!.text, /一共 50 份，下面是与这一轮最相关的 20 份/);
  assert.deepEqual(asked, [{ related_to: "仓库着火", limit: 40 }], "one listing, the related pieces first");
  assert.equal(await knowledgeCatalogMaterial(actions(0), list, "仓库着火", "s1"), null, "nothing listed, nothing given");
  assert.equal(await knowledgeCatalogMaterial(actions(3, true), list, "仓库着火", "s1"), null, "a listing that fails does not stop the round");
});
