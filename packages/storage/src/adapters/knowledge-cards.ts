import type { DatabaseSync } from "node:sqlite";
import type { ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import { KNOWLEDGE_RECEIPT_DAYS, KNOWLEDGE_RECEIPT_MAX, type KnowledgeCardMatch, type KnowledgeCardRecord, type KnowledgeCardStorePort, type KnowledgeReadReceipt } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { HomeStoreDeclaration } from "../home-stores.js";
import { clearInExistingHomeSqlite, openBaselineHomeSqlite, type SqliteBaseline } from "../sqlite-baseline.js";
import { normalizeSearchText, relatedQueryPlan, searchQueryPlan, searchTokens } from "./text-search-index.js";

/**
 * Project knowledge's own records (specs/project-knowledge §4.3): one card per piece, with what organizing wrote and what the
 * person edited, how much organizing each project used per day, and who read which piece's original text (receipts, kept 30
 * days). No piece's text is kept here; the card's own words are searchable with the same tokenizing as the system search.
 */
export const KNOWLEDGE_CARDS_STORE = "knowledge";

export const KNOWLEDGE_CARDS_BASELINE: SqliteBaseline = { version: 1, schema: `
CREATE TABLE knowledge_cards (
  card_id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, kind TEXT NOT NULL, object_id TEXT NOT NULL, body TEXT NOT NULL,
  UNIQUE (project_id, kind, object_id)
);
CREATE VIRTUAL TABLE knowledge_cards_fts USING fts5(title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0', prefix='2 3');
CREATE TABLE knowledge_usage (
  project_id TEXT NOT NULL, day TEXT NOT NULL, pieces INTEGER NOT NULL, chars INTEGER NOT NULL, extra_pieces INTEGER NOT NULL, extra_chars INTEGER NOT NULL,
  PRIMARY KEY (project_id, day)
);
CREATE TABLE knowledge_receipts (
  receipt_id INTEGER PRIMARY KEY, project_id TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL, object_id TEXT NOT NULL, body TEXT NOT NULL
);
CREATE INDEX knowledge_receipts_project ON knowledge_receipts (project_id, receipt_id);
CREATE INDEX knowledge_receipts_subject ON knowledge_receipts (project_id, kind, object_id, receipt_id);
` };

type Row = Record<string, unknown>;
const cardText = (record: KnowledgeCardRecord) => [record.brief, record.keywords.join(" "), ...record.outline.map(note => `${note.title} ${note.summary}`)].join("\n");

export function openKnowledgeCards(options: { homeDirectory: string }): KnowledgeCardStorePort {
  const db = openBaselineHomeSqlite(options.homeDirectory, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE);
  db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;");
  const transaction = <T>(run: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const value = run(); db.exec("COMMIT"); return value; } catch (error) { db.exec("ROLLBACK"); throw error; }
  };
  const idOf = (projectId: string, subject: ActionSubject) =>
    (db.prepare("SELECT card_id FROM knowledge_cards WHERE project_id = ? AND kind = ? AND object_id = ?").get(projectId, subject.kind, subject.id) as Row | undefined)?.card_id;
  const drop = (cardId: unknown) => { db.prepare("DELETE FROM knowledge_cards_fts WHERE rowid = ?").run(Number(cardId)); db.prepare("DELETE FROM knowledge_cards WHERE card_id = ?").run(Number(cardId)); };
  return {
    get: (projectId, subject) => {
      const row = db.prepare("SELECT body FROM knowledge_cards WHERE project_id = ? AND kind = ? AND object_id = ?").get(projectId, subject.kind, subject.id) as Row | undefined;
      return row ? JSON.parse(String(row.body)) as KnowledgeCardRecord : null;
    },
    list: projectId => (db.prepare("SELECT body FROM knowledge_cards WHERE project_id = ? ORDER BY card_id").all(projectId) as Row[]).map(row => JSON.parse(String(row.body)) as KnowledgeCardRecord),
    put: record => transaction(() => {
      const existing = idOf(record.project_id, record.subject);
      const body = JSON.stringify(record);
      let cardId: number;
      if (existing !== undefined) {
        cardId = Number(existing);
        db.prepare("UPDATE knowledge_cards SET body = ? WHERE card_id = ?").run(body, cardId);
        db.prepare("DELETE FROM knowledge_cards_fts WHERE rowid = ?").run(cardId);
      } else {
        cardId = Number(db.prepare("INSERT INTO knowledge_cards (project_id, kind, object_id, body) VALUES (?, ?, ?, ?)").run(record.project_id, record.subject.kind, record.subject.id, body).lastInsertRowid);
      }
      db.prepare("INSERT INTO knowledge_cards_fts (rowid, title, body) VALUES (?, ?, ?)").run(cardId, searchTokens(record.title), searchTokens(cardText(record)));
    }),
    remove: (projectId, subject) => transaction(() => { const existing = idOf(projectId, subject); if (existing !== undefined) drop(existing); }),
    removeProject: projectId => transaction(() => removeProjectCards(db, projectId)),
    search: (projectId, query, limit) => searchCards(db, projectId, query, limit),
    related: (projectId, query, limit) => {
      const plan = relatedQueryPlan(query);
      return plan ? (db.prepare(`SELECT c.kind, c.object_id FROM knowledge_cards_fts JOIN knowledge_cards c ON c.card_id = knowledge_cards_fts.rowid
        WHERE knowledge_cards_fts MATCH ? AND c.project_id = ? ORDER BY bm25(knowledge_cards_fts, 4.0, 1.0) LIMIT ?`).all(plan, projectId, limit) as Row[]).map(row => ({ kind: String(row.kind), id: String(row.object_id) })) : [];
    },
    usage: (projectId, day) => {
      const row = db.prepare("SELECT * FROM knowledge_usage WHERE project_id = ? AND day = ?").get(projectId, day) as Row | undefined;
      return { day, pieces: Number(row?.pieces ?? 0), chars: Number(row?.chars ?? 0), extra_pieces: Number(row?.extra_pieces ?? 0), extra_chars: Number(row?.extra_chars ?? 0) };
    },
    addUsage: (projectId, day, delta) => {
      db.prepare(`INSERT INTO knowledge_usage (project_id, day, pieces, chars, extra_pieces, extra_chars) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, day) DO UPDATE SET pieces = pieces + excluded.pieces, chars = chars + excluded.chars,
        extra_pieces = extra_pieces + excluded.extra_pieces, extra_chars = extra_chars + excluded.extra_chars`)
        .run(projectId, day, delta.pieces ?? 0, delta.chars ?? 0, delta.extra_pieces ?? 0, delta.extra_chars ?? 0);
    },
    addReceipt: receipt => transaction(() => addReceipt(db, receipt)),
    receipts: (projectId, options) => receiptsOf(db, projectId, options),
    close: () => db.close(),
  };
}

