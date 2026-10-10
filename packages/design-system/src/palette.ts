/** Hue ramps: text for 13px copy, fill for 6–8px marks, soft for 11% washes. Plugin identity and status only;
 * Content family is the DropAgent reading-surface set: warm paper + five type marks, no green. */

export type MwHueId =
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "mint"
  | "cyan"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "red"
  | "steel"
  | "slate";

export type MwContentMarkId = "slate" | "blue" | "ochre" | "plum" | "clay";

export interface MwHueSwatch {
  id: MwHueId;
  label: string;
  role: string;
  light: { text: string; fill: string; soft: string };
  dark: { text: string; fill: string; soft: string };
}

export interface MwContentMark {
  id: MwContentMarkId;
  label: string;
  role: string;
  light: { text: string; fill: string };
  dark: { text: string; fill: string };
}

export const MW_HUES: readonly MwHueSwatch[] = [
  { id: "gray", label: "Gray", role: "闲置 / Home", light: { text: "#5c6570", fill: "#95a2b3", soft: "#eef0f2" }, dark: { text: "#b3b8c2", fill: "#95a2b3", soft: "#24262a" } },
  { id: "brown", label: "Brown", role: "Feed", light: { text: "#9c5f1a", fill: "#c4894a", soft: "#f6eee4" }, dark: { text: "#dcab6d", fill: "#c4894a", soft: "#32281c" } },
  { id: "orange", label: "Orange", role: "注意", light: { text: "#8a5c18", fill: "#f2994a", soft: "#f8f0e2" }, dark: { text: "#d4a15c", fill: "#f2994a", soft: "#342a1c" } },
  { id: "yellow", label: "Yellow", role: "标记", light: { text: "#8a6d12", fill: "#e2b203", soft: "#f7f3e0" }, dark: { text: "#e0c56a", fill: "#e2b203", soft: "#332e18" } },
  { id: "green", label: "Green", role: "完成", light: { text: "#2d7a5a", fill: "#4cb782", soft: "#e8f4ee" }, dark: { text: "#6bc49a", fill: "#4cb782", soft: "#173026" } },
  { id: "mint", label: "Mint", role: "Inbox", light: { text: "#26785f", fill: "#4cb8a5", soft: "#e6f4f0" }, dark: { text: "#86c9b1", fill: "#4cb8a5", soft: "#17302a" } },
  { id: "cyan", label: "Cyan", role: "等待他人", light: { text: "#3d6f78", fill: "#4db7c9", soft: "#e7f2f3" }, dark: { text: "#86c0c7", fill: "#4db7c9", soft: "#1b2e32" } },
  { id: "blue", label: "Blue", role: "Goals", light: { text: "#3c6fc6", fill: "#5b8def", soft: "#e8eef9" }, dark: { text: "#8fb2f5", fill: "#5b8def", soft: "#1c2740" } },
  { id: "indigo", label: "Indigo", role: "accent / 进行中", light: { text: "#5e6ad2", fill: "#5e6ad2", soft: "#eef0fb" }, dark: { text: "#8b93f1", fill: "#8b93f1", soft: "#262848" } },
  { id: "purple", label: "Purple", role: "Sessions", light: { text: "#7f5eb0", fill: "#a78bda", soft: "#f1ebf7" }, dark: { text: "#c0a0ea", fill: "#a78bda", soft: "#2c2438" } },
  { id: "pink", label: "Pink", role: "Artifacts", light: { text: "#a15571", fill: "#e39eb6", soft: "#f8eef2" }, dark: { text: "#e39eb6", fill: "#e39eb6", soft: "#3a242c" } },
  { id: "red", label: "Red", role: "阻塞 / 危险", light: { text: "#b03d45", fill: "#eb5757", soft: "#fbecec" }, dark: { text: "#ee858c", fill: "#eb5757", soft: "#3a2024" } },
  { id: "steel", label: "Steel", role: "设置", light: { text: "#4f6470", fill: "#7d93a0", soft: "#eef1f3" }, dark: { text: "#9bb0bc", fill: "#7d93a0", soft: "#22282c" } },
  { id: "slate", label: "Slate", role: "Shelf 主操作", light: { text: "#66709e", fill: "#8b95c4", soft: "#eef0f6" }, dark: { text: "#a6afd5", fill: "#8b95c4", soft: "#242636" } },
] as const;

