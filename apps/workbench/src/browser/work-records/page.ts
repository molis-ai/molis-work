import type { SandboxJson } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import type {
  ObservationCleanupPreview,
  ObservationCleanupResult,
  ObservationCoverageGetOutput,
  ObservationCoverageScopeFilter,
  ObservationRecordKind,
  ObservationRetentionMode,
  ObservationSettingsView,
  ObservationSpaceView,
} from "@molis-ai/molis-work-contracts/services/observation";
import type { SettingsValues, SettingsWriteInput } from "@molis-ai/molis-work-contracts/platform/settings";
import {
  alertHtml,
  btnHtml,
  esc,
  periodDays,
  postObservation,
  readText,
  todayStr,
  type SettingsPatch,
  type WorkRecordsProject,
  type WorkRecordsState,
  type WorkRecordsTab,
} from "./common.js";
import { cleanupScopePayload, renderCleanupDialog, selectedCleanupKinds } from "./dialog.js";
import { renderGapsTab } from "./gaps.js";
import { renderCleanTab, renderScopeTab, renderSpaceTab } from "./views.js";

function parseProjects(raw: string | undefined): WorkRecordsProject[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WorkRecordsProject[]) : [];
  } catch {
    return [];
  }
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const body = (err as { body?: { message?: string }; message?: string }).body;
    if (body?.message) return body.message;
    const msg = (err as { message?: string }).message;
    if (msg) return msg;
  }
  return readText("workbench.settings-work-records.load-failed");
}

interface WorkRecordsActions {
  readonly root: HTMLElement;
  readonly dlg: HTMLDialogElement | null;
  readonly projects: readonly WorkRecordsProject[];
  readonly S: WorkRecordsState;
  render(): void;
  showError(err: unknown): void;
  loadAll(): Promise<void>;
  fetchCoverage(): Promise<void>;
  refreshPreview(): Promise<void>;
  updateSettings(patch: SettingsPatch, msg?: string): Promise<void>;
}

