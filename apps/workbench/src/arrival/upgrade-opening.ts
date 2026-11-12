import { t as uiText, escapeHtml, icon } from "@molis-ai/molis-work-plugin-sdk/ui";
import { renderBarStatus, renderIconSprite, renderWordmark, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";

/**
 * The page the maintenance listener answers while a Home upgrades (upgrade-continuity U3 §4): the arrival page's titlebar, an empty stage
 * and the bar's status in the middle. For its first two seconds it is only the empty arrival, so a quick upgrade shows nothing at all; then
 * "正在升级 n / m". It reads `/upgrade-progress` twice a second and reloads once something other than the maintenance listener answers
 * there, which is the Host serving again. It has no token, no store name and no content: only the two numbers.
 */
export function renderUpgradeOpeningPage(lang: string): string {
  const progress = uiText.text("workbench.upgrade-opening.upgrading", { done: "%done", total: "%total" });
  const status = renderBarStatus({ spin: true, title: progress, caption: uiText.text("workbench.upgrade-opening.caption") });
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-arrival.css">
</head>
<body class="arrival-page immersive-workbench" data-arrival="upgrading" data-upgrade-opening>
  ${renderIconSprite()}
  <div class="arrival" data-workspace data-screen="upgrading">
    <header class="arrival-titlebar" data-region="titlebar" data-tauri-drag-region="deep"><span class="arrival-brand">${icon("brand")}${renderWordmark()}</span><span class="arrival-spacer"></span></header>
    <main class="arrival-stage" id="stage"></main>
    <div class="workbench-bar arrival-bar" data-dock data-bar="upgrading"><div class="bar-start"></div><div class="bar-center" data-upgrade-status hidden data-template="${escapeHtml(progress)}">${status}</div><div class="bar-end"></div></div>
  </div>
  <script>${UPGRADE_OPENING_SCRIPT}</script>
</body>
</html>`;
}

const UPGRADE_OPENING_SCRIPT = `(() => {
  const box = document.querySelector("[data-upgrade-status]"), line = box.querySelector(".mw-bar-status__text strong");
  const tick = async () => {
    try {
      const response = await fetch("/upgrade-progress", { cache: "no-store" });
      if (!response.ok) { location.reload(); return; }
      const progress = await response.json();
      if (progress.state === "upgrading" && Date.now() - progress.started_at >= 2000) {
        line.textContent = box.dataset.template.replace("%done", String(progress.done)).replace("%total", String(progress.total));
        box.hidden = false;
      }
    } catch { /* Between the maintenance listener and the Host, nothing answers for a moment: ask again. */ }
    setTimeout(tick, 500);
  };
  tick();
})();`;
