import assert from "node:assert/strict";
import test from "node:test";

import { UI_FILE_LIMITS, UI_FILE_PATTERNS, UI_FORMAT_VERSIONS, type UiFileResult, type UiFontSchemeFile, type UiResourceRegistry, type UiSkinFile, type UiSpecFile } from "@molis-ai/molis-work-contracts/platform/ui";
import { fontFaceRules, fontTokenDeclarations, parseFontScheme, parseResourceRegistry, parseSkinFile, parseStrictJson, parseUiSpecFile, resolveFontScheme, resolveSkin, skinTokenDeclarations } from "@molis-ai/molis-work-plugin-sdk/ui";

// The appearance files: FSS-46 and FSS-57 (specs/font-and-skin-system/spec.md §11). The samples use today's tokens and today's text
// (packages/design-system/src/palette.ts, typeface.ts), since a file has to write back what it replaces.

const SPEC_REF = { id: "molis-interface", revision: 1 };
const BASE_SKIN = { id: "soft-workbench", revision: 1 };
const BASE_FONT = { id: "system-sans", revision: 1 };

const SPEC: UiSpecFile = {
  format_version: UI_FORMAT_VERSIONS.spec,
  ...SPEC_REF,
  baseline_skin: BASE_SKIN,
  baseline_font: BASE_FONT,
  groups: [
    { group: "shell", roles: [
      { name: "page", type: "color", varies_by: "theme" },
      { name: "nav-bg", type: "color", varies_by: "theme", follows: "page" },
      { name: "desk", type: "color", varies_by: "theme", alias_of: "page" },
      { name: "ink", type: "color", varies_by: "theme" },
      { name: "nav-hover", type: "color", varies_by: "theme" },
      { name: "edge", type: "color", varies_by: "theme" },
      { name: "shadow-soft", type: "shadow", varies_by: "theme" },
      { name: "lift", type: "shadow", varies_by: "theme" },
    ] },
    { group: "shape", roles: [
      { name: "radius-item", type: "length", varies_by: "none" },
      { name: "dur-hover", type: "duration", varies_by: "none" },
      { name: "ease-quint", type: "easing", varies_by: "none" },
      { name: "celebrate", type: "color", varies_by: "none" },
      { name: "focus-ring", type: "color", varies_by: "none" },
      { name: "focus-stroke", type: "stroke", varies_by: "none", locked: { stroke: { width_px: 2, style: "solid", role: "focus-ring" } } },
      { name: "code-tab", type: "number", varies_by: "none", locked: { number: 4 } },
    ] },
    { group: "terminal", roles: [{ name: "terminal", type: "color", varies_by: "terminal" }] },
    { group: "hue", roles: [{ name: "hue-green", type: "color", varies_by: "none" }] },
  ],
  font_roles: [
    { name: "body", tokens: { family: "font", weight: "weight-body", tracking: "tracking-body" } },
    { name: "control", tokens: { weight: "weight-control" } },
    { name: "title", tokens: { weight: "weight-title", tracking: "tracking-title" } },
    { name: "display", tokens: { tracking: "tracking-display" } },
    { name: "code", tokens: { family: "font-mono" } },
  ],
};

const BASE: UiSkinFile = {
  format_version: UI_FORMAT_VERSIONS.skin,
  ...BASE_SKIN,
  spec: SPEC_REF,
  name: { key: "workbench.skin.soft" },
  recommended_font: BASE_FONT,
  light: {
    page: "#eef3f7", "nav-bg": "#eef3f7", desk: "#eef3f7", ink: "#1f2b37",
    "nav-hover": { mix: { role: "ink", percent: 5, with: "transparent" } },
    edge: "transparent",
    "shadow-soft": { shadow: [{ x: 0, y: 1, blur: 2, color: { rgba: [28, 42, 58, 0.05] } }, { x: 0, y: 4, blur: 12, spread: -4, color: { rgba: [28, 42, 58, 0.08] } }] },
    lift: { role: "shadow-soft" },
  },
  dark: {
    page: "#141a20", "nav-bg": "#141a20", desk: "#141a20", ink: "#e8eef3",
    "nav-hover": { mix: { role: "ink", percent: 7, with: "transparent" } },
    edge: { rgba: [255, 255, 255, 0.05] },
    "shadow-soft": { shadow: [{ x: 0, y: 0, blur: 0, spread: 1, color: { rgba: [255, 255, 255, 0.035] } }] },
    lift: { role: "shadow-soft" },
  },
  shared: {
    "radius-item": { px: 8 }, "dur-hover": { ms: 130 }, "ease-quint": { bezier: [0.22, 1, 0.36, 1] },
    celebrate: { role: "hue-green", fallback: "#4cb782" }, "focus-ring": { role: "ink" }, "hue-green": "#4cb782",
  },
  terminal: { unset: { terminal: "#171719" }, light: { terminal: "#FBFBFC" }, dark: { terminal: "#101012" } },
};

