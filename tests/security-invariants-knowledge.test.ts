import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { KnowledgeService } from "@molis-ai/molis-work-service-knowledge";
import { person, referenceOwners } from "./fixtures/reference-owners.js";

// S-41 (docs/system/SECURITY-INVARIANTS.md): project knowledge reads only what the caller may read, in the caller's project.

async function fixture(t: import("node:test").TestContext) {
  const f = await referenceOwners(t);
  return { ...f, knowledge: new KnowledgeService({ search: (access, input) => f.search.query(access, input) }) };
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
  const knowledge = new KnowledgeService({ search: async (access, input) => { searched = true; return f.search.query(access, input); } });
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
