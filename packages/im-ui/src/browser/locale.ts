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

const SHARED_COMMON_KEYS: Readonly<Record<string, string>> = {
  "common.control.undo": "im-ui.control.undo",
  "common.control.clear": "im-ui.control.clear",
  "common.confirm-box.action-failed": "im-ui.transport.try-again",
  "common.request-client.copied": "im-ui.invitation.copied",
  "common.request-client.could-not-copy": "im-ui.invitation.copy-failed",
};

/** The same-origin Workbench prepares this document's own words before merging the visible text. */
export function installImLanguage() {
  let projection = pageProjection(document), intl = imIntlLocale(projection.language);
  const produced = createProducedLog();
  const lookup = (key: string, locale: string) => {
    const words = projection.packs.find(pack => pack.locale === locale)?.messages;
    return words && Object.hasOwn(words, key) ? words[key]! : null;
  };
  installUiText({
    locale: () => projection.language.tag, intlLocale: tag => intl(tag), noContext: () => "default",
    ownerOfPrefix: prefix => prefix === IM_TEXT_OWNER ? IM_TEXT_OWNER : null,
    defaultLocale: owner => owner === IM_TEXT_OWNER ? IM_DEFAULT_LOCALE : null,
    message(owner, key, locale) {
      return owner === IM_TEXT_OWNER ? lookup(key, locale) : null;
    },
    produced: produced.record,
  });
  const globalPage = globalThis as { t?: { text?: (key: string) => string } };
  if (!globalPage.t) {
    globalPage.t = {
      text(key: string) {
        const mapped = SHARED_COMMON_KEYS[key] ?? key;
        const hit = lookup(mapped, projection.language.tag) ?? lookup(mapped, IM_DEFAULT_LOCALE);
        return typeof hit === "string" ? hit : key;
      },
    };
  }
  const select = (next: ImLanguageProjection, notify = true) => {
    intl = imIntlLocale(next.language);
    projection = next;
    document.documentElement.lang = next.language.html_lang;
    document.documentElement.dir = next.language.direction;
    if (notify) {
      document.dispatchEvent(new CustomEvent("molis-work:language-changed", { detail: { tag: next.language.tag, language: next.language } }));
    }
  };
  const syncStandaloneShell = (nextDoc: Document) => {
    if (nextDoc.title) document.title = nextDoc.title;
    const copyAttrs = (selector: string, attrs: readonly string[]) => {
      const live = document.querySelector(selector), fresh = nextDoc.querySelector(selector);
      if (!live || !fresh) return;
      for (const attr of attrs) {
        const value = fresh.getAttribute(attr);
        if (value !== null) live.setAttribute(attr, value);
      }
    };
    const copyText = (selector: string) => {
      const live = document.querySelector(selector), fresh = nextDoc.querySelector(selector);
      if (live && fresh && fresh.textContent !== null) live.textContent = fresh.textContent;
    };
    for (const selector of [
      "aside.im-sidebar", "[data-conversations]", "[data-thread-strip]", "[data-search-results]",
      "[data-group-pane]", "[data-stream='group']", "[data-thread-pane]", "[data-scroll='thread']",
      "[data-member-avatars]", "[data-im-add-object]", ".im-sidebar-scrim",
      "[data-search] button[type='submit']", "[data-composer='group'] button[type='submit']", "[data-composer='thread'] button[type='submit']",
    ]) copyAttrs(selector, ["aria-label", "title"]);
    for (const selector of ["[data-search] input", "#im-group-input", "#im-thread-input"]) {
      copyAttrs(selector, ["aria-label", "placeholder"]);
    }
    document.querySelectorAll<HTMLElement>("[data-action]").forEach(live => {
      const action = live.dataset.action;
      if (!action) return;
      const scope = live.closest("[data-composer]");
      const selector = scope
        ? `[data-composer="${scope.getAttribute("data-composer")}"] [data-action="${action}"]`
        : `[data-action="${action}"]`;
      const fresh = nextDoc.querySelector(selector);
      if (!fresh) return;
      for (const attr of ["aria-label", "title"]) {
        const value = fresh.getAttribute(attr);
        if (value !== null) live.setAttribute(attr, value);
      }
    });
    for (const selector of [
      ".im-room-directory", "[data-welcome-title]", "[data-welcome-copy]",
      "[data-action='latest-group']", "[data-action='latest-thread']", "[data-sync-alert] [data-action='retry']",
    ]) copyText(selector);
    const brand = document.querySelector(".im-brand"), freshBrand = nextDoc.querySelector(".im-brand");
    if (brand?.firstChild?.nodeType === Node.TEXT_NODE && freshBrand?.firstChild?.nodeType === Node.TEXT_NODE) {
      brand.firstChild.nodeValue = freshBrand.firstChild.nodeValue;
    }
  };
  if (window.parent === window && typeof BroadcastChannel === "function") {
    let pending: AbortController | undefined;
    const channel = new BroadcastChannel("molis-work-ui-language");
    const syncStandalone = () => {
      pending?.abort();
      const controller = pending = new AbortController();
      void fetch(location.pathname + location.search, { cache: "no-store", headers: { accept: "text/html" }, signal: controller.signal })
        .then(async response => {
          if (controller.signal.aborted || !response.ok || !response.headers.get("content-type")?.startsWith("text/html")) return;
          const nextDoc = new DOMParser().parseFromString(await response.text(), "text/html");
          const next = pageProjection(nextDoc);
          if (controller.signal.aborted || next.language.tag === projection.language.tag) return;
          syncStandaloneShell(nextDoc);
          select(next, true);
        })
        .catch(() => undefined);
    };
    channel.addEventListener("message", syncStandalone);
    addEventListener("pagehide", event => { if (!event.persisted) { pending?.abort(); channel.close(); } });
  }
  return {
    tag: () => projection.language.tag,
    prepare(before: Document, after: Document, target: UiFrameLanguage) {
      const prior = projection, old = pageProjection(before), next = pageProjection(after);
      if (!sameLanguage(old.language, prior.language) || !sameLanguage(next.language, target)) throw new Error("Wrong discussion language");
      const reader = createTextReader({ packs: next.packs, locale: target.tag, intlLocale: imIntlLocale(target) });
      return { produced, retext: reader.text, use: () => select(next, true), restore: () => select(prior, false) };
    },
  };
}
