// Modules export their Repositories and Stores (specs/repository-anti-corruption N-11, W1-05).
//
// A Module's package entry (<package>/src/index.ts, the only subpath its package.json exports) is its public surface. A Module
// is a package that scripts/workspace-packages.mjs classifies as kind "module" (modules/* and server, which has its own chat
// and identity facts), plus any modules/<name> directory, so a Module that is not yet listed there is still covered.
// docs/system/PACKAGE-BOUNDARIES.md §3 says a Repository is visible to the Module's own implementation, not exported from
// the entry. Today several entries export the Repository or Store class (GoalsRepository, ShelfStore, openFunctionsStore, …)
// and several service objects carry a public `repository` member. This counts both, per Module, following `export *`,
// `export {…} from`, `export {…}` of an import and namespace re-exports to the declaration:
//   <package>#export:<Name>              an exported name ending in Repository or Store
//   <package>#member:<Name>.repository   a public `repository` member of an exported class, interface or type literal
// A namespace re-export makes everything in its target public under the namespace's name, so each name in it is a key of its
// own: `export * as storage from "./repository.js"` and `import * as storage from "./repository.js"; export { storage }` give
// `storage.GoalsRepository` (nested namespaces give `a.b.Name`). Each count may only fall and a new one starts at 0.
// Un-exporting them is the next slice; this stops the count from growing.
// What it does not follow (review does): a new declaration that aliases an imported name (`export const repo = GoalsRepository`,
// `export type R = GoalsRepository`), or an object that wraps a namespace import (`export const api = { storage }`).
import path from "node:path";
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

const MODULE_DIRECTORY_ENTRY = /^modules\/[^/]+\/src\/index\.ts$/;
const WORKSPACE_PACKAGES = "scripts/workspace-packages.mjs";
const REPOSITORY_NAME = /(?:Repository|Store)$/;

/**
 * The entry files of the Modules in a snapshot: every modules/<name>/src/index.ts, and the entry of each package that
 * scripts/workspace-packages.mjs lists as `entry(path, name, "module", …)` (read as text, so the merge-base side is measured
 * from the same list). Exported for the gate's test.
 */
export function moduleEntries(snapshot) {
  const known = new Set(snapshot.files);
  const entries = new Set(snapshot.files.filter((file) => MODULE_DIRECTORY_ENTRY.test(file)));
  const text = snapshot.read(WORKSPACE_PACKAGES);
  if (text) {
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "entry") {
        const [packagePath, , kind] = node.arguments;
        if (packagePath && kind && ts.isStringLiteralLike(packagePath) && ts.isStringLiteralLike(kind) && kind.text === "module" && known.has(`${packagePath.text}/src/index.ts`)) entries.add(`${packagePath.text}/src/index.ts`);
      }
      ts.forEachChild(node, visit);
    };
    visit(ts.createSourceFile(WORKSPACE_PACKAGES, text, ts.ScriptTarget.Latest, true));
  }
  return [...entries].sort();
}

/**
 * The names a source file exports, each with the file and local name that declares it: through `export *`, `export {…} from`,
 * `export {…}` of an import, and namespace re-exports (`export * as ns from`, `import * as ns` then `export { ns }`), which
 * export `ns` and, for each name the target exports, `ns.<name>` too. A name that comes from outside the snapshot has
 * `file: null`. Exported for the gate's test.
 */
