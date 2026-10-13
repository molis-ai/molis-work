// Syntax-only module/binding graph for browser programs. Reads a snapshot; never imports repository code.
import path from "node:path";
import ts from "typescript";

export const unwrapBrowserNode = (node) => {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isSatisfiesExpression(node)
    || ts.isNonNullExpression(node) || ts.isTypeAssertionExpression(node))) node = node.expression;
  return node;
};
export const browserName = (node) => node && (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) ? node.text : null;
const fn = (node) => Boolean(node) && (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node));
const scopeOf = (node) => {
  for (let at = node.parent; at; at = at.parent) if (ts.isSourceFile(at) || ts.isBlock(at) || fn(at)) return at;
  return node.getSourceFile();
};
const exported = (node) => node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword);
const sourcePath = (value) => value.replace(/(^|\/)dist\//, "$1src/").replace(/\.m?js$/, ".ts");
export const browserWantsText = (file) => /(^|\/)package\.json$/.test(file);

export function createBrowserGraph(snapshot, isSource) {
  const entries = new Map(), scopes = new WeakMap(), packages = new Map(), properties = new Map();
  for (const file of snapshot.files) {
    if (browserWantsText(file)) {
      const text = snapshot.read(file); if (text === null) continue;
      try { const json = JSON.parse(text); if (json.name) packages.set(json.name, { dir: path.posix.dirname(file), json }); }
      catch { /* The package inventory validates malformed package manifests separately. */ }
    }
    if (!isSource(file)) continue;
    const text = snapshot.read(file); if (text === null) continue;
    entries.set(file, { file, text, tree: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true), exports: new Map(), imports: [], stars: [] });
  }
  const addBinding = (scope, name, binding) => {
    if (!name) return;
    let names = scopes.get(scope); if (!names) scopes.set(scope, names = new Map()); names.set(name, binding);
  };
  const resolveModule = (file, specifier) => {
    if (specifier.startsWith(".")) {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      return [sourcePath(base), base + ".ts", base + "/index.ts"].find((item) => entries.has(item)) ?? null;
    }
    const name = specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0];
    const pkg = packages.get(name); if (!pkg) return null;
    const subpath = "." + specifier.slice(name.length);
    let target = pkg.json.exports?.[subpath];
    if (subpath === "." && typeof pkg.json.exports === "string") target = pkg.json.exports;
    if (target && typeof target === "object") target = target.import ?? target.default ?? target.types;
    if (typeof target !== "string") return null;
    const resolved = path.posix.normalize(path.posix.join(pkg.dir, sourcePath(target)));
    return entries.has(resolved) ? resolved : null;
  };
  for (const entry of entries.values()) {
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        addBinding(scopeOf(node), browserName(node.name), { file: entry.file, node, value: node.initializer });
        if (ts.isObjectBindingPattern(node.name)) for (const item of node.name.elements) {
          addBinding(scopeOf(node), browserName(item.name), { file: entry.file, node: item, value: item.initializer,
            property: browserName(item.propertyName ?? item.name), receiver: node.initializer });
        }
      } else if (ts.isFunctionDeclaration(node) && node.name) {
        addBinding(scopeOf(node), node.name.text, { file: entry.file, node, value: node });
      }
      if (ts.isPropertyAssignment(node) || ts.isShorthandPropertyAssignment(node)) {
        const name = browserName(node.name);
        if (name) { if (!properties.has(name)) properties.set(name, []); properties.get(name).push(ts.isPropertyAssignment(node) ? node.initializer : node.name); }
      }
      if (ts.isMethodDeclaration(node) && node.body) {
        const name = browserName(node.name);
        if (name) { if (!properties.has(name)) properties.set(name, []); properties.get(name).push(node); }
      }
      ts.forEachChild(node, visit);
    };
    visit(entry.tree);
    for (const statement of entry.tree.statements) {
      if (ts.isImportDeclaration(statement) && !statement.importClause?.isTypeOnly) {
        const module = resolveModule(entry.file, statement.moduleSpecifier.text);
        const members = statement.importClause?.namedBindings;
        const runtime = !members || !ts.isNamedImports(members) || !members.elements.length
          || Boolean(statement.importClause.name) || members.elements.some((item) => !item.isTypeOnly);
        if (module && runtime) entry.imports.push(module);
        if (!statement.importClause) continue;
        const bind = (name, imported) => addBinding(entry.tree, name, { file: entry.file, node: statement, module, imported });
        if (statement.importClause.name) bind(statement.importClause.name.text, "default");
        const names = statement.importClause.namedBindings;
        if (names && ts.isNamedImports(names)) for (const item of names.elements) if (!item.isTypeOnly) bind(item.name.text, (item.propertyName ?? item.name).text);
        if (names && ts.isNamespaceImport(names)) bind(names.name.text, "*");
      }
      if (ts.isVariableStatement(statement) && exported(statement)) {
        for (const item of statement.declarationList.declarations) if (ts.isIdentifier(item.name)) entry.exports.set(item.name.text, { file: entry.file, node: item, value: item.initializer });
      }
      if (ts.isFunctionDeclaration(statement) && exported(statement) && statement.name) entry.exports.set(statement.name.text, { file: entry.file, node: statement, value: statement });
      if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
        const module = statement.moduleSpecifier ? resolveModule(entry.file, statement.moduleSpecifier.text) : null;
        const runtime = !statement.exportClause || !ts.isNamedExports(statement.exportClause) || statement.exportClause.elements.some((item) => !item.isTypeOnly);
        if (module && runtime) entry.imports.push(module);
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const item of statement.exportClause.elements) if (!item.isTypeOnly) entry.exports.set(item.name.text, { file: entry.file, node: item, module, imported: (item.propertyName ?? item.name).text });
        } else if (module) entry.stars.push(module);
      }
    }
  }
  const getExport = (file, name, seen = new Set()) => {
    const key = file + ":" + name; if (seen.has(key)) return null; seen.add(key);
    const entry = entries.get(file); if (!entry) return null;
    const binding = entry.exports.get(name);
    if (binding?.module) return getExport(binding.module, binding.imported, seen);
    if (binding?.imported) return lookupName(binding.node, binding.imported, seen);
    if (binding) return binding;
    for (const module of entry.stars) { const found = getExport(module, name, seen); if (found) return found; }
    return null;
  };
  const lookupName = (node, name, seen = new Set()) => {
    for (let at = node; at; at = at.parent) {
      const binding = scopes.get(at)?.get(name);
      if (binding) return binding.module && binding.imported !== "*" ? getExport(binding.module, binding.imported, seen) : binding;
    }
    return null;
  };
  const lookup = (expression) => {
    const node = unwrapBrowserNode(expression); if (!node) return null;
    if (ts.isIdentifier(node)) return lookupName(node, node.text);
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const owner = lookupName(node.expression, node.expression.text);
      if (owner?.module && owner.imported === "*") return getExport(owner.module, node.name.text);
    }
    return null;
  };
  return { entries, lookup, resolveModule, properties, isFunction: fn };
}
