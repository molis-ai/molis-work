// What the CI product subset runs, and the rules its two files must keep (specs/repository-anti-corruption §4.7, W2-16, decision #14).
//
//   tests/ci-product-subset.txt   one test file per line (`tests/<name>.test.ts` or `.test.mjs`); blank lines and lines that start
//                                 with # are comments. Non-browser files and 3 to 5 browser smokes in one list: a file the
//                                 Linux probe's rules (scripts/ci-linux-probe/select.mjs) call a browser file is a smoke.
//   tests/quarantine.json         { "entries": [ { file, owner, since, expires, reason } ] }: a file of the list that is flaky
//                                 right now. It stays in the list but its result does not count; every entry has an owner and
//                                 an end date, and the end date is at most 30 days after `since`.
//
// This module only reads and judges the two files, with no clock for the static rules, so the health gate (scripts/gates/
// product-subset.mjs, `pnpm health:check`) and the runner (scripts/ci-product-subset.mjs) read them the same way. Node built-ins
// only: it runs before any dependency is installed.
//
// Why quarantine is a list with an end and not a skip: nothing in a test file is skipped or loosened. A quarantined file keeps
// being run by the runner (after the files that count, with whatever time is left) and by the Linux probe and every local run;
// only the verdict of the subset ignores it, until the end date. When the date passes the file counts again, whether anyone
// remembered or not, and an entry cannot be renewed past 30 days from `since`: after that the file is fixed, or taken out of the list
// on purpose in a reviewed change (docs/system/PARALLEL-DEVELOPMENT.md, section on the product subset).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { classifyFile } from "../ci-linux-probe/select.mjs";

export const LIST_FILE = "tests/ci-product-subset.txt";
export const QUARANTINE_FILE = "tests/quarantine.json";
const CODEOWNERS_FILE = ".github/CODEOWNERS";

/** The browser smokes: enough to say the workbench starts and its main surfaces work, few enough to stay fast and steady. */
export const BROWSER_SMOKES = { min: 3, max: 5 };
/** Quarantine is short and small on purpose. `maxDays` counts from `since` to `expires`. */
export const QUARANTINE_LIMITS = { maxEntries: 10, maxDays: 30, minReasonCharacters: 20 };
/** Files the list may never lose without changing this module in review: W2-16 asks for the i18n test in CI. */
export const REQUIRED_ENTRIES = ["tests/i18n.test.ts"];

const ENTRY = /^tests\/[A-Za-z0-9][A-Za-z0-9._-]*\.test\.(?:ts|mjs)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HANDLE = /^@[A-Za-z0-9][A-Za-z0-9-]*(?:\/[A-Za-z0-9._-]+)?$/;
const QUARANTINE_FIELDS = ["file", "owner", "since", "expires", "reason"];
const DAY = 24 * 60 * 60 * 1000;

/** The day count of an ISO date (`2026-10-09`), or null when it is not a real calendar date. */
export function dayNumber(date) {
  if (typeof date !== "string" || !DATE.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== date ? null : time / DAY;
}

/** The list file as text: its entries in order, and what is wrong with it. */
export function parseList(text) {
  const entries = [];
  const problems = [];
  const seen = new Map();
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const where = `${LIST_FILE}:${index + 1}`;
    if (!ENTRY.test(line)) { problems.push(`${where}: "${line}" is not a path like tests/<name>.test.ts (one per line; a comment starts with #)`); return; }
    if (seen.has(line)) { problems.push(`${where}: ${line} is listed twice (first at line ${seen.get(line)})`); return; }
    seen.set(line, index + 1);
    entries.push({ file: line, line: index + 1 });
  });
  return { entries, problems };
}

