// FSS-46, the type half: compiled by tests/ui-text-files-contract.test.ts the way an author's package is, which also imports the samples
// to hold them against the current format constants. Tests are not type-checked otherwise. Each line ending with a "rejects" comment has
// to be refused with those words, and no other line may have an error. The values come from today's tokens (packages/design-system).
import {
  UI_FORMAT_VERSIONS,
  type OwnedTextRef,
  type TextArgValue,
  type UiEnvironmentSnapshot,
  type UiFileResult,
  type UiFontRole,
  type UiFontSchemeFile,
  type UiFormatTool,
  type UiLocalePack,
  type UiMessage,
  type UiResourceRegistry,
  type UiResourceRow,
  type UiRoleSpec,
  type UiSayTool,
  type UiSkinFile,
  type UiSpecFile,
  type UiTextProvider,
  type UiTextTool,
  type UiTokenValue,
} from "@molis-ai/molis-work-contracts/platform/ui";

const SPEC_REF = { id: "molis-interface", revision: 1 };
const BASELINE_SKIN = { id: "soft-workbench", revision: 1 };
const BASELINE_FONT = { id: "system-sans", revision: 1 };

export const SPEC: UiSpecFile = {
  format_version: UI_FORMAT_VERSIONS.spec,
  id: "molis-interface",
  revision: 1,
  baseline_skin: BASELINE_SKIN,
  baseline_font: BASELINE_FONT,
  groups: [
    { group: "shell", roles: [
      { name: "page", type: "color", varies_by: "theme" },
      { name: "nav-bg", type: "color", varies_by: "theme", follows: "page" },
      { name: "desk", type: "color", varies_by: "theme", alias_of: "page" },
      { name: "shadow-soft", type: "shadow", varies_by: "theme" },
      { name: "terminal", type: "color", varies_by: "terminal" },
    ] },
    { group: "shape", roles: [
      { name: "radius-item", type: "length", varies_by: "none" },
      { name: "dur-hover", type: "duration", varies_by: "none" },
      { name: "ease-quint", type: "easing", varies_by: "none" },
      { name: "focus-stroke", type: "stroke", varies_by: "none", locked: { stroke: { width_px: 2, style: "solid", role: "focus-ring" } } },
      { name: "code-tab", type: "number", varies_by: "none", locked: { number: 4 } },
    ] },
  ],
  font_roles: [
    { name: "body", tokens: { family: "font", weight: "weight-body", tracking: "tracking-body" } },
    { name: "control", tokens: { weight: "weight-control" } },
    { name: "title", tokens: { weight: "weight-title", tracking: "tracking-title" } },
    { name: "display", tokens: { tracking: "tracking-display" } },
    { name: "reading", tokens: { size: "type-reading-size", line_height: "type-reading-line-height" } },
    { name: "note", tokens: {} },
    { name: "code", tokens: { family: "font-mono" } },
  ],
  components: [{ kind: "card", catalog: "Card", name: { literal: "卡片" }, description: { literal: "一张卡片" },
    group: "版面", use: "part", intents: ["reading"], data: "value", icon: "grid" }],
};

export const SKIN: UiSkinFile = {
  format_version: UI_FORMAT_VERSIONS.skin,
  id: "soft-workbench",
  revision: 1,
  spec: SPEC_REF,
  name: { key: "workbench.skin.soft-workbench", fallback: "Soft Workbench" },
  recommended_font: BASELINE_FONT,
  light: {
    page: "#eef3f7",
    "edge-highlight": "transparent",
    "content-tty": "#1E1E1E",
    scrim: { rgba: [24, 38, 54, 0.16] },
    "nav-hover": { mix: { role: "ink", percent: 5, with: "transparent" } },
    "shadow-soft": { shadow: [{ x: 0, y: 1, blur: 2, color: { rgba: [28, 42, 58, 0.05] } }, { x: 0, y: 4, blur: 12, spread: -4, color: { rgba: [28, 42, 58, 0.08] } }] },
  },
  dark: {
    page: "#141a20",
    scrim: { rgba: [0, 0, 0, 0.5] },
    "nav-hover": { mix: { role: "ink", percent: 7, with: "transparent" } },
    "shadow-soft": { shadow: [{ x: 0, y: 0, blur: 0, spread: 1, color: { role: "edge-highlight" } }, { x: 0, y: 1, blur: 2, color: "#000000" }] },
  },
  shared: {
    blue: { role: "accent" },
    "celebrate-a": { role: "hue-green-fill", fallback: "#4cb782" },
    "radius-item": { px: 8 },
    "dur-hover": { ms: 130 },
    "ease-quint": { bezier: [0.22, 1, 0.36, 1] },
  },
  terminal: { unset: { terminal: "#171719" }, light: { terminal: "#f7f7f8" }, dark: { terminal: "#171719" } },
};

