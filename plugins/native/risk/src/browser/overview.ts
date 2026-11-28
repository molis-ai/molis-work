import { escapeHtml as esc, icon, renderAlert, renderButton, renderCollapsible, renderEmpty, renderFrame, renderPopover } from "@molis-ai/molis-work-plugin-sdk/ui";
import { act, choices, severityGrid, statusMark, text } from "./parts.js";
import type { RiskPage, RiskRow, RiskStatus } from "./types.js";

/** The project's risks, grouped by status (design A): a row of filters, then open, mitigating, accepted; closed ones folded at the end. */

const PAGE_SIZE = 100;

export async function loadOverview(page: RiskPage, more = false): Promise<void> {
  const { state } = page;
  const epoch = ++state.overviewEpoch;
  const current = () => page.scope.alive && state.overviewEpoch === epoch && state.view === "overview";
  const { status, impact, owner_name, linked, linkedSubject } = state.filter;
  state.loading = !more;
  if (!more) page.render();
  try {
    const answer = await page.call<{ risks: RiskRow[]; owners: string[]; next_cursor: string | null }>("risk.list", {
      status, limit: PAGE_SIZE, ...(impact ? { impact } : {}), ...(owner_name ? { owner_name } : {}),
      ...(linkedSubject ? { linked: linkedSubject } : linked ? { unlinked: linked === "none" } : {}),
      ...(more && state.next ? { cursor: state.next } : {}) });
    if (!current()) return;
    // No open risk under the default view is not no risk: a project whose risks are all closed still reaches them (RISK-04).
    const anyClosed = !more && !answer.risks.length && status === "open" && !impact && !owner_name && !linked && !linkedSubject
      ? (await page.call<{ risks: RiskRow[] }>("risk.list", { status: "closed", limit: 1 })).risks.length > 0 : false;
    if (!current()) return;
    state.rows = more ? [...state.rows, ...answer.risks] : answer.risks;
    state.owners = answer.owners;
    state.next = answer.next_cursor;
    state.anyClosed = anyClosed;
    state.overviewError = "";
  } catch (error) {
    if (!current()) return;
    if (more) throw error;
    // Not read is not none: the page says it could not read, never that there are no risks.
    state.overviewError = error instanceof Error ? error.message : "";
  } finally {
    if (state.overviewEpoch === epoch) state.loading = false;
  }
  if (current()) page.render();
}

const filtered = (page: RiskPage) => {
  const { impact, owner_name, linked, linkedSubject } = page.state.filter;
  return Boolean(impact || owner_name || linked || linkedSubject);
};

/** The kinds already linked on screen that an installed plugin still opens: no dead kind, no raw kind. */
const linkedKinds = (page: RiskPage): string[] =>
  [...new Set(page.state.rows.flatMap(risk => risk.links.filter(link => page.host.surfaceFor(link.kind)).map(link => link.kind)))].slice(0, 8);

function linkFilterPicker(): string {
  return renderPopover({ preview: true, className: "rk-pop rk-pop--form", body: `<form data-rk-form="linked-search"><label class="rk-label" for="rk-linked-query">${
    esc(text("filter.find-linked"))}</label><input class="mw-input mw-input--sm" id="rk-linked-query" name="query" maxlength="200" autocomplete="off"
      placeholder="${esc(text("filter.search-hint"))}"></form><ul class="mw-items rk-found" data-rk-found="linked"></ul>` });
}

function filterBar(page: RiskPage, count: number): string {
  const { filter, owners } = page.state;
  const kinds = linkedKinds(page);
  const select = (label: string, key: string, value: string, options: readonly [string, string][]) =>
    `<label class="rk-filter"><span>${esc(label)}</span><select class="mw-select mw-select--sm" data-slot="select" data-rk-filter="${key}">${options
      .map(([option, name]) => `<option value="${esc(option)}"${option === value ? " selected" : ""}>${esc(name)}</option>`).join("")}</select></label>`;
  const chosen = filter.linkedSubject
    ? `<span class="rk-chip"><span>${esc(filter.linkedLabel)}</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-rk-act="clear-linked"
        aria-label="${esc(text("filter.clear-linked"))}">${icon("x")}</button></span>`
    : "";
  const pick = kinds.length || filter.linkedSubject
    ? `<span class="rk-anchor">${act(text("filter.choose-linked"), "pick-linked", { variant: "ghost", icon: "search", value: "" })}${page.state.pop === "linked"
      ? linkFilterPicker() : ""}</span>` : "";
  return `<div class="rk-filters">${choices(text("filter.status"), "filter-status", [{ value: "open", label: text("filter.open") },
    { value: "all", label: text("filter.all") }, { value: "closed", label: text("filter.closed") }], filter.status)}
    ${select(text("field.impact"), "impact", filter.impact, [["", text("filter.any")], ["high", text("level.high")], ["medium", text("level.medium")], ["low", text("level.low")]])}
    ${owners.length || filter.owner_name ? select(text("field.owner"), "owner_name", filter.owner_name, [["", text("filter.any")], ...owners.map(owner => [owner, owner] as [string, string])]) : ""}
    ${select(text("filter.linked"), "linked", filter.linked, [["", text("filter.any")], ["some", text("filter.some-links")], ["none", text("filter.no-links")]])}
    ${chosen}${pick}
    <span class="rk-count">${esc(text("overview.count", { count }))}</span></div>`;
}

