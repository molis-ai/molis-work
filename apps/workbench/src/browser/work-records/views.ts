import { renderCategoryBar } from "@molis-ai/molis-work-design-system/work-records";
import {
  alertHtml,
  badgeHtml,
  btnHtml,
  esc,
  fmtBytes,
  fmtDate,
  fmtNum,
  iconBtnHtml,
  itemHtml,
  kindsMeta,
  lockIconHtml,
  markHtml,
  periodDays,
  periodLabel,
  readText,
  selectHtml,
  settingHtml,
  settingsHtml,
  statParts,
  statusHtml,
  switchHtml,
  type WorkRecordsProject,
  type WorkRecordsState,
} from "./common.js";

export function renderScopeTab(S: WorkRecordsState): string {
  const settings = S.settings!;
  const rec = settings.recording;
  const uses = settings.uses;
  const pausedAt = rec.paused_at ? fmtDate(rec.paused_at, "datetime") : "";
  const sinceWord = rec.complete_since ? fmtDate(rec.complete_since, "month-day") : "";
  const earliestWord = rec.earliest_record_at ? fmtDate(rec.earliest_record_at, "month-day") : "";
  let top = "";
  let recRow = "";
  if (rec.state === "paused") {
    top = alertHtml(
      "warning",
      esc(readText("workbench.settings-work-records.paused-alert-title")),
      esc(pausedAt ? readText("workbench.settings-work-records.paused-alert-body", { when: pausedAt }) : readText("workbench.settings-work-records.paused-note-plain")),
    );
    recRow = settingHtml(
      "wr-rec",
      readText("workbench.settings-work-records.paused-row-title"),
      pausedAt ? readText("workbench.settings-work-records.paused-row-note", { when: pausedAt }) : readText("workbench.settings-work-records.paused-note-plain"),
      statusHtml(readText("workbench.settings-work-records.st-paused"), "hold")
        + btnHtml(readText("workbench.settings-work-records.resume-btn"), { v: "primary", attrs: { "data-wr-act": "resume" }, disabled: S.busy }),
    );
  } else if (rec.state === "catching_up") {
    const readCount = fmtNum(rec.catch_up_progress?.read_count || 0);
    top = alertHtml("info", esc(readText("workbench.settings-work-records.catchup-title")), esc(readText("workbench.settings-work-records.catchup-body")));
    recRow = settingHtml("wr-rec", readText("workbench.settings-work-records.catchup-row-title"), readText("workbench.settings-work-records.catchup-row-note"), statusHtml(readCount, "progress"));
  } else {
    const note = sinceWord
      ? (earliestWord && earliestWord !== sinceWord
          ? readText("workbench.settings-work-records.rec-note-both", { since: sinceWord, earliest: earliestWord })
          : readText("workbench.settings-work-records.rec-note-since", { since: sinceWord }))
      : readText("workbench.settings-work-records.rec-note-ready");
    recRow = settingHtml(
      "wr-rec",
      readText("workbench.settings-work-records.rec-row-title"),
      note,
      statusHtml(readText("workbench.settings-work-records.st-recording"), "done")
        + btnHtml(readText("workbench.settings-work-records.pause-btn"), { icon: "pause", attrs: { "data-wr-act": "pause" }, disabled: S.busy }),
    );
  }

  const kindsHtml = kindsMeta().map((k) => {
    const open = !!S.open["kind-" + k.id];
    const more = open
      ? `<div><b>${esc(readText("workbench.settings-work-records.label-recorded"))}</b>${esc(k.rec)}</div><div><b>${esc(readText("workbench.settings-work-records.label-not-recorded"))}</b>${esc(k.not)}</div>`
      : "";
    return itemHtml(
      markHtml(k.icon, k.hue),
      k.name,
      k.rec,
      iconBtnHtml(open ? readText("workbench.settings-work-records.collapse") : readText("workbench.settings-work-records.expand"), open ? "chevron-down" : "chevron-right", { "aria-expanded": open, "data-wr-open": "kind-" + k.id }),
      more,
    );
  }).join("");

  const useRows = [
    settingHtml("wr-use-lookback", readText("workbench.settings-work-records.use-lookback"), readText("workbench.settings-work-records.use-lookback-note"), switchHtml(true, 'aria-labelledby="wr-use-lookback"', true)),
    settingHtml("wr-use-assistant", readText("workbench.settings-work-records.use-assistant"), readText("workbench.settings-work-records.use-assistant-note"), switchHtml(uses.assistant, 'data-wr-use="assistant" aria-labelledby="wr-use-assistant"', S.busy)),
    settingHtml("wr-use-evaluation", readText("workbench.settings-work-records.use-evaluation"), uses.evaluation ? "" : readText("workbench.settings-work-records.use-evaluation-off"), switchHtml(uses.evaluation, 'data-wr-use="evaluation" aria-labelledby="wr-use-evaluation"', S.busy)),
    settingHtml("wr-use-export", readText("workbench.settings-work-records.use-export"), readText("workbench.settings-work-records.use-export-note"), switchHtml(uses.export, 'data-wr-use="export" aria-labelledby="wr-use-export"', S.busy)),
    settingHtml("wr-use-upload", readText("workbench.settings-work-records.use-upload"), readText("workbench.settings-work-records.use-upload-note"), switchHtml(false, 'aria-labelledby="wr-use-upload"', true)),
  ].join("");

  return `${top}${settingsHtml(recRow)}<section><h2>${esc(readText("workbench.settings-work-records.tab-scope"))}</h2><ul class="mw-items">${kindsHtml}</ul></section><section><h2>${esc(readText("workbench.settings-work-records.uses-heading"))}</h2>${settingsHtml(useRows)}</section><p class="wr-lock">${lockIconHtml()}${esc(readText("workbench.settings-work-records.local-only"))}</p>`;
}

