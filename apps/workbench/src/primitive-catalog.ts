import {
  THEME_BOOTSTRAP_SCRIPT,
  VISUAL_FOUNDATION_CLIENT_SCRIPT,
  renderIconSprite,
  renderPrimitiveCatalog,
  renderToggleGroup,
} from "@molis-ai/molis-work-design-system";

export function renderMolisWorkPrimitiveCatalog(): string {
  const themes = renderToggleGroup({
    label: "主题",
    items: [
      { value: "light", label: "浅色", attrs: { "data-theme-option": "light" } },
      { value: "dark", label: "深色", attrs: { "data-theme-option": "dark" } },
      { value: "system", label: "系统", current: true, attrs: { "data-theme-option": "system" } },
    ],
  });
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>控件原语 · Molis Work</title>
  <script>${THEME_BOOTSTRAP_SCRIPT}</script>
  <link rel="stylesheet" href="/assets/molis-work-settings.css">
</head>
<body class="mw-catalog-page settings-page">
  ${renderIconSprite()}
  <header class="mw-catalog-top">
    <div>
      <h1>Molis Work 控件原语</h1>
      <p>Coss 语法 · Mira 密度 · HTML Slot 契约。此页不进用户导航。</p>
    </div>
    ${themes}
  </header>
  ${renderPrimitiveCatalog()}
  <script>${VISUAL_FOUNDATION_CLIENT_SCRIPT}</script>
</body>
</html>`;
}
