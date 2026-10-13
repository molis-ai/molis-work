// A static index of the test files: which repository paths each one reaches, which workspace packages it imports, and which
// names it mentions. It reads the test files and the helpers they import under tests/ (the same closure the Linux probe marks
// are read from), never runs anything. The question it answers is the one `git grep -l <name> tests` answers by hand: which
// tests read or call this?
import path from "node:path";
import { marksOf, readClosureFiles } from "../ci-linux-probe/select.mjs";
import { REPOSITORY_FOLDERS } from "./rules.mjs";
import { sourceOfEntry } from "./repository.mjs";

export const TEST_FILE = /^tests\/[^/]+\.test\.(?:ts|mjs)$/;

const FOLDERS = REPOSITORY_FOLDERS.map((folder) => folder.replace(/[.]/g, "\\.")).join("|");
// A string that names a path: `"../apps/x/src/y.ts"` (relative to the file), `"apps/x/src/y.ts"` (from the root).
const PATH_LITERAL = new RegExp(`(["'\`])((?:\\.{1,2}/|(?:${FOLDERS})/)[^"'\`\\n]*)\\1`, "g");
// `join(root, "plugins", "native", "todo")`: consecutive string literals that start at a repository folder. Two or more, so that
// the plain word "server" or "docs" in a test is not read as the folder.
const SEGMENTS = new RegExp(`(["'\`])(${FOLDERS})\\1((?:\\s*,\\s*(["'\`])[^"'\`,\\n]*\\4)+)`, "g");
const SEGMENT = /["'`]([^"'`,\n]*)["'`]/g;
const SPECIFIER = /(?:\bfrom|\bimport|\brequire)\s*\(?\s*["']([^"']+)["']/g;
const IDENTIFIER = /[A-Za-z_$][\w$]*/g;
/** Folders so wide that naming one says nothing about a file in it. */
const WIDE_FOLDERS = new Set(["apps", "packages", "plugins", "modules", "horizontal", "server", "tooling", "tests", "."]);

/** The spellings a test may use for the path of a source file: the built `.js`, no extension, the directory (`index`), `dist` for `src`. */
export function spellings(ref) {
  const result = new Set();
  const add = (value) => {
    result.add(value);
    if (/\.m?js$/.test(value)) result.add(value.replace(/\.(m?)js$/, ".$1ts"));
    if (!/\.[A-Za-z0-9]+$/.test(path.posix.basename(value))) for (const suffix of [".ts", ".mts", ".mjs", ".js", "/index.ts", "/index.mjs", "/index.js"]) result.add(value + suffix);
  };
  add(ref);
  if (ref.includes("/dist/")) add(ref.replace("/dist/", "/src/"));
  return result;
}

export const isIndexableRef = (ref) => ref !== "" && !ref.startsWith("..") && !path.posix.isAbsolute(ref) && !WIDE_FOLDERS.has(ref);

/** What one file (a test or a helper under tests/) reaches: repository paths, workspace packages. */
function analyse(entry, packages) {
  const refs = new Set(), imported = new Set();
  const dir = path.posix.dirname(entry.file);
  const addRef = (ref) => { if (isIndexableRef(ref)) for (const spelling of spellings(ref)) refs.add(spelling); };
  const relative = (value) => path.posix.normalize(path.posix.join(dir, value.split(/[?#]|\$\{/)[0]).replace(/\/$/, ""));
  for (const [, specifier] of entry.text.matchAll(SPECIFIER)) {
    if (specifier.startsWith(".")) addRef(relative(specifier));
    else {
      const owner = packages.find((item) => specifier === item.name || specifier.startsWith(`${item.name}/`));
      if (!owner) continue;
      imported.add(owner.name);
      const source = specifier === owner.name ? null : sourceOfEntry(owner, specifier.slice(owner.name.length + 1));
      if (source) addRef(source);
    }
  }
  for (const [, , literal] of entry.text.matchAll(PATH_LITERAL)) {
    const value = literal.split(/[?#]|\$\{/)[0];
    addRef(value.startsWith(".") ? relative(value) : path.posix.normalize(value).replace(/\/$/, ""));
  }
  for (const [, , folder, rest] of entry.text.matchAll(SEGMENTS)) {
    const segments = [...rest.matchAll(SEGMENT)].map((match) => match[1]).filter((segment) => segment !== "" && segment !== "..");
    addRef(path.posix.normalize([folder, ...segments].join("/")));
  }
  return { refs, imported };
}

/**
 * The index. `files` are the repository files (see listFiles). For every test file: its closure under tests/, its marks.
 * Lookups return sets of test files: `referencing(path)` (imports, path strings, or is itself a helper of the test),
 * `importing(packageName)`, `mentioning(name)`.
 */
export function buildTestIndex(root, files, packages) {
  const tests = files.filter((file) => TEST_FILE.test(file)).sort();
  const analysed = new Map();   // closure file -> { text, refs, imported }
  const owners = new Map();     // closure file -> test files whose closure holds it
  const entries = tests.map((file) => {
    const closure = readClosureFiles(root, file);
    for (const entry of closure) {
      if (!analysed.has(entry.file)) analysed.set(entry.file, { text: entry.text, ...analyse(entry, packages) });
      if (!owners.has(entry.file)) owners.set(entry.file, []);
      owners.get(entry.file).push(file);
    }
    const marks = marksOf(path.posix.basename(file), closure.map((entry) => entry.text).join("\n"));
    return { file, closure: closure.map((entry) => entry.file), marks, kind: marks.includes("browser") ? "browser" : "unit" };
  });

  const refIndex = new Map(), importIndex = new Map();
  const put = (map, key, file) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(file); };
  for (const [file, info] of analysed) {
    for (const spelling of spellings(file)) put(refIndex, spelling, file);
    for (const ref of info.refs) put(refIndex, ref, file);
    for (const name of info.imported) put(importIndex, name, file);
  }
  // test -> the helper that holds the match, or null when the test file itself does (it names the path, it mentions the word).
  const matchesOf = (holders) => {
    const result = new Map();
    for (const holder of holders ?? []) for (const test of owners.get(holder) ?? []) if (holder === test) result.set(test, null); else if (!result.has(test)) result.set(test, holder);
    return result;
  };
  const testsOf = (holders) => new Set(matchesOf(holders).keys());

  let tokenIndex = null;
  const mentions = () => {
    if (tokenIndex) return tokenIndex;
    tokenIndex = new Map();
    for (const [file, info] of analysed) for (const token of new Set(info.text.match(IDENTIFIER))) if (token.length >= 4) put(tokenIndex, token, file);
    return tokenIndex;
  };

  return {
    tests: entries,
    byFile: new Map(entries.map((entry) => [entry.file, entry])),
    /**
     * Tests whose closure names `target` (a file) or a folder above it, or is `target` itself: test -> { ref: the path it names,
     * via: the helper that names it, null when the test file does }.
     */
    referencing(target) {
      const result = new Map();
      const collect = (ref) => { for (const [test, via] of matchesOf(refIndex.get(ref))) if (!result.has(test) || (result.get(test).via && !via)) result.set(test, { ref, via }); };
      collect(target);
      const parts = target.split("/");
      for (let length = parts.length - 1; length >= 1; length--) collect(parts.slice(0, length).join("/"));
      return result;
    },
    importing: (name) => testsOf(importIndex.get(name)),
    /** Tests that reach anything inside `folder` by path (a relative import of a source file, a path string). */
    underFolder(folder) {
      const result = new Set();
      for (const [ref, holders] of refIndex) if (ref.startsWith(`${folder}/`)) for (const test of testsOf(holders)) result.add(test);
      return result;
    },
    /** Tests that mention the word: test -> the helper that does, null when the test file does. */
    mentioning: (token) => matchesOf(mentions().get(token)),
    /** Tests with a file (the test or a helper) whose text contains every one of `chunks`: a route written in pieces around its parameters. */
    containingAll(chunks) {
      return testsOf([...analysed].filter(([, info]) => chunks.every((chunk) => info.text.includes(chunk))).map(([file]) => file));
    },
  };
}
