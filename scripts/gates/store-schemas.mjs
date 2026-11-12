// Gate: the creation statements of a library do not change under the same version (UPG-01; specs/upgrade-continuity/golden-replay-design.md §5,
// user 2026-11-06). It reads tooling/gates/schemas/stores.tsv, which holds one row per library this build creates: where it is, who owns it,
// its version, a hash of its structure and the `from` of each upgrade step it carries. `pnpm schemas:update` writes that file from the built
// product (scripts/gates/store-schema-snapshot.mjs), and `pnpm test:contracts` fails while the file and the product differ, so the file here
// is what the code says. This half needs no build: it compares the file on the head with the one on the merge-base.
//
//   - a library whose structure hash changed while its version stayed: the statements changed and a Home in use keeps the old ones, so it
//     fails (the open-time check compares tables, not triggers, and a same-version store is never repaired in place);
//   - a version that went down fails;
//   - a version that went up needs a step with each `from` from the old version to the new one minus 1, as the product reports them;
//   - and a golden Home under tests/fixtures/golden-homes/ that holds the library at the old version, so the golden replay has an old store
//     to bring up (the replay itself is the `golden-replay` job, which `Verify` requires, so it blocks the merge). A golden records each
//     library's version where its owner keeps it (`PRAGMA user_version`, the catalog's `catalog_meta`) and, for a project library, each
//     plugin's tables at the version of its ledger row (`plugin_tables`; scripts/golden/formats.mjs); a row `<library>#<plugin_id>` is read there.
//
// A new library (no row on the merge-base) and a library that is gone pass here; what a library that is gone means for a Home is another gate's
// question. A file that cannot be read is a problem, never a pass: on the head when the merge-base has one, and on either side when a row
// cannot be parsed. A repository with the file on neither side (the scratch repositories of other gate tests) is not gated.
//
// This gate does not decide whether a version may go above 1 at all, nor the maintenance row a raised version needs: those are
// scripts/gates/initial-versions.mjs and scripts/gates/store-versions.mjs (upgrade-chain-design §11). It covers the libraries those two do not
// list as well: every Home library, the project database, each built-in plugin's project tables and the old Alchemist's two stores.
import { goldenManifests } from "../golden/formats.mjs";

export const SCHEMAS_FILE = "tooling/gates/schemas/stores.tsv";
export const SCHEMA_COLUMNS = ["store", "owner", "version", "structure", "upgrades"];
const GOLDENS = "tests/fixtures/golden-homes/";
// Approved on 2026-11-09, intelligent-surfaces §17.2. Only the new subjects_json column;
// the owner's open still refuses the old file. Keep the comparison directional and exact.
export const DISCUSSION_V1_SUBJECTS_CHANGE = Object.freeze({
  store: "server/server.sqlite", owner: "server", version: 1,
  before: "626a2905680637a9", after: "2c4efaa24415de5e",
});

function approvedDiscussionChange(store, before, now) {
  const change = DISCUSSION_V1_SUBJECTS_CHANGE;
  return store === change.store && before.owner === change.owner && now.owner === change.owner
    && before.version === change.version && now.version === change.version && !before.froms.length && !now.froms.length
    && before.structure === change.before && now.structure === change.after;
}

/** The rows of the file by `store`, or the sentence that says why it cannot be read. */
export function parseStoreSchemas(text, where = SCHEMAS_FILE) {
  const lines = text.split("\n").filter(line => line && !line.startsWith("#"));
  if (lines[0] !== SCHEMA_COLUMNS.join("\t")) return { why: `${where}: the first line that is not a comment must be the header ${SCHEMA_COLUMNS.join(", ")}` };
  const rows = new Map();
  for (const [index, line] of lines.slice(1).entries()) {
    const [store, owner, version, structure, upgrades, ...rest] = line.split("\t");
    const froms = upgrades === "-" ? [] : (upgrades ?? "").split(",").map(Number);
    if (rest.length || !store || !owner || !/^\d+$/u.test(version ?? "") || !/^[0-9a-f]{16}$/u.test(structure ?? "") || froms.some(from => !Number.isInteger(from) || from < 1))
      return { why: `${where}: row ${index + 1} is not「store, owner, version, a 16-digit hash, the steps' from or -」` };
    if (rows.has(store)) return { why: `${where}: ${store} has two rows` };
    rows.set(store, { owner, version: Number(version), structure, froms });
  }
  return { rows };
}