const FONT: UiFontSchemeFile = {
  format_version: UI_FORMAT_VERSIONS.font,
  ...BASE_FONT,
  name: { key: "workbench.font.system" },
  roles: {
    body: { families: [{ system: "-apple-system" }, { system: "SF Pro Text" }, { face: "Inter Variable" }, { system: "Inter" }, { face: "Noto Sans SC" }, { system: "system-ui" }, { system: "sans-serif" }], weight: 400, tracking_em: -0.011 },
    control: { weight: 500 },
    title: { weight: 600, tracking_em: -0.02 },
    display: { tracking_em: -0.03 },
    code: { families: [{ system: "ui-monospace" }, { system: "SFMono-Regular" }, { system: "monospace" }] },
  },
  faces: [
    { family: "Inter Variable", weight: [100, 900], unicode_range: ["U+0000-00FF", "U+0131"], resource: "font.inter-latin-variable" },
    { family: "Noto Sans SC", weight: 400, unicode_range: ["U+4E00-9FFF"], resource: "font.noto-sans-sc-400" },
  ],
};

const license = { spdx: "OFL-1.1", source: "https://github.com/rsms/inter" };
const REGISTRY: UiResourceRegistry = {
  format_version: UI_FORMAT_VERSIONS.registry,
  resources: [
    { id: "font.inter-latin-variable", kind: "font", owner: "design-system", package: "@molis-ai/molis-work-design-system", path: "fonts/inter-latin-variable.woff2", load: "fallback", route: "/assets/inter-latin-variable.woff2", sha256: "a".repeat(64), license },
    { id: "font.noto-sans-sc-400", kind: "font", owner: "design-system", package: "@molis-ai/molis-work-design-system", path: "fonts/noto-sans-sc-400.woff2", load: "fallback", route: "/assets/noto-sans-sc-400.woff2", sha256: "b".repeat(64), license: { ...license, notice_path: "fonts/README.md" } },
    { id: "spec.molis-interface", kind: "spec", owner: "design-system", package: "@molis-ai/molis-work-design-system", path: "resources/ui-spec.json", load: "startup" },
    { id: "locale.workbench", kind: "locale", owner: "workbench", package: "@molis-ai/molis-work-app-workbench", path: "resources/locales", load: "first-screen" },
  ],
};

function refused<T>(result: UiFileResult<T>, code: string, path?: string) {
  assert.equal(result.ok, false, `expected ${code}`);
  if (result.ok) return;
  const problem = result.problems.find((one) => one.code === code && (path === undefined || one.path === path));
  assert.ok(problem, `${code} ${path ?? ""} among ${JSON.stringify(result.problems)}`);
  assert.ok(problem.reason.length > 0 && problem.fix.length > 0 && problem.file.length > 0, "a problem says which file, and what to do next");
  return problem;
}
const value = <T>(result: UiFileResult<T>): T => {
  assert.ok(result.ok, JSON.stringify(result));
  return result.value;
};

const specJson = (patch: object = {}) => JSON.stringify({ ...SPEC, ...patch });
const skinJson = (patch: object = {}) => JSON.stringify({ ...BASE, ...patch });
const fontJson = (patch: object = {}) => JSON.stringify({ ...FONT, ...patch });
const registryJson = (patch: object = {}) => JSON.stringify({ ...REGISTRY, ...patch });
const parseSkin = (patch: object = {}) => parseSkinFile(skinJson(patch), SPEC);
const OTHER = { id: "folio", revision: 1, name: { literal: "我的皮肤" }, light: {}, dark: {}, shared: {}, terminal: {} };
const parseOther = (patch: object = {}) => parseSkin({ ...OTHER, ...patch });
const withRole = (role: object) => ({ groups: [{ group: "shell", roles: [role] }] });
const rowAt = (row: object) => ({ resources: [{ ...REGISTRY.resources[2], ...row }] });
const fontAt = (row: object) => ({ resources: [{ ...REGISTRY.resources[0], ...row }] });

