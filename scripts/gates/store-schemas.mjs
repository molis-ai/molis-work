// Gate: the creation statements of a library do not change under the same version (UPG-01; specs/upgrade-continuity/golden-replay-design.md §5,
// user 2026-11-06). It reads tooling/gates/schemas/stores.tsv, which holds one row per library this build creates: where it is, who owns it,
// its version, a hash of its structure and the `from` of each upgrade step it carries. `pnpm schemas:update` writes that file from the built
// product (scripts/gates/store-schema-snapshot.mjs), and `pnpm test:contracts` fails while the file and the product differ, so the file here
// is what the code says. This half needs no build: it compares the file on the head with the one on the merge-base.
//
//   - a library whose structure hash changed while its version stayed: the statements changed and a Home in use keeps the old ones, so it
//     fails (the open-time check compares tables, not triggers, and a same-version store is never repaired in place);
//   - a version that went down fails, unless it is a one-time reset to a clean v1 the user approved (V1_RESET_FILE, exact hashes);
//   - a version that went up needs a step with each `from` from the old version to the new one minus 1, as the product reports them;
//   - and a golden Home under tests/fixtures/golden-homes/ that holds the library at the old version, so the golden replay has an old store
//     to bring up (the replay itself is the `golden-replay` job, which `Verify` requires, so it blocks the merge). A golden records each
//     library's version where its owner keeps it (`PRAGMA user_version`, the catalog's `catalog_meta`) and, for a project library, each
//     plugin's tables at the version of its ledger row (`plugin_tables`; scripts/golden/formats.mjs); a row `<library>#<plugin_id>` is read there.
//   - an existing replay sample for a supported older version must survive later changes, even when the store version stays the same.
//
// A new library (no row on the merge-base) and a library that is gone pass here; what a library that is gone means for a Home is another gate's
// question. A file that cannot be read is a problem, never a pass: on the head when the merge-base has one, and on either side when a row
// cannot be parsed. A repository with the file on neither side (the scratch repositories of other gate tests) is not gated.
//
// This gate does not decide whether a version may go above 1 at all, nor the maintenance row a raised version needs: those are
// scripts/gates/initial-versions.mjs and scripts/gates/store-versions.mjs (upgrade-chain-design §11). It covers the libraries those two do not
// list as well: every Home library, the project database, and each built-in plugin's project tables.
import { goldenManifests } from "../golden/formats.mjs";

export const SCHEMAS_FILE = "tooling/gates/schemas/stores.tsv";
export const SCHEMA_COLUMNS = ["store", "owner", "version", "structure", "upgrades"];
const GOLDENS = "tests/fixtures/golden-homes/";

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
 * Home under `spaces/`. `<partition>` matches either `personal-space` or `projects/<id>`, covering both `<partition>/molis-work.db` and
 * `<partition>/libraries/<store>.db`. Not `relativePathPattern` (the one the golden reader and the replay share): this accepts either Home,
 * because an account Home's recorded path carries a `spaces/<id>/` prefix that the store's own pattern does not.
 */
export function goldenPathMatcher(store) {
  const pattern = store.split("#")[0].split("/").map(part =>
    part === "<partition>" ? "(?:personal-space|projects/[^/]+)"
      : part === "*" ? "[^/]+"
      : part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"),
  ).join("/");
  const expression = new RegExp(`^(?:spaces/[^/]+/)?${pattern}$`, "u");
  return path => expression.test(path);
}

// When a library key migrates from `projects/*/molis-work.db(#...)` to `<partition>/molis-work.db(#...)`, look up the merge-base row
// under its previous key (only when the old key is no longer on head) so a key rename never silently skips UPG-01 comparison.
export function previousStoreKey(store) {
  return store.startsWith("<partition>/molis-work.db") ? `projects/*${store.slice("<partition>".length)}` : null;
}

export function baseStoreRow(headRows, baseRows, store) {
  const direct = baseRows.get(store);
  if (direct) return direct;
  const previous = previousStoreKey(store);
  return previous && !headRows.has(previous) ? baseRows.get(previous) : undefined;
}

/** Same-version structure changes the user approved one by one, each an exact pair of hashes with who approved it and why. */
export const EXCEPTIONS_FILE = "tooling/gates/schemas/same-version-exceptions.json";
export function parseExceptions(text) {
  if (text === null) return { rows: [] };
  let rows;
  try { rows = JSON.parse(text); } catch { return { why: `${EXCEPTIONS_FILE} is not JSON` }; }
  const hash = value => typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
  const valid = Array.isArray(rows) && rows.every(row => row && typeof row === "object" && Object.keys(row).sort().join(",") === "approved,from,reason,store,to,version"
    && typeof row.store === "string" && Number.isInteger(row.version) && hash(row.from) && hash(row.to) && row.from !== row.to
    && typeof row.approved === "string" && row.approved.length >= 10 && typeof row.reason === "string" && row.reason.length >= 20);
  return valid ? { rows } : { why: `${EXCEPTIONS_FILE}: each entry is { store, version, from, to (16-digit hashes), approved, reason }` };
}

/**
 * One-time resets of a library to a clean v1 the user approved (V7, batch 106, 2026-11-24), each pinned to the merge-base's exact version and
 * structure and the head's exact v1 structure with no steps; `place` is the checklist §3 位置, which store-versions.mjs reads the same entry by. Once the reset is on main its base is at 1, so the entry matches nothing again; it
 * is cleared in the next PR that touches this gate, as the batch-44 reset file was (#2201).
 */
