import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { bindSearchEntriesHandler, defineSearchEntriesAction, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { knowledgeManageActions, KNOWLEDGE_MANAGE_PERMISSION, KNOWLEDGE_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/knowledge";
import { defineSubjectRetentionAction } from "@molis-ai/molis-work-plugin-sdk";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";

async function fixture(t: TestContext) {
  const home = await mkdtemp(join(tmpdir(), "knowledge-unbound-host-"));
  const project = await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Notes", actor_id: "person" }));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const cards = openKnowledgeCards({ homeDirectory: home });
  t.after(async () => { await host.close(); cards.close(); await rm(home, { recursive: true, force: true }); });
  await host.withProject(reference, () => undefined);
  const entries = defineSearchEntriesAction("fixture.notes.entries", [{ kind: "note", title: "Notes", surface: "goals" }], "Notes", []);
  let values = [{ id: "update", title: "Original title" }, { id: "remove", title: "Keep this card" }];
  host.actionRegistry(reference).registerProvider({ provider: { provider_id: "fixture-notes", title: "Notes", kind: "system" }, definitions: [entries],
    handlers: [bindSearchEntriesHandler(entries, () => values.map(value => ({ subject: { kind: "note", id: value.id }, title: value.title,
      summary: value.title, revision: value.title, content: "summary" as const, updated_at: null, open: null })))] });
  const caller: ActionCallContext = { actor_id: "person", project_id: reference.project_id, audience: "user", permissions: ["search:read", "knowledge:read", KNOWLEDGE_MANAGE_PERMISSION] };
  const client = host.actionClient(reference);
  const read = () => client.invoke(caller, { capability_id: knowledgeManageActions.cards.capability_id, version: knowledgeManageActions.cards.version, provider_id: KNOWLEDGE_PROVIDER_ID }, {});
  const rebuild = async () => { assert.ok(host.search); await host.search.service.rebuild({ client, caller }, {}); };
  await rebuild(); await read();
  const before = cards.list(reference.project_id).filter(card => card.provider_id === "fixture-notes");
  assert.equal(before.length, 2);
  values = [{ id: "update", title: "New owner revision" }, { id: "create", title: "New source" }];
  await rebuild();
  return { host, reference, cards, read, before };
}

test("Real Host keeps unbound create/update/remove when a protocol exists outside the owner's allowed actions", async t => {
  const f = await fixture(t), action = defineSubjectRetentionAction("fixture.notes.retention", "note", "Notes", ["fixture:ungranted"]);
  let invoked = 0;
  f.host.actionRegistry(f.reference).registerProvider({ provider: { provider_id: "fixture-notes", title: "Notes", kind: "system" }, definitions: [action],
    handlers: [{ ...action, handle: () => { invoked += 1; throw new Error("must not invoke an unbound protocol"); } }] });
  const inspect = f.host.inspectActionMetadata.bind(f.host);
  let metadataReads = 0;
  f.host.inspectActionMetadata = (caller, reference) => {
    metadataReads += 1;
    assert.equal(caller.allowed_actions?.some(reference => reference.capability_id === action.capability_id), false);
    return inspect(caller, reference);
  };
  await f.read();
  assert.ok(metadataReads >= 3, "all unbound create, update and removal decisions inspect the live declarations");
  assert.deepEqual(f.cards.list(f.reference.project_id).filter(card => card.provider_id === "fixture-notes"), f.before);
  assert.equal(invoked, 0);
});

test("Real Host metadata failures keep ordinary cards instead of interpreting the failed check as no protocol", async t => {
  const f = await fixture(t);
  f.host.inspectActionMetadata = () => { throw new Error("metadata failed"); };
  await f.read();
  assert.deepEqual(f.cards.list(f.reference.project_id).filter(card => card.provider_id === "fixture-notes"), f.before);
});

test("Real Host refuses unbound writes once the current project's runtime is closing", async t => {
  const f = await fixture(t), inspect = f.host.inspectActions.bind(f.host);
  let closing: Promise<boolean> | undefined;
  f.host.inspectActions = async (caller, reference) => {
    const result = await inspect(caller, reference);
    if (!closing) setImmediate(() => { closing ??= f.host.closeProject(f.reference); });
    return result;
  };
  const read = f.read();
  await read.catch(error => {
    assert.match(String((error as { code?: string }).code), /^(host\.project_closing|actions\.scope_mismatch)$/);
  });
  assert.ok(closing, "the original project began closing during the prepared pass");
  await closing;
  assert.deepEqual(f.cards.list(f.reference.project_id).filter(card => card.provider_id === "fixture-notes"), f.before);
});
