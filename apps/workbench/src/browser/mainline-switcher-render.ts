import type { MainlineGroup } from "@molis-ai/molis-work-contracts/services/mainline";
import { escapeHtml as e, icon, renderButton, t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { groupDisplayName, itemDisplayTitle, type MainlineResolvedItem, type MainlineViewResponse } from "./mainline-types.js";

export interface SwitcherRenderState {
  readonly view: MainlineViewResponse;
  readonly query: string;
  readonly collapsedGroups: ReadonlySet<string>;
  readonly completedExpanded: boolean;
  readonly exampleDismissed: boolean;
  readonly selectedKind: string;
  readonly settingsHref: string;
}

function itemDot(resolved: MainlineResolvedItem | undefined, waiting: number): string {
  const state = resolved?.state ?? "ok";
  return `<span class="top-corner-item-dot" data-waiting="${waiting > 0}" data-state="${state}" aria-hidden="true"></span>`;
}

function renderItemRow(
  view: MainlineViewResponse,
  itemId: string,
  pinned: boolean,
  groupId: string | null,
  index: number,
  groupLen: number,
  completed: boolean,
): string {
  const item = view.mainline.items.find((entry) => entry.item_id === itemId);
  const res = view.resolved[itemId];
  const state = res?.state ?? "ok";
  const title = itemDisplayTitle(res, item?.name);
  const count = view.counts.items[itemId] ?? { waiting: 0, running: 0 };
  const current = view.mainline.current === itemId;
  const sub = state === "ok" && res?.plugin_title ? `<span class="ml-item-sub">${e(res.plugin_title)}</span>` : "";
  const badge = count.waiting > 0 ? `<span class="ml-badge-wait" title="${e(uiText.text("workbench.mainline.waiting-badge", { n: count.waiting }))}">${count.waiting}</span>` : "";
  const pinGlyph = pinned ? `<span class="ml-item-pin" aria-hidden="true">${icon("pin")}</span>` : "";
  const acts: string[] = [];
  if (state !== "ok") {
    acts.push(`<button class="ml-icon-btn" type="button" data-ml-remove="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.remove-item"))}" title="${e(uiText.text("workbench.mainline.remove-item"))}">${icon("x")}</button>`);
  } else if (completed) {
    acts.push(`<button class="ml-icon-btn" type="button" data-ml-restore="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.restore-item"))}" title="${e(uiText.text("workbench.mainline.restore-item"))}">${icon("undo")}</button>`);
    acts.push(`<button class="ml-icon-btn" type="button" data-ml-remove="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.remove-item"))}" title="${e(uiText.text("workbench.mainline.remove-item"))}">${icon("x")}</button>`);
  } else if (groupId) {
    if (index > 0) {
      acts.push(`<button class="ml-icon-btn" type="button" data-ml-up="${e(itemId)}" data-ml-group="${e(groupId)}" aria-label="${e(uiText.text("workbench.mainline.move-up"))}" title="${e(uiText.text("workbench.mainline.move-up"))}">${icon("chevron-up")}</button>`);
    }
    if (index + 1 < groupLen) {
      acts.push(`<button class="ml-icon-btn" type="button" data-ml-down="${e(itemId)}" data-ml-group="${e(groupId)}" aria-label="${e(uiText.text("workbench.mainline.move-down"))}" title="${e(uiText.text("workbench.mainline.move-down"))}">${icon("chevron-down")}</button>`);
    }
    const pinLabel = uiText.text(pinned ? "workbench.mainline.unpin" : "workbench.mainline.pin");
    acts.push(`<button class="ml-icon-btn" type="button" data-ml-pin="${e(itemId)}" data-ml-group="${e(groupId)}" data-ml-pinned="${pinned}" aria-label="${e(pinLabel)}" title="${e(pinLabel)}">${icon("pin")}</button>`);
    acts.push(`<button class="ml-icon-btn" type="button" data-ml-done="${e(itemId)}" aria-label="${e(uiText.text("workbench.mainline.mark-done"))}" title="${e(uiText.text("workbench.mainline.mark-done"))}">${icon("check")}</button>`);
  }
  return `<div class="ml-item-row" data-ml-row="${e(itemId)}" data-current="${current}" data-state="${state}">`
    + `<button class="ml-item-pick" type="button" data-ml-pick="${e(itemId)}" data-state="${state}"${current ? ' aria-current="page"' : ""}>${itemDot(res, count.waiting)}<span class="ml-item-title">${e(title)}</span>${pinGlyph}${sub}${badge}</button>`
    + `<span class="ml-item-acts">${acts.join("")}</span></div>`;
}

function renderEmptyState(dismissed: boolean): string {
  const example = dismissed ? "" : `<div class="ml-example-card" data-mainline-example>`
    + `<div class="ml-example-head"><span class="ml-example-tag">${e(uiText.text("workbench.mainline.example-tag"))}</span><span>${e(uiText.text("workbench.mainline.example-name"))}</span></div>`
    + `<div class="ml-example-acts">`
    + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.example-create"), attrs: { "data-ml-example-create": "" } })
    + renderButton({ variant: "ghost", size: "sm", label: uiText.text("workbench.mainline.example-dismiss"), attrs: { "data-ml-example-dismiss": "" } })
    + `</div></div>`;
  return `<div class="ml-empty" data-mainline-empty>`
    + `<strong>${e(uiText.text("workbench.mainline.empty-title"))}</strong>`
    + `<p>${e(uiText.text("workbench.mainline.empty-body"))}</p>`
    + `<div class="ml-empty-actions">${renderButton({ variant: "primary", size: "sm", label: uiText.text("workbench.mainline.new-item"), attrs: { "data-ml-focus-create": "" } })}</div>`
    + `${example}</div>`;
}

function renderGroupSection(group: MainlineGroup, state: SwitcherRenderState, needle: string): string {
  const matched = needle
    ? group.items.filter((entry) => {
      const item = state.view.mainline.items.find((one) => one.item_id === entry.item_id);
      return itemDisplayTitle(state.view.resolved[entry.item_id], item?.name).toLowerCase().includes(needle);
    })
    : group.items;
  if (needle && !matched.length) return "";
  const expanded = Boolean(needle) || !state.collapsedGroups.has(group.group_id);
  const groupCount = state.view.counts.groups[group.group_id] ?? { waiting: 0, running: 0 };
  const waitBadge = groupCount.waiting > 0
    ? `<span class="ml-badge-wait" title="${e(uiText.text("workbench.mainline.waiting-badge", { n: groupCount.waiting }))}">${groupCount.waiting}</span>`
    : "";
  const rows = matched.map((entry, idx) => renderItemRow(state.view, entry.item_id, entry.pinned, group.group_id, idx, matched.length, false)).join("");
  return `<section class="ml-group" data-ml-group-section="${e(group.group_id)}">`
    + `<button class="ml-group-head" type="button" data-ml-group-toggle="${e(group.group_id)}" aria-expanded="${expanded}">${icon("chevron-right")}<span class="ml-group-name">${e(groupDisplayName(group))}</span><span class="ml-group-count">${matched.length}</span>${waitBadge}</button>`
    + `<div class="ml-group-items"${expanded ? "" : " hidden"}>${rows}</div></section>`;
}

function renderCompletedSection(state: SwitcherRenderState, needle: string): string {
  const ids = state.view.mainline.completed;
  if (!ids.length) return "";
  const matched = needle
    ? ids.filter((id) => {
      const item = state.view.mainline.items.find((one) => one.item_id === id);
      return itemDisplayTitle(state.view.resolved[id], item?.name).toLowerCase().includes(needle);
    })
    : ids;
  if (needle && !matched.length) return "";
  const expanded = Boolean(needle) || state.completedExpanded;
  const rows = matched.map((id, idx) => renderItemRow(state.view, id, false, null, idx, matched.length, true)).join("");
  return `<section class="ml-group" data-ml-completed-section>`
    + `<button class="ml-group-head" type="button" data-ml-completed-toggle aria-expanded="${expanded}">${icon("chevron-right")}<span class="ml-group-name">${e(uiText.text("workbench.mainline.completed-count", { n: state.view.mainline.completed_total }))}</span></button>`
    + `<div class="ml-group-items"${expanded ? "" : " hidden"}>${rows}</div></section>`;
}

function renderCreateBox(state: SwitcherRenderState): string {
  const creatable = state.view.sources.filter((source) => source.create);
  const chips = creatable.length
    ? `<div class="ml-source-chips" data-ml-source-chips>${creatable.map((source) => {
      const pressed = state.selectedKind === source.kind;
      return `<button class="ml-source-chip" type="button" data-ml-create-kind="${e(source.kind)}" aria-pressed="${pressed}">${e(uiText.text("workbench.mainline.create-as", { kind: source.label }))}</button>`;
    }).join("")}</div>`
    : "";
  return `<div class="ml-create-box" data-ml-create-box>`
    + `<form class="ml-create-form" data-ml-create-form>`
    + `<input class="ml-create-input" type="text" data-mainline-create-input maxlength="200" placeholder="${e(uiText.text("workbench.mainline.new-item-placeholder"))}" aria-label="${e(uiText.text("workbench.mainline.new-item"))}" autocomplete="off">`
    + renderButton({ variant: "secondary", size: "sm", label: uiText.text("workbench.mainline.create"), attrs: { type: "submit", "data-ml-create-submit": "" } })
    + `</form>${chips}</div>`;
}

export function renderMainlineSwitcherHtml(state: SwitcherRenderState): string {
  const needle = state.query.trim().toLowerCase();
  const isHome = state.view.mainline.current === null;
  const homeRow = `<button class="top-corner-page" type="button" data-corner-home data-ml-pick-home${isHome ? ' aria-current="page"' : ""}>${icon("home")}<span>${e(uiText.text("workbench.settings-navigation.project-home"))}</span></button>`;
  const search = `<div class="ml-search-wrap">${icon("search")}<input class="ml-search-input" type="search" data-mainline-search value="${e(state.query)}" placeholder="${e(uiText.text("workbench.mainline.search-placeholder"))}" aria-label="${e(uiText.text("workbench.mainline.search-placeholder"))}" autocomplete="off"></div>`;
  const hasItems = state.view.mainline.items.length > 0;
  let body = "";
  if (!hasItems && !needle) {
    body = renderEmptyState(state.exampleDismissed);
  } else {
    const doneSet = new Set(state.view.mainline.completed);
    const recentIds = needle ? [] : state.view.mainline.recent.filter((id) => !doneSet.has(id)).slice(0, 3);
    const recentHtml = recentIds.length
      ? `<p class="ml-section-label">${e(uiText.text("workbench.mainline.recent"))}</p>`
        + recentIds.map((id, idx) => renderItemRow(state.view, id, false, null, idx, recentIds.length, false)).join("")
      : "";
    const groupsHtml = state.view.mainline.groups.map((group) => renderGroupSection(group, state, needle)).join("");
    const doneHtml = renderCompletedSection(state, needle);
    body = recentHtml + groupsHtml + doneHtml;
    if (needle && !groupsHtml && !doneHtml) {
      body = `<p class="ml-no-match">${e(uiText.text("workbench.mainline.no-match"))}</p>`;
    }
  }
  const foot = `<div class="ml-foot-links">`
    + `<button class="ml-foot-btn" type="button" data-mainline-organize-open>${icon("list")}<span>${e(uiText.text("workbench.mainline.organize"))}</span></button>`
    + `<a class="ml-foot-btn" href="${e(state.settingsHref)}" data-directory-open="project-settings">${icon("tune")}<span>${e(uiText.text("workbench.settings-navigation.project-settings"))}</span></a>`
    + `</div>`;
  return `${search}${homeRow}<div class="ml-scroll" data-ml-scroll>${body}</div>${renderCreateBox(state)}${foot}`;
}
