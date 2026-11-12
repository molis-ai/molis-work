// Two parts the external-sessions designs added to the board (docs/design/sessions-sources/README.md「组件板新增」, batch 22, after
// the D track's specimens): the project permit row, a Setting Row that carries the project's mark and its own receipt, and the
// external conversation, another tool's session read back as it was. Their rules and renderers live here so the board and, from
// batch 34, the Sessions surfaces draw one set. Every control inside them is an existing one (project monogram, status mark,
// loading line, button, Who); the rules only place them, on tokens only. Both lean on board rules that are not in the product
// stylesheet yet: `.mw-setting` / `.mw-settings` (catalog-patterns.ts) and `.mw-who` (the board's collaboration parts).
import { cx, escapeHtml, renderAttrs, renderButton, renderStatusMark, type AttrValue } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderProjectMonogram } from "../monogram.js";

export const SESSION_SOURCE_STYLES = `
  /* 1 · Project permit row: the project's mark, its name with badges, one line of what it means, the control on the right, and
     under the line the row's own receipt (saving, on, off, not saved), so the outcome stays where the switch was pressed. The receipt
     arrives with the shared craft-rise; a failed save also nudges once, as a failed toast does (mw-toast-nudge). */
  .mw-setting.mw-permit { flex-wrap: wrap; align-items: flex-start; gap: 4px 16px; transition: background-color var(--dur-move) var(--ease-quint); }
  .mw-setting.mw-permit > div:first-child { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 12px; align-items: start; flex: 1 1 0; min-width: 0; }
  .mw-setting.mw-permit > .mw-permit__control { display: flex; align-items: center; gap: 8px; flex: none; min-height: 22px; margin-left: 0; }
  .mw-permit .project-monogram { margin-top: 1px; }
  .mw-permit__copy { display: grid; gap: 2px; min-width: 0; }
  .mw-permit__name { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .mw-permit__name > strong { min-width: 0; }
  .mw-permit__name > .mw-badge { flex: none; }
  .mw-setting.mw-permit .mw-permit__meta { overflow-wrap: anywhere; }
  .mw-permit.is-current { background: var(--accent-soft); }
  .mw-settings > .mw-permit.is-current:first-child { border-radius: calc(var(--r-card) - 1px) calc(var(--r-card) - 1px) 0 0; }
  .mw-settings > .mw-permit.is-current:last-child { border-radius: 0 0 calc(var(--r-card) - 1px) calc(var(--r-card) - 1px); }
  .mw-settings > .mw-permit.is-current:only-child { border-radius: calc(var(--r-card) - 1px); }
  /* The receipt takes the row's whole width under the line (indented past the mark), so a narrow row keeps its words and Retry on one line. */
  .mw-setting.mw-permit > .mw-permit__note { display: flex; align-items: baseline; gap: 4px 8px; flex: 1 1 100%; min-width: 0; margin: 0; padding-left: 34px; color: var(--ink-soft); font-size: 12px; line-height: 1.55; }
  .mw-setting.mw-permit > .mw-permit__note:empty { display: none; }
  .mw-permit__note { animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  .mw-permit__note > .mw-status { flex: none; }
  .mw-permit__note > span:last-child:not(.mw-status) { min-width: 0; }
  .mw-permit__note[data-kind="saving"] { animation: none; }
  .mw-permit__note[data-kind="saving"] > .mw-loading { font-size: 12px; }
  .mw-setting.mw-permit > .mw-permit__note[data-kind="failed"] { color: var(--red); }
  .mw-permit__note[data-kind="failed"] { animation: craft-rise var(--dur-move) var(--ease-quint) both, mw-toast-nudge var(--dur-arrive) var(--ease-quint) var(--dur-hover); }
  .mw-permit__note[data-kind="failed"] > span { flex: 0 1 auto; }
  .mw-permit__note[data-kind="failed"] > .mw-btn { flex: none; color: var(--ink); }

  @media (max-width: 760px) {
    .mw-setting.mw-permit--action { flex-wrap: wrap; }
    .mw-setting.mw-permit--action > div:first-child { flex-basis: 100%; }
    .mw-setting.mw-permit--action > .mw-permit__control { flex: 1 1 100%; justify-content: space-between; padding-left: 34px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-setting.mw-permit { transition: none; }
    .mw-permit__note, .mw-permit__note[data-kind] { animation: none; }
  }
`;

/** What the row says under its line after the switch was pressed; omitted, the row says nothing more. */
export type MwPermitNote =
  | { readonly kind: "saving"; readonly label: string }
  | { readonly kind: "on" | "off"; readonly status: string; readonly text: string }
  | { readonly kind: "failed"; readonly text: string; readonly retry: string; readonly retryAttrs?: Record<string, AttrValue> };

export interface MwPermitRowOptions {
  readonly project: { readonly id: string; readonly name: string };
  /** Short marks after the name (`renderBadge`: 当前, 团队). */
  readonly badges?: string;
  /** One line of what the setting covers now; its id lets the control point at it with `aria-describedby`. */
  readonly description: string;
  readonly descriptionId?: string;
  /** A `renderSwitch`, or for a row that cannot be switched here a status mark with a button (`action`). */
  readonly control: string;
  readonly action?: boolean;
  readonly note?: MwPermitNote;
  /** The row the person was sent to. */
  readonly current?: boolean;
  readonly attrs?: Record<string, AttrValue>;
}

/** The receipt's own markup, for a page that swaps it in place when the save answers (the row's `.mw-permit__note` holds it). */
export function renderPermitNote(note: MwPermitNote | undefined): string {
  if (!note) return "";
  if (note.kind === "saving") return `<p class="mw-loading" role="status">${escapeHtml(note.label)}</p>`;
  if (note.kind === "failed") return `<span>${escapeHtml(note.text)}</span>${renderButton({ label: note.retry, variant: "ghost", size: "sm", icon: "refresh", attrs: note.retryAttrs })}`;
  return `${renderStatusMark({ label: note.status, tone: note.kind === "on" ? "done" : "quiet", plain: true })}<span>${escapeHtml(note.text)}</span>`;
}

/** A Setting Row for one project: its mark, name and line on the left, the control on the right, the receipt under the line. */
export function renderPermitRow(options: MwPermitRowOptions): string {
  const { project, note } = options;
  const description = `<p class="mw-permit__meta"${renderAttrs({ id: options.descriptionId })}>${escapeHtml(options.description)}</p>`;
  return `<div class="${cx("mw-setting", "mw-permit", options.action && "mw-permit--action", options.current && "is-current")}" data-slot="permit-row"${renderAttrs(options.attrs)}>`
    + `<div>${renderProjectMonogram(project.name, project.id, escapeHtml)}<div class="mw-permit__copy"><span class="mw-permit__name"><strong title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</strong>${options.badges ?? ""}</span>${description}</div></div>`
    + `<div class="mw-permit__control">${options.control}</div>`
    + `<div class="mw-permit__note" role="status"${note ? ` data-kind="${note.kind}"` : ""}>${renderPermitNote(note)}</div></div>`;
}