test("FSS-46: all four files and the registry read, and a parse gives back exactly the file", () => {
  assert.deepEqual(value(parseUiSpecFile(specJson())), SPEC);
  assert.deepEqual(value(parseSkinFile(skinJson(), SPEC)), BASE);
  assert.deepEqual(value(parseFontScheme(fontJson())), FONT);
  assert.deepEqual(value(parseResourceRegistry(registryJson())), REGISTRY);
});

test("FSS-46: an unknown field is refused, not ignored, at every level", () => {
  refused(parseUiSpecFile(specJson({ css: "x" })), "ui.file_unknown_field", "$.css");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "color", varies_by: "none", scope: "x" }))), "ui.file_unknown_field");
  refused(parseSkin({ css: "body {}" }), "ui.file_unknown_field", "$.css");
  refused(parseSkin({ terminal: { auto: {} } }), "ui.file_unknown_field", "$.terminal.auto");
  refused(parseFontScheme(fontJson({ size: 13 })), "ui.file_unknown_field", "$.size");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, body: { size: 13 } } })), "ui.file_unknown_field");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, extra: {} } })), "ui.file_unknown_field");
  refused(parseResourceRegistry(registryJson({ bytes: 1 })), "ui.file_unknown_field", "$.bytes");
  refused(parseResourceRegistry(registryJson(rowAt({ bytes: 1 }))), "ui.file_unknown_field");
  // A role's name in a skin that the spec does not have is the same thing: a skin cannot add a token.
  refused(parseOther({ light: { "not-in-spec": "#000000" } }), "ui.skin_unknown_role", "$.light.not-in-spec");
});

test("FSS-46: a repeated property name is refused before JSON.parse, with its path, line and column", () => {
  const source = skinJson().replace('"page":"#eef3f7"', '"page":"#000000","page":"#eef3f7"');
  const problem = refused(parseSkinFile(source, SPEC), "ui.json_repeated_name", "$.light.page");
  assert.equal(problem?.line, 1);
  assert.equal(source.slice(problem!.column! - 1).startsWith('"page":"#eef3f7"'), true);
  for (const parse of [(text: string) => parseUiSpecFile(text), (text: string) => parseFontScheme(text), (text: string) => parseResourceRegistry(text)]) {
    refused(parse('{"format_version":1,"format_version":1}'), "ui.json_repeated_name", "$.format_version");
  }
  const lines = refused(parseStrictJson('{\n  "light": {\n    "ink": 1,\n    "ink": 2\n  }\n}'), "ui.json_repeated_name", "$.light.ink");
  assert.deepEqual([lines?.line, lines?.column], [4, 5]);
  assert.deepEqual(value(parseStrictJson('{"a":[1,{"b":null}],"c":"\\u00e9","d":-1.5e3,"e":true}')), { a: [1, { b: null }], c: "é", d: -1500, e: true });
});

test("FSS-46: dangerous property names are refused at any depth, however they are spelled", () => {
  for (const name of ["__proto__", "constructor", "prototype", "\\u005f_proto__"]) {
    const problem = refused(parseStrictJson(`{"a":[{"${name}":1}]}`), "ui.json_dangerous_name");
    assert.match(problem?.path ?? "", /^\$\.a\[0\]/u);
    refused(parseSkinFile(`{"light":{"${name}":1}}`, SPEC), "ui.json_dangerous_name");
    refused(parseFontScheme(`{"${name}":1}`), "ui.json_dangerous_name");
  }
});

test("FSS-46: what is not JSON is refused with a line and a column, the same in every runtime", () => {
  for (const source of ["", "{", '{"a":1,}', "{a:1}", '{"a":01}', '{"a":"\n"}', '{"a":"\\x"}', '{"a":"\\u12"}', "[1,]", "tru", '{"a":1} x', "// note\n{}", "﻿{}"]) {
    const problem = refused(parseStrictJson(source), "ui.json_syntax");
    assert.ok(problem?.line !== undefined && problem.column !== undefined, JSON.stringify(source));
  }
  const nested = refused(parseStrictJson("[".repeat(UI_FILE_LIMITS.depth + 1) + "]".repeat(UI_FILE_LIMITS.depth + 1)), "ui.json_too_deep");
  assert.ok(nested);
  assert.ok(parseStrictJson("[".repeat(UI_FILE_LIMITS.depth) + "]".repeat(UI_FILE_LIMITS.depth)).ok);
  assert.ok(parseStrictJson(JSON.stringify({ a: "x".repeat(2_000_000) })).ok, "a long string does not exhaust the scan");
});