// A skin a person made: a literal name, and every role but one left to `follows` and the baseline.
export const MINIMAL_SKIN: UiSkinFile = { format_version: UI_FORMAT_VERSIONS.skin, id: "folio", revision: 3, spec: SPEC_REF, name: { literal: "我的皮肤" }, recommended_font: BASELINE_FONT, light: { page: "#faf7f2" }, dark: {}, shared: {}, terminal: {} };

const NO_FONT_SET: UiFontRole = {};
export const FONT_SCHEME: UiFontSchemeFile = {
  format_version: UI_FORMAT_VERSIONS.font,
  id: "system-sans",
  revision: 1,
  name: { key: "workbench.font.system-sans" },
  roles: {
    body: { families: [{ system: "-apple-system" }, { system: "Segoe UI Variable Text" }, { system: "PingFang SC" }, { face: "Inter Variable" }, { system: "system-ui" }, { system: "sans-serif" }], weight: 400, tracking_em: -0.011 },
    control: { weight: 500 },
    title: { weight: 600, tracking_em: -0.02 },
    display: NO_FONT_SET,
    reading: { size_px: 15, line_height: 1.65 },
    note: NO_FONT_SET,
    code: { families: [{ system: "ui-monospace" }, { system: "SF Mono" }, { system: "monospace" }] },
  },
  faces: [
    { family: "Inter Variable", weight: [100, 900], unicode_range: ["U+0000-00FF", "U+0131", "U+2000-206F"], resource: "font.inter-latin-variable" },
    { family: "Noto Sans SC", weight: 400, unicode_range: ["U+2E80-2EFF", "U+4E00-9FFF", "U+FF00-FFEF"], resource: "font.noto-sans-sc-400" },
  ],
};

export const LOCALE_EN: UiLocalePack = {
  format_version: UI_FORMAT_VERSIONS.locale,
  owner: "io.molis.work.example.notes",
  locale: "en",
  messages: {
    "notes.main.title": "Notes",
    "notes.main.saved": { plural_arg: "count", forms: { one: "{count} note saved", other: "{count} notes saved" } },
  },
};
export const LOCALE_ZH: UiLocalePack = { format_version: UI_FORMAT_VERSIONS.locale, owner: "workbench", locale: "zh-CN", direction: "ltr", revision: 2, messages: { "common.copy": "复制" } };

const LICENSE = { spdx: "OFL-1.1", source: "https://github.com/rsms/inter", notice_path: "fonts/OFL.txt" };
const IN_DESIGN_SYSTEM = { owner: "design-system", package: "@molis-ai/molis-work-design-system" };
export const REGISTRY: UiResourceRegistry = {
  format_version: UI_FORMAT_VERSIONS.registry,
  resources: [
    { id: "spec.molis-interface", kind: "spec", ...IN_DESIGN_SYSTEM, path: "resources/ui-spec.json", load: "startup" },
    { id: "skin.soft-workbench", kind: "skin", ...IN_DESIGN_SYSTEM, path: "resources/skins/soft-workbench.json", load: "startup" },
    { id: "font-scheme.system-sans", kind: "font-scheme", ...IN_DESIGN_SYSTEM, path: "resources/fonts/system-sans.json", load: "first-screen" },
    { id: "locale.workbench", kind: "locale", owner: "workbench", package: "@molis-ai/molis-work-workbench", path: "resources/locales", load: "tool" },
    { id: "font.inter-latin-variable", kind: "font", ...IN_DESIGN_SYSTEM, path: "fonts/inter-latin-variable.woff2", load: "first-screen", route: "/assets/inter-latin-variable.woff2", sha256: "0".repeat(64), license: LICENSE },
    { id: "font.noto-sans-sc-400", kind: "font", ...IN_DESIGN_SYSTEM, path: "fonts/noto-sans-sc-400.woff2", load: "fallback", route: "/assets/noto-sans-sc-400.woff2", sha256: "1".repeat(64), license: { spdx: "OFL-1.1", source: "https://github.com/notofonts/noto-cjk" } },
    { id: "asset.folio-paper", kind: "asset", ...IN_DESIGN_SYSTEM, path: "assets/folio-paper.png", load: "on-select", sha256: "2".repeat(64), license: LICENSE },
  ],
};

