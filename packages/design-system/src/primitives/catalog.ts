import { renderCatalogExamples } from "../catalog-examples.js";
import { escapeHtml, icon, renderButton, renderDirectoryRow, renderStatusMark, type PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import { ICON_LIBRARY } from "../icons.js";
import { baselineToken } from "../baseline.js";
import { renderStateRingCatalog } from "./status-ring-catalog.js";
import { renderProjectMonogram } from "../monogram.js";
import { MW_ACTION_TONES, MW_CONTENT_MARKS, MW_CONTENT_SURFACES, MW_HUES, MW_STATUS_TONES, MW_SURFACES, MW_TYPE_TONES, type MwContentMarkId, type MwHueId } from "../palette.js";
import { renderBarContext, renderBarStatus, renderBrief, renderBriefFocus, renderBriefRecent, renderBriefSection, renderBriefStatus, renderCaption, renderFileGroup, renderFileRow, renderProgressTrack, renderSteps, renderWordmark } from "./arrival.js";
import { mark, resolveCatalogSay, section, specimen, type CatalogSay } from "./catalog-parts.js";
import { CATALOG_CLIENT_SCRIPT } from "../page-clients.js";
import { choiceSection, composeSection } from "./catalog-compose.js";
import { advancedFieldSection, badgeSection, buttonSection, severityGridSection, calendarSection, feedbackSection, fieldSection, formSection, groupsSection, menuSection, overlaySection, separatorSection, tabsSection } from "./catalog-controls.js";
import { directorySection, layoutSection } from "./catalog-layout.js";
import { COMPOSER_STYLES } from "../composer-styles.js";
import { COMPOSER_BOARD_STYLES, commandsSection, composerSection, menuDescSection, micSection } from "./catalog-composer.js";
import { keepEditsSections, KEEP_EDITS_BOARD_STYLES } from "./catalog-keep-edits.js";
import { noteSection, sourceLadderSection } from "./catalog-source-ladder.js";
import { buttonGroupSection, CATALOG_PATTERN_STYLES, dataTableSection, dropZoneSection, rowsSection, statSection, tagInputSection } from "./catalog-patterns.js";
import { lookSections } from "./catalog-appearance.js";
import { APPEARANCE_BOARD_STYLES } from "./catalog-appearance-styles.js";
import { PRESENTATION_BOARD_STYLES, presentationSection, type CatalogPresentationPlugin } from "./catalog-presentation.js";
import { PRESENTATION_FORM_STYLES } from "../styles/presentation.js";
import { componentText, PLUGIN_COMPONENTS } from "../plugin-components.js";
import { SKILL_SELECTION_BOARD_STYLES, skillLineSection, skillWhySection } from "./catalog-skill-selection.js";
import { itemChoiceSection, itemDetailsSection, listDetailSection, SKILL_PACK_BOARD_STYLES, statusLinkSection } from "./catalog-skill-packs.js";
import { CAPABILITY_PACK_BOARD_STYLES, adoptBarSection, askRowSection, cellGridSection, detailTrailSection, iconCountsSection, itemGroupSection, leaveBarSection, nowBlockSection, placeholderListSection, replayGridSection, stateRowsSection, stickyDetailSection, textCountSection, usageSection } from "./catalog-capability-packs.js";
import { WORK_RECORDS_BOARD_STYLES, categoryBarSection, kindMarkSection } from "./catalog-work-records.js";
import { LANGUAGE_BOARD_STYLES, languageSection, motionGrammarSpecimens, pairingSection, zonesSection } from "./catalog-language.js";
import { RECOVERY_BOARD_STYLES, recoverySections } from "./recovery-parts.js";
import { CODING_BASICS_BOARD_STYLES, codingBasicsSection } from "./coding-basics.js";
import { HOME_PAGE_ADOPTION_BOARD_STYLES, homePageAdoptionSections } from "./catalog-home-page-adoption.js";

export const PRIMITIVE_CATALOG_IDS = PLUGIN_COMPONENTS.map(({ kind }) => kind);
const catalogComponents = new Map(PLUGIN_COMPONENTS.map(component => [component.kind, component]));

const SURFACE_ROLE_KEY: Record<typeof MW_SURFACES[number]["token"], string> = {
  "--page": "workbench.catalog-board.ds.pal-surf-page",
  "--paper": "workbench.catalog-board.ds.pal-surf-paper",
  "--surface-soft": "workbench.catalog-board.ds.pal-surf-soft",
  "--rail": "workbench.catalog-board.ds.pal-surf-rail",
  "--line": "workbench.catalog-board.ds.pal-surf-line",
  "--line-strong": "workbench.catalog-board.ds.pal-surf-line-strong",
};

const TYPE_TONE_ROLE_KEY: Record<typeof MW_TYPE_TONES[number]["token"], string> = {
  "--ink": "workbench.catalog-board.ds.pal-type-ink",
  "--ink-soft": "workbench.catalog-board.ds.pal-type-soft",
  "--muted": "workbench.catalog-board.ds.pal-type-muted",
  "--faint": "workbench.catalog-board.ds.pal-type-faint",
};

const ACTION_TONE_ROLE_KEY: Record<typeof MW_ACTION_TONES[number]["token"], string> = {
  "--action": "workbench.catalog-board.ds.pal-act-action",
  "--action-ink": "workbench.catalog-board.ds.pal-act-ink",
  "--accent": "workbench.catalog-board.ds.pal-act-accent",
  "--accent-soft": "workbench.catalog-board.ds.pal-act-soft",
};

const STATUS_TONE_ROLE_KEY: Record<typeof MW_STATUS_TONES[number]["token"], string> = {
  "--tone-idle": "workbench.catalog-board.ds.pal-stat-idle",
  "--tone-progress": "workbench.catalog-board.ds.pal-stat-progress",
  "--tone-attention": "workbench.catalog-board.ds.pal-stat-attention",
  "--tone-hold": "workbench.catalog-board.ds.pal-stat-hold",
  "--tone-blocked": "workbench.catalog-board.ds.pal-stat-blocked",
  "--tone-done": "workbench.catalog-board.ds.pal-stat-done",
  "--tone-quiet": "workbench.catalog-board.ds.pal-stat-quiet",
};

const HUE_ROLE_KEY: Record<MwHueId, string> = {
  gray: "workbench.catalog-board.ds.pal-hue-gray",
  brown: "workbench.catalog-board.ds.pal-hue-brown",
  orange: "workbench.catalog-board.ds.pal-hue-orange",
  yellow: "workbench.catalog-board.ds.pal-hue-yellow",
  green: "workbench.catalog-board.ds.pal-hue-green",
  mint: "workbench.catalog-board.ds.pal-hue-mint",
  cyan: "workbench.catalog-board.ds.pal-hue-cyan",
  blue: "workbench.catalog-board.ds.pal-hue-blue",
  indigo: "workbench.catalog-board.ds.pal-hue-indigo",
  purple: "workbench.catalog-board.ds.pal-hue-purple",
  pink: "workbench.catalog-board.ds.pal-hue-pink",
  red: "workbench.catalog-board.ds.pal-hue-red",
  steel: "workbench.catalog-board.ds.pal-hue-steel",
  slate: "workbench.catalog-board.ds.pal-hue-slate",
};

const CONTENT_SURFACE_ROLE_KEY: Record<typeof MW_CONTENT_SURFACES[number]["token"], string> = {
  "--content-side": "workbench.catalog-board.ds.pal-csurf-side",
  "--content-paper": "workbench.catalog-board.ds.pal-csurf-paper",
  "--content-ink": "workbench.catalog-board.ds.pal-csurf-ink",
  "--content-muted": "workbench.catalog-board.ds.pal-csurf-muted",
  "--content-line": "workbench.catalog-board.ds.pal-csurf-line",
  "--content-accent": "workbench.catalog-board.ds.pal-csurf-accent",
  "--content-select": "workbench.catalog-board.ds.pal-csurf-select",
};

const CONTENT_MARK_LABEL_KEY: Record<MwContentMarkId, string> = {
  slate: "workbench.catalog-board.ds.pal-mark-slate-label",
  blue: "workbench.catalog-board.ds.pal-mark-blue-label",
  ochre: "workbench.catalog-board.ds.pal-mark-ochre-label",
  plum: "workbench.catalog-board.ds.pal-mark-plum-label",
  clay: "workbench.catalog-board.ds.pal-mark-clay-label",
};

const CONTENT_MARK_ROLE_KEY: Record<MwContentMarkId, string> = {
  slate: "workbench.catalog-board.ds.pal-mark-slate-role",
  blue: "workbench.catalog-board.ds.pal-mark-blue-role",
  ochre: "workbench.catalog-board.ds.pal-mark-ochre-role",
  plum: "workbench.catalog-board.ds.pal-mark-plum-role",
  clay: "workbench.catalog-board.ds.pal-mark-clay-role",
};

const ICON_GROUP_KEY = {
  chrome: "workbench.catalog-board.ds.icons-group-chrome",
  action: "workbench.catalog-board.ds.icons-group-action",
  object: "workbench.catalog-board.ds.icons-group-object",
  status: "workbench.catalog-board.ds.icons-group-status",
} as const;


/** A chapter starts where this mark stands among the sections; the index puts its name over the sections that follow. */
const chapter = (name: string) => `<!--chapter:${name}-->`;
/** The index's group heading; the workbench heads its own sections with the same one. */
export const catalogIndexGroup = (name: string) => `<p class="mw-catalog__index-group" data-catalog-group>${escapeHtml(name)}</p>`;

/** Extra chapter supplied by a host board (replaces regex splicing on rendered HTML). */
export interface CatalogExtraChapter {
  readonly title: string;
  readonly linksHtml: string;
  readonly sectionsHtml: string;
  readonly count: number;
}

/**
 * Section index derived from the rendered sections, so a new section cannot be left out of it. Chapters include any
 * host-supplied extraChapters, and filter chips + search narrow the sidebar without regex patching.
 */
function catalogIndex(sections: string, say: CatalogSay, extraChapters: readonly CatalogExtraChapter[] = []): string {
  const specimens = new Set([...sections.matchAll(/data-primitive="([^"]+)"/gu)].map(([, id]) => id));
  for (const kind of PRIMITIVE_CATALOG_IDS) {
    if (!specimens.has(kind)) throw new Error(`组件板缺少 ${kind} 的标本。`);
  }
  const entries = [...sections.matchAll(/<!--chapter:([^>]+)-->|<section class="mw-catalog__section" id="([^"]+)"[^>]*><h2>([^<]+)<\/h2>/g)];
  const chapterNames: string[] = [];
  const coreLinks = entries.map(([, group, id, title]) => {
    if (group) {
      chapterNames.push(group);
      return catalogIndexGroup(group);
    }
    const component = catalogComponents.get(id!);
    const short = component ? escapeHtml(componentText(component.name, say)) : title!.split(" / ")[0];
    const description = component ? escapeHtml(componentText(component.description, say)) : title;
    return `<a href="#${id}" title="${description}">${short}</a>`;
  }).join("");
  const extraLinks = extraChapters.map((extra) => {
    chapterNames.push(extra.title);
    return `${catalogIndexGroup(extra.title)}${extra.linksHtml}`;
  }).join("");
  const coreCount = entries.filter(([, group]) => !group).length;
  const totalCount = coreCount + extraChapters.reduce((sum, item) => sum + item.count, 0);
  const chips = [
    `<button type="button" class="mw-catalog__chip is-active" data-catalog-chapter="" aria-pressed="true">${escapeHtml(say("workbench.catalog-board.ds.index-all"))}</button>`,
    ...chapterNames.map((name) => `<button type="button" class="mw-catalog__chip" data-catalog-chapter="${escapeHtml(name)}" aria-pressed="false"> ${escapeHtml(name)} </button>`),
  ].join("");
  const find = `<div class="mw-catalog__index-find"><input class="mw-input" type="search" data-catalog-find placeholder="${escapeHtml(say("workbench.catalog-board.ds.index-find-placeholder"))}" aria-label="${escapeHtml(say("workbench.catalog-board.ds.index-find-aria"))}" autocomplete="off"><div class="mw-catalog__chips" role="group" aria-label="${escapeHtml(say("workbench.catalog-board.ds.index-chapters-aria"))}">${chips}</div></div>`;
  return `<nav class="mw-catalog__index" data-catalog-index aria-label="${escapeHtml(say("workbench.catalog-board.ds.index-nav-aria"))}" style="grid-row: 1 / span ${totalCount}">${find}${coreLinks}${extraLinks}<p class="mw-catalog__index-none" data-catalog-none hidden>${escapeHtml(say("workbench.catalog-board.ds.index-none"))}</p></nav>`;
}

function swatch(token: string, label: string, role: string, fillToken?: string): string {
  const fill = fillToken
    ? `<i class="mw-swatch__fill" style="background: var(${fillToken})"></i>`
    : "";
  return `<div class="mw-swatch"><i class="mw-swatch__chip" style="background: var(${token})"></i>${fill}<span>${escapeHtml(label)}</span><small>${escapeHtml(role)}</small></div>`;
}

function paletteSection(say: CatalogSay): string {
  const surfaces = MW_SURFACES.map((item) => swatch(item.token, item.label, say(SURFACE_ROLE_KEY[item.token]))).join("");
  const type = MW_TYPE_TONES.map((item) => swatch(item.token, item.label, say(TYPE_TONE_ROLE_KEY[item.token]))).join("");
  const action = MW_ACTION_TONES.map((item) => swatch(item.token, item.label, say(ACTION_TONE_ROLE_KEY[item.token]))).join("");
  const hues = MW_HUES.map((hue) => swatch(`--hue-${hue.id}`, hue.label, say(HUE_ROLE_KEY[hue.id]), `--hue-${hue.id}-fill`)).join("");
  const status = MW_STATUS_TONES.map((item) => swatch(item.token, item.label, say(STATUS_TONE_ROLE_KEY[item.token]))).join("");
  const content = MW_CONTENT_SURFACES.map((item) => swatch(item.token, item.label, say(CONTENT_SURFACE_ROLE_KEY[item.token]))).join("");
  const marks = MW_CONTENT_MARKS.map((item) => swatch(`--mark-${item.id}`, say(CONTENT_MARK_LABEL_KEY[item.id]), say(CONTENT_MARK_ROLE_KEY[item.id]), `--mark-${item.id}-fill`)).join("");
  return section("palette", escapeHtml(say("workbench.catalog-board.ds.palette-title")), `<div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-surfaces")), `<div class="mw-swatch-row">${surfaces}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-type")), `<div class="mw-swatch-row">${type}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-action")), `<div class="mw-swatch-row">${action}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-status")), `<div class="mw-swatch-row">${status}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-hues")), `<div class="mw-swatch-row">${hues}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-content")), `<div class="mw-swatch-row">${content}</div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.palette-spec-marks")), `<div class="mw-swatch-row">${marks}</div>`)}
  </div>`);
}

