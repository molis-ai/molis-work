import { readFileSync } from "node:fs";
import { UI_FORMAT_VERSIONS, type UiLocalePack, type UiSkinFile, type UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_SKIN, BASELINE_SPEC, renderToggleGroup } from "@molis-ai/molis-work-design-system";
import { createTextReader, escapeHtml, format, parseSkinFile, renderButton, resolveUiEnvironment, t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pluginTextForOwner } from "./plugin-text.js";

// The component board's 语言与文字 section (specs/font-and-skin-system/a-section-contract.md §8.2): the platform's text tools used the way §1.1 writes
// them, by the Host (its `t` and `format` read the workbench's language files, `apps/workbench/resources/locales/`) and by the page (the same tools,
// bundled), and a language switch that changes the words in place (`browser/locale-switch.ts`). A development tool: nothing here is a product control.

/** The platform's own words (the `locale` row of `packages/design-system/resources/registry.json`). */
const WORKBENCH_OWNER = "workbench";
/** A second owner on the same page: its words are its own, looked up by its own name, and a key of one never answers for the other. */
const SAMPLE_OWNER = "io.molis.work.example.board-notes";
const SAMPLE_PACKS: readonly UiLocalePack[] = [
  { format_version: UI_FORMAT_VERSIONS.locale, owner: SAMPLE_OWNER, locale: "en", messages: { "board-notes.env.owner": "Words of a sample plugin" } },
  { format_version: UI_FORMAT_VERSIONS.locale, owner: SAMPLE_OWNER, locale: "zh", messages: { "board-notes.env.owner": "样例插件自己的词" } },
];

/** A name with ' and &: `renderButton` escapes its label, so the label is `t.text`. */
const SAMPLE_TITLE = "Tom's R&D notes";
const SAMPLE_AT = "2026-11-07T09:30:00.000Z";

/** What the page computes again (`resolveUiEnvironment` reads only which definitions are in force), so the two can be compared. */
const SPEC_IDENTITY: UiSpecFile = { format_version: BASELINE_SPEC.format_version, id: BASELINE_SPEC.id, revision: BASELINE_SPEC.revision,
  baseline_skin: BASELINE_SPEC.baseline_skin, baseline_font: BASELINE_SPEC.baseline_font, groups: [], font_roles: [], components: [] };
const SKIN_IDENTITY: UiSkinFile = { format_version: UI_FORMAT_VERSIONS.skin, id: BASELINE_SKIN.ref.id, revision: BASELINE_SKIN.ref.revision, spec: BASELINE_SKIN.spec,
  name: BASELINE_SKIN.name, recommended_font: BASELINE_SKIN.recommended_font, light: {}, dark: {}, shared: {}, terminal: {} };
const LOCALES = ["zh", "en"] as const;
type Locale = (typeof LOCALES)[number];

/** A skin a person wrote, wrong four ways: what `parseSkinFile` says of each is what an author sees. */
function skinChecks(): string {
  const base = { format_version: UI_FORMAT_VERSIONS.skin, id: "board-sample", revision: 1, spec: SKIN_IDENTITY.spec, name: { literal: "Sample" }, recommended_font: SKIN_IDENTITY.recommended_font, light: {}, dark: {}, shared: {}, terminal: {} };
  const files: ReadonlyArray<readonly [string, string]> = [
    ["repeated-name.json", JSON.stringify(base).replace('{"format_version":1,', '{"format_version":1,"id":"other",')],
    ["css-text.json", JSON.stringify({ ...base, light: { accent: "red; background: blue" } })],
    ["outside-url.json", JSON.stringify({ ...base, light: { "shadow-soft": "url(https://example.com/x.png)" } })],
    ["locked-role.json", JSON.stringify({ ...base, shared: { "focus-stroke": { px: 3 } } })],
  ];
  return files.map(([file, source]) => {
    const result = parseSkinFile(source, BASELINE_SPEC, { file });
    const problems = result.ok ? [] : result.problems;
    return `<li data-board-env-check="${file}"><code>${file}</code><ul>${problems.map(({ code, path, reason }) => `<li><code>${code}</code> <code>${escapeHtml(path)}</code> ${escapeHtml(reason)}</li>`).join("")}</ul></li>`;
  }).join("");
}

/**
 * The section's content in the language of the scope it is drawn in, as business code writes it: `t` and `format` only, no language and no owner.
 * The Host draws it once a language and puts both in the page (`renderEnvironmentSection`).
 */