function row(risk: RiskRow): string {
  const sub = risk.links.length ? text("overview.links", { count: risk.links.length }) : text("filter.no-links");
  const owner = risk.owner_name ? `<span class="rk-owner">${icon("user")}${esc(risk.owner_name)}</span>` : "";
  return `<li class="mw-item rk-row" role="button" tabindex="0" data-rk-open="${esc(risk.risk_id)}" data-risk-row data-risk-id="${esc(risk.risk_id)}">
    <span class="mw-mark rk-mark">${severityGrid(risk)}</span><span class="rk-row__text"><strong title="${esc(risk.title)}">${esc(risk.title)}</strong><small>${esc(sub)}</small></span>
    <span class="mw-item__end">${owner}</span></li>`;
}

function groups(page: RiskPage): string {
  const rows = page.state.rows;
  const grouped = (["open", "mitigating", "accepted"] as RiskStatus[]).map(status => [status, rows.filter(risk => risk.status === status)] as const)
    .filter(([, list]) => list.length);
  const closed = rows.filter(risk => risk.status === "closed");
  const sections = grouped.map(([status, list]) => `<section class="rk-group"><h3 class="rk-h">${statusMark(status)}<span class="rk-count">${list.length}</span></h3>
    <ul class="mw-items">${list.map(row).join("")}</ul></section>`).join("");
  const folded = closed.length
    ? renderCollapsible({
      summary: text("overview.closed", { count: closed.length }),
      className: "rk-closed",
      open: page.state.filter.status === "closed",
      body: `<ul class="mw-items">${closed.map(row).join("")}</ul>`,
    })
    : "";
  const more = page.state.next ? `<div class="rk-more">${act(text("overview.more"), "more", { variant: "ghost" })}</div>` : "";
  return sections + folded + more;
}

function body(page: RiskPage): string {
  const { state } = page;
  if (state.loading) return `<p class="rk-muted" aria-busy="true">${esc(text("overview.loading"))}</p>`;
  if (state.overviewError) {
    return renderAlert({ tone: "danger", title: text("overview.failed"), body: `${text("overview.failed-body")} ${state.overviewError}`.trim(),
      actions: [{ label: text("action.retry"), icon: "refresh", attrs: { "data-rk-act": "reload" } }] });
  }
  if (!state.rows.length && !filtered(page) && state.filter.status === "open" && !state.anyClosed) {
    return renderEmpty({ icon: "shield", title: text("empty.title"), body: text("empty.body"), action: act(text("action.new"), "new", { variant: "primary", icon: "plus" }) });
  }
  const top = filterBar(page, state.rows.length);
  if (!state.rows.length && state.anyClosed) {
    return top + renderEmpty({ icon: "shield", title: text("overview.none-open"), body: text("overview.none-open-body"),
      action: act(text("overview.show-closed"), "filter-status", { value: "closed" }) });
  }
  if (!state.rows.length) {
    return top + renderEmpty({ icon: "filter", title: text("overview.no-match"), body: text("overview.no-match-body"), action: act(text("overview.clear"), "clear-filter") });
  }
  return top + groups(page);
}

export function renderOverview(page: RiskPage): string {
  const newButton = renderButton({ label: text("action.new"), variant: "primary", size: "sm", icon: "plus", attrs: { "data-rk-act": "new" } });
  return renderFrame({ title: text("overview.title"), description: page.host.projectTitle(), action: newButton, panel: body(page), className: "rk-frame" });
}
