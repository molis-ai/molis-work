import { t as uiText, escapeHtml, format, icon, renderAlert, renderButton, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { WEB_SEARCH_BUILTIN_SOURCE, type WebSearchSettingsView, type WebSearchSourceView } from "@molis-ai/molis-work-contracts/services/web-search";

/**
 * 设置 › 网页搜索 (specs/assistant-service-connections §13.7 ②B, user 2026-11-18): the one default source of the platform's web search.
 * A row per source — the built-in AnySearch, each account of a service that declares a web search, and such services with no account
 * yet — the default marked, every other usable one with 改用这个, one with no account with 连接. A default that cannot be used is said at
 * the top with the two ways out; it is never swapped for another. The page program only marks the new default in place: the rows are
 * all drawn here.
 */
const CONNECTIONS = "/capabilities/connections";

function sourceName(source: Pick<WebSearchSourceView, "title" | "account_label">): string {
  return source.account_label ? `${source.title} · ${source.account_label}` : source.title;
}

function sourceRow(source: WebSearchSourceView, usable: boolean): string {
  const name = sourceName(source);
  const note = source.kind === "builtin" ? "workbench.settings-web-search.builtin-note"
    : source.kind === "service" ? "workbench.settings-web-search.no-account" : source.state === "ready" ? "workbench.settings-web-search.account-note" : "workbench.settings-web-search.account-attention";
  const connectHref = `${CONNECTIONS}?connector=${encodeURIComponent(source.service_id ?? "")}`;
  // A usable row carries both its 默认 mark and its 改用这个 button; the page shows the one that fits after a change.
  const end = source.kind === "service"
    ? `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="${escapeHtml(connectHref)}">${icon("link")}<span>${uiText("workbench.settings-web-search.connect")}</span></a>`
    : usable
      ? `${renderStatusMark({ label: uiText.text("workbench.settings-web-search.is-default"), tone: "done", icon: "check", className: "web-search-source__current" })}${renderButton({
        label: uiText.text("workbench.settings-web-search.use-this"), variant: "secondary", size: "sm", className: "web-search-source__use",
        attrs: { "data-web-search-use": source.source_id, "data-web-search-name": name, "aria-label": uiText.text("workbench.settings-web-search.use-named", { name }) } })}`
      : source.is_default
        ? renderStatusMark({ label: uiText.text("workbench.settings-web-search.default-unusable"), tone: "blocked", icon: "circle-alert" })
        : `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="${escapeHtml(connectHref)}">${uiText("workbench.settings-web-search.fix")}</a>`;
  const mark = source.kind === "builtin" ? "globe" : "search";
  return `<li class="web-search-source${source.is_default ? " is-default" : ""}" data-web-search-source="${escapeHtml(source.source_id)}" data-state="${source.state}">
    <span class="web-search-source__mark" aria-hidden="true">${icon(mark)}</span>
    <span class="web-search-source__identity"><strong>${escapeHtml(name)}</strong><small>${uiText(note)}</small></span>
    <span class="web-search-source__end">${end}</span>
  </li>`;
}

function lastUse(view: WebSearchSettingsView): string {
  const use = view.last_use;
  if (!use) return uiText("workbench.settings-web-search.never");
  const who = use.audience === "user" ? "workbench.settings-web-search.by-you" : use.audience === "mcp" ? "workbench.settings-web-search.by-client" : "workbench.settings-web-search.by-agent";
  return `${escapeHtml(sourceName(use))} · ${format.date(use.used_at, "relative")} · ${uiText(who)}`;
}

export function renderWebSearchSettings(view: WebSearchSettingsView | undefined): string {
  const heading = `<header class="settings-heading"><div class="settings-heading-title"><h1 id="settings-title">${uiText("workbench.settings-web-search.title")}</h1></div><p>${uiText("workbench.settings-web-search.lead")}</p></header>`;
  if (!view) return `<section class="settings-document web-search-settings" aria-labelledby="settings-title" data-web-search-settings>${heading}<div class="settings-body"><p class="settings-muted">${uiText("workbench.settings-web-search.unavailable")}</p></div></section>`;
  const current = view.sources.find(source => source.source_id === view.default_source);
  const builtinOnly = view.sources.every(source => source.kind === "builtin");
  const broken = view.default_unusable ? renderAlert({
    tone: "danger", role: "alert", className: "web-search-settings__broken", attrs: { "data-web-search-broken": "" },
    title: current ? uiText.text("workbench.settings-web-search.broken-title", { name: sourceName(current) }) : uiText.text("workbench.settings-web-search.broken-gone-title"),
    body: uiText.text("workbench.settings-web-search.broken-body"),
    actions: [
      ...(current?.service_id ? [{ label: uiText.text("workbench.settings-web-search.fix"), variant: "primary" as const, size: "sm" as const, href: `${CONNECTIONS}?connector=${encodeURIComponent(current.service_id)}` }] : []),
      { label: uiText.text("workbench.settings-web-search.use-builtin"), variant: "secondary" as const, size: "sm" as const, attrs: { "data-web-search-use": WEB_SEARCH_BUILTIN_SOURCE, "data-web-search-name": "AnySearch" } },
    ],
  }) : "";
  const rows = view.sources.map(source => sourceRow(source, source.state === "ready")).join("");
  return `<section class="settings-document web-search-settings" aria-labelledby="settings-title" data-web-search-settings data-web-search-default="${escapeHtml(view.default_source)}">
    ${heading}
    <div class="settings-body">
      ${broken}
      <section class="settings-section web-search-settings__sources" aria-labelledby="web-search-sources">
        <h2 id="web-search-sources">${uiText("workbench.settings-web-search.default-source")}</h2>
        <ul class="web-search-sources" data-web-search-list>${rows}</ul>
        ${builtinOnly ? `<p class="settings-muted">${uiText("workbench.settings-web-search.only-builtin")}</p>` : ""}
        <p class="web-search-settings__said" data-web-search-said role="status" aria-live="polite"></p>
        <p class="settings-form-error" data-web-search-error role="alert" hidden></p>
      </section>
      <dl class="web-search-settings__facts">
        <dt>${uiText("workbench.settings-web-search.who-uses")}</dt><dd>${uiText("workbench.settings-web-search.who-uses-value")}</dd>
        <dt>${uiText("workbench.settings-web-search.last-use")}</dt><dd>${lastUse(view)}</dd>
      </dl>
      <p class="web-search-settings__more"><a class="mw-btn mw-btn--ghost mw-btn--sm" href="${CONNECTIONS}">${icon("plus")}<span>${uiText("workbench.settings-web-search.connect-more")}</span></a></p>
    </div>
  </section>`;
}

export const WEB_SEARCH_SETTINGS_STYLES = `
  .settings-document.web-search-settings > .settings-body { display: grid; gap: 24px; max-width: 760px; }
  .web-search-settings__sources { display: grid; gap: 4px; }
  .web-search-settings__sources > h2 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .web-search-sources { display: grid; margin: 0; padding: 0; list-style: none; }
  .web-search-source { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 56px; padding-block: 10px; }
  .web-search-source + .web-search-source { border-top: 1px solid var(--line); }
  .web-search-source__mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: var(--r-control); background: var(--surface-soft); color: var(--muted); transition: color var(--dur-hover) var(--ease-quint); }
  .web-search-source.is-default .web-search-source__mark { color: var(--text); }
  .web-search-source__identity { display: grid; gap: 2px; min-width: 0; }
  .web-search-source__identity strong { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .web-search-source__identity small { color: var(--muted); font-size: 12px; }
  .web-search-source__end { display: flex; justify-content: flex-end; white-space: nowrap; }
  .web-search-source:not(.is-default) .web-search-source__current, .web-search-source.is-default .web-search-source__use { display: none; }
  .web-search-settings__said { margin: 0; color: var(--muted); font-size: 13px; }
  .web-search-settings__said:empty { display: none; }
  .web-search-settings__facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 24px; margin: 0; font-size: 13px; }
  .web-search-settings__facts dt { color: var(--muted); }
  .web-search-settings__facts dd { margin: 0; min-width: 0; }
  .web-search-settings__more { margin: 0; }
  @media (max-width: 560px) {
    .web-search-settings__facts { grid-template-columns: minmax(0, 1fr); gap: 2px; }
    .web-search-settings__facts dd + dt { margin-top: 8px; }
  }
`;

/** Marks the chosen source the default in place, through `connectors.web_search.default.set@1` as the person (the Host's route). */
export const WEB_SEARCH_SETTINGS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindWebSearchSettings = (container = document) => {
  const root = container.matches?.("[data-web-search-settings]") ? container : container.querySelector?.("[data-web-search-settings]");
  if (!root || root.dataset.webSearchBound) return;
  root.dataset.webSearchBound = "1";
  const said = root.querySelector("[data-web-search-said]"), error = root.querySelector("[data-web-search-error]");
  root.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-web-search-use]");
    if (!button || !root.contains(button) || button.disabled) return;
    const id = button.dataset.webSearchUse, name = button.dataset.webSearchName || "";
    error.hidden = true; button.disabled = true; button.setAttribute("aria-busy", "true");
    try {
      const view = await molisWorkRequest("/api/settings/web-search/default", { method: "POST", body: { source_id: id } });
      root.dataset.webSearchDefault = view.default_source;
      root.querySelectorAll("[data-web-search-source]").forEach(row => row.classList.toggle("is-default", row.dataset.webSearchSource === view.default_source));
      root.querySelector("[data-web-search-broken]")?.remove();
      said.textContent = globalThis.t.text("workbench.settings-web-search.switched", { name });
      root.querySelector('[data-web-search-source="' + CSS.escape(view.default_source) + '"] .web-search-source__mark')?.animate?.(matchMedia("(prefers-reduced-motion: reduce)").matches ? [] : [{ transform: "scale(.92)" }, { transform: "scale(1)" }], { duration: 180, easing: "cubic-bezier(.22,1,.36,1)" });
    } catch (failure) { error.hidden = false; molisWorkRequest.show(error, failure); }
    finally { button.disabled = false; button.removeAttribute("aria-busy"); }
  });
};
globalThis.molisWorkBindWebSearchSettings?.(document);
`;