function typefaceSection(say: CatalogSay): string {
  return section("typeface", say("workbench.env.font"), `<div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.type-weight-roles")), `<div class="mw-type-sample">
      <p class="mw-type-sample__display">${escapeHtml(say("workbench.catalog-board.ds.type-sample-display"))}</p>
      <p class="mw-type-sample__title">${escapeHtml(say("workbench.catalog-board.ds.type-sample-title"))}</p>
      <p class="mw-type-sample__item">${escapeHtml(say("workbench.catalog-board.ds.type-sample-item"))}</p>
      <p class="mw-type-sample__body">${escapeHtml(say("workbench.catalog-board.ds.type-sample-body"))}</p>
      <p class="mw-type-sample__caption">${escapeHtml(say("workbench.catalog-board.ds.type-sample-caption"))}</p>
      <p class="mw-type-sample__mono"><code>pnpm --filter ./packages/design-system run build</code></p>
    </div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.type-stack-heading")), `<div class="mw-type-sample">
      <p class="mw-type-sample__item">Inter Variable · Noto Sans SC (400 / 500 / 600) <span class="mw-type-sample__caption">${escapeHtml(say("workbench.catalog-board.ds.type-stack-primary-note"))}</span></p>
      <p class="mw-type-sample__item">PingFang SC · Hiragino Sans GB · Microsoft YaHei UI <span class="mw-type-sample__caption">${escapeHtml(say("workbench.catalog-board.ds.type-stack-fallback-note"))}</span></p>
      <p class="mw-type-sample__caption">${escapeHtml(say("workbench.catalog-board.ds.type-stack-metrics"))}</p>
    </div>`)}
  </div>`);
}

