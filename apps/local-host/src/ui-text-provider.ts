import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiLocalePack, UiResourceRow, UiTextProvider } from "@molis-ai/molis-work-contracts/platform/ui";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { BASELINE_REGISTRY } from "@molis-ai/molis-work-design-system";
import { pluginLocaleReader, type PluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { installUiText, localeMessageArguments, say, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { installCatalogTextScope, pluginTextForOwner, pluginTextOwnerOfPrefix, registerPlatformText, webLanguage, workbenchPlatformText, type DirectoryWordResolver, type PluginTextReader } from "@molis-ai/molis-work-app-workbench";
import { hostLog } from "./host-log.js";
import { runWithRegisteredText, textScope, DEFAULT_WEB_LOCALE } from "./web-locale.js";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { registeredPackageDirectory, registeredPluginLocaleFiles } from "./registered-plugin-files.js";

// The text context of this process (specs/font-and-skin-system/a-section-contract.md §5.2, §8.3): what `t`, `say` and `format` find on the global. The
// language is the scope's (`web-locale.ts`), which ends with the request or the run that opened it; plugin words come only from the exact activation. It does
// not depend on one Host: a process often opens several, and installing the same provider again changes nothing.

type TextProblem = Parameters<NonNullable<UiTextProvider["problem"]>>[0];

/** The problems kept for whoever looks (`hostTextProblems`), newest last, every one of them. The first of each kind is also a line of the Host's log. */
const PROBLEM_LIMIT = 200;
const problems: TextProblem[] = [];
/**
 * What the log already has, by code, owner and key: a word missing on a page, or a timer's `t` with no language, comes back on every render or round,
 * and is written once (as `host-log.ts`'s `repeatingFailure` does). Bounded: past the limit it starts again, so a line may come back, never grow without end.
 */
const LOGGED_LIMIT = 1000;
const logged = new Set<string>();

const readerFor = (owner: string) => {
  const { activation, registered } = textScope();
  return registered?.owner === owner ? registered : pluginTextForOwner(owner, activation);
};

const provider: UiTextProvider = {
  locale: () => textScope().locale,
  intlLocale: tag => webLanguage(tag)?.intl,
  noContext: () => textScope().noContext,
  ownerOfPrefix(prefix) {
    const { activation, registered } = textScope();
    return registered && textKeyPrefix(registered.owner) === prefix ? registered.owner : pluginTextOwnerOfPrefix(prefix, activation);
  },
  message(owner, key, locale) {
    const messages = readerFor(owner)?.pack(locale)?.messages;
    return messages && Object.hasOwn(messages, key) ? messages[key]! : null;
  },
  defaultLocale: owner => readerFor(owner)?.default ?? null,
  problem(problem) {
    problems.push(problem);
    if (problems.length > PROBLEM_LIMIT) problems.splice(0, problems.length - PROBLEM_LIMIT);
    const seen = JSON.stringify([problem.code, problem.owner ?? null, problem.key ?? null]);
    if (logged.has(seen)) return;
    if (logged.size >= LOGGED_LIMIT) logged.clear();
    logged.add(seen);
    // The key goes to the log, never to the page: it is how an author finds which sentence showed the platform's "cannot be shown".
    hostLog.warn("ui-text", problem.code.replace(/^ui\./u, "").replaceAll("_", "-"), undefined, { ...(problem.owner === undefined ? {} : { owner: problem.owner }), ...(problem.key === undefined ? {} : { key: problem.key }), ...(problem.locale === undefined ? {} : { locale: problem.locale }) });
  },
};

/** The text problems this process met, newest last, at most 200: a word not found, a sentence with no language in production. */
export function hostTextProblems(): readonly TextProblem[] {
  return [...problems];
}

/** A platform owner has no Manifest: the first web language is its default, the one a page with no choice shows. */
const PLATFORM_DEFAULT_LOCALE = DEFAULT_WEB_LOCALE;

/**
 * A platform owner's language directory, a `locale` row of the resource registry (§1.2): adding an owner is a row, adding a language a file. Nothing is read
 * until a word of it is asked for; then each language's file once, through the rules a plugin's files go through (`pluginLocaleReader`).
 */
function platformLocaleReader(row: UiResourceRow): PluginTextReader {
  let reader: PluginLocaleReader | null = null;
  const open = (): PluginLocaleReader => {
    if (reader !== null) return reader;
    const directory = join(registeredPackageDirectory(row.package), row.path);
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

let platformText: readonly PluginTextReader[] | null = null;
const registeredWords = new WeakMap<PluginManifest, PluginLocaleReader | null>();

/** Only the actual build registration has this source. A Manifest with the same id is not that registration. */
export function registeredBuiltinText(manifest: PluginManifest): PluginLocaleReader | null {
  if (registeredWords.has(manifest)) return registeredWords.get(manifest)!;
  const entry = PLATFORM_PLUGIN_REGISTRATIONS.find(item => item.manifest === manifest);
  if (!entry) return null;
  const reader = pluginLocaleReader(manifest, registeredPluginLocaleFiles(entry.package_name, manifest));
  registeredWords.set(manifest, reader);
  return reader;
}

/** A directory may draw an exact live owner, or use the same field's raw original if it no longer has that source. */
export function directoryWordResolver(reader: PluginTextReader | null): DirectoryWordResolver {
  return (ref, original) => {
    if (ref.key.startsWith("common.")) {
      const locale = textScope().locale ?? DEFAULT_WEB_LOCALE, common = workbenchPlatformText;
      const value = common.pack(locale)?.messages[ref.key] ?? common.pack(common.default)?.messages[ref.key];
      if (value !== undefined && localeMessageArguments(value).length) {
        provider.problem?.({ code: "ui.text_missing", owner: common.owner, key: ref.key, locale });
        return original;
      }
      return say.text({ ...ref, fallback: original });
    }
    if (reader?.owner !== ref.owner) {
      provider.problem?.({ code: "ui.text_missing", owner: ref.owner, key: ref.key, locale: textScope().locale ?? DEFAULT_WEB_LOCALE });
      return original;
    }
    return runWithRegisteredText(reader, () => say.text({ ...ref, fallback: original }));
  };
}

export function drawRegisteredText<T>(manifest: PluginManifest, draw: (resolve?: DirectoryWordResolver) => T): T {
  const reader = registeredBuiltinText(manifest);
  const resolve = directoryWordResolver(reader);
  return reader ? runWithRegisteredText(reader, () => draw(resolve)) : draw(resolve);
}

/**
 * Installs the context, once a process: an application Host as it starts, the developer door before it runs a plugin. The platform's own owners are
 * registered the first time. A process that already has another context (a test's `installTextForTest`) keeps it, and this throws.
 */
export function installHostUiText(): void {
  if (platformText === null) {
    platformText = BASELINE_REGISTRY.resources.filter(row => row.kind === "locale").map(row => row.owner === workbenchPlatformText.owner ? workbenchPlatformText : platformLocaleReader(row));
    platformText.forEach(registerPlatformText);
    installCatalogTextScope(drawRegisteredText);
  }
  installUiText(provider);
}

/** Each pack keeps its own grammar. Supply the selected words plus only the default words that fill missing keys. */
export function projectTextPacks(reader: PluginTextReader, locale: string, declared: boolean, sharedOnly = false): UiLocalePack[] {
  const requested = reader.pack(locale), baseline = locale === reader.default ? requested : reader.pack(reader.default);
  if (!baseline || (declared && !requested)) throw new ActionError("actions.unavailable", "界面语言包不可用，请重试");
  const messages = (pack: UiLocalePack, excluding?: UiLocalePack) => Object.fromEntries(Object.entries(pack.messages)
    .filter(([key]) => (!sharedOnly || key.startsWith("common.")) && (!excluding || !Object.hasOwn(excluding.messages, key))));
  if (!requested || baseline === requested) return [{ ...baseline, messages: messages(baseline) }];
  const fallback = messages(baseline, requested);
  return [...(Object.keys(fallback).length ? [{ ...baseline, messages: fallback }] : []), { ...requested, messages: messages(requested) }];
}

/** An installed worker can see its own release and the public common words. The trusted broker supplies its locale. */
export function sandboxTextPacks(own: PluginLocaleReader | null | undefined): (locale: string) => readonly UiLocalePack[] {
  return locale => {
    installHostUiText();
    const shared = pluginTextForOwner("workbench");
    return [...(own ? projectTextPacks(own, locale, own.available.includes(locale)) : []), ...(shared ? projectTextPacks(shared, locale, true, true) : [])];
  };
}
