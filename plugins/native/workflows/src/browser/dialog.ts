import { esc, ico, messageOf, required, settle, when } from "./dom.js";
import { openRun, showFlow } from "./nav.js";
import type { WorkflowsPage } from "./page.js";
import { flushSave } from "./save.js";
import { label } from "./state.js";
import type { InstanceAnswer, PicksAnswer } from "./types.js";

/** The dialog the page asks things in (deleting, ending a run, picking where a run starts). `onSubmit` runs on the person's yes. */
export function showForm(page: WorkflowsPage, title: string, bodyHtml: string, submitLabel: string, onSubmit: (() => Promise<void>) | null, { tone }: { tone?: "danger" } = {}) {
  const { dlg } = page;
  required(dlg, "[data-wf-dialog-title]").textContent = title;
  required(dlg, "[data-wf-dialog-body]").innerHTML = bodyHtml;
  const submit = required<HTMLButtonElement>(dlg, "[data-wf-dialog-submit]");
  submit.innerHTML = `<span>${esc(submitLabel)}</span>`;
  submit.classList.toggle("mw-btn--danger", tone === "danger"); submit.classList.toggle("mw-btn--primary", tone !== "danger");
  submit.disabled = !onSubmit;
  const error = required(dlg, "[data-wf-dialog-error]"); error.hidden = true; error.textContent = "";
  page.submitForm = onSubmit;
  if (!dlg.open) dlg.showModal();
}

const skeletonPicks = () => '<div class="wf-picks" aria-busy="true">' + [62, 48, 70].map((width) => `<div class="wf-pick wf-pick--skeleton"><span class="mw-skeleton wf-skeleton-dot"></span><span><span class="mw-skeleton" style="width:${width}%"></span><span class="mw-skeleton wf-skeleton-small"></span></span></div>`).join("") + "</div>";

/** Asks where the run starts: one thing the first station holds, or a new one. */
export async function startRun(page: WorkflowsPage) {
  const { ui, dlg, formEl, L } = page;
  const flow = ui.workflow!; flushSave(page); await page.queue;
  if (ui.workflow !== flow || page.edits.get(flow.workflow_id)?.error || flow.stations.length < 2) return;
  const first = flow.stations[0]!.plugin;
  const hint = `<p class="wf-hint">${esc(L("workflows.run.starts-from", { plugin: label(page, first) }))}</p>`;
  showForm(page, L("workflows.run.start"), hint + skeletonPicks(), L("workflows.run.started"), null);
  try {
    const { items, can_start_blank: canBlank } = await page.api<PicksAnswer>("/stations/" + first + "/items");
    const blank = canBlank ? `<label class="mw-check-row wf-pick wf-pick--blank"><input class="mw-radio" type="radio" name="start" value="" ${items.length ? "" : "checked"}><span><strong>${esc(L("workflows.run.create-new", { plugin: label(page, first) }))}</strong><input class="mw-input" name="blank_title" maxlength="120" placeholder="${esc(L("workflows.run.name"))}"></span></label>` : "";
    const filter = items.length > 6 ? `<label class="wf-pick-filter">${ico("search")}<input class="mw-input" type="search" data-wf-pick-filter placeholder="${esc(L("workflows.run.filter"))}" aria-label="${esc(L("workflows.run.filter"))}"></label>` : "";
    const list = items.length ? `<div class="wf-picks" role="radiogroup" aria-label="${esc(L("workflows.run.pick-first"))}">` + items.map((item, index) => `<label class="mw-check-row wf-pick" data-wf-pick-text="${esc((item.title + " " + item.caption).toLowerCase())}"><input class="mw-radio" type="radio" name="start" value="${esc(item.item_id)}"${index === 0 ? " checked" : ""}><span><strong>${esc(item.title)}</strong><small>${esc([item.caption, when(item.at)].filter(Boolean).join(" · "))}</small></span></label>`).join("") + `<p class="wf-muted wf-picks-none" data-wf-picks-none hidden>${esc(L("workflows.run.no-match"))}</p></div>`
      : (blank ? "" : `<p class="wf-muted">${esc(L("workflows.run.nothing-to-start", { plugin: label(page, first) }))}</p>`);
    if (!dlg.open) return;
    const body = required(dlg, "[data-wf-dialog-body]");
    body.innerHTML = hint + filter + blank + list;
    settle(body.querySelector(".wf-picks") || body.lastElementChild);
    page.submitForm = async () => {
      const picked = formEl.querySelector<HTMLInputElement>("input[name=start]:checked");
      if (!picked) throw new Error(L("workflows.run.pick-first"));
      const request = picked.value ? { item_id: picked.value } : { title: formEl.querySelector<HTMLInputElement>("input[name=blank_title]")?.value || "" };
      const started = await page.api<InstanceAnswer>("/" + flow.workflow_id + "/instances", request);
      dlg.close();
      await showFlow(page, flow.workflow_id, { keepInstance: true });
      await openRun(page, started.instance.instance_id, 0);
    };
    required<HTMLButtonElement>(dlg, "[data-wf-dialog-submit]").disabled = !(items.length || canBlank);
    (body.querySelector<HTMLElement>("[data-wf-pick-filter]") || body.querySelector<HTMLElement>("input[name=start]:checked") || body.querySelector<HTMLElement>("input[name=blank_title]"))?.focus();
  } catch (error) {
    const el = required(dlg, "[data-wf-dialog-error]"); el.textContent = messageOf(error); el.hidden = false;
  }
}

/** Narrows the list of things to start from. The picked one stays picked while it shows, otherwise the first that shows. */
export function filterPicks(page: WorkflowsPage, query: string) {
  const { dlg } = page;
  const needle = query.trim().toLowerCase();
  let shown = 0, firstShown: HTMLElement | null = null;
  for (const pick of dlg.querySelectorAll<HTMLElement>("[data-wf-pick-text]")) {
    const hit = !needle || pick.dataset.wfPickText!.includes(needle);
    pick.hidden = !hit;
    if (hit) { shown += 1; firstShown = firstShown || pick; }
  }
  const none = dlg.querySelector<HTMLElement>("[data-wf-picks-none]"); if (none) none.hidden = shown > 0;
  const checked = dlg.querySelector<HTMLInputElement>("[data-wf-pick-text] input:checked");
  const holder = checked?.closest<HTMLElement>("[data-wf-pick-text]");
  const radio = (firstShown as HTMLElement | null)?.querySelector<HTMLInputElement>("input");
  if (checked && holder?.hidden && radio) radio.checked = true;
}
