import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { PluginBoardSpecimenPorts, PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { BUILTIN_PLUGIN_CATALOG } from "./plugin-catalog.js";
import { boardFrameParam, type BoardFrameParam } from "./condition-specimens.js";

/**
 * The component board's 插件行视图 (specs/visual-ui-experience VUX-39): every plugin that declares board specimens
 * (`workbench.specimens`) has them drawn here by its own renderer, in the workbench's context, so the rows are the rows its page
 * draws; the board only lays them out — a directory column's rows in a column's width, a main-area view across the frame —
 * and says they are samples. No plugin is named here: the catalog says which plugins have specimens.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

export function renderBoardPluginRows(L: Say, sample: PluginBoardSpecimenPorts["sample"], catalog: readonly PluginRegistration[] = BUILTIN_PLUGIN_CATALOG): string {
  // The page's own primitives; a date as Coding's Host writes it on the first paint (its day), the one plugin that shows one here.
  const ports: PluginBoardSpecimenPorts = { escape: escapeHtml, text: L, icon: (name) => icon(name as Parameters<typeof icon>[0]), formatDate: (value) => value.slice(0, 10), sample };
  const figures = catalog.flatMap((entry) => (entry.workbench.specimens?.(ports) ?? []).map((one) => `<figure class="mw-cond-plugin" data-board-plugin="${escapeHtml(entry.project_plugin_id)}" data-board-specimen="${escapeHtml(one.id)}" data-place="${one.place}">
      <figcaption><strong>${escapeHtml(L(entry.manifest.name))}</strong><span>${escapeHtml(one.title)}</span><span class="mw-cond-tag">${escapeHtml(L("样例数据（模拟）"))}</span></figcaption>
      <div class="mw-cond-plugin__body">${one.html}</div>
    </figure>`));
  return `<section data-board-plugin-rows><h2>${escapeHtml(L("插件行视图"))}</h2><p class="mw-cond-note">${escapeHtml(L("插件自己的行渲染器画出的样例：数据是固定样例，行就是插件页面画的那一行。目录里的行按一栏的宽度排，主区的视图占满。"))}</p>
    <div class="mw-cond-plugins">${figures.join("")}</div></section>`;
}

/** The board page's own rule for the section's frame: as tall as its rows need, not the conditions frame's height. */
export const PLUGIN_ROWS_SECTION_STYLES = `.mw-cond-frame.mw-rows-frame{height:820px}`;

export const BOARD_PLUGIN_ROW_STYLES = `.mw-cond-plugins{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),1fr));gap:16px;align-items:start}`
  + `.mw-cond-plugin{margin:0;min-width:0;display:grid;gap:8px}.mw-cond-plugin[data-place=page]{grid-column:1/-1}`
  + `.mw-cond-plugin figcaption{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 8px;font-size:12px;color:var(--muted)}.mw-cond-plugin figcaption strong{color:var(--ink);font-weight:var(--weight-control)}`
  + `.mw-cond-tag{margin-inline-start:auto}`
  + `.mw-cond-plugin__body{min-width:0;overflow:hidden;padding:6px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}.mw-cond-plugin[data-place=page] .mw-cond-plugin__body{padding:12px}`;

const PARAMS: readonly BoardFrameParam[] = [
  ["lang", "界面语言", [["zh", "中文"], ["en", "English"]]],
  ["text", "样例文字", [["zh", "中文"], ["en", "English"], ["mixed", "混排"]]],
  ["width", "容器", [["760", "宽窗口"], ["420", "分屏一格"], ["360", "手机"]]],
];

/** The board's section: one strip (read by the board's strip program, which 条件与状态 carries) and the conditions frame's rows part. */
export function renderPluginRowsSection(say: Say, lang: "zh" | "en" = "zh"): string {
  return `<section class="mw-catalog__section" id="plugin-rows" data-primitive="plugin-rows"><h2>${escapeHtml(say("插件行视图"))}</h2>
    <p class="mw-catalog__hint">${escapeHtml(say("插件页面里的行，由插件自己的渲染器照生产参数画出：媒体材料、文件改动、编程会话。界面语言、样例文字与容器一次换一个；明暗与密度跟随页面的偏好。数据是固定样例（模拟），不代替生产验证。"))}</p>
    <div class="mw-cond-params" data-rows-params>${PARAMS.map((one) => boardFrameParam(say, one, one[0] === "lang" ? lang : undefined)).join("")}</div>
    <iframe class="mw-cond-frame mw-rows-frame" data-rows-frame src="/__ui/catalog/conditions?part=rows&amp;lang=${lang}&amp;text=zh" title="${escapeHtml(say("插件行视图样例"))}" style="width:760px" loading="lazy"></iframe>
  </section>`;
}
