// What a golden Home records about versions, and how the gates read it back (specs/upgrade-continuity/golden-replay-design.md §5; U2-d).
//
// A library's own version is where its owner keeps it: `PRAGMA user_version` for nearly every library, `catalog_meta` for the project catalog,
// and the ledger row of `plugin_project_databases` for each plugin's tables in a project library. A golden records those real values, never a
// stand-in, so UPG-01 (scripts/gates/store-schemas.mjs) can tell whether a golden holds a library at its old version.
//
// A persistent format (scripts/gates/initial-versions.mjs) goes by its tooling/versions.json entry, which stays the same when the code moves.
// The table below says where in a Home each one sits; the generator records what it finds there as `formats` (entry, path, version), and the
// unified-origin check lets a format above 1 through only when the goldens hold each older version. One with `absent` cannot be in a golden,
// so raising it fails; one whose file a golden does not have yet (computer/settings.json, BL-golden-computer-settings) fails the same way.
//
// The gates only read the manifest, so the replay reads each version a manifest records again from the restored Home (`assertRecordedVersions`):
// a manifest edited by hand fails there instead of making a golden hold a version it does not. It reads what was recorded and nothing more:
// this table is the current build's and the goldens are older releases', so an entry added later is not in them and must not fail them.
// An entry that moves or is renamed must keep a reading for where older goldens recorded it, or their replay fails, on purpose.
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { goldenFailure } from "./failure.mjs";
import { GOLDEN_HOMES_DIRECTORY, relativePathPattern } from "./versions.mjs";

// Only reading a library with plugin tables needs it; the gates that list the golden files run before anything is built (CI's Gates job).
const runtime = await import("@molis-ai/molis-work-plugin-runtime").catch(error => ({ unbuilt: error }));
function pluginProjectTablesVersion(db, pluginId) {
  if (runtime.unbuilt) throw new Error("读插件表的版本要先构建 @molis-ai/molis-work-plugin-runtime", { cause: runtime.unbuilt });
  return runtime.pluginProjectTablesVersion(db, pluginId);
}

export const PERSISTENT_FORMAT_LOCATIONS = Object.freeze({
  "database.home.catalog": { store: "projects/catalog.db" },
  "database.ledger_baseline": { store: "plugin-libraries/plugin-libraries.db" },
  "database.memory_ledger_baseline": { store: "memory/memory.db" },
  // The JSON in the one row of jelly_workspace, not jelly/preferences.json (format.model.preference).
  "format.jelly.workspace": { store: "jelly/jelly.db", rows: "SELECT json_extract(body, '$.schema_version') AS version FROM jelly_workspace" },
  "format.secret-store.map": { file: "feed/secrets.json", field: "version" },
  "format.mcp.tool-preference": { file: "config/mcp-tools.json", field: "version" },
  "format.shelf.catalog": { file: "shelf/catalog.json", field: "version" },
  "format.home.onboarding": { file: "config/onboarding.json", field: "schema_version" },
  "format.project.arrival": { file: "config/project-arrival.json", field: "schema_version" },
  "format.browser.site-decisions": { file: "browser/sites.json", field: "version" },
  "format.computer.settings": { file: "computer/settings.json", field: "version" },
  "format.computer.record": { file: "computer/records/*/record.json", field: "version" },
  "format.ui.appearance-state": { file: "interface/state.json", field: "schema_version" },
  "format.ui.last-locale": { file: "config/ui-locale.json", field: "schema_version" },
  "format.model.preference": { file: "jelly/preferences.json", field: "schema_version" },
  "format.home.installation": { absent: "config/installation.json is written by the installer, and a golden Home is made by running a Host, not by installing one" },
  "database.search.text-index": { absent: "search/ is a rebuildable index the snapshot leaves out (upgrade-chain-design §2.3); its first raise is the user's call" },
});

