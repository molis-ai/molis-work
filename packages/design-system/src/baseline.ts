import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineErrorCodes } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiFileProblem, UiFileResult, UiFontSchemeFile, UiResourceRegistry, UiSkinFile, UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { fontFaceRules, fontTokenDeclarations, parseFontScheme, parseResourceRegistry, parseSkinFile, parseUiSpecFile, resolveFontScheme, resolveSkin, skinTokenDeclarations, type UiResolvedFont, type UiResolvedSkin } from "@molis-ai/molis-work-plugin-sdk/ui";

// The interface as files (specs/font-and-skin-system/a-section-contract.md §7): every token's value is in `resources/`, read once when this module is
// first imported and through the same SDK parsers an author's skin goes through. `palette.ts`, `typeface.ts` and the token blocks of the styles take
// their values from here and write them back as the text they replaced. There is no second table of them. It reads files, so it is not for a browser bundle
// (no esbuild entry reaches it; the build would fail on `node:fs` if one did).

const baselineErrors = /* @__PURE__ */ defineErrorCodes("ui", { baseline_invalid: "internal" });

/** A broken baseline is a build defect, not a person's data: the Host cannot draw a page without it, so it says which file and which field. */
function invalid(problems: readonly UiFileProblem[]): never {
  throw baselineErrors.baseline_invalid(`界面基线文件有问题：${problems.map(({ file, path, reason }) => `${file} ${path}：${reason}`).join("；")}`);
}

function must<T>(result: UiFileResult<T>): T {
  return result.ok ? result.value : invalid(result.problems);
}

// `src/` and `dist/` are one level below the package root, so this reads the same file when run from source and when built.
const readResource = (path: string): string => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const PACKAGE = "@molis-ai/molis-work-design-system";
const specPath = "resources/ui-spec.json";
const skinPath = "resources/skins/soft-workbench.json";
const fontPath = "resources/fonts/system-sans.json";
const registryPath = "resources/registry.json";
const SPEC: UiSpecFile = must(parseUiSpecFile(readResource(specPath), { file: specPath }));

/** The original parsed files, identified by the same package-relative paths used in the registry. */
export const BASELINE_DEFINITIONS = {
  package: PACKAGE,
  skin: { path: skinPath, definition: must<UiSkinFile>(parseSkinFile(readResource(skinPath), SPEC, { file: skinPath })) },
  font: { path: fontPath, definition: must<UiFontSchemeFile>(parseFontScheme(readResource(fontPath), { file: fontPath })) },
} as const;

/** What ships with the product. */
export const BASELINE_REGISTRY: UiResourceRegistry = must(parseResourceRegistry(readResource(registryPath), { file: registryPath }));
/** Every role, its type and what may vary. */
export const BASELINE_SPEC: UiSpecFile = SPEC;
/** The whole Soft Workbench skin, every role with a value on the axes it has. */
export const BASELINE_SKIN: UiResolvedSkin = must(resolveSkin(SPEC, BASELINE_DEFINITIONS.skin.definition));
/** The whole baseline font scheme. */
export const BASELINE_FONT: UiResolvedFont = must(resolveFontScheme(SPEC, BASELINE_DEFINITIONS.font.definition));
/** The `@font-face` rules of the baseline's faces, with the `src` of each from its row in the registry. */
export const BASELINE_FONT_FACES: string = must(fontFaceRules(BASELINE_FONT, BASELINE_REGISTRY));

type Theme = "light" | "dark";

/** Declarations of a whole spec group or several, in the spec's order, one space between them. */
export function baselineGroups(groups: readonly string[], theme?: Theme): string {
  return skinTokenDeclarations(BASELINE_SKIN, { groups, ...(theme === undefined ? {} : { theme }) });
}

/**
 * The declarations of these roles, in this order, one space between them. A theme's role takes `theme`'s value, `light` being what `:root` holds; a
 * terminal role takes its value with no terminal theme chosen (`unset`).
 */
export function baselineToken(names: string | readonly string[], theme: Theme = "light"): string {
  const list = typeof names === "string" ? [names] : names;
  return list.map((name) => skinTokenDeclarations(BASELINE_SKIN, { theme, terminal: "unset", names: [name] }) || invalid([{ file: "resources/ui-spec.json", path: "$.groups", code: "ui.baseline_invalid", reason: `样式写了 --${name}，基线里没有这个令牌`, fix: "在规格和基线皮肤里加上它，或改样式" }])).join(" ");
}

/** The route of a registered font. The registry is the one place it is written; `tests/ui-resources.test.ts` holds Local Host's route literal to it. */
export function baselineFontRoute(id: string): string {
  return BASELINE_REGISTRY.resources.find((row) => row.id === id)?.route ?? invalid([{ file: "resources/registry.json", path: "$.resources", code: "ui.baseline_invalid", reason: `没有带 route 的资源 ${id}`, fix: "在登记表加这一行" }]);
}

/**
 * Where a file this package registers is on disk, from the row's `path` (relative to the package root): the registry is the one place the path is
 * written, as it is for the route. The same file from source and when built, since `src/` and `dist/` are one level below the root.
 */
export function baselinePackageFile(id: string): string {
  const row = BASELINE_REGISTRY.resources.find((item) => item.id === id && item.package === PACKAGE);
  if (row === undefined) return invalid([{ file: "resources/registry.json", path: "$.resources", code: "ui.baseline_invalid", reason: `本包没有登记资源 ${id}`, fix: "在登记表加这一行" }]);
  return fileURLToPath(new URL(`../${row.path}`, import.meta.url));
}

/** The six terminal tokens of one of its three values, one declaration a line, indented as the foundation's blocks are. */
export function baselineTerminal(axis: "unset" | "light" | "dark"): string {
  return BASELINE_SKIN.roles.filter((role) => role.varies_by === "terminal").map(({ name }) => skinTokenDeclarations(BASELINE_SKIN, { terminal: axis, names: [name] })).join("\n    ");
}

/** The declarations of these font tokens, in this order, one space between them. */
export function baselineFontToken(names: readonly string[]): string {
  return fontTokenDeclarations(BASELINE_FONT, names);
}