export function renderEnvironmentSpecimen(locale: Locale): string {
  const sampleText = createTextReader({ packs: SAMPLE_PACKS, locale });
  const lines = Array.from({ length: 12 }, (_, index) => `<p>${t("workbench.env.line", { n: index + 1 })}</p>`).join("");
  return `<h2>${t("workbench.env.title")}</h2>
    <p class="mw-board-env__lead">${t("workbench.env.lead")}</p>
    <dl class="mw-board-env__facts">
      <dt>${t("workbench.env.skin")}</dt><dd>${t("workbench.skin.soft-workbench")}</dd>
      <dt>${t("workbench.env.font")}</dt><dd>${t("workbench.font.system-sans")}</dd>
      <dt>${t("workbench.env.owners")}</dt><dd>${t("workbench.env.owner")} · ${sampleText({ owner: SAMPLE_OWNER, key: "board-notes.env.owner" })}</dd>
      <dt>${t("workbench.env.when")}</dt><dd><time datetime="${SAMPLE_AT}">${format.date(SAMPLE_AT, "datetime")}</time></dd>
      <dt>${t("workbench.env.count")}</dt><dd>${t("workbench.env.saved", { count: 1 })} · ${t("workbench.env.saved", { count: 3 })} · ${format.number(12345, "compact")}</dd>
    </dl>
    <p class="mw-board-env__actions">${renderButton({ label: t.text("workbench.env.rename", { title: SAMPLE_TITLE }), variant: "secondary" })}<input type="button" class="mw-btn mw-btn--ghost mw-btn--sm" value="${t("workbench.env.clear")}"></p>
    <label class="mw-board-env__field"><span>${t("workbench.env.search")}</span><input class="mw-input" type="search" data-board-env-search placeholder="${t("workbench.env.search-hint")}" aria-label="${t("workbench.env.search")}"></label>
    <details class="mw-collapsible" data-board-env-more><summary>${t("workbench.env.more")}</summary><div class="mw-collapsible__body"><p>${t("workbench.env.more-body")}</p></div></details>
    <div class="mw-board-env__scroll" data-board-env-scroll tabindex="0" role="region" aria-label="${t("workbench.env.lines")}">${lines}</div>
    <p class="mw-board-env__same" data-board-env-same><span>${t("workbench.env.same")}</span> <q data-board-env-user>保存</q> <span data-board-env-word>${t("workbench.env.save")}</span></p>
    <p class="mw-board-env__same"><button type="button" class="mw-btn mw-btn--primary mw-btn--sm" data-board-env-save>${t("workbench.env.save")}</button><span class="mw-board-env__editable" contenteditable="true" data-board-env-editable role="textbox" aria-label="${t("workbench.env.editable")}">保存</span></p>
    <ul class="mw-board-env__rows" data-board-env-rows><li>${t("workbench.env.row", { n: 1 })}</li></ul>
    <p class="mw-board-env__actions">${renderButton({ label: t.text("workbench.env.add-row"), variant: "secondary", attrs: { "data-board-env-add-row": true } })}${renderButton({ label: t.text("workbench.env.add-user"), variant: "ghost", attrs: { "data-board-env-add-user": true } })}</p>
    <p class="mw-board-env__snapshot" data-board-env-snapshot>${t("workbench.env.snapshot-pending")}</p>
    <ul class="mw-board-env__checks" translate="no">${skinChecks()}</ul>`;
}

/** The section: the content on show, both languages' renders for the switch, and what the page's own text tools need. */
export function renderEnvironmentSection(renders: Readonly<Record<Locale, string>>, lang: Locale): string {
  const packs = [...LOCALES.flatMap(locale => pluginTextForOwner(WORKBENCH_OWNER)?.pack(locale) ?? []), ...SAMPLE_PACKS];
  const snapshots = Object.fromEntries(LOCALES.map((locale) => [locale, resolveUiEnvironment({ spec: SPEC_IDENTITY, skin: SKIN_IDENTITY, locale: { tag: locale, source: "explicit" } })]));
  const data = JSON.stringify({ locale: lang, packs, environment: { spec: SPEC_IDENTITY, skin: SKIN_IDENTITY, snapshots } }).replace(/</gu, "\\u003c");
  const languages = renderToggleGroup({ label: t.text("workbench.env.switch"), items: LOCALES.map((locale) => ({ value: locale, label: locale === "zh" ? "中文" : "English", current: locale === lang, attrs: { "data-board-env-lang": locale } })) });
  return `<section class="mw-catalog__section" id="environment" data-primitive="environment">
    <div class="mw-board-env__bar">${languages}<p class="mw-board-env__status" data-board-env-status role="status" hidden></p>${renderButton({ label: t.text("workbench.env.retry"), variant: "secondary", attrs: { "data-board-env-retry": true, hidden: true } })}</div>
    <div class="mw-board-env" id="board-env" data-board-env-live>${renders[lang]}</div>
    ${LOCALES.map((locale) => `<template data-board-env-render="${locale}">${renders[locale]}</template>`).join("")}
    <script type="application/json" data-board-env-data>${data}</script>
  </section>`;
}

export const ENVIRONMENT_SECTION_STYLES = ".mw-board-env{display:grid;gap:12px;max-width:720px}.mw-board-env__bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:12px}"
  + ".mw-board-env__facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0}.mw-board-env__facts dd{margin:0}"
  + ".mw-board-env__actions,.mw-board-env__same{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0}.mw-board-env__field{display:grid;gap:4px;max-width:360px}"
  + ".mw-board-env__scroll{max-height:120px;overflow:auto;border:1px solid var(--line);border-radius:var(--r-control,6px);padding:4px 12px}"
  + ".mw-board-env__editable{min-width:48px;padding:2px 6px;border:1px dashed var(--line-strong);border-radius:4px}"
  + ".mw-board-env__rows{margin:0;padding-left:20px}.mw-board-env__checks{margin:0;padding-left:20px;color:var(--muted);font-size:13px}.mw-board-env__status{margin:0;color:var(--muted)}";

export const ENVIRONMENT_SECTION_SCRIPT = readFileSync(new URL("./board-environment-section.js", import.meta.url), "utf8").trim();
