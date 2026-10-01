import { renderCaption, renderWordmark, type MolisWorkIcon } from "@molis-ai/molis-work-design-system";

/**
 * The frame every arrival screen shares: a titlebar, a stage and the resident bottom bar on the desk. A screen is
 * what goes inside the stage and the bar's three blocks; the frame itself never moves (specs/project-arrival-flow).
 */
export interface ArrivalShellPrimitives {
  L(text: string, values?: Record<string, string | number>): string;
  escapeHtml(value: unknown): string;
  icon(name: MolisWorkIcon): string;
  withDesktopQuery(path: string): string;
  htmlLang(): string;
  renderIconSprite(): string;
  controlTokenMeta(token: string): string;
  clientI18nScript(): string;
  /** The theme preference, and the native window's safe insets. Runs before the first paint. */
  themeBootstrapScript: string;
  visualFoundationClientScript: string;
}

/** What the chooser needs besides the frame: dates in the person's language. */
export interface ArrivalPrimitives extends ArrivalShellPrimitives {
  dateTimeLocale(): string;
}

export type ArrivalScreen = "chooser" | "opening" | "welcome" | "onboard" | "update";

export interface ArrivalTitlebarOptions {
  /** The AI caption sits beside the wordmark on the chooser only. */
  caption?: boolean;
  /** Background tasks, capabilities and settings; the opening has none of them. */
  tools?: boolean;
  /** Welcome's way to switch the theme before anything else is set. */
  theme?: boolean;
}

export interface ArrivalDocumentOptions {
  title: string;
  screen: ArrivalScreen;
  /** What the body carries for tests and styles (`data-arrival`, `data-onboarding-mode`, …). */
  bodyAttrs?: string;
  desktopShell: boolean;
  controlToken: string;
  /** Rendered into the titlebar, stage and bar by the screen. */
  titlebar: string;
  stage: string;
  bar: string;
  /** Rendered after the frame: templates, dialogs. */
  after?: string;
  /** The scripts of this screen, in order, already joined. */
  scripts: string;
}

export function createArrivalShell(p: ArrivalShellPrimitives) {
  const { L, escapeHtml, icon } = p;
  const href = (desktopShell: boolean, path: string) => desktopShell ? p.withDesktopQuery(path) : path;

  const caption = () => renderCaption({ label: L("暂停标题动画"), playLabel: L("播放标题动画"), title: L("点按暂停或播放") });

  function tools(desktopShell: boolean, options: ArrivalTitlebarOptions): string {
    const link = (path: string, glyph: MolisWorkIcon, label: string, aria: string) =>
      `<a class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" href="${href(desktopShell, path)}" aria-label="${escapeHtml(aria)}">${icon(glyph)}<span data-slot="button-label">${escapeHtml(label)}</span></a>`;
    const background = `<span class="arrival-bg"><button class="mw-btn mw-btn--ghost mw-btn--md background-tasks-button" data-slot="button" type="button" data-background-tasks aria-label="${L("后台任务")}" title="${L("后台任务")}" hidden>${icon("activity")}<span data-slot="button-label">${L("后台任务")}</span></button><span data-background-tasks-count hidden>0</span></span>`;
    const theme = options.theme
      ? `<span class="arrival-theme"><button class="mw-btn mw-btn--ghost mw-btn--md" data-slot="button" type="button" id="cx-theme" aria-label="${L("切换主题")}">${icon("switch")}<span data-slot="button-label">${L("切换主题")}</span></button></span>` : "";
    const global = options.tools === false ? "" : `<span class="arrival-global">${background}${link("/capabilities/library", "sparkles", L("能力"), L("打开能力服务"))}${link("/settings/appearance", "settings", L("设置"), L("打开系统设置"))}</span>`;
    return `<nav class="arrival-tools" aria-label="${L("全局")}">${theme}${global}</nav>`;
  }

  /** The titlebar: the mark and its wordmark, the caption on the chooser, and what is within reach on the right. */
  function titlebar(desktopShell: boolean, options: ArrivalTitlebarOptions = {}): string {
    const drag = desktopShell ? ' data-tauri-drag-region="deep"' : "";
    return `<header class="arrival-titlebar" data-region="titlebar"${drag}><span class="arrival-brand"${drag}>${icon("brand")}${renderWordmark()}</span>${options.caption ? caption() : ""}<span class="arrival-spacer"${drag}></span>${tools(desktopShell, options)}</header>`;
  }

  /** The bar: three blocks on the desk. The center is a whole element (the Assistant's island, or a status). */
  function bar(options: { kind: string; start?: string; center?: string; end?: string }): string {
    return `<div class="workbench-bar arrival-bar" data-dock data-bar="${escapeHtml(options.kind)}" aria-label="${L("底栏")}"><div class="bar-start">${options.start ?? ""}</div>${options.center ?? '<div class="bar-center"></div>'}<div class="bar-end">${options.end ?? ""}</div></div>`;
  }

  function document(options: ArrivalDocumentOptions): string {
    return `<!doctype html>
<html lang="${p.htmlLang()}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${p.controlTokenMeta(options.controlToken)}
  <title>${escapeHtml(options.title)}</title>
  <script>${p.themeBootstrapScript}</script>
  <link rel="stylesheet" href="/assets/molis-work-arrival.css">
</head>
<body class="arrival-page immersive-workbench" data-arrival="${options.screen}"${options.desktopShell ? ' data-native-desktop="true"' : ""}${options.bodyAttrs ?? ""}>
  ${p.renderIconSprite()}
  <div class="arrival" data-screen="${options.screen}">
    ${options.titlebar}
    ${options.stage}
    ${options.bar}
  </div>
  ${options.after ?? ""}
  <script>${options.scripts}</script>
</body>
</html>`;
  }

  return { href, titlebar, bar, document, caption, wordmark: () => renderWordmark() };
}

export type ArrivalShell = ReturnType<typeof createArrivalShell>;
