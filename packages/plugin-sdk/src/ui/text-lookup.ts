import type { OwnedTextRef, TextArg, UiLocalePack, UiMessage, UiSayOptions, UiTextProvider } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLATFORM_TEXT_OWNER } from "../message-declarations.js";
import { formatMessage } from "./message-format.js";
import { uiTextErrors } from "./text-errors.js";
import { refuseSharedTextPrefix, textKeyPrefix, textRefProblems } from "./text-ref.js";

// Finding a word (specs/font-and-skin-system/a-section-contract.md §2.3, §5.2). Not published: `t` and `say` read a provider from the global context,
// `createTextReader` builds one from language packs, and both come here. Everything answers in plain text; a caller escapes once, on the whole text.

/** The last words the SDK has of its own: an author with only the two public packages has no workbench language pack to find the platform's sentence in. */
export const UI_TEXT_UNAVAILABLE = "…";
const UNAVAILABLE_KEY = "common.text.unavailable";

type TextProblem = Parameters<NonNullable<UiTextProvider["problem"]>>[0];

/** Whatever watches for problems cannot fail the sentence it is being told about. */
export function report(provider: UiTextProvider, problem: TextProblem): void {
  try {
    provider.problem?.(problem);
  } catch {
    // The sentence still shows. A sink that fails is the sink's own problem to surface.
  }
}

/**
 * In production a failure in here must not take the Host down, or replace the error a sentence was describing (design §5.2): it gives `last`. In a
 * development path and a test, where the mistake can be fixed, it is thrown.
 */
export function guarded(provider: UiTextProvider, work: () => string, last: string): string {
  try {
    return work();
  } catch (error) {
    if (provider.noContext() === "throw") throw error;
    report(provider, { code: "ui.text_read_failed" });
    return last;
  }
}

/** The language to answer in: the context's, or the owner's default in production, where a missing one is reported rather than thrown. */
export function languageFor(provider: UiTextProvider, owner: string | null, what: string): string | null {
  const locale = provider.locale();
  if (locale !== null) return locale;
  if (provider.noContext() === "throw") throw uiTextErrors.text_no_context(`没有语言时调了 ${what}。它在没有页面的地方运行：要存下来以后才显示的句子，存 TextRef，显示时才查`);
  report(provider, { code: "ui.text_no_context", ...(owner === null ? {} : { owner }), key: what });
  return provider.defaultLocale(owner ?? PLATFORM_TEXT_OWNER);
}

/** The tag and the languages it falls back through inside its own language: zh-Hans-CN, zh-Hans, zh. */
export function localeChain(tag: string): string[] {
  const parts = tag.split("-");
  return parts.map((_, index) => parts.slice(0, parts.length - index).join("-"));
}

interface Found { readonly message: UiMessage; readonly locale: string }

/** The chosen language and its base keep the chosen tag, whose `Intl` is more exact; the owner's default language formats in that language, so a sentence reads as one. */
function findMessage(provider: UiTextProvider, owner: string, key: string, locale: string): Found | null {
  for (const tag of localeChain(locale)) {
    const message = provider.message(owner, key, tag);
    if (message !== null) return { message, locale };
  }
  const fallback = provider.defaultLocale(owner);
  const message = fallback === null ? null : provider.message(owner, key, fallback);
  return message === null || fallback === null ? null : { message, locale: fallback };
}

/** The platform's sentence for "this cannot be read". Never a bare key, never blank. */
function unavailableText(provider: UiTextProvider, locale: string | null): string {
  const language = locale ?? provider.locale() ?? provider.defaultLocale(PLATFORM_TEXT_OWNER);
  const found = language === null ? null : findMessage(provider, PLATFORM_TEXT_OWNER, UNAVAILABLE_KEY, language);
  return typeof found?.message === "string" ? found.message : UI_TEXT_UNAVAILABLE;
}

export interface Word {
  readonly owner: string | null;
  readonly key: string;
  readonly args?: readonly TextArg[];
  readonly fallback?: string;
}

/** Chosen language, its base, the owner's default, the reference's own fallback, then the platform's sentence. */
export function wordText(provider: UiTextProvider, word: Word, locale: string | null): string {
  const about = { ...(word.owner === null ? {} : { owner: word.owner }), key: word.key, ...(locale === null ? {} : { locale }) };
  const problem = (code: string) => report(provider, { code, ...about });
  const found = word.owner === null || locale === null ? null : findMessage(provider, word.owner, word.key, locale);
  if (found !== null) return formatMessage(found.message, word.args, found.locale, { problem });
  problem("ui.text_missing");
  return word.fallback === undefined ? unavailableText(provider, locale) : formatMessage(word.fallback, word.args, locale ?? undefined, { problem });
}

/** `say`, in plain text. A reference that cannot be read is reported and shows the platform's sentence: a page does not break over one sentence. */
export function sayText(provider: UiTextProvider, ref: OwnedTextRef, options: UiSayOptions = {}): string {
  const extra = options.extra ?? [];
  const merged = extra.length > 0 && "key" in ref ? { ...ref, args: [...(ref.args ?? []), ...extra] } : ref;
  if (textRefProblems(merged, { owned: true }).length > 0) {
    report(provider, { code: "ui.text_ref_invalid" });
    return guarded(provider, () => unavailableText(provider, options.locale ?? null), UI_TEXT_UNAVAILABLE);
  }
  if ("literal" in merged && merged.literal !== undefined) return merged.literal;
  // A `literal` written as undefined beside a key is not one (`textRefProblems` reads it the same way): this is the key.
  const keyed = merged as Extract<OwnedTextRef, { key: string }>;
  return guarded(provider, () => {
    const locale = options.locale === undefined ? languageFor(provider, keyed.owner, `say("${keyed.key}")`) : options.locale ?? provider.defaultLocale(keyed.owner);
    const text = wordText(provider, keyed, locale);
    provider.produced?.(text, keyed);
    return text;
  }, keyed.fallback ?? UI_TEXT_UNAVAILABLE);
}

/** For `t`: the first segment of a key to its full owner. Two owners of one name would answer each other's keys, so this is where that stops. */
export function prefixIndex(packs: readonly UiLocalePack[]): ReadonlyMap<string, string> {
  const owners = new Map<string, string>();
  for (const { owner } of packs) {
    const name = textKeyPrefix(owner);
    refuseSharedTextPrefix(owners.get(name), owner);
    owners.set(name, owner);
  }
  return owners;
}

export interface PacksProviderInput {
  readonly packs: readonly UiLocalePack[];
  readonly locale: string | null;
  readonly noContext: "default" | "throw";
  readonly prefixes?: ReadonlyMap<string, string>;
  readonly problem?: UiTextProvider["problem"];
}

/** A provider over language packs in hand. The first pack of an owner is its default language. */
export function packsProvider(input: PacksProviderInput): UiTextProvider {
  const byOwner = new Map<string, Map<string, UiLocalePack>>();
  for (const pack of input.packs) byOwner.set(pack.owner, (byOwner.get(pack.owner) ?? new Map<string, UiLocalePack>()).set(pack.locale, pack));
  return {
    locale: () => input.locale,
    noContext: () => input.noContext,
    ownerOfPrefix: (prefix) => input.prefixes?.get(prefix) ?? null,
    message(owner, key, locale) {
      const messages = byOwner.get(owner)?.get(locale)?.messages;
      return messages !== undefined && Object.hasOwn(messages, key) ? messages[key]! : null;
    },
    defaultLocale: (owner) => byOwner.get(owner)?.keys().next().value ?? null,
    ...(input.problem === undefined ? {} : { problem: input.problem }),
  };
}
