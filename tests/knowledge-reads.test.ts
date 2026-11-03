import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, subjectContext, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_TEXT_MAX_CHARS } from "@molis-ai/molis-work-contracts/services/knowledge";
import { KnowledgeCards, KnowledgeOrganizer, KnowledgeService, RoundBudget, knowledgeCatalog } from "@molis-ai/molis-work-service-knowledge";
import { clearKnowledgeProject, openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// specs/project-knowledge K1 (rest): long pieces read page by page, a round's fill of original text, and who read what.

const round = (call_id: string | undefined, permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext =>
  ({ ...person("a", permissions), audience: "agent", actor_id: "agent:coding", audit_actor_id: "assistant:w1", ...(call_id ? { call_id } : {}), runtime_session_id: "s1" });
const LONG = ["# 开头", "前言。".repeat(15_000), "", "# 很后面的一节", "这一节在第 45000 字之后。", "", "# 结尾", "完。"].join("\n");

async function fixture(t: import("node:test").TestContext, budget?: RoundBudget, at = "2026-10-19T08:00:00.000Z") {
  const f = await referenceOwners(t);
  const cards = openKnowledgeCards({ homeDirectory: f.home });
  t.after(() => cards.close());
  let now = at;
  const knowledge = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards, ...(budget ? { budget } : {}), clock: () => new Date(now) });
  const organizer = new KnowledgeOrganizer({ store: cards, catalog: async projectId => knowledgeCatalog(f.index, projectId), writer: () => null });
  return { ...f, cards, knowledge, manage: new KnowledgeCards(cards, organizer), setNow: (value: string) => { now = value; } };
}

test("PMAT-06 a reader that takes offset is read page by page: sections past the first 32000 characters are outlined and read", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "长文档", body: LONG, version: 2 });
  const access = f.access(round(undefined));
  const outline = await f.knowledge.outline(access, { subject: { kind: "page", id: "p1" } });
  assert.deepEqual([outline.length, outline.owner_truncated], [LONG.length, false]);
  assert.deepEqual(outline.sections.map(section => section.title), ["开头", "很后面的一节", "结尾"]);
  const late = await f.knowledge.read(access, { subject: { kind: "page", id: "p1" }, anchor: "h2" });
  assert.match(late.text, /这一节在第 45000 字之后/u);
  assert.ok(late.start > 32_000);
});

test("PMAT-06 a reader without offset gives its first page, and the read says the owner gave less than the whole piece", async t => {
  const f = await fixture(t);
  f.goals.set("g1", { id: "g1", title: "很长的目标", body: LONG, version: 9 });
  const outline = await f.knowledge.outline(f.access(round(undefined)), { subject: { kind: "goal", id: "g1" } });
  assert.deepEqual([outline.length, outline.owner_truncated], [32_000, true]);
  assert.deepEqual(outline.sections.map(section => section.title), ["开头"]);
});

test("PMAT-06 subjectContext pages from the offset it is given and says where the page starts and how long the text is", () => {
  const whole = "a".repeat(40_000) + "b".repeat(10);
  const base = { subject: { kind: "page", id: "p" }, revision: "1", title: "t", content: whole, goal_ids: [] };
  assert.deepEqual([subjectContext(base).content.length, subjectContext(base).truncated, subjectContext(base).offset], [32_000, true, undefined]);
  const second = subjectContext(base, { offset: 32_000 });
  assert.deepEqual([second.content.length, second.truncated, second.offset, second.length, second.content.endsWith("b".repeat(10))], [8_010, false, 32_000, 40_010, true]);
  assert.equal(subjectContext(base, { offset: 999_999 }).content, "", "past the end is an empty page, never someone else's text");
  assert.ok(KNOWLEDGE_TEXT_MAX_CHARS >= 32_000);
});

test("PMAT-11 a round gets at most its fill of original text; the rest is left with how much remains, and another round starts fresh", async t => {
  const f = await fixture(t, new RoundBudget(5_000));
  f.pages.set("p1", { id: "p1", title: "长文档", body: LONG, version: 2 });
  const subject = { kind: "page", id: "p1" };
  const first = await f.knowledge.read(f.access(round("r1")), { subject, max_chars: 4_000 });
  assert.deepEqual([first.text.length, first.round_chars_left], [4_000, 1_000]);
  const second = await f.knowledge.read(f.access(round("r1")), { subject, offset: 4_000, max_chars: 4_000 });
  assert.deepEqual([second.text.length, second.round_chars_left, second.remaining > 0], [1_000, 0, true], "cut at the fill, and it says so");
  const third = await f.knowledge.read(f.access(round("r1")), { subject, offset: 5_000 });
  assert.deepEqual([third.text, third.round_chars_left], ["", 0]);
  const grep = await f.knowledge.grep(f.access(round("r1")), { pattern: "前言", subjects: [subject] });
  assert.deepEqual([grep.matches.length, grep.more, grep.round_chars_left], [0, true, 0], "lines found count toward the same fill");
  const other = await f.knowledge.read(f.access(round("r2")), { subject, max_chars: 4_000 });
  assert.deepEqual([other.text.length, other.round_chars_left], [4_000, 1_000]);
  const unnumbered = await f.knowledge.read(f.access(round(undefined)), { subject, max_chars: 12_000 });
  assert.deepEqual([unnumbered.text.length, unnumbered.round_chars_left], [12_000, null], "a call outside a round is bounded only by its own size");
});

