#!/usr/bin/env node
// Public API snapshots (specs/repository-anti-corruption §4.13, slice W1-04): what plugins and other callers can import
// from the contracts package (every subpath of its package.json "exports") and from the plugin SDK, written down in
// tooling/gates/api/<package>/<subpath>.txt. The health gate fails when the source and the committed snapshot differ, so
// an export that is added, removed or changed is never silent: the author refreshes the snapshot ON PURPOSE with
//
//   node scripts/gates/api-snapshot.mjs --update        (pnpm api:update)
//
// and the PR shows the change in tooling/gates/api/ and says what it means for plugins and callers.
//
//   node scripts/gates/api-snapshot.mjs                 check: exit 1 when the snapshots do not match the source
//   node scripts/gates/api-snapshot.mjs --update        rewrite tooling/gates/api from the source
//   --root <dir>                                        another repository root (the tests of the gate)
//
// WHAT A SNAPSHOT HOLDS. One file per subpath, built from the compiler's declaration emit of the package's own sources
// (no build needed; `paths` points the package names at src/, so a stale dist/ is never read). Per exported name, in
// name order: its declaration as the compiler prints it, WITHOUT comments, so the signature, the fields of an interface
// and the type of a constant are all part of the snapshot; editing a comment or a function body is not. Helper
// declarations that an export refers to but that no entry exports are listed after the exports (HELPERS below). Every
// statement is its own block, so the overloads of a function, and a type and a const that share a name, are all there; the
// overloads keep their source order, which decides which one a call resolves to. Which file declares a name is not
// recorded, so moving code between files of a package (W5-09) leaves the snapshot alone, except for one case written
// down at stableImports below (a file that no subpath exports and that the compiler names with `import("./x.js")`). A name that the plugin SDK
// re-exports from the contracts is one line pointing at the contracts subpath that carries its declaration, so a
// contract change shows up once.
//
// HELPERS. A name in an exported declaration is looked up where the declaring file can see it: the file's own
// declarations (exported or not), then what the file imports by name from another file of a snapshotted package, then
// `import("./x.js").Name` written by the compiler. Anything found that no entry of any snapshotted package exports is
// listed, and its own names are followed the same way until nothing new comes up (GoalWorkEventBase, which three
// exported record types extend, is declared in an internal file that no subpath exports). A name an entry does export is
// not repeated: it is in that entry's snapshot.
// NOT covered: a name reached through a namespace import (`import * as ns`), and declarations in packages other than the
// snapshotted ones (zod, the node types).
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** The packages whose public surface is snapshotted: a package.json "exports" map pointing into dist/ from src/. */
export const API_PACKAGES = [
  { dir: "packages/contracts", slug: "contracts" },
  { dir: "packages/plugin-sdk", slug: "plugin-sdk" },
];
export const API_DIRECTORY = "tooling/gates/api";
export const API_REFRESH_COMMAND = "node scripts/gates/api-snapshot.mjs --update";

const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const HELPERS_MARKER = "// Declarations the exports above refer to, which no entry exports itself:";

// ---- the entries: one per exported subpath ---------------------------------------------------------------------------
const readEntries = (root) => {
  const entries = [], problems = [];
  for (const pkg of API_PACKAGES) {
    const manifestPath = path.join(root, pkg.dir, "package.json");
    // A root without the package has nothing to snapshot (the scratch repositories of the gate tests). In this repository
    // the packages exist, so the snapshot files below are required.
    if (!existsSync(manifestPath)) continue;
    let manifest;
    try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { problems.push(`${pkg.dir}/package.json is not valid JSON`); continue; }
    const before = entries.length;
    for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
      const types = typeof target === "string" ? target : target?.types ?? target?.import;
      const match = typeof types === "string" ? /^\.\/dist\/([^*]+)\.(?:d\.ts|js)$/.exec(types) : null;
      if (!match || subpath.includes("*")) { problems.push(`${manifest.name}: export "${subpath}" is not a plain subpath pointing into ./dist/; the API snapshot cannot read it`); continue; }
      const source = path.join(root, pkg.dir, "src", `${match[1]}.ts`);
      if (!existsSync(source)) { problems.push(`${manifest.name}: export "${subpath}" has no source at ${pkg.dir}/src/${match[1]}.ts`); continue; }
      entries.push({ pkg, source, name: manifest.name + (subpath === "." ? "" : subpath.slice(1)),
        file: `${API_DIRECTORY}/${pkg.slug}/${subpath === "." ? "index" : subpath.slice(2)}.txt` });
    }
    if (entries.length === before && !problems.length) problems.push(`${manifest.name}: no exported subpath was found to snapshot`);
  }
  return { entries, problems };
};

