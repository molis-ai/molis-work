// Two parts the external-sessions designs added to the board (docs/design/sessions-sources/README.md「组件板新增」, batch 22, after
// the D track's specimens): the project permit row, a Setting Row that carries the project's mark and its own receipt, and the
// external conversation, another tool's session read back as it was. Their rules and renderers live here so the board and, from
// batch 34, the Sessions surfaces draw one set. Every control inside them is an existing one (project monogram, status mark,
// loading line, button, Who); the rules only place them, on tokens only. Both lean on board rules that are not in the product
// stylesheet yet: `.mw-setting` / `.mw-settings` (catalog-patterns.ts) and `.mw-who` (the board's collaboration parts).
import { cx, escapeHtml, icon, renderAttrs, renderButton, renderStatusMark, type AttrValue, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
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

  /* 2 · External conversation: one line per entry, a Who face then the name and time, then the words. Your words sit in a --wash
     bubble; a tool step is one hairline row (action, object, result); notes such as where the session started are centred and
     quiet; a search hit is --amber-soft under an --amber underline. Earlier entries load from the top. */
  .mw-transcript { display: grid; gap: 16px; min-width: 0; }
  .mw-transcript__earlier { display: grid; gap: 8px; justify-items: start; min-width: 0; }
  .mw-transcript__earlier > .mw-skeleton { width: var(--w, 80%); height: 14px; border-radius: var(--r-tag); }
  .mw-transcript__log { display: grid; gap: 16px; min-width: 0; margin: 0; padding: 0; list-style: none; }
  .mw-turn { display: grid; grid-template-columns: 22px minmax(0, 1fr); gap: 12px; align-items: start; min-width: 0; border-radius: var(--r-row); transition: background-color var(--dur-move) var(--ease-quint), box-shadow var(--dur-move) var(--ease-quint); }
  .mw-turn > .mw-who { margin-top: 1px; }
  .mw-turn__body { display: grid; gap: 2px; min-width: 0; }
  .mw-turn__head { display: flex; align-items: center; gap: 8px; min-width: 0; margin: 0; color: var(--muted); font-size: 12px; line-height: 18px; }
  .mw-turn__head > b { min-width: 0; overflow: hidden; color: var(--ink); font-weight: var(--weight-title); text-overflow: ellipsis; white-space: nowrap; }
  .mw-turn__head > time { flex: none; font-variant-numeric: tabular-nums; }
  .mw-turn__head > .mw-status { flex: none; }
  .mw-turn__text { max-width: 68ch; margin: 0; color: var(--ink); font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; white-space: pre-wrap; }
  .mw-turn[data-who="you"] .mw-turn__text { width: fit-content; padding: 8px 12px; border-radius: var(--r-card); background: var(--wash); }
  .mw-turn.is-focus { background: var(--nav-active); box-shadow: 0 0 0 6px var(--nav-active); } /* the wash reaches past the entry without moving it */
  .mw-step.is-focus { background: var(--nav-active); }
  .mw-step { display: grid; grid-template-columns: 14px minmax(0, 1fr) auto; gap: 8px; align-items: center; min-width: 0; margin-left: 34px; padding: 6px 10px; border-radius: var(--r-control); box-shadow: inset 0 0 0 1px var(--line); color: var(--ink-soft); font-size: 12px; line-height: 18px; transition: background-color var(--dur-move) var(--ease-quint); }
  .mw-step > svg { width: 14px; height: 14px; color: var(--faint); }
  .mw-step__what { display: flex; align-items: baseline; gap: 6px; min-width: 0; }
  .mw-step__what > b { flex: none; color: var(--ink); font-weight: var(--weight-control); }
  .mw-step__what > code { min-width: 0; overflow: hidden; color: var(--ink-soft); font: 12px/18px var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
  .mw-step__result { color: var(--muted); white-space: nowrap; font-variant-numeric: tabular-nums; }
  .mw-transcript__note { color: var(--muted); font-size: 12px; line-height: 18px; text-align: center; overflow-wrap: anywhere; }
  .mw-transcript__hit { padding: 0 2px; border-radius: calc(var(--r-tag) / 2); background: var(--amber-soft); color: var(--ink); box-shadow: inset 0 -1px 0 var(--amber); }
  @media (max-width: 760px) {
    .mw-setting.mw-permit--action { flex-wrap: wrap; }
    .mw-setting.mw-permit--action > div:first-child { flex-basis: 100%; }
    .mw-setting.mw-permit--action > .mw-permit__control { flex: 1 1 100%; justify-content: space-between; padding-left: 34px; }
    .mw-step { margin-left: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-setting.mw-permit, .mw-turn, .mw-step { transition: none; }
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

/** Who said it: you (a person, round) or the tool whose session this is (an AI, square). */
export interface MwTranscriptWho { readonly name: string; readonly mark: string; readonly label: string }

export type MwTranscriptEntry =
  | { readonly kind: "you" | "tool"; readonly text: string; readonly time?: string; readonly status?: string; readonly focus?: boolean }
  | { readonly kind: "step"; readonly action: string; readonly object: string; readonly result?: string; readonly icon?: PluginIconName; readonly focus?: boolean }
  | { readonly kind: "note"; readonly text: string };

export interface MwTranscriptOptions {
  readonly label: string;
  readonly you: MwTranscriptWho;
  readonly tool: MwTranscriptWho;
  readonly entries: readonly MwTranscriptEntry[];
  /** Words to mark where they appear in what you and the tool said (the in-session search); matched without regard to case. */
  readonly highlight?: string;
  /** More history above: a button that reads it, or, while it is being read, the loading line with placeholders. */
  readonly earlier?: { readonly label: string; readonly loading?: boolean };
}

function marked(text: string, term: string | undefined): string {
  const needle = term?.trim();
  if (!needle) return escapeHtml(text);
  const pattern = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")})`, "giu");
  return text.split(pattern).map((part, index) => index % 2 ? `<mark class="mw-transcript__hit">${escapeHtml(part)}</mark>` : escapeHtml(part)).join("");
}

function transcriptEntry(entry: MwTranscriptEntry, options: MwTranscriptOptions): string {
  if (entry.kind === "note") return `<li class="mw-transcript__note">${escapeHtml(entry.text)}</li>`;
  if (entry.kind === "step") {
    return `<li class="${cx("mw-step", entry.focus && "is-focus")}">${icon(entry.icon ?? "terminal")}<span class="mw-step__what"><b>${escapeHtml(entry.action)}</b><code title="${escapeHtml(entry.object)}">${escapeHtml(entry.object)}</code></span>${
      entry.result ? `<span class="mw-step__result">${escapeHtml(entry.result)}</span>` : ""}</li>`;
  }
  const who = entry.kind === "you" ? options.you : options.tool;
  const face = `<span class="mw-who" data-kind="${entry.kind === "you" ? "person" : "ai"}" role="img" aria-label="${escapeHtml(who.label)}">${escapeHtml(who.mark)}</span>`;
  const status = entry.status ? renderStatusMark({ label: entry.status, tone: "progress", state: "running", plain: true }) : "";
  return `<li class="${cx("mw-turn", entry.focus && "is-focus")}" data-who="${entry.kind}">${face}<div class="mw-turn__body"><p class="mw-turn__head"><b title="${escapeHtml(who.name)}">${escapeHtml(who.name)}</b>${
    entry.time ? `<time>${escapeHtml(entry.time)}</time>` : ""}${status}</p><p class="mw-turn__text">${marked(entry.text, options.highlight)}</p></div></li>`;
}

/** Another tool's session as it was: earlier history on top, then each entry in order. Read only: nothing in it runs the tool. */
export function renderTranscript(options: MwTranscriptOptions): string {
  const earlier = options.earlier
    ? `<div class="mw-transcript__earlier">${options.earlier.loading
      ? `<p class="mw-loading" role="status">${escapeHtml(options.earlier.label)}</p>${["62%", "84%", "48%"].map((width) => `<span class="mw-skeleton" style="--w: ${width}"></span>`).join("")}`
      : renderButton({ label: options.earlier.label, variant: "ghost", size: "sm", icon: "chevron-up" })}</div>`
    : "";
  return `<div class="mw-transcript" data-slot="transcript">${earlier}<ol class="mw-transcript__log" aria-label="${escapeHtml(options.label)}">${options.entries.map((entry) => transcriptEntry(entry, options)).join("")}</ol></div>`;
}
