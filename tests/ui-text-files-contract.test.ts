import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import {
  LOCALE_TAG,
  TEXT_DATE_STYLES,
  TEXT_NUMBER_STYLES,
  UI_FILE_LIMITS,
  UI_FILE_PATTERNS,
  UI_FONT_ROLE_NAMES,
  UI_FORMAT_VERSIONS,
  UI_RESOURCE_KINDS,
  UI_RESOURCE_LOADS,
  UI_ROLE_TYPES,
  UI_ROLE_VARIES_BY,
  type UiDefinitionRef,
  type UiShadowLayer,
  type UiSkinFile,
  type UiTokenValue,
} from "@molis-ai/molis-work-contracts/platform/ui";
import { parseUiLanguageCatalog } from "@molis-ai/molis-work-plugin-sdk/ui";

import { BROWSER_SNAPSHOT, FONT_SCHEME, LOCALE_EN, LOCALE_ZH, MINIMAL_SKIN, REGISTRY, SERVER_SNAPSHOT, SKIN, SPEC } from "./fixtures/ui-files-types.ts";

// The types and the current format constants of FSS-46 (specs/font-and-skin-system/spec.md §11): what a parser hands back and what it compares
// against. The other half is the parsers' and is proved with them in slice T5: unknown fields and repeated names in a real file, dangerous
// property names, oversized files, CSS text, selectors, functions, external URLs and a wrong `format_version`, each with its file, path and next
// step. A type cannot see any of those in a JSON file, so no test here claims them; what is below says only what compiling and the constants prove.

const FIXTURE = fileURLToPath(new URL("./fixtures/ui-files-types.ts", import.meta.url));
const REJECTS = /\/\/ rejects: (.+)$/u;

/** The errors of the fixture, compiled the way packages are (strict, NodeNext), against the built `.d.ts` a plugin author would get. */
function compile(file: string): Map<number, string[]> {
  const program = ts.createProgram([file], { noEmit: true, strict: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, lib: ["lib.es2022.d.ts"], types: ["node"], skipLibCheck: true });
  const errors = new Map<number, string[]>();
  for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
    assert.equal(diagnostic.file?.fileName, file, `an error outside the fixture: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}`);
    const line = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start!).line;
    errors.set(line, [...(errors.get(line) ?? []), ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")]);
  }
  return errors;
}

test("FSS-46 (types): the samples compile as an author's package, and every marked line is refused for the reason it names", { timeout: 120_000 }, () => {
  const lines = readFileSync(FIXTURE, "utf8").split("\n");
  const errors = compile(FIXTURE);
  const expected = lines.flatMap((text, line) => {
    const reason = REJECTS.exec(text)?.[1];
    return reason ? [{ line, reason }] : [];
  });
  // A rejection that compiles is a let-through; an error on another line means a valid sample is refused.
  assert.deepEqual([...errors.keys()].filter(line => !expected.some(item => item.line === line)).map(line => `${line + 1}: ${errors.get(line)!.join(" | ")}`), [], "lines refused that should compile");
  const wrong = expected.filter(({ line, reason }) => !errors.get(line)?.some(message => message.includes(reason)))
    .map(({ line, reason }) => `${line + 1}: wanted "${reason}", got ${JSON.stringify(errors.get(line) ?? "no error")}`);
  assert.deepEqual(wrong, [], "lines that should be refused for the named reason");
  assert.ok(expected.length >= 37, `the fixture keeps its refusals, found ${expected.length}`);
});

