import type { UiFormatTool, UiLocalePack, UiSayTool, UiTextTool } from "@molis-ai/molis-work-contracts/platform/ui";
import { createTextReader, format, installUiText, refuseSharedTextPrefix, say, t, textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { createProducedLog, mergeLocaleText } from "./locale-switch.js";

declare global {
  var t: UiTextTool;
  var say: UiSayTool;
  var format: UiFormatTool;
  var molisWorkRetitleRegion: ((root: ParentNode, before: string, after: string) => void) | undefined;
}

/** A document answers only from the packs the Host projected into this realm. Switching the projection does not replace the SDK tools. */
export function installLanguageText(initial: string, initialPacks: readonly UiLocalePack[], initialIntl?: (tag: string) => string | undefined) {
  const produced = createProducedLog();
  let locale = initial, packs = initialPacks, intlLocale = initialIntl;
  let prefixes = new Map<string, string>();
  const select = (next: string, projection: readonly UiLocalePack[], intl?: typeof initialIntl) => {
    const owners = new Map<string, string>();
    for (const { owner } of projection) {
      const prefix = textKeyPrefix(owner);
      refuseSharedTextPrefix(owners.get(prefix), owner);
      owners.set(prefix, owner);
    }
    locale = next; packs = projection; prefixes = owners; intlLocale = intl;
  };
  select(initial, initialPacks, initialIntl);
  installUiText({
    locale: () => locale,
    intlLocale: tag => intlLocale?.(tag),
    noContext: () => "default",
    ownerOfPrefix: prefix => prefixes.get(prefix) ?? null,
    message(owner, key, tag) {
      const words = packs.find(pack => pack.owner === owner && pack.locale === tag)?.messages;
      return words && Object.hasOwn(words, key) ? words[key]! : null;
    },
    defaultLocale: owner => packs.find(pack => pack.owner === owner)?.locale ?? null,
    produced: produced.record,
  });
  Object.assign(globalThis, { t, say, format });
  globalThis.molisWorkRetitleRegion = (root, before, after) => {
    const region = (html: string) => new DOMParser().parseFromString(html, "text/html").body;
    const reader = createTextReader({ packs, locale, intlLocale });
    mergeLocaleText({ root, old: region(before), next: region(after), produced, retext: ref => reader.text(ref) });
  };
  return { select, produced, locale: () => locale };
}