test("FSS-46: each file past its size is refused before it is parsed", () => {
  const padded = (limit: number) => `{${" ".repeat(limit)}`;
  refused(parseUiSpecFile(padded(UI_FILE_LIMITS.spec)), "ui.file_too_large");
  refused(parseSkinFile(padded(UI_FILE_LIMITS.skin), SPEC), "ui.file_too_large");
  refused(parseFontScheme(padded(UI_FILE_LIMITS.font)), "ui.file_too_large");
  refused(parseResourceRegistry(padded(UI_FILE_LIMITS.registry)), "ui.file_too_large");
  refused(parseStrictJson("1234", { maxBytes: 3 }), "ui.file_too_large");
  refused(parseStrictJson('"中"', { maxBytes: 4 }), "ui.file_too_large", "$");
});

test("FSS-46: CSS text, a selector, a function and an external URL have no position to sit in", () => {
  const bad = ["red; background: url(https://x)", "url(https://example.com/a.png)", "rgb(0, 0, 0)", "var(--ink)", "#12", "#gggggg", "body { color: red }", "expression(alert(1))", "}", "#000000;"];
  for (const token of bad) refused(parseOther({ light: { page: token } }), "ui.file_token_value", "$.light.page");
  refused(parseOther({ light: { ".a > b": "#000000" } }), "ui.file_value", '$.light[".a > b"]');
  refused(parseOther({ light: { page: { role: "ink;x" } } }), "ui.file_token_value");
  refused(parseOther({ light: { page: { role: "ink", fallback: "red;x" } } }), "ui.file_token_value");
  refused(parseOther({ light: { page: { url: "https://x" } } }), "ui.file_token_value");
  refused(parseOther({ light: { page: { rgba: [0, 0, 0, 0.5], extra: 1 } } }), "ui.file_token_value");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, body: { families: [{ system: 'a"; color: red' }] } } })), "ui.file_value");
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], unicode_range: ["U+0-1;}"] }] })), "ui.file_value");
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], resource: "https://example.com/a.woff2" }] })), "ui.file_value");
  refused(parseResourceRegistry(registryJson(fontAt({ route: "https://example.com/a.woff2" }))), "ui.file_value");
  refused(parseResourceRegistry(registryJson(fontAt({ route: "/assets/../secret" }))), "ui.file_value");
});

test("FSS-46: a value that does not suit its role's type, or is out of range, is refused", () => {
  const roles: ReadonlyArray<readonly [string, unknown]> = [
    ["page", { px: 1 }], ["page", { rgba: [256, 0, 0, 1] }], ["page", { rgba: [0, 0, 0, 2] }], ["page", { rgba: [0, 0, 0] }], ["page", 4],
    ["page", { mix: { role: "ink", percent: 101, with: "transparent" } }], ["page", { mix: { role: "ink", percent: 5, with: "red" } }],
    ["shadow-soft", "#000000"], ["shadow-soft", { shadow: [] }], ["shadow-soft", { shadow: [{ x: 0, y: 0, blur: -1, color: "#000000" }] }], ["shadow-soft", { shadow: [{ x: 0, y: 0, blur: 0, color: "red" }] }],
  ];
  for (const [role, token] of roles) refused(parseOther({ light: { [role]: token } }), "ui.file_token_value", `$.light.${role}`);
  const shared: ReadonlyArray<readonly [string, unknown]> = [["radius-item", { ms: 1 }], ["dur-hover", { px: 1 }], ["dur-hover", { ms: -1 }], ["ease-quint", { bezier: [0, 1] }], ["ease-quint", { number: 1 }]];
  for (const [role, token] of shared) refused(parseOther({ shared: { [role]: token } }), "ui.file_token_value", `$.shared.${role}`);
});

