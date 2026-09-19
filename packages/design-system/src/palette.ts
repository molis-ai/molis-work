/** Linear-referenced hues: text for 13px copy, fill for 6–8px marks, soft for 11% washes.
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
  { token: "--page", label: "Page", role: "外场" },
  { token: "--paper", label: "Paper", role: "纸面" },
  { token: "--nav-bg", label: "Nav", role: "栏" },
  { token: "--rail", label: "Rail", role: "轨" },
  { token: "--nav-raised", label: "Raised", role: "抬起" },
  { token: "--line", label: "Line", role: "发丝" },
] as const;

export const MW_TYPE_TONES = [
  { token: "--ink", label: "Ink", role: "正文" },
  { token: "--ink-soft", label: "Soft", role: "次级" },
  { token: "--muted", label: "Muted", role: "说明" },
  { token: "--faint", label: "Faint", role: "提示" },
] as const;

export const MW_ACTION_TONES = [
  { token: "--action", label: "Action", role: "主按钮" },
  { token: "--action-ink", label: "Action ink", role: "主按钮字" },
  { token: "--focus", label: "Focus", role: "焦点" },
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
  { id: "goals", label: "Goals", hue: "blue" as const },
  { id: "feed", label: "Feed", hue: "brown" as const },
  { id: "sessions", label: "Sessions", hue: "purple" as const },
  { id: "inbox", label: "Inbox", hue: "mint" as const },
  { id: "shelf", label: "Shelf", hue: "slate" as const },
  { id: "artifacts", label: "Artifacts", hue: "pink" as const },
  { id: "coding", label: "Coding", hue: "cyan" as const },
  { id: "settings", label: "Settings", hue: "steel" as const },
] as const;

/** Warm reading-surface ramp. Chrome stays Linear zinc; Shelf aliases these as `--da-*`. */
export const MW_CONTENT_THEME = {
  light: {
    side: "#F5F5F4",
    paper: "#FCFCFB",
    hover: "#EEEEEE",
    press: "#E8E9EE",
    ink: "#292A2E",
    muted: "#74757D",
    line: "#E8E8E6",
    accentPress: "#4B5874",
    onAccent: "#FAF9F6",
    select: "#D6DCEB",
    tty: "#F8F7F4",
    ttyInk: "#383A43",
    danger: "#8C594B",
    field: "#EEEEED",
  },
  dark: {
    side: "#111112",
    paper: "#19191B",
    hover: "#242427",
    press: "#28282F",
    ink: "#E9E9ED",
    muted: "#96969F",
    line: "#2B2B2F",
    accentPress: "#C5CDE6",
    onAccent: "#2B3142",
    select: "#4D5874",
    tty: "#222329",
    ttyInk: "#E2E3E9",
    danger: "#E0B5A5",
    field: "#202023",
  },
} as const;

export const MW_CONTENT_SURFACES = [
  { token: "--content-side", label: "Side", role: "内容栏" },
  { token: "--content-paper", label: "Paper", role: "阅读面" },
  { token: "--content-ink", label: "Ink", role: "正文" },
  { token: "--content-muted", label: "Muted", role: "说明" },
  { token: "--content-line", label: "Line", role: "发丝" },
  { token: "--content-accent", label: "Accent", role: "主操作" },
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
    `--content-side: ${surface.side}`,
    `--content-paper: ${surface.paper}`,
    `--content-hover: ${surface.hover}`,
    `--content-press: ${surface.press}`,
    `--content-ink: ${surface.ink}`,
    `--content-muted: ${surface.muted}`,
    `--content-line: ${surface.line}`,
    `--content-accent: var(--hue-slate)`,
    `--content-accent-press: ${surface.accentPress}`,
    `--content-on-accent: ${surface.onAccent}`,
    `--content-select: ${surface.select}`,
    `--content-tty: ${surface.tty}`,
    `--content-tty-ink: ${surface.ttyInk}`,
    `--content-danger: ${surface.danger}`,
    `--content-field: ${surface.field}`,
  ].join("; ");
  const marks = MW_CONTENT_MARKS.map((mark) => {
    const step = mark[theme];
    return `--mark-${mark.id}: ${step.text}; --mark-${mark.id}-fill: ${step.fill};`;
  }).join(" ");
  return `${planes}; ${marks}`;
}

