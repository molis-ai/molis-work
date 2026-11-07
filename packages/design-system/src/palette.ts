import { baselineGroups } from "./baseline.js";

/** Hue ramps: text for 13px copy, fill for 6–8px marks, soft for 11% washes. Plugin identity and status only;
 * Content family is the DropAgent reading-surface set: warm paper + five type marks, no green.
 * Their values are in `resources/skins/soft-workbench.json`; these lists name them for the component board. */

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
}

export interface MwContentMark {
  id: MwContentMarkId;
  label: string;
  role: string;
}

export const MW_HUES: readonly MwHueSwatch[] = [
  { id: "gray", label: "Gray", role: "闲置 / Home" },
  { id: "brown", label: "Brown", role: "Feed" },
  { id: "orange", label: "Orange", role: "注意" },
  { id: "yellow", label: "Yellow", role: "标记" },
  { id: "green", label: "Green", role: "完成" },
  { id: "mint", label: "Mint", role: "Inbox" },
  { id: "cyan", label: "Cyan", role: "等待他人" },
  { id: "blue", label: "Blue", role: "Goals" },
  { id: "indigo", label: "Indigo", role: "accent / 进行中" },
  { id: "purple", label: "Purple", role: "Sessions" },
  { id: "pink", label: "Pink", role: "Artifacts" },
  { id: "red", label: "Red", role: "阻塞 / 危险" },
  { id: "steel", label: "Steel", role: "设置" },
  { id: "slate", label: "Slate", role: "Shelf 主操作" },
] as const;

export const MW_SURFACES = [
  { token: "--page", label: "Desk", role: "雾蓝桌面" },
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
  { token: "--action", label: "Ink blue", role: "主操作 · 选中" },
  { token: "--action-ink", label: "On action", role: "主操作上的字" },
  { token: "--accent", label: "Mist blue", role: "焦点 · 链接 · 进行中" },
  { token: "--accent-soft", label: "Mist wash", role: "引用 · 高亮" },
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

export const MW_CONTENT_SURFACES = [
  { token: "--content-side", label: "Side", role: "内容栏" },
  { token: "--content-paper", label: "Paper", role: "阅读面" },
  { token: "--content-ink", label: "Ink", role: "正文" },
  { token: "--content-muted", label: "Muted", role: "说明" },
  { token: "--content-line", label: "Line", role: "发丝" },
  { token: "--content-accent", label: "Action", role: "主操作（墨蓝）" },
  { token: "--content-select", label: "Select", role: "选中" },
] as const;

/** File/action marks on the reading surface. Ink for 16px glyphs, fill for chips. No green. */
export const MW_CONTENT_MARKS: readonly MwContentMark[] = [
  { id: "slate", label: "钢蓝", role: "文稿 / 网页" },
  { id: "blue", label: "雾青", role: "代码 / 链接" },
  { id: "ochre", label: "麦色", role: "文件夹" },
  { id: "plum", label: "灰紫", role: "图片 / 对话" },
  { id: "clay", label: "陶土", role: "PDF / 错误" },
] as const;

/**
 * Hue ramps, status tones and the reading surface. The reading surface is the same Soft Workbench family, not a second skin: Shelf and other reading
 * islands alias the shell tokens through `--content-*` (and Shelf through `--da-*`). Only the terminal canvas keeps values of its own.
 */
export function renderPaletteTokens(theme: "light" | "dark"): string {
  return baselineGroups(["hue", "tone", "content", "mark"], theme);
}

/**
 * Soft Workbench shell: one source for every layer's base tokens — surfaces, type tones,
 * status, the mist-blue accent, depth, corners, motion and focus. Foundation, the Coss
 * overlay, the interaction texture and the workbench base all call this instead of
 * restating values, so no later layer quietly wins with a different number. The values are in `resources/skins/soft-workbench.json`.
 *
 * Surfaces: a mist desk tinted toward the accent's blue (`--page`/`--desk`), never a large grey, the continuous near-white work
 * surface (`--paper`, and `--canvas`
 * for full-pane canvases inside it),
 * a warmer inner block and plugin directory columns (`--surface-soft`), chrome bars on the desk
 * (`--nav-bg`) and a wash for local groups (`--rail`).
 * The primary action is the accent's deep shade (ink blue); the accent marks focus, links, selection details and work in
 * progress. Every text tone keeps 4.5:1 on the desk and its wash. `--blue*` are the accent under their historical names.
 * Dark reads as three layers at a glance: the desk, the work surface a step up, floating things a step above it.
 */
export function renderShellTokens(theme: "light" | "dark"): string {
  return baselineGroups(["shell"], theme);
}

/**
 * Control metrics. Declared only by the early layers (foundation, the Coss overlay, the workbench base) so
 * density and touch rules later in the cascade — 28px compact, 44px on phones and coarse pointers — win.
 */
export function renderControlMetrics(): string {
  return baselineGroups(["control"]);
}

/** Theme-independent shape, motion and focus. Safe to restate in late layers: it carries no metrics. */
export function renderShapeTokens(): string {
  return baselineGroups(["shape"]);
}

/**
 * Plugins carry no identity colour on screen: the Soft Workbench keeps colour for status and selection, and a plugin is recognised by
 * its glyph, its name and where it sits. Wherever the shell draws a plugin (its rail and island entry, directory section, market
 * card, work surface, tab) `--plugin-tint` is the neutral secondary ink, the same for every plugin. The rule names no plugin:
 * a plugin built later, by anyone, is drawn the same way (W5-02 PR-D, PG-075). The one exception is the tab strip, where a plugin's
 * group takes the `hue` its Manifest declares.
 */
export function renderPluginTintBindings(): string {
  const surfaces = [
    ".plugin-rail [data-plugin-id]", "[data-plugin-section]", "[data-directory-panel]",
    "[data-market-plugin]", "[data-market-focus]", "[data-work-surface]", "[data-goal-canvas-shell]", ".tab-item[data-plugin]",
    "[data-settings-section=\"project-settings\"]",
  ];
  return [
    `body.immersive-workbench :is(${surfaces.join(", ")}) { --plugin-tint: var(--ink-soft); }`,
    ".mw-catalog [data-plugin-id] { --plugin-tint: var(--ink-soft); }",
  ].join("\n  ");
}
