// The component board's specimens for Batch 37-1's three generated-page adoption parts (docs/design/generated-page-adoption/
// README.md「组件板新增」, Plan B): compare adopt bar, check summary, and field-level edit conflict. The rules and renderers live
// in `home-page-adoption.ts`, shared with the workbench's First Page. Sample copy is fictional; nothing is read from a Home.
import { renderButton } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Say } from "./catalog-composer.js";
import { section, specimen } from "./catalog-parts.js";
import {
  HOME_PAGE_ADOPTION_STYLES,
  renderCheckSummary,
  renderCompareAdoptBar,
  renderEditConflict,
  type CheckSummaryItem,
} from "./home-page-adoption.js";

export const HOME_PAGE_ADOPTION_BOARD_STYLES = HOME_PAGE_ADOPTION_STYLES + `
  .mw-catalog :is([data-primitive="compare-adopt-bar"], [data-primitive="check-summary"], [data-primitive="edit-conflict"]) .mw-catalog__specimens {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr));
    align-items: start;
  }
  .mw-catalog :is([data-primitive="compare-adopt-bar"], [data-primitive="check-summary"], [data-primitive="edit-conflict"]) .mw-catalog__row {
    display: grid; gap: 10px; min-width: 0;
  }
  .mw-catalog [data-compare-frame] {
    display: grid; grid-template-rows: minmax(72px, auto) auto;
    border-radius: var(--r-card, 12px); border: 1px solid var(--line);
    background: var(--paper); overflow: visible;
  }
  .mw-catalog [data-compare-frame] > p {
    margin: 0; padding: 14px 16px; color: var(--muted); font-size: 12px; line-height: 1.5;
  }
  .mw-catalog [data-compare-frame] > .mw-compare-adopt-bar {
    position: relative; border-radius: 0 0 var(--r-card, 12px) var(--r-card, 12px);
  }
  .mw-catalog [data-check-open-stage] { padding-bottom: 184px; }
`;

function sampleChecks(say: Say, kind: "passed" | "failed" | "conflict" | "dep-off"): CheckSummaryItem[] {
  const c = (key: string) => say(`workbench.catalog-home-adoption.${key}`);
  const items: CheckSummaryItem[] = [
    { state: kind === "failed" ? "failed" : "done", text: c(kind === "failed" ? "check-public-failed" : "check-public-ok") },
    { state: "done", text: c("check-sandbox-ok") },
    { state: "done", text: c("check-scope-ok") },
    { state: "done", text: c("check-layout-ok") },
  ];
  if (kind === "dep-off") {
    items.push({ state: "waiting", text: c("check-dep-off-note") });
  }
  return items;
}

function compareAdoptBarSection(say: Say): string {
  const c = (key: string) => say(`workbench.catalog-home-adoption.${key}`);
  const discard = renderButton({ label: c("discard-draft"), variant: "ghost", size: "sm" });
  const frame = (bar: string) => `<div data-compare-frame><p>${c("compare-frame-placeholder")}</p>${bar}</div>`;

  const ready = frame(renderCompareAdoptBar({
    summary: renderCheckSummary({ id: "board-cmp-ready", label: c("status-passed"), tone: "done", state: "done", items: sampleChecks(say, "passed") }),
    actions: discard,
    primary: renderButton({ label: c("adopt-ellipsis"), variant: "primary", size: "sm", key: "↵" }),
  }));
  const failed = frame(renderCompareAdoptBar({
    summary: renderCheckSummary({ id: "board-cmp-failed", label: c("status-failed"), tone: "blocked", state: "failed", items: sampleChecks(say, "failed") }),
    actions: discard,
    primary: renderButton({ label: c("adopt-ellipsis"), variant: "primary", size: "sm", key: "↵", disabled: true, attrs: { title: c("adopt-disabled-check") } }),
  }));
  const conflict = frame(renderCompareAdoptBar({
    summary: renderCheckSummary({ id: "board-cmp-conflict", label: c("status-conflict"), tone: "attention", state: "conflict", items: sampleChecks(say, "conflict") }),
    actions: discard,
    primary: renderButton({ label: c("adopt-ellipsis"), variant: "primary", size: "sm", key: "↵", disabled: true, attrs: { title: c("adopt-disabled-conflict") } }),
  }));

  return section("compare-adopt-bar", c("section-compare-adopt-bar"), `<div class="mw-catalog__specimens">
    ${specimen(c("specimen-compare-ready"), ready)}
    ${specimen(c("specimen-compare-failed"), failed)}
    ${specimen(c("specimen-compare-conflict"), conflict)}
  </div>`);
}

function checkSummarySection(say: Say): string {
  const c = (key: string) => say(`workbench.catalog-home-adoption.${key}`);
  const statesRow = `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">${[
    renderCheckSummary({ id: "board-chk-passed", label: c("status-passed"), tone: "done", state: "done", placement: "down", items: sampleChecks(say, "passed") }),
    renderCheckSummary({ id: "board-chk-failed", label: c("status-failed"), tone: "blocked", state: "failed", placement: "down", items: sampleChecks(say, "failed") }),
    renderCheckSummary({ id: "board-chk-conflict", label: c("status-conflict"), tone: "attention", state: "conflict", placement: "down", items: sampleChecks(say, "conflict") }),
    renderCheckSummary({ id: "board-chk-dep", label: c("status-dep-off"), tone: "hold", state: "waiting", placement: "down", items: sampleChecks(say, "dep-off") }),
  ].join("")}</div>`;
  const openSample = `<div data-check-open-stage>${renderCheckSummary({
    id: "board-chk-open",
    label: c("status-passed"),
    tone: "done",
    state: "done",
    placement: "down",
    open: true,
    items: sampleChecks(say, "passed"),
  })}</div>`;

  return section("check-summary", c("section-check-summary"), `<div class="mw-catalog__specimens">
    ${specimen(c("specimen-check-states"), statesRow)}
    ${specimen(c("specimen-check-open"), openSample)}
  </div>`);
}

function editConflictSection(say: Say): string {
  const c = (key: string) => say(`workbench.catalog-home-adoption.${key}`);
  const pending = renderEditConflict({
    title: c("conflict-title"),
    body: c("conflict-body"),
    mineLabel: c("conflict-mine-label"),
    mineValue: c("conflict-mine-value"),
    nextLabel: c("conflict-next-label"),
    nextValue: c("conflict-next-value"),
    choices: [
      { label: c("conflict-keep-mine"), variant: "secondary" },
      { label: c("conflict-use-new"), variant: "secondary" },
      { label: c("conflict-merge-edit"), variant: "ghost" },
    ],
  });
  const narrow = `<div style="width:min(320px,100%)">${pending}</div>`;
  const resolved = renderEditConflict({
    title: c("conflict-title"),
    mineLabel: c("conflict-mine-label"),
    mineValue: c("conflict-mine-value"),
    nextLabel: c("conflict-next-label"),
    nextValue: c("conflict-next-value"),
    resolved: { text: c("conflict-resolved-text"), changeLabel: c("conflict-change-choice") },
  });

  return section("edit-conflict", c("section-edit-conflict"), `<div class="mw-catalog__specimens">
    ${specimen(c("specimen-conflict-pending"), pending)}
    ${specimen(c("specimen-conflict-narrow"), narrow)}
    ${specimen(c("specimen-conflict-resolved"), resolved)}
  </div>`);
}

export function homePageAdoptionSections(say: Say): string {
  return compareAdoptBarSection(say) + checkSummarySection(say) + editConflictSection(say);
}