export const V1_RESET_FILE = "tooling/gates/schemas/v1-reset-exceptions.json";
export function parseV1ResetExceptions(text) {
  if (text === null) return { rows: [] };
  let rows;
  try { rows = JSON.parse(text); } catch { return { why: `${V1_RESET_FILE} is not JSON` }; }
  const hash = value => typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
  const valid = Array.isArray(rows) && rows.every(row => row && typeof row === "object"
    && Object.keys(row).sort().join(",") === "approved,from_structure,from_version,place,reason,store,to_structure,to_version"
    && typeof row.store === "string" && typeof row.place === "string" && row.place.length > 0 && Number.isInteger(row.from_version) && row.from_version > 1 && row.to_version === 1
    && hash(row.from_structure) && hash(row.to_structure)
    && typeof row.approved === "string" && row.approved.length >= 10 && typeof row.reason === "string" && row.reason.length >= 20);
  return valid ? { rows } : { why: `${V1_RESET_FILE}: each entry is { store, place (the checklist §3 位置), from_version (>1), to_version (1), from_structure, to_structure (16-digit hashes), approved, reason }` };
}

/** Whether a golden's store entry holds `store` at `version`: the library's own version, or for `<library>#<plugin_id>` that plugin's tables. */
export function goldenHolds(store, version) {
  const matches = goldenPathMatcher(store), plugin = store.split("#")[1];
  return entry => matches(String(entry?.path)) && (plugin === undefined ? entry.schema_version === version : entry.plugin_tables?.[plugin] === version);
}

/** Each golden's recorded libraries, from its manifest; one that cannot be read holds nothing. */
function goldenStores(tree) {
  return goldenManifests(tree).flatMap(({ manifest }) => Array.isArray(manifest?.stores) ? manifest.stores : []);
}

/**
 * Each tree is { files (tracked), read(file) gives its text or null }. The merge-base tree is absent without --base.
 * Returns the problems.
 */
export function storeSchemaProblems(tree, baseTree) {
  const headText = tree.read(SCHEMAS_FILE), baseText = baseTree?.read(SCHEMAS_FILE) ?? null;
  if (headText === null && baseText === null) return [];
  if (headText === null) return [`${SCHEMAS_FILE} is gone; the merge-base has it, and it is how a changed creation statement is caught (UPG-01). Write it with \`pnpm schemas:update\``];
  const head = parseStoreSchemas(headText);
  if (head.why) return [head.why];
  if (baseText === null) return [];
  const base = parseStoreSchemas(baseText, `merge-base:${SCHEMAS_FILE}`);
  if (base.why) return [base.why];
  const problems = [], goldens = goldenStores(tree), baseGoldens = goldenStores(baseTree);
  // A same-version change the user approved names its exact pair of hashes in ${EXCEPTIONS_FILE}; any other change still fails.
  const exceptions = parseExceptions(tree.read(EXCEPTIONS_FILE));
  if (exceptions.why) {
    return [exceptions.why];
  }
  const excepted = (store, version, from, to) => exceptions.rows.some(row => row.store === store && row.version === version && row.from === from && row.to === to);
  const resets = parseV1ResetExceptions(tree.read(V1_RESET_FILE));
  if (resets.why) return [resets.why];
  // A reset leaves the library at 1 with no steps: nothing is brought up from the old version, so there is no step or golden to keep for it.
  const reset = (store, before, now) => !now.froms.length && resets.rows.some(row => row.store === store && row.from_version === before.version
    && row.to_version === now.version && row.from_structure === before.structure && row.to_structure === now.structure);
  for (const [store, now] of head.rows) {
    const before = baseStoreRow(head.rows, base.rows, store);
    if (!before) continue;
    for (const from of before.froms) {
      if (from >= before.version || from >= now.version || !now.froms.includes(from)) continue;
      const holds = goldenHolds(store, from);
      if (baseGoldens.some(holds) && !goldens.some(holds)) problems.push(`UPG-01 ${store}: the last golden Home at ${from} was removed, but the upgrade step from ${from} is still supported. Keep a golden at ${from} under ${GOLDENS}`);
    }
    if (now.version === before.version) {
      if (now.structure !== before.structure && !excepted(store, now.version, before.structure, now.structure)) problems.push(`UPG-01 ${store}: its creation statements changed and its version is still ${now.version}. A Home in use keeps the old structure, so raise the version and add the step from ${now.version}, then \`pnpm schemas:update\``);
      continue;
    }
    if (now.version < before.version) {
      if (!reset(store, before, now)) problems.push(`UPG-01 ${store}: its version went down, ${before.version} → ${now.version}; a version never goes down`);
      continue;
    }
    const missing = [];
    for (let from = before.version; from < now.version; from += 1) if (!now.froms.includes(from)) missing.push(from);
    if (missing.length) problems.push(`UPG-01 ${store}: its version went up, ${before.version} → ${now.version}, with no upgrade step from ${missing.join(", ")}`);
    const holds = goldenHolds(store, before.version);
    if (!goldens.some(holds)) problems.push(`UPG-01 ${store}: its version went up, ${before.version} → ${now.version}, and no golden Home under ${GOLDENS} holds it at ${before.version}, so the replay would not bring an old one up. Generate a golden on the code before the change (specs/upgrade-continuity/golden-replay-design.md §3)`);
  }
  return problems;
}
