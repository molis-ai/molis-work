import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPluginPlatform, homeStores, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionInboxDeclarations, AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { PluginLifecycleState, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { createInboxPlugin, INBOX_ACTION_PERMISSIONS, inboxActions, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { createPluginRuntimeReleaseArtifact, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { recordInstallation } from "./fixtures/plugin-installations.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-094 S12 (specs/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §6): the person's Inbox is the unassigned entries and
// the owned entries whose owner declared their kind (`attention.inbox` in its Manifest). It is the platform that reads the declaration
// from the installation; Feed names no plugin.

const PROJECT = "inbox-declarations";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-inbox-declarations-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  writeProjectRoot(store.db, PROJECT, new Date().toISOString());
  const attention = new AttentionModule(store.db, { exists: () => true }, { eventSink: () => undefined });
  const entry = (subject_type: AttentionSubjectType, subject_id: string, owner_plugin_id?: string) => attention.commands.create({
    project_id: PROJECT, subject_type, subject_id, reason: subject_type === "feed_item" ? "manual" : subject_type, ...(owner_plugin_id ? { owner_plugin_id } : {}) }).entry;
  return { store, attention, entry, close: () => { store.close(); rmSync(directory, { recursive: true, force: true }); } };
}

const declared = (owners: Record<string, AttentionSubjectType[]>): AttentionInboxDeclarations =>
  new Map(Object.entries(owners).map(([owner, kinds]) => [owner, new Set(kinds)]));
const idsOf = (entries: Array<{ entry_id: string }>) => entries.map(entry => entry.entry_id).sort();

test("RAC-807 the Inbox is the unassigned entries and the owned ones whose owner declared that kind; nothing else", () => {
  const data = fixture();
  try {
    const unassigned = data.entry("feed_item", "item-1");
    const declaredKind = data.entry("goal_decision", "goal-1", "plugin.a");
    const undeclaredKind = data.entry("source_fault", "source-1", "plugin.a");
    const aForeignOwner = data.entry("goal_decision", "goal-1", "plugin.b");
    const everyone = [unassigned, declaredKind, undeclaredKind, aForeignOwner];
    const query = data.attention.query;

    assert.deepEqual(idsOf(query.listInbox(PROJECT, declared({ "plugin.a": ["goal_decision"] }))), idsOf([unassigned, declaredKind]));
    // An owned kind its owner did not declare is not there, for a list and for a direct read alike.
    for (const hidden of [undeclaredKind, aForeignOwner]) {
      assert.throws(() => query.getInbox(PROJECT, hidden.entry_id, declared({ "plugin.a": ["goal_decision"] })), { code: "attention.entry_not_found" });
    }
    assert.equal(query.getInbox(PROJECT, declaredKind.entry_id, declared({ "plugin.a": ["goal_decision"] })).entry_id, declaredKind.entry_id);

    // Declaring a kind opens the declarer's own rows only: plugin.b declaring goal_decision does not bring plugin.a's, nor the reverse.
    assert.deepEqual(idsOf(query.listInbox(PROJECT, declared({ "plugin.b": ["goal_decision"] }))), idsOf([unassigned, aForeignOwner]));
    assert.deepEqual(idsOf(query.listInbox(PROJECT, declared({ "plugin.a": ["goal_decision"], "plugin.b": ["goal_decision"] }))), idsOf([unassigned, declaredKind, aForeignOwner]));
    // A plugin that declared another kind adds none of these.
    assert.deepEqual(idsOf(query.listInbox(PROJECT, declared({ "plugin.c": ["goal_decision", "source_fault"] }))), idsOf([unassigned]));
    // With nothing declared the Inbox is the unassigned entries, and the full list is untouched.
    assert.deepEqual(idsOf(query.listInbox(PROJECT, declared({}))), idsOf([unassigned]));
    assert.deepEqual(idsOf(query.list(PROJECT)), idsOf(everyone));
  } finally {
    data.close();
  }
});

const manifestOf = (pluginId: string, attention: PluginManifest["attention"]): PluginManifest => ({ ...goalsManifest, plugin_id: pluginId, attention }) as PluginManifest;

// RAC-808 runs against the Inbox as it runs: the Inbox plugin started by the Plugin Runtime, reading the platform's projection
// (`services.attention.listInbox`/`getInbox`) of the installations recorded in the project. Each read asks the installations again, so an
// owner stopped after the call was admitted, and even while a status change waited for its last check, has its rows gone from that read.
async function runtimeInbox(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-runtime-inbox-"));
  const store = new LocalProjectDatabase(join(directory, "project.db"));
  writeProjectRoot(store.db, PROJECT, new Date().toISOString());
  const actions = pluginActions(store, PROJECT);
  const ports = { db: store.db, appendEvent: (event: Parameters<LocalProjectDatabase["appendEvent"]>[0]) => store.appendEvent(event), eventCursor: (projectId: string) => store.eventCursor(projectId) };
  const running = createPluginPlatform({ actions, project_id: PROJECT, actor_id: "tester", db: store.db, journal: store,
    artifacts: new ArtifactsModule(ports), processItems: new ProcessItemsModule(ports), ui: new UiHost(), privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }),
    home: { directory, completeText: () => null, stores: homeStoreRegistry(homeStores().stores) } });
  t.after(async () => {
    try {
      await running.closeCoordination();
      for (const instance of running.runtime.list()) if (instance.state === "running") await running.runtime.stop(instance.install_id);
    } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
  });
  const started = await running.start([{ definition: createInboxPlugin(), trust: { level: "host" as const } }]);
  assert.deepEqual([...started.running], [inboxManifest.plugin_id], JSON.stringify(started));
  const attention = new AttentionModule(store.db, { exists: () => true }, { eventSink: () => undefined });
  const entry = (subject_type: AttentionSubjectType, subject_id: string, owner_plugin_id?: string) => attention.commands.create({
    project_id: PROJECT, subject_type, subject_id, reason: subject_type === "feed_item" ? "manual" : subject_type, ...(owner_plugin_id ? { owner_plugin_id } : {}) }).entry;
  /** A person's call; `atCheck` runs at each time the platform asks whether the call still stands, with how many times it has asked. */
  const caller = (atCheck: (asked: number) => void = () => {}): ActionCallContext => {
    let asked = 0;
    return { actor_id: "owner", project_id: PROJECT, audience: "user", permissions: [...INBOX_ACTION_PERMISSIONS], assert_authority_current: () => atCheck(++asked) };
  };
  const listed = async (who = caller()) => idsOf((await actions.client.invoke(who, inboxActions.list, {}) as { entries: Array<{ entry_id: string }> }).entries);
  const setStatus = (who: ActionCallContext, entryId: string, status: "done" | "open") =>
    actions.client.invoke(who, inboxActions.setStatus, { entry_id: entryId, status, expected_revision: attention.query.get(PROJECT, entryId).revision });
  return { store, attention, entry, caller, listed, setStatus, install: (manifest: PluginManifest, state: PluginLifecycleState = "running") => recordInstallation(store.db, manifest, state) };
}

