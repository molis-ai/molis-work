import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { UiAppearanceSelection, UiAppearanceView, UiDefinitionRef, UiEnvironmentProblem, UiFileResult, UiResourceRow, UiSkinFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { BASELINE_FONT, BASELINE_REGISTRY, BASELINE_SKIN, BASELINE_SPEC, baselinePackageFile } from "@molis-ai/molis-work-design-system";
import { fontFaceRules, parseFontScheme, parseSkinFile, resolveFontScheme, resolveSkin, type UiResolvedFont, type UiResolvedSkin } from "@molis-ai/molis-work-plugin-sdk/ui";
import { appearanceErrors } from "./errors.js";

const refOf = ({ id, revision }: UiDefinitionRef): UiDefinitionRef => ({ id, revision });
const identity = ({ id, revision }: UiDefinitionRef): string => `${id}@${revision}`;

const baselineSelection: UiAppearanceSelection = {
  skin: BASELINE_SKIN.ref, font: { policy: "follow-skin" }, mono: null,
};

export interface ResolvedAppearance {
  readonly definition: UiSkinFile;
  readonly skin: UiResolvedSkin;
  readonly font: UiResolvedFont;
  readonly mono: UiResolvedFont;
}

function recordProblems<T>(result: UiFileResult<T>, subject: string, problems: UiEnvironmentProblem[]): T | undefined {
  if (result.ok) return result.value;
  for (const { code, path, reason } of result.problems) problems.push({ code, subject, detail: `${path} ${reason}` });
  return undefined;
}

function readRegisteredDefinitions<T extends UiDefinitionRef>(kind: "skin" | "font-scheme",
  parse: (source: string, row: UiResourceRow) => UiFileResult<T>, problems: UiEnvironmentProblem[]): Map<string, T> {
  const definitions = new Map<string, T>();
  const ambiguous = new Set<string>();
  for (const row of BASELINE_REGISTRY.resources) {
    if (row.kind !== kind) continue;
    let source: string;
    try { source = readFileSync(baselinePackageFile(row.id), "utf8"); }
    catch {
      problems.push({ code: "appearance.definition_unreadable", subject: row.id });
      continue;
    }
    const file = recordProblems(parse(source, row), row.id, problems);
    if (!file) continue;
    const key = identity(file);
    if (definitions.has(key) || ambiguous.has(key)) {
      problems.push({ code: "appearance.definition_ambiguous", subject: key });
      ambiguous.add(key);
      definitions.delete(key);
    } else definitions.set(key, file);
  }
  return definitions;
}

/** Binaries already have a digest in the package registry. Check each referenced file once, without reading anything from a Home. */
function validateFontResources(resources: readonly string[], verified: Map<string, boolean>, problems: UiEnvironmentProblem[]): boolean {
  for (const resource of resources) {
    if (verified.has(resource)) continue;
    const row = BASELINE_REGISTRY.resources.find(candidate => candidate.id === resource);
    let valid = false;
    if (row?.kind === "font") {
      try { valid = createHash("sha256").update(readFileSync(baselinePackageFile(resource))).digest("hex") === row.sha256; }
      catch { /* The installation has no usable file at the registered location. */ }
    }
    verified.set(resource, valid);
    if (!valid) problems.push({ code: "appearance.font_resource_invalid", subject: resource });
  }
  return resources.every(resource => verified.get(resource));
}

function loadBuiltins() {
  const problems: UiEnvironmentProblem[] = [];
  const skinFiles = readRegisteredDefinitions("skin", (source, row) => parseSkinFile(source, BASELINE_SPEC, { file: row.path }), problems);
  const fontFiles = readRegisteredDefinitions("font-scheme", (source, row) => parseFontScheme(source, { file: row.path }), problems);
  const baselineSkin = skinFiles.get(identity(BASELINE_SKIN.ref)), baselineFont = fontFiles.get(identity(BASELINE_FONT.ref));
  if (!baselineSkin || !baselineFont) throw appearanceErrors.baseline_unavailable("发行物的外观基线无法读取。", { problems });

  const verified = new Map<string, boolean>();
  const fonts = new Map([...fontFiles].flatMap(([key, file]) => {
    const resolved = file === baselineFont ? BASELINE_FONT : recordProblems(resolveFontScheme(BASELINE_SPEC, baselineFont, file), key, problems);
    if (!resolved || recordProblems(fontFaceRules(resolved, BASELINE_REGISTRY), key, problems) === undefined) return [];
    return validateFontResources(resolved.faces.map(face => face.resource), verified, problems) ? [[key, resolved] as const] : [];
  }));
  const skins = new Map([...skinFiles].flatMap(([key, file]) => {
    const resolved = file === baselineSkin ? BASELINE_SKIN : recordProblems(resolveSkin(BASELINE_SPEC, baselineSkin, file), key, problems);
    if (!resolved) return [];
    if (!fonts.has(identity(file.recommended_font))) {
      problems.push({ code: "appearance.recommended_font_unavailable", subject: key, detail: identity(file.recommended_font) });
      return [];
    }
    return [[key, { definition: file, skin: resolved }] as const];
  }));
  const builtins: UiAppearanceView["builtins"] = {
    skins: [...skins.values()].map(({ definition }) => ({ ref: refOf(definition), name: definition.name, recommended_font: definition.recommended_font })),
    fonts: [...fonts.values()].map(({ ref, name }) => ({ ref, name })),
  };
  const baseline: ResolvedAppearance = { definition: baselineSkin, skin: BASELINE_SKIN, font: BASELINE_FONT, mono: BASELINE_FONT };

  return {
    baselineSelection, baseline, builtins, problems,
    resolve(selection: UiAppearanceSelection): { appearance?: ResolvedAppearance; problems: readonly UiEnvironmentProblem[] } {
      const skin = skins.get(identity(selection.skin));
      const fontRef = selection.font.policy === "pinned" ? selection.font.scheme : skin?.definition.recommended_font;
      const font = fontRef && fonts.get(identity(fontRef));
      const mono = selection.mono ? fonts.get(identity(selection.mono)) : font;
      if (skin && font && mono) return { appearance: { ...skin, font, mono }, problems: [] };
      const issues: UiEnvironmentProblem[] = [];
      if (!skin) issues.push({ code: "appearance.skin_unavailable", subject: identity(selection.skin) });
      if (!font && fontRef) issues.push({ code: "appearance.font_unavailable", subject: identity(fontRef) });
      if (!mono && selection.mono) issues.push({ code: "appearance.mono_unavailable", subject: identity(selection.mono) });
      return { problems: issues };
    },
  };
}

/** The checked definitions belong to the immutable installation. Selection and remembered language belong to the Home. */
let builtins: ReturnType<typeof loadBuiltins> | undefined;
export const builtinAppearance = () => builtins ??= loadBuiltins();
