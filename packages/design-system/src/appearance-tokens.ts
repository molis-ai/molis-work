import type { UiDefinitionRef } from "@molis-ai/molis-work-contracts/platform/ui";
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

export function renderFontScope(font: UiResolvedFont, baseline = false): string {
  const names = Object.keys(font.tokens).filter(name => !monoTokens.includes(name));
  const families = [...new Set(font.faces.map(face => face.family))].filter(family => !baselineFamilies.has(family));
  return `${baseline ? ":root, " : ""}${scope("font", font.ref)} { ${fontTokenDeclarations(font, names)} --mw-shipped-families: ${families.map(family => JSON.stringify(family)).join(", ") || "none"}; }`;
}

export function renderMonoScope(font: UiResolvedFont, baseline = false): string {
  return `${baseline ? ":root, " : ""}${scope("mono", font.ref)} { ${fontTokenDeclarations(font, monoTokens)} }`;
}