test("RAC-808 the Runtime Inbox follows the Manifests of the running installations in the project, and names no plugin of its own", async t => {
  const inbox = await runtimeInbox(t);
  const unassigned = inbox.entry("feed_item", "item-1");
  const goalsRow = inbox.entry("goal_decision", "goal-1", GOALS_PLUGIN_ID);
  const otherRow = inbox.entry("goal_decision", "goal-1", "io.molis.work.other");
  const quietRow = inbox.entry("goal_decision", "goal-1", "io.molis.work.quiet");
  const hidden = async (row: { entry_id: string }) => {
    const before = inbox.attention.query.get(PROJECT, row.entry_id);
    await assert.rejects(inbox.setStatus(inbox.caller(), row.entry_id, "done"), { code: "inbox.entry_not_found" });
    assert.deepEqual(inbox.attention.query.get(PROJECT, row.entry_id), before, "a row the Inbox does not show is not changed through it");
  };

  // No installation declares anything yet (the Inbox itself declares no kind of another's): only the unassigned entry.
  assert.deepEqual(await inbox.listed(), idsOf([unassigned]));
  inbox.install(goalsManifest);
  assert.deepEqual(await inbox.listed(), idsOf([unassigned, goalsRow]), "the owner's own declaration opens its own row");
  // Plugins that declare the same kind without `inbox` stay their own: Goals' declaration is Goals', and a quiet plugin has none.
  inbox.install(manifestOf("io.molis.work.quiet", { subjects: ["goal_decision"] }));
  inbox.install(manifestOf("io.molis.work.other", { subjects: ["goal_decision", "source_fault"], inbox: ["source_fault"] }));
  assert.deepEqual(await inbox.listed(), idsOf([unassigned, goalsRow]));
  for (const row of [otherRow, quietRow]) await hidden(row);

  // The declaration holds while the installation runs.
  inbox.install(goalsManifest, "disabled");
  assert.deepEqual(await inbox.listed(), idsOf([unassigned]));
  await hidden(goalsRow);
  // An installation whose build is not in the release archive declares nothing the platform can trust, nor one whose archived build is another.
  const unarchived = manifestOf("io.molis.work.unarchived", { subjects: ["goal_decision"], inbox: ["goal_decision"] });
  recordInstallation(inbox.store.db, unarchived, "running", { archived: false });
  const stranger = inbox.entry("goal_decision", "goal-1", unarchived.plugin_id);
  const swapped = manifestOf("io.molis.work.swapped", { subjects: ["goal_decision"] });
  inbox.install(swapped);
  new SqlitePluginRuntimeReleaseArtifactRepository(inbox.store.db).save(createPluginRuntimeReleaseArtifact(
    { ...swapped, name: "Another build", attention: { subjects: ["goal_decision"], inbox: ["goal_decision"] } } as PluginManifest, "export default {};"));
  const swappedRow = inbox.entry("goal_decision", "goal-1", swapped.plugin_id);
  assert.deepEqual(await inbox.listed(), idsOf([unassigned]));
  for (const row of [stranger, swappedRow]) await hidden(row);
});

