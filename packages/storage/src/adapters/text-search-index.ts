import { existsSync, rmSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import type {
  SearchHitField,
  SearchIndexDocument,
  SearchIndexMatch,
  SearchIndexPort,
  SearchIndexQuery,
  SearchIndexSourceRecord,
} from "@molis-ai/molis-work-contracts/services/search";
import { homeSqlitePath, openHomeSqliteDatabase } from "../home-sqlite.js";

/**
 * Local full-text index for the system search (specs/system-search §7). A technical cache: it holds only what a
 * source allowed to persist, can be deleted at any time, and is rebuilt from the owners.
 *
 * FTS5 trigram cannot find two-character queries (预算, Q4), so text is split here: every CJK character alone and as
 * adjacent pairs, other letters and digits as lower-cased words. Candidates are then checked against the original text,
 * which removes pair-matches that are not a real substring and gives the snippet and hit position.
 */
export const TEXT_SEARCH_STORE = "search";
const SCHEMA_VERSION = "2";
const MAX_CANDIDATES = 400;
const SNIPPET_BEFORE = 36;
const SNIPPET_LENGTH = 160;

const CJK = /[぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿가-힯\u{20000}-\u{2fa1f}]/u;
const WORD = /[\p{L}\p{N}]/u;

interface Normalized { text: string; map: number[] }
/** NFKC + lower case, one code point at a time, remembering where each output unit came from. */
export function normalizeSearchText(value: string): Normalized {
  let text = "";
  const map: number[] = [];
  let offset = 0;
  for (const char of value) {
    const folded = char.normalize("NFKC").toLowerCase();
    for (let index = 0; index < folded.length; index += 1) map.push(offset);
    text += folded;
    offset += char.length;
  }
  map.push(offset);
  return { text, map };
}

type Run = { kind: "cjk" | "word"; text: string };
function runs(normalized: string): Run[] {
  const found: Run[] = [];
  let current: Run | null = null;
  for (const char of normalized) {
    const kind = CJK.test(char) ? "cjk" : WORD.test(char) ? "word" : null;
    if (!kind) { current = null; continue; }
    if (current && current.kind === kind) current.text += char;
    else { current = { kind, text: char }; found.push(current); }
  }
  return found;
}

/** The tokens an FTS5 unicode61 column receives, space separated. */
export function searchTokens(value: string): string {
  const tokens: string[] = [];
  for (const run of runs(normalizeSearchText(value).text)) {
    if (run.kind === "word") { tokens.push(run.text); continue; }
    const chars = [...run.text];
    for (const char of chars) tokens.push(char);
    for (let index = 1; index < chars.length; index += 1) tokens.push(chars[index - 1]! + chars[index]!);
  }
  return tokens.join(" ");
}

interface QueryPlan { expression: string; runs: string[] }
/** Every term must match: CJK runs by their characters or pairs, words by prefix. Quoted tokens cannot carry operators. */
export function searchQueryPlan(query: string): QueryPlan | null {
  const clauses: string[] = [];
  const checks: string[] = [];
  for (const run of runs(normalizeSearchText(query).text)) {
    checks.push(run.text);
    if (run.kind === "word") { clauses.push(`"${run.text}"*`); continue; }
    const chars = [...run.text];
    if (chars.length === 1) clauses.push(`"${chars[0]}"`);
    else for (let index = 1; index < chars.length; index += 1) clauses.push(`"${chars[index - 1]}${chars[index]}"`);
  }
  if (!clauses.length) return null;
  return { expression: [...new Set(clauses)].join(" AND "), runs: [...new Set(checks)] };
}

type Row = Record<string, unknown>;
const str = (value: unknown): string => value == null ? "" : String(value);
const nullable = (value: unknown): string | null => value == null ? null : String(value);

function occurrences(field: Normalized, needles: readonly string[]): Array<[number, number]> {
  const found: Array<[number, number]> = [];
  for (const needle of needles) {
    let from = 0;
    for (;;) {
      const at = field.text.indexOf(needle, from);
      if (at < 0) break;
      found.push([field.map[at]!, field.map[at + needle.length]!]);
      from = at + Math.max(1, needle.length);
    }
  }
  return found.sort((a, b) => a[0] - b[0]);
}

function snippetOf(original: string, around: number | null, ranges: Array<[number, number]>): { snippet: string; highlights: Array<[number, number]> } {
  if (!original) return { snippet: "", highlights: [] };
  let start = around === null ? 0 : Math.max(0, around - SNIPPET_BEFORE);
  // Start at a character boundary a reader recognizes when one is close.
  if (start > 0) {
    const boundary = original.slice(start, around ?? start).search(/[\s，。；：、,.;:!?！？]/u);
    if (boundary >= 0 && boundary < 12) start += boundary + 1;
  }
  const end = Math.min(original.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < original.length ? "…" : "";
  const body = original.slice(start, end).replace(/\s+/gu, " ");
  // Whitespace folding keeps length only for single spaces; recompute offsets on the folded text.
  const raw = original.slice(start, end);
  const shift = (offset: number) => prefix.length + raw.slice(0, offset).replace(/\s+/gu, " ").length;
  const highlights = ranges.filter(([a, b]) => a >= start && b <= end).map(([a, b]) => [shift(a - start), shift(b - start)] as [number, number]);
  return { snippet: prefix + body + suffix, highlights };
}

export interface TextSearchIndexOptions { homeDirectory: string }

/** Open (or create) the Home's search index. A missing, corrupt or outdated index is rebuilt empty. */
export function openTextSearchIndex(options: TextSearchIndexOptions): SearchIndexPort {
  const path = homeSqlitePath(options.homeDirectory, TEXT_SEARCH_STORE);
  const open = (): DatabaseSync => {
    const db = openHomeSqliteDatabase(options.homeDirectory, TEXT_SEARCH_STORE);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");
    const check = db.prepare("PRAGMA quick_check").all() as Row[];
    if (!check.every(row => Object.values(row).every(value => value === "ok"))) throw new Error("search index failed integrity check");
    return db;
  };
  let db: DatabaseSync;
  try { db = open(); }
  catch {
    for (const suffix of ["", "-wal", "-shm"]) if (existsSync(path + suffix)) rmSync(path + suffix, { force: true });
    db = open();
  }
  db.exec("CREATE TABLE IF NOT EXISTS search_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const version = (db.prepare("SELECT value FROM search_meta WHERE key = 'schema'").get() as Row | undefined)?.value;
  if (version !== SCHEMA_VERSION) {
    db.exec("DROP TABLE IF EXISTS search_fts; DROP TABLE IF EXISTS search_documents; DROP TABLE IF EXISTS search_sources;");
    db.exec(`
      CREATE TABLE search_sources (
        source_key TEXT PRIMARY KEY, project_id TEXT, provider_id TEXT NOT NULL, capability_id TEXT NOT NULL, version INTEGER NOT NULL,
        plugin_id TEXT NOT NULL, title TEXT NOT NULL, collection_revision TEXT, state TEXT NOT NULL, error TEXT, synced_at INTEGER, checked_at INTEGER
      );
      CREATE TABLE search_documents (
        doc_id INTEGER PRIMARY KEY, source_key TEXT NOT NULL, kind TEXT NOT NULL, object_id TEXT NOT NULL, project_id TEXT,
        revision TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL, updated_at TEXT, open_json TEXT, content_policy TEXT NOT NULL,
        UNIQUE (source_key, kind, object_id)
      );
      CREATE INDEX search_documents_project ON search_documents (project_id);
      CREATE VIRTUAL TABLE search_fts USING fts5(title, body, content='', contentless_delete=1, tokenize='unicode61 remove_diacritics 0', prefix='2 3');
    `);
    db.prepare("INSERT OR REPLACE INTO search_meta (key, value) VALUES ('schema', ?)").run(SCHEMA_VERSION);
  }

  const transaction = <T>(run: () => T): T => {
    db.exec("BEGIN IMMEDIATE");
    try { const value = run(); db.exec("COMMIT"); return value; }
    catch (error) { try { db.exec("ROLLBACK"); } catch { /* already rolled back */ } throw error; }
  };
  const fromSource = (row: Row): SearchIndexSourceRecord => ({ source_key: str(row.source_key), project_id: nullable(row.project_id), provider_id: str(row.provider_id),
    capability_id: str(row.capability_id), version: Number(row.version), plugin_id: str(row.plugin_id), title: str(row.title),
    collection_revision: nullable(row.collection_revision), state: str(row.state) as SearchIndexSourceRecord["state"], error: nullable(row.error),
    synced_at: row.synced_at == null ? null : Number(row.synced_at), checked_at: row.checked_at == null ? null : Number(row.checked_at) });
  const openOf = (value: unknown) => { if (value == null) return null; try { return JSON.parse(String(value)) as SearchIndexDocument["open"]; } catch { return null; } };
  const fromDocument = (row: Row): SearchIndexDocument => ({ source_key: str(row.source_key), kind: str(row.kind), object_id: str(row.object_id), project_id: nullable(row.project_id),
    revision: str(row.revision), title: str(row.title), summary: str(row.summary), content: str(row.content), updated_at: nullable(row.updated_at), open: openOf(row.open_json),
    content_policy: row.content_policy === "context" ? "context" : "summary" });

  const selectDocId = db.prepare("SELECT doc_id FROM search_documents WHERE source_key = ? AND kind = ? AND object_id = ?");
  const insertDocument = db.prepare(`INSERT INTO search_documents (source_key, kind, object_id, project_id, revision, title, summary, content, updated_at, open_json, content_policy)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const updateDocument = db.prepare(`UPDATE search_documents SET project_id = ?, revision = ?, title = ?, summary = ?, content = ?, updated_at = ?, open_json = ?, content_policy = ? WHERE doc_id = ?`);
  const deleteFts = db.prepare("DELETE FROM search_fts WHERE rowid = ?");
  const insertFts = db.prepare("INSERT INTO search_fts (rowid, title, body) VALUES (?, ?, ?)");
  const deleteDocument = db.prepare("DELETE FROM search_documents WHERE doc_id = ?");
  const dropDocuments = (where: string, value: string) => {
    const ids = db.prepare(`SELECT doc_id FROM search_documents WHERE ${where}`).all(value) as Row[];
    for (const row of ids) { deleteFts.run(Number(row.doc_id)); deleteDocument.run(Number(row.doc_id)); }
    return ids.length;
  };

  return {
    sources: () => (db.prepare("SELECT * FROM search_sources ORDER BY source_key").all() as Row[]).map(fromSource),
    source: key => { const row = db.prepare("SELECT * FROM search_sources WHERE source_key = ?").get(key) as Row | undefined; return row ? fromSource(row) : null; },
    saveSource: record => {
      db.prepare(`INSERT INTO search_sources (source_key, project_id, provider_id, capability_id, version, plugin_id, title, collection_revision, state, error, synced_at, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(source_key) DO UPDATE SET plugin_id = excluded.plugin_id, title = excluded.title,
        collection_revision = excluded.collection_revision, state = excluded.state, error = excluded.error, synced_at = excluded.synced_at, checked_at = excluded.checked_at`)
        .run(record.source_key, record.project_id, record.provider_id, record.capability_id, record.version, record.plugin_id, record.title,
          record.collection_revision, record.state, record.error, record.synced_at, record.checked_at);
    },
    removeSource: key => transaction(() => { const removed = dropDocuments("source_key = ?", key); db.prepare("DELETE FROM search_sources WHERE source_key = ?").run(key); return removed; }),
    removeProject: projectId => transaction(() => { const removed = dropDocuments("project_id = ?", projectId); db.prepare("DELETE FROM search_sources WHERE project_id = ?").run(projectId); return removed; }),
    revisions: key => new Map((db.prepare("SELECT kind, object_id, revision FROM search_documents WHERE source_key = ?").all(key) as Row[])
      .map(row => [`${str(row.kind)}\u0000${str(row.object_id)}`, str(row.revision)])),
    count: key => Number((db.prepare("SELECT COUNT(*) AS n FROM search_documents WHERE source_key = ?").get(key) as Row).n),
    upsert: documents => transaction(() => {
      for (const document of documents) {
        const title = document.title.slice(0, 1000), summary = document.summary.slice(0, 4000), content = document.content.slice(0, 32000);
        const openJson = document.open ? JSON.stringify(document.open) : null;
        const existing = selectDocId.get(document.source_key, document.kind, document.object_id) as Row | undefined;
        let docId: number;
        if (existing) {
          docId = Number(existing.doc_id);
          updateDocument.run(document.project_id, document.revision, title, summary, content, document.updated_at, openJson, document.content_policy, docId);
          deleteFts.run(docId);
        } else {
          docId = Number(insertDocument.run(document.source_key, document.kind, document.object_id, document.project_id, document.revision, title, summary, content,
            document.updated_at, openJson, document.content_policy).lastInsertRowid);
        }
        insertFts.run(docId, searchTokens(title), searchTokens(`${summary}\n${content}`));
      }
    }),
    remove: (key, keys) => transaction(() => {
      for (const item of keys) {
        const existing = selectDocId.get(key, item.kind, item.object_id) as Row | undefined;
        if (!existing) continue;
        deleteFts.run(Number(existing.doc_id)); deleteDocument.run(Number(existing.doc_id));
      }
    }),
    document: (key, kind, objectId) => {
      const row = db.prepare("SELECT * FROM search_documents WHERE source_key = ? AND kind = ? AND object_id = ?").get(key, kind, objectId) as Row | undefined;
      return row ? fromDocument(row) : null;
    },
    search: (input: SearchIndexQuery) => {
      const plan = searchQueryPlan(input.query);
      const allowed = input.sources.filter((source, index, all) => all.findIndex(other => other.source_key === source.source_key) === index);
      if (!plan || !allowed.length) return { matches: [], total: 0 };
      const kinds = input.kinds?.length ? [...new Set(input.kinds)] : [];
      // A caller sees a source's documents; reader-provided content only for kinds it can read itself.
      const scope: string[] = [], params: string[] = [];
      for (const source of allowed) {
        const readable = [...new Set(source.readable_kinds)];
        scope.push(`(d.source_key = ?${readable.length ? ` AND (d.content_policy = 'summary' OR d.kind IN (${readable.map(() => "?").join(",")}))` : " AND d.content_policy = 'summary'"})`);
        params.push(source.source_key, ...readable);
      }
      const rows = db.prepare(`SELECT d.*, bm25(search_fts, 8.0, 1.0) AS rank FROM search_fts JOIN search_documents d ON d.doc_id = search_fts.rowid
        WHERE search_fts MATCH ? AND (${scope.join(" OR ")})${kinds.length ? ` AND d.kind IN (${kinds.map(() => "?").join(",")})` : ""}
        ORDER BY rank LIMIT ${MAX_CANDIDATES}`).all(plan.expression, ...params, ...kinds) as Row[];
      const whole = normalizeSearchText(input.query.trim().replace(/\s+/gu, " ")).text;
      const matches: SearchIndexMatch[] = [];
      for (const row of rows) {
        const document = fromDocument(row);
        const fields = { title: normalizeSearchText(document.title), summary: normalizeSearchText(document.summary), content: normalizeSearchText(document.content) };
        const haystack = `${fields.title.text}\n${fields.summary.text}\n${fields.content.text}`;
        // Pairs matched by FTS must also be real substrings of the original text.
        if (!plan.runs.every(run => haystack.includes(run))) continue;
        // The whole query, when it appears as written, places and highlights the hit better than its parts.
        const needles = (field: Normalized) => whole && field.text.includes(whole) ? [whole] : plan.runs;
        const found = { title: occurrences(fields.title, needles(fields.title)), summary: occurrences(fields.summary, needles(fields.summary)),
          content: occurrences(fields.content, needles(fields.content)) };
        const field: SearchHitField = found.content.length ? "content" : found.summary.length ? "summary" : "title";
        const first = found[field][0] ?? [0, 0];
        const original = document[field];
        // A title-only hit shows where the body begins; a body hit shows the text around it.
        const view = field === "title" ? snippetOf(document.summary || document.content, null, []) : snippetOf(original, first[0], found[field]);
        const bonus = (fields.title.text.includes(whole) ? 6 : 0) + (fields.title.text.startsWith(whole) ? 2 : 0) + (found.title.length ? 2 : 0);
        matches.push({ source_key: document.source_key, kind: document.kind, object_id: document.object_id, project_id: document.project_id, revision: document.revision,
          title: document.title, updated_at: document.updated_at, open: document.open, score: -Number(row.rank) + bonus, snippet: view.snippet, highlights: view.highlights,
          locator: { field, offset: first[0], length: first[1] - first[0], text: original.slice(first[0], first[1]) } });
      }
      matches.sort((a, b) => b.score - a.score || String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) || a.title.localeCompare(b.title));
      return { matches: matches.slice(input.offset, input.offset + input.limit), total: matches.length };
    },
    clear: () => transaction(() => {
      const removed = Number((db.prepare("SELECT COUNT(*) AS n FROM search_documents").get() as Row).n);
      db.exec("INSERT INTO search_fts (search_fts) VALUES ('delete-all'); DELETE FROM search_documents; DELETE FROM search_sources;");
      return removed;
    }),
    close: () => db.close(),
  };
}
