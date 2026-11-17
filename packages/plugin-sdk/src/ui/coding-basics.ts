import { renderButton } from "./button.js";
import { cx, escapeHtml, renderAttrs, type AttrValue } from "./html.js";
import { icon } from "./icon.js";
import { renderStateRing } from "./state-ring.js";
import type { StateRingState } from "./state-ring-states.js";

// The three parts the Coding A-phase design added to the board (docs/design/coding-daily-basics/README.md「组件板新增」, scheme A of
// each block, user 2026-11-04): the command chip with its argument, the composer's thumbnail row, and the review card's check line.
// Markup lives here so Coding, the component board and any plugin draw one source; the rules are the design system's
// (`CODING_BASICS_STYLES`). Every control inside them is an existing one (button, state ring, badge-like source word).

export interface MwCommandChipOptions {
  /** The command's name, without the slash. */
  readonly name: string;
  /** Where it comes from, in the reader's words (内置, 这个项目, 我的). */
  readonly source: string;
  /** The remove button's label (it is icon-only). */
  readonly removeLabel: string;
  /** The exact prompt that goes out with what the person types after the chip, behind a disclosure. */
  readonly prompt?: { readonly label: string; readonly text: string };
  readonly attrs?: Record<string, AttrValue>;
}

/** A command picked from `/`: one chip above the words, what follows it is the argument; the whole prompt can be opened to read. */
export function renderCommandChip(options: MwCommandChipOptions): string {
  const remove = renderButton({ label: options.removeLabel, icon: "x", iconOnly: true, variant: "ghost", size: "sm", attrs: { "data-command-remove": "" } });
  const prompt = options.prompt
    ? `<details class="mw-cmdchip__prompt"><summary>${icon("chevron-down")}<span>${escapeHtml(options.prompt.label)}</span></summary><pre>${escapeHtml(options.prompt.text)}</pre></details>`
    : "";
  return `<div class="mw-cmdchip-wrap"${renderAttrs(options.attrs ?? {})}><div class="mw-cmdchip" data-command="${escapeHtml(options.name)}"><span class="mw-cmdchip__name">${icon("terminal")}/${escapeHtml(options.name)}</span><span class="mw-cmdchip__source">${escapeHtml(options.source)}</span>${remove}</div>${prompt}</div>`;
}

export interface MwThumbItem {
  /** A data or same-origin URL of the saved picture. */
  readonly src: string;
  readonly name: string;
  /** Size and state in a few words (「240 KB · 已存一份」, 「12.4 MB · 超过 5 MB」); up to two lines, so a reason is never cut. */
  readonly meta: string;
  /** The open button's label: the picture opens in the board's image viewer. */
  readonly openLabel: string;
  readonly removeLabel: string;
  /** `warn` when the picture cannot go as it is (too large, the model cannot see it). */
  readonly tone?: "warn";
  /** Still being saved: the row shows it and the remove button stays. */
  readonly busy?: boolean;
  readonly attrs?: Record<string, AttrValue>;
}

/** The pictures waiting to go with the next message, inside the composer above its words. */
export function renderThumbTray(items: readonly MwThumbItem[], options: { readonly label: string; readonly attrs?: Record<string, AttrValue> }): string {
  const rows = items.map(item => {
    const remove = renderButton({ label: item.removeLabel, icon: "x", iconOnly: true, variant: "ghost", size: "sm", attrs: { "data-thumb-remove": "" } });
    return `<li class="${cx("mw-thumbs__item", item.tone === "warn" && "is-warn")}"${item.busy ? ' aria-busy="true"' : ""}${renderAttrs(item.attrs ?? {})}><button type="button" class="mw-thumbs__image" aria-label="${escapeHtml(item.openLabel)}" data-thumb-open=""><img src="${escapeHtml(item.src)}" alt="" loading="lazy" decoding="async"></button><span class="mw-thumbs__meta"><b title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</b><small>${escapeHtml(item.meta)}</small></span>${remove}</li>`;
  }).join("");
  return `<ul class="mw-thumbs" aria-label="${escapeHtml(options.label)}"${renderAttrs(options.attrs ?? {})}>${rows}</ul>`;
}

export interface MwCheckFact {
  /** `done` checked and clean or formatted; `failed` new errors or the tool did not run; `unavailable` no tool for this language. */
  readonly state: StateRingState;
  readonly text: string;
  /** Which tool said so (tsc, prettier); it gives way first on a narrow card. */
  readonly source?: string;
}
export interface MwCheckError {
  readonly code: string;
  /** Where, in the reader's words (「第 12 行」, 「src/a.ts:12」). */
  readonly where: string;
  readonly text: string;
}

/**
 * The review card's check line, under its title: whether the writing brought new errors and how much was formatted, each with its
 * source; with errors, one row each under the line. Shown before the person approves, so they judge the version that will be written.
 */
export function renderCheckLine(options: { readonly facts: readonly MwCheckFact[]; readonly errors?: readonly MwCheckError[]; readonly label: string; readonly attrs?: Record<string, AttrValue> }): string {
  const facts = options.facts.map(fact => `<span class="mw-checks__fact">${renderStateRing({ state: fact.state })}<span>${escapeHtml(fact.text)}</span>${fact.source ? `<small>${escapeHtml(fact.source)}</small>` : ""}</span>`).join("");
  const errors = options.errors?.length
    ? `<ul class="mw-checks__errors">${options.errors.map(error => `<li>${icon("circle-alert")}<b>${escapeHtml(error.code)}</b><span>${escapeHtml(error.where)} · ${escapeHtml(error.text)}</span></li>`).join("")}</ul>`
    : "";
  return `<div class="${cx("mw-checks", !options.errors?.length && "is-quiet")}" role="group" aria-label="${escapeHtml(options.label)}"${renderAttrs(options.attrs ?? {})}><div class="mw-checks__line">${facts}</div>${errors}</div>`;
}
