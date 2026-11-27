import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPluginPlatform, homeStores, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AttentionWaitingDeclarations, AttentionSubjectType } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { PluginLifecycleState, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import {
  AttentionModule,
  assertAttentionEntryShape,
  attentionContentReplicationDefinition,
} from "@molis-ai/molis-work-module-attention-resumption";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { writeProjectRoot } from "@molis-ai/molis-work-module-projects";
import { providerItemOf } from "@molis-ai/molis-work-plugin-feed";
import { GOALS_PLUGIN_ID, goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { createInboxPlugin, INBOX_ACTION_PERMISSIONS, inboxActions, inboxManifest } from "@molis-ai/molis-work-plugin-inbox";
import { createPluginRuntimeReleaseArtifact, SqlitePluginRuntimeReleaseArtifactRepository } from "@molis-ai/molis-work-plugin-runtime";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { assertPortableConfig, homeStoreRegistry } from "@molis-ai/molis-work-storage";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { recordInstallation } from "./fixtures/plugin-installations.js";
import { pluginActions } from "./fixtures/plugin-actions.js";

// PG-094 S12 (specs/archive/repository-anti-corruption/slices/goals-s10-s11-runtime-switch.md §6): the person's Inbox is the unassigned entries and
// the owned entries whose owner declared their kind (`attention.waiting` in its Manifest). It is the platform that reads the declaration
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

const declared = (owners: Record<string, AttentionSubjectType[]>): AttentionWaitingDeclarations =>
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

    assert.deepEqual(idsOf(query.listWaiting(PROJECT, declared({ "plugin.a": ["goal_decision"] }))), idsOf([unassigned, declaredKind]));
    // An owned kind its owner did not declare is not there, for a list and for a direct read alike.
    for (const hidden of [undeclaredKind, aForeignOwner]) {
      assert.throws(() => query.getWaiting(PROJECT, hidden.entry_id, declared({ "plugin.a": ["goal_decision"] })), { code: "attention.entry_not_found" });
    }
    assert.equal(query.getWaiting(PROJECT, declaredKind.entry_id, declared({ "plugin.a": ["goal_decision"] })).entry_id, declaredKind.entry_id);

    // Declaring a kind opens the declarer's own rows only: plugin.b declaring goal_decision does not bring plugin.a's, nor the reverse.
    assert.deepEqual(idsOf(query.listWaiting(PROJECT, declared({ "plugin.b": ["goal_decision"] }))), idsOf([unassigned, aForeignOwner]));
    assert.deepEqual(idsOf(query.listWaiting(PROJECT, declared({ "plugin.a": ["goal_decision"], "plugin.b": ["goal_decision"] }))), idsOf([unassigned, declaredKind, aForeignOwner]));
    // A plugin that declared another kind adds none of these.
    assert.deepEqual(idsOf(query.listWaiting(PROJECT, declared({ "plugin.c": ["goal_decision", "source_fault"] }))), idsOf([unassigned]));
    // With nothing declared the Inbox is the unassigned entries, and the full list is untouched.
    assert.deepEqual(idsOf(query.listWaiting(PROJECT, declared({}))), idsOf([unassigned]));
    assert.deepEqual(idsOf(query.list(PROJECT)), idsOf(everyone));
  } finally {
    data.close();
  }
});

/** A type in the owner's own words (batch 44 C8): the kind of object it refers to and the reason it gives. */
const declaredSubject = (type: string) => ({ type, object_kind: type === "goal_decision" ? "goal" : "source", reasons: [{ id: type }] });
const manifestOf = (pluginId: string, attention: { subjects: readonly string[]; waiting?: readonly string[] }): PluginManifest =>
  ({ ...goalsManifest, plugin_id: pluginId, attention: { ...attention, subjects: attention.subjects.map(declaredSubject) } }) as PluginManifest;

// RAC-808 runs against the Inbox as it runs: the Inbox plugin started by the Plugin Runtime, reading the platform's projection
// (`services.attention.listWaiting`/`getWaiting`) of the installations recorded in the project. Each read asks the installations again, so an
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
  // Plugins that declare the same kind without `waiting` stay their own: Goals' declaration is Goals', and a quiet plugin has none.
  inbox.install(manifestOf("io.molis.work.quiet", { subjects: ["goal_decision"] }));
  inbox.install(manifestOf("io.molis.work.other", { subjects: ["goal_decision", "source_fault"], waiting: ["source_fault"] }));
  assert.deepEqual(await inbox.listed(), idsOf([unassigned, goalsRow]));
  for (const row of [otherRow, quietRow]) await hidden(row);

  // The declaration holds while the installation runs.
  inbox.install(goalsManifest, "disabled");
  assert.deepEqual(await inbox.listed(), idsOf([unassigned]));
  await hidden(goalsRow);
  // An installation whose build is not in the release archive declares nothing the platform can trust, nor one whose archived build is another.
  const unarchived = manifestOf("io.molis.work.unarchived", { subjects: ["goal_decision"], waiting: ["goal_decision"] });
  recordInstallation(inbox.store.db, unarchived, "running", { archived: false });
  const stranger = inbox.entry("goal_decision", "goal-1", unarchived.plugin_id);
  const swapped = manifestOf("io.molis.work.swapped", { subjects: ["goal_decision"] });
  inbox.install(swapped);
  new SqlitePluginRuntimeReleaseArtifactRepository(inbox.store.db).save(createPluginRuntimeReleaseArtifact(
    { ...swapped, name: "Another build", attention: { subjects: [declaredSubject("goal_decision")], waiting: ["goal_decision"] } } as PluginManifest, "export default {};"));
  const swappedRow = inbox.entry("goal_decision", "goal-1", swapped.plugin_id);
  assert.deepEqual(await inbox.listed(), idsOf([unassigned]));
  for (const row of [stranger, swappedRow]) await hidden(row);
});

