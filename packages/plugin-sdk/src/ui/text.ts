import type { OwnedTextRef, TextArgs, TextDateStyle, TextNumberStyle, UiFormatTool, UiLocalePack, UiSayOptions, UiSayTool, UiTextProvider, UiTextTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { PLATFORM_TEXT_OWNER, SHARED_OWNER } from "../message-declarations.js";
import { escapeHtml } from "./html.js";
import { formatDate, formatNumber } from "./message-format.js";
import { uiTextErrors } from "./text-errors.js";
import { guarded, languageFor, packsProvider, prefixIndex, report, sayText, UI_TEXT_UNAVAILABLE, wordText } from "./text-lookup.js";
import { textArgs, textRefProblems } from "./text-ref.js";

export { UI_TEXT_UNAVAILABLE };

// What business code writes: `t` and `format`, with no language, no owner and no extra parameter (specs/font-and-skin-system/a-section-contract.md §5).
// Language and words come from a context the platform installs. It lives on the global, read on every call, and never in a variable of this module: a
// built-in plugin's release bundles its own copy of this SDK, and every copy in a realm has to see the one provider.

/** Carries a version: an external plugin bundles the SDK of the day it was published, so a change of the provider's shape installs under a new key. */
const CONTEXT_KEY = "molis.work.ui-text.v1";

function installedProvider(): UiTextProvider | null {
  const provider: unknown = Reflect.get(globalThis, Symbol.for(CONTEXT_KEY));
  return (provider as UiTextProvider | undefined) ?? null;
}

const noProvider = (what: string) => uiTextErrors.text_no_context(`调了 ${what}，但这个进程还没装文字上下文。写测试用 installTextForTest；要存下来以后才显示的句子，存 TextRef`);

/**
 * No provider at all is a wiring mistake, treated like a development path with no language. A Host installs its provider as it starts, so the mistake
 * shows on the first run: it does not wait in production for a timer to hit it.
 */
function requireProvider(what: string): UiTextProvider {
  const provider = installedProvider();
  if (provider === null) throw noProvider(what);
  return provider;
}

function keyText(key: string, args?: TextArgs): string {
  const what = `t("${key}")`;
  const provider = requireProvider(what);
  return guarded(provider, () => {
    const prefix = key.slice(0, Math.max(0, key.indexOf(".")));
    const owner = prefix === SHARED_OWNER ? PLATFORM_TEXT_OWNER : provider.ownerOfPrefix(prefix);
    const locale = languageFor(provider, owner, what);
    const list = args === undefined ? {} : { args: textArgs(args) };
    const text = wordText(provider, { owner, key, ...list }, locale);
    if (owner !== null) provider.produced?.(text, { owner, key, ...list });
    return text;
  }, UI_TEXT_UNAVAILABLE);
}

function sayPlain(ref: OwnedTextRef, options?: UiSayOptions): string {
  const provider = installedProvider();
  if (provider !== null) return sayText(provider, ref, options);
  if (textRefProblems(ref, { owned: true }).length > 0) return UI_TEXT_UNAVAILABLE;
  if ("literal" in ref) return ref.literal;
  throw noProvider(`say("${ref.key}")`);
}

/**
 * One sentence by key. The result goes straight into HTML text and attributes: a language pack has no markup characters and the whole text is
 * escaped, which for such words comes to escaping the arguments. `.text` gives the same sentence unescaped, for `textContent`, `new Option` and
 * widgets that escape for themselves; in HTML it is an injection.
 */
export const t: UiTextTool = /* @__PURE__ */ Object.assign((key: string, args?: TextArgs) => escapeHtml(keyText(key, args)), { text: keyText });

/**
 * A stored reference. The result goes into HTML with the whole text escaped once, always: a content pack's words and a literal may hold markup. So
 * `textContent = say(ref)` shows `R&amp;D`, and `esc(say(ref))` escapes twice. For those write `.text`; in HTML `.text` is an injection.
 */
export const say: UiSayTool = /* @__PURE__ */ Object.assign((ref: OwnedTextRef, options?: UiSayOptions) => escapeHtml(sayPlain(ref, options)), { text: sayPlain });

function formatted(what: string, last: string, write: (locale: string | undefined, problem: (code: string) => void) => string): string {
  const provider = requireProvider(what);
  // `format` has no `.text` and goes into HTML, and a bad date shows as it was written, so it escapes the way `t` does.
  return escapeHtml(guarded(provider, () => write(languageFor(provider, null, what) ?? undefined, (code) => report(provider, { code, key: what })), last));
}

/** Dates and numbers in the current language. The result goes into HTML like `t`'s. */
export const format: UiFormatTool = {
  date: (at: string, style: TextDateStyle) => formatted(`format.date("${at.slice(0, 40)}")`, at, (locale, problem) => formatDate(at, style, locale, { problem })),
  number: (value: number, style?: TextNumberStyle) => formatted("format.number", String(value), (locale) => formatNumber(value, locale, style)),
};

/**
 * Installs the context for this process and returns how to take it back. A process often runs several Hosts, so the same provider again changes
 * nothing, and what that returns does nothing; another provider has to wait for the first to be taken back.
 */
export function installUiText(provider: UiTextProvider): () => void {
  const slot = Symbol.for(CONTEXT_KEY);
  const current = installedProvider();
  if (current === provider) return () => undefined;
  if (current !== null) throw uiTextErrors.text_provider_conflict("这个进程已经装了另一个文字上下文：先调它的撤回函数");
  Reflect.set(globalThis, slot, provider);
  return () => {
    if (installedProvider() === provider) Reflect.deleteProperty(globalThis, slot);
  };
}

export interface TextForTest {
  /** The first pack of an owner is its default language. */
  readonly packs: readonly UiLocalePack[];
  /** `null` is what code outside a page sees: `t`, `format` and `say` without a `locale` throw `ui.text_no_context`. */
  readonly locale: string | null;
  readonly problem?: UiTextProvider["problem"];
}

/** For an author's tests and the two-package sample: words and a language in hand. Returns how to take them back. */
export function installTextForTest(input: TextForTest): () => void {
  return installUiText(packsProvider({ ...input, noContext: "throw", prefixes: prefixIndex(input.packs) }));
}
