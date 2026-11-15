import type { ObservationCleanupScopeInput, ObservationRecordKind } from "@molis-ai/molis-work-contracts/services/observation";
import {
  btnHtml,
  esc,
  fmtBytes,
  fmtNum,
  iconBtnHtml,
  inlineIconHtml,
  kindsMeta,
  readText,
  selectHtml,
  type WorkRecordsProject,
  type WorkRecordsState,
} from "./common.js";

export function selectedCleanupKinds(S: WorkRecordsState): ObservationRecordKind[] {
  return (Object.entries(S.dlgKinds) as [ObservationRecordKind, boolean][])
    .filter(([, on]) => on)
    .map(([k]) => k);
}

export function cleanupScopePayload(S: WorkRecordsState): ObservationCleanupScopeInput {
  const kinds = selectedCleanupKinds(S);
  const base = S.dlgRange === "span"
    ? { time_range: "custom" as const, since: S.dlgSince, until: S.dlgUntil }
    : { time_range: "custom" as const, before: S.dlgBefore };
  return {
    ...base,
    ...(S.dlgProject !== "all" ? { project_id: S.dlgProject } : {}),
    kinds,
  };
}

export function renderCleanupDialog(dlg: HTMLDialogElement | null, S: WorkRecordsState, projects: readonly WorkRecordsProject[]): void {
  if (!dlg) return;
  if (!S.dlgOpen) {
    if (dlg.open) dlg.close();
    return;
  }
  const kinds = selectedCleanupKinds(S);
  const prev = kinds.length ? S.preview : null;
  const sizeWord = prev ? fmtBytes(prev.estimated_freed_bytes) : "0 MB";
  const countWord = !kinds.length
    ? readText("workbench.settings-work-records.dlg-count", { count: fmtNum(0) })
    : prev
      ? readText("workbench.settings-work-records.dlg-count", { count: fmtNum(prev.matching_records) })
      : readText("workbench.settings-work-records.calculating");
  const field = (label: string, ctl: string) => `<div class="mw-field" data-slot="field"><span class="mw-field__label">${esc(label)}</span>${ctl}</div>`;
  const whenCtl = `<div class="mw-ix-actions">${selectHtml(`data-wr-dlg-range aria-label="${esc(readText("workbench.settings-work-records.dlg-when"))}"`, [["before", readText("workbench.settings-work-records.dlg-before")], ["span", readText("workbench.settings-work-records.dlg-span")]], S.dlgRange)}${S.dlgRange === "span"
    ? `<input class="mw-input" data-slot="input" type="date" data-wr-dlg-since value="${esc(S.dlgSince)}" aria-label="${esc(readText("workbench.settings-work-records.dlg-start-date"))}"><input class="mw-input" data-slot="input" type="date" data-wr-dlg-until value="${esc(S.dlgUntil)}" aria-label="${esc(readText("workbench.settings-work-records.dlg-end-date"))}">`
    : `<input class="mw-input" data-slot="input" type="date" data-wr-dlg-before value="${esc(S.dlgBefore)}" aria-label="${esc(readText("workbench.settings-work-records.dlg-cutoff-date"))}">`}</div>`;
  const projOpts: readonly [string, string][] = [
    ["all", readText("workbench.settings-work-records.dlg-all-projects")],
    ...projects.map((p): [string, string] => [p.project_id, p.display_name]),
  ];
  const kindsField = `<fieldset class="mw-check-group" data-slot="checkbox-group"><legend>${esc(readText("workbench.settings-work-records.dlg-kinds"))}</legend>${kindsMeta().map((k) => `<label class="mw-check-row"><input class="mw-check" data-slot="checkbox" type="checkbox" data-wr-dk="${k.id}"${S.dlgKinds[k.id] ? " checked" : ""}><span>${esc(k.name)}</span></label>`).join("")}</fieldset>`;

  const impacts: string[] = [];
  const timelineLost = prev?.impacts.some((i) => i.impact === "timeline_expired_gap" && i.affected);
  const compareLost = prev?.impacts.some((i) => i.impact === "comparison_basis_lost" && i.affected);
  if (timelineLost) impacts.push(`<li class="lose">${inlineIconHtml("alert")}<span>${esc(readText("workbench.settings-work-records.impact-timeline"))}</span></li>`);
  if (compareLost) impacts.push(`<li class="lose">${inlineIconHtml("alert")}<span>${esc(readText("workbench.settings-work-records.impact-compare"))}</span></li>`);
  impacts.push(`<li class="ok">${inlineIconHtml("check")}<span>${esc(readText("workbench.settings-work-records.impact-originals"))}</span></li>`);
  const holdCount = prev?.preserved.evaluation_samples_count ?? S.settings?.evaluation_holds.count ?? 0;
  impacts.push(`<li class="ok">${inlineIconHtml("check")}<span>${esc(readText("workbench.settings-work-records.impact-samples", { count: fmtNum(holdCount) }))}</span></li>`);

  dlg.innerHTML = `<form method="dialog" class="mw-form mw-dialog__shell"><header class="mw-form__header"><div><h2 id="wr-dlg-title">${esc(readText("workbench.settings-work-records.dlg-title"))}</h2><p>${esc(readText("workbench.settings-work-records.dlg-desc"))}</p></div>${iconBtnHtml(readText("common.control.close"), "x", { "data-wr-act": "closeDlg" }, "mw-dialog__close")}</header><div class="mw-form__body wr-dialog-body">${field(readText("workbench.settings-work-records.dlg-when"), whenCtl)}${field(readText("workbench.settings-work-records.dlg-project"), selectHtml(`data-wr-dlg-project aria-label="${esc(readText("workbench.settings-work-records.dlg-project"))}"`, projOpts, S.dlgProject))}${kindsField}<div class="wr-size"><strong>${esc(sizeWord)}</strong><span>${esc(countWord)}</span></div><ul class="wr-impact">${impacts.join("")}</ul></div><footer class="mw-form__footer">${btnHtml(readText("common.control.cancel"), { v: "ghost", attrs: { "data-wr-act": "closeDlg" }, disabled: S.busy })}${btnHtml(readText("workbench.settings-work-records.dlg-apply", { size: sizeWord }), { v: "danger", icon: "trash", attrs: { "data-wr-act": "applyDlg" }, disabled: S.busy || !kinds.length })}</footer></form>`;
  if (!dlg.open) {
    try {
      dlg.showModal();
    } catch {
      dlg.setAttribute("open", "");
    }
  }
}
