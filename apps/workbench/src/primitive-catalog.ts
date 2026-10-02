import {
  ARRIVAL_MOTION_CLIENT_SCRIPT,
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  escapeHtml,
  icon,
  renderIconSprite,
  renderPrimitiveCatalog,
  renderProjectMonogram,
  renderToggleGroup,
} from "@molis-ai/molis-work-design-system";
import { renderPluginRail, renderWorkbenchBar, renderWorkspaceChrome } from "./immersive-shell.js";
import { renderPersonalMenuItems } from "./settings-directory.js";

const CATALOG_PLUGINS = ["goals", "inbox", "feed", "sessions", "schedule", "workflows", "pages", "shelf", "lingguang", "plugin-builder"] as const;

/**
 * The resident bar exactly as the workbench composes it, on a strip of desk: Dock menu, pinned plugins,
 * the plugin switcher with the Assistant line, Shelf and 灵光, discussion and the project. Pins are filled
 * the way the workbench client fills them; the switcher opens with the same popover.
 */
function renderBarSpecimen(): string {
  const primitives = { L: (text: string) => text, escapeHtml, icon, htmlLang: () => "zh-CN" };
  const project = { project_id: "project-demo", display_name: "Molis Work 示例项目" };
  const monogram = renderProjectMonogram(project.display_name, project.project_id, escapeHtml);
  const projectMenu = `<div class="navigator-project-primary"><details class="navigator-project-menu" data-project-menu><summary class="navigator-project-selector" aria-label="切换项目">${monogram}<strong>${project.display_name}</strong>${icon("chevron-down")}</summary><div class="navigator-project-menu-popover"><span>切换项目</span><nav><a class="navigator-project-option is-current" href="#bar" aria-current="page"><span>${monogram}<strong>${project.display_name}</strong></span>${icon("check")}</a></nav><a class="navigator-project-manage" href="#bar">${icon("database")}<span>管理项目</span></a>${renderPersonalMenuItems(primitives)}</div></details></div>`;
  const bar = renderWorkbenchBar(primitives, {
    enabled: CATALOG_PLUGINS,
    rail: renderPluginRail(primitives, CATALOG_PLUGINS, ""),
    projectChrome: renderWorkspaceChrome(primitives, projectMenu),
  });
  const pin = (id: string, glyph: Parameters<typeof icon>[0], label: string, extra = "") => `<button type="button" class="dock-pin${id === "home" ? " is-fixed" : ""}" data-dock-pin="${id}" aria-label="${label}" title="${label}"${extra}>${icon(glyph)}</button>`;
  const pins = pin("home", "home", "项目首页") + pin("goals", "target", "Goals", ' aria-current="page"') + pin("inbox", "inbox", "Inbox") + pin("feed", "rss", "Feed") + pin("sessions", "terminal", "Sessions");
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
      const pin = tile.querySelector("[data-dock-choice]"); if (pin && !pin.hasAttribute("data-resident")) pin.disabled = !adding;
      return;
    }
    const pin = event.target.closest("[data-dock-pin], [data-bar-resident]");
    if (!pin) return;
    stage.querySelectorAll("[data-dock-pin], [data-bar-resident]").forEach((node) => node.toggleAttribute("aria-current", node === pin));
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

/** The arrival specimens move: the wordmark types again on demand and the caption cycles its words. */
const ARRIVAL_SPECIMEN_SCRIPT = `
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

export function renderMolisWorkPrimitiveCatalog(): string {
  const themes = renderToggleGroup({
    label: "主题",
    items: [
      { value: "light", label: "浅色", attrs: { "data-theme-option": "light" } },
      { value: "dark", label: "深色", attrs: { "data-theme-option": "dark" } },
      { value: "system", label: "系统", current: true, attrs: { "data-theme-option": "system" } },
    ],
  });
  const catalog = renderPrimitiveCatalog()
    .replace("</nav>", '<a href="#bar" title="底栏与浮层">底栏与浮层</a></nav>')
    .replace("\n  </div>\n  <script>", `\n    ${renderBarSection()}\n  </div>\n  <script>`);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>组件板 · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-settings.css">
</head>
<body class="mw-catalog-page settings-page">
  ${renderIconSprite()}
  <header class="mw-catalog-top">
    <div>
      <h1>Molis Work 组件板</h1>
      <p>Soft Workbench · 真实生产组件与组合 · HTML Slot 契约。开发工具，不进用户导航。</p>
    </div>
    ${themes}
  </header>
  ${catalog}
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
  <script>${ARRIVAL_MOTION_CLIENT_SCRIPT}${ARRIVAL_SPECIMEN_SCRIPT}</script>
</body>
</html>`;
}