export const MW_SURFACES = [
  { token: "--page", label: "Desk", role: "珍珠灰桌面" },
  { token: "--paper", label: "Surface", role: "连续白色工作面" },
  { token: "--surface-soft", label: "Soft", role: "目录列 · 内层块" },
  { token: "--rail", label: "Wash", role: "局部分组" },
  { token: "--line", label: "Line", role: "分隔线" },
  { token: "--line-strong", label: "Line strong", role: "边界" },
] as const;

export const MW_TYPE_TONES = [
  { token: "--ink", label: "Ink", role: "正文" },
  { token: "--ink-soft", label: "Soft", role: "次级" },
  { token: "--muted", label: "Muted", role: "说明" },
  { token: "--faint", label: "Faint", role: "提示" },
] as const;

export const MW_ACTION_TONES = [
  { token: "--action", label: "Graphite", role: "主操作 · 选中" },
  { token: "--action-ink", label: "On graphite", role: "主操作上的字" },
  { token: "--accent", label: "Copper", role: "焦点 · 链接 · 进行中" },
  { token: "--accent-soft", label: "Copper wash", role: "引用 · 高亮" },
] as const;

export const MW_STATUS_TONES = [
  { token: "--tone-idle", label: "Idle", role: "可开始", hue: "gray" },
  { token: "--tone-progress", label: "Progress", role: "进行中", hue: "indigo" },
  { token: "--tone-attention", label: "Attention", role: "轮到你", hue: "orange" },
  { token: "--tone-hold", label: "Hold", role: "等他人", hue: "cyan" },
  { token: "--tone-blocked", label: "Blocked", role: "阻塞", hue: "red" },
  { token: "--tone-done", label: "Done", role: "完成", hue: "green" },
  { token: "--tone-quiet", label: "Quiet", role: "归档", hue: "gray" },
] as const;

export const MW_PLUGINS = [
  { id: "home", label: "Home", hue: "gray" as const },
  { id: "cognia", label: "Cognia", hue: "blue" as const },
  { id: "plugin-builder", label: "Plugin Builder", hue: "indigo" as const },
  { id: "images", label: "Images", hue: "pink" as const },
  { id: "jelly", label: "Jelly", hue: "mint" as const },
  { id: "goals", label: "Goals", hue: "blue" as const },
  { id: "feed", label: "Feed", hue: "brown" as const },
  { id: "sessions", label: "Sessions", hue: "purple" as const },
  { id: "inbox", label: "Inbox", hue: "mint" as const },
  { id: "schedule", label: "Schedule", hue: "yellow" as const },
  { id: "shelf", label: "Shelf", hue: "slate" as const },
  { id: "lingguang", label: "灵光", hue: "yellow" as const },
  { id: "todo", label: "待办", hue: "green" as const },
  { id: "characters", label: "Characters", hue: "purple" as const },
  { id: "pages", label: "Pages", hue: "cyan" as const },
  { id: "form", label: "Forms", hue: "orange" as const },
  { id: "dataset", label: "Dataset", hue: "green" as const },
  { id: "ppt", label: "PPT", hue: "red" as const },
  { id: "alchemist", label: "炼金术士", hue: "purple" as const },
  { id: "workflows", label: "工作流程", hue: "orange" as const },
  { id: "artifacts", label: "Artifacts", hue: "pink" as const },
  { id: "coding", label: "Coding", hue: "cyan" as const },
  { id: "workspace", label: "Workspace", hue: "slate" as const },
  { id: "files", label: "Files", hue: "yellow" as const },
  { id: "git", label: "Git", hue: "orange" as const },
  { id: "diff", label: "Diff", hue: "cyan" as const },
  { id: "text-stats", label: "Text Stats", hue: "brown" as const },
  { id: "settings", label: "Settings", hue: "steel" as const },
] as const;

/**
 * The reading surface is the same Soft Workbench family, not a second skin: Shelf and other reading
 * islands alias the shell tokens through `--content-*` (and Shelf through `--da-*`). Only the terminal
 * canvas keeps values of its own.
 */
export const MW_CONTENT_THEME = {
  light: { tty: "#F8F7F4", ttyInk: "#383A43" },
  dark: { tty: "#222329", ttyInk: "#E2E3E9" },
} as const;