function bindWorkRecordsEvents(ctx: WorkRecordsActions): void {
  const { root, dlg, projects, S, render, showError, loadAll, fetchCoverage, refreshPreview, updateSettings } = ctx;

  root.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const tab = target.closest<HTMLElement>("[data-wr-tab]");
    if (tab?.dataset.wrTab) { S.tab = tab.dataset.wrTab as WorkRecordsTab; render(); return; }
    const goto = target.closest<HTMLElement>("[data-wr-goto]");
    if (goto?.dataset.wrGoto) { S.tab = goto.dataset.wrGoto as WorkRecordsTab; S.dlgOpen = false; render(); return; }
    const openBtn = target.closest<HTMLElement>("[data-wr-open]");
    if (openBtn?.dataset.wrOpen) { const k = openBtn.dataset.wrOpen; S.open[k] = !S.open[k]; render(); return; }
    const filterBtn = target.closest<HTMLElement>("[data-wr-filter]");
    if (filterBtn?.dataset.wrFilter) {
      S.scopeFilter = filterBtn.dataset.wrFilter as ObservationCoverageScopeFilter;
      void fetchCoverage().then(() => { if (root.isConnected) render(); }).catch((err) => showError(err));
      return;
    }
    const stepBtn = target.closest<HTMLElement>("[data-wr-step]");
    if (stepBtn?.dataset.wrStep) {
      const cur = S.editingRem ? S.remDraftGb : (S.settings?.space_reminder_bytes != null ? Math.round((S.settings.space_reminder_bytes / 1e9) * 10) / 10 : 2);
      S.remDraftGb = Math.max(0.5, Math.round((Number(cur) + Number(stepBtn.dataset.wrStep)) * 10) / 10);
      S.editingRem = true;
      render();
      return;
    }
    const act = target.closest<HTMLElement>("[data-wr-act]")?.dataset.wrAct;
    if (!act) return;
    if (act === "reload") { void loadAll(); return; }
    if (act === "pause") { void updateSettings({ paused: true }, readText("workbench.settings-work-records.paused-alert-title")); return; }
    if (act === "resume") { void updateSettings({ paused: false }, readText("workbench.settings-work-records.st-recording")); return; }
    if (act === "savePeriod" && S.draftPeriod) { void updateSettings({ retention_mode: S.draftPeriod }); return; }
    if (act === "keepPeriod") { S.draftPeriod = null; if (S.settings?.retention.mode !== "keep") void updateSettings({ retention_mode: "keep" }); else render(); return; }
    if (act === "openDlg") { S.dlgOpen = true; S.preview = null; renderCleanupDialog(dlg, S, projects); void refreshPreview(); return; }
    if (act === "closeDlg") { e.preventDefault(); S.dlgOpen = false; renderCleanupDialog(dlg, S, projects); return; }
    if (act === "applyDlg") {
      e.preventDefault();
      if (S.busy) return;
      S.busy = true; renderCleanupDialog(dlg, S, projects);
      void (async () => {
        try {
          S.cleanupDone = await postObservation<ObservationCleanupResult>("cleanup/apply", cleanupScopePayload(S), "workbench.settings-work-records.save-failed");
          S.dlgOpen = false;
          await loadAll();
        } catch (err) {
          if (root.isConnected) showError(err);
        } finally {
          S.busy = false;
          if (root.isConnected) render();
        }
      })();
      return;
    }
    if (act === "editRem") {
      S.tab = "space"; S.editingRem = true;
      S.remDraftGb = S.settings?.space_reminder_bytes != null ? Math.max(0.5, Math.round((S.settings.space_reminder_bytes / 1e9) * 10) / 10) : 2;
      render();
      return;
    }
    if (act === "remSave") {
      const inputEl = root.querySelector<HTMLInputElement>("[data-wr-rem-input]");
      const gb = Math.max(0.5, Math.round((parseFloat(inputEl?.value || String(S.remDraftGb)) || 2) * 10) / 10);
      S.remDraftGb = gb;
      void updateSettings({ space_reminder_bytes: Math.round(gb * 1e9) });
    }
  });

  root.addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement)) return;
    if (t instanceof HTMLInputElement && t.dataset.wrUse) { void updateSettings({ uses: { [t.dataset.wrUse]: t.checked } }); return; }
    if (t instanceof HTMLSelectElement && t.hasAttribute("data-wr-period")) {
      const next = t.value as ObservationRetentionMode;
      if (periodDays(next) < 120 && next !== S.settings?.retention.mode) { S.draftPeriod = next; render(); }
      else { S.draftPeriod = null; void updateSettings({ retention_mode: next }); }
      return;
    }
    if (t instanceof HTMLInputElement && t.dataset.wrAct === "remToggle") {
      if (t.checked) { S.editingRem = true; S.remDraftGb = 2; render(); }
      else { void updateSettings({ space_reminder_bytes: null }); }
      return;
    }
    if (t instanceof HTMLInputElement && t.hasAttribute("data-wr-rem-input")) {
      S.remDraftGb = Math.max(0.5, parseFloat(t.value) || 2);
      if (!S.editingRem) { S.editingRem = true; render(); }
      return;
    }
    if (t instanceof HTMLSelectElement && t.hasAttribute("data-wr-ver")) {
      S.versionFilter = t.value;
      void fetchCoverage().then(() => { if (root.isConnected) render(); }).catch((err) => showError(err));
      return;
    }
    if (t instanceof HTMLSelectElement && t.hasAttribute("data-wr-dlg-range")) { S.dlgRange = t.value as "before" | "span"; renderCleanupDialog(dlg, S, projects); void refreshPreview(); return; }
    if (t instanceof HTMLInputElement && t.hasAttribute("data-wr-dlg-before")) { S.dlgBefore = t.value; void refreshPreview(); return; }
    if (t instanceof HTMLInputElement && t.hasAttribute("data-wr-dlg-since")) { S.dlgSince = t.value; void refreshPreview(); return; }
    if (t instanceof HTMLInputElement && t.hasAttribute("data-wr-dlg-until")) { S.dlgUntil = t.value; void refreshPreview(); return; }
    if (t instanceof HTMLSelectElement && t.hasAttribute("data-wr-dlg-project")) { S.dlgProject = t.value; void refreshPreview(); return; }
    if (t instanceof HTMLInputElement && t.dataset.wrDk) { S.dlgKinds[t.dataset.wrDk as ObservationRecordKind] = t.checked; renderCleanupDialog(dlg, S, projects); void refreshPreview(); }
  });

  root.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d instanceof HTMLDetailsElement && d.dataset.wrKey) S.open[d.dataset.wrKey] = d.open;
  }, true);

  dlg?.addEventListener("cancel", (e) => {
    e.preventDefault();
    S.dlgOpen = false;
    renderCleanupDialog(dlg, S, projects);
  });
  dlg?.addEventListener("close", () => {
    S.dlgOpen = false;
  });
}

