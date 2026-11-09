import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LOCALES } from "./host.mjs";

export const MANIFEST = "tooling/gates/first-screen.json";
export const GATED_PAGES = ["arrival-empty", "chooser", "workbench-default", "workbench-all-plugins"];
export const MEASURED_PAGES = [...GATED_PAGES, "workbench-demo"];
const PROJECT_PAGES = new Set(MEASURED_PAGES.slice(1));

const localesOf = row => row.locale === "both" ? LOCALES : [row.locale];

export function readManifest(root, { optional = false } = {}) {
  const file = join(root, MANIFEST);
  let text;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if (optional && error.code === "ENOENT") return null;
    throw error;
  }
  const rows = JSON.parse(text);
  if (!Array.isArray(rows)) throw new Error(`${file}: expected an array of first-screen entries`);
  const keys = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).some(key => !["page", "locale", "entry", "owner", "introduced", "baseOnly"].includes(key))
      || !MEASURED_PAGES.includes(row.page) || ![...LOCALES, "both"].includes(row.locale)
      || typeof row.owner !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(row.owner)
      || typeof row.entry !== "string" || !/^\/(?!\/)[^\s#\\]*$/.test(row.entry)
      || /[<>]/.test(row.entry.replaceAll("<project>", "")) || row.entry.includes("<project>") && !PROJECT_PAGES.has(row.page)
      || Object.hasOwn(row, "introduced") && row.introduced !== true
      || Object.hasOwn(row, "baseOnly") && row.baseOnly !== true || row.introduced && row.baseOnly) {
      throw new Error(`${file}: invalid first-screen entry ${JSON.stringify(row)}`);
    }
    for (const locale of localesOf(row)) {
      const key = `${row.page}/${locale} ${row.entry}`;
      if (keys.has(key)) throw new Error(`${file}: duplicate entry ${key}`);
      keys.add(key);
    }
  }
  return rows;
}

export const currentRows = rows => rows.filter(row => !row.baseOnly);

// First adoption may add or remove dynamic requests in the same PR. The flags supply just the
// otherwise missing manifest side; HTML discovery still runs independently on both Host builds.
export function comparisonRows(base, candidate) {
  return {
    base: base === null ? candidate.filter(row => !row.introduced) : currentRows(base),
    candidate: currentRows(candidate),
  };
}

export function registeredPaths(rows, page, locale) {
  return rows.filter(row => row.page === page.id && localesOf(row).includes(locale))
    .map(row => row.entry.replaceAll("<project>", page.project));
}

export function removedManifestRows(base, candidate) {
  const entries = rows => rows.flatMap(row => localesOf(row).map(locale => `${row.page}/${locale} ${row.entry}`));
  const kept = new Set(entries(candidate));
  return entries(base).filter(entry => !kept.has(entry)).sort();
}