export const MW_CONTENT_SURFACES = [
  { token: "--content-side", label: "Side", role: "内容栏" },
  { token: "--content-paper", label: "Paper", role: "阅读面" },
  { token: "--content-ink", label: "Ink", role: "正文" },
  { token: "--content-muted", label: "Muted", role: "说明" },
  { token: "--content-line", label: "Line", role: "发丝" },
  { token: "--content-accent", label: "Action", role: "主操作（石墨）" },
  { token: "--content-select", label: "Select", role: "选中" },
] as const;

/** File/action marks on the reading surface. Ink for 16px glyphs, fill for chips. No green. */
export const MW_CONTENT_MARKS: readonly MwContentMark[] = [
  { id: "slate", label: "钢蓝", role: "文稿 / 网页", light: { text: "#647DB5", fill: "#E7EAF2" }, dark: { text: "#91A8DC", fill: "#3A4155" } },
  { id: "blue", label: "雾青", role: "代码 / 链接", light: { text: "#5684AA", fill: "#E6ECF3" }, dark: { text: "#8AB2D5", fill: "#354454" } },
  { id: "ochre", label: "麦色", role: "文件夹", light: { text: "#A7803E", fill: "#F2EBDF" }, dark: { text: "#C9A566", fill: "#4B4133" } },
  { id: "plum", label: "灰紫", role: "图片 / 对话", light: { text: "#9270B1", fill: "#EFE6EF" }, dark: { text: "#BC9ADA", fill: "#4C3C4D" } },
  { id: "clay", label: "陶土", role: "PDF / 错误", light: { text: "#B27460", fill: "#F2E7E1" }, dark: { text: "#D29C87", fill: "#4D3D37" } },
] as const;

function hueCustomProperties(theme: "light" | "dark"): string {
  return MW_HUES.map((hue) => {
    const step = hue[theme];
    return `--hue-${hue.id}: ${step.text}; --hue-${hue.id}-fill: ${step.fill}; --hue-${hue.id}-soft: ${step.soft};`;
  }).join(" ");
}

function contentCustomProperties(theme: "light" | "dark"): string {
  const surface = MW_CONTENT_THEME[theme];
  const planes = [
    "--content-side: var(--surface-soft)",
    "--content-paper: var(--paper)",
    "--content-hover: var(--nav-hover)",
    "--content-press: var(--nav-press)",
    "--content-ink: var(--ink)",
    "--content-muted: var(--muted)",
    "--content-line: var(--line)",
    "--content-accent: var(--action)",
    "--content-accent-press: var(--action-hover)",
    "--content-on-accent: var(--action-ink)",
    "--content-select: var(--nav-active)",
    `--content-tty: ${surface.tty}`,
    `--content-tty-ink: ${surface.ttyInk}`,
    "--content-danger: var(--red)",
    "--content-field: var(--rail)",
  ].join("; ");
  const marks = MW_CONTENT_MARKS.map((mark) => {
    const step = mark[theme];
    return `--mark-${mark.id}: ${step.text}; --mark-${mark.id}-fill: ${step.fill};`;
  }).join(" ");
  return `${planes}; ${marks}`;
}

/**
 * Plugins carry no identity colour on screen: the Soft Workbench keeps colour for status and selection,
 * and a plugin is recognised by its glyph, its name and where it sits. Every `--plugin-*` resolves to the
 * neutral secondary ink so existing consumers (icons, kind labels, washes) stay valid and calm.
 * `MW_PLUGINS[].hue` remains data for the catalog, not a rendering rule.
 */
function pluginCustomProperties(): string {
  return MW_PLUGINS.map((plugin) => `--plugin-${plugin.id}: var(--ink-soft);`).join(" ");
}

function semanticAliases(): string {
  return [
    "--tone-idle: var(--hue-gray); --tone-progress: var(--accent); --tone-attention: var(--amber);",
    "--tone-hold: var(--hue-cyan); --tone-blocked: var(--red); --tone-done: var(--green); --tone-quiet: var(--faint);",
    pluginCustomProperties(),
  ].join(" ");
}

export function renderPaletteTokens(theme: "light" | "dark"): string {
  return `${hueCustomProperties(theme)} ${semanticAliases()} ${contentCustomProperties(theme)}`;
}

