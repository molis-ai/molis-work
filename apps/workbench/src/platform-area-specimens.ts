import { readFileSync } from "node:fs";
import { escapeHtml } from "@molis-ai/molis-work-plugin-sdk/ui";
import { TASK_GRANTS_AREA_EN } from "./i18n/task-grants-area-en.js";
import { EN } from "./i18n/en.js";
import { PLATFORM_AREA_STYLES } from "./styles/platform-area.js";

/**
 * The component board's 平台区域 section: the area the shell draws on a plugin page, outside the page's frame
 * (specs/proactive-assistant/task-grants-platform-area.md §3), with the reads area as its first content. Its frame and header,
 * the two height steps (wide from 480px, narrow below), the not-ready fade (§3.3), a write under way, the empty state and every
 * line the change line says. The section's program (`src/browser/board/platform-area-section.ts`) draws them with the shell's
 * own markup, so they cannot drift from what a page shows.
 */
type Say = (text: string, values?: Record<string, string | number>) => string;

const figure = (caption: string, name: string, note?: string) =>
  `<figure class="mw-catalog__specimen"><figcaption>${escapeHtml(caption)}${note ? `<small>${escapeHtml(note)}</small>` : ""}</figcaption><div class="mw-pa-board__stage" data-platform-area-specimen="${name}"></div></figure>`;

/** The section the board places after 服务连接. The area's words go to the program as it would get them from the shell. */
export function renderPlatformAreaSection(L: Say, lang: "zh" | "en"): string {
  const words = lang === "en" ? { ...TASK_GRANTS_AREA_EN, 移除: EN["移除"], 撤销: EN["撤销"], 重试: EN["重试"] } : {};
  return `<section class="mw-catalog__section" id="platform-area" data-primitive="platform-area"><h2>${escapeHtml(L("平台区域"))}</h2>
    <script type="application/json" id="platform-area-words">${JSON.stringify(words).replace(/</g, "\\u003c")}</script>
    <div class="mw-catalog__specimens">
      ${figure(L("外框与标头 · 宽档（480px 起）"), "wide", L("每种状态各一行：开着、关着、有新的读取能力、暂时读不到、已不再提供"))}
      ${figure(L("窄档（280–479px）· 标头说明与变化行可占两行"), "narrow")}
      ${figure(L("未就绪 · 刚出现或刚移动的 500 毫秒里，控件变淡、按下不生效"), "unready")}
      ${figure(L("正在保存"), "busy")}
      ${figure(L("没有能读的数据"), "empty")}
      ${figure(L("变化行 · 宽档"), "lines-wide")}
      ${figure(L("变化行 · 窄档"), "lines-narrow")}
    </div>
  </section>`;
}

/** The board's layout for the section; the area's own styles are the shell's. */
export const PLATFORM_AREA_SECTION_STYLES = PLATFORM_AREA_STYLES
  + `#platform-area .mw-catalog__specimen{margin:0}#platform-area figcaption small{display:block;margin-top:2px;color:var(--muted);font-size:12px}`
  + `.mw-pa-board__stage{display:grid;justify-items:start;gap:10px;max-width:100%;overflow-x:auto;padding:16px;border-radius:var(--r-card);background:var(--paper);box-shadow:inset 0 0 0 1px var(--line)}`
  + `.mw-pa-board__stage>.mw-platform-area{flex:none}.mw-pa-board__line{display:block;padding:0;background:none;box-shadow:none;animation:none}`;

/** The section's program, written in `src/browser/board/platform-area-section.ts` and bundled into `dist/` when the package builds. */
export const PLATFORM_AREA_SECTION_SCRIPT = readFileSync(new URL("./board-platform-area-section.js", import.meta.url), "utf8").trim();