// ---- the declarations the compiler prints ----------------------------------------------------------------------------
const declaredNames = (statement) => {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.flatMap((declaration) => (ts.isIdentifier(declaration.name) ? [declaration.name.text] : []));
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)
    || ts.isEnumDeclaration(statement) || ts.isModuleDeclaration(statement)) && statement.name && ts.isIdentifier(statement.name)) return [statement.name.text];
  return [];
};
const isExported = (statement) => (ts.canHaveModifiers(statement) ? ts.getModifiers(statement) ?? [] : []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
const tidy = (text) => text.split("\n").map((line) => line.replace(/\s+$/, "")).join("\n");

/**
 * Blocks in snapshot order: by name; declarations that share a name (overloads, a type and a const) keep their order in the
 * source when they come from one file, because the order of overloads decides which one a call resolves to, and are ordered
 * by text when they come from several.
 */
const inOrder = (items) => {
  const groups = new Map();
  for (const item of items) groups.set(item.sort, [...(groups.get(item.sort) ?? []), item]);
  return [...groups.keys()].sort(byText).flatMap((name) => {
    const group = groups.get(name);
    const position = (item) => item.record?.index ?? item.index;
    const oneFile = group.every((item) => item.file !== undefined && item.file === group[0].file);
    return group.sort((a, b) => (oneFile ? position(a) - position(b) : byText(a.text, b.text)));
  });
};

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const TYPE_IMPORT = /import\("(\.{1,2}\/[^"]+?)(?:\.js)?"\)\.([A-Za-z_$][A-Za-z0-9_$]*)/g;

/**
 * The top-level statements of one emitted declaration file, found by name. Every statement is a record of its own (`index`
 * is its place in the file), so overloads and a type that shares its name with a const stay apart. `tokens` are the
 * identifiers the statement writes; `typeImports` are the `import("./x.js").Name` references the compiler wrote.
 */
const indexDeclarations = (text, rewrite, typeImportsOf) => {
  const source = ts.createSourceFile("emitted.d.ts", text, ts.ScriptTarget.Latest, true);
  // `declare const X: …; export { X };` exports a statement that has no `export` keyword of its own.
  const clauseExported = new Set();
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) clauseExported.add((element.propertyName ?? element.name).text);
    }
  }
  const exported = new Map(), locals = new Map();
  source.statements.forEach((statement, index) => {
    const names = declaredNames(statement);
    if (!names.length) return;
    const raw = text.slice(statement.getStart(source), statement.getEnd());
    const isExport = isExported(statement) || names.some((name) => clauseExported.has(name));
    const printed = tidy(rewrite(raw));
    const record = { index, names, text: isExport && !/^export\s/.test(printed) ? `export ${printed}` : printed,
      tokens: new Set(raw.match(IDENTIFIER) ?? []), typeImports: typeImportsOf(raw) };
    const table = isExport ? exported : locals;
    for (const name of names) table.set(name, [...(table.get(name) ?? []), record]);
  });
  return { exported, locals };
};

/**
 * Builds every snapshot from the sources under `root`. Returns { files: Map<relative path, text>, problems: string[] }.
 * `problems` is not empty when a package cannot be read; the snapshots are then not trustworthy.
 */
