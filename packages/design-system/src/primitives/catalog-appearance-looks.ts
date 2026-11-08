// The looks the board draws its look cards and specimens in (docs/design/appearance-selection/README.md「组件板新增」, FSS-67). None of their
// colours, corners or type is written here: Soft Workbench is the interface's baseline (`baseline.ts`, the files in `resources/`), and a sample look is a
// skin file whose every value names another role of that baseline, read by the SDK's parser and resolved over the baseline by `resolveSkin`, as an author's
// skin is. Folio, the rounded type and every real second look come with batch 16; a look the board is given later is one more `BoardLook` and nothing else.
import { UI_FORMAT_VERSIONS } from "@molis-ai/molis-work-contracts/platform/ui";
import type { UiSkinFile, UiTokenValue } from "@molis-ai/molis-work-contracts/platform/ui";
import { fontTokenDeclarations, parseSkinFile, resolveSkin, skinTokenDeclarations, type UiResolvedFont, type UiResolvedSkin } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BASELINE_FONT, BASELINE_SKIN, BASELINE_SPEC } from "../baseline.js";

export type LookTheme = "light" | "dark";
const THEMES: readonly LookTheme[] = ["light", "dark"];

/** A look as the board draws it. `name` and `by` are the board's words (a look's name is content), as the sample text on a specimen is. */
export interface BoardLook {
  readonly id: string;
  readonly skin: UiResolvedSkin;
  readonly font: UiResolvedFont;
  readonly name: string;
  readonly by: string;
}

/** What a sample look re-points: the paint (colours, written for both themes) and the corners (shared). Each value is another baseline role. */
interface SampleRecipe {
  readonly id: string;
  readonly paint: Readonly<Record<string, string>>;
  readonly corners: Readonly<Record<string, string>>;
}

const SAMPLES: readonly SampleRecipe[] = [
  { id: "teal", paint: { page: "hue-cyan-soft", accent: "hue-cyan", "accent-strong": "hue-cyan", "accent-soft": "hue-cyan-soft", action: "hue-cyan", "action-hover": "hue-steel" }, corners: { "r-card": "r-dialog", "r-control": "r-row" } },
  { id: "warm", paint: { page: "hue-orange-soft", accent: "hue-orange", "accent-strong": "hue-brown", "accent-soft": "hue-orange-soft", action: "hue-brown", "action-hover": "hue-orange" }, corners: { "r-card": "r-row", "r-control": "r-tag" } },
];

/** A resolved baseline writes every role, so it is also what its file said: the file a sample is resolved over. */
const BASELINE_FILE: UiSkinFile = {
  format_version: UI_FORMAT_VERSIONS.skin,
  id: BASELINE_SKIN.ref.id,
  revision: BASELINE_SKIN.ref.revision,
  spec: BASELINE_SKIN.spec,
  name: BASELINE_SKIN.name,
  recommended_font: BASELINE_SKIN.recommended_font,
  light: BASELINE_SKIN.light,
  dark: BASELINE_SKIN.dark,
  shared: BASELINE_SKIN.shared,
  terminal: BASELINE_SKIN.terminal,
};

const reference = (roles: Readonly<Record<string, string>>): Readonly<Record<string, UiTokenValue>> =>
  Object.fromEntries(Object.entries(roles).map(([name, role]) => [name, { role }]));

/** A sample is a build defect when it does not parse or resolve: the board is a development page, and says which file and field. */
function sampleSkin({ id, paint, corners }: SampleRecipe): UiResolvedSkin {
  const file = `board/sample-${id}.json`;
  const source = JSON.stringify({
    format_version: UI_FORMAT_VERSIONS.skin,
    id: `sample-${id}`,
    revision: 1,
    spec: { id: BASELINE_SPEC.id, revision: BASELINE_SPEC.revision },
    name: { literal: id },
    recommended_font: BASELINE_SKIN.recommended_font,
    light: reference(paint),
    dark: reference(paint),
    shared: reference(corners),
    terminal: {},
  });
  const parsed = parseSkinFile(source, BASELINE_SPEC, { file });
  const resolved = parsed.ok ? resolveSkin(BASELINE_SPEC, BASELINE_FILE, parsed.value) : parsed;
  if (!resolved.ok) throw new Error(`组件板的示例外观有问题：${resolved.problems.map((problem) => `${problem.file} ${problem.path}：${problem.reason}`).join("；")}`);
  return resolved.value;
}

