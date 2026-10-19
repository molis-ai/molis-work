import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { KnowledgeOrganizer, KnowledgeService, knowledgeCatalog } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// S-41 (docs/system/SECURITY-INVARIANTS.md): project knowledge reads only what the caller may read, in the caller's project.

async function fixture(t: import("node:test").TestContext) {
  const f = await referenceOwners(t);
  const cards = openKnowledgeCards({ homeDirectory: f.home });
  t.after(() => cards.close());
  return { ...f, cards, knowledge: new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards }) };
}
const agent = (project_id: string | null, permissions = ["goals:read", "pages:read", "search:read"]): ActionCallContext =>
  ({ ...person(project_id ?? "", permissions), project_id, audience: "agent", actor_id: "agent:assistant" });
const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

test("S-41 a caller who may not read a kind neither finds nor reads it", async t => {
  const f = await fixture(t);
  const pagesOnly = f.access(agent("a", ["pages:read", "search:read"]));
  const found = await f.knowledge.search(pagesOnly, { query: "试用" });
  assert.ok(found.cards.length > 0);
  assert.deepEqual([...new Set(found.cards.map(card => card.subject.kind))], ["page"], "no goal card for a caller who cannot read goals");
  await assert.rejects(() => f.knowledge.read(pagesOnly, { subject: { kind: "goal", id: "g1" } }), (error: unknown) => error instanceof ActionError && error.code.startsWith("actions."),
    "the read is refused with the directory's own code");
  await assert.rejects(() => f.knowledge.outline(pagesOnly, { subject: { kind: "goal", id: "g1" } }), (error: unknown) => error instanceof ActionError);
  const grep = await f.knowledge.grep(pagesOnly, { pattern: "试用", subjects: [{ kind: "goal", id: "g1" }] });
  assert.deepEqual([grep.matches.length, grep.unread.map(item => item.subject.id)], [0, ["g1"]]);
});

test("S-41 another project's piece is not read from this project", async t => {
  const f = await fixture(t);
  const access = f.access(agent("a"));
  assert.ok(!(await f.knowledge.search(access, { query: "B 项目" })).cards.some(card => card.subject.id === "gb"));
  await assert.rejects(() => f.knowledge.read(access, { subject: { kind: "goal", id: "gb" } }), (error: unknown) => error instanceof ActionError);
});

test("S-41 a caller without a project is refused before anything is read", async t => {
  const f = await fixture(t);
  let searched = false;
  const knowledge = new KnowledgeService({ search: async (access, input) => { searched = true; return f.search.query(access, input); }, cards: f.cards });
  const access = f.access(agent(null));
  await assert.rejects(() => knowledge.search(access, { query: "试用" }), refused("knowledge.scope"));
  await assert.rejects(() => knowledge.read(access, { subject: { kind: "goal", id: "g1" } }), refused("knowledge.scope"));
  await assert.rejects(() => knowledge.grep(access, { pattern: "试用", subjects: [{ kind: "goal", id: "g1" }] }), refused("knowledge.scope"));
  assert.equal(searched, false);
});

test("S-41 an owner's refusal keeps the owner's own code", async t => {
  const f = await fixture(t);
  await assert.rejects(() => f.knowledge.read(f.access(agent("a")), { subject: { kind: "goal", id: "g3" } }), refused("goals.locked"));
});

test("S-41 PMAT-03 a card found by its own words is shown only to a caller who may read that kind, in its own project", async t => {
  const f = await fixture(t);
  const organizer = new KnowledgeOrganizer({ store: f.cards, catalog: async projectId => knowledgeCatalog(f.index, projectId),
    writer: () => async input => ({ title: input.title, brief: "内测通行证的说明", keywords: ["内测通行证"], sections: [] }) });
  await f.search.query(f.access(person("a")), { query: "试用", scope: "project", limit: 30 });
  await organizer.kick("a");
  const all = await f.knowledge.search(f.access(agent("a")), { query: "内测通行证" });
  assert.deepEqual(all.cards.map(card => card.subject.id).sort(), ["g1", "g2", "p1"], "only the cards' own words hold the query");
  const pagesOnly = await f.knowledge.search(f.access(agent("a", ["pages:read", "search:read"])), { query: "内测通行证" });
  assert.deepEqual(pagesOnly.cards.map(card => card.subject.id), ["p1"], "goal cards were written from goals' text: not for a caller who cannot read goals");
  assert.deepEqual((await f.knowledge.search(f.access(agent("b")), { query: "内测通行证" })).cards, [], "project a's cards are not searched from project b");
});
