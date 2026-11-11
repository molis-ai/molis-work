import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { repeatingFailure } from "./host-log.js";
import { resolveConfiguredHome } from "./product-home.js";
import { isWebLocale, resolveWebLocale, type WebLocale } from "./web-locale.js";

/**
 * The language the person last used on this Home, for the work no page starts: a timed round, a continuation. It decides no page's
 * display (each browser keeps its own Cookie), so with two browsers such work follows whichever moved last. Written when the person
 * switches language or sends to the Assistant, never because a page was merely opened. Only this file touches it.
 */
export const UI_LOCALE_RELATIVE_PATH = path.join("config", "ui-locale.json");
const SCHEMA_VERSION = /* @version format.ui.last-locale */ 1;

interface Remembered {
  readonly locale: WebLocale | null;
  /** A later version of the program wrote the file: it reads as nothing here, and is not overwritten. */
  readonly newer: boolean;
}

/** One Home has one executing process, so after the first read the record lives here. A read that failed is not kept: the next one tries again. */
const remembered = new Map<string, Remembered>();
const readFailures = repeatingFailure("ui_locale", "read_failed");
const writeFailures = repeatingFailure("ui_locale", "write_failed");

function parse(text: string): Remembered {
  const { schema_version: version, locale } = JSON.parse(text) as Record<string, unknown>;
  if (typeof version === "number" && version > SCHEMA_VERSION) return { locale: null, newer: true };
  if (version !== SCHEMA_VERSION || !isWebLocale(locale)) throw new Error("ui-locale.json is not a record of this version");
  return { locale, newer: false };
}

/** What the file says now; `null` when it could not be read, since then it is not known whether a later version wrote it. */
function load(file: string): Remembered | null {
  const known = remembered.get(file);
  if (known) return known;
  let text: string | null = null;
  try { text = readFileSync(file, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") { readFailures.failed(file, error); return null; }
  }
  let found: Remembered = { locale: null, newer: false };
  // A damaged file is an empty record, which the next change replaces.
  if (text !== null) try { found = parse(text); } catch (error) { readFailures.failed(file, error); }
  remembered.set(file, found);
  return found;
}

const fileOf = (home: string) => path.join(resolveConfiguredHome(home), UI_LOCALE_RELATIVE_PATH);

/** The language last used, or `null` when none is remembered or the record cannot be read. */
export function readUiLocale(home: string): WebLocale | null {
  return load(fileOf(home))?.locale ?? null;
}

/** The language for work that starts now with no page: the one last used, or the default for someone with no record. */
export function lastUsedLocale(home: string): WebLocale {
  return readUiLocale(home) ?? resolveWebLocale();
}

/** Remember the language the person now uses. Best effort: a failure is written once, never gets in the way of the request, and the next call tries again. */
export function rememberUiLocale(home: string, locale: unknown): void {
  if (!isWebLocale(locale)) return;
  const file = fileOf(home), current = load(file);
  if (!current || current.newer || current.locale === locale) return;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const staging = `${file}.${process.pid}.tmp`;
    writeFileSync(staging, `${JSON.stringify({ schema_version: SCHEMA_VERSION, locale }, null, 2)}\n`, { mode: 0o600 });
    renameSync(staging, file);
    writeFailures.worked(file);
    remembered.set(file, { locale, newer: false });
  } catch (error) { writeFailures.failed(file, error); }
}