/** A Home path without the account Home's `spaces/<id>/`. */
const inHome = relative => relative.replace(/^spaces\/[^/]+\//u, "");
const pattern = relativePathPattern;
const located = (kind, relative, locations = PERSISTENT_FORMAT_LOCATIONS) => Object.entries(locations).filter(([, location]) => location[kind] && pattern(location[kind]).test(inHome(relative)));

/** The version a format holds, or the failure that says the golden would record something that is not one. */
function version(value, where) {
  if (!Number.isInteger(value) || value < 1) throw goldenFailure("golden.format_version_unreadable", where);
  return value;
}

/** A library's version as its owner keeps it, and each plugin's tables at the version its ledger row says. `db` is open on the captured copy. */
export function libraryVersions(storage, db, relative, userVersion) {
  const has = table => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
  const schema_version = /^projects\/catalog\.db$/u.test(inHome(relative)) ? version(storage.CATALOG_VERSION_ACCESS.read(db), relative) : userVersion;
  if (!has("plugin_project_databases")) return { schema_version };
  // Each plugin's version read the way the upgrade reads it (plugin-runtime), so the golden and the chain agree on what a row says.
  const plugins = db.prepare("SELECT plugin_id FROM plugin_project_databases ORDER BY plugin_id").all().map(row => row.plugin_id);
  return plugins.length ? { schema_version, plugin_tables: Object.fromEntries(plugins.map(id => [id, version(pluginProjectTablesVersion(db, id), `${relative}#${id}`)])) } : { schema_version };
}

/** The persistent formats a captured library holds: a library's own version, or a version kept in its rows. */
export function storeFormats(db, relative, schemaVersion) {
  return located("store", relative).flatMap(([entry, location]) => location.rows
    ? db.prepare(location.rows).all().map(row => ({ entry, path: relative, version: version(Number(row.version), relative) }))
    : [{ entry, path: relative, version: version(schemaVersion, relative) }]);
}

/** The persistent formats a captured file holds, read from the bytes the golden keeps. */
export function fileFormats(bytes, relative) {
  const found = located("file", relative);
  if (!found.length) return [];
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { throw goldenFailure("golden.format_version_unreadable", relative); }
  return found.map(([entry, location]) => ({ entry, path: relative, version: version(value?.[location.field], relative) }));
}

/**
 * What `entry` holds at `relative` in a restored Home, read the way `locations` says, as the generator read it (the first row, for a reading by
 * rows). Undefined when the table has no reading for that entry at that place, or the golden has no library or file there.
 */
function readRecordedFormat(home, { entry, path: relative }, schemaVersions, files, locations) {
  const location = typeof entry === "string" && Object.hasOwn(locations, entry) ? locations[entry] : null;
  if (!location || typeof relative !== "string") return undefined;
  const at = kind => typeof location[kind] === "string" && pattern(location[kind]).test(inHome(relative));
  if (at("store") && schemaVersions.has(relative)) {
    if (!location.rows) return schemaVersions.get(relative);
    const db = new DatabaseSync(path.join(home, relative), { readOnly: true });
    try { return Number(db.prepare(location.rows).get()?.version); } finally { db.close(); }
  }
  if (at("file") && files.has(relative)) return JSON.parse(readFileSync(path.join(home, relative), "utf8"))?.[location.field];
  return undefined;
}

/**
 * After a restore, each version the manifest records is read again from the Home: each library's `schema_version` and `plugin_tables`, and
 * each item of `formats`, by its entry's reading in `locations` (this build's table, unless a test gives another). Only what is recorded:
 * the gates count held versions from the manifest alone, so a format it leaves out claims nothing, and a later table's new entry is not in
 * an older golden. A recorded item with no reading, at a place the golden does not have, that cannot be read, or that reads differently, fails
 * at `<path>#<entry>` (a library at its path), and never says which values differed. Run before the Host opens the Home, which would upgrade it.
 */
export function assertRecordedVersions(storage, manifest, home, locations = PERSISTENT_FORMAT_LOCATIONS) {
  const schemaVersions = new Map();
  for (const entry of manifest.stores) {
    const db = new DatabaseSync(path.join(home, entry.path), { readOnly: true });
    let versions;
    try { versions = libraryVersions(storage, db, entry.path, Number(db.prepare("PRAGMA user_version").get().user_version)); } finally { db.close(); }
    if (versions.schema_version !== entry.schema_version) throw goldenFailure("golden.recorded_version_mismatch", entry.path);
    if (!isDeepStrictEqual(versions.plugin_tables ?? null, entry.plugin_tables ?? null)) throw goldenFailure("golden.recorded_version_mismatch", `${entry.path}#plugin_tables`);
    schemaVersions.set(entry.path, versions.schema_version);
  }
  const files = new Set(manifest.files.map(entry => entry.path));
  for (const item of Array.isArray(manifest.formats) ? manifest.formats : []) {
    let found;
    // A recorded version that cannot be read back is not held, whatever stopped the reading.
    try { found = readRecordedFormat(home, item ?? {}, schemaVersions, files, locations); } catch { found = undefined; }
    if (found !== item?.version) throw goldenFailure("golden.recorded_version_mismatch", `${item?.path}#${item?.entry}`);
  }
}

/** Each golden under tests/fixtures/golden-homes/ and its manifest, or null for one that cannot be read; a gate treats that as holding nothing. */
export function goldenManifests({ files, read }) {
  const prefix = `${GOLDEN_HOMES_DIRECTORY}/`;
  return files.filter(file => file.startsWith(prefix) && file.endsWith("/manifest.json") && file.slice(prefix.length).split("/").length === 2).map(file => {
    let manifest = null;
    try { manifest = JSON.parse(read(file) ?? "null"); } catch { manifest = null; }
    return { golden: file.slice(prefix.length, -"/manifest.json".length), manifest: manifest && typeof manifest === "object" ? manifest : null };
  });
}
