// What the tests say about packages: every import in a tests/ file that names a package (its internal references, which the
// health gate counts, and the package-name ones), who else imports a package's entry, and which imports a compiler would erase.
import path from "node:path";
import ts from "typescript";
import { INTERNAL_TARGET, isTestFile } from "./graph.mjs";
import { parseImports } from "./parse.mjs";

const SOURCE = /\.(?:ts|mts|mjs)$/;
const TS_SOURCE = /\.(?:ts|mts)$/;

/** True for an import whose specifier is a path into some package's src/ or dist/ (the gate's definition of an internal import). */
export const isInternal = (file, spec) => spec.startsWith(".") && INTERNAL_TARGET.test(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));

/**
 * Every tests/ file with its imports, read with detail, and the references to workspace packages among them:
 *   refs   { file, imp, pkg, kind: src | dist, target }   one per internal reference to a package's src/ or dist/
 * `files` maps a file to { file, text, imports, names } where `names` counts its imports of each package by package name.
 */
export function collectRefs(graph, snapshot) {
  const files = new Map();
  const refs = [];
  for (const file of snapshot.files.filter((entry) => isTestFile(entry) && SOURCE.test(entry)).sort()) {
    const text = snapshot.read(file);
    if (text === null) continue;
    const info = { file, text, imports: parseImports(file, text, { deep: true, detail: true }), names: new Map() };
    files.set(file, info);
    for (const imp of info.imports) {
      imp.found = graph.classify(file, imp.spec);
      if ((imp.found.kind === "src" || imp.found.kind === "dist") && isInternal(file, imp.spec)) refs.push({ file, imp, pkg: imp.found.pkg, kind: imp.found.kind, target: imp.found.file });
      else if (imp.found.kind === "name") info.names.set(imp.found.pkg.name, (info.names.get(imp.found.pkg.name) ?? 0) + 1);
    }
  }
  return { files, refs };
}

/**
 * The names each package's entries are imported by, split into those code outside the package and outside tests/ imports
 * (the composition roots' real consumers) and those tests import: { outside, tests }, each a Map of package name to a Set of
 * exported names. Only imports by package name count.
 */
export function consumerNames(graph, snapshot) {
  const outside = new Map(), tests = new Map();
  const add = (table, pkg, name) => { if (!table.has(pkg)) table.set(pkg, new Set()); table.get(pkg).add(name); };
  const mentions = new RegExp([...graph.packages.keys()].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"));
  for (const file of snapshot.files.filter((entry) => SOURCE.test(entry) && !/\.d\.ts$/.test(entry))) {
    const text = snapshot.read(file);
    if (text === null || !mentions.test(text)) continue;
    const inTests = isTestFile(file);
    const owner = graph.ownerOf(file);
    for (const imp of parseImports(file, text, { deep: inTests, detail: true })) {
      const found = graph.classify(file, imp.spec);
      if (found.kind !== "name" || !imp.names) continue;
      if (inTests) for (const element of imp.names) add(tests, found.pkg.name, element.imported);
      else if (owner?.name !== found.pkg.name) for (const element of imp.names) add(outside, found.pkg.name, element.imported);
    }
  }
  return { outside, tests };
}

/**
 * Which imports the compiler erases because they are only used as types (TypeScript and esbuild both drop an import that is
 * never used as a value), found by transpiling the file and seeing what survives. Returns a Map from an index in `imports` to
 * "whole" (the declaration disappears) or a Set of the element names that disappear. Only static imports and `export … from`
 * that are not already type-only are looked at; dynamic imports are always kept.
 */
export function erasedImports(file, text, imports) {
  if (!TS_SOURCE.test(file)) return new Map();
  const output = ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, isolatedModules: true, verbatimModuleSyntax: false } }).outputText;
  const kept = parseImports("out.js", output, { detail: true });
  const key = (record) => `${record.form}\0${record.spec}`;
  const counter = new Map();
  const survivors = new Map();
  for (const record of kept) survivors.set(key(record), [...(survivors.get(key(record)) ?? []), record]);
  const erased = new Map();
  imports.forEach((record, index) => {
    if (record.typeOnly || (record.form !== "import" && record.form !== "export")) return;
    const nth = counter.get(key(record)) ?? 0;
    counter.set(key(record), nth + 1);
    const survivor = (survivors.get(key(record)) ?? [])[nth];
    if (!survivor) { if (record.names?.length) erased.set(index, "whole"); return; }
    if (!record.names || !survivor.names) return;
    const present = new Set(survivor.names.map((element) => element.imported));
    const gone = new Set(record.names.filter((element) => !element.typeOnly && !present.has(element.imported)).map((element) => element.imported));
    if (gone.size) erased.set(index, gone);
  });
  return erased;
}