const sample = (id: string): UiResolvedSkin => sampleSkin(SAMPLES.find((recipe) => recipe.id === id)!);

export const SOFT_LOOK: BoardLook = { id: "soft", skin: BASELINE_SKIN, font: BASELINE_FONT, name: "Soft Workbench", by: "内置" };
export const TEAL_LOOK: BoardLook = { id: "teal", skin: sample("teal"), font: BASELINE_FONT, name: "蓝绿工作台", by: "我的方案" };
export const WARM_LOOK: BoardLook = { id: "warm", skin: sample("warm"), font: BASELINE_FONT, name: "暖色草稿", by: "我的方案" };
export const BOARD_LOOKS: readonly BoardLook[] = [SOFT_LOOK, TEAL_LOOK, WARM_LOOK];

/** The recommended font's name as the board says it: the baseline font is the system sans. */
export const BASELINE_FONT_NAME = "系统无衬线";

/**
 * The selectors that give an element a look's tokens in a theme. An element with no `data-look-theme` wears the page's theme and the page itself may wear
 * the look (`<html data-look>`); one with `data-look-theme` keeps that theme whatever the page does. `look` null is every look. The page's own layers
 * write the shell tokens again on its body (`body.immersive-workbench`, `:root, body…`), so a page that wears a look gives them to its body too.
 */
export function lookScope(look: string | null, theme: LookTheme): string {
  const is = look === null ? "[data-look]" : `[data-look="${look}"]`;
  const dark = ":root[data-resolved-theme=\"dark\"]";
  return theme === "light"
    ? `${is}:not([data-look-theme]), ${is}[data-look-theme="light"], html${is}:not([data-look-theme]) > body`
    : `${dark} ${is}:not([data-look-theme]), ${dark}${is}:not([data-look-theme]), ${is}[data-look-theme="dark"], ${dark}${is}:not([data-look-theme]) > body`;
}

/** The structural layers write these roles as a reference to another role (`--desk: var(--page)`); an element that re-skins itself writes them again, for the reference is read where it is declared. */
const aliasDeclarations = (): string => BASELINE_SPEC.groups.flatMap((group) => group.roles).flatMap((role) => (role.alias_of === undefined ? [] : [`--${role.name}: var(--${role.alias_of});`])).join(" ");

/** What a look says differently from the baseline in a theme, role by role. */
const differences = (look: BoardLook, theme: LookTheme): string => [
  ...look.skin.roles.flatMap(({ name }) => {
    const mine = skinTokenDeclarations(look.skin, { theme, names: [name] });
    return mine === skinTokenDeclarations(BASELINE_SKIN, { theme, names: [name] }) ? [] : [mine];
  }),
  ...Object.keys(look.font.tokens).flatMap((name) => {
    const mine = fontTokenDeclarations(look.font, [name]);
    return mine === fontTokenDeclarations(BASELINE_FONT, [name]) ? [] : [mine];
  }),
].join(" ");

/**
 * Every token a look sets, as the rules that give them to `[data-look]`. The baseline is written whole once for each theme and each other look writes only
 * what differs from it, after: the board does not carry the same five kilobytes for each look.
 */
export function lookRules(looks: readonly BoardLook[] = BOARD_LOOKS): string {
  const whole = THEMES.map((theme) => `${lookScope(null, theme)} { color-scheme: ${theme}; ${skinTokenDeclarations(BASELINE_SKIN, { theme })} ${aliasDeclarations()} ${fontTokenDeclarations(BASELINE_FONT)} }`);
  const own = looks.flatMap((look) => THEMES.flatMap((theme) => {
    const css = differences(look, theme);
    return css === "" ? [] : [`${lookScope(look.id, theme)} { ${css} }`];
  }));
  return [...whole, ...own].join("\n  ");
}
