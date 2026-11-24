import type { UiDefinitionRef, UiResourceRegistry } from "@molis-ai/molis-work-contracts/platform/ui";
import { fontTokenDeclarations, skinTokenDeclarations, type UiResolvedFont, type UiResolvedSkin } from "@molis-ai/molis-work-plugin-sdk/ui";
import { BASELINE_FONT, BASELINE_SPEC } from "./baseline.js";

const scope = (axis: "skin" | "font" | "mono", ref: UiDefinitionRef): string => `[data-ui-${axis}="${ref.id}@${ref.revision}"]`;
const rootDark = ':root[data-resolved-theme="dark"]';
const monoTokens = Object.values(BASELINE_SPEC.font_roles.find(role => role.name === "code")!.tokens);
const roles = BASELINE_SPEC.groups.flatMap(group => group.roles);
const skinTokens = roles.filter(role => role.alias_of === undefined).map(role => role.name);
const themeTokens = roles.filter(role => role.varies_by === "theme" && role.alias_of === undefined).map(role => role.name);
const skinAliases = roles.flatMap(role => role.alias_of === undefined ? [] : [`--${role.name}: var(--${role.alias_of});`]).join(" ");
const baselineFamilies = new Set(BASELINE_FONT.faces.map(face => face.family));

/** One set of inherited tokens for the page and each isolated proof or recovery surface. */
export function renderSkinScope(skin: UiResolvedSkin, baseline = false): string {
  const target = scope("skin", skin.ref);
  return `
  ${baseline ? ":root, " : ""}${target} { color-scheme: light; ${skinTokenDeclarations(skin, { theme: "light", terminal: baseline ? "unset" : undefined, names: skinTokens })} ${skinAliases} }
  ${baseline ? `${rootDark}, ` : ""}${target}[data-resolved-theme="dark"], ${rootDark} ${target}:not([data-resolved-theme="light"]) { color-scheme: dark; ${skinTokenDeclarations(skin, { theme: "dark", names: themeTokens })} }
  `;
}

const JA_SANS = '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Yu Gothic", "Meiryo", "Noto Sans JP"';
const JA_ROUNDED = '"Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", "Noto Sans JP"';
const JA_SERIF = '"Hiragino Mincho ProN", "Yu Mincho", "YuMincho", "Noto Serif JP"';

function jaFontOverrides(font: UiResolvedFont): string {
  const decls: string[] = [];
  for (const [name, value] of Object.entries(font.tokens)) {
    if (monoTokens.includes(name) || typeof value !== "string") continue;
    if (value.includes('"Molis Folio Rounded SC"')) decls.push(`--${name}: ${value.replace('"Molis Folio Rounded SC"', `${JA_ROUNDED}, "Molis Folio Rounded SC"`)};`);
    else if (value.includes('"Noto Sans SC"')) decls.push(`--${name}: ${value.replace('"Noto Sans SC"', `${JA_SANS}, "Noto Sans SC"`)};`);
    else if (value.includes('"Songti SC"')) decls.push(`--${name}: ${value.replace('"Songti SC"', `${JA_SERIF}, "Songti SC"`)};`);
  }
  return decls.join(" ");
}

export function renderFontScope(font: UiResolvedFont, baseline = false): string {
  const names = Object.keys(font.tokens).filter(name => !monoTokens.includes(name));
  const families = [...new Set(font.faces.map(face => face.family))].filter(family => !baselineFamilies.has(family));
  const target = scope("font", font.ref);
  const ja = jaFontOverrides(font);
  const jaRule = ja ? `\n${baseline ? ":root:lang(ja), " : ""}${target}:lang(ja) { ${ja} }` : "";
  return `${baseline ? ":root, " : ""}${target} { ${fontTokenDeclarations(font, names)} --mw-shipped-families: ${families.map(family => JSON.stringify(family)).join(", ") || "none"}; }${jaRule}`;
}

export function renderMonoScope(font: UiResolvedFont, baseline = false): string {
  return `${baseline ? ":root, " : ""}${scope("mono", font.ref)} { ${fontTokenDeclarations(font, monoTokens)} }`;
}

