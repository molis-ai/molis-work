import { renderButton } from "./button.js";
import { renderStatusMark, type MwStatusTone } from "./feedback.js";
import { cx, escapeHtml, renderAttrs, type AttrValue } from "./html.js";
import { icon } from "./icon.js";
import type { StateRingState } from "./state-ring-states.js";

// The parts the Coding A-phase design added to the board (docs/design/coding-daily-basics/README.md「组件板新增」, scheme A of
// each block, user 2026-11-04): the command chip with its argument and the prompt it sends, and the review card's check line.
// The pictures waiting in the composer are the attachment strip's picture layout (`renderComposerStrip(..., { pictures: true })`),
// not a part of their own. Markup lives here so Coding, the component board and any plugin draw one source; the rules are the
// design system's (`CODING_BASICS_STYLES`).

export interface MwCommandChipOptions {
  /** The command's name, without the slash. Never translated. */
  readonly name: string;
  /** Where it comes from, in the reader's words (内置, 这个项目, 我的). */
  readonly source: string;
  /** The remove button's label, naming the command (「移除 /review-pr」); it is icon-only. */
  readonly removeLabel: string;
  readonly attrs?: Record<string, AttrValue>;
}

/** A command picked from `/`: one chip above the words; what the person types after it is the argument. */
export function renderCommandChip(options: MwCommandChipOptions): string {
  const remove = renderButton({ label: options.removeLabel, icon: "x", iconOnly: true, variant: "ghost", size: "icon", attrs: { title: options.removeLabel, "data-command-remove": options.name } });
  return `<div class="mw-cmdchip" data-command="${escapeHtml(options.name)}"${renderAttrs(options.attrs ?? {})}><span class="mw-cmdchip__name">${icon("terminal")}/${escapeHtml(options.name)}</span><span class="mw-cmdchip__source">${escapeHtml(options.source)}</span>${remove}</div>`;
}

/**
 * The whole prompt a command sends, with the argument already filled in, behind the platform's disclosure. Separate from the chip
 * so the page puts it where opening it pushes nothing the person is typing (Coding: under the box).
 */
export function renderCommandPrompt(options: { readonly label: string; readonly text: string; readonly open?: boolean; readonly attrs?: Record<string, AttrValue> }): string {
  return `<details class="mw-disclosure mw-cmdprompt"${options.open ? " open" : ""}${renderAttrs(options.attrs ?? {})}><summary>${escapeHtml(options.label)}</summary><pre>${escapeHtml(options.text)}</pre></details>`;
}

/** One fact on the check line. `done` checked and clean, or formatted; `failed` new errors, or formatting did not run; `idle` not checked. */
export interface MwCheckFact {
  readonly state: Extract<StateRingState, "done" | "failed" | "idle">;
  readonly text: string;
  /** Which tool or file said so (tsc, gopls, .prettierrc); a `done` fact's source gives way first on a narrow card. */
  readonly source?: string;
}
export interface MwCheckError {
  readonly code: string;
  /** Where, in the reader's words (「第 12 行」, 「src/a.ts:12」). */
  readonly where: string;
  readonly text: string;
}

const TONE: Record<MwCheckFact["state"], MwStatusTone> = { done: "done", failed: "blocked", idle: "quiet" };

/**
 * The review card's check line, under its title: whether the proposed text brings new errors and what formatting did, each with
 * its source; with errors, one row each under the line. Shown before the person approves, so they judge the version that will be
 * written. Only a line where everything is done is quiet: 没查 is never drawn like 没有错误.
 */
export function renderCheckLine(options: { readonly facts: readonly MwCheckFact[]; readonly errors?: readonly MwCheckError[]; readonly label: string; readonly attrs?: Record<string, AttrValue> }): string {
  const facts = options.facts.map(fact => `<span class="${cx("mw-checks__fact", fact.state === "done" && "is-done")}">${renderStatusMark({ label: fact.text, state: fact.state, tone: TONE[fact.state] })}${fact.source ? `<small>${escapeHtml(fact.source)}</small>` : ""}</span>`).join("");
  const errors = options.errors?.length
    ? `<ul class="mw-checks__errors">${options.errors.map(error => `<li>${icon("circle-alert")}<b>${escapeHtml(error.code)}</b><span>${escapeHtml(error.where)} · ${escapeHtml(error.text)}</span></li>`).join("")}</ul>`
    : "";
  const quiet = !options.errors?.length && options.facts.every(fact => fact.state === "done");
  return `<div class="${cx("mw-checks", quiet && "is-quiet")}" role="group" aria-label="${escapeHtml(options.label)}"${renderAttrs(options.attrs ?? {})}><div class="mw-checks__line">${facts}</div>${errors}</div>`;
}