export const buildApiSnapshots = (root) => {
  const { entries, problems } = readEntries(root);
  const files = new Map();
  if (problems.length || !entries.length) return { files, problems };

  const options = {
    module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022,
    strict: true, skipLibCheck: true, esModuleInterop: true, resolveJsonModule: true,
    declaration: true, emitDeclarationOnly: true, removeComments: true, noEmitOnError: false, outDir: path.join(root, ".api-snapshot-unused"),
    baseUrl: root, paths: Object.fromEntries(entries.map((entry) => [entry.name, [entry.source]])),
    ...(existsSync(path.join(root, "node_modules/@types/node")) ? { types: ["node"], typeRoots: [path.join(root, "node_modules/@types")] } : { types: [] }),
  };
  const program = ts.createProgram(entries.map((entry) => entry.source), options);
  const checker = program.getTypeChecker();
  const emitted = new Map();
  program.emit(undefined, (name, text, _bom, _onError, sourceFiles) => {
    if (name.endsWith(".d.ts") && sourceFiles?.[0]) emitted.set(path.resolve(sourceFiles[0].fileName), text);
  }, undefined, true);
  // Where the compiler wrote `import("./actions.js").Name` (a type it could not name any other way), the snapshot says which
  // exported subpath that is (when the file is some subpath's source), so renaming or moving it changes nothing. If it is no
  // subpath's source the snapshot has only the path from the package's src/ to say, and moving THAT file changes it: a
  // false positive, cleared with `pnpm api:update` (the diff is then a changed path and nothing else). None of the committed
  // snapshots has such a reference today: all 33 `import(...)` references in them name a subpath.
  const entryBySource = new Map(entries.map((entry) => [entry.source, entry]));
  const stableImports = (file) => (text) => text.replace(/import\("(\.{1,2}\/[^"]+?)(?:\.js)?"\)/g, (whole, specifier) => {
    const target = path.resolve(path.dirname(file), `${specifier}.ts`);
    const entry = entryBySource.get(target);
    if (entry) return `import(${JSON.stringify(entry.name)})`;
    const pkg = packageOfFile(target);
    return pkg ? `import(${JSON.stringify(path.relative(sourceRootOf(pkg), target).replace(/\\/g, "/").replace(/\.ts$/, ""))})` : whole;
  });
  const typeImportsOf = (file) => (text) => [...text.matchAll(TYPE_IMPORT)].flatMap(([, specifier, name]) => {
    const target = path.resolve(path.dirname(file), `${specifier}.ts`);
    return program.getSourceFile(target) ? [{ file: target, name }] : [];
  });
  const indexes = new Map();
  const indexOf = (file) => {
    if (!indexes.has(file)) indexes.set(file, indexDeclarations(emitted.get(file) ?? "", stableImports(file), typeImportsOf(file)));
    return indexes.get(file);
  };

  // What every entry exports, resolved through re-exports, so a symbol can be looked up by identity.
  const resolve = (symbol) => (symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol);
  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry.source);
    const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
    entry.exports = moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map((symbol) => ({ exportedName: symbol.getName(), resolved: resolve(symbol) })) : null;
  }
  const exporters = new Map();
  for (const entry of entries) for (const { resolved } of entry.exports ?? []) exporters.set(resolved, [...(exporters.get(resolved) ?? []), entry]);
  const sourceRootOf = (pkg) => path.join(root, pkg.dir, "src") + path.sep;
  const packageOfFile = (file) => API_PACKAGES.find((pkg) => file.startsWith(sourceRootOf(pkg)));

  // What a file exports (resolved through re-exports), by name; used to tell whether some entry already carries a name.
  const moduleExports = new Map();
  const moduleExportsOf = (file) => {
    if (!moduleExports.has(file)) {
      const sourceFile = program.getSourceFile(file);
      const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
      moduleExports.set(file, new Map(moduleSymbol ? checker.getExportsOfModule(moduleSymbol).map((symbol) => [symbol.getName(), resolve(symbol)]) : []));
    }
    return moduleExports.get(file);
  };
  /** The statements of `file` that declare `name` and that no entry exports: candidates for the helpers of an entry. */
  const unexportedNamed = (file, name) => {
    if (!packageOfFile(file)) return [];
    const { exported, locals } = indexOf(file);
    const carried = exporters.has(moduleExportsOf(file).get(name));
    return [...(carried ? [] : exported.get(name) ?? []), ...(locals.get(name) ?? [])].map((record) => ({ file, record }));
  };
  // Per file: token → the declarations that token can mean there and that no entry exports. Those are the file's own
  // declarations (exported ones that no entry carries, and the ones that are not exported at all) and what it imports by name.
  const contexts = new Map();
  const contextOf = (file) => {
    if (contexts.has(file)) return contexts.get(file);
    const byToken = new Map();
    const offer = (token, candidates) => { if (candidates.length) byToken.set(token, [...(byToken.get(token) ?? []), ...candidates]); };
    const { exported, locals } = indexOf(file);
    for (const name of new Set([...exported.keys(), ...locals.keys()])) offer(name, unexportedNamed(file, name));
    for (const statement of program.getSourceFile(file)?.statements ?? []) {
      if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
      const { name, namedBindings } = statement.importClause;
      for (const identifier of [...(name ? [name] : []), ...(namedBindings && ts.isNamedImports(namedBindings) ? namedBindings.elements.map((element) => element.name) : [])]) {
        const alias = checker.getSymbolAtLocation(identifier);
        const target = alias && resolve(alias);
        if (!target || exporters.has(target)) continue;
        offer(identifier.text, [...new Set((target.declarations ?? []).map((declaration) => path.resolve(declaration.getSourceFile().fileName)))]
          .flatMap((declaredIn) => unexportedNamed(declaredIn, target.getName())));
      }
    }
    contexts.set(file, byToken);
    return byToken;
  };

  for (const entry of entries) {
    const header = [`// ${entry.name}: public API snapshot.`,
      `// Generated by \`${API_REFRESH_COMMAND}\`; do not edit by hand. A change below is a change to what plugins and other callers can use:`,
      "// say what it means for them in the PR."];
    if (!entry.exports) { files.set(entry.file, tidy(`${header.join("\n")}\n\n// <the entry has no module symbol>\n`)); problems.push(`${entry.name}: the entry is not a module`); continue; }

    // One block per statement (file + place in the file), so overloads and a type that shares its name with a const are all
    // here. A statement exported under two names appears once per name, with the alias noted.
    const blocks = new Map(); // key → { sort, text, reference, file, record }
    const printed = new Set(); // `${file}:${record.index}` of the statements printed as exports
    const add = (key, sort, text, extra = {}) => { if (!blocks.has(key)) blocks.set(key, { sort, text, ...extra }); };
    for (const { exportedName, resolved } of entry.exports) {
      const declarations = resolved.declarations ?? [];
      if (!declarations.length) { add(`unresolved:${exportedName}`, exportedName, `// ${exportedName}: unresolved export`); continue; }
      const declaringFiles = [...new Set(declarations.map((declaration) => path.resolve(declaration.getSourceFile().fileName)))];
      const renamed = exportedName !== resolved.getName() ? `\n// exported from this entry as ${JSON.stringify(exportedName)}` : "";

      // A name declared in another snapshotted package (the plugin SDK re-exporting a contract) is one line, pointing at the
      // subpath whose snapshot carries the declaration.
      const otherPackage = declaringFiles.map(packageOfFile).find((pkg) => pkg && pkg !== entry.pkg);
      const carriers = otherPackage ? (exporters.get(resolved) ?? []).filter((carrier) => carrier.pkg === otherPackage) : [];
      if (carriers.length) {
        const carrier = carriers.find((candidate) => declaringFiles.includes(path.resolve(candidate.source))) ?? carriers.sort((a, b) => byText(a.name, b.name))[0];
        const isTypeOnly = !(resolved.flags & ts.SymbolFlags.Value);
        const specifier = renamed ? `${resolved.getName()} as ${exportedName}` : exportedName;
        add(`ref:${exportedName}`, exportedName, `export ${isTypeOnly ? "type " : ""}{ ${specifier} } from ${JSON.stringify(carrier.name)};`, { reference: true });
        continue;
      }
      if (resolved.flags & ts.SymbolFlags.ValueModule && declarations.every((declaration) => ts.isSourceFile(declaration))) {
        add(`namespace:${exportedName}`, exportedName, `export * as ${exportedName} from "<module ${path.relative(root, declaringFiles[0]).replace(/\\/g, "/")}>";`);
        continue;
      }
      let found = false;
      for (const file of declaringFiles) {
        for (const record of indexOf(file).exported.get(resolved.getName()) ?? []) {
          found = true;
          printed.add(`${file}:${record.index}`);
          add(`${file}:${record.index}:${renamed ? exportedName : ""}`, exportedName, record.text + renamed, { file, record });
        }
      }
      if (!found) add(`missing:${exportedName}`, exportedName, `// ${exportedName}: no declaration in the compiler's output`);
    }

    // Helpers: what the exports above refer to and no entry exports, followed until nothing new comes up (see HELPERS in the
    // header). The lookups of a statement are those of the file that declares it.
    const pulled = new Map(); // `${file}:${index}` → { sort, file, index, text }
    const queue = [...blocks.values()].filter((block) => block.record).map((block) => ({ file: block.file, record: block.record }));
    const pull = (file, record) => {
      const key = `${file}:${record.index}`;
      if (pulled.has(key) || printed.has(key)) return;
      pulled.set(key, { sort: record.names[0], file, index: record.index, text: record.text.replace(/^export\s+/, "") });
      queue.push({ file, record });
    };
    for (let next = 0; next < queue.length; next++) {
      const { file, record } = queue[next];
      const context = contextOf(file);
      for (const token of record.tokens) for (const candidate of context.get(token) ?? []) pull(candidate.file, candidate.record);
      for (const reference of record.typeImports) for (const candidate of unexportedNamed(reference.file, reference.name)) pull(candidate.file, candidate.record);
    }

    // Re-export lines stay together, one per line; everything else is a paragraph of its own.
    const exportsText = [];
    let previousReference = false;
    for (const block of inOrder([...blocks.values()])) {
      if (block.reference && previousReference) exportsText[exportsText.length - 1] += `\n${block.text}`;
      else exportsText.push(block.text);
      previousReference = block.reference;
    }
    const helperText = inOrder([...pulled.values()]).map((helper) => helper.text);
    const parts = [header.join("\n"), exportsText.length ? exportsText.join("\n\n") : "// <no exports>"];
    if (helperText.length) parts.push(HELPERS_MARKER, helperText.join("\n\n"));
    files.set(entry.file, parts.join("\n\n") + "\n");
  }
  return { files, problems };
};

