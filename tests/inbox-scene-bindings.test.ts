import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { ActionSceneBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { INBOX_PROJECT_DATABASE, InboxSceneBindings, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";

/**
 * FI-6 P3 (specs/repository-anti-corruption/slices/feed-inbox-runtime-plugins.md §1.2.6): the binding of Inbox's next-step scene is Inbox's
 * own row in the project's library, written with the optimistic revision the Functions store used to give it. The end-to-end cases through
 * the scene client are `inbox-action-scenes.test.ts` and `functions-scene-configuration.test.ts`; no offline binding move remains after the clean Home decision.
 */
const SCENE = "inbox.next", PROJECT = "project";

function bindings() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);");
  db.prepare("INSERT INTO project_root (project_id, created_at) VALUES (?, ?)").run(PROJECT, "2026-10-25T00:00:00.000Z");
  db.exec(INBOX_PROJECT_DATABASE.schema);
  return { db, bindings: new InboxSceneBindings({
    get: (statement, ...parameters) => db.prepare(statement).get(...parameters as never[]),
    run: (statement, ...parameters) => db.prepare(statement).run(...parameters as never[]),
  }) };
}
const binding = (over: Partial<ActionSceneBinding> = {}): ActionSceneBinding => ({ binding_id: `${SCENE}:${PROJECT}`, scene_id: SCENE, scene_version: 1, project_id: PROJECT,
  function: { capability_id: "functions.published.one", version: 1, provider_id: "system.functions" }, enabled: true, title: "Inbox 下一步", ...over });

test("RAC-518: Inbox declares the table and the permission it stores with, and nothing else of Functions' store", () => {
  assert.equal(inboxManifest.databases?.project, INBOX_PROJECT_DATABASE);
  assert.deepEqual(inboxManifest.permissions.filter(permission => permission.permission === "storage:private").map(permission => permission.required), [true]);
  const tables = new DatabaseSync(":memory:");
  tables.exec("CREATE TABLE project_root (project_id TEXT PRIMARY KEY, created_at TEXT NOT NULL);");
  tables.exec(INBOX_PROJECT_DATABASE.schema);
  assert.deepEqual((tables.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'project_root' ORDER BY name").all() as Array<{ name: string }>).map(row => row.name), ["inbox_scene_bindings"]);
});

test("RAC-518: a binding is saved, read back with its revision, and replaced only by the revision that was read", () => {
  const { bindings: store } = bindings();
  assert.equal(store.get(PROJECT, SCENE), null);
  const first = store.save(PROJECT, binding(), null);
  assert.deepEqual(store.get(PROJECT, SCENE), first);
  assert.ok(first.revision);
  assert.throws(() => store.save(PROJECT, binding(), null), { code: "inbox.revision_conflict" }, "creating over an existing binding is a conflict");
  const second = store.save(PROJECT, binding({ enabled: false }), first.revision);
  assert.notEqual(second.revision, first.revision);
  assert.equal(store.get(PROJECT, SCENE)?.enabled, false);
  assert.throws(() => store.save(PROJECT, binding({ title: "late" }), first.revision), { code: "inbox.revision_conflict" }, "a revision that was replaced is stale");
  assert.equal(store.get(PROJECT, SCENE)?.title, "Inbox 下一步", "and the refused write changed nothing");
  assert.equal(store.save(PROJECT, binding({ title: "unconditional" })).title, "unconditional", "no expected revision replaces");
});

test("RAC-518: only the fields of a binding are stored, and another project's row is not this project's", () => {
  const { db, bindings: store } = bindings();
  const saved = store.save(PROJECT, { ...binding(), revision: "forged", extra: "dropped" } as ActionSceneBinding);
  assert.notEqual(saved.revision, "forged");
  assert.equal("extra" in (JSON.parse((db.prepare("SELECT action_binding_json AS json FROM inbox_scene_bindings").get() as { json: string }).json) as object), false);
  assert.equal(store.get("other-project", SCENE), null);
});