const IDENTITIES = { spec: SPEC_REF, skin: BASELINE_SKIN, font: { scheme: BASELINE_FONT, policy: "follow-skin", mono: { id: "system-mono", revision: 1 } } } as const;
export const SERVER_SNAPSHOT: UiEnvironmentSnapshot = { revision: "molis-interface.1/soft-workbench.1/system-sans.1/system-mono.1/zh-CN", ...IDENTITIES, locale: { tag: "zh", direction: "ltr", source: "explicit", formatting: "zh-CN" }, device: null, problems: [] };
export const BROWSER_SNAPSHOT: UiEnvironmentSnapshot = {
  ...SERVER_SNAPSHOT,
  font: { ...IDENTITIES.font, policy: "pinned" },
  locale: { tag: "en", direction: "ltr", source: "default", formatting: "en-US" },
  device: { theme: "system", resolved_theme: "dark", density: "compact", terminal_theme: "auto", resolved_terminal_theme: "dark", reduced_motion: true },
  problems: [{ code: "ui.skin_missing", subject: "folio", detail: "fell back to the baseline" }, { code: "ui.locale_unavailable", subject: "fr" }],
};

/* ---------- the tools T4 implements, as business code and the platform call them ---------- */

export function businessCode(t: UiTextTool, format: UiFormatTool, at: string): readonly string[] {
  return [
    t("notes.main.title"),
    t("notes.main.saved", { count: 3 }),
    t.text("notes.main.rename", { title: "周报", count: 3, share: { kind: "number", number: 0.4, style: "percent" }, due: { kind: "date", at, style: "relative" } }),
    format.date(at, "datetime"),
    format.number(1200),
    format.number(1200, "compact"),
  ];
}

export function platformCode(say: UiSayTool, ref: OwnedTextRef): readonly string[] {
  return [say(ref), say(ref, { extra: [{ name: "title", kind: "text", text: "周报" }] }), say.text(ref, { locale: "en" }), say.text(ref, { locale: null })];
}

const PLURAL: UiMessage = { plural_arg: "count", forms: { other: "{count} files" } };
export const provider: UiTextProvider = {
  locale: () => null,
  noContext: () => "throw",
  ownerOfPrefix: prefix => prefix === "notes" ? "io.molis.work.example.notes" : null,
  message: (_owner, key) => key === "notes.files" ? PLURAL : null,
  defaultLocale: () => "zh",
};
export const fullProvider: UiTextProvider = { ...provider, problem: problem => void problem.code, produced: (output, ref) => void [output, ref] };

export function afterParse(result: UiFileResult<UiSkinFile>): string {
  return result.ok ? result.value.id : result.problems.map(problem => `${problem.file} ${problem.path} ${problem.code} ${problem.reason} ${problem.fix} ${problem.line ?? ""} ${problem.column ?? ""}`).join("\n");
}

export function pluralAlwaysHasOther(message: Exclude<UiMessage, string>): string {
  return message.forms.other;
}

/* ---------- what the types refuse ---------- */