/** Soft Workbench space, depth, corners, motion and the few moments that get one. */
function craftSection(say: CatalogSay): string {
  const escape = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char);
  const lifts = [
    ["--sheet-shadow", say("workbench.catalog-board.ds.craft-lift-sheet")],
    ["--lift-1", say("workbench.catalog-board.ds.craft-lift-1")],
    ["--lift-2", say("workbench.catalog-board.ds.craft-lift-2")],
    ["--lift-3", say("workbench.catalog-board.ds.craft-lift-3")],
  ].map(([token, role]) => `<div class="mw-craft-lift" style="box-shadow: var(${token})"><code>${token}</code><small>${escapeHtml(role)}</small></div>`).join("");
  const radii = [["--r-tag", "6"], ["--r-control", "8"], ["--r-row", "10"], ["--r-card", "12"], ["--r-sheet", "14"], ["--r-composer", "15"], ["--r-dialog", "16"]]
    .map(([token, px]) => `<div class="mw-craft-radius" style="border-radius: var(${token})"><code>${token}</code><small>${px}px</small></div>`).join("");
  const motion = [
    ["--dur-press", "130ms", say("workbench.catalog-board.ds.craft-dur-press")],
    ["--dur-move", "250ms", say("workbench.catalog-board.ds.craft-dur-move")],
    ["--dur-arrive", "420ms", say("workbench.catalog-board.ds.craft-dur-arrive")],
    [say("workbench.catalog-board.ds.craft-dur-guide-token"), "130 + 420ms", say("workbench.catalog-board.ds.craft-dur-guide")],
    ["--dur-moment", "640ms", say("workbench.catalog-board.ds.craft-dur-moment")],
    ["--dur-stagger", "60ms", say("workbench.catalog-board.ds.craft-dur-stagger")],
  ].map(([token, value, role]) => `<tr><td><code>${escapeHtml(token!)}</code></td><td>${value}</td><td>${escapeHtml(role!)}</td></tr>`).join("") +
    // The curves' values are read from the baseline, the one place they are written (POLISH-33).
    [["ease-quint", say("workbench.catalog-board.ds.craft-ease-quint")], ["ease-spring", say("workbench.catalog-board.ds.craft-ease-spring")]]
      .map(([name, role]) => `<tr><td><code>--${name}</code></td><td>${escape(baselineToken(name!).replace(/^[^:]*:\s*|;\s*$/gu, ""))}</td><td>${escapeHtml(role!)}</td></tr>`).join("");
  const monograms = [
    [say("workbench.catalog-board.ds.craft-mono-demo"), "project-demo"],
    [say("workbench.catalog-board.ds.craft-mono-growth"), "project-growth"],
    ["Research", "project-research"],
    [say("workbench.catalog-board.ds.craft-mono-brand"), "project-brand"],
    ["Onboarding", "project-onboard"],
  ].map(([name, id]) => `<span class="mw-craft-mono">${renderProjectMonogram(name!, id!, escape)}<span>${escape(name!)}</span></span>`).join("");
  const expandLabel = escapeHtml(say("workbench.catalog-board.ds.craft-inset-expand"));
  return section("craft", escapeHtml(say("workbench.catalog-board.ds.craft-title")), `
    <div class="mw-catalog__specimens">
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-space")), `<div class="mw-craft-space" aria-hidden="true"><i class="mw-craft-space__dir"></i><div class="mw-craft-space__main"><i class="mw-craft-space__tabs"></i><div class="mw-craft-space__sheet"><b></b><b></b><b></b></div></div><div class="mw-craft-space__bar"><i></i><em></em><i></i></div></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-lift")), `<div class="mw-craft-row">${lifts}</div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-radii")), `<div class="mw-craft-row">${radii}</div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-motion")), `<div class="mw-lang-scroll"><table class="mw-table mw-craft-motion"><thead><tr><th>Token</th><th>${escapeHtml(say("workbench.catalog-board.ds.craft-col-duration"))}</th><th>${escapeHtml(say("workbench.catalog-board.ds.craft-col-usage"))}</th></tr></thead><tbody>${motion}</tbody></table></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-try")), `<div class="mw-craft-row">
        ${renderButton({ label: say("workbench.catalog-board.ds.craft-try-press"), variant: "primary" })}
        ${renderButton({ label: say("workbench.catalog-board.ds.craft-try-rise"), variant: "secondary", attrs: { "data-craft-demo": "rise" } })}
        ${renderButton({ label: say("workbench.catalog-board.ds.craft-try-land"), variant: "secondary", attrs: { "data-craft-demo": "land" } })}
        ${renderButton({ label: say("workbench.catalog-board.ds.craft-try-celebrate"), variant: "secondary", attrs: { "data-craft-demo": "celebrate" } })}
      </div>
      <div class="mw-craft-stage" data-craft-demo-target><span class="mw-craft-stage__title">${escapeHtml(say("workbench.catalog-board.ds.craft-stage-title"))}</span><span class="mw-object-status mw-object-status--in_progress" data-craft-demo-status>${icon("play")}<span>${escapeHtml(say("workbench.catalog-board.ds.craft-stage-status"))}</span></span></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-monograms")), `<div class="mw-craft-row">${monograms}</div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-tabs-tips")), `<div class="mw-craft-row mw-craft-strip"><span class="mw-craft-tab">${icon("home")}<span>${escapeHtml(say("workbench.catalog-board.ds.craft-tab-home"))}</span></span><span class="craft-tip mw-craft-tip" data-shown>Inbox<kbd>⌥5</kbd></span></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.craft-spec-inset")), `<div class="mw-section-well" style="max-width:560px"><div class="mw-inset-group">
        <div class="mw-inset-row" data-catalog-inset-row data-open="false">
          <span class="mw-inset-row__lead mw-glyph-status mw-status--progress" title="${escapeHtml(say("workbench.catalog-board.ds.craft-inset-progress-title"))}">${icon("play")}</span>
          <div class="mw-inset-row__body">
            <p class="mw-inset-row__title">${escapeHtml(say("workbench.catalog-board.ds.craft-inset-1-title"))}</p>
            <div class="mw-inset-row__signals"><span class="mw-signal"><i class="mw-signal-dot mw-status--progress"></i>${escapeHtml(say("workbench.catalog-board.ds.craft-inset-1-sig1"))}</span><span class="mw-signal">${icon("file")}${escapeHtml(say("workbench.catalog-board.ds.craft-inset-1-sig2"))}</span></div>
          </div>
          <span class="mw-inset-row__end"><span class="mw-num">2m</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-catalog-inset-toggle>${expandLabel}</button></span>
          <div class="mw-inset-row__drawer"><div><p class="mw-catalog__hint" style="padding-top:4px">${escapeHtml(say("workbench.catalog-board.ds.craft-inset-1-drawer"))}</p></div></div>
        </div>
        <div class="mw-inset-row" data-catalog-inset-row data-open="false">
          <span class="mw-inset-row__lead mw-glyph-status mw-status--done" title="${escapeHtml(say("workbench.catalog-board.ds.craft-inset-done-title"))}">${icon("check")}</span>
          <div class="mw-inset-row__body">
            <p class="mw-inset-row__title">${escapeHtml(say("workbench.catalog-board.ds.craft-inset-2-title"))}</p>
            <div class="mw-inset-row__signals"><span class="mw-signal"><i class="mw-signal-dot mw-status--done"></i>${escapeHtml(say("workbench.catalog-board.ds.craft-inset-2-sig1"))}</span><span class="mw-signal">${icon("clock")}7.04 MB</span></div>
          </div>
          <span class="mw-inset-row__end"><span class="mw-num">${escapeHtml(say("workbench.catalog-board.ds.craft-inset-just-now"))}</span><button type="button" class="mw-btn mw-btn--ghost mw-btn--sm" data-catalog-inset-toggle>${expandLabel}</button></span>
          <div class="mw-inset-row__drawer"><div><p class="mw-catalog__hint" style="padding-top:4px">${escapeHtml(say("workbench.catalog-board.ds.craft-inset-2-drawer"))}</p></div></div>
        </div>
      </div></div>`)}
    </div>`);
}