test("RAC-808 an owner stopped after the Runtime Inbox admitted a call is gone from what that call reads or changes", async t => {
  const inbox = await runtimeInbox(t);
  const unassigned = inbox.entry("feed_item", "item-1"), goalsRow = inbox.entry("goal_decision", "goal-1", GOALS_PLUGIN_ID);
  inbox.install(goalsManifest);
  // At every point a list asks whether the call still stands before its entries are read, Goals stops then: the list that follows does
  // not show its row. The last such point is the platform's read gate (`plugin-attention-service`); the checks after it are the
  // delivery checks of a list already read, and a stop there cannot reach back into it, so they do not count (user 2026-11-12).
  let probe = 0, lastRead = 0;
  await inbox.listed(inbox.caller(asked => { probe = asked; if ((new Error().stack ?? "").includes("plugin-attention-service.")) lastRead = asked; }));
  assert.ok(lastRead >= 1 && probe >= lastRead, `a list asks its caller at least once before it reads (${lastRead} of ${probe})`);
  for (let at = 1; at <= lastRead; at += 1) {
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

test("RAC-809 a Manifest's attention.waiting lists some of its attention.subjects, each once", () => {
  const manifest = (attention: unknown) => ({ ...goalsManifest, attention });
  const subjects = ["goal_decision", "source_fault"].map(declaredSubject);
  parsePluginManifest(manifest({ subjects, waiting: ["source_fault"] }));
  parsePluginManifest(manifest({ subjects }));
  for (const inbox of [[], ["feed_item"], ["goal_decision", "goal_decision"], "goal_decision", [1]]) {
    assert.throws(() => parsePluginManifest(manifest({ subjects, waiting: inbox })), /attention\.waiting/u, JSON.stringify(inbox));
  }
  assert.throws(() => parsePluginManifest(manifest({ subjects, inbox_all: true })), /attention 不认这些字段/u);
});

test("P0-08 local Attention writes and personal sync replication share one validator for all Feed/Gmail structured details", () => {
  const data = fixture();
  try {
    const gmailItem = providerItemOf({
      externalId: "gmail-msg-1",
      title: "Important mail",
      summary: "Summary",
      attention: {
        reason: "source_rule",
        detail: {
          rule: "gmail_attention_v1",
          matched_by: ["starred", "important", "direct_recipient"],
          system_labels: ["STARRED", "IMPORTANT", "CATEGORY_PRIMARY"],
          body: "must be stripped by connector intake",
          title: "must be stripped too",
        },
      },
    });
    assert.deepEqual(gmailItem.attention, {
      reason: "source_rule",
      detail: {
        rule: "gmail_attention_v1",
        matched_by: ["starred", "important", "direct_recipient"],
        system_labels: ["STARRED", "IMPORTANT", "CATEGORY_PRIMARY"],
      },
    });

    const cases: Array<{ subject_type: AttentionSubjectType; subject_id: string; reason: string; detail: Record<string, unknown> }> = [
      { subject_type: "feed_item", subject_id: "item-manual", reason: "manual", detail: { added_by: "web_user" } },
      { subject_type: "feed_item", subject_id: "item-rule", reason: "source_rule", detail: { rule_id: "rule-1", rule_name: "重要追踪" } },
      {
        subject_type: "feed_item",
        subject_id: "item-judgment",
        reason: "source_rule",
        detail: {
          rule_id: "rule-2",
          rule_name: "评审",
          judgment_id: "jdg-1",
          function_key: "triage",
          function_version: 2,
          needs_review: true,
        },
      },
      {
        subject_type: "feed_item",
        subject_id: "item-capture-fail",
        reason: "artifact_out_failed",
        detail: { rule_ids: ["rule-1", "rule-2"], error_codes: ["artifacts.artifact.unavailable"] },
      },
      {
        subject_type: "source_fault",
        subject_id: "src-fault-1",
        reason: "source_fault",
        detail: {
          error_code: "feed.source_connection_changed",
          category: "auth",
          retryable: false,
          user_action: "reconnect",
          detected_at: "2026-11-26T10:00:00.000Z",
        },
      },
      {
        subject_type: "source_fault",
        subject_id: "src-demo-1",
        reason: "source_fault",
        detail: { error_code: "sources.network_timeout", user_action: "retry" },
      },
      {
        subject_type: "feed_item",
        subject_id: "item-notify",
        reason: "source_rule",
        detail: { plugin: "io.molis.work.demo", installation: "inst-1" },
      },
      {
        subject_type: "feed_item",
        subject_id: "item-gmail",
        reason: "source_rule",
        detail: (gmailItem.attention as { detail: Record<string, unknown> }).detail,
      },
      {
        subject_type: "feed_item",
        subject_id: "item-github",
        reason: "source_rule",
        detail: { provider_reason: "review_requested", repository: "molis/molis-work", rule: "github_direct_attention_v1" },
      },
    ];

    for (const item of cases) {
      const created = data.attention.commands.create({
        project_id: PROJECT,
        owner_plugin_id: "io.molis.work.feed",
        subject_type: item.subject_type,
        subject_id: item.subject_id,
        reason: item.reason,
        detail: item.detail,
      });
      assert.equal(created.created, true);
      assert.deepEqual(created.entry.detail, item.detail);
    }

    const entries = data.store.db.prepare("SELECT * FROM attention_entries WHERE project_id = ?").all(PROJECT) as Array<Record<string, string | number | null>>;
    const events = data.store.db.prepare("SELECT * FROM attention_events WHERE project_id = ?").all(PROJECT) as Array<Record<string, string | number | null>>;
    const definition = attentionContentReplicationDefinition(assertPortableConfig);
    assert.doesNotThrow(() => definition.validate({ attention_entries: entries, attention_events: events }, PROJECT));
  } finally {
    data.close();
  }
});

test("P0-08 Attention detail anti-abuse bounds match identically between local write and personal sync validation", () => {
  const data = fixture();
  try {
    const valid = data.attention.commands.create({
      project_id: PROJECT,
      subject_type: "feed_item",
      subject_id: "item-base",
      reason: "manual",
      detail: { added_by: "web_user" },
    }).entry;
    const baseEntries = data.store.db.prepare("SELECT * FROM attention_entries WHERE project_id = ?").all(PROJECT) as Array<Record<string, string | number | null>>;
    const baseEvents = data.store.db.prepare("SELECT * FROM attention_events WHERE project_id = ?").all(PROJECT) as Array<Record<string, string | number | null>>;
    const definition = attentionContentReplicationDefinition(assertPortableConfig);

    const tooManyKeys = Object.fromEntries(Array.from({ length: 33 }, (_, index) => [`k_${index}`, "v"]));
    const oversizedBytes = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`field_${index}`, "x".repeat(450)]));
    const invalidDetails: Array<{ label: string; detail: Record<string, unknown> }> = [
      { label: "top-level forbidden body", detail: { body: "copied" } },
      { label: "nested forbidden summary", detail: { nested: { summary: "leaked" } } },
      { label: "too many keys", detail: tooManyKeys },
      { label: "array too long", detail: { tags: Array.from({ length: 33 }, (_, index) => `tag_${index}`) } },
      { label: "string too long", detail: { note: "a".repeat(501) } },
      { label: "nesting too deep", detail: { a: { b: { c: { d: 1 } } } } },
      { label: "oversized bytes", detail: oversizedBytes },
      { label: "dangerous prototype key", detail: JSON.parse('{"__proto__":{"polluted":true}}') as Record<string, unknown> },
    ];

    for (const [index, candidate] of invalidDetails.entries()) {
      assert.throws(
        () => data.attention.commands.create({
          project_id: PROJECT,
          subject_type: "feed_item",
          subject_id: `bad-${index}`,
          reason: "manual",
          detail: candidate.detail,
        }),
        { code: "attention.invalid_reference" },
        `local write must reject: ${candidate.label}`,
      );
      const mutatedEntries = baseEntries.map((row) => ({ ...row, detail_json: JSON.stringify(candidate.detail) }));
      assert.throws(
        () => definition.validate({ attention_entries: mutatedEntries, attention_events: baseEvents }, PROJECT),
        { code: "attention.invalid_reference" },
        `sync validation must reject: ${candidate.label}`,
      );
    }

    assert.throws(
      () => assertAttentionEntryShape({ ...valid, detail: { count: Number.NaN } }),
      { code: "attention.invalid_reference" },
    );
    const malformedEntries = baseEntries.map((row) => ({ ...row, detail_json: "{not-valid-json" }));
    assert.throws(
      () => definition.validate({ attention_entries: malformedEntries, attention_events: baseEvents }, PROJECT),
      { code: "attention.invalid_reference" },
      "malformed detail_json must fail with attention.invalid_reference rather than raw SyntaxError",
    );
  } finally {
    data.close();
  }
});
