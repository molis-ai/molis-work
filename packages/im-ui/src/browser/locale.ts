import { createProducedLog } from "@molis-ai/molis-work-design-system/produced-text";
import { createTextReader, installUiText, isFrameUiLanguage, matchLocale, parseLocalePack } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { UiFrameLanguage } from "@molis-ai/molis-work-contracts/platform/ui";
import { IM_DEFAULT_LOCALE, IM_PACK_ID, IM_TEXT_OWNER, imIntlLocale, type ImLanguageProjection } from "../locale-owner.js";

const sameLanguage = (left: UiFrameLanguage, right: UiFrameLanguage): boolean =>
  left.tag === right.tag && left.html_lang === right.html_lang && left.intl === right.intl && left.direction === right.direction;

function pageProjection(page: Document): ImLanguageProjection {
  const data = page.getElementById(IM_PACK_ID);
  if (data?.localName !== "script" || data.getAttribute("type") !== "application/json") throw new Error("Missing discussion language");
  const { language, packs: rows } = JSON.parse(data.textContent ?? "") as { language: unknown; packs: unknown };
  if (!isFrameUiLanguage(language) || !Array.isArray(rows) || language.html_lang !== page.documentElement.lang || language.direction !== page.documentElement.dir) {
    throw new Error("Invalid discussion language");
  }
  const seen = new Set<string>();
  const packs = rows.map((row: unknown) => {
    const parsed = parseLocalePack(JSON.stringify(row));
    if (!parsed.ok || parsed.value.owner !== IM_TEXT_OWNER) throw new Error("Invalid discussion locale pack");
    const { locale } = parsed.value;
    if (seen.has(locale) || matchLocale(language.tag, [locale], IM_DEFAULT_LOCALE) !== locale) throw new Error("Unexpected discussion locale pack");
    seen.add(locale);
    return parsed.value;
  });
  if (packs[0]?.locale !== IM_DEFAULT_LOCALE) throw new Error("Missing default discussion locale");
  return { language, packs };
}

/** The same-origin Workbench prepares this document's own words before merging the visible text. */
export function installImLanguage() {
  let projection = pageProjection(document), intl = imIntlLocale(projection.language);
  const produced = createProducedLog();
  installUiText({
    locale: () => projection.language.tag, intlLocale: tag => intl(tag), noContext: () => "default",
    ownerOfPrefix: prefix => prefix === IM_TEXT_OWNER ? IM_TEXT_OWNER : null,
    defaultLocale: owner => owner === IM_TEXT_OWNER ? IM_DEFAULT_LOCALE : null,
    message(owner, key, locale) {
      const words = owner === IM_TEXT_OWNER ? projection.packs.find(pack => pack.locale === locale)?.messages : undefined;
      return words && Object.hasOwn(words, key) ? words[key]! : null;
    },
    produced: produced.record,
  });
  const select = (next: ImLanguageProjection) => {
    intl = imIntlLocale(next.language);
    projection = next;
    document.documentElement.lang = next.language.html_lang;
    document.documentElement.dir = next.language.direction;
  };
  return {
    tag: () => projection.language.tag,
    prepare(before: Document, after: Document, target: UiFrameLanguage) {
      const prior = projection, old = pageProjection(before), next = pageProjection(after);
      if (!sameLanguage(old.language, prior.language) || !sameLanguage(next.language, target)) throw new Error("Wrong discussion language");
      const reader = createTextReader({ packs: next.packs, locale: target.tag, intlLocale: imIntlLocale(target) });
      return { produced, retext: reader.text, use: () => select(next), restore: () => select(prior) };
    },
  };
}
