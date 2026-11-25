import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { extractActionDelegation, inspectActionDeclarations, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { actionDelegationMatches } from "@molis-ai/molis-work-service-agent-host";
import type { AgentActionDelegationScope } from "@molis-ai/molis-work-contracts/services/agent-host";
import { createPagesActionHandlers, ownPagesStores, pagesActions, pagesManifest, PagesStore, PAGES_DATABASE, PAGES_ACTIONS, PAGES_ACTION_PERMISSIONS, PAGES_SUBJECT_KIND, PAGES_FOLDER_KIND, type PagesSql } from "@molis-ai/molis-work-plugin-pages";
import { goalsDeliverableActions, goalsArtifactInputActions } from "@molis-ai/molis-work-plugin-goals";
import { openTestHome } from "./fixtures/test-home.js";

const body = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const caller: ActionCallContext = { actor_id: "owner", audience: "user", project_id: "a", permissions: PAGES_ACTION_PERMISSIONS };
function fixture() {
  const db = new DatabaseSync(":memory:"); db.exec(PAGES_DATABASE.schema);
  const reads: string[] = [];
  const sql: PagesSql = { get: (text, args = []) => { reads.push(text); return db.prepare(text).get(...args); },
    all: (text, args = []) => { reads.push(text); return db.prepare(text).all(...args); }, run: (text, args = []) => db.prepare(text).run(...args) };
  const store = new PagesStore(sql, "a", new Map(), run => {
    if (db.isTransaction) return run();
    db.exec("BEGIN IMMEDIATE");
    try { const result = run(); db.exec("COMMIT"); return result; } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
  const service = new ActionService();
  const dispose = service.registerProvider({ provider: { provider_id: pagesManifest.plugin_id, title: "Pages", kind: "plugin", project_id: "a" },
    definitions: PAGES_ACTIONS, handlers: createPagesActionHandlers({ ...ownPagesStores(run => run(store)),
      modelAvailability: () => ({ available: false, code: "actions.connection_required", reason: "fixture" }), prepareImport: async () => { throw new Error("unused"); } }) });
  return { store, reads, service, bound: bindActionClient(service, () => caller),
    close() { dispose(); store.close(); db.close(); } };
}

async function publicationFixture(t: TestContext) {
  const f = await openTestHome(t), project = await f.createProject("Delegated publication", ["pages"]);
  const person = await f.host.localPersonContext(project.reference);
  const bound = bindActionClient(f.host.actionClient(project.reference), () => person);
  const artifacts = (id: string) => f.host.withProject(project.reference, runtime => runtime.artifacts.query.listArtifactVersions(project.project_id, "pages-" + id));
  return { bound, artifacts };
}

test("APR-07/08: Pages declares real effects; a content grant cannot acquire move, association, publication or deletion", () => {
  assert.deepEqual(inspectActionDeclarations(PAGES_ACTIONS, undefined), []);
  parsePluginManifest(pagesManifest);
  const effects = (input: unknown) => extractActionDelegation(pagesActions.update.action, input);
  assert.deepEqual(effects({ id: "doc", markdown: "First", starred: false, expected_version: 1 }), { state: "resolved", operations: [{ key: "edit", targets: { document: "doc" } }] });
  assert.deepEqual(effects({ id: "doc", markdown: "Second", folder_id: "", goal_id: "", expected_version: 2 }), { state: "resolved", operations: [
    { key: "edit", targets: { document: "doc" } }, { key: "move", targets: { document: "doc", folder: "" } }, { key: "associate", targets: { document: "doc", goal: "" } },
  ] });
  const reference = { provider_id: pagesManifest.plugin_id, capability_id: "pages.update", version: 1 };
  const owner = { provider_id: pagesManifest.plugin_id, installation_generation: "install-1", kind: PAGES_SUBJECT_KIND };
  const scope: AgentActionDelegationScope = { kind: "action-objects", action: reference, declaration_digest: "decl-1", provider_installation_generation: "install-1",
    operations: [{ key: "edit", targets: { document: { owner, ids: ["doc"] } } }] };
  const matches = (input: unknown) => {
    const extracted = effects(input); assert.equal(extracted.state, "resolved");
    if (extracted.state !== "resolved") throw new Error("unresolved fixture");
    return actionDelegationMatches(scope, { kind: "action-objects", action: reference, declaration_digest: "decl-1", provider_installation_generation: "install-1", operations: extracted.operations, target_owners: { document: owner, folder: null, goal: null } });
  };
  assert.equal(matches({ id: "doc", markdown: "Another body", expected_version: 9 }), true);
  assert.equal(matches({ id: "doc", markdown: "Changed", folder_id: "" }), false);
  assert.equal(matches({ id: "doc", title: "Changed", goal_id: "" }), false);
  assert.deepEqual(extractActionDelegation(pagesActions.create.action, { title: "New" }), { state: "resolved", operations: [{ key: "create", targets: { folder: "", goal: "" } }] });
  assert.deepEqual(extractActionDelegation(pagesActions.promote.action, { id: "doc" }), { state: "confirmation-required", reason: "target-missing" });
  assert.deepEqual(extractActionDelegation(pagesActions.promote.action, { id: "doc", goal_id: "" }), { state: "resolved", operations: [
    { key: "publish", targets: { document: "doc", goal: "" } }, { key: "associate", targets: { document: "doc", goal: "" } },
  ] });
  for (const definition of [pagesActions.create, pagesActions.update, pagesActions.promote]) {
    for (const goal_id of ["foreign-goal", "  ", null]) assert.deepEqual(extractActionDelegation(definition.action, { ...(definition === pagesActions.create ? { title: "New" } : { id: "doc" }), goal_id }),
      { state: "confirmation-required", reason: "target-unsupported" });
  }
  for (const key of ["delete", "discard"] as const) assert.deepEqual(extractActionDelegation(pagesActions[key].action, { id: "doc", ...(key === "discard" ? { expected_version: 1 } : {}) }),
    { state: "resolved", operations: [{ key, targets: { document: "doc" } }] });
});

test("APR-08: delegation names use strict text references and never supply an omitted target", () => {
  const definition = pagesActions.promote, declaration = definition.action.delegation!;
  assert.notEqual(declaration, "confirmation-only");
  if (declaration === "confirmation-only") throw new Error("finite declaration required");
  for (const word of [{ literal: "Any Goal" }, { key: "pages.delegation.no-goal", owner: "forged" }, "Root", null]) {
    for (const field of ["title_text", "empty_title"]) {
      const invalid = { ...definition, action: { ...definition.action, delegation: { ...declaration,
        targets: declaration.targets.map(target => ({ ...target, [field]: word })) } } };
      assert.ok(inspectActionDeclarations([invalid], undefined).length > 0);
    }
    const invalid = { ...definition, action: { ...definition.action, delegation: { ...declaration,
      operations: declaration.operations.map(operation => ({ ...operation, title_text: word })) } } };
    assert.ok(inspectActionDeclarations([invalid], undefined).length > 0);
  }
  const withEmptyName = { ...definition.action, delegation: { ...declaration,
    targets: declaration.targets.map(target => ({ ...target, empty_title: { key: "pages.delegation.no-goal", fallback: "不关联 Goal" } })) } };
  assert.deepEqual(extractActionDelegation(withEmptyName, { id: "doc" }), { state: "confirmation-required", reason: "target-missing" });
});

test("APR-07/08: indirect publication and historical restoration require confirmation without disabling manual actions", async t => {
  const f = await publicationFixture(t);
  for (const definition of [pagesActions.artifactPin, pagesActions.revert, goalsDeliverableActions.pin, goalsArtifactInputActions.pin]) {
    assert.deepEqual(inspectActionDeclarations([definition], undefined), []);
    assert.deepEqual(extractActionDelegation(definition.action, {}), { state: "confirmation-required", reason: "confirmation-only" });
    for (const delegation of ["automatic", "", null, { mode: "confirmation-only" }]) {
      assert.ok(inspectActionDeclarations([{ ...definition, action: { ...definition.action, delegation } }], undefined).length > 0);
    }
  }
  assert.deepEqual(extractActionDelegation(pagesActions.get.action, { id: "doc" }), { state: "confirmation-required", reason: "undeclared" });
  const unit = fixture(); t.after(() => unit.close());
  const original = unit.store.create({ title: "Original", goal_id: "original-goal" });
  const after = unit.store.update(original.id, { title: "Later", goal_id: "" });
  const change_id = unit.store.keepChange(original, after);
  const restored = (await unit.bound.invoke(pagesActions.revert, { change_id })).document;
  assert.equal(restored.title, "Original"); assert.equal(restored.goal_id, "original-goal");
  const { document } = await f.bound.invoke(pagesActions.create, { title: "Original", goal_id: "original-goal" });
  const pinned = await f.bound.invoke(pagesActions.artifactPin, { subject_id: document.id });
  assert.equal(pinned.artifact.version, 1);
  assert.equal((await f.artifacts(document.id)).length, 1);
  const stored = (await f.bound.invoke(pagesActions.get, { id: document.id })).document;
  assert.equal(stored.goal_id, "original-goal");
  assert.equal(stored.artifact_version, 1);
});

test("APR-08: Pages presentation reads names once, excludes bodies and other projects, and retains current permissions", async t => {
  const f = fixture(); t.after(() => f.close());
  const documents = Array.from({ length: 25 }, (_, i) => f.store.create({ title: `Draft ${i}`, body: body("Secret body") }));
  const folders = Array.from({ length: 25 }, (_, i) => f.store.createFolder({ title: `Folder ${i}` }));
  const foreign = f.store.create({ title: "Secret foreign title" });
  const subjects = [...documents.map(row => ({ kind: PAGES_SUBJECT_KIND, id: row.id })), ...folders.map(row => ({ kind: PAGES_FOLDER_KIND, id: row.id }))];
  f.reads.length = 0;
  const result = await f.bound.invoke(pagesActions.presentation, { subjects, fields: ["title", "body"] });
  assert.equal(result.items.length, 50); assert.equal(f.reads.length, 1);
  assert.doesNotMatch(f.reads[0]!, /SELECT \*|body_json/); assert.doesNotMatch(JSON.stringify(result), /Secret/);
  assert.deepEqual(result.items.map(item => item.values), [...documents, ...folders].map(row => ({ title: row.title })));
  f.reads.length = 0;
  await assert.rejects(f.bound.invoke(pagesActions.presentation, { subjects: [...subjects, subjects[0]!], fields: ["title"] }), { code: "actions.input_invalid" });
  await assert.rejects(f.service.invoke({ ...caller, permissions: [] }, pagesActions.presentation, { subjects: [subjects[0]!], fields: ["title"] }), { code: "actions.forbidden" });
  await assert.rejects(f.service.invoke({ ...caller, project_id: "b" }, pagesActions.presentation, { subjects: [subjects[0]!], fields: ["title"] }), { code: "actions.scope_mismatch" });
  assert.equal(f.reads.length, 0, "rejected calls do not read the library");
  f.store.update(documents[0]!.id, { title: "New title" }); f.store.delete(documents[1]!.id);
  const current = await f.bound.invoke(pagesActions.presentation, { subjects: [subjects[0]!, subjects[1]!, { kind: PAGES_SUBJECT_KIND, id: foreign.id }, { kind: "alien", id: foreign.id }], fields: ["title"] });
  assert.deepEqual(current.items.map(item => item.state), ["ok", "deleted", "deleted", "forbidden"]);
  assert.deepEqual(current.items[0]!.values, { title: "New title" });
  assert.equal(current.items[0]!.revision, "2"); assert.doesNotMatch(JSON.stringify(current), /Secret/);
});

test("APR-07/08: publication cannot apply a stale association, and a current explicit pin uses the same Goal on both sides", async t => {
  const f = await publicationFixture(t);
  const { document: original } = await f.bound.invoke(pagesActions.create, { title: "Approved", goal_id: "original-goal", body: body("Approved text") });
  const { document: edited } = await f.bound.invoke(pagesActions.update, { id: original.id, goal_id: "other-goal", expected_version: original.version });
  for (const goal_id of ["", undefined, "original-goal"]) {
    await assert.rejects(f.bound.invoke(pagesActions.promote, { id: original.id, ...(goal_id === undefined ? {} : { goal_id }), expected_version: original.version }), { code: "pages.conflict" });
    assert.deepEqual(await f.artifacts(original.id), []);
    assert.deepEqual((await f.bound.invoke(pagesActions.get, { id: original.id })).document, edited);
  }
  const { document: saved, artifact } = await f.bound.invoke(pagesActions.promote, { id: original.id, goal_id: "", expected_version: edited.version });
  assert.equal(artifact.version, 1);
  assert.equal(saved.goal_id, ""); assert.equal(saved.publication_pending, undefined);
  assert.deepEqual((await f.bound.invoke(pagesActions.get, { id: original.id })).document, saved);
  const [version] = await f.artifacts(original.id);
  assert.deepEqual(version?.payload, { title: edited.title, page_id: edited.id, goal_id: "", body: edited.body });
});

test("APR-07/08: actual Pages writes still reject wrong targets, stale versions and undeclared fields without side effects", async t => {
  const f = fixture(); t.after(() => f.close());
  const document = (await f.bound.invoke(pagesActions.create, { title: "Original", markdown: "Original" })).document;
  const foreignFolder = f.store.createFolder({ title: "Private" });
  for (const input of [
    { id: document.id, folder_id: foreignFolder.id }, { id: document.id, folder_id: "removed" },
  ]) await assert.rejects(f.bound.invoke(pagesActions.update, input), { code: "pages.not_found" });
  await assert.rejects(f.service.invoke(caller, pagesActions.update, { id: document.id, markdown: "bad", extra: "not declared" }), { code: "actions.input_invalid" });
  assert.deepEqual(f.store.get(document.id), document);
  const edited = (await f.bound.invoke(pagesActions.update, { id: document.id, markdown: "Later body", expected_version: document.version })).document;
  const persisted = f.store.get(document.id);
  await assert.rejects(f.bound.invoke(pagesActions.update, { id: document.id, markdown: "Must not overwrite", expected_version: document.version }), { code: "pages.conflict" });
  assert.deepEqual(f.store.get(document.id), persisted);
  assert.deepEqual(persisted.body, { type: "doc", content: [{ type: "paragraph", attrs: { note: "" }, content: [{ type: "text", text: "Later body" }] }] });
  assert.equal(persisted.version, edited.version);
});
