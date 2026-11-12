import { WORKBENCH_LANGUAGES } from "./platform-languages.js";
import { DEFAULT_WEB_LOCALE, type WebLocale } from "./i18n.js";
import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginBoardSpecimenPorts, PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { BUILTIN_PLUGIN_CATALOG } from "./plugin-catalog.js";
import { drawCatalogText } from "./plugin-text.js";
import { pluginSurfaceClients } from "./plugin-workbench.js";
import { boardFrameParam, type BoardFrameParam } from "./condition-specimens.js";

/**
 * The component board's 插件行视图 (specs/visual-ui-experience VUX-39): every plugin that declares board specimens
 * (`workbench.specimens`) has them drawn here by its own renderer, in the workbench's context, so the rows are the rows its page
 * draws; the board only lays them out — a directory column's rows in a column's width, a main-area view across the frame —
 * and says they are samples. No plugin is named here: the catalog says which plugins have specimens.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

export function renderBoardPluginRows(readText: Say, sample: PluginBoardSpecimenPorts["sample"], catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): string {
  // The page's own primitives, scoped to the exact registered owner while it draws;
  // a date as Coding's Host writes it on the first paint (its day), the one plugin that shows one here.
  const portsOf = (_pluginId: string): PluginBoardSpecimenPorts => ({ escape: escapeHtml, text: readText, icon: (name) => icon(name as Parameters<typeof icon>[0]), formatDate: (value) => value.slice(0, 10), sample });
  const figures = catalog.flatMap((entry) => drawCatalogText(entry.manifest, () => entry.workbench.specimens?.(portsOf(entry.manifest.plugin_id)) ?? []).map((one) => `<figure class="mw-cond-plugin" data-board-plugin="${escapeHtml(entry.project_plugin_id)}" data-board-specimen="${escapeHtml(one.id)}" data-place="${one.place}">
      <figcaption><strong>${escapeHtml(entry.manifest.name)}</strong><span>${escapeHtml(one.title)}</span><span class="mw-cond-tag">${escapeHtml(uiText.text("workbench.board-plugin-rows.sample-data-simulated"))}</span></figcaption>
      <div class="mw-cond-plugin__body">${one.html}</div>
    </figure>`));
  return `<section data-board-plugin-rows><h2>${escapeHtml(uiText.text("workbench.board-plugin-rows.plugin-rows"))}</h2><p class="mw-cond-note">${escapeHtml(uiText.text("workbench.board-plugin-rows.drawn-each-plugin-s-own-row-renderer-data"))}</p>
    <div class="mw-cond-plugins">${figures.join("")}</div></section>`;
}

/** The sheets the specimens' plugins bring beside the workbench sheet (and those of the plugins their rows draw), so a specimen is styled as its page is. */
export function boardPluginStyleLinks(catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): string {
  const drawn = new Set(catalog.filter((entry) => entry.workbench.specimens).map((entry) => entry.project_plugin_id));
  const ids = new Set(pluginSurfaceClients().filter((client) => drawn.has(client.id)).flatMap((client) => client.styles));
  return [...ids].map((id) => `<link rel="stylesheet" href="/assets/molis-work-plugins/${encodeURIComponent(id)}.css">`).join("");
}

/** The board page's own rule for the section's frame: as tall as its rows need, not the conditions frame's height. */
export const PLUGIN_ROWS_SECTION_STYLES = `.mw-cond-frame.mw-rows-frame{height:820px}`;

export const BOARD_PLUGIN_ROW_STYLES = `.mw-cond-plugins{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px;align-items:start}`
  + `.mw-cond-plugin{margin:0;min-width:0;display:grid;gap:8px}.mw-cond-plugin[data-place=page]{grid-column:1/-1}`
  + `.mw-cond-plugin figcaption{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;font-size:12px;color:var(--muted)}.mw-cond-plugin figcaption strong{color:var(--ink);font-weight:var(--weight-control)}`
  + `.mw-cond-tag{margin-inline-start:auto}`
  + `.mw-cond-plugin__body{min-width:0;overflow:hidden;padding:6px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}.mw-cond-plugin[data-place=page] .mw-cond-plugin__body{padding:12px}`;

const PARAMS: readonly BoardFrameParam[] = [
  ["lang", "workbench.board-plugin-rows.language", WORKBENCH_LANGUAGES.languages.map(row => [row.tag, row.name] as const)],
  ["text", "workbench.board-plugin-rows.sample-words", [["zh", "中文"], ["en", "English"], ["mixed", "workbench.board-plugin-rows.mixed"]]],
  ["width", "workbench.board-plugin-rows.container", [["760", "workbench.board-plugin-rows.wide-window"], ["420", "workbench.board-plugin-rows.one-split-pane"], ["360", "workbench.board-plugin-rows.phone"]]],
];

/** The board's section: one strip (read by the board's strip program, which 条件与状态 carries) and the conditions frame's rows part. */
export function renderPluginRowsSection(say: Say, lang: WebLocale = DEFAULT_WEB_LOCALE): string {
  return `<section class="mw-catalog__section" id="plugin-rows" data-primitive="plugin-rows"><h2>${escapeHtml(say("workbench.board-plugin-rows.plugin-rows"))}</h2>
    <div class="mw-cond-params" data-rows-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}</div>
    <iframe class="mw-cond-frame mw-rows-frame" data-rows-frame src="/__ui/catalog/conditions?part=rows&amp;lang=${lang}&amp;text=zh" title="${escapeHtml(say("workbench.board-plugin-rows.plugin-rows-specimen"))}" style="width:760px" loading="lazy"></iframe>
  </section>`;
}
