// The Host's public entry is wide (specs/archive/repository-anti-corruption N-11, W1-05).
//
// apps/local-host/src/index.ts re-exports whole files with `export *`, so every helper added to those files becomes public
// surface that tests and other packages can import. This counts the `export *` / `export * as ns` declarations in the
// listed entry files. It may only fall; the narrowing itself (an assembly interface apart from a test port) is a later
// slice, and nothing new may be added to the surface in the meantime.
import { realpathSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

/** The entry files whose `export *` are counted. */
export const HOST_ENTRY_FILES = ["apps/local-host/src/index.ts"];

/** `export * from "…"` and `export * as ns from "…"` declarations of a source text. Exported for the gate's own test. */
export const exportStarCount = (file, text) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  return source.statements.filter((statement) => ts.isExportDeclaration(statement) && statement.moduleSpecifier
    && (!statement.exportClause || ts.isNamespaceExport(statement.exportClause))).length;
};

export const hostEntryExports = (helpers) => recordMetric(helpers, {
  id: "hostEntryExports",
  recordKey: "hostEntryExportStar",
  totalKey: "hostEntryExportStarTotal",
  title: "Host entry `export *` declarations",
  summaryLabel: "host export *",
  measure(snapshot) {
    const record = {};
    for (const file of HOST_ENTRY_FILES) {
      const text = snapshot.read(file);
      const count = text === null ? 0 : exportStarCount(file, text);
      if (count) record[`${file}#export-star`] = count;
    }
    return record;
  },
  message: (key, was, now) => `Host entry \`export *\` in ${key} ${was} → ${now}; export the names a consumer needs from the entry, or let it import the file's package entry; the Host's public surface only narrows`,
});

// ---- width (R4 / B1 / G3, report only) -------------------------------------------------------------------------------
// What the entry's `export *` lines actually make importable: the names of `exports["."]` as the TypeScript checker resolves
// them through every `export *`, `export {}` and alias, read from the snapshot's sources (the working tree, or a commit read from
// the object database), so a name added two files away under a star counts. A type and a value of one name are one name; a
// star never carries `default`, an explicit `default` is one. An `export * as ns` (or a namespace re-exported by name) is a
// namespace: its own reachable members are counted apart, recursively, once per module. Plain object fields are not counted.
// Report only for now: the batch's combined head says what is in flight before it becomes an only-falls rule (decision 37 ③).
const isNamespace = (symbol) => Boolean(symbol.flags & ts.SymbolFlags.ValueModule) || Boolean(symbol.declarations?.some((declaration) => ts.isSourceFile(declaration)));

/** The Host entry's importable names and its namespaces' member counts, or null when the snapshot has no entry. */
export function measureHostEntryWidth(snapshot, root) {
  const entry = HOST_ENTRY_FILES[0];
  if (snapshot.read(entry) === null) return null;
  const tracked = new Set(snapshot.files);
  const options = { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022,
    strict: true, skipLibCheck: true, noEmit: true, allowJs: false, types: [] };
  const host = ts.createCompilerHost(options, true);
  // The compiler compares real paths: a root behind a symbolic link (macOS's /var is /private/var) is taken at its real path.
  const rootPath = realpathSync(path.resolve(root));
  const inRepo = (file) => { const relative = path.relative(rootPath, file).split(path.sep).join("/"); return relative.startsWith("..") || path.isAbsolute(relative) || relative.includes("node_modules/") ? null : relative; };
  const textOf = (file) => { const relative = inRepo(file); return relative === null ? undefined : tracked.has(relative) ? snapshot.read(relative) : null; };
  const disk = { fileExists: host.fileExists, readFile: host.readFile, getSourceFile: host.getSourceFile, directoryExists: host.directoryExists };
  const directories = new Set(snapshot.files.flatMap((file) => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
  host.directoryExists = (directory) => { const relative = inRepo(directory); return relative === null ? disk.directoryExists?.(directory) ?? false : relative === "" || directories.has(relative); };
  host.fileExists = (file) => { const text = textOf(file); return text === undefined ? disk.fileExists(file) : text !== null; };
  host.readFile = (file) => { const text = textOf(file); return text === undefined ? disk.readFile(file) : text ?? undefined; };
  host.getSourceFile = (file, version, ...rest) => { const text = textOf(file); return text === undefined ? disk.getSourceFile(file, version, ...rest) : text === null ? undefined : ts.createSourceFile(file, text, version, true); };
  const program = ts.createProgram([path.join(rootPath, entry)], options, host);
  const checker = program.getTypeChecker();
  const moduleOf = (symbol) => {
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    return isNamespace(resolved) ? resolved : null;
  };
  const source = program.getSourceFile(path.join(rootPath, entry));
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) return { names: 0, namespaces: {} };
  const names = checker.getExportsOfModule(moduleSymbol);
  const namespaces = {}, seen = new Set([moduleSymbol]);
  const walk = (label, symbol) => {
    const target = moduleOf(symbol);
    if (!target || seen.has(target)) return;
    seen.add(target);
    const members = checker.getExportsOfModule(target);
    namespaces[label] = members.length;
    for (const member of members) walk(`${label}.${member.getName()}`, member);
  };
  for (const symbol of names) walk(symbol.getName(), symbol);
  return { names: names.length, namespaces };
}

/** One line for the health gate's output: the width at the merge-base and now. */
export function hostEntryWidthSummary(head, base) {
  const members = (width) => Object.values(width?.namespaces ?? {}).reduce((sum, count) => sum + count, 0);
  const show = (width) => width ? `${width.names} names, ${Object.keys(width.namespaces).length} namespaces (${members(width)} members)` : "none";
  const delta = head && base ? ` (${head.names - base.names >= 0 ? "+" : ""}${head.names - base.names} names)` : "";
  return `Host entry export width (report only) ${base ? `${show(base)} → ` : ""}${show(head)}${delta}`;
}