test("FSS-46 (types): each file has a current format version and a byte limit, and the limits are the ones the design names", () => {
  // Not the numbers themselves: moving a format on changes tooling/versions.json and the JSON files, and nothing here.
  assert.deepEqual(Object.keys(UI_FORMAT_VERSIONS), ["spec", "skin", "font", "locale", "languages", "registry"]);
  for (const version of Object.values(UI_FORMAT_VERSIONS)) assert.ok(Number.isInteger(version) && version > 0, `format version ${version}`);
  assert.deepEqual(UI_FILE_LIMITS, { spec: 262_144, skin: 65_536, font: 65_536, locale: 1_048_576, registry: 65_536, depth: 12 });
  for (const file of Object.keys(UI_FORMAT_VERSIONS)) assert.ok((file === "languages" ? "registry" : file) in UI_FILE_LIMITS, `${file} has no byte limit`);
  const languages = JSON.stringify({ format_version: UI_FORMAT_VERSIONS.languages, default: "en", languages: [{ tag: "en", html_lang: "en", intl: "en", direction: "ltr", name: "English" }] });
  assert.ok(parseUiLanguageCatalog(languages.padEnd(UI_FILE_LIMITS.registry)).ok);
  const oversized = parseUiLanguageCatalog(languages.padEnd(UI_FILE_LIMITS.registry + 1));
  assert.ok(!oversized.ok && oversized.problems.some(problem => problem.code === "ui.file_too_large"));
});

test("FSS-46 (types): only the kinds of file that ship are registry kinds, and the listed values are the types' values", () => {
  assert.deepEqual(UI_RESOURCE_KINDS, ["spec", "skin", "font-scheme", "locale", "font", "asset"]);
  assert.deepEqual(UI_RESOURCE_LOADS, ["startup", "first-screen", "fallback", "on-open", "on-select", "tool"]);
  assert.deepEqual(UI_ROLE_TYPES, ["color", "shadow", "length", "duration", "easing", "stroke", "number"]);
  assert.deepEqual(UI_ROLE_VARIES_BY, ["theme", "none", "terminal"]);
  assert.deepEqual(UI_FONT_ROLE_NAMES, ["body", "control", "title", "display", "reading", "note", "code"]);
  assert.deepEqual(TEXT_NUMBER_STYLES, ["decimal", "percent", "compact"]);
  assert.deepEqual(TEXT_DATE_STYLES, ["date", "time", "datetime", "time-with-seconds", "datetime-with-seconds", "relative", "weekday", "weekday-narrow", "month-day", "weekday-month-day", "year-month"]);
});

const assertRef = ({ id, revision }: UiDefinitionRef) => {
  assert.match(id, UI_FILE_PATTERNS.definition_id);
  assert.ok(Number.isInteger(revision) && revision > 0, `${id}: revision ${revision}`);
};
const assertColor = (value: string) => assert.match(value, UI_FILE_PATTERNS.color);
const assertLayerColor = ({ color }: UiShadowLayer) => { if (typeof color === "string") assertColor(color); };
const assertToken = (value: UiTokenValue) => {
  if (typeof value === "string") assertColor(value);
  else if ("shadow" in value) value.shadow.forEach(assertLayerColor);
  else if ("role" in value && value.fallback !== undefined) assertColor(value.fallback);
};
const skinMaps = (skin: UiSkinFile) => [skin.light, skin.dark, skin.shared, skin.terminal.unset ?? {}, skin.terminal.light ?? {}, skin.terminal.dark ?? {}];