/**
 * Whether a path a golden recorded is the library of `store` (for `<library>#<plugin_id>`, the library), in the root Home or in an account
 * Home under `spaces/`. Not `relativePathPattern` (the one the golden reader and the replay share): this accepts either Home, because an
 * account Home's recorded path carries a `spaces/<id>/` prefix that the store's own pattern does not.
 */
export function goldenPathMatcher(store) {
  const pattern = store.split("#")[0].split("/").map(part => part === "*" ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("/");
  const expression = new RegExp(`^(?:spaces/[^/]+/)?${pattern}$`, "u");
  return path => expression.test(path);
}

/** Whether a golden's store entry holds `store` at `version`: the library's own version, or for `<library>#<plugin_id>` that plugin's tables. */
export function goldenHolds(store, version) {
  const matches = goldenPathMatcher(store), plugin = store.split("#")[1];
  return entry => matches(String(entry?.path)) && (plugin === undefined ? entry.schema_version === version : entry.plugin_tables?.[plugin] === version);
}

/** Each golden's recorded libraries, from its manifest; one that cannot be read holds nothing. */
function goldenStores(tree) {
  return goldenManifests(tree).map(({ golden, manifest }) => ({ golden, stores: Array.isArray(manifest?.stores) ? manifest.stores : [] }));
}

/**
 * `tree`: { files (tracked), read(file) gives the head's text or null }; `readBase(file)` the merge-base's (absent without --base).
 * Returns the problems.
 */
export function storeSchemaProblems({ files, read }, readBase) {
  const headText = read(SCHEMAS_FILE), baseText = readBase ? readBase(SCHEMAS_FILE) : null;
  if (headText === null && baseText === null) return [];
  if (headText === null) return [`${SCHEMAS_FILE} is gone; the merge-base has it, and it is how a changed creation statement is caught (UPG-01). Write it with \`pnpm schemas:update\``];
  const head = parseStoreSchemas(headText);
  if (head.why) return [head.why];
  if (baseText === null) return [];
  const base = parseStoreSchemas(baseText, `merge-base:${SCHEMAS_FILE}`);
  if (base.why) return [base.why];
  const problems = [], goldens = goldenStores({ files, read });
  for (const [store, now] of head.rows) {
    const before = base.rows.get(store);
    if (!before) continue;
    if (now.version === before.version) {
      if (now.structure !== before.structure && !approvedDiscussionChange(store, before, now)) problems.push(`UPG-01 ${store}: its creation statements changed and its version is still ${now.version}. A Home in use keeps the old structure, so raise the version and add the step from ${now.version}, then \`pnpm schemas:update\``);
      continue;
    }
    if (now.version < before.version) { problems.push(`UPG-01 ${store}: its version went down, ${before.version} → ${now.version}; a version never goes down`); continue; }
    const missing = [];
    for (let from = before.version; from < now.version; from += 1) if (!now.froms.includes(from)) missing.push(from);
    if (missing.length) problems.push(`UPG-01 ${store}: its version went up, ${before.version} → ${now.version}, with no upgrade step from ${missing.join(", ")}`);
    const holds = goldenHolds(store, before.version);
    if (!goldens.some(({ stores }) => stores.some(holds))) problems.push(`UPG-01 ${store}: its version went up, ${before.version} → ${now.version}, and no golden Home under ${GOLDENS} holds it at ${before.version}, so the replay would not bring an old one up. Generate a golden on the code before the change (specs/upgrade-continuity/golden-replay-design.md §3)`);
  }
  return problems;
}