test("PMAT-42 what the person, or a plugin's own code for them, reads in a round's operation counts against no round; an agent's reads still do", async t => {
  const f = await fixture(t, new RoundBudget(5_000));
  f.pages.set("p1", { id: "p1", title: "长文档", body: LONG, version: 2 });
  const subject = { kind: "page", id: "p1" };
  // Six pieces picked for one Coding round, read by the plugin in the request that starts it: each gets its whole page.
  for (const audience of ["plugin", "user"] as const) {
    const picked = { ...round("start-1"), audience };
    for (let index = 0; index < 3; index++) {
      const read = await f.knowledge.read(f.access(picked), { subject, offset: index * 4_000, max_chars: 4_000 });
      assert.deepEqual([read.text.length, read.round_chars_left], [4_000, null], `${audience} read ${index + 1}`);
    }
  }
  const agent = await f.knowledge.read(f.access(round("start-1")), { subject, max_chars: 4_000 });
  assert.deepEqual([agent.text.length, agent.round_chars_left], [4_000, 1_000], "the agent's own reads in that operation still count, from zero");
  assert.match(agent.ref ?? "", /^k[0-9a-f]{7}$/u, "a read names the piece's ref, to go on reading it with");
});

test("PMAT-12 each read and each piece grep found lines in leaves a receipt: who, which round, which revision, how much", async t => {
  const f = await fixture(t);
  f.pages.set("p1", { id: "p1", title: "试用说明", body: "第一行\n内测通行证 MW-0042\n第三行", version: 4 });
  await f.knowledge.read(f.access(round("r1")), { subject: { kind: "page", id: "p1" } });
  await f.knowledge.grep(f.access(round("r2")), { pattern: "内测通行证", subjects: [{ kind: "page", id: "p1" }, { kind: "goal", id: "g1" }] });
  const { receipts, total } = f.manage.receipts(person("a"), {});
  assert.equal(total, 2);
  assert.deepEqual(receipts.map(item => [item.via, item.subject.id, item.revision, item.call_id, item.actor_id, item.agent, item.runtime_session_id]),
    [["grep", "p1", "4", "r2", "agent:coding", "assistant:w1", "s1"], ["read", "p1", "4", "r1", "agent:coding", "assistant:w1", "s1"]],
    "newest first; the goal grep found nothing in leaves none");
  assert.equal(receipts[1]!.chars, "第一行\n内测通行证 MW-0042\n第三行".length);
  assert.equal(f.manage.receipts(person("a"), { subject: { kind: "goal", id: "g1" } }).total, 0);
});

test("PMAT-12 a read whose call is no longer current leaves no receipt and returns nothing", async t => {
  const f = await fixture(t);
  const revoked = { ...f.access(round("r1")), beforeEffect: async () => { throw new ActionError("actions.revoked", "已撤权"); } };
  await assert.rejects(() => f.knowledge.read(revoked, { subject: { kind: "page", id: "p1" } }), { code: "actions.revoked" });
  assert.equal(f.manage.receipts(person("a"), {}).total, 0);
});

test("PMAT-12 receipts are kept 30 days and go with a deleted project", async t => {
  const f = await fixture(t);
  f.setNow("2026-09-01T00:00:00.000Z");
  await f.knowledge.read(f.access(round("old")), { subject: { kind: "page", id: "p1" } });
  f.setNow("2026-10-19T00:00:00.000Z");
  await f.knowledge.read(f.access(round("new")), { subject: { kind: "page", id: "p1" } });
  assert.deepEqual(f.manage.receipts(person("a"), {}).receipts.map(item => item.call_id), ["new"]);
  assert.equal(clearKnowledgeProject(f.home, "a"), 0, "no cards, but the receipts are cleared with the project");
  assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
});

for (const mode of ["read", "mixed"] as const) {
  test(`SYS-03 six concurrent ${mode} calls share one 60000-character round budget`, async t => {
    const budget = new RoundBudget(), f = await fixture(t, budget);
    f.pages.set("p1", { id: "p1", title: "并发读取", body: Array.from({ length: 30 }, () => "x".repeat(400)).join("\n"), version: 1 });
    const allChecked = Promise.withResolvers<void>();
    let checks = 0;
    const access = { ...f.access(round("parallel")), beforeEffect: async () => {
      if (++checks === 6) allChecked.resolve();
      await allChecked.promise;
    } };
    const subject = { kind: "page", id: "p1" };
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => mode === "mixed" && i % 2
      ? f.knowledge.grep(access, { subjects: [subject], pattern: "x", context_lines: 0, limit: 30 }).then(result => ({ chars: result.matches.reduce((sum, hit) => sum + [hit.text, ...hit.before, ...hit.after].join("\n").length, 0), left: result.round_chars_left }))
      : f.knowledge.read(access, { subject, max_chars: 12_000 }).then(result => ({ chars: result.text.length, left: result.round_chars_left }))));
    assert.equal(results.reduce((sum, result) => sum + result.chars, 0), 60_000);
    assert.deepEqual(results.map(result => result.left).sort((a, b) => a! - b!), [0, 0, 12_000, 24_000, 36_000, 48_000]);
    assert.equal(budget.left("parallel"), 0);
    assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).receipts.reduce((sum, receipt) => sum + receipt.chars, 0), 60_000);
  });
}

test("SYS-03 a rejected read leaves its round's full budget for the next valid read", async t => {
  const budget = new RoundBudget(), f = await fixture(t, budget);
  const access = f.access(round("rejected"));
  await assert.rejects(f.knowledge.read({ ...access, beforeEffect: async () => { throw new ActionError("actions.revoked", "已撤权"); } }, { subject: { kind: "page", id: "p1" } }), { code: "actions.revoked" });
  assert.equal(budget.left("rejected"), 60_000);
  assert.equal(f.cards.receipts("a", { limit: 10, offset: 0 }).total, 0);
  assert.equal((await f.knowledge.read(access, { subject: { kind: "page", id: "p1" } })).round_chars_left, 60_000 - "试用手册".length);
});