export function renderCleanTab(S: WorkRecordsState): string {
  const settings = S.settings!;
  const savedMode = settings.retention.mode;
  const curMode = S.draftPeriod ?? savedMode;
  const days = periodDays(curMode);
  const reqs = [
    { id: "weekly_report", days: 7, name: readText("workbench.settings-work-records.need-weekly") },
    { id: "cross_period_compare", days: 60, name: readText("workbench.settings-work-records.need-compare") },
    { id: "evaluation_samples", days: 120, name: readText("workbench.settings-work-records.need-eval") },
  ];
  const lose = reqs.some((r) => days < r.days);
  const top = S.cleanupDone
    ? alertHtml(
        "success",
        esc(readText("workbench.settings-work-records.clean-done-title", { size: fmtBytes(S.cleanupDone.freed_bytes), count: fmtNum(S.cleanupDone.deleted_records) })),
        esc(readText("workbench.settings-work-records.clean-done-body")),
        btnHtml(readText("workbench.settings-work-records.see-gaps"), { attrs: { "data-wr-goto": "gaps" } }),
      )
    : "";
  const periodOpts: readonly [string, string][] = [
    ["keep", readText("workbench.settings-work-records.period-keep")],
    ["365", readText("workbench.settings-work-records.period-365")],
    ["180", readText("workbench.settings-work-records.period-180")],
    ["90", readText("workbench.settings-work-records.period-90")],
    ["30", readText("workbench.settings-work-records.period-30")],
    ["manual", readText("workbench.settings-work-records.period-manual")],
  ];
  const periodNote = curMode === "keep"
    ? readText("workbench.settings-work-records.period-note-keep")
    : curMode === "manual" ? readText("workbench.settings-work-records.period-note-manual") : "";
  const periodRow = settingHtml(
    "wr-period",
    readText("workbench.settings-work-records.period-row-title"),
    periodNote,
    selectHtml(`data-wr-period aria-labelledby="wr-period"${S.busy ? " disabled" : ""}`, periodOpts, curMode),
  );
  const needsHtml = curMode === "keep" || curMode === "manual"
    ? ""
    : `<ul class="mw-items">${reqs.map((r) => {
        const ok = days >= r.days;
        return itemHtml(
          markHtml(ok ? "check" : "alert"),
          r.name,
          readText("workbench.settings-work-records.need-days", { days: fmtNum(r.days) }),
          statusHtml(ok ? readText("workbench.settings-work-records.st-kept") : readText("workbench.settings-work-records.st-will-lose"), ok ? "done" : "attention"),
        );
      }).join("")}</ul>`;
  const warnHtml = lose && S.draftPeriod && S.draftPeriod !== savedMode
    ? alertHtml(
        "warning",
        esc(readText("workbench.settings-work-records.short-warn-title")),
        esc(readText("workbench.settings-work-records.short-warn-body")),
        btnHtml(readText("workbench.settings-work-records.short-use-anyway", { period: periodLabel(curMode) }), { v: "primary", attrs: { "data-wr-act": "savePeriod" }, disabled: S.busy })
          + btnHtml(readText("workbench.settings-work-records.short-keep-instead"), { attrs: { "data-wr-act": "keepPeriod" }, disabled: S.busy }),
      )
    : "";
  const holds = settings.evaluation_holds;
  return `${top}<section><h2>${esc(readText("workbench.settings-work-records.auto-clean-heading"))}</h2>${settingsHtml(periodRow)}${needsHtml}${warnHtml}</section><section><h2>${esc(readText("workbench.settings-work-records.manual-clean-heading"))}</h2>${settingsHtml(settingHtml("wr-manual", readText("workbench.settings-work-records.manual-row-title"), readText("workbench.settings-work-records.manual-row-note"), btnHtml(readText("workbench.settings-work-records.choose-btn"), { icon: "trash", attrs: { "data-wr-act": "openDlg" }, disabled: S.busy })))}</section><section><h2>${esc(readText("workbench.settings-work-records.samples-heading"))}</h2>${settingsHtml(settingHtml("wr-samples", readText("workbench.settings-work-records.samples-row-title"), readText("workbench.settings-work-records.samples-row-note", { days: fmtNum(holds.retention_days) }), badgeHtml(readText("workbench.settings-work-records.samples-badge", { count: fmtNum(holds.count) }))))}</section>`;
}

