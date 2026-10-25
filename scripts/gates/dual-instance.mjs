// Gate: dual-instance plugins (specs/dual-instance-plugins, PG-012). Only adds checks; it loosens no other rule.
//
// A dual-instance plugin is one `plugin_id` with a Home half (a Home catalog entry whose `runtime` says `dual_instance: true`)
// and a project half (the same registration's `project_runtime`, PG-067, or an entry of the project start list that a factory
// with Host ports still needs, apps/local-host/src/project-plugins.ts). The Host already refuses a
// wrong pairing when it starts (apps/local-host/src/plugin-scope-entries.ts); this gate says so in review, and adds the one rule
// the Host does not check:
//   1. marked ⇔ on both lists: a marked Home entry's package has a project half, and a Home entry's package that the project
//      start list also starts is marked;
//   2. both halves ship with the Host: every catalog entry does, so a project half on the start list says
//      `trust: HOST_BUILD_TRUST` (the Host gives it to every `project_runtime` itself);
//   3. no optional permission (user 2026-10-20, U1): every permission of a marked entry's Manifest is an object literal with
//      `required: true`.
//
// Read as syntax, nothing is executed. A plugin is named by its package: the Home entry's `runtime.package_name`, the
// `project_runtime.package_name`, the package a start-list entry's `definition: create…(…)` factory is imported from. What it cannot read fails rather than passes: a marked
// entry whose Manifest, permission list or a permission is not written so that the gate can follow it (a spread, a computed
// `required`, a call it does not know), and a project entry whose `definition` is not a call of an imported factory. It follows a
// Manifest through `import { x } from "./…js"`, `export { x } from`, `export *` and `export const x = …` (with `as`,
// `satisfies` and parentheses), within the plugin's own files; a Manifest built by a function call is not followed.
import path from "node:path";
import ts from "typescript";
import { catalogEntries } from "./catalog-entries.mjs";

export const PROJECT_START_LIST = "apps/local-host/src/project-plugins.ts";

const parse = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const unwrap = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node))) node = node.expression;
  return node;
};
// `{ key: value }`, or the shorthand `{ key }` read as `{ key: key }`.
const property = (object, key) => {
  const item = object.properties.find((each) => (ts.isPropertyAssignment(each) || ts.isShorthandPropertyAssignment(each)) && each.name.getText() === key);
  return item && ts.isShorthandPropertyAssignment(item) ? { initializer: item.name } : item;
};
// A spread can bring in or override any key, so an object with one cannot be read for what it says.
const spreads = (object) => object.properties.some((item) => ts.isSpreadAssignment(item));
const isTrue = (node) => unwrap(node)?.kind === ts.SyntaxKind.TrueKeyword;
const literal = (node) => (node && ts.isStringLiteral(unwrap(node)) ? unwrap(node).text : null);

/** Every problem with the tree's dual-instance declarations; [] when there are none (there are none to check today). */
export function dualInstanceProblems(snapshot) {
  const home = homeEntries(snapshot), project = projectHalves(snapshot);
  const problems = [...home.problems, ...project.problems];
  for (const entry of home.entries) {
    const half = project.halves.get(entry.package);
    if (entry.marked && !half) problems.push(`${entry.file}: runtime.dual_instance marks ${entry.package} as a dual-instance plugin, but its registration declares no project_runtime and ${PROJECT_START_LIST} starts no project half of it`);
    if (!entry.marked && half) problems.push(`${half.file}: ${entry.package} is also a Home catalog entry (${entry.file}); a plugin with both halves says runtime.dual_instance: true on its Home entry`);
    if (entry.marked && half && !half.hostBuilt) problems.push(`${half.file}: the project half of the dual-instance plugin ${entry.package} must say trust: HOST_BUILD_TRUST, as its Home half ships with the Host`);
    if (entry.marked) problems.push(...optionalPermissions(snapshot, entry));
  }
  return problems;
}

/** The catalog's Home entries: `{ file, object, package, marked }`, and what is wrong with how they say `dual_instance`. */
function homeEntries(snapshot) {
  const entries = [], problems = [];
  for (const { file, object } of catalogEntries(snapshot)) {
    const runtime = unwrap(property(object, "runtime")?.initializer);
    if (!runtime || !ts.isObjectLiteralExpression(runtime) || literal(property(runtime, "scope")?.initializer) !== "home") continue;
    const mark = property(runtime, "dual_instance");
    if (mark && !isTrue(mark.initializer)) problems.push(`${file}: write runtime.dual_instance as the literal true, or leave it out`);
    entries.push({ file, object, package: literal(property(runtime, "package_name")?.initializer), marked: Boolean(mark) && isTrue(mark.initializer) });
  }
  return { entries, problems };
}

/**
 * Project halves by package: `{ file, hostBuilt }`, from each registration's `project_runtime` (the Host starts it with its own
 * build's trust) and each start-list entry's `definition: create…(…)` call's import.
 */
