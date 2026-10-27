import assert from "node:assert/strict";
import test from "node:test";

import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { workspaceReadActions } from "@molis-ai/molis-work-contracts/modules/workspace-artifacts";
import { projectsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { KnowledgeOrganizer, KnowledgeService, knowledgeCatalog, locateSections, type KnowledgeLocateDraftInput } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";
import { person, referenceOwners } from "./fixtures/reference-owners.js";
import { knowledgeWorkspace } from "./fixtures/knowledge-workspace.js";

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

test("S-41 PMAT-03 a card found by its own words, listed, or grepped across the catalog is only for a caller who may read that kind, in its own project", async t => {
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
  const listed = await f.knowledge.list(f.access(agent("a", ["pages:read", "search:read"])), {});
  assert.deepEqual(listed.pieces.map(piece => piece.subject.id), ["p1"], "the list follows the same rule");
  assert.deepEqual((await f.knowledge.list(f.access(agent("b")), {})).pieces.filter(piece => piece.subject.id !== "gb"), [], "project a's cards are not listed from project b");
  const grep = await f.knowledge.grep(f.access(agent("a", ["pages:read", "search:read"])), { pattern: "试用", output: "subjects" });
  assert.ok(grep.found.every(item => item.subject.kind === "page") && grep.unread.every(item => item.subject.kind === "page"), "a catalog grep reads no goal for a caller who cannot read goals");
  assert.ok(!(await f.knowledge.grep(f.access(agent("b")), { pattern: "试用", output: "subjects" })).found.some(item => item.subject.id !== "gb"), "nor another project's pieces");
});

test("S-41 PMAT-13 the linked folder is read only with the caller's own grant, never through a link out of it or a climbing path, never from another project", async t => {
  const f = await knowledgeWorkspace(t);
  const ungranted = f.access(f.agent([]));
  await assert.rejects(() => f.knowledge.glob(ungranted, { pattern: "**/*" }), (error: unknown) => error instanceof ActionError);
  await assert.rejects(() => f.knowledge.read(ungranted, { subject: { kind: "workspace_file", id: "ws1:README.md" } }), (error: unknown) => error instanceof ActionError);
  const access = f.access(f.agent());
  const all = await f.knowledge.glob(access, { pattern: "**/*" });
  assert.ok(all.files.length > 0 && !all.files.some(file => file.path.startsWith("linked")), "a link out of the folder is not walked");
  await assert.rejects(() => f.knowledge.read(access, { subject: { kind: "workspace_file", id: "ws1:linked/secret.txt" } }), refused("knowledge.unreadable"));
  await assert.rejects(() => f.knowledge.read(access, { subject: { kind: "workspace_file", id: "ws1:../outside/secret.txt" } }), refused("knowledge.invalid"));
  await assert.rejects(() => f.knowledge.glob(access, { pattern: "../outside/*" }), refused("knowledge.invalid"));
  const grep = await f.knowledge.grep(access, { pattern: "secret", glob: "**/*" });
  assert.equal(grep.matches.length, 0, "nothing outside the folder is read");
  const elsewhere = f.access(f.agent(["workspace:read"], "b"));
  await assert.rejects(() => f.knowledge.glob(elsewhere, { pattern: "**/*" }), refused("knowledge.unreadable"));
  await assert.rejects(() => f.knowledge.read(elsewhere, { subject: { kind: "workspace_file", id: "ws1:README.md" } }), refused("knowledge.unreadable"));
});

test("S-41 PMAT-34 PMAT-35 PMAT-38 pieces added for some of the words, a round's catalog and the trees locate shows the model are only what the caller may read, in its own project", async t => {
  const f = await fixture(t);
  const knowledge = new KnowledgeService({ search: (access, input) => f.search.query(access, input), cards: f.cards,
    related: (projectId, query, limit) => f.index.related(projectId, query, limit).map(document => ({ kind: document.kind, id: document.object_id })) });
  const organizer = new KnowledgeOrganizer({ store: f.cards, catalog: async projectId => knowledgeCatalog(f.index, projectId),
    writer: () => async input => ({ title: input.title, brief: "内测试用的说明", keywords: [], sections: [] }) });
  await f.search.query(f.access(person("a")), { query: "试用", scope: "project", limit: 30 });
  await organizer.kick("a");
  const question = "试用这件事最后定下来怎么安排的？";
  const pagesOnly = agent("a", ["pages:read", "search:read"]);
  const related = await knowledge.search(f.access(pagesOnly), { query: question, limit: 10 });
  assert.ok(related.cards.length > 0 && related.cards.every(card => card.subject.kind === "page"), "no goal is added for a caller who cannot read goals");
  assert.ok(!(await knowledge.search(f.access(agent("b")), { query: question })).cards.some(card => card.subject.id !== "gb"), "nor project a's pieces from project b");
  const catalog = await knowledge.catalog("a", await f.actions.discover(pagesOnly), question);
  assert.deepEqual(catalog.pieces.map(piece => piece.subject.kind), ["page"], "a round's catalog follows the same rule");
  const shown: KnowledgeLocateDraftInput[] = [];
  const located = await locateSections({ question, subjects: [{ kind: "goal", id: "g1" }, { kind: "goal", id: "gb" }, { kind: "page", id: "p1" }] },
    subject => knowledge.outline(f.access(pagesOnly), { subject }), async input => { shown.push(input); return { sections: [] }; });
  assert.deepEqual(located.unread.map(row => row.subject.id), ["g1", "gb"], "a tree the caller cannot read, or of another project, is refused");
  assert.deepEqual(shown.flatMap(input => input.pieces.map(piece => piece.title)), ["试用说明"], "and never shown to the model");
});

// PRR-01 S-41: a Plugin holding knowledge:read reads sources with the owner's authority, but workspace files with its own.
test("PRR-01 S-41 a plugin with knowledge:read but no workspace:read cannot read a workspace file", async t => {
  const f = await knowledgeWorkspace(t);
  const owner = f.agent();
  const plugin = { ...f.agent(["knowledge:read"]), actor_id: "plugin-install-x", audience: "plugin" as const };
  const views = [
    { capability_id: workspaceReadActions.file.capability_id, version: workspaceReadActions.file.version, provider: { provider_id: "io.molis.work.projects" }, availability: { available: true } },
    { capability_id: projectsCapabilities.listWorkspaces.capability_id, version: projectsCapabilities.listWorkspaces.version, provider: { provider_id: "io.molis.work.projects" }, availability: { available: true } },
  ];
  const client = {
    discover: async (caller: ActionCallContext) => caller.permissions.includes("workspace:read") ? views : [],
    invoke: async (caller: ActionCallContext, ref: { capability_id: string }, input: { kind?: string }) => {
      assert.ok(caller.permissions.includes("workspace:read"), "workspace files need the caller's own grant");
      if (ref.capability_id === projectsCapabilities.listWorkspaces.capability_id) return [{ workspace_id: "ws1", realpath_verified: true }];
      if (ref.capability_id === workspaceReadActions.file.capability_id) return input.kind === "directory"
        ? { outcome: "directory", entries: [{ name: "README.md", path: ["README.md"], kind: "file" }], truncated: false }
        : { outcome: "text", text: "# 项目", fingerprint: "1" };
      throw new Error("unexpected " + ref.capability_id);
    },
  };
  const denied = { client, caller: plugin, reader: owner, workspace: plugin } as never;
  await assert.rejects(() => f.knowledge.glob(denied, { pattern: "**/*" }), refused("knowledge.unreadable"));
  await assert.rejects(() => f.knowledge.read(denied, { subject: { kind: "workspace_file", id: "ws1:README.md" } }), refused("knowledge.unreadable"));
  const granted = { ...denied, workspace: { ...plugin, permissions: ["knowledge:read", "workspace:read"] } };
  const files = await f.knowledge.glob(granted, { pattern: "README.md" });
  assert.deepEqual(files.files.map(file => file.path), ["README.md"]);
});