export function renderSpaceTab(S: WorkRecordsState, projects: readonly WorkRecordsProject[]): string {
  const sp = S.space!;
  const settings = S.settings!;
  const remBytes = settings.space_reminder_bytes;
  const remGb = remBytes != null ? Math.max(0.5, Math.round((remBytes / 1e9) * 10) / 10) : null;
  const totalGb = ((sp.total_bytes || 0) / 1e9).toFixed(2);
  const remActions = btnHtml(readText("workbench.settings-work-records.goto-clean"), { attrs: { "data-wr-goto": "clean" } })
    + btnHtml(readText("workbench.settings-work-records.change-reminder"), { v: "ghost", attrs: { "data-wr-act": "editRem" } });
  let top = "";
  if (sp.write_failure?.has_recent_loss) {
    top = alertHtml(
      "danger",
      esc(readText("workbench.settings-work-records.loss-alert-title", { count: fmtNum(sp.write_failure.lost_count) })),
      esc(readText("workbench.settings-work-records.loss-alert-body")),
      btnHtml(readText("workbench.settings-work-records.see-gaps"), { attrs: { "data-wr-goto": "gaps" } })
        + btnHtml(readText("workbench.settings-work-records.goto-clean"), { v: "ghost", attrs: { "data-wr-goto": "clean" } }),
    );
  } else if (sp.reminder_status === "exceeded" && remGb != null) {
    top = alertHtml("warning", esc(readText("workbench.settings-work-records.rem-over-title", { used: totalGb + " GB", limit: remGb + " GB" })), esc(readText("workbench.settings-work-records.rem-over-body")), remActions);
  } else if (sp.reminder_status === "near" && remGb != null) {
    top = alertHtml("warning", esc(readText("workbench.settings-work-records.rem-near-title", { used: totalGb + " GB", limit: remGb + " GB" })), "", remActions);
  }

  const byKindMap = new Map(sp.by_kind.map((x) => [x.kind, x.bytes || 0]));
  const barHtml = renderCategoryBar({
    label: readText("workbench.catalog-work-records.usage-by-kind"),
    segments: [
      ...kindsMeta().map((k) => {
        const val = byKindMap.get(k.id) || 0;
        return { hue: k.hue, label: k.name, value: val, formatted: fmtBytes(val) };
      }),
      (() => {
        const val = byKindMap.get("files") || 0;
        return { hue: "muted" as const, label: readText("workbench.catalog-work-records.files-and-images"), value: val, formatted: fmtBytes(val) };
      })(),
    ],
  });

  const [numWord, unitWord] = statParts(sp.total_bytes);
  const earliest = settings.recording.earliest_record_at ? fmtDate(settings.recording.earliest_record_at, "month-day") : "";
  const projCount = sp.by_project.filter((p) => p.project_id).length;
  const deltaWord = earliest
    ? readText("workbench.settings-work-records.space-delta", { since: earliest, count: fmtNum(Math.max(projCount, projects.length || 0)) })
    : readText("workbench.settings-work-records.space-delta-empty");
  const statHtml = `<article class="mw-stat"><p>${esc(readText("workbench.catalog-work-records.used-by-work-records"))}</p><strong>${esc(numWord)}<small>${esc(unitWord)}</small></strong><p class="mw-stat__delta">${esc(deltaWord)}</p>${barHtml}</article>`;

  const on = remGb != null || S.editingRem;
  const draftVal = S.editingRem ? S.remDraftGb : (remGb ?? 2);
  const numCtl = `<div class="mw-number" data-slot="number-field">${iconBtnHtml(readText("workbench.settings-work-records.decrease"), "minus", { "data-wr-step": "-0.5" })}<input class="mw-input" data-slot="input" type="number" data-wr-rem-input value="${esc(String(draftVal))}" min="0.5" step="0.5" aria-label="GB">${iconBtnHtml(readText("workbench.settings-work-records.increase"), "plus", { "data-wr-step": "0.5" })}</div>`;
  const remCtl = (on ? `${numCtl}<span class="wr-sub">GB</span>${S.editingRem ? btnHtml(readText("common.control.save"), { v: "primary", attrs: { "data-wr-act": "remSave" }, disabled: S.busy }) : ""}` : "")
    + switchHtml(on, 'data-wr-act="remToggle" aria-labelledby="wr-rem"', S.busy);
  const remRow = settingHtml("wr-rem", readText("workbench.settings-work-records.rem-row-title"), on ? readText("workbench.settings-work-records.rem-note-on") : readText("workbench.settings-work-records.rem-note-off"), remCtl);
  const pct = remBytes ? Math.round(((sp.total_bytes || 0) / remBytes) * 100) : 0;
  const meterRow = remBytes != null && !S.editingRem
    ? settingHtml("wr-meter", readText("workbench.settings-work-records.rem-pct", { pct: fmtNum(pct) }), "", `<meter class="mw-meter" data-slot="meter" min="0" max="${remBytes}" value="${Math.min(sp.total_bytes || 0, remBytes)}" aria-labelledby="wr-meter"></meter>`)
    : "";
  const expiryRow = settingHtml(
    "wr-expiry",
    readText("workbench.settings-work-records.expiry-row-title"),
    readText("workbench.settings-work-records.expiry-row-note", { mode: periodLabel(settings.retention.mode) }),
    btnHtml(readText("workbench.settings-work-records.goto-settings"), { attrs: { "data-wr-goto": "clean" } }),
  );

  return `${top}${statHtml}<section><h2>${esc(readText("workbench.settings-work-records.rem-heading"))}</h2>${settingsHtml(remRow + meterRow)}</section><section><h2>${esc(readText("workbench.settings-work-records.clean-short-heading"))}</h2>${settingsHtml(expiryRow)}</section>`;
}