test("FSS-46: a wrong format_version is refused in each file", () => {
  refused(parseUiSpecFile(specJson({ format_version: 2 })), "ui.file_format_version", "$.format_version");
  refused(parseSkin({ format_version: 2 }), "ui.file_format_version", "$.format_version");
  refused(parseFontScheme(fontJson({ format_version: 0 })), "ui.file_format_version", "$.format_version");
  refused(parseResourceRegistry(registryJson({ format_version: "1" })), "ui.file_format_version", "$.format_version");
});

test("FSS-46: identities and references have their shapes, and a name is a text reference", () => {
  refused(parseUiSpecFile(specJson({ id: "Molis Interface" })), "ui.file_value", "$.id");
  refused(parseUiSpecFile(specJson({ revision: 0 })), "ui.file_value", "$.revision");
  refused(parseSkin({ recommended_font: { id: "system-sans" } }), "ui.file_missing_field", "$.recommended_font");
  refused(parseSkin({ name: { owner: "x", key: "a.b" } }), "ui.file_text_ref", "$.name");
  refused(parseSkin({ name: "柔和工作台" }), "ui.file_text_ref", "$.name");
  refused(parseSkin({ spec: { id: "other", revision: 1 } }), "ui.skin_spec_mismatch", "$.spec");
  refused(parseFontScheme(fontJson({ name: {} })), "ui.file_text_ref", "$.name");
});

test("FSS-46: the registry takes only the kinds that ship as files, and only a third party's binary carries a digest and a license", () => {
  refused(parseResourceRegistry(registryJson(rowAt({ kind: "style" }))), "ui.file_value");
  refused(parseResourceRegistry(registryJson(rowAt({ kind: "inline-block" }))), "ui.file_value");
  refused(parseResourceRegistry(registryJson(rowAt({ load: "sometimes" }))), "ui.file_value");
  refused(parseResourceRegistry(registryJson(rowAt({ sha256: "a".repeat(64) }))), "ui.file_unknown_field");
  refused(parseResourceRegistry(registryJson(rowAt({ license }))), "ui.file_unknown_field");
  const { sha256: _digest, ...unsigned } = REGISTRY.resources[0] as { sha256: string };
  refused(parseResourceRegistry(registryJson({ resources: [unsigned] })), "ui.file_missing_field");
  refused(parseResourceRegistry(registryJson({ resources: [REGISTRY.resources[0], REGISTRY.resources[0]] })), "ui.registry_repeated_id");
  for (const sha256 of ["A".repeat(64), "a".repeat(63), `${"a".repeat(63)}g`]) refused(parseResourceRegistry(registryJson(fontAt({ sha256 }))), "ui.file_value", "$.resources[0].sha256");
  for (const path of ["/etc/passwd", "../up", "a/../b", "a\\b", "", ".hidden", "a//b"]) refused(parseResourceRegistry(registryJson(rowAt({ path }))), "ui.registry_path", "$.resources[0].path");
  refused(parseResourceRegistry(registryJson(fontAt({ license: { ...license, notice_path: "../LICENSE" } }))), "ui.registry_path");
  refused(parseResourceRegistry(registryJson(fontAt({ license: { spdx: "", source: "x" } }))), "ui.file_value");
  refused(parseResourceRegistry(registryJson(rowAt({ package: "NOT A PACKAGE" }))), "ui.file_value");
});

test("FSS-46: the spec's own references are checked: unknown roles, cycles and locked values", () => {
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "color", varies_by: "theme", follows: "b" }))), "ui.spec_unknown_role");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "color", varies_by: "theme", alias_of: "b" }))), "ui.spec_unknown_role");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "font", varies_by: "theme" }))), "ui.file_value");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "color", varies_by: "always" }))), "ui.file_value");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "number", varies_by: "none", locked: "#000000" }))), "ui.file_token_value");
  refused(parseUiSpecFile(specJson(withRole({ name: "a", type: "stroke", varies_by: "none", locked: { stroke: { width_px: 2, style: "solid", role: "b" } } }))), "ui.spec_unknown_role");
  const cycle = { groups: [{ group: "g", roles: [{ name: "a", type: "color", varies_by: "theme", follows: "b" }, { name: "b", type: "color", varies_by: "theme", follows: "a" }] }] };
  refused(parseUiSpecFile(specJson(cycle)), "ui.role_cycle");
  const axes = { groups: [{ group: "g", roles: [{ name: "a", type: "color", varies_by: "theme", follows: "b" }, { name: "b", type: "color", varies_by: "none" }] }] };
  refused(parseUiSpecFile(specJson(axes)), "ui.spec_follows_axis");
  const twice = { groups: [{ group: "g", roles: [{ name: "a", type: "color", varies_by: "none" }, { name: "a", type: "color", varies_by: "none" }] }] };
  refused(parseUiSpecFile(specJson(twice)), "ui.spec_repeated_role");
  refused(parseUiSpecFile(specJson({ font_roles: SPEC.font_roles.slice(1) })), "ui.file_missing_field");
  const sameToken = { font_roles: SPEC.font_roles.map((role) => (role.name === "control" ? { name: "control", tokens: { weight: "weight-body" } } : role)) };
  refused(parseUiSpecFile(specJson(sameToken)), "ui.spec_repeated_role");
});