/** The quarantine file as text: its entries, and what is wrong with them (shape, dates, owner shape). */
export function parseQuarantine(text) {
  const problems = [];
  let parsed;
  try { parsed = JSON.parse(text); } catch (error) { return { entries: [], problems: [`${QUARANTINE_FILE}: not valid JSON (${error instanceof Error ? error.message : String(error)})`] }; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || !Array.isArray(parsed.entries)) {
    return { entries: [], problems: [`${QUARANTINE_FILE}: needs an object with an "entries" array`] };
  }
  const extra = Object.keys(parsed).filter((key) => key !== "entries" && key !== "note");
  if (extra.length) problems.push(`${QUARANTINE_FILE}: unknown top-level field ${extra.map((key) => `"${key}"`).join(", ")} (only "entries" and "note")`);
  const entries = [];
  const seen = new Set();
  parsed.entries.forEach((entry, index) => {
    const where = `${QUARANTINE_FILE} entry ${index + 1}${entry && typeof entry.file === "string" ? ` (${entry.file})` : ""}`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) { problems.push(`${where}: must be an object with ${QUARANTINE_FIELDS.join(", ")}`); return; }
    const unknown = Object.keys(entry).filter((key) => !QUARANTINE_FIELDS.includes(key));
    if (unknown.length) problems.push(`${where}: unknown field ${unknown.map((key) => `"${key}"`).join(", ")}`);
    for (const key of QUARANTINE_FIELDS) if (typeof entry[key] !== "string" || !entry[key].trim()) problems.push(`${where}: "${key}" must be a non-empty string`);
    if (typeof entry.file === "string") {
      if (!ENTRY.test(entry.file)) problems.push(`${where}: "file" is not a path like tests/<name>.test.ts`);
      if (seen.has(entry.file)) problems.push(`${where}: ${entry.file} has two entries`);
      seen.add(entry.file);
    }
    if (typeof entry.owner === "string" && entry.owner.trim() && !HANDLE.test(entry.owner)) problems.push(`${where}: "owner" must be an account like @name, not "${entry.owner}"`);
    const since = dayNumber(entry.since);
    const expires = dayNumber(entry.expires);
    if (typeof entry.since === "string" && entry.since.trim() && since === null) problems.push(`${where}: "since" must be a real date written YYYY-MM-DD, not "${entry.since}"`);
    if (typeof entry.expires === "string" && entry.expires.trim() && expires === null) problems.push(`${where}: "expires" must be a real date written YYYY-MM-DD, not "${entry.expires}"`);
    if (since !== null && expires !== null) {
      if (expires < since) problems.push(`${where}: "expires" ${entry.expires} is before "since" ${entry.since}`);
      else if (expires - since > QUARANTINE_LIMITS.maxDays) {
        problems.push(`${where}: "expires" is ${expires - since} days after "since"; a quarantine lasts at most ${QUARANTINE_LIMITS.maxDays} days from the day it began, then the test is fixed or taken out of the list in a reviewed change`);
      }
    }
    if (typeof entry.reason === "string" && entry.reason.trim() && entry.reason.replace(/\s+/g, "").length < QUARANTINE_LIMITS.minReasonCharacters) {
      problems.push(`${where}: "reason" needs at least ${QUARANTINE_LIMITS.minReasonCharacters} characters that say how it fails and where you saw it`);
    }
    entries.push(entry);
  });
  return { entries, problems };
}

const owners = (root) => {
  const file = path.join(root, CODEOWNERS_FILE);
  if (!existsSync(file)) return null;
  const handles = new Set();
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) if (!line.trim().startsWith("#")) for (const word of line.split(/\s+/)) if (word.startsWith("@")) handles.add(word);
  return handles;
};

/**
 * Reads both files under `root` and judges them. `applies` is false when neither file exists (a repository without the product
 * subset: the scratch repositories of the other gates' tests). `entries` carry each file's marks; `browser` is whether it is a smoke.
 * No clock is read: whether an entry has run out is `resolvePlan`'s question, asked with a date.
 */
