// The module specifiers of one source file, read from its syntax tree (never from a regular expression: a string or a comment
// that looks like an import is not one). A record is
//   { spec, form, typeOnly, line, start, end }
// `form` is import | export | equals | dynamic | require. `typeOnly` is true only for a declaration that the syntax itself marks
// as loading nothing: `import type`, `export type`, or one whose every named element is `type` (the rule scripts/gates
// and docs/system/PARALLEL-DEVELOPMENT.md call syntactic; an import that is merely used as a type is still a run-time import
// here, see plan.mjs "R5"). `start`/`end` are the offsets of the specifier's string literal including its quotes.
//
// `deep` also walks function bodies for import() and require(): test files only (the graph does not follow a dynamic import in
// package code, which loads lazily). `detail` adds what a rewrite needs, with the file's syntax tree kept long enough to read it:
// `names` (the elements, with ranges; null when the whole module is used, so a name cannot be checked) and `keywordEnd`.
import ts from "typescript";

const typeOnlyImport = (node) => {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  const bindings = clause.namedBindings;
  if (!bindings || ts.isNamespaceImport(bindings)) return false;
  return bindings.elements.length > 0 && bindings.elements.every((element) => element.isTypeOnly);
};
const typeOnlyExport = (node) => {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return Boolean(clause) && ts.isNamedExports(clause) && clause.elements.length > 0 && clause.elements.every((element) => element.isTypeOnly);
};

const rangeOf = (source, node) => [node.getStart(source), node.getEnd()];
// Import and export specifiers: `X`, `X as Z`, `type X`. `imported` is the name the module exports, `local` the name used here.
const specifierElements = (source, elements) => elements.map((element) => ({
  imported: (element.propertyName ?? element.name).text, local: element.name.text, typeOnly: Boolean(element.isTypeOnly),
  prop: element.propertyName ? rangeOf(source, element.propertyName) : null, name: rangeOf(source, element.name), element: rangeOf(source, element),
}));
// `const { a, b: c } = await import("x")` and `const { a } = require("x")`; anything else (then(), a property read, a rest element) is unknown.
const bindingElements = (source, call) => {
  let outer = call;
  while (outer.parent && (ts.isAwaitExpression(outer.parent) || ts.isParenthesizedExpression(outer.parent) || ts.isAsExpression(outer.parent) || ts.isNonNullExpression(outer.parent))) outer = outer.parent;
  const owner = outer.parent;
  if (!owner || !ts.isVariableDeclaration(owner) || owner.initializer !== outer || !ts.isObjectBindingPattern(owner.name)) return null;
  const elements = owner.name.elements;
  if (!elements.length || elements.some((element) => element.dotDotDotToken || !ts.isIdentifier(element.propertyName ?? element.name))) return null;
  return elements.map((element) => ({
    imported: (element.propertyName ?? element.name).text, local: ts.isIdentifier(element.name) ? element.name.text : null, typeOnly: false,
    prop: element.propertyName ? rangeOf(source, element.propertyName) : null, name: rangeOf(source, element.name), element: rangeOf(source, element), binding: true,
  }));
};

export function parseImports(file, text, { deep = false, detail = false } = {}) {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, detail || deep);
  const found = [];
  const add = (literal, form, typeOnly, extra = {}) => {
    const start = literal.getStart(source);
    found.push({ spec: literal.text, form, typeOnly, line: source.getLineAndCharacterOfPosition(start).line + 1, start, end: literal.getEnd(), ...extra });
  };
  const declaration = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      const extra = !detail ? {} : {
        keywordEnd: node.getStart(source) + "import".length, hasDefault: Boolean(clause?.name),
        names: bindings && ts.isNamedImports(bindings) && !clause.name ? specifierElements(source, bindings.elements) : null,
      };
      add(node.moduleSpecifier, "import", typeOnlyImport(node), extra);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      const clause = node.exportClause;
      const extra = !detail ? {} : { keywordEnd: node.getStart(source) + "export".length, names: clause && ts.isNamedExports(clause) ? specifierElements(source, clause.elements) : null };
      add(node.moduleSpecifier, "export", typeOnlyExport(node), extra);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && ts.isStringLiteralLike(node.moduleReference.expression)) {
      add(node.moduleReference.expression, "equals", Boolean(node.isTypeOnly), detail ? { names: null } : {});
    }
  };
  const visit = (node) => {
    declaration(node);
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node.arguments[0], "dynamic", false, detail ? { names: bindingElements(source, node) } : {});
      else if (ts.isIdentifier(node.expression) && node.expression.text === "require") add(node.arguments[0], "require", false, detail ? { names: bindingElements(source, node) } : {});
    }
    ts.forEachChild(node, visit);
  };
  if (deep) visit(source);
  else for (const statement of source.statements) declaration(statement);
  return found;
}