test("FSS-46: font names: a keyword that would void the whole declaration is refused, and so is a code point past the end", () => {
  for (const name of ["inherit", "initial", "unset", "revert", "revert-layer", "INHERIT", "default"]) {
    const problem = refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, code: { families: [{ system: name }] } } })), "ui.font_keyword");
    assert.match(problem?.reason ?? "", /font-family/);
    refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], family: name }] })), "ui.font_keyword");
  }
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], unicode_range: ["U+FFFFFF"] }] })), "ui.file_value");
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], unicode_range: ["U+200-100"] }] })), "ui.file_value");
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], unicode_range: [] }] })), "ui.file_wrong_type");
  refused(parseFontScheme(fontJson({ faces: [{ ...FONT.faces[0], weight: [900, 100] }] })), "ui.file_value");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, code: { families: [{ face: "Not Declared" }] } } })), "ui.font_unknown_face");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, code: { families: [{ face: "Inter Variable", system: "Inter" }] } } })), "ui.file_value");
  refused(parseFontScheme(fontJson({ roles: { ...FONT.roles, code: { weight: 1001 } } })), "ui.file_value");
  assert.match("Foo 2", UI_FILE_PATTERNS.font_name);
});

test("FSS-57: a skin cannot write a locked role, or an alias role unless it is the baseline, and writes a role on the axis it has", () => {
  refused(parseOther({ shared: { "focus-stroke": { stroke: { width_px: 0, style: "solid", role: "focus-ring" } } } }), "ui.skin_locked_role", "$.shared.focus-stroke");
  refused(parseSkin({ shared: { ...BASE.shared, "code-tab": { number: 8 } } }), "ui.skin_locked_role", "$.shared.code-tab");
  refused(parseOther({ light: { desk: "#000000" } }), "ui.skin_alias_role", "$.light.desk");
  assert.ok(parseSkin().ok, "the baseline writes it, for today's content");
  assert.ok(parseSkin({ revision: 2 }).ok === false, "another revision of the baseline is not the baseline");
  refused(parseOther({ shared: { page: "#000000" } }), "ui.skin_wrong_axis", "$.shared.page");
  refused(parseOther({ light: { "radius-item": { px: 1 } } }), "ui.skin_wrong_axis");
  refused(parseOther({ terminal: { light: { page: "#000000" } } }), "ui.skin_wrong_axis");
  refused(parseOther({ light: { terminal: "#000000" } }), "ui.skin_wrong_axis");
});

test("FSS-57: a skin refers only to roles in the spec, its own or a font's token", () => {
  refused(parseOther({ light: { page: { role: "not-in-spec" } } }), "ui.skin_unknown_role", "$.light.page");
  refused(parseOther({ light: { "nav-hover": { mix: { role: "not-in-spec", percent: 5, with: "transparent" } } } }), "ui.skin_unknown_role");
  refused(parseOther({ light: { lift: { shadow: [{ x: 0, y: 0, blur: 0, color: { role: "not-in-spec" } }] } } }), "ui.skin_unknown_role");
  assert.ok(parseOther({ light: { page: { role: "ink" } } }).ok);
});

const resolve = (skin?: object) => value(resolveSkin(SPEC, BASE, skin === undefined ? undefined : { ...BASE, ...OTHER, ...skin } as UiSkinFile));