export function mountWorkRecords(root: HTMLElement): () => void {
  const panel = root.querySelector<HTMLElement>("[data-wr-panel]");
  const errBox = root.querySelector<HTMLElement>("[data-wr-error]");
  const dlg = root.querySelector<HTMLDialogElement>("[data-wr-dialog]");
  const live = root.querySelector<HTMLElement>("[data-wr-live]");
  const projects = parseProjects(root.dataset.wrProjects);

  const S: WorkRecordsState = {
    tab: "scope",
    open: {},
    settings: null,
    space: null,
    coverage: null,
    busy: false,
    draftPeriod: null,
    editingRem: false,
    remDraftGb: 2,
    cleanupDone: null,
    scopeFilter: "all",
    versionFilter: "all",
    dlgOpen: false,
    dlgRange: "before",
    dlgBefore: todayStr(90),
    dlgSince: todayStr(90),
    dlgUntil: todayStr(0),
    dlgProject: "all",
    dlgKinds: { user: true, ai: true, content: true, flow: true, present: true },
    preview: null,
    previewSeq: 0,
  };

  const announce = (msg: string) => { if (live) live.textContent = msg; };
  const showError = (err: unknown) => {
    if (!errBox) return;
    if (!err) { errBox.hidden = true; errBox.innerHTML = ""; return; }
    errBox.hidden = false;
    errBox.innerHTML = alertHtml("danger", esc(errorMessage(err)), "", btnHtml(readText("common.control.retry"), { attrs: { "data-wr-act": "reload" } }));
  };

  const render = () => {
    root.querySelectorAll<HTMLElement>("[data-wr-tab]").forEach((btn) => {
      const active = btn.dataset.wrTab === S.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    if (!panel) return;
    panel.setAttribute("aria-labelledby", "wr-tab-" + S.tab);
    if (!S.settings || !S.space || !S.coverage) return;
    panel.innerHTML = S.tab === "clean" ? renderCleanTab(S)
      : S.tab === "space" ? renderSpaceTab(S, projects)
      : S.tab === "gaps" ? renderGapsTab(S)
      : renderScopeTab(S);
    renderCleanupDialog(dlg, S, projects);
  };

  const refreshPreview = async () => {
    if (!S.dlgOpen) return;
    if (!selectedCleanupKinds(S).length) {
      S.preview = null;
      renderCleanupDialog(dlg, S, projects);
      return;
    }
    const seq = ++S.previewSeq;
    try {
      const res = await postObservation<ObservationCleanupPreview>("cleanup/preview", cleanupScopePayload(S));
      if (seq === S.previewSeq && root.isConnected) { S.preview = res; renderCleanupDialog(dlg, S, projects); }
    } catch (err) {
      if (seq === S.previewSeq && root.isConnected) showError(err);
    }
  };

  const fetchCoverage = async () => {
    S.coverage = await postObservation<ObservationCoverageGetOutput>("coverage", {
      use: "lookback",
      all_projects: true,
      scope_filter: S.scopeFilter,
      ...(S.versionFilter !== "all" ? { platform_version: S.versionFilter } : {}),
    });
  };

  const revisions = new Map<string, string>();
  let pending: SettingsWriteInput | undefined;
  const loadAll = async () => {
    showError(null);
    try {
      const [settings, space, preferences] = await Promise.all([
        postObservation<ObservationSettingsView>("settings"),
        postObservation<ObservationSpaceView>("space"),
        postObservation<SettingsValues>("preferences/read", { keys: ["observation.retention", "observation.space_reminder"] }),
        fetchCoverage(),
      ]);
      if (!root.isConnected) return;
      for (const preference of preferences.values) revisions.set(preference.key, preference.revision);
      S.settings = settings;
      S.space = space;
      render();
    } catch (err) {
      if (root.isConnected) showError(err);
    }
  };

  const updateSettings = async (patch: SettingsPatch, msg = "") => {
    if (S.busy) return;
    S.busy = true; showError(null); render();
    try {
      const preference: { key: string; value: SandboxJson } | undefined = patch.retention_mode !== undefined ? { key: "observation.retention", value: patch.retention_mode }
        : patch.space_reminder_bytes !== undefined ? { key: "observation.space_reminder", value: patch.space_reminder_bytes === null ? {} : { bytes: patch.space_reminder_bytes } }
        : undefined;
      if (preference) {
        const revision = revisions.get(preference.key);
        if (revision === undefined) { await loadAll(); return; }
        const change = { set: preference.value };
        if (pending?.key !== preference.key || pending.expected_revision !== revision || JSON.stringify(pending.change) !== JSON.stringify(change)) {
          pending = { key: preference.key, layer: "personal", change, expected_revision: revision, request_id: crypto.randomUUID() };
        }
        const saved = await postObservation<SettingsValues>("preferences/write", pending, "workbench.settings-work-records.save-failed");
        for (const setting of saved.values) revisions.set(setting.key, setting.revision);
        pending = undefined;
        S.settings = await postObservation<ObservationSettingsView>("settings");
      } else S.settings = await postObservation<ObservationSettingsView>("settings/set", patch, "workbench.settings-work-records.save-failed");
      const [space] = await Promise.all([postObservation<ObservationSpaceView>("space"), fetchCoverage()]);
      S.space = space;
      S.draftPeriod = null;
      if (patch.space_reminder_bytes !== undefined) S.editingRem = false;
      if (msg) announce(msg);
    } catch (err) {
      if (root.isConnected) showError(err);
    } finally {
      S.busy = false;
      if (root.isConnected) render();
    }
  };

  bindWorkRecordsEvents({ root, dlg, projects, S, render, showError, loadAll, fetchCoverage, refreshPreview, updateSettings });
  void loadAll();
  return () => { void loadAll(); };
}