// ---- the committed snapshots ------------------------------------------------------------------------------------------
const listSnapshotFiles = (root) => {
  const base = path.join(root, API_DIRECTORY);
  const found = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (item.isDirectory()) walk(path.join(directory, item.name));
      else found.push(path.relative(root, path.join(directory, item.name)).replace(/\\/g, "/"));
    }
  };
  walk(base);
  return found.sort(byText);
};

// A snapshot file is a header block, then one block per declaration, separated by blank lines. The compiler prints
// declarations without blank lines inside them, so a block is one declaration (or one unresolved-export note).
const HEADER_BLOCK = /^\/\/ \S+: public API snapshot\./;
const REFERENCE_LINE = /^export (?:type )?\{[^}]*\} from "[^"]+";$/;
const blocksOf = (text) => text.split(/\n{2,}/).map((block) => block.trim()).filter((block) => block && !HEADER_BLOCK.test(block) && block !== HELPERS_MARKER)
  .flatMap((block) => (block.split("\n").every((line) => REFERENCE_LINE.test(line)) ? block.split("\n") : [block]));
const ALIAS_NOTE = /^\/\/ exported from this entry as ("[^"]*")$/m;
const headline = (block) => `${block.split("\n")[0].replace(/\s+/g, " ").slice(0, 110)}${ALIAS_NOTE.exec(block) ? ` [as ${ALIAS_NOTE.exec(block)[1]}]` : ""}`;

