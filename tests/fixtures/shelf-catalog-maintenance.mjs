#!/usr/bin/env node
// Shelf S3 maintenance (① ruling D3, 2026-10-22; specs/repository-anti-corruption/spec.md §4.1 维护八): Shelf's catalog
// (<home>/shelf/catalog.json) goes from version 1 to 2. Version 2 keeps no real path: the original file a person handed in is the
// platform's register (`materials.claimOriginal`, under the item's id), and an item no longer carries `origin_realpath`. The new
// build opens only version 2, and a version 1 catalog would be refused, so a Home in use is rewritten once: each item loses its
// `origin_realpath`, and the version becomes 2. Nothing is moved into the platform's register (the path was only ever the page's
// word for it), so a copy admitted before the maintenance no longer warns that its original changed. Delete this file and
// tests/shelf-catalog-maintenance.test.ts together once the Homes in use have been done (they stay in Git history).
//
//   node tests/fixtures/shelf-catalog-maintenance.mjs list    --home <copy of the Home> [--json]
//       READ ONLY. Says the catalog's version, how many items it holds and how many of them carry a path (never the paths).
//   node tests/fixtures/shelf-catalog-maintenance.mjs rewrite --home <Home or copy> [--json] [--maintenance-window]
//       Reads and checks the whole catalog first and stops at the first problem without writing; then writes version 2 next to it
//       and renames it over the catalog in one step, with the catalog's own mode, and reads it back. Running it again changes
//       nothing. The real Home (~/.molis-work, $MOLIS_WORK_HOME) is refused unless --maintenance-window says the person approved
//       the window, with the Host stopped; `list` never accepts it, run `list` on a copy.
//   Exit code: 0 done or nothing to do, 1 a problem (nothing was written), 2 a bad command or the real Home without the flag.
import { existsSync, lstatSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const realHomes = () => [path.join(homedir(), ".molis-work"), process.env.MOLIS_WORK_HOME ?? ""].filter(Boolean).map(home => path.resolve(home));

/** A problem found while reading: the run stops before writing anything. */
const problem = message => Object.assign(new Error(message), { problem: true });

/** Reads the catalog and returns what it is and what version 2 of it would be; throws a problem on anything it cannot vouch for. */
export function readShelfCatalog(home) {
  const file = path.join(home, "shelf", "catalog.json");
  if (!existsSync(file)) return { file, version: null, items: 0, with_path: 0, next: null };
  if (!lstatSync(file).isFile()) throw problem(`${file} is not a regular file`);
  let catalog;
  try { catalog = JSON.parse(readFileSync(file, "utf8")); } catch (error) { throw problem(`${file} is not JSON: ${error.message}`); }
  if (!catalog || typeof catalog !== "object" || !Array.isArray(catalog.items)) throw problem(`${file} has no item list`);
  if (catalog.version !== 1 && catalog.version !== 2) throw problem(`${file} has version ${JSON.stringify(catalog.version)}, neither 1 nor 2`);
  if (catalog.items.some(item => !item || typeof item !== "object" || typeof item.item_id !== "string")) throw problem(`${file} has an item without an id`);
  const withPath = catalog.items.filter(item => Object.hasOwn(item, "origin_realpath")).length;
  if (catalog.version === 2) {
    if (withPath > 0) throw problem(`${file} is version 2 but ${withPath} item(s) still carry origin_realpath`);
    return { file, version: 2, items: catalog.items.length, with_path: 0, next: null };
  }
  const items = catalog.items.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "origin_realpath")));
  return { file, version: 1, items: catalog.items.length, with_path: withPath, next: { ...catalog, version: 2, items } };
}

/** Rewrites a version 1 catalog as version 2 in one rename; a version 2 catalog, or none, is left as it is. */
export function rewriteShelfCatalog(home) {
  const read = readShelfCatalog(home);
  if (!read.next) return { ...read, rewritten: false };
  const mode = statSync(read.file).mode & 0o777;
  const temporary = `${read.file}.maintenance-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(read.next, null, 2)}\n`, { mode, flag: "wx" });
  renameSync(temporary, read.file);
  const after = readShelfCatalog(home);
  if (after.version !== 2 || after.items !== read.items) throw problem(`${read.file} did not read back as version 2 with ${read.items} items`);
  return { ...read, next: null, rewritten: true };
}

function run(argv) {
  const [mode, ...rest] = argv;
  const at = rest.indexOf("--home"), given = at >= 0 ? rest[at + 1] : undefined;
  if (!["list", "rewrite"].includes(mode) || !given) return { code: 2, text: "usage: shelf-catalog-maintenance.mjs list|rewrite --home <dir> [--json] [--maintenance-window]" };
  const home = existsSync(given) ? realpathSync(given) : path.resolve(given);
  const real = realHomes().some(each => each === home || (existsSync(each) && realpathSync(each) === home));
  if (real && (mode === "list" || !rest.includes("--maintenance-window"))) {
    return { code: 2, text: `${home} is the real Home: run list on a copy; rewrite it only with --maintenance-window, the Host stopped` };
  }
  try {
    const outcome = mode === "list" ? readShelfCatalog(home) : rewriteShelfCatalog(home);
    const report = { file: outcome.file, version: outcome.version, items: outcome.items, with_path: outcome.with_path,
      ...(mode === "list" ? { needs_rewrite: outcome.version === 1 } : { rewritten: outcome.rewritten }) };
    const text = rest.includes("--json") ? JSON.stringify(report, null, 2)
      : outcome.version === null ? `${outcome.file}: no catalog, nothing to do`
      : `${outcome.file}: version ${outcome.version}, ${outcome.items} item(s), ${outcome.with_path} with a path`
        + (mode === "list" ? (outcome.version === 1 ? "; rewrite makes it version 2" : "; nothing to do") : (outcome.rewritten ? "; rewritten as version 2" : "; nothing to do"));
    return { code: 0, text };
  } catch (error) {
    if (error?.problem === true) return { code: 1, text: `problem, nothing written: ${error.message}` };
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const outcome = run(process.argv.slice(2));
  (outcome.code === 0 ? process.stdout : process.stderr).write(`${outcome.text}\n`);
  process.exit(outcome.code);
}