function pluginCustomProperties(): string {
  return MW_PLUGINS.map((plugin) => `--plugin-${plugin.id}: var(--hue-${plugin.hue});`).join(" ");
}

function semanticAliases(): string {
  return [
    "--blue: var(--hue-indigo); --blue-soft: var(--hue-indigo-soft); --focus: var(--hue-indigo);",
    "--green: var(--hue-green); --green-soft: var(--hue-green-soft);",
    "--amber: var(--hue-orange); --amber-soft: var(--hue-orange-soft);",
    "--red: var(--hue-red); --red-soft: var(--hue-red-soft);",
    "--tone-idle: var(--hue-gray); --tone-progress: var(--hue-indigo); --tone-attention: var(--hue-orange);",
    "--tone-hold: var(--hue-cyan); --tone-blocked: var(--hue-red); --tone-done: var(--hue-green); --tone-quiet: var(--faint);",
    pluginCustomProperties(),
  ].join(" ");
}

export function renderPaletteTokens(theme: "light" | "dark"): string {
  const blueDark = theme === "dark" ? "#a8aef5" : "#4c56c4";
  return `${hueCustomProperties(theme)} --blue-dark: ${blueDark}; ${semanticAliases()} ${contentCustomProperties(theme)}`;
}

/** Linear zinc shell shared by foundation, Coss overlay, interaction texture, and workbench base. */
export function renderLinearShellTokens(theme: "light" | "dark"): string {
  if (theme === "dark") {
    return [
      "--page: #0f1011; --canvas: #0f1011; --rail: #0f1011;",
      "--paper: #161718; --panel: #161718; --nav-bg: #0f1011;",
      "--ink: #f7f8f8; --text: #f7f8f8; --ink-soft: #d0d1d3;",
      "--muted: #8a8f98; --faint: #737880;",
      "--line: #23252a; --line-strong: #2e3036;",
      "--nav-hover: color-mix(in srgb, var(--ink) 8%, transparent);",
      "--nav-active: color-mix(in srgb, var(--ink) 12%, transparent);",
      "--nav-raised: #1c1c1f;",
      "--blue: #8b93f1; --blue-dark: #a8aef5; --blue-soft: #262848; --focus: #8b93f1;",
      "--action: #f7f8f8; --action-ink: #0f1011;",
    ].join(" ");
  }
  return [
    "--page: #f3f4f5; --canvas: #f3f4f5; --rail: #eceef0;",
    "--paper: #ffffff; --panel: #ffffff; --nav-bg: #f3f4f5;",
    "--ink: #222326; --text: #222326; --ink-soft: #3c3f44;",
    "--muted: #6b6f76; --faint: #737882;",
    "--line: #e2e4e7; --line-strong: #d0d6e0;",
    "--nav-hover: color-mix(in srgb, var(--ink) 6%, transparent);",
    "--nav-active: color-mix(in srgb, var(--ink) 10%, transparent);",
    "--nav-raised: #ffffff;",
    "--blue: #5e6ad2; --blue-dark: #4c56c4; --blue-soft: #eef0fb; --focus: #5e6ad2;",
    "--action: #222326; --action-ink: #ffffff;",
  ].join(" ");
}

export function renderPluginTintBindings(): string {
  return MW_PLUGINS.flatMap((plugin) => {
    const extras = plugin.id === "settings"
      ? ", [data-settings-section=\"project-settings\"], [data-directory-panel=\"project-settings\"]"
      : "";
    return [
      `body.immersive-workbench :is(.plugin-rail [data-plugin-id="${plugin.id}"], [data-plugin-section="${plugin.id}"], [data-directory-panel="${plugin.id}"]${extras}) { --plugin-tint: var(--plugin-${plugin.id}); }`,
      `.mw-catalog [data-plugin-id="${plugin.id}"] { --plugin-tint: var(--plugin-${plugin.id}); }`,
    ];
  }).join("\n  ");
}