/**
 * Soft Workbench shell: one source for every layer's base tokens — surfaces, type tones,
 * status, the copper accent, depth, corners, motion and focus. Foundation, the Coss
 * overlay, the interaction texture and the workbench base all call this instead of
 * restating values, so no later layer quietly wins with a different number.
 *
 * Surfaces: a pearl desk (`--page`/`--desk`), the continuous white work surface (`--paper`, and `--canvas`
 * for full-pane canvases inside it),
 * a warmer inner block and plugin directory columns (`--surface-soft`), chrome bars on the desk
 * (`--nav-bg`) and a wash for local groups (`--rail`).
 * Graphite is the primary action; copper marks focus, links, selection details and
 * work in progress. `--blue*` keep their historical names and now resolve to copper.
 */
export function renderShellTokens(theme: "light" | "dark"): string {
  if (theme === "dark") {
    return [
      "--page: #1c1d20; --desk: #1c1d20; --nav-bg: #1c1d20; --canvas: #242528;",
      "--paper: #242528; --panel: #242528; --surface: #242528;",
      "--surface-soft: #292a2d; --rail: #2e2f32; --wash: #2e2f32;",
      "--ink: #f0efed; --text: #f0efed; --ink-soft: #c0beba;",
      "--muted: #a2a19e; --faint: #979693;",
      "--line: #36373b; --line-strong: #4c4d50;",
      "--nav-hover: color-mix(in srgb, var(--ink) 7%, transparent);",
      "--nav-active: color-mix(in srgb, var(--ink) 11%, transparent);",
      "--nav-press: color-mix(in srgb, var(--ink) 15%, transparent);",
      "--nav-raised: #2c2d31;",
      "--accent: #d6a18a; --accent-strong: #e8c0ad; --accent-soft: #382f2b;",
      "--blue: var(--accent); --blue-dark: var(--accent-strong); --blue-soft: var(--accent-soft); --focus: var(--accent);",
      "--action: #ecebe8; --action-ink: #252628; --action-hover: #ffffff;",
      "--green: #8db99d; --green-soft: #1f2b24; --amber: #d9b67b; --amber-soft: #33291b; --red: #ee858c; --red-soft: #3a2024;",
      "--shadow-color: #000000; --edge-highlight: rgba(255, 255, 255, .05);",
      "--surface-shadow: 0 0 0 1px rgba(255, 255, 255, .035), 0 1px 2px rgba(0, 0, 0, .3);",
      "--shadow-soft: 0 1px 2px rgba(0, 0, 0, .32), 0 4px 12px -4px rgba(0, 0, 0, .4);",
      "--shadow-raised: 0 0 0 1px rgba(255, 255, 255, .05), 0 3px 8px rgba(0, 0, 0, .2), 0 14px 42px -12px rgba(0, 0, 0, .45);",
      "--shadow: 0 0 0 1px rgba(255, 255, 255, .06), 0 3px 9px rgba(0, 0, 0, .25), 0 20px 70px -15px rgba(0, 0, 0, .55);",
      "--control-shadow: var(--shadow);",
      "--lift-1: var(--shadow-soft); --lift-2: var(--shadow-raised); --lift-3: var(--shadow);",
      "--scrim: rgba(0, 0, 0, .5);",
      /* Dark reads as three layers at a glance: the desk, the work surface a step up, floating things a step above it. */
      "--popover: #2c2d31; --brand-tile-light: #ffffff; --brand-tile-dark: #151618; --on-accent: #ffffff;",
    ].join(" ");
  }
  return [
    "--page: #eeefef; --desk: #eeefef; --nav-bg: #eeefef; --canvas: #ffffff;",
    "--paper: #ffffff; --panel: #ffffff; --surface: #ffffff;",
    "--surface-soft: #fafaf9; --rail: #f5f5f3; --wash: #f5f5f3;",
    "--ink: #292a2c; --text: #292a2c; --ink-soft: #5c5d60;",
    "--muted: #636569; --faint: #6a6c70;",
    "--line: #e9e9e7; --line-strong: #d5d6d4;",
    "--nav-hover: color-mix(in srgb, var(--ink) 5%, transparent);",
    "--nav-active: color-mix(in srgb, var(--ink) 8%, transparent);",
    "--nav-press: color-mix(in srgb, var(--ink) 11%, transparent);",
    "--nav-raised: #ffffff;",
    "--accent: #93604b; --accent-strong: #7a4d3a; --accent-soft: #f6eee8;",
    "--blue: var(--accent); --blue-dark: var(--accent-strong); --blue-soft: var(--accent-soft); --focus: var(--accent);",
    "--action: #292a2c; --action-ink: #ffffff; --action-hover: #3d3e41;",
    "--green: #42775d; --green-soft: #e9f2ec; --amber: #8a5c18; --amber-soft: #f7f0e3; --red: #b03d45; --red-soft: #fbecec;",
    "--shadow-color: #1c2233; --edge-highlight: transparent;",
    "--surface-shadow: 0 1px 2px rgba(28, 34, 51, .03), 0 8px 24px -14px rgba(28, 34, 51, .1);",
    "--shadow-soft: 0 1px 2px rgba(28, 34, 51, .05), 0 4px 12px -4px rgba(28, 34, 51, .08);",
    "--shadow-raised: 0 3px 8px rgba(28, 34, 51, .035), 0 14px 42px -12px rgba(28, 34, 51, .14);",
    "--shadow: 0 3px 9px rgba(28, 34, 51, .045), 0 20px 70px -15px rgba(28, 34, 51, .2);",
    "--control-shadow: var(--shadow);",
    "--lift-1: var(--shadow-soft); --lift-2: var(--shadow-raised); --lift-3: var(--shadow);",
    "--scrim: rgba(21, 23, 29, .16);",
    "--popover: #ffffff; --brand-tile-light: #ffffff; --brand-tile-dark: #151618; --on-accent: #ffffff;",
  ].join(" ");
}

