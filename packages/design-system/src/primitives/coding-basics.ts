// The board's parts for batch 35's Coding A phase: decided in docs/design/coding-daily-basics/README.md (all four blocks A, user
// 2026-11-04). Markup builders live in `@molis-ai/molis-work-plugin-sdk/ui` so Coding and the board draw one source; the rules are
// here, on tokens only. The samples are the board's own words; nothing is read from a Home.
import { renderCheckLine, renderCommandChip, renderThumbTray, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Say } from "./catalog-composer.js";
import { mark, section, specimen } from "./catalog-parts.js";

export { renderCheckLine, renderCommandChip, renderThumbTray };
export type { MwCheckError, MwCheckFact, MwCommandChipOptions, MwThumbItem } from "@molis-ai/molis-work-plugin-sdk/ui";

// Three groups, in order: (1) command chip — the command above the words on --accent-soft, its source quiet beside it, the prompt
// it sends opening under it; (2) thumbnail row — pictures going with the next message, an --amber ring and its own line when one
// cannot go as it is, scrolling sideways rather than growing taller; (3) check line — under the review card title, one line of facts
// each with its source, one row per error under it, quiet (no fill) when there is nothing to fix.
export const CODING_BASICS_STYLES = `
  .mw-cmdchip-wrap { display: grid; gap: 4px; justify-items: start; min-width: 0; max-width: 100%; }
  .mw-cmdchip { display: flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0; padding: 2px 2px 2px 10px; border-radius: var(--r-tag); background: var(--accent-soft); animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  .mw-cmdchip__name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--weight-control) 12px/1 var(--font-mono); color: var(--accent); }
  .mw-cmdchip__name svg { width: 12px; height: 12px; flex: none; }
  .mw-cmdchip__source { flex: none; font-size: 11px; color: var(--muted); }
  .mw-cmdchip__prompt { max-width: 100%; min-width: 0; font-size: 12px; color: var(--ink-soft); }
  .mw-cmdchip__prompt > summary { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; list-style: none; border-radius: var(--r-tag); color: var(--muted); }
  .mw-cmdchip__prompt > summary::-webkit-details-marker { display: none; }
  .mw-cmdchip__prompt > summary:focus-visible { outline: var(--focus-stroke) solid var(--accent); outline-offset: 2px; }
  .mw-cmdchip__prompt > summary svg { width: 12px; height: 12px; transition: transform var(--dur-hover) var(--ease-quint); }
  .mw-cmdchip__prompt[open] > summary svg { transform: rotate(180deg); }
  .mw-cmdchip__prompt > pre { margin: 4px 0 0; max-height: 160px; overflow: auto; padding: 8px 10px; border-radius: var(--r-row); background: var(--surface-soft); font: 12px/1.55 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
  .mw-thumbs { display: flex; gap: 8px; margin: 0; padding: 0; list-style: none; overflow-x: auto; scrollbar-width: thin; min-width: 0; }
  .mw-thumbs__item { display: flex; align-items: center; gap: 8px; flex: none; max-width: 240px; padding: 4px 2px 4px 4px; border-radius: var(--r-row); background: var(--surface-soft); animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  .mw-thumbs__image { display: block; flex: none; width: 40px; height: 40px; padding: 0; border: 0; border-radius: calc(var(--r-row) - 2px); overflow: hidden; background: var(--wash); cursor: zoom-in; box-shadow: 0 0 0 1px var(--line); transition: transform var(--dur-hover) var(--ease-quint), box-shadow var(--dur-hover) var(--ease-quint); }
  .mw-thumbs__image:hover { transform: translateY(-1px); box-shadow: 0 0 0 1px var(--line-strong), var(--lift-1); }
  .mw-thumbs__image:focus-visible { outline: var(--focus-stroke) solid var(--accent); outline-offset: 2px; }
  .mw-thumbs__image > img { display: block; width: 100%; height: 100%; object-fit: cover; }
  .mw-thumbs__item.is-warn .mw-thumbs__image { box-shadow: 0 0 0 1.5px var(--amber); }
  .mw-thumbs__item.is-warn .mw-thumbs__meta small { color: var(--amber); }
  .mw-thumbs__item[aria-busy="true"] .mw-thumbs__image { opacity: .6; }
  .mw-thumbs__meta { display: grid; gap: 2px; min-width: 0; font-size: 12px; }
  .mw-thumbs__meta b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: var(--weight-control); color: var(--ink-soft); }
  .mw-thumbs__meta small { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; font-size: 11px; line-height: 1.35; color: var(--faint); overflow-wrap: anywhere; }
  .mw-checks { display: grid; min-width: 0; background: var(--surface-soft); box-shadow: inset 0 1px 0 var(--line); }
  .mw-checks.is-quiet { background: transparent; }
  .mw-checks__line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 8px 16px; min-width: 0; font-size: 12px; color: var(--ink-soft); }
  .mw-checks__fact { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .mw-checks__fact > small, .mw-checks__errors small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--faint); }
  .mw-checks__errors { display: grid; gap: 4px; margin: 0; padding: 0 16px 8px; list-style: none; font-size: 12px; }
  .mw-checks__errors > li { display: flex; align-items: baseline; gap: 6px; min-width: 0; color: var(--red); }
  .mw-checks__errors > li > svg { width: 12px; height: 12px; flex: none; align-self: center; }
  .mw-checks__errors b { flex: none; font: var(--weight-control) 12px var(--font-mono); }
  .mw-checks__errors span { min-width: 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  @media (max-width: 520px) {
    .mw-checks__fact > small { display: none; }
    .mw-thumbs__item { max-width: 200px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mw-cmdchip, .mw-thumbs__item { animation: none; }
    .mw-thumbs__image, .mw-cmdchip__prompt > summary svg { transition: none; }
  }
`;