test("FSS-57: a role left out fills from the skin itself, then what it follows, then the baseline", () => {
  const skin = resolve({ light: { page: "#fafafa" } });
  assert.equal(skin.light.page, "#fafafa", "its own");
  assert.equal(skin.light["nav-bg"], "#fafafa", "written only page, and nav-bg follows");
  assert.equal(skin.dark.page, "#141a20", "the baseline, on the other theme");
  assert.equal(skin.dark["nav-bg"], "#141a20", "following a value from the baseline");
  assert.equal(skin.light.ink, "#1f2b37", "the baseline");
  assert.equal(skin.light.desk, "#eef3f7", "an alias role keeps the baseline's value: a later layer binds it");
  const own = resolve({ light: { page: "#fafafa", "nav-bg": "#000000" } });
  assert.equal(own.light["nav-bg"], "#000000", "its own comes before what it follows");
});

test("FSS-57: a locked value is the spec's whatever anything says, and the baseline itself resolves", () => {
  const baseline = resolve();
  assert.deepEqual(baseline.shared["focus-stroke"], { stroke: { width_px: 2, style: "solid", role: "focus-ring" } });
  assert.deepEqual(baseline.shared["code-tab"], { number: 4 });
  assert.deepEqual(baseline.ref, BASE_SKIN);
  assert.deepEqual(baseline.terminal, { unset: { terminal: "#171719" }, light: { terminal: "#FBFBFC" }, dark: { terminal: "#101012" } });
  assert.deepEqual(resolve({ terminal: { light: { terminal: "#000000" } } }).terminal, { unset: { terminal: "#171719" }, light: { terminal: "#000000" }, dark: { terminal: "#101012" } });
});

test("FSS-57: a baseline that does not write every role is a problem, and only the named baseline is one", () => {
  const { page: _page, ...light } = BASE.light;
  refused(resolveSkin(SPEC, { ...BASE, light }), "ui.skin_role_missing", "$.light.page");
  refused(resolveSkin(SPEC, { ...BASE, id: "other" }), "ui.skin_not_baseline");
});

test("FSS-57: a cycle of references is refused, also when it runs through what a skin left to the baseline", () => {
  const within = { ...BASE, ...OTHER, light: { ink: { role: "page" }, page: { role: "ink" } } } as UiSkinFile;
  refused(resolveSkin(SPEC, BASE, within), "ui.role_cycle");
  const baseline: UiSkinFile = { ...BASE, light: { ...BASE.light, ink: { role: "edge" } } };
  const across = { ...BASE, ...OTHER, light: { edge: { role: "ink" } } } as UiSkinFile;
  const problem = refused(resolveSkin(SPEC, baseline, across), "ui.role_cycle");
  assert.match(problem?.reason ?? "", /edge → ink → edge|ink → edge → ink/);
  assert.ok(resolveSkin(SPEC, baseline).ok, "no cycle in the baseline alone");
  // The two themes are separate: a -> b in one and b -> a in the other is no cycle.
  const themes = { ...BASE, ...OTHER, light: { ink: { role: "page" } }, dark: { page: { role: "ink" } } } as UiSkinFile;
  assert.ok(resolveSkin(SPEC, BASE, themes).ok);
});

test("FSS-57: written back, hex keeps its letter case and values read as today's text", () => {
  const skin = resolve();
  assert.equal(skinTokenDeclarations(skin, { terminal: "light", groups: ["terminal"] }), "--terminal: #FBFBFC;");
  assert.equal(skinTokenDeclarations(skin, { theme: "light", groups: ["shell"] }), [
    "--page: #eef3f7;", "--nav-bg: #eef3f7;", "--desk: #eef3f7;", "--ink: #1f2b37;",
    "--nav-hover: color-mix(in srgb, var(--ink) 5%, transparent);",
    "--edge: transparent;",
    "--shadow-soft: 0 1px 2px rgba(28, 42, 58, .05), 0 4px 12px -4px rgba(28, 42, 58, .08);",
    "--lift: var(--shadow-soft);",
  ].join(" "));
  assert.match(skinTokenDeclarations(skin, { theme: "dark", groups: ["shell"] }), /--edge: rgba\(255, 255, 255, \.05\); --shadow-soft: 0 0 0 1px rgba\(255, 255, 255, \.035\);/u);
  assert.equal(skinTokenDeclarations(skin, { groups: ["shape"] }), [
    "--radius-item: 8px;", "--dur-hover: 130ms;", "--ease-quint: cubic-bezier(.22, 1, .36, 1);",
    "--celebrate: var(--hue-green, #4cb782);", "--focus-ring: var(--ink);", "--focus-stroke: 2px solid var(--focus-ring);", "--code-tab: 4;",
  ].join(" "));
  assert.equal(skinTokenDeclarations(skin, { names: ["code-tab", "radius-item", "page"] }), "--code-tab: 4; --radius-item: 8px;", "a theme's role needs a theme");
  assert.equal(skinTokenDeclarations(skin, { theme: "dark", names: ["page"] }), "--page: #141a20;");
});

