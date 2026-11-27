// The component board's specimens for the two parts added by the work-records design (docs/design/work-records/README.md
// 「组件板新增」, decided 2026-11-04): the kind-coloured mark and the category bar, drawn from the shared renderers in work-records.ts.
// Sample data only: nothing is read from a Home or disk.
import { escapeHtml, renderButton, renderStatusMark, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { Say } from "./catalog-composer.js";
import { section, specimen } from "./catalog-parts.js";
import { WORK_RECORD_STYLES, renderCategoryBar, renderKindMark, type MwCategorySegment, type MwKindMarkHue } from "./work-records.js";

export const WORK_RECORDS_BOARD_STYLES = WORK_RECORD_STYLES + `
  .mw-catalog :is([data-primitive="kind-mark"], [data-primitive="category-bar"]) .mw-catalog__specimens { grid-template-columns: repeat(auto-fill, minmax(min(100%, 440px), 1fr)); align-items: start; }
  .mw-catalog :is([data-primitive="kind-mark"], [data-primitive="category-bar"]) .mw-catalog__row { display: grid; gap: 12px; min-width: 0; }
  .mw-catalog [data-primitive="kind-mark"] .mw-items { width: 100%; }
  .mw-catalog [data-primitive="category-bar"] .mw-stat { width: 100%; min-width: 0; }
`;

interface SampleKind {
  readonly id: string;
  readonly hue: MwKindMarkHue;
  readonly icon: PluginIconName;
  readonly name: string;
  readonly summary: string;
  readonly gb: number;
}

function sampleKinds(say: Say): readonly SampleKind[] {
  return [
    { id: "user", hue: "blue", icon: "edit", name: say("workbench.settings-work-records.kind-user"), summary: say("workbench.settings-work-records.kind-user-summary"), gb: 0.12 },
    { id: "ai", hue: "plum", icon: "sparkles", name: say("workbench.settings-work-records.kind-ai"), summary: say("workbench.settings-work-records.kind-ai-summary"), gb: 0.96 },
    { id: "content", hue: "slate", icon: "history", name: say("workbench.settings-work-records.kind-content"), summary: say("workbench.settings-work-records.kind-content-summary"), gb: 0.18 },
    { id: "flow", hue: "ochre", icon: "workflow", name: say("workbench.settings-work-records.kind-flow"), summary: say("workbench.settings-work-records.kind-flow-summary"), gb: 0.21 },
    { id: "present", hue: "clay", icon: "eye", name: say("workbench.settings-work-records.kind-present"), summary: say("workbench.settings-work-records.kind-present-summary"), gb: 0.07 },
  ];
}

function itemRow(mark: string, title: string, meta: string, end: string): string {
  return `<li class="mw-item">${mark}<span><strong title="${escapeHtml(title)}">${escapeHtml(title)}</strong><small title="${escapeHtml(meta)}">${escapeHtml(meta)}</small></span><span class="mw-item__end">${end}</span></li>`;
}

export function kindMarkSection(say: Say): string {
  const kinds = sampleKinds(say);
  const expandLabel = say("workbench.catalog-work-records.expand-details");
  const expand = renderButton({ label: expandLabel, variant: "ghost", size: "icon", icon: "chevron-right", iconOnly: true });
  const list = `<ul class="mw-items">${kinds.map((kind) => itemRow(renderKindMark({ icon: kind.icon, hue: kind.hue }), kind.name, kind.summary, expand)).join("")}</ul>`;

  const lost = renderStatusMark({ label: say("workbench.settings-work-records.status-lost"), tone: "blocked", state: "blocked" });
  const truncated = renderStatusMark({ label: say("workbench.settings-work-records.status-truncated"), tone: "attention", state: "stale" });
  const cleared = renderStatusMark({ label: say("workbench.settings-work-records.status-cleared"), tone: "hold", state: "unavailable" });
  const gaps = `<ul class="mw-items">${
    itemRow(renderKindMark({ icon: "sparkles", hue: "plum" }), say("workbench.catalog-work-records.gap-assistant-ai"), say("workbench.catalog-work-records.gap-assistant-ai-meta"), lost + expand)
    + itemRow(renderKindMark({ icon: "history", hue: "slate" }), say("workbench.catalog-work-records.gap-feed-content"), say("workbench.catalog-work-records.gap-feed-content-meta"), truncated + expand)
    + itemRow(renderKindMark({ icon: "database" }), say("workbench.settings-work-records.gap-all-sources"), say("workbench.catalog-work-records.gap-all-sources-meta"), cleared + expand)
  }</ul>`;

  return section("kind-mark", say("workbench.catalog-work-records.kind-mark"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-work-records.five-kinds-in-list"), list)}
    ${specimen(say("workbench.catalog-work-records.in-gap-rows"), gaps)}
  </div>`);
}

export function categoryBarSection(say: Say): string {
  const kinds = sampleKinds(say);
  const fullSegments: MwCategorySegment[] = [
    ...kinds.map((kind) => ({ hue: kind.hue, label: kind.name, value: kind.gb, formatted: `${kind.gb.toFixed(2)} GB` })),
    { hue: "muted", label: say("workbench.settings-work-records.files-and-images"), value: 0.30, formatted: "0.30 GB" },
  ];
  const fullCard = `<article class="mw-stat"><p>${escapeHtml(say("workbench.settings-work-records.used-by-work-records"))}</p><strong>1.84<small>GB</small></strong><p class="mw-stat__delta">${escapeHtml(say("workbench.catalog-work-records.since-june-projects"))}</p>${
    renderCategoryBar({ label: say("workbench.settings-work-records.usage-by-kind"), segments: fullSegments })
  }</article>`;

  const sparseSegments: MwCategorySegment[] = [
    { hue: "blue", label: kinds[0]!.name, value: 14, formatted: "14 MB" },
    { hue: "plum", label: kinds[1]!.name, value: 68, formatted: "68 MB" },
    { hue: "slate", label: kinds[2]!.name, value: 0, formatted: "0 MB" },
    { hue: "ochre", label: kinds[3]!.name, value: 0, formatted: "0 MB" },
    { hue: "clay", label: kinds[4]!.name, value: 0, formatted: "0 MB" },
    { hue: "muted", label: say("workbench.settings-work-records.files-and-images"), value: 0, formatted: "0 MB" },
  ];
  const emptySegments: MwCategorySegment[] = sparseSegments.map((segment) => ({ ...segment, value: 0, formatted: "0 MB" }));
  const edges = `<article class="mw-stat"><p>${escapeHtml(say("workbench.catalog-work-records.sparse-heading"))}</p><strong>82<small>MB</small></strong>${
    renderCategoryBar({ label: say("workbench.settings-work-records.usage-by-kind"), segments: sparseSegments })
  }</article><article class="mw-stat"><p>${escapeHtml(say("workbench.catalog-work-records.empty-heading"))}</p><strong>0<small>MB</small></strong>${
    renderCategoryBar({ label: say("workbench.settings-work-records.usage-by-kind"), segments: emptySegments })
  }</article>`;

  return section("category-bar", say("workbench.catalog-work-records.category-bar"), `<div class="mw-catalog__specimens">
    ${specimen(say("workbench.catalog-work-records.in-stat-card"), fullCard)}
    ${specimen(say("workbench.catalog-work-records.sparse-and-empty"), edges)}
  </div>`);
}