/** One row of the icon inventory: a plugin (or surface of the workbench), its name, and the glyph it draws. */
export interface CatalogPluginIcon {
  readonly id: string;
  readonly name: string;
  readonly icon: PluginIconName;
}

/** The icon inventory: which glyph each plugin and each state uses, and the four sizes. The plugin rows are given by the workbench, from the Manifests. */
function iconInventorySection(pluginIcons: readonly CatalogPluginIcon[], say: CatalogSay): string {
  const plugins = pluginIcons.map(({ name, icon: glyph }) => `<li>${icon(glyph)}<span><strong>${name}</strong><code>${glyph}</code></span></li>`).join("");
  const sizes = [
    [12, say("workbench.catalog-board.ds.icon-inv-size-12", { stroke: "2" })],
    [14, say("workbench.catalog-board.ds.icon-inv-size-14", { stroke: "2" })],
    [16, say("workbench.catalog-board.ds.icon-inv-size-16", { stroke: "2" })],
    [20, say("workbench.catalog-board.ds.icon-inv-size-20", { stroke: "1.6" })],
  ].map(([size, detail]) => `<li><span class="mw-icon-size" style="--s:${size}px">${icon("target")}</span><span><strong>${size}px</strong><small>${escapeHtml(String(detail))}</small></span></li>`).join("");
  return section("icon-inventory", escapeHtml(say("workbench.catalog-board.ds.icon-inv-title")), `
    <div class="mw-catalog__specimens">
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.icon-inv-spec-plugins")), `<ul class="mw-icon-inventory">${plugins}</ul>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.icon-inv-spec-sizes")), `<ul class="mw-icon-inventory mw-icon-inventory--sizes">${sizes}</ul>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.icon-inv-spec-empty")), `<div class="mw-craft-row"><div class="mw-empty"><span class="mw-empty__mark">${icon("clipboard")}</span><strong>${escapeHtml(say("workbench.catalog-board.ds.icon-inv-empty-title"))}</strong><p>${escapeHtml(say("workbench.catalog-board.ds.icon-inv-empty-body"))}</p></div></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.icon-inv-spec-loading")), `<div class="mw-craft-row"><p class="mw-loading" role="status">${escapeHtml(say("workbench.catalog-board.ds.icon-inv-loading-text"))}</p></div><p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-board.ds.icon-inv-loading-hint"))}</p>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.icon-inv-spec-error")), `<div class="mw-craft-row"><div class="mw-empty mw-empty--error" role="alert"><span class="mw-empty__mark">${icon("circle-alert")}</span><strong>${escapeHtml(say("workbench.catalog-board.ds.icon-inv-error-title"))}</strong><p>${escapeHtml(say("workbench.catalog-board.ds.icon-inv-error-body"))}</p>${renderButton({ label: say("common.control.retry"), variant: "secondary" })}</div></div>`)}
    </div>`);
}

/** Every motion in the product, one specimen each, all on the four durations and two curves. */
function motionSection(say: CatalogSay): string {
  const demo = (id: string, label: string) => renderButton({ label, variant: "secondary", size: "sm", attrs: { "data-motion-demo": id } });
  const closeLabel = say("common.control.close");
  return section("motion", escapeHtml(say("workbench.catalog-board.ds.motion-title")), `
    <div class="mw-catalog__specimens mw-motion-grid">${motionGrammarSpecimens(say)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-press")), `<div class="mw-craft-row">${renderButton({ label: say("workbench.catalog-board.ds.motion-press-label"), variant: "primary" })}</div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-hover")), `<div class="mw-motion-rows"><button type="button" class="mw-motion-row">${escapeHtml(say("workbench.catalog-board.ds.motion-hover-1"))}</button><button type="button" class="mw-motion-row">${escapeHtml(say("workbench.catalog-board.ds.motion-hover-2"))}</button></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-menu")), `<details class="mw-motion-menu"><summary class="mw-btn mw-btn--secondary mw-btn--sm">${escapeHtml(say("workbench.catalog-board.ds.motion-menu-open"))}</summary><div class="mw-menu"><button type="button" class="mw-menu__item">${escapeHtml(say("workbench.catalog-board.ds.motion-menu-rename"))}</button><button type="button" class="mw-menu__item">${escapeHtml(say("workbench.catalog-board.ds.motion-menu-move"))}</button></div></details>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-dialog")), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("dialog", say("workbench.catalog-board.ds.motion-dialog-open"))}</div><dialog class="mw-dialog" data-motion-dialog><p>${escapeHtml(say("workbench.catalog-board.ds.motion-dialog-body"))}</p><div class="mw-craft-row">${renderButton({ label: closeLabel, variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-sheet")), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("sheet", say("workbench.catalog-board.ds.motion-sheet-open"))}</div><dialog class="mw-dialog mw-sheet" data-motion-sheet><p>${escapeHtml(say("workbench.catalog-board.ds.motion-sheet-body"))}</p><div class="mw-craft-row">${renderButton({ label: closeLabel, variant: "primary", attrs: { "data-motion-close": "" } })}</div></dialog></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-tabs")), `<div class="mw-motion-tabs" role="tablist"><button type="button" class="tab-item" aria-selected="true" data-motion-tab>${escapeHtml(say("workbench.catalog-board.ds.motion-tab-overview"))}</button><button type="button" class="tab-item" data-motion-tab>${escapeHtml(say("workbench.catalog-board.ds.motion-tab-terminal"))}</button></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-seg")), `<div class="mw-toggle-group" data-slot="toggle-group" data-seg-thumb role="group"><button class="mw-toggle is-current" type="button" aria-pressed="true">${escapeHtml(say("workbench.catalog-board.ds.motion-seg-all"))}</button><button class="mw-toggle" type="button" aria-pressed="false">${escapeHtml(say("workbench.catalog-board.ds.motion-seg-unread"))}</button><button class="mw-toggle" type="button" aria-pressed="false">${escapeHtml(say("workbench.catalog-board.ds.motion-seg-saved"))}</button></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-list")), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("arrive", say("workbench.catalog-board.ds.craft-try-rise"))}</div><ol class="mw-motion-list" data-motion-list><li>${escapeHtml(say("workbench.catalog-board.ds.motion-list-1"))}</li><li>${escapeHtml(say("workbench.catalog-board.ds.motion-list-2"))}</li><li>${escapeHtml(say("workbench.catalog-board.ds.motion-list-3"))}</li><li>${escapeHtml(say("workbench.catalog-board.ds.motion-list-4"))}</li><li>${escapeHtml(say("workbench.catalog-board.ds.motion-list-5"))}</li></ol></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-expand")), `<details class="mw-motion-row-detail mw-disclosure"><summary>${escapeHtml(say("workbench.catalog-board.ds.motion-expand-summary"))}</summary><p>${escapeHtml(say("workbench.catalog-board.ds.motion-expand-body"))}</p></details>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-switch")), `<div class="mw-motion-stack"><div class="mw-craft-row">${demo("switch", say("workbench.catalog-board.ds.motion-switch-action"))}</div><div class="mw-motion-pages"><section data-motion-page>${escapeHtml(say("workbench.catalog-board.ds.motion-page-goals"))}</section><section data-motion-page hidden>${escapeHtml(say("workbench.catalog-board.ds.motion-page-feed"))}</section></div></div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-toast")), `<div class="mw-craft-row">${demo("toast", say("workbench.catalog-board.ds.motion-toast-action"))}</div>`)}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.motion-spec-moment")), `<p class="mw-catalog__hint">${escapeHtml(say("workbench.catalog-board.ds.motion-moment-hint"))}</p>`)}
    </div>`);
}

/** The parts the opening, the Welcome questions, the project chooser and the new-project journey share. */
function arrivalSection(say: CatalogSay): string {
  const monogram = renderProjectMonogram("FlyLeaf-V0.1", "flyleaf", (value) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char));
  const focusGoalTitle = say("workbench.catalog-board.ds.arrival-goal-5");
  const goals = [
    [say("workbench.catalog-board.ds.arrival-goal-1"), "done"],
    [say("workbench.catalog-board.ds.arrival-goal-2"), "done"],
    [say("workbench.catalog-board.ds.arrival-goal-3"), "done"],
    [say("workbench.catalog-board.ds.arrival-goal-4"), "done"],
    [focusGoalTitle, "doing"],
    [say("workbench.catalog-board.ds.arrival-goal-6"), "todo"],
  ] as const;
  const track = renderProgressTrack({ items: goals.map(([title, state]) => ({ title, state })), label: say("workbench.catalog-board.ds.arrival-track-label") });
  const next = renderBriefSection({
    title: say("workbench.catalog-board.ds.arrival-next-title"),
    body: `<div class="mw-brief__list">${renderDirectoryRow({ title: say("workbench.catalog-board.ds.arrival-next-1-title"), caption: say("workbench.catalog-board.ds.arrival-next-1-caption"), density: "meta", status: say("workbench.assistant-delivery.progress"), statusTone: "progress", statusIcon: "status-progress" })}${renderDirectoryRow({ title: say("workbench.catalog-board.ds.arrival-next-2-title"), caption: say("workbench.catalog-board.ds.arrival-next-2-caption"), density: "meta", status: say("workbench.catalog-board.ds.arrival-status-confirm"), statusTone: "attention", statusIcon: "status-needs-you" })}</div>`,
  });
  const recent = renderBriefSection({
    title: say("workbench.catalog-board.ds.arrival-recent-title"),
    body: renderBriefRecent([
      { when: say("workbench.catalog-board.ds.arrival-recent-1-when"), text: say("workbench.catalog-board.ds.arrival-recent-1-text") },
      { when: say("workbench.catalog-board.ds.arrival-recent-2-when"), text: say("workbench.catalog-board.ds.arrival-recent-2-text") },
    ]),
  });
  const brief = renderBrief({
    kicker: `${renderBriefStatus({ label: say("workbench.assistant-delivery.progress"), tone: "progress", glyph: "status-progress" })}<span>${escapeHtml(say("workbench.catalog-board.ds.arrival-opened-2h"))}</span>`,
    title: "FlyLeaf-V0.1",
    description: say("workbench.catalog-board.ds.arrival-brief-desc"),
    focus: renderBriefFocus({ label: say("workbench.catalog-board.ds.arrival-focus-label"), count: `<b>4</b> ${escapeHtml(say("workbench.catalog-board.ds.arrival-focus-count", { total: 6 }))}`, title: focusGoalTitle, body: say("workbench.catalog-board.ds.arrival-focus-body"), track }),
    sections: [next, recent],
  });
  const unreadState = `<span class="mw-file-row__state">${escapeHtml(say("workbench.catalog-board.ds.arrival-file-unread"))}</span>`;
  const files = renderFileGroup({
    glyph: "folder", title: say("workbench.catalog-board.ds.arrival-folder-title"), caption: say("workbench.catalog-board.ds.arrival-folder-caption"), count: "2/3",
    check: { checked: false, mixed: true }, status: renderStatusMark({ label: say("workbench.catalog-board.ds.arrival-status-authorized"), tone: "done", icon: "status-done", plain: true }),
    rows: [
      renderFileRow({ name: say("workbench.catalog-board.ds.arrival-file-scope"), size: "12 KB", state: unreadState, check: { checked: true } }),
      renderFileRow({ name: say("workbench.catalog-board.ds.arrival-file-interview"), size: "412 KB", state: unreadState, check: { checked: true } }),
      renderFileRow({ name: say("workbench.catalog-board.ds.arrival-file-competitor"), size: "9 KB", state: unreadState, check: { checked: false } }),
    ],
    note: say("workbench.catalog-board.ds.arrival-folder-note"),
  });
  const singleTitle = say("workbench.catalog-board.ds.arrival-single-title");
  const brandFile = say("workbench.catalog-board.ds.arrival-file-brand");
  const heroFile = say("workbench.catalog-board.ds.arrival-file-hero");
  const added = renderFileGroup({
    glyph: "file", title: singleTitle, caption: say("workbench.catalog-board.ds.arrival-single-caption"),
    remove: { label: say("workbench.catalog-board.ds.arrival-remove-item", { name: singleTitle }) },
    rows: [
      renderFileRow({ name: brandFile, size: "524 KB", remove: { label: say("workbench.catalog-board.ds.arrival-remove-item", { name: brandFile }) } }),
      renderFileRow({ name: heroFile, size: "4 KB", remove: { label: say("workbench.catalog-board.ds.arrival-remove-item", { name: heroFile }) } }),
    ],
  });
  return section("arrival", escapeHtml(say("workbench.catalog-board.ds.arrival-title")), `
    <div class="mw-catalog__specimens">
      ${mark("wordmark", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-wordmark")), `<div class="mw-arrival-demo">${renderWordmark({ attrs: { "data-arrival-wordmark": true } })}${renderButton({ label: say("workbench.catalog-board.ds.arrival-replay"), variant: "secondary", size: "sm", attrs: { "data-arrival-demo": "wordmark" } })}</div>`))}
      ${mark("caption", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-caption")), renderCaption({ label: say("workbench.catalog-board.ds.arrival-caption-pause"), playLabel: say("workbench.catalog-board.ds.arrival-caption-play"), title: say("workbench.catalog-board.ds.arrival-caption-title") })))}
      ${mark("steps", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-steps")), `<div class="mw-arrival-bar-strip">${renderSteps({ total: 6, current: 2, label: say("workbench.catalog-board.ds.arrival-steps-label") })}</div>`))}
      ${specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-enter-btn")), `${renderButton({ label: say("workbench.catalog-board.ds.arrival-continue"), variant: "primary", size: "lg", key: "↵" })}${renderButton({ label: say("workbench.catalog-board.ds.arrival-back-project"), variant: "ghost", size: "lg", icon: "back" })}`)}
      ${mark("bar-context", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-bar-context")), `<div class="mw-arrival-bar-strip">${renderBarContext({ mark: monogram, title: "FlyLeaf-V0.1", caption: say("workbench.catalog-board.ds.arrival-preview-enter") })}</div>`))}
      ${mark("bar-status", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-bar-status")), `<div class="mw-arrival-bar-strip">${renderBarStatus({ spin: true, title: say("workbench.catalog-board.ds.arrival-organizing-title"), caption: say("workbench.catalog-board.ds.arrival-organizing-caption") })}${renderBarStatus({ glyph: "shield", title: say("workbench.catalog-board.ds.arrival-selected-title"), caption: say("workbench.catalog-board.ds.arrival-selected-caption") })}</div>`))}
      ${mark("progress-track", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-goal-track")), `<div class="mw-arrival-wide">${track}</div>`))}
      ${mark("file-list", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-file-list")), `<div class="mw-arrival-wide">${files}${added}</div>`))}
      ${mark("brief", specimen(escapeHtml(say("workbench.catalog-board.ds.arrival-spec-brief")), `<div class="mw-arrival-brief">${brief}</div>`))}
    </div>`);
}

function iconSection(say: CatalogSay): string {
  const groups = ICON_LIBRARY.map((group) => {
    const items = group.icons.map((name) => `<li>${icon(name)}<span>${name}</span></li>`).join("");
    const label = Object.hasOwn(ICON_GROUP_KEY, group.id)
      ? say(ICON_GROUP_KEY[group.id as keyof typeof ICON_GROUP_KEY])
      : group.label;
    return `<div class="mw-icon-lib__group"><h3>${escapeHtml(label)}</h3><ul>${items}</ul></div>`;
  }).join("");
  return section("icons", escapeHtml(say("workbench.catalog-board.ds.icons-title")), `<div class="mw-icon-lib">${groups}</div>`);
}

/**
 * `plugins` fills the icon inventory's plugin rows; the design system keeps no list of plugins (PG-075), so omitted means none.
 * `say` is the page's translator: the sections written through it follow the board's language.
 * `delivery` is the running send's name by its stable key, where the page has the platform's words.
 * `presentationLocale` is supplied by the board's Host entry, which has the workbench's owned text environment installed.
 */
function platformFeedbackSection(say: CatalogSay): string {
  return section("platform-feedback", escapeHtml(say("workbench.catalog-board.ds.pfb-title")), `<div class="mw-catalog__specimens">
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.pfb-spec-busy")), `<div class="mw-catalog__row">
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-busy-fast"), variant: "secondary", attrs: { "data-fb-busy": "fast" } })}
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-busy-slow"), variant: "primary", attrs: { "data-fb-busy": "slow" } })}
      <span class="mw-catalog__hint" style="width:auto" data-fb-busy-status>${escapeHtml(say("workbench.catalog-board.ds.pfb-busy-hint"))}</span>
    </div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.pfb-spec-toast")), `<div class="mw-catalog__row">
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-toast-short"), variant: "secondary", size: "sm", attrs: { "data-fb-toast": "short" } })}
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-toast-warning"), variant: "secondary", size: "sm", attrs: { "data-fb-toast": "warning" } })}
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-toast-error"), variant: "danger-outline", size: "sm", attrs: { "data-fb-toast": "error" } })}
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-toast-undo"), variant: "secondary", size: "sm", attrs: { "data-fb-toast": "undo" } })}
    </div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.pfb-spec-autosave")), `<div class="mw-catalog__row" data-fb-autosave-box>
      <input class="mw-input" style="max-width:260px" data-fb-autosave-input value="${escapeHtml(say("workbench.catalog-board.ds.pfb-autosave-value"))}" aria-label="${escapeHtml(say("workbench.catalog-board.ds.pfb-autosave-aria"))}">
      <label class="mw-check-row"><input type="checkbox" class="mw-check" data-fb-autosave-fail><span>${escapeHtml(say("workbench.catalog-board.ds.pfb-autosave-fail"))}</span></label>
      <span class="mw-badge mw-badge--neutral" data-fb-autosave-status>${escapeHtml(say("workbench.catalog-board.ds.pfb-autosave-synced"))}</span>
      ${renderButton({ label: say("common.control.retry"), variant: "ghost", size: "sm", attrs: { "data-fb-autosave-retry": "", hidden: true } })}
    </div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.pfb-spec-optimistic")), `<div class="mw-catalog__row" style="gap:20px 24px">
      <label class="mw-check-row" style="min-height:44px;align-items:center"><span class="mw-switch"><input type="checkbox" data-fb-opt-ok><span class="mw-switch__track"></span></span><span>${escapeHtml(say("workbench.catalog-board.ds.pfb-opt-ok"))}</span></label>
      <label class="mw-check-row" style="min-height:44px;align-items:center"><span class="mw-switch"><input type="checkbox" data-fb-opt-fail><span class="mw-switch__track"></span></span><span>${escapeHtml(say("workbench.catalog-board.ds.pfb-opt-fail"))}</span></label>
    </div>`)}
    ${specimen(escapeHtml(say("workbench.catalog-board.ds.pfb-spec-ring-danger")), `<div class="mw-catalog__row">
      <span class="mw-catalog__row" style="gap:6px"><svg class="mw-state-ring" data-mw-state="running" data-fb-ring-demo aria-hidden="true"></svg><span data-fb-ring-label>running</span></span>
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-ring-next"), variant: "secondary", size: "sm", attrs: { "data-fb-ring-next": "" } })}
      ${renderButton({ label: say("workbench.catalog-board.ds.pfb-confirm-danger"), variant: "danger", size: "sm", attrs: { "data-fb-confirm-danger": "" } })}
      <input type="date" data-mw-date value="2026-11-21" style="width:156px" aria-label="${escapeHtml(say("workbench.catalog-board.ds.pfb-date-aria"))}">
      <input type="time" data-mw-time value="09:30" style="width:124px" aria-label="${escapeHtml(say("workbench.catalog-board.ds.pfb-time-aria"))}">
    </div>
    <dialog class="mw-dialog mw-dialog--alert" data-fb-danger-dialog data-tone="danger">
      <form class="mw-form mw-dialog__shell" method="dialog">
        <header class="mw-form__header"><h2>${escapeHtml(say("workbench.catalog-board.ds.pfb-danger-title"))}</h2></header>
        <div class="mw-form__body"><p>${escapeHtml(say("workbench.catalog-board.ds.pfb-danger-body"))}</p></div>
        <footer class="mw-form__footer">
          ${renderButton({ label: say("common.control.cancel"), variant: "ghost", attrs: { "data-dialog-close": "" } })}
          ${renderButton({ label: say("workbench.catalog-board.ds.pfb-danger-confirm"), variant: "danger", attrs: { "data-dialog-close": "" } })}
        </footer>
      </form>
    </dialog>`)}
  </div>`);
}

const CATALOG_EXTRA_STYLES = `
  .mw-catalog__chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .mw-catalog__chip {
    min-height: 22px; padding: 0 7px; border: 1px solid var(--line); border-radius: 6px;
    background: transparent; color: var(--muted); font: inherit; font-size: 11px; cursor: pointer;
    transition: background-color var(--dur-hover, 130ms) var(--ease-quint), color var(--dur-hover, 130ms) var(--ease-quint), border-color var(--dur-hover, 130ms) var(--ease-quint);
  }
  .mw-catalog__chip:hover { color: var(--ink); background: var(--nav-hover); }
  .mw-catalog__chip.is-active { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-strong, var(--accent)); font-weight: 500; }
`;

export function renderPrimitiveCatalog(options: {
  readonly plugins?: readonly CatalogPluginIcon[];
  readonly say?: CatalogSay;
  readonly delivery?: string;
  readonly presentationLocale?: string;
  readonly presentationPlugins?: readonly CatalogPresentationPlugin[];
  readonly extraChapters?: readonly CatalogExtraChapter[];
} = {}): string {
  const say = resolveCatalogSay(options.say);
  const extraChapters = options.extraChapters ?? [];
  // Chapters, in the order a designer reads the board: the language first, then what it is made of, then what is built from it.
  const sections = `
    ${chapter(say("workbench.catalog-board.ds.chapter-design-language"))}
    ${languageSection(say)}
    ${paletteSection(say)}
    ${pairingSection(say)}
    ${typefaceSection(say)}
    ${lookSections(say)}
    ${craftSection(say)}
    ${zonesSection(say)}
    ${motionSection(say)}
    ${chapter(say("workbench.catalog-board.ds.chapter-icons-and-status"))}
    ${iconSection(say)}
    ${micSection(say)}
    ${iconInventorySection(options.plugins ?? [], say)}${renderStateRingCatalog(say)}
    ${badgeSection(say)}
    ${severityGridSection(say)}
    ${statSection(say)}
    ${chapter(say("workbench.catalog-board.ds.chapter-controls"))}
    ${buttonSection(say)}
    ${buttonGroupSection(say)}
    ${choiceSection(say)}
    ${fieldSection(say)}
    ${groupsSection(say)}
    ${advancedFieldSection(say)}
    ${tagInputSection(say)}
    ${formSection(say)}
    ${dropZoneSection(say)}
    ${composerSection(say, options.delivery)}
    ${commandsSection(say, options.delivery)}
    ${calendarSection(say)}
    ${tabsSection(say)}
    ${separatorSection()}
    ${chapter(say("workbench.catalog-board.ds.chapter-feedback-and-overlays"))}
    ${feedbackSection(say)}
    ${platformFeedbackSection(say)}
    ${keepEditsSections(say)}
    ${sourceLadderSection(say)}
    ${noteSection(say)}
    ${overlaySection(say)}
    ${menuSection(say)}
    ${menuDescSection(say, options.delivery)}
    ${chapter(say("workbench.catalog-board.ds.chapter-lists-and-items"))}
    ${directorySection(say)}
    ${rowsSection(say)}
    ${itemChoiceSection(say)}
    ${itemDetailsSection(say)}
    ${listDetailSection(say)}
    ${statusLinkSection(say)}
    ${skillLineSection(say)}
    ${skillWhySection(say)}
    ${nowBlockSection(say)}
    ${itemGroupSection(say)}
    ${cellGridSection(say)}
    ${detailTrailSection(say)}
    ${iconCountsSection(say)}
    ${stateRowsSection(say)}
    ${usageSection(say)}
    ${stickyDetailSection(say)}
    ${textCountSection(say)}
    ${leaveBarSection(say)}
    ${adoptBarSection(say)}
    ${replayGridSection(say)}
    ${askRowSection(say)}
    ${placeholderListSection(say)}
    ${kindMarkSection(say)}
    ${categoryBarSection(say)}
    ${dataTableSection(say)}
    ${layoutSection(say)}
    ${chapter(say("workbench.catalog-board.ds.chapter-patterns-and-scenes"))}
    ${arrivalSection(say)}
    ${recoverySections(say)}
    ${codingBasicsSection(say)}
    ${homePageAdoptionSections(say)}
    ${composeSection(say)}
    ${renderCatalogExamples(section, say)}
    ${options.presentationLocale ? presentationSection(options.presentationLocale, options.presentationPlugins) : ""}`;
  const extraSections = extraChapters.map((item) => item.sectionsHtml).join("\n");
  return `<div class="mw-catalog">
    ${catalogIndex(sections, say, extraChapters)}
    <style>${CATALOG_EXTRA_STYLES}${COMPOSER_STYLES}${CATALOG_PATTERN_STYLES}${COMPOSER_BOARD_STYLES}${KEEP_EDITS_BOARD_STYLES}${APPEARANCE_BOARD_STYLES}${SKILL_PACK_BOARD_STYLES}${SKILL_SELECTION_BOARD_STYLES}${CAPABILITY_PACK_BOARD_STYLES}${WORK_RECORDS_BOARD_STYLES}${LANGUAGE_BOARD_STYLES}${RECOVERY_BOARD_STYLES}${CODING_BASICS_BOARD_STYLES}${HOME_PAGE_ADOPTION_BOARD_STYLES}${options.presentationLocale ? PRESENTATION_FORM_STYLES + PRESENTATION_BOARD_STYLES : ""}</style>
    ${sections}
    ${extraSections}
  </div>
  <script>${CATALOG_CLIENT_SCRIPT}</script>`;
}
