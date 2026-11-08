import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { UiResourceRow, UiTextProvider } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { pluginLocaleReader, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { installUiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pluginTextDefault, pluginTextMessage, pluginTextOwnerOfPrefix, registerPluginText, type PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import { hostLog } from "./host-log.js";
import { textScope, WEB_LOCALES } from "./web-locale.js";

// The text context of this process (specs/font-and-skin-system/a-section-contract.md §5.2, §8.3): what `t`, `say` and `format` find on the global. The
// language is the scope's (`web-locale.ts`), which ends with the request or the run that opened it; the words are the owners' in `plugin-text.ts`. It does
// not depend on one Host: a process often opens several, and installing the same provider again changes nothing.

type TextProblem = Parameters<NonNullable<UiTextProvider["problem"]>>[0];

/** The problems kept for whoever looks (`hostTextProblems`), newest last. Each is also a line of the Host's log. */
const PROBLEM_LIMIT = 200;
const problems: TextProblem[] = [];

const provider: UiTextProvider = {
  locale: () => textScope().locale,
  noContext: () => textScope().noContext,
  ownerOfPrefix: pluginTextOwnerOfPrefix,
  message: pluginTextMessage,
  defaultLocale: pluginTextDefault,
  problem(problem) {
    problems.push(problem);
    if (problems.length > PROBLEM_LIMIT) problems.splice(0, problems.length - PROBLEM_LIMIT);
    // The key goes to the log, never to the page: it is how an author finds which sentence showed the platform's "cannot be shown".
    hostLog.warn("ui-text", problem.code.replace(/^ui\./u, "").replaceAll("_", "-"), undefined, { ...(problem.owner === undefined ? {} : { owner: problem.owner }), ...(problem.key === undefined ? {} : { key: problem.key }), ...(problem.locale === undefined ? {} : { locale: problem.locale }) });
  },
};

/** The text problems this process met, newest last, at most 200: a word not found, a sentence with no language in production. */
export function hostTextProblems(): readonly TextProblem[] {
  return [...problems];
}

/** A platform owner has no Manifest: the first web language is its default, the one a page with no choice shows. */
const PLATFORM_DEFAULT_LOCALE = WEB_LOCALES[0];

/** The directory a package is in: from its entry up to the `package.json` that names it. The same in a checkout and in a release's `node_modules`. */
function packageDirectory(name: string): string {
  let directory = dirname(fileURLToPath(import.meta.resolve(name)));
  for (;;) {
    const file = join(directory, "package.json");
    if (existsSync(file) && (JSON.parse(readFileSync(file, "utf8")) as { name?: unknown }).name === name) return directory;
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`找不到 ${name} 的包目录`);
    directory = parent;
  }
}

/**
 * A platform owner's language directory, a `locale` row of the resource registry (§1.2): adding an owner is a row, adding a language a file. Nothing is read
 * until a word of it is asked for; then each language's file once, through the rules a plugin's files go through (`pluginLocaleReader`).
 */
function platformLocaleReader(row: UiResourceRow): PluginTextReader {
  let reader: PluginLocaleReader | null = null;
  const open = (): PluginLocaleReader => {
    if (reader !== null) return reader;
    const directory = join(packageDirectory(row.package), row.path);
    const available = readdirSync(directory).filter((name) => name.endsWith(".json")).map((name) => name.slice(0, -".json".length)).sort();
    const read = (path: string) => { const file = join(directory, basename(path)); return existsSync(file) ? readFileSync(file, "utf8") : null; };
    reader = pluginLocaleReader({ plugin_id: row.owner, kind: "platform", ui: { locales: { default: PLATFORM_DEFAULT_LOCALE, available } } }, read)!;
    return reader;
  };
  return {
    owner: row.owner,
    default: PLATFORM_DEFAULT_LOCALE,
    pack(locale) {
      const opened = open(), seen = opened.problems().length;
      const pack = opened.pack(locale);
      // A broken file of the product's own is a build defect (`tests/ui-resources.test.ts` parses them); here it shows the default's word, and says so once.
      for (const problem of opened.problems().slice(seen)) provider.problem?.({ code: problem.code, owner: row.owner, locale: problem.locale });
      return pack;
    },
  };
}

let platformText: readonly (() => void)[] | null = null;

/**
 * Installs the context, once a process: an application Host as it starts, the developer door before it runs a plugin. The platform's own owners are
 * registered the first time. A process that already has another context (a test's `installTextForTest`) keeps it, and this throws.
 */
export function installHostUiText(): void {
  platformText ??= BASELINE_REGISTRY.resources.filter((row) => row.kind === "locale").map((row) => registerPluginText(platformLocaleReader(row), { t: true }));
  installUiText(provider);
}