/**
 * The declarations that differ between two snapshot texts, one line each: `- headline` removed, `+ headline` added, and
 * `~ headline (- old line; + new line)` for a declaration whose first line is the same but whose body changed (a field
 * added to an interface, a member of a class changed).
 */
export const describeApiChange = (before, after) => {
  const was = blocksOf(before ?? ""), now = blocksOf(after ?? "");
  const wasSet = new Set(was), nowSet = new Set(now);
  const added = now.filter((block) => !wasSet.has(block));
  // Declarations that share a headline (overloads) pair with the added one that differs from them in the fewest lines.
  const trim = (line) => line.trim().replace(/[;,]$/, "");
  const differences = (a, b) => { const left = a.split("\n").map(trim), right = b.split("\n").map(trim); return [...left.filter((line) => !right.includes(line)).map((line) => `- ${line}`), ...right.filter((line) => !left.includes(line)).map((line) => `+ ${line}`)]; };
  const out = [], paired = new Set();
  for (const block of was.filter((candidate) => !nowSet.has(candidate))) {
    const candidates = added.filter((candidate) => !paired.has(candidate) && headline(candidate) === headline(block));
    if (!candidates.length) { out.push(`- ${headline(block)}`); continue; }
    const [partner, changes] = candidates.map((candidate) => [candidate, differences(block, candidate)]).sort((a, b) => a[1].length - b[1].length)[0];
    paired.add(partner);
    out.push(`~ ${headline(block)} (${changes.slice(0, 4).join("; ")}${changes.length > 4 ? "; …" : ""})`);
  }
  for (const block of added) if (!paired.has(block)) out.push(`+ ${headline(block)}`);
  return out;
};

