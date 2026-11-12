import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const UI_LOCALE_RELATIVE_PATH = join("config", "ui-locale.json");
const SCHEMA_VERSION = /* @version format.ui.last-locale */ 1;

export interface AppearanceLocaleOptions<Locale extends string> {
  readonly defaultLocale: Locale;
  readonly isSupported: (value: unknown) => value is Locale;
  readonly readFailed: (file: string, error: unknown) => void;
  readonly writeFailed: (file: string, error: unknown) => void;
  readonly writeSucceeded: (file: string) => void;
}

interface Remembered<Locale extends string> {
  readonly locale: Locale | null;
  readonly newer: boolean;
}

/** Remembers what was last used for work that has no page. Page and native-window choices stay in their own entry points. */
export function createLocaleMemory<Locale extends string>(home: string, options: AppearanceLocaleOptions<Locale>) {
  const file = join(home, UI_LOCALE_RELATIVE_PATH);
  let remembered: Remembered<Locale> | undefined;

  function parse(text: string): Remembered<Locale> {
    const { schema_version: version, locale } = JSON.parse(text) as Record<string, unknown>;
    if (typeof version === "number" && version > SCHEMA_VERSION) return { locale: null, newer: true };
    if (version !== SCHEMA_VERSION || !options.isSupported(locale)) throw new Error("ui-locale.json is not a record of this version");
    return { locale, newer: false };
  }

  function load(): Remembered<Locale> | null {
    if (remembered) return remembered;
    let text: string | undefined;
    try { text = readFileSync(file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") { options.readFailed(file, error); return null; }
    }
    let found: Remembered<Locale> = { locale: null, newer: false };
    // A damaged file is an empty record, which the next explicit language change replaces.
    if (text !== undefined) try { found = parse(text); } catch (error) { options.readFailed(file, error); }
    return remembered = found;
  }

  return {
    read: (): Locale | null => load()?.locale ?? null,
    lastUsed: (): Locale => load()?.locale ?? options.defaultLocale,
    remember(locale: unknown): void {
      if (!options.isSupported(locale)) return;
      const current = load();
      if (!current || current.newer || current.locale === locale) return;
      try {
        mkdirSync(dirname(file), { recursive: true });
        const staging = `${file}.${process.pid}.tmp`;
        writeFileSync(staging, `${JSON.stringify({ schema_version: SCHEMA_VERSION, locale }, null, 2)}\n`, { mode: 0o600 });
        renameSync(staging, file);
        options.writeSucceeded(file);
        remembered = { locale, newer: false };
      } catch (error) { options.writeFailed(file, error); }
    },
  };
}
