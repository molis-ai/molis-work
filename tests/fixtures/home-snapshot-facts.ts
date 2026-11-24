import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { bindDatabaseSpace, ensureStorageSpace } from "@molis-ai/molis-work-storage";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { Blueprint } from "@molis-ai/molis-work-contracts/platform/blueprints";
import { homeStores } from "@molis-ai/molis-work-app-local-host";

interface Seed { table: string; values: Record<string, SQLInputValue>; field: string }
export interface SnapshotFact { file: string; table: string; field: string; key: string; id: SQLInputValue; expected: SQLInputValue }
const at = "2026-10-24T00:00:00.000Z", id = "snapshot-retained", actor = "snapshot-person";

const sceneTitle = { literal: "Weekly project review" };
export const snapshotDraftId = "snapshot-weekly-review";
export const snapshotBlueprint: Blueprint = {
  title: sceneTitle, purpose: { audience: sceneTitle, work: sceneTitle, inputs: sceneTitle, outputs: sceneTitle, first_result: sceneTitle },
  parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key: "projects.runtime", value: "prologue" } },
    { part_id: "notes", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
  steps: [{ step_id: "configure", title: sceneTitle, part_ids: ["engine", "notes"] }],
  example_task: { title: sceneTitle, input: sceneTitle, step_ids: ["configure"], result: { part_id: "notes", location: { literal: "Review notes" } } },
};