/**
 * Control metrics. Declared only by the early layers (foundation, the Coss overlay, the workbench base) so
 * density and touch rules later in the cascade — 28px compact, 44px on phones and coarse pointers — win.
 */
export function renderControlMetrics(): string {
  return "--control-h: 32px; --control-pad-x: 12px;";
}

/** Theme-independent shape, motion and focus. Safe to restate in late layers: it carries no metrics. */
export function renderShapeTokens(): string {
  return [
    "--radius-item: 8px; --radius-control: 8px; --radius-surface: 14px;",
    "--control-border: color-mix(in srgb, var(--ink) 9%, transparent);",
    "--control-input: color-mix(in srgb, var(--ink) 12%, transparent);",
    "--control-fill: color-mix(in srgb, var(--ink) 4%, transparent);",
    "--control-fill-hover: color-mix(in srgb, var(--ink) 7%, transparent);",
    "--control-ring: var(--focus);",
    "--hairline: color-mix(in srgb, var(--ink) 11%, transparent);",
    "--focus-ring: var(--accent); --focus-stroke: 2px solid var(--focus-ring); --focus-stroke-inset: 1px;",
    "--motion-instant: 130ms; --motion-fast: 130ms; --motion-normal: 250ms; --motion-arrive: 420ms; --dur-hover: 130ms; --dur-press: 130ms; --dur-move: 250ms; --dur-arrive: 420ms; --dur-moment: 640ms;",
    "--ease-quint: cubic-bezier(.22, 1, .36, 1); --ease-spring: cubic-bezier(.2, 1.35, .4, 1); --ease-out: var(--ease-quint); --ease-standard: var(--ease-quint);",
    "--icon-xs: 12px; --icon-sm: 14px; --icon-md: 16px; --icon-lg: 20px;",
  ].join(" ");
}

export function renderPluginTintBindings(): string {
  return MW_PLUGINS.flatMap((plugin) => {
    const extras = plugin.id === "settings"
      ? ", [data-settings-section=\"project-settings\"], [data-directory-panel=\"project-settings\"]"
      : "";
    const surfaces = plugin.id === "goals"
      ? `[data-work-surface="${plugin.id}"], [data-work-surface="goal"], [data-goal-canvas-shell]`
      : `[data-work-surface="${plugin.id}"]`;
    return [
      `body.immersive-workbench :is(.plugin-rail [data-plugin-id="${plugin.id}"], .assistant-island [data-plugin-id="${plugin.id}"], [data-plugin-section="${plugin.id}"], [data-directory-panel="${plugin.id}"], [data-market-plugin="${plugin.id}"], [data-market-focus="${plugin.id}"], ${surfaces}, .tab-item[data-plugin="${plugin.id}"]${extras}) { --plugin-tint: var(--plugin-${plugin.id}); }`,
      `.mw-catalog [data-plugin-id="${plugin.id}"] { --plugin-tint: var(--plugin-${plugin.id}); }`,
    ];
  }).join("\n  ");
}
