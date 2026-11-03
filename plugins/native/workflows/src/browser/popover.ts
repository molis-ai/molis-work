import { esc, ico, said } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { tint } from "./chain.js";
import { label } from "./state.js";

/** The popover hangs under (or above) the node it belongs to and stays inside the window. */
function setPop(page: WorkflowsPage, anchor: Element) {
  const { pop } = page;
  const box = anchor.getBoundingClientRect(), size = pop.getBoundingClientRect();
  const left = Math.max(12, Math.min(window.innerWidth - size.width - 12, box.left + box.width / 2 - size.width / 2));
  const below = box.bottom + 8 + size.height < window.innerHeight - 12;
  pop.style.left = left + "px";
  pop.style.top = (below ? box.bottom + 8 : Math.max(12, box.top - size.height - 8)) + "px";
  pop.dataset.side = below ? "below" : "above";
}

export function placePop(page: WorkflowsPage, anchorOf: () => Element | null) {
  const { pop } = page;
  page.popAt = anchorOf;
  const anchor = anchorOf();
  if (!anchor) return;
  if (!pop.matches(":popover-open")) pop.showPopover();
  setPop(page, anchor);
}

export function fitPop(page: WorkflowsPage) {
  const { pop } = page;
  const box = pop.getBoundingClientRect();
  if (box.bottom > window.innerHeight - 12) pop.style.top = Math.max(12, window.innerHeight - 12 - box.height) + "px";
}

/** Follows the anchor when the page scrolls or resizes; closes when it left the screen. */
export function movePop(page: WorkflowsPage) {
  const { pop } = page;
  if (!pop.matches(":popover-open") || !page.popAt) return;
  const anchor = page.popAt();
  if (!anchor || !anchor.isConnected) { pop.hidePopover(); return; }
  const box = anchor.getBoundingClientRect();
  if (box.bottom < 0 || box.top > window.innerHeight) { pop.hidePopover(); return; }
  setPop(page, anchor);
}

export const pillOf = (page: WorkflowsPage, index: number) => () => page.view.querySelector(`[data-wf-chain] [data-wf-action=link][data-link="${index}"]`);
export const gapButtonOf = (page: WorkflowsPage, gap: number) => () => page.view.querySelector(`[data-wf-chain] [data-wf-action=gap][data-gap="${gap}"]`);

/** Marks the pill or gap the popover belongs to. */
export function markOpen(page: WorkflowsPage) {
  const { ui, view } = page;
  for (const pill of view.querySelectorAll<HTMLElement>("[data-wf-chain] .wf-link__pill")) {
    const open = Number(pill.dataset.link) === ui.openLink;
    pill.classList.toggle("is-open", open); pill.setAttribute("aria-expanded", String(open));
  }
  for (const gap of view.querySelectorAll<HTMLElement>("[data-wf-chain] [data-wf-gap]")) gap.classList.toggle("is-picking", Number(gap.dataset.wfGap) === ui.openGap);
}

/** The picker at a gap of the chain: the plugins that fit there. */
export function openGapPicker(page: WorkflowsPage, gap: number) {
  const { ui, pop, L } = page;
  const chain = ui.workflow!;
  const before = chain.stations[gap - 1], after = chain.stations[gap];
  const heading = before && after ? L("workflows.gap.between-heading", { a: label(page, before), b: label(page, after) }) : before ? L("workflows.gap.after", { a: label(page, before) }) : after ? L("workflows.gap.before", { a: label(page, after) }) : L("workflows.gap.first");
  const others = ui.stations.filter((info) => !info.supported);
  // Past the first station, only stations that take handed-over content fit; the rest can only start a run.
  const fits = (info: { supported: boolean; receives?: boolean }) => info.supported && (gap === 0 || info.receives !== false);
  const firstOnly = ui.stations.filter((info) => info.supported && !fits(info));
  ui.openLink = null; ui.openGap = gap;
  pop.dataset.mode = "gap";
  pop.innerHTML = `<header class="wf-pop__head"><strong>${esc(heading)}</strong></header><div class="wf-pop__list" role="listbox" aria-label="${esc(heading)}">`
    + ui.stations.filter(fits).map((info) => `<button type="button" class="wf-pop__item" role="option" data-wf-action="insert" data-plugin="${esc(info.plugin)}" data-gap="${gap}" style="--station-tint:${tint(info.plugin)}">`
      + `<span class="wf-station__icon">${ico(info.icon)}</span><span>${esc(said(L, info.label))}</span></button>`).join("")
    + "</div>" + (firstOnly.length ? `<p class="wf-hint">${esc(L("workflows.gap.first-only", { plugins: firstOnly.map((info) => said(L, info.label)).join("、") }))}</p>` : "")
    + (others.length ? `<p class="wf-hint" title="${esc(others.map((info) => said(L, info.label)).join("、"))}">${esc(L("workflows.palette.others", { count: others.length }))}</p>` : "");
  markOpen(page);
  placePop(page, gapButtonOf(page, gap));
  pop.querySelector<HTMLElement>(".wf-pop__item")?.focus();
}
