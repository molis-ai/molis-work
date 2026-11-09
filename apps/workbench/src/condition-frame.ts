import { WEB_LOCALES, type WebLocale } from "./i18n.js";
import { renderLanguageHead } from "./language-resource.js";
import { readFileSync } from "node:fs";
import { t as uiText, escapeHtml, renderDirectoryRow, type MwStatusTone as DirectoryStatusTone } from "@molis-ai/molis-work-plugin-sdk/ui";
import { THEME_BOOTSTRAP_SCRIPT, VISUAL_FOUNDATION_CLIENT_SCRIPT, renderIconSprite } from "@molis-ai/molis-work-design-system";
import { assistantTextHtml } from "./scripts/client/assistant-island.js";
import { createAssistantCodeGrow } from "./scripts/client/assistant-code-grow.js";
import { conditionSample, conditionStream, type ConditionKind, type ConditionText } from "./condition-samples.js";
import { BOARD_PLUGIN_ROW_STYLES, boardPluginStyleLinks, renderBoardPluginRows } from "./board-plugin-rows.js";

/**
 * The component board's conditions frame (specs/visual-ui-experience VUX-39, §render-lifecycle 同源标本): the page
 * `/__ui/catalog/conditions` that the board's 条件与状态 section loads in an iframe, so a width is a real viewport and the
 * workbench's media queries answer it. Everything in it is a production part in the workbench's own context (stylesheet,
 * `body.immersive-workbench`, the page programs): the Assistant's reply drawn by the Host's renderer with Coding's tokenizer,
 * its code figure's copy and fold, `molisStreamText`, `molisFollow`, `molisCopy` and `molisShowMore` with the Assistant's
 * keep-failures rule. The query picks one value per parameter; theme and density follow the page's preferences.
 */
export interface ConditionFrameOptions {
  lang: WebLocale;
  text: ConditionText;
  kind: ConditionKind;
  /** `fallback` (simulated): the system faces are gone and only the bundled Inter Variable and Noto Sans SC are left. */
  font: "system" | "fallback";
  /** `fail` (simulated): the clipboard refuses, so every copy answers with its failure. */
  copy: "ok" | "fail";
  /** `rows`: the plugins' own rows (board-plugin-rows.ts) instead of the reply, for the board's 插件行视图 section. */
  part: "reply" | "rows";
}
export interface ConditionFramePorts { readText(text: string, values?: Record<string, string | number>): string; htmlLang(): string; }

const pick = <T extends string>(value: string | null, allowed: readonly T[]): T => (allowed as readonly string[]).includes(value ?? "") ? value as T : allowed[0]!;

/** Only known values are read; anything else is the first value, so the page never reflects what the query said. */
export function parseConditionFrame(query: URLSearchParams): ConditionFrameOptions {
  return {
    lang: pick(query.get("lang"), WEB_LOCALES), text: pick(query.get("text"), ["zh", "en", "mixed"] as const),
    kind: pick(query.get("kind"), ["code", "prose"] as const), font: pick(query.get("font"), ["system", "fallback"] as const),
    copy: pick(query.get("copy"), ["ok", "fail"] as const), part: pick(query.get("part"), ["reply", "rows"] as const),
  };
}

// Twelve tool calls of one round: one failed and one whose outcome is unknown stay in sight past the limit (the Assistant's rule).
const TOOLS: Array<[string, string, DirectoryStatusTone, string]> = [
  ["读文件", "auth/session.ts", "done", "完成"], ["查找", "readCookie(", "done", "完成"], ["读文件", "auth/cookie.ts", "done", "完成"],
  ["读文件", "tests/session.test.ts", "done", "完成"], ["改写文件", "auth/session.ts", "done", "完成"], ["跑命令", "pnpm --filter ./auth run build", "done", "完成"],
  ["跑命令", "pnpm test auth", "blocked", "失败"], ["改写文件", "auth/session.ts", "done", "完成"], ["跑命令", "pnpm test auth", "done", "完成"],
  ["跑命令", "git push origin feature/session-cookie", "attention", "结果未知"], ["读文件", "docs/auth.md", "done", "完成"], ["改写文件", "docs/auth.md", "done", "完成"],
];

function toolRows(_readText: ConditionFramePorts["readText"], count: number): string {
  return TOOLS.slice(0, count).map(([verb, target, tone, state]) => renderDirectoryRow({
    title: target, caption: uiText.text(verb) + (tone === "attention" ? " · " + uiText.text("workbench.condition-frame.disconnected") : ""), density: "meta", icon: verb === "跑命令" ? "terminal" : verb === "查找" ? "search" : "file",
    status: uiText.text(state), statusTone: tone, statusIcon: tone === "done" ? "status-done" : tone === "blocked" ? "status-blocked" : "status-needs-you",
    attrs: tone === "done" ? {} : { "data-cond-kept": "" },
  })).join("");
}