/** Real owner tables, not extra probe tables; expected user facts are independent of the snapshot implementation. */
function libraryFacts(project: string): Record<string, Seed> {
  const title = "Retained user fact with Unicode 文本", body = JSON.stringify({ text: title });
  return {
    sync: { table: "sync_stream_cursors", values: { namespace: id, cursor: 7 }, field: "cursor" },
    "plugin-runtime": { table: "plugin_private_values", values: { install_id: id, item_key: "user-note", item_value: body }, field: "item_value" },
    blueprints: { table: "blueprint_drafts", values: { draft_id: snapshotDraftId, actor_id: LOCAL_PERSON_ACTOR_ID, project_id: project,
      revision: 2, locale: "en", blueprint_json: JSON.stringify(snapshotBlueprint) }, field: "blueprint_json" },
    assistant: { table: "assistant_settings", values: { actor_id: actor, key: "display", revision: 4, value: JSON.stringify({ compact: false }) }, field: "value" },
    placement: { table: "placement_titles", values: { kind: "goal", id, title, seen_at: at }, field: "title" },
    "agent-definitions": { table: "prompt_overrides", values: { key: id, revision: 2, base_version: 1, body: title, updated_at: at, actor_id: actor }, field: "body" },
    "agent-declarations": { table: "install_declarations", values: { install_id: id, owner_id: "fixture", registration: JSON.stringify({ instructions: [], agents: [], prompts: [] }), updated_at: at }, field: "registration" },
    connectors: { table: "connector_connections", values: { connection_id: id, service_id: "github", display_name: title, auth_method: "token", credential_ref: "snapshot:api", source: "manual", created_at: at, updated_at: at }, field: "display_name" },
    "context-onboarding": { table: "journeys", values: { id, body, updated_at: at }, field: "body" },
    "plugin-directories": { table: "plugin_directory_grants", values: { grant_id: id, plugin_id: "io.snapshot.fixture", plugin_name: title, install_id: id, project_id: project, actor_id: actor, root: "/snapshot-fixture/granted", device: "1", inode: "2", granted_at: at, read_count: 3 }, field: "root" },
    "plugin-originals": { table: "plugin_original_files", values: { plugin_id: "io.snapshot.fixture", install_id: id, project_id: project, record_key: "original", real_path: "/snapshot-fixture/original.txt", registered_at: at }, field: "real_path" },
    functions: { table: "functions", values: { id, name: title, function_key: "fixture-rule", primitive: "classify", status: "draft", version: 1, model: "fixture", instructions: "Keep this rule", criteria_json: "{}", config_hash: "fixture-content-identity", created_at: at, updated_at: at }, field: "name" },
    characters: { table: "character_drafts", values: { character_id: id, owner_actor_id: actor, revision: 2, updated_at: at, record: body }, field: "record" },
    memory: { table: "memory_candidates", values: { candidate_id: id, actor_id: actor, state: "pending", body }, field: "body" },
    knowledge: { table: "knowledge_cards", values: { card_id: 701, project_id: project, kind: "goal", object_id: id, body }, field: "body" },
    server: { table: "mw_members", values: { id, display_name: title }, field: "display_name" },
    issues: { table: "issues", values: { id, title, type: "bug", description: "Keep the reported detail", context_json: "{}", images_json: "[]", submitter_id: actor, entered_via: "manual", created_at: at, updated_at: at, version: 3 }, field: "description" },
    cognia: { table: "cognia_domains", values: { id, name: title }, field: "name" },
    images: { table: "connections", values: { id, name: title, api_format: "openai", base_url: "https://example.invalid", model: "fixture", created_at: at, updated_at: at }, field: "name" },
    jelly: { table: "jelly_history", values: { command: "user-edit", before_body: "before", after_body: title, before_checksum: "before-id", after_checksum: "after-id" }, field: "after_body" },
    lingguang: { table: "sparks", values: { id, project_id: project, title, body: "A retained idea", source_kind: "manual", status: "active", created_at: at, updated_at: at }, field: "body" },
    todo: { table: "todo_items", values: { id, title, notes: "Keep these notes", status: "todo", placement: "inbox", project_id: project, created_at: at, updated_at: at, revision: 5 }, field: "notes" },
    pages: { table: "pages", values: { id, project_id: project, title, body_json: JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Retained page paragraph" }] }] }), created_at: at, updated_at: at, version: 4 }, field: "body_json" },
    form: { table: "forms", values: { id, title, description: "Kept survey", status: "draft", questions_json: JSON.stringify([{ id: "q", type: "text", title: "Question" }]), created_at: at, updated_at: at, version: 2, project_id: project }, field: "questions_json" },
    dataset: { table: "datasets", values: { id, title, description: "Kept dataset", status: "draft", columns_json: JSON.stringify([{ id: "name", title: "Name", type: "text" }]), rows_json: JSON.stringify([{ name: "Retained row" }]), created_at: at, updated_at: at, version: 3, project_id: project }, field: "rows_json" },
    ppt: { table: "presentations", values: { id, title, description: "Kept deck", color_primary: "#123456", color_background: "#ffffff", color_text: "#111111", slides_json: JSON.stringify([{ id: "slide", title: "Retained slide" }]), created_at: at, updated_at: at, version: 2, project_id: project }, field: "slides_json" },
    "work-brief": { table: "briefs", values: { id, project_id: project, scope: "home", title, created_at: at, updated_at: at }, field: "title" },
    workflows: { table: "workflows", values: { workflow_id: id, project_id: project, title, chain_json: "[]", revision: 3, created_at: at, updated_at: at }, field: "title" },
    "feed-content": { table: "feed_content_holds", values: { content_ref: "molis-work-evidence/sha256/" + "5".repeat(64), project_id: project, source_id: id }, field: "source_id" },
    observation: { table: "records", values: { record_id: id, owner_kind: "plugin", owner_id: "io.snapshot.fixture", fact: "io.snapshot.fixture.saved", outcome: "succeeded", actor_id: actor,
      audience: "plugin", entry: "plugin", project_id: project, occurred_at: at, received_at: at, source_class: "real", subjects: "[]", conditions: "{}", detail: JSON.stringify({ note: title }), evidence: "[]" }, field: "detail" },
    acceptance: { table: "acceptance_subjects", values: { subject_no: 7, project_id: project, provider_id: "plugin:io.snapshot.fixture", subject_kind: "snapshot_item", subject_id: title, created_at: at }, field: "subject_id" },
    evaluation: { table: "evaluation_samples", values: { sample_id: id, version: 1, purpose: "validation", work_mode: "manual_plugin", project_id: project,
      frozen_digest: "snapshot-digest", spec_json: JSON.stringify({ title }), hold_id: null, held_record_count: 0, created_at: at }, field: "spec_json" },
    // A generated project home page saved on the Home (batch 37, horizontal/home).
    "home-pages": { table: "home_page_versions", values: { page_id: id, project_id: project, version: 1, title, entry: "index.html", actions: "[]", files: "[]", author: "person", based_on: null, origin: null, created_at: at }, field: "title" },
    // An item a person named on their mainline (the store keeps names, references and order; batch 36).
    mainline: { table: "mainline_items", values: { item_id: id, owner_actor_id: actor, project_id: project, name: title, created_at: at }, field: "name" },
    // A document a person brought into a conversation, kept with its text by the platform (batch 35, S-conversation-attachments).
    "conversation-attachments": { table: "attachments", values: { plugin_id: "io.snapshot.fixture", install_id: id, project_id: project, sha256: "a".repeat(64), title, kind: "document", media_type: "text/plain", byte_length: 12, text: body, attached_at: at }, field: "text" },
    // The Home's default web search source and its last use (batch 61, §13.7): names and ids only, never a key.
    "web-search": { table: "web_search_last_use", values: { id: 1, source_id: id, title, account_label: null, audience: "user", used_at: at }, field: "title" },
    "external-sessions": { table: "external_sessions", values: { session_key: id, entry_id: "claude-code", location_key: "local", native_id: id, seen_via: "file", title, activity: "idle", last_activity_at: at }, field: "title" },
  };
}

function seed(database: DatabaseSync, file: string, input: Seed): SnapshotFact {
  const columns = Object.keys(input.values);
  database.prepare(`INSERT INTO "${input.table}" (${columns.map(name => '"' + name + '"').join(",")}) VALUES (${columns.map(() => "?").join(",")})`).run(...Object.values(input.values));
  const key = columns[0]!;
  return { file, table: input.table, field: input.field, key, id: input.values[key]!, expected: input.values[input.field]! };
}

export function seedSnapshotLibraries(home: string, project: string): SnapshotFact[] {
  const registry = homeStores(), seeds = libraryFacts(project), facts: SnapshotFact[] = [];
  for (const store of registry.stores) {
    if (!store.library || store.path === "plugin-libraries") continue;
    const input = seeds[store.path];
    assert.ok(input, `A newly registered library needs an actual owner fact, not an empty coverage fixture: ${store.path}`);
    const file = registry.libraryPath(home, store), relative = file.slice(home.length + 1);
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const database = new DatabaseSync(file);
    try {
      if (!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
        database.exec(store.library.baseline.schema); database.exec("PRAGMA user_version = " + store.library.baseline.version);
      }
      assert.equal(Number(database.prepare("PRAGMA user_version").get()?.user_version), store.library.baseline.version);
      if (store.path !== "server") bindDatabaseSpace(database, ensureStorageSpace(home));
      const fact = seed(database, relative, input);
      if (store.path === "sync") assert.equal(store.snapshot.restore, "preserve", "device cursors must stay local");
      else facts.push(fact);
    } finally { database.close(); }
  }
  const libraries = registry.get("plugin-libraries")!;
  const file = registry.libraryPath(home, libraries), schema = "CREATE TABLE notes (id TEXT PRIMARY KEY, text TEXT NOT NULL);";
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const ledger = new DatabaseSync(file);
  try {
    if (!ledger.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
      ledger.exec(libraries.library!.baseline.schema); ledger.exec("PRAGMA user_version = " + libraries.library!.baseline.version);
    }
    bindDatabaseSpace(ledger, ensureStorageSpace(home));
    facts.push(seed(ledger, "plugin-libraries/plugin-libraries.db", { table: "plugin_home_libraries", values: {
      plugin_id: "org.snapshot.extra", publisher_signature: "snapshot-fixture-publisher", store_name: "snapshot-extra", version: 3,
      schema_digest: createHash("sha256").update(schema).digest("hex"), created_at: at,
    }, field: "store_name" }));
  } finally { ledger.close(); }
  mkdirSync(join(home, "snapshot-extra"));
  const extra = new DatabaseSync(join(home, "snapshot-extra", "snapshot-extra.db"));
  try { extra.exec(schema); bindDatabaseSpace(extra, ensureStorageSpace(home)); extra.exec("PRAGMA user_version = 3"); facts.push(seed(extra, "snapshot-extra/snapshot-extra.db", { table: "notes", values: { id, text: "A third-party owner fact" }, field: "text" })); }
  finally { extra.close(); }
  return facts;
}

export function assertSnapshotFact(file: string, fact: SnapshotFact): void {
  const database = new DatabaseSync(file, { readOnly: true });
  try {
    const row = database.prepare(`SELECT "${fact.field}" AS value FROM "${fact.table}" WHERE "${fact.key}" = ?`).get(fact.id);
    assert.ok(row, `${fact.file} retained the owner's row`);
    assert.equal(row.value, fact.expected, fact.file + " retained the user's fact");
  } finally { database.close(); }
}
