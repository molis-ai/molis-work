import type { OwnedTextRef, UiLocalePack, UiSayOptions, UiSayTool, UiTextProvider } from "@molis-ai/molis-work-contracts/platform/ui";
import { escapeHtml } from "./html.js";
import { packsProvider, sayText } from "./text-lookup.js";

export interface TextReaderInput {
  /** The first pack of an owner is its default language. */
  readonly packs: readonly UiLocalePack[];
  /** `null` reads each owner's default language. */
  readonly locale: string | null;
  readonly intlLocale?: UiTextProvider["intlLocale"];
  readonly problem?: UiTextProvider["problem"];
}

/**
 * Words from language packs in hand, for what is not installed: a package's preview, `plugins.bundled.list@1`. Reads like `say`: the call itself
 * gives text for HTML with the whole of it escaped, because a content pack's words may hold markup characters, and `.text` gives plain text, which in
 * HTML is an injection. It takes bound references: bind a declared one with `tryOwnedTextRef` and the package's plugin_id.
 */
export function createTextReader(input: TextReaderInput): UiSayTool {
  const provider = packsProvider({ ...input, noContext: "default" });
  const plain = (ref: OwnedTextRef, options?: UiSayOptions) => sayText(provider, ref, input.locale === null && options?.locale === undefined ? { ...options, locale: null } : options);
  return Object.assign((ref: OwnedTextRef, options?: UiSayOptions) => escapeHtml(plain(ref, options)), { text: plain });
}
