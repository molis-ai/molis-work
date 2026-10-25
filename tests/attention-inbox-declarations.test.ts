import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LocalProjectDatabase, createLocalFeedApplication } from "@molis-ai/molis-work-app-local-host";
import type { AttentionInboxDeclarations, AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { PluginLifecycleState, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { recordInstallation } from "./fixtures/plugin-installations.js";

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

test("RAC-717 the Inbox is the unassigned entries and the owned ones whose owner declared that kind; nothing else", () => {
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

test("RAC-718 Feed's Inbox follows the Manifests of the running installations in the project, and names no plugin of its own", () => {
  const data = fixture();
  try {
    const install = (manifest: PluginManifest, state: PluginLifecycleState = "running") => recordInstallation(data.store.db, manifest, state);
    const feed = createLocalFeedApplication(data.store.db);
    const listed = () => idsOf(feed.listInboxEntries(PROJECT));
    const unassigned = data.entry("feed_item", "item-1");
    const goalsRow = data.entry("goal_decision", "goal-1", GOALS_PLUGIN_ID);
    const otherRow = data.entry("goal_decision", "goal-1", "io.molis.work.other");
    const quietRow = data.entry("goal_decision", "goal-1", "io.molis.work.quiet");

    // No installation declares anything yet: only the unassigned entry.
    assert.deepEqual(listed(), idsOf([unassigned]));
    install(goalsManifest);
    assert.deepEqual(listed(), idsOf([unassigned, goalsRow]), "the owner's own declaration opens its own row");
    assert.equal(feed.getInboxEntry(PROJECT, goalsRow.entry_id).entry_id, goalsRow.entry_id);
    // Plugins that declare the same kind without `inbox` stay their own: Goals' declaration is Goals', and a quiet plugin has none.
    install(manifestOf("io.molis.work.quiet", { subjects: ["goal_decision"] }));
    install(manifestOf("io.molis.work.other", { subjects: ["goal_decision", "source_fault"], inbox: ["source_fault"] }));
    assert.deepEqual(listed(), idsOf([unassigned, goalsRow]));
    for (const row of [otherRow, quietRow]) assert.throws(() => feed.getInboxEntry(PROJECT, row.entry_id), { code: "inbox.entry_not_found" });

    // The declaration holds while the installation runs.
    install(goalsManifest, "disabled");
    assert.deepEqual(listed(), idsOf([unassigned]));
    assert.throws(() => feed.getInboxEntry(PROJECT, goalsRow.entry_id), { code: "inbox.entry_not_found" });
    // And an installation whose build is not in the release archive declares nothing the platform can trust.
    const unarchived = manifestOf("io.molis.work.unarchived", { subjects: ["goal_decision"], inbox: ["goal_decision"] });
    recordInstallation(data.store.db, unarchived, "running", { archived: false });
    const stranger = data.entry("goal_decision", "goal-1", unarchived.plugin_id);
    assert.deepEqual(listed(), idsOf([unassigned]));
    assert.throws(() => feed.getInboxEntry(PROJECT, stranger.entry_id), { code: "inbox.entry_not_found" });
  } finally {
    data.close();
  }
});

test("RAC-719 a Manifest's attention.inbox lists some of its attention.subjects, each once", () => {
  const manifest = (attention: unknown) => ({ ...goalsManifest, attention });
  const subjects = ["goal_decision", "source_fault"];
  parsePluginManifest(manifest({ subjects, inbox: ["source_fault"] }));
  parsePluginManifest(manifest({ subjects }));
  for (const inbox of [[], ["feed_item"], ["goal_decision", "goal_decision"], "goal_decision", [1]]) {
    assert.throws(() => parsePluginManifest(manifest({ subjects, inbox })), /attention\.inbox/u, JSON.stringify(inbox));
  }
  assert.throws(() => parsePluginManifest(manifest({ subjects, inbox_all: true })), /attention 不认这些字段/u);
});
