// Which names a package makes public, and under which entry. The question for a test that imports `{ X }` from
// ../apps/local-host/src/y.ts is whether X is also exported, as the same declaration, by one of the package's `exports`
// entries; if so the test can import it from the entry instead (or from a subpath of a contracts-style package).
//
// The answer comes from the TypeScript checker, not from reading export statements: `paths` points every package name at its
// src/, the checker resolves each entry's exports through `export *`, `export {} from`, aliases and namespace re-exports to the
// declaration, and two names are the same exactly when their resolved symbols are the same object. No build is needed and a
// stale dist is never read. Only the sources of the snapshot are read, so a commit can be measured without a checkout.
import path from "node:path";
import ts from "typescript";

/**
 * `files` are the extra source files whose exports will be asked about (the targets of the tests' imports). Every package entry
 * is a root already. Returns { publicEntries(file, name) } where publicEntries lists { subpath, name } for each entry of the
 * file's own package that exports the same declaration under `name`, or [] when there is none (or the file has no such export).
 */
export function createExportIndex(graph, snapshot, files, root) {
  const entries = [];
  for (const pkg of graph.packages.values()) {
    for (const entry of graph.entriesOf(pkg)) if (entry.file) entries.push({ pkg, subpath: entry.subpath, file: entry.file, specifier: entry.subpath === "." ? pkg.name : `${pkg.name}/${entry.subpath.slice(2)}` });
  }
  const options = {
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022,
    strict: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true, noEmit: true,
    baseUrl: path.resolve(root), paths: Object.fromEntries(entries.map((entry) => [entry.specifier, [entry.file]])),
    ...(ts.sys.directoryExists(path.join(root, "node_modules/@types/node")) ? { types: ["node"], typeRoots: [path.join(root, "node_modules/@types")] } : { types: [] }),
  };
  // The compiler reads the snapshot's sources and, for the language library and dependencies' declarations, the disk.
  const host = ts.createCompilerHost(options, true);
  const absolute = (file) => path.resolve(root, file);
  const relative = (file) => path.relative(path.resolve(root), file).split(path.sep).join("/");
  const inSnapshot = (file) => (graph.known.has(relative(file)) && !relative(file).startsWith("..") ? snapshot.read(relative(file)) : null);
  const base = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile };
  host.fileExists = (file) => (graph.known.has(relative(file)) && !relative(file).startsWith("..") && /\.(?:ts|mts)$/.test(file) ? inSnapshot(file) !== null : base.fileExists(file));
  host.readFile = (file) => inSnapshot(file) ?? base.readFile(file);
  host.getSourceFile = (file, languageVersion, ...rest) => {
    const text = /\.(?:ts|mts)$/.test(file) ? inSnapshot(file) : null;
    return text === null ? base.getSourceFile(file, languageVersion, ...rest) : ts.createSourceFile(file, text, languageVersion, true);
  };
  const roots = [...new Set([...entries.map((entry) => entry.file), ...files])].map(absolute);
  const program = ts.createProgram(roots, options, host);
  const checker = program.getTypeChecker();
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  const moduleExports = new Map();
  const exportsOf = (file) => {
    if (!moduleExports.has(file)) {
      const sourceFile = program.getSourceFile(absolute(file));
      const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
      moduleExports.set(file, new Map(moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.getName(), resolve(symbol)]) : []));
    }
    return moduleExports.get(file);
  };
  const exporters = new Map();
  for (const entry of entries) for (const [name, symbol] of exportsOf(entry.file)) exporters.set(symbol, [...(exporters.get(symbol) ?? []), { pkg: entry.pkg.name, subpath: entry.subpath, name, file: entry.file }]);

  return {
    publicEntries(file, name) {
      const symbol = exportsOf(file).get(name);
      const owner = graph.ownerOf(file);
      return symbol && owner ? (exporters.get(symbol) ?? []).filter((entry) => entry.pkg === owner.name) : [];
    },
  };
}