/** One receipt, then what the project keeps: the last 30 days, at most `KNOWLEDGE_RECEIPT_MAX`. */
function addReceipt(db: DatabaseSync, receipt: KnowledgeReadReceipt): void {
  db.prepare("INSERT INTO knowledge_receipts (project_id, at, kind, object_id, body) VALUES (?, ?, ?, ?, ?)")
    .run(receipt.project_id, receipt.at, receipt.subject.kind, receipt.subject.id, JSON.stringify(receipt));
  const since = new Date(Date.parse(receipt.at) - KNOWLEDGE_RECEIPT_DAYS * 86_400_000).toISOString();
  db.prepare("DELETE FROM knowledge_receipts WHERE project_id = ? AND at < ?").run(receipt.project_id, since);
  db.prepare(`DELETE FROM knowledge_receipts WHERE project_id = ? AND receipt_id <= (SELECT receipt_id FROM knowledge_receipts WHERE project_id = ?
    ORDER BY receipt_id DESC LIMIT 1 OFFSET ?)`).run(receipt.project_id, receipt.project_id, KNOWLEDGE_RECEIPT_MAX);
}

function receiptsOf(db: DatabaseSync, projectId: string, options: { subject?: ActionSubject; limit: number; offset: number }): { receipts: KnowledgeReadReceipt[]; total: number } {
  const where = options.subject ? "project_id = ? AND kind = ? AND object_id = ?" : "project_id = ?";
  const args = options.subject ? [projectId, options.subject.kind, options.subject.id] : [projectId];
  const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM knowledge_receipts WHERE ${where}`).get(...args) as Row).n);
  const rows = db.prepare(`SELECT body FROM knowledge_receipts WHERE ${where} ORDER BY receipt_id DESC LIMIT ? OFFSET ?`).all(...args, options.limit, options.offset) as Row[];
  return { receipts: rows.map(row => JSON.parse(String(row.body)) as KnowledgeReadReceipt), total };
}

function removeProjectCards(db: DatabaseSync, projectId: string, control?: { assertCurrent(): void }): number {
  const ids = db.prepare("SELECT card_id FROM knowledge_cards WHERE project_id = ?").all(projectId) as Row[];
  for (const row of ids) { control?.assertCurrent(); db.prepare("DELETE FROM knowledge_cards_fts WHERE rowid = ?").run(Number(row.card_id)); }
  control?.assertCurrent();
  db.prepare("DELETE FROM knowledge_cards WHERE project_id = ?").run(projectId);
  control?.assertCurrent();
  db.prepare("DELETE FROM knowledge_usage WHERE project_id = ?").run(projectId);
  control?.assertCurrent();
  db.prepare("DELETE FROM knowledge_receipts WHERE project_id = ?").run(projectId);
  return ids.length;
}

/** Every term must be in the card's own words; pair matches are checked against the text, as the system search does. */
function searchCards(db: DatabaseSync, projectId: string, query: string, limit: number): KnowledgeCardMatch[] {
  const plan = searchQueryPlan(query);
  if (!plan) return [];
  const rows = db.prepare(`SELECT c.body, bm25(knowledge_cards_fts, 4.0, 1.0) AS rank FROM knowledge_cards_fts JOIN knowledge_cards c ON c.card_id = knowledge_cards_fts.rowid
    WHERE knowledge_cards_fts MATCH ? AND c.project_id = ? ORDER BY rank LIMIT 200`).all(plan.expression, projectId) as Row[];
  const found: KnowledgeCardMatch[] = [];
  for (const row of rows) {
    const record = JSON.parse(String(row.body)) as KnowledgeCardRecord;
    const title = normalizeSearchText(record.title).text, rest = normalizeSearchText(cardText(record)).text;
    if (!plan.runs.every(run => title.includes(run) || rest.includes(run))) continue;
    found.push({ subject: record.subject, field: plan.runs.every(run => title.includes(run)) ? "title" : "card" });
    if (found.length >= limit) break;
  }
  return found;
}

/** A deleted project's cards and usage, cleared from the file by whichever process deletes it (nothing to do when there is no store yet). */
export function clearKnowledgeProject(homeDirectory: string, projectId: string, control?: { assertCurrent(): void }): number {
  return clearInExistingHomeSqlite(homeDirectory, KNOWLEDGE_CARDS_STORE, KNOWLEDGE_CARDS_BASELINE, db => removeProjectCards(db, projectId, control), control) ?? 0;
}

/** The knowledge store in the Home's store registry (W4-11). */
export const KNOWLEDGE_CARDS_HOME_STORE: HomeStoreDeclaration = { path: KNOWLEDGE_CARDS_STORE, library: { baseline: KNOWLEDGE_CARDS_BASELINE } };
