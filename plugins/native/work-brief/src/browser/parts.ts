import { escapeHtml as esc, icon, renderButton, renderStatusMark, renderToggle, type MwButtonOptions } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { NextMark, SourceRow } from "./types.js";

const uiText = globalThis.t;

/** Small shared pieces of the brief page: words, buttons that carry an action, the marks of a source and of a next step. */
export const text = (key: string, values?: Record<string, string | number>) => uiText.text(`work-brief.${key}`, values);
export const when = (iso: string | null | undefined) => (iso ? globalThis.format.date(iso, "datetime") : "");

/** A button that names what it does in `data-wb-act` (and `data-wb-value`). */
export function act(label: string, action: string, options: Omit<MwButtonOptions, "label"> & { value?: string } = {}) {
  return renderButton(actOptions(label, action, options));
}
export function actOptions(label: string, action: string, options: Omit<MwButtonOptions, "label"> & { value?: string } = {}): MwButtonOptions {
  const { value, attrs, ...rest } = options;
  return { variant: "secondary", size: "sm", ...rest, label, attrs: { ...attrs, "data-wb-act": action, ...(value === undefined ? {} : { "data-wb-value": value }) } };
}

/** A row of choices, one pressed. */
export function choices(label: string, action: string, items: readonly { value: string; label: string }[], current: string) {
  return `<div class="mw-toggle-group" role="group" aria-label="${esc(label)}">${items.map(item => renderToggle({ label: item.label, pressed: item.value === current,
    attrs: { "data-wb-act": action, "data-wb-value": item.value } })).join("")}</div>`;
}

export const section = (key: string, body: string) =>
  `<section class="wb-sec" aria-labelledby="wb-${key}"><h3 class="wb-h" id="wb-${key}">${esc(text(`sec.${key}`))}</h3>${body}</section>`;

export const plainMark = (name: Parameters<typeof icon>[0]) => `<span class="mw-mark">${icon(name)}</span>`;

/**
 * Where an object of another plugin goes: the shell draws it there as its owner presents it (name, state, open), outside the page.
 * The page holds only the kind and the id.
 */
export const slot = (place: "cite" | "attention" | "changed" | "next", subject: { kind: string; id: string }) =>
  `<div class="wb-slot" data-wb-slot="${place}" data-kind="${esc(subject.kind)}" data-id="${esc(subject.id)}"></div>`;

// One meaning per colour: grey at rest, mist blue moving, amber the person's turn, red cannot go on. Nothing else on the page is warm.
const TURN = { idle: { tone: "idle", state: "ready" }, moving: { tone: "progress", state: "unread" }, waiting: { tone: "attention", state: "answer" }, blocked: { tone: "blocked", state: "blocked" } } as const;

/** How a source read, or whose turn it is at when it read well. Unreadable and unauthorized never show as "fine" or as zero. */
export function sourceMark(row: Pick<SourceRow, "read" | "turn">): string {
  if (row.read === "unreadable") return renderStatusMark({ label: text("read.unreadable"), tone: "blocked", state: "unavailable" });
  if (row.read === "unauthorized") return renderStatusMark({ label: text("read.unauthorized"), tone: "attention", state: "reauth" });
  if (row.read === "stale") return renderStatusMark({ label: text("read.stale"), tone: "quiet", state: "stale" });
  if (row.read === "none" && row.turn === "idle") return renderStatusMark({ label: text("read.none"), tone: "quiet", state: "idle" });
  return renderStatusMark({ label: text(`turn.${row.turn}`), ...TURN[row.turn] });
}

const NEXT = { later: { tone: "quiet", state: "paused" }, handed: { tone: "progress", state: "generating" }, running: { tone: "progress", state: "running" },
  done: { tone: "done", state: "done" }, failed: { tone: "blocked", state: "failed" }, stale: { tone: "quiet", state: "stale" },
  unknown: { tone: "attention", state: "unavailable" } } as const;
export const nextMark = (state: NextMark["state"]) => renderStatusMark({ label: text(`next.state.${state}`), ...NEXT[state] });