export const CODING_BASICS_BOARD_STYLES = CODING_BASICS_STYLES + `
  #coding-basics .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  #coding-basics .mw-catalog__row { display: grid; gap: 10px; min-width: 0; }
`;

/** A grey picture standing in for a screenshot: the board has no file of its own to show. */
const SAMPLE_PICTURE = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#e7e5e0"/><rect x="6" y="8" width="22" height="4" rx="2" fill="#a8a29e"/><rect x="6" y="16" width="14" height="3" rx="1.5" fill="#c8c4bd"/><rect x="6" y="26" width="12" height="6" rx="2" fill="#78716c"/></svg>');

export function codingBasicsSection(say: Say = t): string {
  const c = (key: string, values?: Record<string, string | number>) => say(`workbench.catalog-coding-basics.${key}`, values);
  const chip = renderCommandChip({ name: c("command-name"), source: c("command-source"), removeLabel: c("command-remove"), prompt: { label: c("command-prompt-label"), text: c("command-prompt-text") } });
  const chipPlain = renderCommandChip({ name: "init", source: c("command-builtin"), removeLabel: c("command-remove") });
  const thumbs = renderThumbTray([
    { src: SAMPLE_PICTURE, name: c("thumb-1-name"), meta: c("thumb-1-meta"), openLabel: c("thumb-open", { name: c("thumb-1-name") }), removeLabel: c("thumb-remove") },
    { src: SAMPLE_PICTURE, name: c("thumb-2-name"), meta: c("thumb-2-meta"), openLabel: c("thumb-open", { name: c("thumb-2-name") }), removeLabel: c("thumb-remove"), tone: "warn" },
    { src: SAMPLE_PICTURE, name: c("thumb-3-name"), meta: c("thumb-3-meta"), openLabel: c("thumb-open", { name: c("thumb-3-name") }), removeLabel: c("thumb-remove"), busy: true },
  ], { label: c("thumbs-label") });
  const clean = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "done", text: c("checks-no-new-errors"), source: "tsc" },
    { state: "done", text: c("checks-formatted", { n: 3 }), source: "prettier" },
  ] });
  const failing = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "failed", text: c("checks-new-errors", { n: 2 }), source: "tsc" },
    { state: "done", text: c("checks-formatted", { n: 2 }), source: "prettier" },
  ], errors: [
    { code: "TS2322", where: c("checks-line", { line: 18 }), text: c("checks-error-1") },
    { code: "TS2304", where: c("checks-line", { line: 31 }), text: c("checks-error-2") },
  ] });
  const unchecked = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "unavailable", text: c("checks-not-checked") },
    { state: "failed", text: c("checks-format-failed"), source: ".prettierrc" },
  ] });
  return section("coding-basics", c("section-title"), `<div class="mw-catalog__specimens">
    ${mark("command-chip", specimen(c("specimen-command"), chip + chipPlain))}
    ${mark("thumb-tray", specimen(c("specimen-thumbs"), thumbs))}
    ${mark("check-line", specimen(c("specimen-checks"), clean + failing + unchecked))}
  </div>`);
}
