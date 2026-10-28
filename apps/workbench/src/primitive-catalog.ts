import { escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import {
  ARRIVAL_MOTION_CLIENT_SCRIPT,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  registeredIconNames,
  renderIconSprite,
  renderPrimitiveCatalog,
  type CatalogPluginIcon,
  renderProjectMonogram,
  renderToggleGroup,
} from "@molis-ai/molis-work-design-system";
import { FOUNDATION_SPECIMEN_STYLES, renderFoundationSection } from "./foundation-specimens.js";
import { CONDITIONS_SECTION_STYLES, renderConditionsSection } from "./condition-specimens.js";
import { ASSISTANT_SECTION_STYLES, renderAssistantBoardSection } from "./assistant-board-specimens.js";
import { PLUGIN_ROWS_SECTION_STYLES, renderPluginRowsSection } from "./board-plugin-rows.js";
import { renderPluginRail, renderWorkbenchBar, renderWorkspaceChrome } from "./immersive-shell.js";
import { renderPersonalMenuItems } from "./settings-directory.js";
import { builtinPluginDirectory, pluginTabGlyphs } from "./plugin-catalog.js";

/**
 * The specimen project's plugins, a fixed sample (a development tool, W5-02 B1): the Dock's default pins and the person's plugins
 * of a fresh project. The bar specimen draws these bright and the rest of the build-time plugin directory (`pluginMarketCards()`,
 * which already leaves developer plugins out) grey "not added". The board runs no Runtime and no Host, so it is drawn from the
 * built-in catalog's directory; a project page is drawn from the one the Host supplies (`plugin_directory`, `shown_plugins`).
 */
const SAMPLE_PROJECT_PLUGINS = ["goals", "inbox", "feed", "issues", "cognia", "plugin-builder", "images", "jelly", "shelf", "lingguang", "todo",
  "pages", "form", "dataset", "ppt", "alchemist", "workflows"];

/** The workbench's own surfaces that draw a glyph without being a plugin: they are not in any Manifest, so the board names them here. */
const SURFACE_GLYPHS: readonly CatalogPluginIcon[] = [{ id: "home", name: "项目首页", icon: "home" }, { id: "characters", name: "Characters", icon: "user" }, { id: "market", name: "插件市场", icon: "grid" }];

/** The icon inventory's plugin rows: the glyph each built-in plugin's Manifest declares (the one the rail, tabs and market draw), after the workbench's own surfaces. */
function iconInventoryPlugins(): CatalogPluginIcon[] {
  const glyphs = pluginTabGlyphs(), registered = registeredIconNames();
  return [...SURFACE_GLYPHS, ...builtinPluginDirectory().flatMap(entry => {
    const glyph = registered.find(name => name === glyphs[entry.id]);
    return glyph ? [{ id: entry.id, name: entry.name, icon: glyph }] : [];
  })];
}

/**
 * The resident bar exactly as the workbench composes it, on a strip of desk: Dock menu, pinned plugins,
 * the plugin switcher with the Assistant line, the side panel's button and the project. Pins are filled
 * the way the workbench client fills them; the switcher opens with the same popover.
 */
function renderBarSpecimen(): string {
  const primitives = { L: (text: string) => text, escapeHtml, icon, htmlLang: () => "zh-CN" };
  const project = { project_id: "project-demo", display_name: "Molis Work 示例项目" };
  const monogram = renderProjectMonogram(project.display_name, project.project_id, escapeHtml);
  const projectMenu = `<div class="navigator-project-primary"><details class="navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="切换项目">${monogram}<strong>${project.display_name}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>切换项目</span><nav><a class="navigator-project-option is-current" href="#bar" aria-current="page"><span>${monogram}<strong>${project.display_name}</strong></span>${icon("check")}</a></nav><a class="navigator-project-manage" href="#bar">${icon("database")}<span>管理项目</span></a>${renderPersonalMenuItems(primitives)}</div></details></div>`;
  const bar = renderWorkbenchBar(primitives, {
    enabled: SAMPLE_PROJECT_PLUGINS,
    rail: renderPluginRail(primitives, SAMPLE_PROJECT_PLUGINS, "", builtinPluginDirectory()),
    projectChrome: renderWorkspaceChrome(primitives, projectMenu),
  });
  const pin = (id: string, glyph: Parameters<typeof icon>[0], label: string, extra = "") => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" data-dock-pin="${id}" aria-label="${label}" title="${label}"${extra}>${icon(glyph)}</button>`;
  const pins = pin("home", "home", "项目首页") + pin("goals", "target", "Goals", ' aria-current="page"') + pin("inbox", "inbox", "Inbox") + pin("feed", "rss", "Feed");
  return `<div class="mw-catalog-bar-stage" data-catalog-bar>${bar.replace('<div class="dock-pins" data-dock-pins role="toolbar" aria-label="常驻插件"></div>', `<div class="dock-pins" data-dock-pins role="toolbar" aria-label="常驻插件">${pins}</div>`)}</div>`;
}

/** The board shows the bar in its own workbench context: the page the iframe below loads. */
export function renderMolisWorkBarSpecimen(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>底栏样例 · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-workbench.css">
</head>
<body class="immersive-workbench mw-bar-specimen-page">
  ${renderIconSprite()}
  ${renderBarSpecimen()}
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}${BAR_SPECIMEN_SCRIPT}</script>
</body>
</html>`;
}

function renderBarSection(): string {
  return `<section class="mw-catalog__section" id="bar" data-primitive="bar"><h2>底栏与浮层</h2>
    <p class="mw-catalog__hint">Workbench 组合的常驻底栏，在它自己的工作台环境里（与工作台同一份标记、样式与层叠）：左侧 Dock 菜单与常驻插件，中间插件切换与 Assistant 输入，右侧 Shelf、灵光、项目讨论与项目。菜单都从底栏向上长出；悬停出现提示，按下回弹，当前项是一小块抬起的工作面加铜色小点。可直接操作。</p>
    <iframe class="mw-catalog-bar-frame" src="/__ui/catalog/bar" title="底栏与浮层样例" loading="lazy"></iframe>
  </section>`;
}

const BAR_SPECIMEN_SCRIPT = `
(() => {
  const stage = document.querySelector("[data-catalog-bar]");
  if (!stage) return;
  const toggle = stage.querySelector("[data-plugin-picker-toggle]");
  const popover = stage.querySelector("[data-plugin-picker-popover]");
  const input = stage.querySelector("[data-assistant-input]");
  const send = stage.querySelector("[data-assistant-send]");
  const setPicker = (open) => { if (!toggle || !popover) return; popover.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); };
  toggle?.addEventListener("click", () => setPicker(popover.hidden));
  input?.addEventListener("input", () => { if (send) send.disabled = !input.value.trim(); });
  stage.querySelector("[data-assistant-composer]")?.addEventListener("submit", (event) => event.preventDefault());
  stage.addEventListener("click", (event) => {
    // The switcher's two buttons answer here the way the workbench's do (the specimen holds no project, so nothing is kept).
    const keep = event.target.closest("[data-dock-choice]");
    if (keep && !keep.disabled) {
      const on = keep.getAttribute("aria-pressed") !== "true";
      keep.setAttribute("aria-pressed", String(on));
      keep.classList.toggle("mw-btn--primary", on); keep.classList.toggle("mw-btn--secondary", !on);
      keep.closest(".plugin-rail-tile")?.classList.toggle("is-kept", on);
      return;
    }
    const toggle = event.target.closest("[data-plugin-toggle]");
    if (toggle && !toggle.disabled) {
      const tile = toggle.closest(".plugin-rail-tile"); const adding = toggle.dataset.state === "available";
      tile.classList.toggle("is-available", !adding);
      toggle.dataset.state = adding ? "added" : "available";
      toggle.classList.toggle("mw-btn--primary", !adding); toggle.classList.toggle("mw-btn--secondary", adding);
      const pin = tile.querySelector("[data-dock-choice]"); if (pin) pin.disabled = !adding;
      return;
    }
    const pin = event.target.closest("[data-dock-pin]");
    if (!pin) return;
    stage.querySelectorAll("[data-dock-pin]").forEach((node) => node.toggleAttribute("aria-current", node === pin));
  });
  document.addEventListener("click", (event) => {
    if (!stage.contains(event.target)) { setPicker(false); stage.querySelectorAll("details[open]").forEach((node) => node.removeAttribute("open")); }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (popover && !popover.hidden) { setPicker(false); toggle?.focus(); }
    stage.querySelectorAll("details[open]").forEach((node) => { node.removeAttribute("open"); node.querySelector("summary")?.focus(); });
  });
})();`;

/** The board's specimens move: the copy buttons copy (one is refused), the live number counts through its range, the arrival
 * wordmark types again on demand and the caption cycles its words. */
const SPECIMEN_SCRIPT = `
(() => {
  document.addEventListener("click", (event) => {
    const language = event.target.closest("[data-board-lang]");
    if (language && !language.classList.contains("is-current")) { const url = new URL(location.href); url.searchParams.set("lang", language.dataset.boardLang); location.assign(url.href); return; }
    const copy = event.target.closest("[data-catalog-copy]");
    if (copy) window.molisCopy?.(copy, () => copy.dataset.catalogCopy === "ok" ? "Molis Work" : Promise.reject(new Error("refused")));
  });
  const elapsed = document.querySelector("[data-catalog-elapsed]");
  let seconds = 0;
  if (elapsed) setInterval(() => { seconds = (seconds + 7) % 3600; elapsed.textContent = seconds < 60 ? seconds + " 秒" : Math.floor(seconds / 60) + " 分 " + (seconds % 60) + " 秒"; }, 400);
  // A log that keeps growing: it follows while at the end; scrolled up, the lines wait behind the button.
  const log = document.querySelector("[data-catalog-follow]"), latest = document.querySelector("[data-catalog-latest]");
  const follow = log && window.molisFollow?.(log, { onChange: (state) => { if (state === "following") latest.hidden = true; } });
  let line = 0;
  if (follow) setInterval(() => { const row = document.createElement("div"); row.textContent = "第 " + (++line) + " 行 · 运行中"; log.append(row); if (follow.state === "following") follow.pin(); else latest.hidden = false; }, 700);
  latest?.addEventListener("click", () => follow?.toLatest());
  // Newly written text, the way a reply comes in: short pieces at a model's pace, the same reveal in both, only the blur differs.
  const SAMPLE = ["Molis 把这一轮读过的文件、改动和测试结果放在一起，", "你不用翻日志就能看到它做到哪了 👩‍💻。", "下一步：跑 tests/split-divider.e2e.test.ts，再对照基线。"];
  const streams = [...document.querySelectorAll("[data-catalog-stream]")], replay = document.querySelector("[data-catalog-stream-replay]");
  let timer = 0;
  const play = () => {
    clearInterval(timer); streams.forEach((box) => box.replaceChildren());
    // Pieces are cut by code point, as a model's stream is: an emoji sequence may still arrive in two pieces.
    const parts = SAMPLE.map((part) => [...part]), total = parts.flat().length; let at = 0;
    const html = (upto) => parts.map((part, i) => part.slice(0, Math.max(0, upto - parts.slice(0, i).flat().length)).join("")).filter(Boolean).map((part) => "<p>" + part.replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</p>").join("");
    timer = setInterval(() => { at = Math.min(total, at + 3 + Math.floor(Math.random() * 4)); streams.forEach((box) => window.molisStreamText?.(box, html(at), { reveal: at < total })); if (at >= total) clearInterval(timer); }, 60);
  };
  replay?.addEventListener("click", play);
  document.querySelector("[data-catalog-stream-slow]")?.addEventListener("change", (event) => streams.forEach((box) => box.toggleAttribute("data-slow", event.target.checked)));
  if (streams.length) play();
  // The media zoom: the button says what it does next, as a preview's own control would.
  const media = document.querySelector("[data-catalog-media]"), button = document.querySelector("[data-catalog-media-zoom]");
  const zoom = media && window.molisMediaZoom?.(media, media.querySelector("img"), { onChange: (state) => { button.textContent = state === "fit" ? "原始尺寸" : "适应窗口"; } });
  button?.addEventListener("click", () => { if (zoom) zoom.state() === "fit" ? zoom.actual() : zoom.fit(); });
})();
(() => {
  const arrival = window.molisArrival;
  if (!arrival) return;
  const wordmark = document.querySelector("[data-arrival-wordmark]");
  arrival.settleWordmark(wordmark);
  document.querySelectorAll("[data-caption]").forEach((button) => arrival.mountCaption(button));
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-arrival-demo="wordmark"]')) arrival.typeWordmark(wordmark, { pace: "ritual", delay: 200 });
  });
})();`;

/**
 * `say` is the page's translator and `lang` its language, which the board's own switch picks: the conditions, Assistant and
 * plugin-row sections are written through it and their frames start in it (the older sections are Chinese only).
 */
export function renderMolisWorkPrimitiveCatalog(say: (text: string, values?: Record<string, string | number>) => string = (text) => text, lang: "zh" | "en" = "zh"): string {
  const languages = renderToggleGroup({
    label: say("界面语言"),
    items: [["zh", "中文"], ["en", "English"]].map(([value, label]) => ({ value: value!, label: label!, current: value === lang, attrs: { "data-board-lang": value! } })),
  });
  const themes = renderToggleGroup({
    label: "主题",
    items: [
      { value: "light", label: "浅色", attrs: { "data-theme-option": "light" } },
      { value: "dark", label: "深色", attrs: { "data-theme-option": "dark" } },
      { value: "system", label: "系统", current: true, attrs: { "data-theme-option": "system" } },
    ],
  });
  const catalog = renderPrimitiveCatalog({ plugins: iconInventoryPlugins() })
    .replace("</nav>", `<a href="#foundation" title="视觉机制">视觉机制</a><a href="#conditions" title="${say("条件与状态")}">${say("条件与状态")}</a><a href="#assistant" title="${say("助理信息与任务")}">${say("助理信息与任务")}</a><a href="#plugin-rows" title="${say("插件行视图")}">${say("插件行视图")}</a><a href="#bar" title="底栏与浮层">底栏与浮层</a></nav>`)
    .replace("\n  </div>\n  <script>", `\n    ${renderFoundationSection()}\n    ${renderConditionsSection(say, lang)}\n    ${renderAssistantBoardSection(say, lang)}\n    ${renderPluginRowsSection(say, lang)}\n    ${renderBarSection()}\n  </div>\n  <script>`);
  return `<!doctype html>
<html lang="${lang === "en" ? "en" : "zh-CN"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>组件板 · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-settings.css">
  <style>${FOUNDATION_SPECIMEN_STYLES}${CONDITIONS_SECTION_STYLES}${ASSISTANT_SECTION_STYLES}${PLUGIN_ROWS_SECTION_STYLES}.mw-catalog-top__tools{display:flex;flex-wrap:wrap;gap:8px}</style>
</head>
<body class="mw-catalog-page settings-page">
  ${renderIconSprite()}
  <header class="mw-catalog-top">
    <div>
      <h1>Molis Work 组件板</h1>
      <p>Soft Workbench · 真实生产组件与组合 · HTML Slot 契约。开发工具，不进用户导航。</p>
    </div>
    <div class="mw-catalog-top__tools">${languages}${themes}</div>
  </header>
  ${catalog}
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ARRIVAL_MOTION_CLIENT_SCRIPT}${SPECIMEN_SCRIPT}</script>
</body>
</html>`;
}