export function createExportResolver(snapshot) {
  const known = new Set(snapshot.files);
  const parsed = new Map();
  const exported = new Map();
  const parse = (file) => {
    if (!parsed.has(file)) {
      const text = snapshot.read(file);
      parsed.set(file, text === null ? null : ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
    }
    return parsed.get(file);
  };
  const resolve = (from, specifier) => {
    if (!specifier.startsWith(".")) return null;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier.replace(/\.(?:js|mjs)$/, "")));
    return [`${base}.ts`, `${base}/index.ts`].find((candidate) => known.has(candidate)) ?? null;
  };
  const hasExportModifier = (node) => ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
  const exportsOf = (file, active = new Set()) => {
    if (exported.has(file)) return exported.get(file);
    const result = new Map();
    const source = parse(file);
    if (!source || active.has(file)) return result;
    active.add(file);
    const imports = new Map();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier) || !statement.importClause?.namedBindings) continue;
      const target = resolve(file, statement.moduleSpecifier.text);
      const bindings = statement.importClause.namedBindings;
      if (ts.isNamespaceImport(bindings)) imports.set(bindings.name.text, { target, namespace: true });
      else for (const element of bindings.elements) imports.set(element.name.text, { target, imported: (element.propertyName ?? element.name).text });
    }
    const fromTarget = (target, name) => (target ? exportsOf(target, active).get(name) : undefined) ?? { file: null, local: name };
    /** `ns` itself, and `ns.<name>` for everything the namespace's target exports (the target's own `a.b` names nest). */
    const exportNamespace = (name, target) => {
      result.set(name, { file, local: name });
      if (target) for (const [member, origin] of exportsOf(target, active)) result.set(`${name}.${member}`, origin);
    };
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement)) {
        const target = statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier) ? resolve(file, statement.moduleSpecifier.text) : null;
        if (!statement.exportClause) {
          if (target) for (const [name, origin] of exportsOf(target, active)) if (!result.has(name)) result.set(name, origin);
        } else if (ts.isNamespaceExport(statement.exportClause)) {
          exportNamespace(statement.exportClause.name.text, target);
        } else {
          for (const element of statement.exportClause.elements) {
            const local = (element.propertyName ?? element.name).text;
            if (statement.moduleSpecifier) result.set(element.name.text, fromTarget(target, local));
            else if (imports.get(local)?.namespace) exportNamespace(element.name.text, imports.get(local).target);
            else if (imports.has(local)) result.set(element.name.text, fromTarget(imports.get(local).target, imports.get(local).imported));
            else result.set(element.name.text, { file, local });
          }
        }
      } else if (hasExportModifier(statement)) {
        if ((ts.isClassDeclaration(statement) || ts.isFunctionDeclaration(statement) || ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement)) && statement.name) result.set(statement.name.text, { file, local: statement.name.text });
        else if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) if (ts.isIdentifier(declaration.name)) result.set(declaration.name.text, { file, local: declaration.name.text });
      }
    }
    active.delete(file);
    exported.set(file, result);
    return result;
  };
  /** The public `repository` members of the class, interface or type literal that `origin` names. */
  const repositoryMembers = (origin) => {
    const source = origin.file ? parse(origin.file) : null;
    if (!source) return 0;
    const isPublic = (node) => !(ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword));
    const named = (member) => member.name && (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) && member.name.text === "repository";
    const count = (members) => members.reduce((sum, member) => {
      if (ts.isPropertySignature(member) || ts.isPropertyDeclaration(member)) return sum + (named(member) && isPublic(member) ? 1 : 0);
      if (ts.isConstructorDeclaration(member)) return sum + member.parameters.filter((parameter) => named(parameter) && ts.canHaveModifiers(parameter) && (ts.getModifiers(parameter) ?? []).length > 0 && isPublic(parameter)).length;
      return sum;
    }, 0);
    let total = 0;
    for (const statement of source.statements) {
      if ((ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement)) && statement.name?.text === origin.local) total += count(statement.members);
      else if (ts.isTypeAliasDeclaration(statement) && statement.name.text === origin.local && ts.isTypeLiteralNode(statement.type)) total += count(statement.type.members);
    }
    return total;
  };
  return { exportsOf, repositoryMembers };
}

export const moduleRepositoryExports = (helpers) => recordMetric(helpers, {
  id: "moduleRepositoryExports",
  recordKey: "moduleRepositoryExports",
  totalKey: "moduleRepositoryExportsTotal",
  title: "Module entry exports of a Repository or Store, and public `repository` members",
  summaryLabel: "module repository exports",
  measure(snapshot) {
    const record = {};
    const resolver = createExportResolver(snapshot);
    for (const entry of moduleEntries(snapshot)) {
      const module = entry.slice(0, -"/src/index.ts".length);
      for (const [name, origin] of resolver.exportsOf(entry)) {
        // Also by the declared name: `export { AlphaRepository as AlphaData }` is still the Repository.
        if (REPOSITORY_NAME.test(name) || REPOSITORY_NAME.test(origin.local)) record[`${module}#export:${name}`] = 1;
        const members = resolver.repositoryMembers(origin);
        if (members) record[`${module}#member:${name}.repository`] = members;
      }
    }
    return record;
  },
  message: (key, was, now) => `Module entry exposes a Repository: ${key} ${was} → ${now}; a Module's Repository and Store stay inside the Module (docs/system/PACKAGE-BOUNDARIES.md §3); export a Query or Command API instead`,
});
