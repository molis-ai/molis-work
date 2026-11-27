import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ObservationCleanupPreview,
  ObservationCleanupResult,
  ObservationCoverageGetOutput,
  ObservationCoverageScopeFilter,
  ObservationRecordKind,
  ObservationRetentionMode,
  ObservationSettingsUpdateInput,
  ObservationSettingsView,
  ObservationSpaceView,
} from "@molis-ai/molis-work-contracts/services/observation";
import { renderKindMark, type MwKindMarkHue } from "@molis-ai/molis-work-design-system/work-records";
import { escapeHtml, icon, renderBadge, renderButton, renderSettingRow, renderSettingsSection, type AttrValue, type MwTone, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";

const page = globalThis as typeof globalThis & { molisWorkRequest: UiRequest };

export const readText = globalThis.t.text;
export const esc = escapeHtml;

export function postObservation<T>(path: string, body: object = {}, fallbackKey = "workbench.settings-work-records.load-failed"): Promise<T> {
  return page.molisWorkRequest("/api/observation/" + path, { body, fallback: readText(fallbackKey) }) as Promise<T>;
}

export interface WorkRecordsProject {
  readonly project_id: string;
  readonly display_name: string;
}

export type WorkRecordsTab = "scope" | "clean" | "space" | "gaps";

export interface WorkRecordsState {
  tab: WorkRecordsTab;
  open: Record<string, boolean>;
  settings: ObservationSettingsView | null;
  space: ObservationSpaceView | null;
  coverage: ObservationCoverageGetOutput | null;
  busy: boolean;
  draftPeriod: ObservationRetentionMode | null;
  editingRem: boolean;
  remDraftGb: number;
  cleanupDone: ObservationCleanupResult | null;
  scopeFilter: ObservationCoverageScopeFilter;
  versionFilter: string;
  dlgOpen: boolean;
  dlgRange: "before" | "span";
  dlgBefore: string;
  dlgSince: string;
  dlgUntil: string;
  dlgProject: string;
  dlgKinds: Record<ObservationRecordKind, boolean>;
  preview: ObservationCleanupPreview | null;
  previewSeq: number;
}

export interface KindMeta {
  readonly id: ObservationRecordKind;
  readonly hue: MwKindMarkHue;
  readonly icon: PluginIconName;
  readonly name: string;
  readonly rec: string;
  readonly not: string;
}

export const todayStr = (offsetDays = 0): string => new Date(Date.now() - offsetDays * 86400000).toISOString().slice(0, 10);

export const fmtDate = (iso: string | null | undefined, style: "month-day" | "datetime" = "month-day"): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? readText("common.generated.formatted", { value: { kind: "date", at: d.toISOString(), style } }) : String(iso);
};

export const fmtNum = (n: number) => ({ kind: "number" as const, number: Number(n) || 0, style: "decimal" as const });

export const fmtBytes = (bytes: number): string => {
  const b = Number(bytes) || 0;
  if (b >= 1e9) return (b / 1e9).toFixed(2) + " GB";
  if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
  if (b > 0) return Math.max(1, Math.round(b / 1e3)) + " KB";
  return "0 MB";
};

export const statParts = (bytes: number): [string, string] => {
  const b = Number(bytes) || 0;
  if (b >= 1e8 || b === 0) return [(b / 1e9).toFixed(2), "GB"];
  if (b >= 1e5) return [(b / 1e6).toFixed(2), "MB"];
  return [Math.max(1, Math.round(b / 1e3)).toString(), "KB"];
};

export const btnHtml = (label: string, options: { v?: "primary" | "secondary" | "ghost" | "danger"; icon?: PluginIconName; attrs?: Record<string, AttrValue>; disabled?: boolean } = {}) =>
  renderButton({ label, variant: options.v ?? "secondary", size: "sm", icon: options.icon, attrs: options.attrs, disabled: options.disabled });

export const iconBtnHtml = (label: string, iconName: PluginIconName, attrs: Record<string, AttrValue> = {}, className = "") =>
  renderButton({ label, variant: "ghost", iconOnly: true, icon: iconName, attrs, className: className || undefined });

export const statusHtml = (label: string, tone: string) =>
  `<span class="mw-status mw-status--${tone}" data-slot="status"><span>${esc(label)}</span></span>`;

export const badgeHtml = (label: string, tone: MwTone = "neutral") => renderBadge({ label, tone });

