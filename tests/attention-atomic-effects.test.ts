import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { AttentionModule } from "@molis-ai/molis-work-module-attention-resumption";
import { FEED_PLUGIN_ID } from "@molis-ai/molis-work-plugin-feed";
import { DEMO_PROJECT_ID, LocalProjectDatabase, createLocalFeedApplication, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";

test("W2-18-ATTENTION-TX-01 independent Feed admission and multi-entry deletion roll back facts and journal together", () => {
  const directory = mkdtempSync(join(tmpdir(), "attention-atomic-")), path = join(directory, "project.db");
  seedDemoBoard(path);
  const store = new LocalProjectDatabase(path);
  try {
    const feed = createLocalFeedApplication(store.db), at = "2026-10-12T00:00:00.000Z";
    const source = feed.upsertSource({ project_id: DEMO_PROJECT_ID, source_id: "atomic-source", kind: "workflow", definition_id: null,
      sync_kind: "manual", name: "Atomic", description: "", status: "active", enabled: true, origin: "molis_work", config: {},
      schedule: { mode: "manual" }, credential_ref: null, account_label: null, last_sync_at: null, last_outcome: null,
      last_error_code: null, imported_at: at, updated_at: at, item_count: 0, cursor: null });
    const { item } = feed.ingestItem({ source, externalId: "atomic", title: "Atomic item", summary: "", occurredAt: at, attention: false });
    const snapshot = () => ({ entries: store.db.prepare("SELECT * FROM inbox_entries ORDER BY entry_id").all(),
      attention: store.db.prepare("SELECT * FROM attention_events ORDER BY event_id").all(),
      journal: store.db.prepare("SELECT * FROM events ORDER BY seq").all() });
    const before = snapshot();
    store.db.exec("CREATE TRIGGER refuse_attention BEFORE INSERT ON events WHEN NEW.object_type = 'inbox_entry' BEGIN SELECT RAISE(ABORT, 'journal refused'); END;");
    assert.throws(() => feed.addToInbox(DEMO_PROJECT_ID, item.item_id, item.revision), /journal refused/);
    assert.deepEqual(snapshot(), before);
    store.db.exec("DROP TRIGGER refuse_attention");
    feed.addToInbox(DEMO_PROJECT_ID, item.item_id, item.revision);
    feed.addToInbox(DEMO_PROJECT_ID, item.item_id, feed.getFeedItem(DEMO_PROJECT_ID, item.item_id).revision);
    assert.equal(feed.listInboxEntries(DEMO_PROJECT_ID).filter(row => row.subject_id === item.item_id).length, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM attention_events WHERE subject_id = ?").get(item.item_id)?.n, 1);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE object_type = 'inbox_entry'").get()?.n, 1);

    const attention = new AttentionModule(store.db, { exists: (project, type, id) => project === DEMO_PROJECT_ID && type === "feed_item" && id === item.item_id }, {
      eventSink: event => { store.appendEvent({ eventId: randomUUID(), projectId: event.project_id, actorId: "web-user", objectType: "inbox_entry",
        objectId: event.entry_id, type: event.type, reason: event.reason, payload: event.payload, at: event.at }); },
    });
    attention.commands.create({ project_id: DEMO_PROJECT_ID, owner_plugin_id: FEED_PLUGIN_ID, subject_type: "feed_item", subject_id: item.item_id, reason: "source_rule",
      entry_id: "second-entry", at: "2026-01-01T00:00:00.000Z" });
    const two = snapshot();
    // The first deletion's journal write succeeds; rejecting the second must roll both back.
    store.db.exec("CREATE TRIGGER refuse_second BEFORE INSERT ON events WHEN NEW.type = 'inbox_entry.deleted' AND NEW.object_id = 'second-entry' BEGIN SELECT RAISE(ABORT, 'second journal refused'); END;");
    assert.throws(() => attention.commands.deleteSubject(DEMO_PROJECT_ID, "feed_item", item.item_id, FEED_PLUGIN_ID), /second journal refused/);
    assert.deepEqual(snapshot(), two);
    store.db.exec("DROP TRIGGER refuse_second");
    assert.equal(attention.commands.deleteSubject(DEMO_PROJECT_ID, "feed_item", item.item_id, FEED_PLUGIN_ID), 2);
    assert.equal(attention.commands.deleteSubject(DEMO_PROJECT_ID, "feed_item", item.item_id, FEED_PLUGIN_ID), 0);
    assert.deepEqual(attention.query.findForSubject(DEMO_PROJECT_ID, "feed_item", item.item_id, FEED_PLUGIN_ID), []);
    assert.equal(attention.events.list(DEMO_PROJECT_ID).filter(row => row.type === "inbox_entry.deleted").length, 2);
    assert.equal(store.db.prepare("SELECT COUNT(*) AS n FROM events WHERE type = 'inbox_entry.deleted'").get()?.n, 2);
  } finally { store.close(); rmSync(directory, { recursive: true, force: true }); }
});
