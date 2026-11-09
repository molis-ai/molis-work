import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { WorkflowChain } from "../model.js";
import { escapeHtml as esc } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ico, kindName } from "./dom.js";
import type { WorkflowsPage } from "./page.js";
import { label } from "./state.js";
import { tint } from "./chain.js";

/** A workflow's stations in order, joined by what hands each over. */
export function chainText(page: WorkflowsPage, chain: WorkflowChain) {
  const { readText } = page;
  if (!chain.stations.length) return `<span class="wf-muted">${esc(uiText.text("workflows.chain.no-stations"))}</span>`;
  return chain.stations.map((station, index) => {
    const link = chain.links[index - 1];
    return (index ? `<i class="wf-mini-link" data-kind="${link!.kind}">${esc(kindName(readText, link!.kind))}</i>` : "")
      + `<b style="--station-tint:${tint(station.plugin)}">${esc(label(page, station))}</b>`;
  }).join("");
}

export function drawList(page: WorkflowsPage) {
  const { ui, listEl } = page;
  if (!ui.loaded) return;
  if (!ui.workflows.length) {
    listEl.innerHTML = `<div class="mw-empty wf-empty"><span class="mw-empty__mark">${ico("workflow")}</span><strong>${esc(uiText.text("workflows.list.empty-title"))}</strong>`
      + `<p>${esc(uiText.text("workflows.list.empty-hint"))}</p>`
      + `<p class="wf-example"><b>Feed</b><i>${esc(uiText.text("workflows.kind.manual"))}</i><b>Inbox</b><i>AI</i><b>Pages</b></p>`
      + `<button class="mw-btn mw-btn--secondary" type="button" data-wf-action="example">${ico("sparkles")}<span>${esc(uiText.text("workflows.list.example"))}</span></button></div>`;
    return;
  }
  listEl.innerHTML = `<nav class="mw-dir__list wf-rows" aria-label="${esc(uiText.text("workflows.page.title"))}">` + ui.workflows.map((flow) => {
    const selected = ui.workflow?.workflow_id === flow.workflow_id;
    const runs = flow.instance_count ? uiText.text("workflows.list.run-count", { count: flow.instance_count }) + (flow.active_count ? " · " + uiText.text("workflows.list.active-count", { count: flow.active_count }) : "") : uiText.text("workflows.list.not-run");
    const live = flow.active_count ? `<i class="wf-row__live" title="${esc(uiText.text("workflows.list.active-count", { count: flow.active_count }))}"></i>` : "";
    return `<button type="button" class="wf-row directory-list-row${selected ? " is-selected" : ""}" data-wf-open="${esc(flow.workflow_id)}"${selected ? ' aria-current="page"' : ""}>`
      + `<span class="wf-row__title"><span>${esc(flow.title)}</span>${live}</span><span class="wf-row__chain" data-overflow-fade>${chainText(page, flow)}</span><span class="wf-row__meta">${esc(runs)}</span></button>`;
  }).join("") + "</nav>";
}
