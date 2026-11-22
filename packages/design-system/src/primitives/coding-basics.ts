// The board's parts for batch 35's Coding A phase: decided in docs/design/coding-daily-basics/README.md (all four blocks A, user
// 2026-11-04). Markup builders live in `@molis-ai/molis-work-plugin-sdk/ui` so Coding and the board draw one source; the rules are
// here, on tokens only. The composer's pictures are the attachment strip's picture layout (`COMPOSER_PICTURES_STYLES`), which the
// composer's own sheet carries (`COMPOSER_STYLES`). The samples are the board's own words; nothing is read from a Home.
import { renderCheckLine, renderCommandChip, renderCommandPrompt, renderComposerStrip, t, type ComposerStripItem } from "@molis-ai/molis-work-plugin-sdk/ui";
import { composerLabelsIn, type Say } from "./catalog-composer.js";
import { mark, section, specimen } from "./catalog-parts.js";

export { renderCheckLine, renderCommandChip, renderCommandPrompt };
export type { MwCheckError, MwCheckFact, MwCommandChipOptions } from "@molis-ai/molis-work-plugin-sdk/ui";

// (1) Command chip: the command above the words on --accent-soft, its source quiet beside it; the prompt it sends is the platform
// disclosure, placed by the page. (2) Check line: under the review card's title, one line of status marks each with its source,
// one row per error under it; filled unless everything is done, so 没查 never looks like 没有错误. On a narrow card only a done
// fact's source gives way, never the file that explains a failure.
export const CODING_BASICS_STYLES = `
  .mw-cmdchip { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; min-width: 0; padding-inline-start: 10px; border-radius: var(--r-tag); background: var(--accent-soft); animation: craft-rise var(--dur-move) var(--ease-quint) both; }
  .mw-cmdchip__name { display: inline-flex; align-items: center; gap: 6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: var(--weight-control) 12px/1 var(--font-mono); color: var(--accent); }
  .mw-cmdchip__name svg { width: 12px; height: 12px; flex: none; }
  .mw-cmdchip__source { flex: none; font-size: 11px; color: var(--muted); }
  .mw-cmdprompt { max-width: 100%; min-width: 0; font-size: 12px; color: var(--ink-soft); }
  .mw-cmdprompt > pre { margin: 4px 0 0; max-height: 160px; overflow: auto; padding: 8px 10px; border-radius: var(--r-row); background: var(--surface-soft); font: 12px/1.55 var(--font-mono); white-space: pre-wrap; overflow-wrap: anywhere; }
  .mw-checks { display: grid; min-width: 0; background: var(--surface-soft); box-shadow: inset 0 1px 0 var(--line); }
  .mw-checks.is-quiet { background: transparent; }
  .mw-checks__line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 16px; padding: 8px 16px; min-width: 0; font-size: 12px; }
  .mw-checks__fact { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .mw-checks__fact { flex-wrap: wrap; }
  .mw-checks__fact > small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--faint); }
  .mw-checks__fact:not(.is-done) > small { white-space: normal; overflow-wrap: anywhere; }
  .mw-checks .mw-status { white-space: normal; line-height: 1.35; padding-block: 2px; }
  .mw-checks .mw-status > span { overflow: visible; text-overflow: clip; }
  .mw-checks__errors { display: grid; gap: 4px; margin: 0; padding: 0 16px 8px; list-style: none; font-size: 12px; }
  .mw-checks__errors > li { display: flex; align-items: baseline; gap: 6px; min-width: 0; color: var(--red); }
  .mw-checks__errors > li > svg { width: 12px; height: 12px; flex: none; align-self: center; }
  .mw-checks__errors b { flex: none; font: var(--weight-control) 12px var(--font-mono); }
  .mw-checks__errors span { min-width: 0; color: var(--ink-soft); overflow-wrap: anywhere; }
  @media (max-width: 760px) { .mw-checks__fact.is-done > small { display: none; } }
  @media (prefers-reduced-motion: reduce) { .mw-cmdchip { animation: none; } }
  .assistant-code pre { tab-size: var(--code-tab, 4); }
`;

export const CODING_BASICS_BOARD_STYLES = CODING_BASICS_STYLES + `
  #coding-basics .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); align-items: start; }
  #coding-basics .mw-catalog__row { display: grid; gap: 10px; justify-items: start; min-width: 0; }
  #coding-basics .mw-catalog__row > .mw-checks, #coding-basics .mw-catalog__row > .mw-uploads { justify-self: stretch; }
`;

/** A grey picture standing in for a screenshot: the board has no file of its own to show. */
const SAMPLE_PICTURE = "data:image/svg+xml;utf8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#e7e5e0"/><rect x="6" y="8" width="22" height="4" rx="2" fill="#a8a29e"/><rect x="6" y="16" width="14" height="3" rx="1.5" fill="#c8c4bd"/><rect x="6" y="26" width="12" height="6" rx="2" fill="#78716c"/></svg>');
const fill = (text: string, values: Readonly<Record<string, string>>) => text.replace(/\{(\w+)\}/gu, (whole, name: string) => values[name] ?? whole);

export function codingBasicsSection(say: Say = t): string {
  const c = (key: string, values?: Record<string, string | number>) => say(`workbench.catalog-coding-basics.${key}`, values);
  const remove = (name: string) => fill(say("workbench.catalog-composer.remove-name"), { name });
  const chip = renderCommandChip({ name: "review-pr", source: c("command-source"), removeLabel: remove("/review-pr") });
  const prompt = renderCommandPrompt({ label: c("command-prompt-label"), text: c("command-prompt-text"), open: true });
  const builtin = renderCommandChip({ name: "init", source: c("command-builtin"), removeLabel: remove("/init") });
  const labels = composerLabelsIn(say, say("workbench.common.assistant"), say("workbench.catalog-composer.add"));
  const picture = (key: string, extra: Pick<ComposerStripItem, "state"> & Partial<ComposerStripItem>): ComposerStripItem => ({ key, title: c(`${key}-name`), thumb: SAMPLE_PICTURE, open: c("thumb-open", { name: c(`${key}-name`) }), ...extra });
  const pictures = renderComposerStrip(labels, [
    picture("thumb-1", { state: "attached", meta: c("thumb-1-meta") }),
    picture("thumb-2", { state: "failed", reason: c("thumb-2-reason") }),
    picture("thumb-3", { state: "reading" }),
  ], fill, { pictures: true, label: c("thumbs-label") });
  const clean = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "done", text: c("checks-no-new-errors"), source: "tsc" },
    { state: "done", text: c("checks-formatted", { n: 3 }), source: "gopls" },
  ] });
  const failing = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "failed", text: c("checks-new-errors", { n: 2 }), source: "tsc" },
    { state: "done", text: c("checks-formatted", { n: 1 }), source: "gopls" },
  ], errors: [
    { code: "TS2322", where: c("checks-line", { line: 18 }), text: c("checks-error-1") },
    { code: "TS2304", where: c("checks-line", { line: 31 }), text: c("checks-error-2") },
  ] });
  const unchecked = renderCheckLine({ label: c("checks-label"), facts: [
    { state: "idle", text: c("checks-not-checked") },
    { state: "failed", text: c("checks-format-failed"), source: "rustfmt.toml" },
  ] });
  return section("coding-basics", c("section-title"), `<div class="mw-catalog__specimens">
    ${mark("command-chip", specimen(c("specimen-command"), chip + prompt + builtin))}
    ${mark("composer-pictures", specimen(c("specimen-thumbs"), pictures))}
    ${mark("check-line", specimen(c("specimen-checks"), clean + failing + unchecked))}
  </div>`);
}