/** Writes the snapshots (and removes files that no longer belong). Returns the paths written and removed. */
export const writeApiSnapshots = (root) => {
  const { files, problems } = buildApiSnapshots(root);
  if (problems.length) return { problems, written: [], removed: [] };
  const written = [], removed = [];
  for (const [file, text] of files) {
    const target = path.join(root, file);
    if (existsSync(target) && readFileSync(target, "utf8") === text) continue;
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
    written.push(file);
  }
  if (files.size) for (const file of listSnapshotFiles(root)) if (!files.has(file)) { rmSync(path.join(root, file)); removed.push(file); }
  return { problems, written, removed };
};

const preview = (lines, limit) => lines.slice(0, limit).join("\n    ") + (lines.length > limit ? `\n    … ${lines.length - limit} more` : "");

/**
 * The gate. Compares the snapshots built from the sources with the committed files. `git` (a function taking git arguments)
 * and `mergeBase` are optional: with them the result also carries a note on what the public API changed against the
 * merge-base (the committed snapshots there against the ones now), so a reviewer reads the change in the CI log.
 * Returns { errors, notes, summary }.
 */
export const checkApiSnapshots = ({ root, git, mergeBase }) => {
  const { files, problems } = buildApiSnapshots(root);
  if (problems.length) return { errors: problems.map((problem) => `public API: ${problem}`), notes: [], summary: "" };
  if (!files.size) return { errors: [], notes: ["no API package in this root, so no public API snapshot was compared"], summary: "" };

  const errors = [];
  const committed = new Set(listSnapshotFiles(root));
  const differences = [];
  for (const [file, text] of files) {
    if (!committed.has(file)) { differences.push(`${file}: no snapshot (a new subpath, or the snapshots were never generated)`); continue; }
    const current = readFileSync(path.join(root, file), "utf8");
    if (current !== text) {
      const change = describeApiChange(current, text);
      differences.push(`${file}: the source no longer matches the snapshot${change.length ? `\n    ${preview(change, 8)}` : " (formatting only)"}`);
    }
  }
  for (const file of committed) if (!files.has(file)) differences.push(`${file}: no longer an exported subpath; the snapshot is stale`);
  if (differences.length) {
    errors.push(`public API of the contracts or the plugin SDK changed without a snapshot update (${differences.length} file${differences.length === 1 ? "" : "s"}):\n  ${differences.slice(0, 12).join("\n  ")}${differences.length > 12 ? `\n  … ${differences.length - 12} more` : ""}\n`
      + `  If the change is intended, refresh the snapshots on purpose with \`${API_REFRESH_COMMAND}\` (or \`pnpm api:update\`), commit tooling/gates/api, and say in the PR what it means for plugins and other callers.`);
  }

  const notes = [];
  if (mergeBase && git) {
    try {
      const listed = git(["ls-tree", "-r", "-z", "--name-only", mergeBase, "--", API_DIRECTORY]).split("\0").filter(Boolean).sort(byText);
      const before = new Map(listed.map((file) => [file, git(["cat-file", "blob", `${mergeBase}:${file}`])]));
      if (!before.size) notes.push("the merge-base has no public API snapshots, so no API change was listed");
      else {
        const changed = [];
        for (const file of [...new Set([...before.keys(), ...files.keys()])].sort(byText)) {
          if (before.get(file) === files.get(file)) continue;
          const change = describeApiChange(before.get(file), files.get(file));
          changed.push(`${file.slice(API_DIRECTORY.length + 1).replace(/\.txt$/, "")}${before.has(file) ? "" : " (new subpath)"}${files.has(file) ? "" : " (subpath removed)"}: ${change.length ? change.slice(0, 4).join("; ") : "formatting only"}${change.length > 4 ? `; … ${change.length - 4} more` : ""}`);
        }
        if (changed.length) notes.push(`public API changes against the merge-base (${changed.length} snapshot file${changed.length === 1 ? "" : "s"}; the PR must say what they mean for plugins and callers):\n    ${preview(changed, 20)}`);
      }
    } catch (error) {
      errors.push(`public API: could not read the merge-base snapshots: ${String(error.message ?? error).split("\n")[0]}`);
    }
  }
  const exportCount = [...files.values()].reduce((sum, text) => sum + blocksOf(text).length, 0);
  return { errors, notes, summary: `${files.size} API snapshot files, ${exportCount} declarations` };
};

// ---- command line ----------------------------------------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href) {
  const USAGE = "usage: api-snapshot.mjs [--update] [--root <dir>]";
  const args = process.argv.slice(2);
  let update = false, root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--update") update = true;
    else if (args[index] === "--root" && args[index + 1]) root = path.resolve(args[++index]);
    else { console.error(`unknown argument ${args[index]}\n${USAGE}`); process.exit(2); }
  }
  if (update) {
    const result = writeApiSnapshots(root);
    if (result.problems.length) { console.error(result.problems.map((problem) => `public API: ${problem}`).join("\n")); process.exit(2); }
    console.log(`public API snapshots: ${result.written.length} written, ${result.removed.length} removed, rest unchanged (${API_DIRECTORY})`);
    for (const file of [...result.written, ...result.removed.map((removed) => `${removed} (removed)`)].slice(0, 40)) console.log(`  ${file}`);
  } else {
    const result = checkApiSnapshots({ root });
    if (result.errors.length) { console.error(result.errors.join("\n")); process.exit(1); }
    console.log(`public API snapshots match the source (${result.summary || result.notes.join("; ")})`);
  }
}
