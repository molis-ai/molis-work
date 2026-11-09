import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { before } from "node:test";
import { describeSqliteSchema } from "@molis-ai/molis-work-storage";
// @ts-expect-error the gate modules are plain .mjs
import { productRows, renderStoreSchemas, snapshotDifferences, structureHash } from "../scripts/gates/store-schema-snapshot.mjs";
// @ts-expect-error the gate modules are plain .mjs
import { SCHEMAS_FILE } from "../scripts/gates/store-schemas.mjs";

// UPG-01 (specs/upgrade-continuity/golden-replay-design.md §5, U2-d): tooling/gates/schemas/stores.tsv is what the built product creates, so the
// health gate's comparison with the merge-base (tests/health-gates-store-schemas.test.ts) compares what the code says. Nothing here writes to
// the repository; the cases that change something change a copy of the rows.
interface Row { store: string; owner: string; version: number; structure: string; froms: number[] }
let rows: Row[];
before(async () => { rows = await productRows(); }, { timeout: 120_000 });
const committed = () => readFileSync(new URL(`../${SCHEMAS_FILE}`, import.meta.url), "utf8");
const hash = (schema: string) => structureHash(schema, describeSqliteSchema);

test("UPG-01 the committed snapshot is what the built product creates; `pnpm schemas:update` rewrites it", () => {
  assert.deepEqual(snapshotDifferences(committed(), rows), []);
  assert.equal(committed(), renderStoreSchemas(rows));
});

test("UPG-01 the snapshot holds the catalog, the project database, every Home library, each built-in plugin's project tables and the old Alchemist's stores", () => {
  const stores = rows.map(row => row.store);
  for (const store of ["projects/catalog.db", "projects/*/molis-work.db", "memory/memory.db", "sync/sync.db", "server/server.sqlite", "todo/todo.db",
    "alchemist/projects/*/studio.sqlite", "alchemist/projects/*/search.sqlite", "projects/*/molis-work.db#io.molis.work.goals"]) assert.ok(stores.includes(store), store);
  assert.deepEqual(stores, [...stores].sort(), "sorted, so a new library lands in one place");
});

test("UPG-01 the hash moves with what a Home in use would keep in its old form, and not with how a statement is written", () => {
  const base = "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);\nCREATE INDEX notes_text ON notes(text);\nCREATE TRIGGER notes_touch AFTER UPDATE ON notes BEGIN SELECT 1; END;";
  assert.equal(hash(base), hash(base.replaceAll(" ", "  ").replaceAll("\n", "\n\n")), "spaces and line breaks");
  for (const [what, changed] of [
    ["a column", base.replace("text TEXT NOT NULL", "text TEXT NOT NULL, done INTEGER")],
    ["a column's type", base.replace("text TEXT NOT NULL", "text BLOB NOT NULL")],
    ["a default", base.replace("text TEXT NOT NULL", "text TEXT NOT NULL DEFAULT ''")],
    ["a check", base.replace("text TEXT NOT NULL", "text TEXT NOT NULL CHECK (length(text) > 0)")],
    ["an index", base.replace("CREATE INDEX notes_text ON notes(text);", "CREATE UNIQUE INDEX notes_text ON notes(text);")],
    ["a trigger's body", base.replace("SELECT 1;", "SELECT 2;")],
    ["a view", `${base}\nCREATE VIEW open_notes AS SELECT id FROM notes;`],
    ["a table", `${base}\nCREATE TABLE tags (name TEXT PRIMARY KEY);`],
  ] as const) assert.notEqual(hash(changed), hash(base), what);
});

test("UPG-01 a snapshot that differs from the product names each library and what differs", () => {
  const copy = rows.map(row => ({ ...row, froms: [...row.froms] }));
  const [first, second] = copy;
  const text = renderStoreSchemas(copy);
  assert.deepEqual(snapshotDifferences(text, copy), []);
  assert.match(snapshotDifferences(text, [{ ...first!, structure: "0".repeat(16) }, ...copy.slice(1)]).join("\n"), new RegExp(`${first!.store.replace(/[.*]/gu, "\\$&")}: structure differ`, "u"));
  assert.match(snapshotDifferences(text, [{ ...first!, version: 2, froms: [1] }, ...copy.slice(1)]).join("\n"), /version, upgrades differ/u);
  assert.match(snapshotDifferences(text, copy.slice(1)).join("\n"), /is in tooling\/gates\/schemas\/stores\.tsv, and the product has no such library/u);
  assert.match(snapshotDifferences(renderStoreSchemas(copy.filter(row => row !== second)), copy).join("\n"), /is not in tooling\/gates\/schemas\/stores\.tsv/u);
  assert.match(snapshotDifferences(null, copy).join("\n"), /is missing; write it with `pnpm schemas:update`/u);
  assert.match(snapshotDifferences(text.replace("\n", "\n\n"), copy).join("\n"), /not written the way `pnpm schemas:update` writes it/u);
});