export const refusedByTypes = (say: UiSayTool, format: UiFormatTool): readonly unknown[] => {
  const noNumber: TextArgValue = { kind: "number" }; // rejects: Property 'number' is missing
  const noDateStyle: TextArgValue = { kind: "date", at: "2026-11-07" }; // rejects: Property 'style' is missing
  const badDateStyle: TextArgValue = { kind: "date", at: "2026-11-07", style: "later" }; // rejects: "later"
  const textKind: TextArgValue = { kind: "text", text: "x" }; // rejects: "text"
  const unknownNumberStyle = format.number(1, "currency"); // rejects: "currency"
  const notBound = say({ key: "notes.main.title" }); // rejects: Property 'owner' is missing
  const wrongFormat: UiSkinFile = { ...SKIN, format_version: 0 }; // rejects: Type '0' is not assignable
  const wrongSpecFormat: UiSpecFile = { ...SPEC, format_version: 0 }; // rejects: Type '0' is not assignable
  const wrongLocaleFormat: UiLocalePack = { ...LOCALE_EN, format_version: 0 }; // rejects: Type '0' is not assignable
  const skinWithCss: UiSkinFile = { ...SKIN, css: "body {}" }; // rejects: 'css' does not exist
  const noTerminal: UiSkinFile = { format_version: UI_FORMAT_VERSIONS.skin, id: "a", revision: 1, spec: SPEC_REF, name: { literal: "a" }, recommended_font: BASELINE_FONT, light: {}, dark: {}, shared: {} }; // rejects: Property 'terminal' is missing
  const anotherAxis: UiSkinFile = { ...SKIN, terminal: { auto: {} } }; // rejects: 'auto' does not exist
  const mixedWithColor: UiTokenValue = { mix: { role: "ink", percent: 7, with: "red" } }; // rejects: "red"
  const anotherStroke: UiTokenValue = { stroke: { width_px: 2, style: "dashed", role: "focus" } }; // rejects: "dashed"
  const shortBezier: UiTokenValue = { bezier: [0.2, 1] }; // rejects: not assignable
  const number: UiTokenValue = 4; // rejects: not assignable
  const shortRgba: UiTokenValue = { rgba: [0, 0, 0] }; // rejects: not assignable
  const unknownRoleType: UiRoleSpec = { name: "a", type: "font", varies_by: "none" }; // rejects: "font"
  const scopeIsNotAField: UiRoleSpec = { name: "a", type: "color", scope: "theme" }; // rejects: 'scope' does not exist
  const unknownVariance: UiRoleSpec = { name: "a", type: "color", varies_by: "density" }; // rejects: "density"
  const missingFontRole: UiFontSchemeFile = { ...FONT_SCHEME, roles: { body: {}, control: {}, title: {}, display: {} } }; // rejects: Property 'code' is missing
  const extraFontRole: UiFontSchemeFile = { ...FONT_SCHEME, roles: { ...FONT_SCHEME.roles, caption: {} } }; // rejects: 'caption' does not exist
  const fontByUrl: UiFontRole = { families: [{ url: "https://example.com/a.woff2" }] }; // rejects: 'url' does not exist
  const faceFromPath: UiFontSchemeFile = { ...FONT_SCHEME, faces: [{ family: "A", weight: 400, unicode_range: [], path: "a.woff2" }] }; // rejects: 'path' does not exist
  const pluralWithoutOther: UiMessage = { plural_arg: "count", forms: { one: "{count} file" } }; // rejects: Property 'other' is missing
  const unknownPluralForm: UiMessage = { plural_arg: "count", forms: { other: "x", plenty: "y" } }; // rejects: 'plenty' does not exist
  const nestedMessage: UiMessage = { text: "x" }; // rejects: 'text' does not exist
  const unknownKind: UiResourceRow = { id: "a", kind: "theme", owner: "o", package: "p", path: "a", load: "startup" }; // rejects: not assignable
  const unknownLoad: UiResourceRow = { id: "a", kind: "skin", owner: "o", package: "p", path: "a", load: "later" }; // rejects: not assignable
  const ownJsonWithDigest: UiResourceRow = { id: "a", kind: "skin", owner: "o", package: "p", path: "a", load: "startup", sha256: "0" }; // rejects: 'sha256' does not exist
  const fontWithoutDigest: UiResourceRow = { id: "a", kind: "font", owner: "o", package: "p", path: "a", load: "fallback", license: LICENSE }; // rejects: not assignable
  const assetWithoutLicense: UiResourceRow = { id: "a", kind: "asset", owner: "o", package: "p", path: "a", load: "tool", sha256: "0" }; // rejects: not assignable
  const rowWithBytes: UiResourceRow = { id: "a", kind: "spec", owner: "o", package: "p", path: "a", load: "startup", bytes: 1 }; // rejects: 'bytes' does not exist
  const snapshotWithTokens: UiEnvironmentSnapshot = { ...SERVER_SNAPSHOT, tokens: {} }; // rejects: 'tokens' does not exist
  const snapshotWithMessages: UiEnvironmentSnapshot = { ...SERVER_SNAPSHOT, messages: {} }; // rejects: 'messages' does not exist
  const noDevice: UiEnvironmentSnapshot = { revision: "r", ...IDENTITIES, locale: SERVER_SNAPSHOT.locale, problems: [] }; // rejects: Property 'device' is missing
  const unknownPolicy: UiEnvironmentSnapshot = { ...SERVER_SNAPSHOT, font: { ...IDENTITIES.font, policy: "auto" } }; // rejects: "auto"
  return [noNumber, noDateStyle, badDateStyle, textKind, unknownNumberStyle, notBound, wrongFormat, wrongSpecFormat, wrongLocaleFormat, skinWithCss, noTerminal, anotherAxis, mixedWithColor, anotherStroke, shortBezier, number, shortRgba, unknownRoleType, scopeIsNotAField, unknownVariance, missingFontRole, extraFontRole, fontByUrl, faceFromPath, pluralWithoutOther, unknownPluralForm, nestedMessage, unknownKind, unknownLoad, ownJsonWithDigest, fontWithoutDigest, assetWithoutLicense, rowWithBytes, snapshotWithTokens, snapshotWithMessages, noDevice, unknownPolicy];
};