const FRAME_STYLES = `body.mw-cond-page{margin:0;background:var(--desk,var(--wash));color:var(--ink)}.mw-cond{display:grid;grid-template-columns:minmax(0,1fr);gap:20px;padding:16px}.mw-cond>*{min-width:0}`
  + `.mw-cond h2{margin:0 0 4px;font-size:13px}.mw-cond p.mw-cond-note{margin:0 0 8px;color:var(--muted);font-size:12px}`
  + `.mw-cond-env{display:flex;flex-wrap:wrap;gap:4px 12px;margin:0;color:var(--muted);font-size:12px}.mw-cond-env b{color:var(--ink);font-weight:var(--weight-control)}`
  + `.mw-cond .mw-cond-thread{flex:none;height:320px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}`
  + `.mw-cond-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}.mw-cond-list{display:flex;flex-direction:column;gap:2px;padding:6px;border-radius:var(--r-card);background:var(--paper);box-shadow:var(--lift-1)}`;

function frameBody(options: ConditionFrameOptions, readText: ConditionFramePorts["readText"], sample: { question: string; reply: string }): string {
  return `<main class="mw-cond" data-cond-frame-page data-text="${options.text}" data-kind="${options.kind}" data-font="${options.font}" data-copy="${options.copy}">
    <p class="mw-cond-env" data-cond-env><span>${escapeHtml(uiText.text("workbench.condition-frame.zoom"))} <b data-cond-env-zoom></b></span><span>${escapeHtml(uiText.text("workbench.condition-frame.pointer"))} <b data-cond-env-pointer></b></span><span>${escapeHtml(uiText.text("workbench.condition-frame.motion"))} <b data-cond-env-motion></b></span><span>${escapeHtml(uiText.text("workbench.condition-frame.set-browser-not-simulated-board"))}</span></p>
    <section><h2>${escapeHtml(uiText.text("workbench.condition-frame.reply-streaming-interleaved-scrolling"))}</h2><p class="mw-cond-note">${escapeHtml(uiText.text("workbench.condition-frame.scrolling-up-keeps-place-new-text-waits-behind"))}</p>
      <div class="assistant-thread mw-cond-thread" data-cond-thread role="log" aria-live="polite"><div class="assistant-round"><div class="assistant-msg assistant-msg--user">${escapeHtml(sample.question)}</div><div class="assistant-msg assistant-msg--assistant" data-cond-reply></div><button type="button" class="assistant-copy" data-cond-copy-reply>${escapeHtml(uiText.text("common.control.copy"))}</button></div></div>
      <div class="mw-cond-row"><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-replay>${escapeHtml(uiText.text("workbench.condition-frame.replay"))}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-stop disabled>${escapeHtml(uiText.text("workbench.condition-frame.stop"))}</button><button type="button" class="mw-btn mw-btn--secondary mw-btn--sm" data-cond-latest hidden>${escapeHtml(uiText.text("workbench.condition-frame.back-latest"))}</button><span role="status" data-cond-state></span></div>
    </section>
    <section><h2>${escapeHtml(uiText.text("workbench.condition-frame.several-tools-failures-unknown-outcomes-stay-sight"))}</h2><div class="mw-cond-list" data-cond-tools>${toolRows(readText, TOOLS.length)}</div></section>
    <section><h2>${escapeHtml(uiText.text("workbench.condition-frame.edge-case-one-over-limit-not-tucked-away"))}</h2><div class="mw-cond-list" data-cond-tools-edge>${toolRows(readText, 6)}</div></section>
  </main>`;
}

/** The fallback faces are the product's own last entries (design-system typeface.ts), so nothing here names another font. */
const FALLBACK_FONT = `--font:"Inter Variable","Noto Sans SC",sans-serif;--font-mono:monospace`;

export function renderMolisWorkConditionsSpecimen(options: ConditionFrameOptions, ports: ConditionFramePorts): string {
  const { readText } = ports, sample = conditionSample(options.kind, options.text), rows = options.part === "rows";
  const steps = rows ? [] : conditionStream(sample.reply).map((text) => assistantTextHtml(text, [], readText));
  const data = JSON.stringify({ steps, reply: sample.reply, copy: options.copy, pace: 220 }).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="${ports.htmlLang()}"${options.font === "fallback" ? ` style='${FALLBACK_FONT}'` : ""}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(uiText.text("workbench.condition-frame.conditions-states-specimen"))} · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-workbench.css">${rows ? boardPluginStyleLinks() : ""}
  <style>${FRAME_STYLES}${rows ? BOARD_PLUGIN_ROW_STYLES : ""}</style>
</head>
<body class="immersive-workbench mw-cond-page">
  ${renderIconSprite()}
  ${rows ? `<main class="mw-cond" data-cond-frame-page data-part="rows">${renderBoardPluginRows(readText, options.text)}</main>` : frameBody(options, readText, sample)}
  ${renderLanguageHead(ports.htmlLang())}
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  ${rows ? "" : `<script type="application/json" id="mw-cond-data">${data}</script>
  <script>globalThis.molisBoardCodeGrow = ${createAssistantCodeGrow.toString()};</script>
  <script>${CONDITIONS_FRAME_SCRIPT}</script>`}
</body>
</html>`;
}

/** The frame's program, written in `src/browser/board/conditions-frame.ts` and bundled into `dist/` when the package builds. */
const CONDITIONS_FRAME_SCRIPT = readFileSync(new URL("./board-conditions-frame.js", import.meta.url), "utf8").trim();