test("FSS-46 (types): the valid samples hold the current format, patterns and limits, and survive JSON unchanged", () => {
  const samples = [["spec", SPEC], ["skin", SKIN], ["skin", MINIMAL_SKIN], ["font", FONT_SCHEME], ["locale", LOCALE_EN], ["locale", LOCALE_ZH], ["registry", REGISTRY]] as const;
  for (const [file, sample] of samples) {
    assert.equal(sample.format_version, UI_FORMAT_VERSIONS[file]);
    assert.deepEqual(JSON.parse(JSON.stringify(sample)), sample);
    assert.ok(Buffer.byteLength(JSON.stringify(sample)) < UI_FILE_LIMITS[file], `${file} is within its limit`);
  }
  for (const ref of [SPEC, SPEC.baseline_skin, SPEC.baseline_font, SKIN, SKIN.spec, SKIN.recommended_font, MINIMAL_SKIN, FONT_SCHEME]) assertRef(ref);
  for (const skin of [SKIN, MINIMAL_SKIN]) for (const tokens of skinMaps(skin)) Object.values(tokens).forEach(assertToken);
  for (const pack of [LOCALE_EN, LOCALE_ZH]) assert.match(pack.locale, LOCALE_TAG);
  for (const role of SPEC.groups.flatMap(group => group.roles)) assert.match(role.name, UI_FILE_PATTERNS.role_name);
  for (const role of Object.values(FONT_SCHEME.roles)) for (const family of role.families ?? []) assert.match("system" in family ? family.system : family.face, UI_FILE_PATTERNS.font_name);
  for (const face of FONT_SCHEME.faces) {
    assert.match(face.family, UI_FILE_PATTERNS.font_name);
    assert.match(face.resource, UI_FILE_PATTERNS.resource_id);
    for (const range of face.unicode_range) assert.match(range, UI_FILE_PATTERNS.unicode_range);
  }
  for (const row of REGISTRY.resources) {
    assert.match(row.id, UI_FILE_PATTERNS.resource_id);
    if (row.route !== undefined) assert.match(row.route, UI_FILE_PATTERNS.route);
  }
  assert.deepEqual(SPEC.font_roles.map(role => role.name), UI_FONT_ROLE_NAMES);
  assert.deepEqual(Object.keys(FONT_SCHEME.roles), UI_FONT_ROLE_NAMES);
  assert.deepEqual([...new Set(REGISTRY.resources.map(row => row.kind))], UI_RESOURCE_KINDS);
  assert.deepEqual([...new Set(SPEC.groups.flatMap(group => group.roles.map(role => role.type)))].sort(), [...UI_ROLE_TYPES].sort());
  for (const face of FONT_SCHEME.faces) assert.ok(REGISTRY.resources.some(row => row.id === face.resource && row.kind === "font"), `${face.resource} is a registry font`);
});

// Each one, wherever it lands in a value, would leave a CSS string or declaration, or fetch from elsewhere.
const CSS_BREAKOUTS = [";", "(", ")", "{", "}", "\"", "'", "\n", "\r", "\\", "<", ">", ",", "url(", "url(https://example.com/a.woff2)", "</style>"];
const VALID_VALUE: Readonly<Record<keyof typeof UI_FILE_PATTERNS, string>> = {
  definition_id: "soft-workbench",
  role_name: "hue-green-fill",
  color: "#4cb782",
  font_name: "Inter Variable",
  unicode_range: "U+0000-00FF",
  resource_id: "font.inter-latin-variable",
  route: "/assets/inter-latin-variable.woff2",
};

test("FSS-46 (types): no pattern takes anything that leaves a CSS string or declaration, wherever it is in the value", () => {
  for (const name of Object.keys(UI_FILE_PATTERNS) as (keyof typeof UI_FILE_PATTERNS)[]) {
    const valid = VALID_VALUE[name];
    assert.match(valid, UI_FILE_PATTERNS[name]);
    for (const breakout of CSS_BREAKOUTS) {
      for (const value of [breakout, valid + breakout, breakout + valid, valid.slice(0, 2) + breakout + valid.slice(2)]) assert.doesNotMatch(value, UI_FILE_PATTERNS[name], `${name}: ${JSON.stringify(value)}`);
    }
  }
});

