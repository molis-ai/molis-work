import { t as uiText, escapeHtml, format, icon, renderAlert, renderButton, renderObjectRow, renderSettingRow, renderSettingsSection, renderStatusMark } from "@molis-ai/molis-work-plugin-sdk/ui";
import { WEB_SEARCH_BUILTIN_SOURCE, type WebSearchSettingsView, type WebSearchSourceView } from "@molis-ai/molis-work-contracts/services/web-search";

/**
 * 设置 › 网页搜索 (specs/assistant-service-connections §13.7 ②B, user 2026-11-18; unified settings card layout
 * specs/screen-polish/p5-settings.md, user 2026-11-20): the one default source of the platform's web search.
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
        ? `${renderStatusMark({ label: uiText.text("workbench.settings-web-search.default-unusable"), tone: "blocked", icon: "circle-alert", className: "web-search-source__current" })}<a class="mw-btn mw-btn--ghost mw-btn--sm web-search-source__use" href="${escapeHtml(connectHref)}">${uiText("workbench.settings-web-search.fix")}</a>`
        : `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="${escapeHtml(connectHref)}">${uiText("workbench.settings-web-search.fix")}</a>`;
  return renderObjectRow({
    name,
    hint: uiText.text(note),
    icon: source.kind === "builtin" ? "globe" : "search",
    action: end,
    className: `web-search-source${source.is_default ? " is-default" : ""}`,
    attrs: { "data-web-search-source": source.source_id, "data-state": source.state },
  });
}

function lastUse(view: WebSearchSettingsView): string {
  const use = view.last_use;
  if (!use) return uiText("workbench.settings-web-search.never");
  const who = use.audience === "user" ? "workbench.settings-web-search.by-you" : use.audience === "mcp" ? "workbench.settings-web-search.by-client" : "workbench.settings-web-search.by-agent";
  return `${escapeHtml(sourceName(use))} · ${format.date(use.used_at, "relative")} · ${uiText(who)}`;
}

export function renderWebSearchSettings(view: WebSearchSettingsView | undefined): string {
  const heading = `<header class="settings-heading"><h1 id="settings-title">${uiText("workbench.settings-web-search.title")}</h1><p>${uiText("workbench.settings-web-search.lead")}</p></header>`;
  if (!view) return `<section class="settings-document web-search-settings" aria-labelledby="settings-title" data-web-search-settings>${heading}${renderSettingsSection({ body: `<p class="mw-settings-section__note">${uiText("workbench.settings-web-search.unavailable")}</p>` })}</section>`;
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
    ${broken}
    ${renderSettingsSection({
      title: uiText.text("workbench.settings-web-search.default-source"),
      id: "web-search-sources",
      className: "web-search-settings__sources",
      action: `<a class="mw-btn mw-btn--ghost mw-btn--sm" href="${CONNECTIONS}">${icon("plus")}<span>${uiText("workbench.settings-web-search.connect-more")}</span></a>`,
      attrs: { "data-web-search-list": true },
      body: `${rows}${builtinOnly ? `<p class="mw-settings-section__note">${uiText("workbench.settings-web-search.only-builtin")}</p>` : ""}<p class="mw-settings-section__note" data-web-search-said role="status" aria-live="polite" hidden></p><p class="settings-form-error" data-web-search-error role="alert" hidden></p>`,
    })}
    ${renderSettingsSection({
      className: "web-search-settings__facts",
      body: `${renderSettingRow({
        name: uiText.text("workbench.settings-web-search.who-uses"),
        hint: uiText.text("workbench.settings-web-search.who-uses-value"),
      })}${renderSettingRow({
        name: uiText.text("workbench.settings-web-search.last-use"),
        detail: `<span>${lastUse(view)}</span>`,
      })}`,
    })}
  </section>`;
}

export const WEB_SEARCH_SETTINGS_STYLES = `
  .web-search-settings__broken { margin: 24px 0 0; }
  .web-search-source.is-default .mw-object-row__tile { color: var(--ink); }
  .web-search-source:not(.is-default) .web-search-source__current, .web-search-source.is-default .web-search-source__use { display: none; }
`;

/** Marks the chosen source the default in place, through `connectors.web_search.default.set@1` as the person (the Host's route). */
export const WEB_SEARCH_SETTINGS_CLIENT_SCRIPT = String.raw`
globalThis.molisWorkBindWebSearchSettings = (container = document) => {
  const root = container.matches?.("[data-web-search-settings]") ? container : container.querySelector?.("[data-web-search-settings]");
  if (!root || root.dataset.webSearchBound) return;
  root.dataset.webSearchBound = "1";
  const said = root.querySelector("[data-web-search-said]"), error = root.querySelector("[data-web-search-error]");
  let seq = 0;
  const setBusy = (on) => { root.querySelectorAll("[data-web-search-use]").forEach(btn => { btn.disabled = on; if (!on) btn.removeAttribute("aria-busy"); }); };
  root.addEventListener("click", async (event) => {
    const button = event.target.closest?.("[data-web-search-use]");
    if (!button || !root.contains(button) || button.disabled) return;
    const id = button.dataset.webSearchUse, name = button.dataset.webSearchName || "", mine = ++seq;
    error.hidden = true; said.hidden = true; said.textContent = "";
    setBusy(true); button.setAttribute("aria-busy", "true");
    try {
      const view = await molisWorkRequest("/api/settings/web-search/default", { method: "POST", body: { source_id: id } });
      if (mine !== seq) return;
      const hadFocus = document.activeElement === button;
      root.dataset.webSearchDefault = view.default_source;
      root.querySelectorAll("[data-web-search-source]").forEach(row => row.classList.toggle("is-default", row.dataset.webSearchSource === view.default_source));
      root.querySelector("[data-web-search-broken]")?.remove();
      said.hidden = false;
      said.textContent = globalThis.t.text("workbench.settings-web-search.switched", { name });
      if (hadFocus && (!button.isConnected || getComputedStyle(button).display === "none")) { said.tabIndex = -1; said.focus({ preventScroll: true }); }
      const style = getComputedStyle(root), rawDur = style.getPropertyValue("--dur-hover").trim();
      const dur = rawDur.endsWith("ms") ? parseFloat(rawDur) : rawDur.endsWith("s") ? parseFloat(rawDur) * 1000 : 130;
      const easing = style.getPropertyValue("--ease-quint").trim() || "ease";
      root.querySelector('[data-web-search-source="' + CSS.escape(view.default_source) + '"] .mw-object-row__tile')?.animate?.(matchMedia("(prefers-reduced-motion: reduce)").matches ? [] : [{ transform: "scale(.92)" }, { transform: "scale(1)" }], { duration: dur, easing });
    } catch (failure) { if (mine !== seq) return; error.hidden = false; molisWorkRequest.show(error, failure); }
    finally { if (mine === seq) setBusy(false); }
  });
};
globalThis.molisWorkBindWebSearchSettings?.(document);
`;
