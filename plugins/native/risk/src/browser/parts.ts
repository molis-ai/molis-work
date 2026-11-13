import { escapeHtml as esc, renderBadge, renderButton, renderSeverityGrid, renderStatusMark, renderToggle, type MwButtonOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import { riskSeverity } from "../model.js";
import type { RiskLevel, RiskRecord, RiskStatus } from "./types.js";

const uiText = globalThis.t;

/** Small shared pieces of the risk page: words, status marks, the severity grid, buttons that carry an action. */
export const text = (key: string, values?: Record<string, string | number>) => uiText.text(`risk.${key}`, values);

const STATUS_MARK: Record<RiskStatus, { tone: "attention" | "progress" | "hold" | "done"; state: "answer" | "running" | "paused" | "done" }> = {
  open: { tone: "attention", state: "answer" }, mitigating: { tone: "progress", state: "running" },
  accepted: { tone: "hold", state: "paused" }, closed: { tone: "done", state: "done" },
};
export const statusMark = (status: RiskStatus) => renderStatusMark({ label: text(`status.${status}`), ...STATUS_MARK[status] });

const LEVEL_TONE: Record<RiskLevel, "danger" | "warning" | "neutral"> = { high: "danger", medium: "warning", low: "neutral" };
const LEVEL_INDEX: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3 };
export const levelBadge = (axis: "impact" | "likelihood", level: RiskLevel) =>
  renderBadge({ label: `${text(`field.${axis}`)} ${text(`level.${level}`)}`, tone: LEVEL_TONE[level] });

/** Where the risk sits: impact up, likelihood across; the lit cell's tone is its seriousness, and the words say both axes. */
export function severityGrid(risk: Pick<RiskRecord, "impact" | "likelihood">, size: "small" | "large" = "small") {
  const severity = riskSeverity(risk);
  return renderSeverityGrid({ row: LEVEL_INDEX[risk.impact], column: LEVEL_INDEX[risk.likelihood], size,
    tone: severity === "high" ? "danger" : severity === "medium" ? "warning" : "neutral",
    label: text("grid.label", { impact: text(`level.${risk.impact}`), likelihood: text(`level.${risk.likelihood}`) }),
    rowLabel: text("field.impact"), columnLabel: text("field.likelihood") });
}

/** A button that names what it does in `data-rk-act` (and `data-rk-value`). */
export function act(label: string, action: string, options: Omit<MwButtonOptions, "label"> & { value?: string } = {}) {
  const { value, attrs, ...rest } = options;
  return renderButton({ variant: "secondary", size: "sm", ...rest, label, attrs: { ...attrs, "data-rk-act": action, ...(value === undefined ? {} : { "data-rk-value": value }) } });
}

/** A row of choices, one pressed. */
export function choices(label: string, action: string, items: readonly { value: string; label: string }[], current: string) {
  return `<div class="mw-toggle-group" role="group" aria-label="${esc(label)}">${items.map(item => renderToggle({ label: item.label, pressed: item.value === current,
    attrs: { "data-rk-act": action, "data-rk-value": item.value } })).join("")}</div>`;
}

export const section = (title: string, body: string, extra = "") =>
  `<section class="rk-sec"><div class="rk-sec__head"><h3 class="rk-h">${esc(title)}</h3>${extra}</div>${body}</section>`;

export const prose = (value: string) => (value.trim() ? `<p class="rk-prose">${esc(value)}</p>` : `<p class="rk-muted">—</p>`);

export const when = (iso: string | null | undefined) => (iso ? globalThis.format.date(iso, "datetime") : "");