function projectHalves(snapshot) {
  const halves = new Map(), problems = [];
  for (const { file, object } of catalogEntries(snapshot)) {
    const declared = unwrap(property(object, "project_runtime")?.initializer);
    if (!declared) continue;
    const name = ts.isObjectLiteralExpression(declared) ? literal(property(declared, "package_name")?.initializer) : null;
    if (name) halves.set(name, { file, hostBuilt: true });
    else problems.push(`${file}: cannot tell which plugin package project_runtime starts; write it as an object literal with a literal package_name`);
  }
  const text = snapshot.read(PROJECT_START_LIST);
  if (text === null) return { halves, problems };
  const tree = parse(PROJECT_START_LIST, text), imports = importedNames(tree);
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node) && property(node, "definition")) {
      const call = unwrap(property(node, "definition").initializer);
      // The entry the start list makes of each registration's `project_runtime` (`declaration.create()`): those halves are read
      // from the registrations above, and the trust written here is the one each of them is started with.
      if (call && ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "create") {
        const hostBuilt = isHostBuildTrust(property(node, "trust")?.initializer);
        for (const [name, half] of halves) if (half.file !== PROJECT_START_LIST) halves.set(name, { ...half, hostBuilt });
        ts.forEachChild(node, visit);
        return;
      }
      const from = call && ts.isCallExpression(call) && ts.isIdentifier(call.expression) ? imports.get(call.expression.text) : undefined;
      if (!from || from.specifier.startsWith(".")) problems.push(`${PROJECT_START_LIST}: cannot tell which plugin package the entry \`${node.getText().slice(0, 60)}…\` starts; write its definition as a call of a factory imported from the plugin's package`);
      else halves.set(from.specifier, { file: PROJECT_START_LIST, hostBuilt: isHostBuildTrust(property(node, "trust")?.initializer) });
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return { halves, problems };
}

/** Whether an entry's `trust` is the Host's own build: the `HOST_BUILD_TRUST` constant, or the literal `{ level: "host" }`. */
function isHostBuildTrust(node) {
  const value = unwrap(node);
  if (value && ts.isIdentifier(value)) return value.text === "HOST_BUILD_TRUST";
  return Boolean(value) && ts.isObjectLiteralExpression(value) && literal(property(value, "level")?.initializer) === "host";
}

/** Local name -> `{ specifier, imported }` for a file's value imports. */
function importedNames(tree) {
  const names = new Map();
  for (const statement of tree.statements) {
    const bindings = ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly ? statement.importClause?.namedBindings : null;
    if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) {
      if (!item.isTypeOnly) names.set(item.name.text, { specifier: statement.moduleSpecifier.text, imported: (item.propertyName ?? item.name).text });
    }
  }
  return names;
}

/** Rule 3 for one marked entry: each permission of its Manifest is an object literal saying `required: true`. */
function optionalPermissions(snapshot, entry) {
  const manifest = follow(snapshot, entry.file, property(entry.object, "manifest")?.initializer);
  if (!manifest || !ts.isObjectLiteralExpression(manifest.node) || spreads(manifest.node)) return [`${entry.file}: cannot read the Manifest of the dual-instance plugin ${entry.package}; write it as an object literal the gate can follow, without a spread (scripts/gates/dual-instance.mjs)`];
  const declared = property(manifest.node, "permissions");
  if (!declared) return [];
  const list = follow(snapshot, manifest.file, declared.initializer);
  if (!list || !ts.isArrayLiteralExpression(list.node)) return [`${list?.file ?? manifest.file}: cannot read the permissions of the dual-instance plugin ${entry.package}; write them as an array literal the gate can follow`];
  return list.node.elements.flatMap((element) => {
    const permission = follow(snapshot, list.file, element);
    if (permission && ts.isObjectLiteralExpression(permission.node) && !spreads(permission.node) && isTrue(property(permission.node, "required")?.initializer)) return [];
    return [`${list.file}: the dual-instance plugin ${entry.package} has a permission that is not \`required: true\` as a literal (\`${element.getText().slice(0, 80)}\`); every permission of a dual-instance plugin is required (specs/dual-instance-plugins, U1)`];
  });
}

/** The expression a name stands for, followed through the plugin's own files: `{ file, node }`, or null when it cannot be followed. */
function follow(snapshot, file, node, seen = new Set()) {
  node = unwrap(node);
  if (!node || !ts.isIdentifier(node)) return node ? { file, node } : null;
  const key = `${file}#${node.text}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const text = snapshot.read(file), tree = text === null ? null : parse(file, text);
  return tree ? lookup(snapshot, file, tree, node.text, seen) : null;
}

/** Where `name` is declared in `tree`: a top-level const, an import, or a re-export of another of the plugin's files. */
function lookup(snapshot, file, tree, name, seen) {
  for (const statement of tree.statements) {
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return follow(snapshot, file, declaration.initializer, seen);
    }
  }
  const imported = importedNames(tree).get(name);
  if (imported) return across(snapshot, file, imported.specifier, imported.imported, seen);
  for (const statement of tree.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier || statement.isTypeOnly) continue;
    const named = statement.exportClause && ts.isNamedExports(statement.exportClause)
      ? statement.exportClause.elements.find((item) => item.name.text === name) : undefined;
    if (named) return across(snapshot, file, statement.moduleSpecifier.text, (named.propertyName ?? named.name).text, seen);
    if (!statement.exportClause) {
      const found = across(snapshot, file, statement.moduleSpecifier.text, name, seen);
      if (found) return found;
    }
  }
  return null;
}

/** `name` as exported by the relative module `specifier` of `file` (`./x.js` is read as `./x.ts`); other modules are not followed. */
function across(snapshot, file, specifier, name, seen) {
  if (!specifier.startsWith(".")) return null;
  const target = path.posix.join(path.posix.dirname(file), specifier.replace(/\.js$/u, ".ts"));
  // `export *` between two files that point at each other is a cycle no identifier closes.
  const key = `${target}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const text = snapshot.read(target);
  return text === null ? null : lookup(snapshot, target, parse(target, text), name, seen);
}