const compactDecls = (decls: string): string => decls
  .split(";")
  .map(entry => entry.trim())
  .filter(Boolean)
  .map(entry => {
    const colon = entry.indexOf(":");
    if (colon < 0) return entry;
    const value = entry
      .slice(colon + 1)
      .trim()
      .replace(/,\s+/g, ",")
      .replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/gi, "#$1$2$3");
    return `${entry.slice(0, colon).trim()}:${value}`;
  })
  .join(";");

const compactSkinAliases = roles.flatMap(role => role.alias_of === undefined ? [] : [`--${role.name}:var(--${role.alias_of})`]).join(";");

/** Root-only baseline skin tokens for isolated plugin frames (no catalog proof selectors, dark emits only theme-differing tokens). */
export function renderRootSkinScope(skin: UiResolvedSkin): string {
  const darkNames = themeTokens.filter(name => JSON.stringify(skin.dark[name]) !== JSON.stringify(skin.light[name]));
  const light = compactDecls(skinTokenDeclarations(skin, { theme: "light", terminal: "unset", names: skinTokens }));
  const dark = compactDecls(skinTokenDeclarations(skin, { theme: "dark", names: darkNames }));
  return `:root{color-scheme:light;${light};${compactSkinAliases}}
${rootDark}{color-scheme:dark;${dark}}`;
}

/** Root-only baseline proportional and monospace font tokens in one :root block for isolated plugin frames. */
export function renderRootTypeTokens(font: UiResolvedFont): string {
  const names = Object.keys(font.tokens).filter(name => !monoTokens.includes(name));
  const families = [...new Set(font.faces.map(face => face.family))].filter(family => !baselineFamilies.has(family));
  const shipped = families.map(family => JSON.stringify(family)).join(",") || "none";
  const fontValue = typeof font.tokens.font === "string" ? font.tokens.font : "";
  const marker = '"Noto Sans SC"';
  const splitAt = fontValue.indexOf(marker);
  if (splitAt > 0 && names.includes("font")) {
    const prefix = fontValue.slice(0, splitAt).replace(/,\s*$/u, "");
    const tail = fontValue.slice(splitAt);
    const otherNames = names.filter(name => name !== "font");
    const rootFont = compactDecls(`--mw-f:${tail};--font:${prefix},var(--mw-f);${fontTokenDeclarations(font, otherNames)};${fontTokenDeclarations(font, monoTokens)};--mw-shipped-families:${shipped}`);
    const jaFont = compactDecls(`--font:${prefix},${JA_SANS},var(--mw-f)`);
    return `:root{${rootFont}}\n:root:lang(ja){${jaFont}}`;
  }
  const ja = compactDecls(jaFontOverrides(font));
  return `:root{${compactDecls(fontTokenDeclarations(font, names))};${compactDecls(fontTokenDeclarations(font, monoTokens))};--mw-shipped-families:${shipped}}${ja ? `\n:root:lang(ja){${ja}}` : ""}`;
}

const FONT_FORMATS: Readonly<Record<string, string>> = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };

/** Compact `@font-face` rules for isolated plugin frames (omits default `font-style: normal` and range spaces). */
export function renderRootFontFaces(font: UiResolvedFont, registry: UiResourceRegistry): string {
  return font.faces.flatMap(face => {
    const row = registry.resources.find(candidate => candidate.id === face.resource);
    if (row?.kind !== "font" || row.route === undefined) return [];
    const format = FONT_FORMATS[row.route.slice(row.route.lastIndexOf(".") + 1)];
    const weight = typeof face.weight === "number" ? String(face.weight) : face.weight.join(" ");
    return [`@font-face{font-family:"${face.family}";font-display:swap;font-weight:${weight};src:url(${row.route})${format ? ` format("${format}")` : ""};unicode-range:${face.unicode_range.join(",")}}`];
  }).join("");
}

/** Compact root-only custom-property declarations for terminal scopes inside isolated plugin frames. */
export function compactTokenDeclarations(declarations: string): string {
  return compactDecls(declarations);
}