test("FSS-46: font tokens and faces read as today's text; a name is quoted when it has a space, and a face always", () => {
  const font = value(resolveFontScheme(SPEC, FONT));
  assert.equal(font.tokens.font, '-apple-system, "SF Pro Text", "Inter Variable", Inter, "Noto Sans SC", system-ui, sans-serif');
  assert.equal(font.tokens["font-mono"], "ui-monospace, SFMono-Regular, monospace");
  assert.equal(fontTokenDeclarations(font, ["weight-body", "weight-control", "weight-title", "tracking-body", "tracking-title", "tracking-display"]), "--weight-body: 400; --weight-control: 500; --weight-title: 600; --tracking-body: -.011em; --tracking-title: -.02em; --tracking-display: -.03em;");
  assert.ok(fontTokenDeclarations(font).startsWith('--font: -apple-system, "SF Pro Text"'));
  assert.equal(value(fontFaceRules(font, REGISTRY)), `  @font-face {
    font-family: "Inter Variable";
    font-style: normal;
    font-display: swap;
    font-weight: 100 900;
    src: url("/assets/inter-latin-variable.woff2") format("woff2");
    unicode-range: U+0000-00FF, U+0131;
  }
  @font-face {
    font-family: "Noto Sans SC";
    font-style: normal;
    font-display: swap;
    font-weight: 400;
    src: url("/assets/noto-sans-sc-400.woff2") format("woff2");
    unicode-range: U+4E00-9FFF;
  }`);
  const generic = { ...FONT, id: "x", roles: { ...FONT.roles, body: { families: [{ face: "serif" }] } }, faces: [{ ...FONT.faces[0]!, family: "serif" }] };
  assert.equal(value(resolveFontScheme(SPEC, FONT, generic)).tokens.font, '"serif"', "a face named like a generic family stays that file");
});

test("FSS-46: a font scheme leaves out what the baseline has, and brings only the faces in force", () => {
  const folio: UiFontSchemeFile = { ...FONT, id: "folio", name: { literal: "Folio" }, roles: { body: { weight: 300 }, control: {}, title: {}, display: {}, code: { families: [{ system: "Menlo" }] } }, faces: [] };
  const font = value(resolveFontScheme(SPEC, FONT, folio));
  assert.deepEqual(font.ref, { id: "folio", revision: 1 });
  assert.equal(font.tokens["weight-body"], "300");
  assert.equal(font.tokens["weight-title"], "600", "from the baseline");
  assert.equal(font.tokens["font-mono"], "Menlo");
  assert.deepEqual(font.faces.map((face) => face.family), ["Inter Variable", "Noto Sans SC"], "its body family is the baseline's, so those faces stay");
  const plain: UiFontSchemeFile = { ...folio, roles: { ...folio.roles, body: { families: [{ system: "Menlo" }] } } };
  assert.deepEqual(value(resolveFontScheme(SPEC, FONT, plain)).faces, []);
  refused(resolveFontScheme(SPEC, { ...FONT, id: "other" }), "ui.font_not_baseline");
  refused(resolveFontScheme(SPEC, { ...FONT, roles: { ...FONT.roles, control: {} } }), "ui.font_role_missing", "$.roles.control.weight");
});

test("FSS-46: a face whose file is not a font with a route in the registry is a problem, not a broken url", () => {
  const font = value(resolveFontScheme(SPEC, FONT));
  refused(fontFaceRules(font, { ...REGISTRY, resources: REGISTRY.resources.slice(1) }), "ui.font_resource_unknown");
  const { route: _route, ...noRoute } = REGISTRY.resources[0] as { route: string };
  refused(fontFaceRules(font, { ...REGISTRY, resources: [noRoute as never, REGISTRY.resources[1]!] }), "ui.font_resource_unknown");
});
