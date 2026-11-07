// One copy of what the scripts over tooling/versions.json have to agree on: how the table is read, which files are first-party code,
// what a test file is, and how a marker is spelled. scripts/generate-versions.mjs copies values, scripts/gates/version-declarations.mjs
// refuses what bypasses them, scripts/verify-release-versions.mjs reads the literals behind the markers.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { CODE_FILE, walkFiles } from "./script-paths.mjs";

export const REPOSITORY = fileURLToPath(new URL("../", import.meta.url));
export const VERSIONS_FILE = "tooling/versions.json";
export const SOURCE_ROOTS = ["apps", "packages", "plugins", "modules", "horizontal", "server", "tooling/plugin-cli"];

const STRING = String.raw`"(?:[^"\\]|\\.)*"`;
const MARKER = String.raw`/\* @version ([\w./-]+)(?: (${STRING}))? \*/`;
// A number ends where the literal ends: 1e3, 1_000, 0x10 and 1.5.2 would otherwise read as their first digits.
const LITERAL = String.raw`${STRING}|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?(?![\w.])`;
/** Groups: the marker with the space after it, the key, the template (with its quotes), the literal. */
export const MARKED_LITERAL = new RegExp(String.raw`(${MARKER}\s*)(${LITERAL})`, "g");
export const ANY_MARKER = /\/\* @version\b[\s\S]*?\*\//g;
const MARKER_AT_END = new RegExp(String.raw`${MARKER}\s*$`);

/** Markers are comments next to the literal; a check that reads the literal reads this. */
export const withoutMarkers = text => text.replace(new RegExp(String.raw`${ANY_MARKER.source}\s*`, "g"), "");

export const scriptKind = file => /x$/.test(file) ? ts.ScriptKind.TSX : /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;

/** The key of the marker that ends `trivia`, the comments and space in front of a node; none when a `//` on its line quotes it. */
export function markerAtEnd(trivia) {
  const match = MARKER_AT_END.exec(trivia);
  return match && !trivia.slice(trivia.lastIndexOf("\n", match.index) + 1, match.index).includes("//") ? match[1] : undefined;
}

/** Is the marker at `offset` behind a `//` of its line, so a note about a marker and not one? A `//` in a string or a block comment does not count. */
export function isQuotedMarker(file, source, offset) {
  const start = source.lastIndexOf("\n", offset) + 1;
  let before = source.slice(start, offset);
  if (!before.includes("//")) return false;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, scriptKind(file));
  const visit = node => {
    if (node.end <= start || node.pos >= offset) return;
    if (ts.isLiteralExpression(node) || ts.isTemplateHead(node) || ts.isTemplateMiddleOrTemplateTail(node) || ts.isJsxText(node)) {
      const from = Math.max(node.getStart(tree), start) - start, to = Math.min(node.end, offset) - start;
      if (from < to) before = before.slice(0, from) + " ".repeat(to - from) + before.slice(to);
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return before.replace(/\/\*.*?\*\//g, "").includes("//");
}

/**
 * The table as it is written. JSON.parse keeps the last of two equal keys and reads 1e3 as 1000, and neither shows in a diff, so
 * both are refused here for every reader of the table.
 */
export function versionSource(root = REPOSITORY) {
  const text = readFileSync(path.join(root, VERSIONS_FILE), "utf8"), parsed = JSON.parse(text);
  const tree = ts.parseJsonText(VERSIONS_FILE, text), problems = [];
  const visit = node => {
    if (ts.isObjectLiteralExpression(node)) {
      const names = node.properties.map(property => property.name.text);
      for (const name of new Set(names.filter((name, index) => names.indexOf(name) !== index))) problems.push(`${VERSIONS_FILE}: ${name} appears twice`);
    } else if (ts.isNumericLiteral(node) && !/^(?:0|[1-9]\d*)$/.test(node.getText(tree))) problems.push(`${VERSIONS_FILE}: ${node.getText(tree)} is not a plain whole number`);
    ts.forEachChild(node, visit);
  };
  visit(tree);
  if (problems.length) throw new Error(problems.join("\n"));
  return parsed;
}

/** The workspace package a path is in, by the layout of pnpm-workspace.yaml (apps/sync-worker has no package.json and still is one); "" outside them. */
export const packageOf = file => /^(?:server(?=\/|$)|plugins\/[^/]+\/[^/]+|(?:apps|packages|modules|horizontal|tooling)\/[^/]+)/.exec(file)?.[0] ?? "";

/**
 * Real tests and their fixtures hold frozen inputs, not current declarations. The boundary is the package: its own `tests/`, `test/`
 * and `fixtures/` directories and test.* at its top. Further in, a directory of that name ships (`src/tests/`, `src/fixtures/`).
 */
export function isTestFile(file) {
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)) return true;
  const inPackage = file.slice(packageOf(file).length).replace(/^\//, "");
  return /^(?:tests?|fixtures)\//.test(inPackage) || /^test\.[cm]?[jt]sx?$/.test(inPackage);
}

/** Every first-party code file (relative path, text). */
export function readSourceFiles(root = REPOSITORY) {
  return new Map(walkFiles(root, SOURCE_ROOTS, file => CODE_FILE.test(file) && !isTestFile(file)).map(file => [file, readFileSync(path.join(root, file), "utf8")]));
}