export const alertHtml = (tone: string, title: string, body = "", actions = "") =>
  `<div class="mw-alert mw-alert--${tone}" data-slot="alert" role="status"><strong>${title}</strong>${body ? `<p>${body}</p>` : ""}${actions ? `<div class="mw-alert__actions">${actions}</div>` : ""}</div>`;

export const switchHtml = (on: boolean, attrs = "", disabled = false) =>
  `<span class="mw-switch" data-slot="switch"><input type="checkbox" role="switch"${on ? " checked" : ""}${disabled ? " disabled" : ""}${attrs ? " " + attrs : ""}><span class="mw-switch__track" aria-hidden="true"></span></span>`;

export const selectHtml = (attrs: string, options: readonly [string, string][], cur: string) =>
  `<select class="mw-select" data-slot="select" ${attrs}>${options.map(([v, n]) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(n)}</option>`).join("")}</select>`;

/** One setting of these pages: the settings page's own row (the SDK's), its name carrying the id its control is labelled by. */
export const settingHtml = (id: string, title: string, note: string, control: string) =>
  renderSettingRow({ name: title, nameAttrs: { id }, hint: note || undefined, control });

/** The card those rows sit in. */
export const settingsHtml = (rows: string) => renderSettingsSection({ body: rows });

export const markHtml = (iconName: PluginIconName, hue?: MwKindMarkHue) => renderKindMark({ icon: iconName, hue });

export const itemHtml = (mark: string, title: string, meta: string, end: string, extra = "") =>
  `<li class="mw-item">${mark}<span><strong>${esc(title)}</strong><small>${esc(meta)}</small></span><span class="mw-item__end">${end}</span></li>${extra ? `<li class="wr-more">${extra}</li>` : ""}`;

export const collapsibleHtml = (summary: string, body: string, open: boolean, key: string) =>
  `<details class="mw-collapsible" data-slot="collapsible" data-wr-key="${esc(key)}"${open ? " open" : ""}><summary>${esc(summary)}</summary><div class="mw-collapsible__body">${body}</div></details>`;

export const lockIconHtml = () => icon("lock");
export const inlineIconHtml = (name: PluginIconName) => icon(name);

export const kindsMeta = (): readonly KindMeta[] => [
  { id: "user", hue: "blue", icon: "edit", name: readText("workbench.settings-work-records.kind-user"), rec: readText("workbench.settings-work-records.kind-user-summary"), not: readText("workbench.settings-work-records.kind-user-not") },
  { id: "ai", hue: "plum", icon: "sparkles", name: readText("workbench.settings-work-records.kind-ai"), rec: readText("workbench.settings-work-records.kind-ai-summary"), not: readText("workbench.settings-work-records.kind-ai-not") },
  { id: "content", hue: "slate", icon: "history", name: readText("workbench.settings-work-records.kind-content"), rec: readText("workbench.settings-work-records.kind-content-summary"), not: readText("workbench.settings-work-records.kind-content-not") },
  { id: "flow", hue: "ochre", icon: "workflow", name: readText("workbench.settings-work-records.kind-flow"), rec: readText("workbench.settings-work-records.kind-flow-summary"), not: readText("workbench.settings-work-records.kind-flow-not") },
  { id: "present", hue: "clay", icon: "eye", name: readText("workbench.settings-work-records.kind-present"), rec: readText("workbench.settings-work-records.kind-present-summary"), not: readText("workbench.settings-work-records.kind-present-not") },
];

export const kindById = (id: string | undefined): KindMeta | undefined => kindsMeta().find((k) => k.id === id);

export const periodLabel = (p: ObservationRetentionMode): string => (
  p === "365" ? readText("workbench.settings-work-records.period-365")
  : p === "180" ? readText("workbench.settings-work-records.period-180")
  : p === "90" ? readText("workbench.settings-work-records.period-90")
  : p === "30" ? readText("workbench.settings-work-records.period-30")
  : p === "manual" ? readText("workbench.settings-work-records.period-manual")
  : readText("workbench.settings-work-records.period-keep")
);

export const periodDays = (p: ObservationRetentionMode): number =>
  ({ keep: 99999, manual: 99999, "365": 365, "180": 180, "90": 90, "30": 30 })[p] ?? 99999;

export type SettingsPatch = ObservationSettingsUpdateInput;