export function readPlan(root) {
  const problems = [];
  const listPath = path.join(root, LIST_FILE);
  const quarantinePath = path.join(root, QUARANTINE_FILE);
  const hasList = existsSync(listPath);
  const hasQuarantine = existsSync(quarantinePath);
  if (!hasList && !hasQuarantine) return { applies: false, entries: [], quarantine: [], problems };
  if (!hasList) problems.push(`${LIST_FILE} is missing (${QUARANTINE_FILE} is there)`);
  if (!hasQuarantine) problems.push(`${QUARANTINE_FILE} is missing (${LIST_FILE} is there); an empty one is {"entries": []}`);

  const listed = hasList ? parseList(readFileSync(listPath, "utf8")) : { entries: [], problems: [] };
  problems.push(...listed.problems);
  const entries = listed.entries.map(({ file, line }) => {
    if (!existsSync(path.join(root, file))) { problems.push(`${LIST_FILE}:${line}: ${file} does not exist (renamed or deleted: change the line, or remove it)`); return { file, line, marks: [], browser: false, missing: true }; }
    const { marks } = classifyFile(root, file);
    const browser = marks.includes("browser");
    if (marks.includes("live")) problems.push(`${LIST_FILE}:${line}: ${file} is a live file (it reaches a real model or service when opted in); the subset runs without those opt-ins, so most of it would only skip`);
    if (!browser && marks.includes("darwin")) problems.push(`${LIST_FILE}:${line}: ${file} touches macOS-only paths or tools (marked darwin by the Linux probe's rules); the subset runs on Linux`);
    return { file, line, marks, browser };
  });

  const smokes = entries.filter((entry) => entry.browser);
  if (hasList && (smokes.length < BROWSER_SMOKES.min || smokes.length > BROWSER_SMOKES.max)) {
    problems.push(`${LIST_FILE}: ${smokes.length} browser smokes listed, between ${BROWSER_SMOKES.min} and ${BROWSER_SMOKES.max} are expected${smokes.length ? ` (${smokes.map((entry) => entry.file).join(", ")})` : ""}; the subset checks that the workbench works, the browser suite stays on the local machine`);
  }
  if (hasList) for (const required of REQUIRED_ENTRIES) if (!entries.some((entry) => entry.file === required)) problems.push(`${LIST_FILE}: ${required} has to be in the list (spec §4.7, W2-16: the i18n test runs in CI)`);

  const quarantined = hasQuarantine ? parseQuarantine(readFileSync(quarantinePath, "utf8")) : { entries: [], problems: [] };
  problems.push(...quarantined.problems);
  if (quarantined.entries.length > QUARANTINE_LIMITS.maxEntries) problems.push(`${QUARANTINE_FILE}: ${quarantined.entries.length} entries, at most ${QUARANTINE_LIMITS.maxEntries}; fix the flaky tests before quarantining more`);
  const handles = owners(root);
  const listedFiles = new Set(entries.map((entry) => entry.file));
  for (const entry of quarantined.entries) {
    if (typeof entry.file === "string" && ENTRY.test(entry.file) && hasList && !listedFiles.has(entry.file)) problems.push(`${QUARANTINE_FILE}: ${entry.file} is not in ${LIST_FILE}; an entry for a file the subset does not run is left over, delete it`);
    if (handles && typeof entry.owner === "string" && HANDLE.test(entry.owner) && !handles.has(entry.owner)) problems.push(`${QUARANTINE_FILE}: owner ${entry.owner} of ${entry.file} is not an account in ${CODEOWNERS_FILE}`);
  }
  const held = new Set(quarantined.entries.map((entry) => entry.file));
  const counted = smokes.filter((entry) => !held.has(entry.file));
  if (hasList && smokes.length >= BROWSER_SMOKES.min && counted.length < BROWSER_SMOKES.min) {
    problems.push(`${QUARANTINE_FILE}: ${smokes.length - counted.length} of ${smokes.length} browser smokes are quarantined, which leaves ${counted.length} that count; at least ${BROWSER_SMOKES.min} must (add a smoke, or fix the quarantined one)`);
  }
  return { applies: true, entries, quarantine: quarantined.entries, problems };
}

/**
 * Which files the run counts and which it only watches, on the day `today` (YYYY-MM-DD). A quarantine holds through its `expires`
 * day; the day after, the file counts again and `expired` says so.
 */
export function resolvePlan(plan, today) {
  const byFile = new Map(plan.quarantine.filter((entry) => typeof entry.file === "string").map((entry) => [entry.file, entry]));
  const counted = [];
  const held = [];
  const expired = [];
  for (const entry of plan.entries) {
    if (entry.missing) continue;
    const quarantine = byFile.get(entry.file);
    if (!quarantine) counted.push(entry);
    else if (quarantine.expires >= today) held.push({ ...entry, quarantine });
    else { const returning = { ...entry, expiredQuarantine: quarantine }; counted.push(returning); expired.push(returning); }
  }
  return { counted, held, expired };
}