test("RAC-808 an owner stopped after the Runtime Inbox admitted a call is gone from what that call reads or changes", async t => {
  const inbox = await runtimeInbox(t);
  const unassigned = inbox.entry("feed_item", "item-1"), goalsRow = inbox.entry("goal_decision", "goal-1", GOALS_PLUGIN_ID);
  inbox.install(goalsManifest);
  // At every point a list asks whether the call still stands, Goals stops then: the list that follows does not show its row.
  let probe = 0;
  await inbox.listed(inbox.caller(asked => { probe = asked; }));
  assert.ok(probe >= 1, "a list asks its caller at least once");
  for (let at = 1; at <= probe; at += 1) {
    inbox.install(goalsManifest);
    assert.deepEqual(await inbox.listed(inbox.caller(asked => { if (asked === at) inbox.install(goalsManifest, "disabled"); })), idsOf([unassigned]), `stopped at check ${at}`);
  }
  // A status change admitted while Goals ran, with Goals stopped at any of its later checks, changes nothing: the entry is read again in the
  // write that would change it. A stop inside that write's own transaction would be part of it, so it is passed over.
  inbox.install(goalsManifest);
  let checks = 0;
  await inbox.setStatus(inbox.caller(asked => { checks = asked; }), goalsRow.entry_id, "done");
  await inbox.setStatus(inbox.caller(), goalsRow.entry_id, "open");
  assert.ok(checks >= 2, "a status change asks its caller before it reads and before it writes: " + checks);
  let refused = 0;
  for (let at = 1; at <= checks; at += 1) {
    inbox.install(goalsManifest);
    const before = inbox.attention.query.get(PROJECT, goalsRow.entry_id);
    let stopped = false;
    const outcome = await inbox.setStatus(inbox.caller(asked => {
      if (asked !== at || inbox.store.db.inTransaction) return;
      inbox.install(goalsManifest, "disabled"); stopped = true;
    }), goalsRow.entry_id, "done").then(() => null, (error: unknown) => error);
    if (!stopped) continue;
    assert.ok(outcome, `a stop at check ${at} refuses the change`);
    assert.equal((outcome as { code?: string }).code, "inbox.entry_not_found");
    assert.deepEqual(inbox.attention.query.get(PROJECT, goalsRow.entry_id), before, `nothing changed after a stop at check ${at}`);
    refused += 1;
  }
  assert.ok(refused >= 2, `stops before the read and after the last wait were both reached (${refused})`);
});

test("RAC-809 a Manifest's attention.inbox lists some of its attention.subjects, each once", () => {
  const manifest = (attention: unknown) => ({ ...goalsManifest, attention });
  const subjects = ["goal_decision", "source_fault"];
  parsePluginManifest(manifest({ subjects, inbox: ["source_fault"] }));
  parsePluginManifest(manifest({ subjects }));
  for (const inbox of [[], ["feed_item"], ["goal_decision", "goal_decision"], "goal_decision", [1]]) {
    assert.throws(() => parsePluginManifest(manifest({ subjects, inbox })), /attention\.inbox/u, JSON.stringify(inbox));
  }
  assert.throws(() => parsePluginManifest(manifest({ subjects, inbox_all: true })), /attention 不认这些字段/u);
});
