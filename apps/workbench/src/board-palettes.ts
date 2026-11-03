import { renderToggleGroup } from "@molis-ai/molis-work-design-system";

/**
 * Palette proposals for review (定样), on the component board only: each one restates the shell tokens the design system's
 * `renderShellTokens` sets, so the whole board — controls, specimens, the bar — is seen in it at once. No large grey: the desk
 * and the washes are tinted toward the palette's hue, the accent is no longer copper, the primary action is the accent's deep
 * shade instead of graphite, and contrast stays readable without being sharp (ink is never pure black, faint text keeps 4.5:1 on
 * the desk). The frames that load the workbench itself (条件与状态, 助理, 插件行) keep the shipped palette.
 */
interface Palette { readonly id: string; readonly label: string; readonly light: string; readonly dark: string }

// Status hues every proposal shares where it has no reason to differ.
const STATUS_LIGHT = "--amber:#94650f;--amber-soft:#f6efdf;--red:#b2454c;--red-soft:#f9eaeb;";
const STATUS_DARK = "--amber:#d8b46e;--amber-soft:#30291a;--red:#ec8a90;--red-soft:#36222a;";

function planes(desk: string, paper: string, soft: string, wash: string, raised: string): string {
  return `--page:${desk};--desk:${desk};--nav-bg:${desk};--canvas:${paper};--paper:${paper};--panel:${paper};--surface:${paper};--surface-soft:${soft};--rail:${wash};--wash:${wash};--nav-raised:${raised};--popover:${raised};`;
}

function type(ink: string, soft: string, muted: string, faint: string, line: string, strong: string): string {
  return `--ink:${ink};--text:${ink};--ink-soft:${soft};--muted:${muted};--faint:${faint};--line:${line};--line-strong:${strong};`;
}

function accent(main: string, strong: string, soft: string, interruption: string, action: string, actionInk: string, actionHover: string): string {
  return `--accent:${main};--accent-strong:${strong};--accent-soft:${soft};--status-interruption:${interruption};--action:${action};--action-ink:${actionInk};--action-hover:${actionHover};`;
}

const PALETTES: readonly Palette[] = [
  {
    id: "mist", label: "雾蓝",
    light: planes("#eef3f7", "#fcfdfe", "#f5f8fb", "#e9f0f6", "#fcfdfe") + type("#1f2b37", "#45525f", "#586574", "#616d7a", "#e0e8ef", "#c9d5e0")
      + accent("#3c6e98", "#2e5778", "#e4eef7", "#6f8aa3", "#2d4f6c", "#ffffff", "#3a6283") + "--green:#3a7a5c;--green-soft:#e4f1ea;" + STATUS_LIGHT
      + "--shadow-color:#1c2a3a;--scrim:rgba(24,38,54,.16);",
    dark: planes("#141a20", "#1b2229", "#1f272f", "#26303a", "#232c35") + type("#e8eef3", "#bac6d1", "#9aa8b5", "#8e9ba8", "#2c3640", "#3f4b57")
      + accent("#8fb8dc", "#b5d1ea", "#1e2d3b", "#8ea6bb", "#dbe6ef", "#17212b", "#f0f5f9") + "--green:#86c0a0;--green-soft:#1a2c24;" + STATUS_DARK,
  },
  {
    id: "celadon", label: "青瓷",
    light: planes("#eef4f2", "#fcfefd", "#f4f8f6", "#e7f0ec", "#fcfefd") + type("#1d2b28", "#44544f", "#566661", "#5e6e69", "#dee8e4", "#c6d6d0")
      + accent("#2f7270", "#23595a", "#e1f0ee", "#6b928d", "#24534f", "#ffffff", "#2f6661") + "--green:#4a7a3a;--green-soft:#ebf3e3;" + STATUS_LIGHT
      + "--shadow-color:#1a2b28;--scrim:rgba(22,40,37,.16);",
    dark: planes("#131a19", "#1a2220", "#1e2725", "#25302d", "#222b29") + type("#e6efec", "#b7c7c2", "#97a8a3", "#8b9c97", "#2b3633", "#3d4b47")
      + accent("#7fc3bd", "#a9dbd5", "#1b302e", "#86a9a4", "#d8e9e5", "#15201e", "#eef6f4") + "--green:#a3c98a;--green-soft:#222e1b;" + STATUS_DARK,
  },
  {
    id: "indigo", label: "靛青",
    light: planes("#f0f1f8", "#fdfdff", "#f6f6fc", "#ebedf7", "#fdfdff") + type("#22243a", "#4a4d66", "#5c5f78", "#64677f", "#e3e4f0", "#cdd0e2")
      + accent("#4f5aa6", "#3d4688", "#eaecf8", "#7c82b0", "#353c78", "#ffffff", "#444c8f") + "--green:#3a7a5c;--green-soft:#e4f1ea;" + STATUS_LIGHT
      + "--shadow-color:#22243a;--scrim:rgba(30,32,56,.16);",
    dark: planes("#15161f", "#1c1d29", "#20222f", "#282a39", "#252737") + type("#eceefa", "#c0c3d9", "#a0a3bc", "#9497b0", "#2e3042", "#424559")
      + accent("#9ea6ec", "#c3c8f5", "#262a48", "#9a9fca", "#e0e3f7", "#1b1d2b", "#f2f3fc") + "--green:#86c0a0;--green-soft:#1a2c24;" + STATUS_DARK,
  },
];

/** The settings sheet restates the tokens on `body.settings-page` as well as `:root`, so each proposal sets both; it comes
 * after that sheet and is at least as specific as each of its light and dark rules. */
export const BOARD_PALETTE_STYLES = PALETTES.map((palette) => {
  const light = `html[data-board-palette="${palette.id}"]`, dark = `${light}[data-resolved-theme="dark"]`;
  return `${light},${light} body{${palette.light}}${dark},${dark} body{${palette.dark}}`;
}).join("");

/** Set before the first paint from `?palette=`, so a reload or a shared link opens in the same proposal. */
export const BOARD_PALETTE_BOOTSTRAP = `(() => { const id = new URLSearchParams(location.search).get("palette"); if (${JSON.stringify(PALETTES.map((palette) => palette.id))}.includes(id)) document.documentElement.dataset.boardPalette = id; })();`;

/** Drawn on 现行; the script marks the proposal the bootstrap applied. */
export function renderBoardPaletteSwitch(): string {
  const group = renderToggleGroup({
    label: "配色（定样）",
    items: [{ id: "current", label: "现行" }, ...PALETTES].map((palette) => ({ value: palette.id, label: palette.label, current: palette.id === "current", attrs: { "data-board-palette-option": palette.id } })),
  });
  return group.replace(/^<(\w+) /, "<$1 data-board-palettes ");
}
