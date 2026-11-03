import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { createWorkbenchLocale, WebLocale } from "./i18n.js";

/** The words and formats of the request being rendered; the Host binds them, the workbench only reads them. */
export type RendererLocale = Pick<ReturnType<typeof createWorkbenchLocale>, "L" | "htmlLang" | "dateTimeLocale" | "listJoin" | "localeSwitchHref" | "clientI18nScript"> & { currentLocale(): WebLocale };

export function controlTokenMeta(controlToken: string): string {
  return `<meta name="molis-work-control-token" content="${escapeHtml(controlToken)}">`;
}

/** The small string helpers every page of the workbench shares: a date in the request's locale, an empty-aware list, and the page's local links. */
export function createRendererHelpers(ports: {
  L: RendererLocale["L"];
  dateTimeLocale: RendererLocale["dateTimeLocale"];
  appendDesktopQueryToLocalHrefs(html: string): string;
}) {
  const { L, dateTimeLocale, appendDesktopQueryToLocalHrefs } = ports;

  function formatDate(value: string | null | undefined): string {
    if (!value) return L("未记录");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(dateTimeLocale(), {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(date);
  }

  function renderList(values: string[], empty: string): string {
    if (values.length === 0) return `<p class="empty-row">${escapeHtml(L(empty))}</p>`;
    return `<ul class="doc-list">${values.map((value) => `<li>${escapeHtml(value)}</li>`).join("")}</ul>`;
  }

  function prefixLocalLinks(html: string, routePrefix: string, desktopShell = false): string {
    // Global settings and the capability service live outside any project; a Plugin linking to them from the project page
    // means the global page (project settings come in through the __PROJECT_SETTINGS__ tokens). Only href itself: data-*-href stays.
    const prefixed = routePrefix
      ? html.replace(/(\s)href="\/(?!locale(?:\?|")|projects\/|settings(?:[/?#"])|capabilities(?:[/?#"]))/g, `$1href="${routePrefix}/`)
      : html;
    const resolved = prefixed
      .replaceAll('href="__PROJECT_INDEX__"', 'href="/"')
      .replaceAll('href="__SYSTEM_CAPABILITIES__"', `href="/capabilities/library${routePrefix ? `?project=${encodeURIComponent(routePrefix.split("/")[2]!)}` : ""}"`)
      .replaceAll('href="__WORKBENCH_CSS__"', 'href="/assets/molis-work-workbench.css"')
      .replaceAll('href="__PROJECT_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings` : "/settings/projects"}"`)
      .replaceAll('href="__PROJECT_RULES_SETTINGS__"', `href="${routePrefix ? `${routePrefix}/settings/rules` : "/settings/projects"}"`)
      .replaceAll('href="__SYSTEM_SETTINGS__"', `href="/settings/appearance${routePrefix ? `?project=${encodeURIComponent(routePrefix.split("/")[2]!)}` : ""}"`);
    return desktopShell ? appendDesktopQueryToLocalHrefs(resolved) : resolved;
  }

  return { formatDate, renderList, prefixLocalLinks };
}