test("FSS-46 (types): the patterns take what the design lists and nothing that could carry CSS", () => {
  for (const id of ["a", "soft-workbench", `a${"0".repeat(63)}`]) assert.match(id, UI_FILE_PATTERNS.definition_id);
  for (const id of ["", "Soft", "1a", "-a", "a_b", "a.b", `a${"0".repeat(64)}`]) assert.doesNotMatch(id, UI_FILE_PATTERNS.definition_id);
  // Upper case stays: 22 of today's values are written that way, and a skin must write back the same bytes.
  for (const color of ["#1E1E1E", "#eef3f7", "#00000080", "transparent"]) assert.match(color, UI_FILE_PATTERNS.color);
  for (const color of ["", "#fff", "#12345", "#1234567", "red", "Transparent", "var(--ink)", "rgba(0, 0, 0, .5)", "url(https://example.com)", "#000000;}", "#000000\n"]) assert.doesNotMatch(color, UI_FILE_PATTERNS.color);
  for (const name of ["-apple-system", "BlinkMacSystemFont", "Segoe UI Variable Text", "PingFang SC", "SFMono-Regular", "system-ui", "ui-monospace", "Inter Variable", "Noto Sans SC", "Inter"]) assert.match(name, UI_FILE_PATTERNS.font_name);
  for (const name of ["", " ", "-", "--a", "1a", " A", "A ", "A-", "A_B", "微软雅黑", "A,B", "A;}", "\"A\"", "url(a)", "A\nB"]) assert.doesNotMatch(name, UI_FILE_PATTERNS.font_name);
  for (const range of ["U+0131", "U+0-7F", "U+0000-00FF", "U+2E80-2EFF", "U+10FFFF"]) assert.match(range, UI_FILE_PATTERNS.unicode_range);
  for (const range of ["", "U+", "u+0131", "U+1234567", "U+00FF-", "U+-00FF", "U+0000-00FF, U+0131", "U+4??", "0131", "U+GGGG"]) assert.doesNotMatch(range, UI_FILE_PATTERNS.unicode_range);
  for (const id of ["font.inter-latin-variable", "font-scheme.system-sans", "locale.workbench", "spec.molis-interface", "font.noto-sans-sc-400"]) assert.match(id, UI_FILE_PATTERNS.resource_id);
  for (const id of ["", "Font.a", ".a", "a.", "a..b", "1a", "a/b", "a b", "../a"]) assert.doesNotMatch(id, UI_FILE_PATTERNS.resource_id);
  for (const route of ["/assets/inter-latin-variable.woff2", "/assets/noto-sans-sc-400.woff2", "/assets/molis-work-plugins/characters.js", "/assets/ui-skin/folio-3.css", "/assets/locale/workbench.en.0a1b.js"]) assert.match(route, UI_FILE_PATTERNS.route);
  for (const route of ["", "/assets", "/assets/", "/assets//a", "/assets/../a", "/assets/./a", "/assets/.a", "/other/a", "assets/a", "//example.com/a", "https://example.com/assets/a", "data:font/woff2;base64,AAAA", "/assets/a?x=1", "/assets/a#x", "/assets/a%2fb", "/assets/a b", "/assets/a\\b"]) assert.doesNotMatch(route, UI_FILE_PATTERNS.route);
  for (const name of ["page", "nav-bg", "hue-green-fill", "r-tag", "on-accent"]) assert.match(name, UI_FILE_PATTERNS.role_name);
  for (const name of ["", "--page", "Page", "1a", "a_b", "a b"]) assert.doesNotMatch(name, UI_FILE_PATTERNS.role_name);
});

// That a snapshot refuses token values and translations is proved by the marked lines of the fixture.
test("environment snapshot: the samples hold valid identities, and a server's has no device", () => {
  assert.equal(SERVER_SNAPSHOT.device, null);
  assert.equal(BROWSER_SNAPSHOT.device?.resolved_theme, "dark");
  for (const snapshot of [SERVER_SNAPSHOT, BROWSER_SNAPSHOT]) {
    for (const ref of [snapshot.spec, snapshot.skin, snapshot.font.scheme, snapshot.font.mono]) assertRef(ref);
    assert.match(snapshot.locale.tag, LOCALE_TAG);
    assert.match(snapshot.locale.formatting, LOCALE_TAG);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot)) < 1024, "a few hundred bytes, because it goes into the first-screen HTML");
  }
});
