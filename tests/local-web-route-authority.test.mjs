import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sources = new URL("../apps/local-host/src/", import.meta.url);

function unwrapped(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function directWebClients(name, text) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(source.parseDiagnostics.length, 0, `${name}: production source must parse`);
  const bindings = new Set(), namespaces = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const imports = statement.importClause?.namedBindings;
    if (imports && ts.isNamespaceImport(imports)) namespaces.add(imports.name.text);
    if (imports && ts.isNamedImports(imports)) for (const binding of imports.elements) {
      if ((binding.propertyName ?? binding.name).text === "bindActionClient") bindings.add(binding.name.text);
    }
  }
  const clients = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const bound = unwrapped(node.expression), client = unwrapped(node.arguments[0]);
      const isBinder = bound && (ts.isIdentifier(bound) && bindings.has(bound.text)
        || ts.isPropertyAccessExpression(bound) && ts.isIdentifier(bound.expression)
        && namespaces.has(bound.expression.text) && bound.name.text === "bindActionClient");
      const method = client && ts.isCallExpression(client) ? unwrapped(client.expression) : undefined;
      if (isBinder && method && ts.isPropertyAccessExpression(method)
        && ["actionClient", "homeActionClient"].includes(method.name.text)) {
        let route;
        for (let parent = node.parent; parent && !route; parent = parent.parent) {
          if (!ts.isObjectLiteralExpression(parent)) continue;
          const id = parent.properties.find(property => ts.isPropertyAssignment(property)
            && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === "id");
          if (id && ts.isStringLiteral(id.initializer)) route = id.initializer.text;
        }
        clients.push({ file: name, route, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return clients;
}

// PG-008: this checks the actual entrypoints, independently of bindLocalWebActions' mechanism tests (RAC-651).
// Formatting, parentheses and import aliases do not hide a direct binding. Goals' separate binding is outside this check.
test("RAC-651-ROUTES Web entrypoints do not bind raw Host action clients outside Alchemist (BL-376)", async () => {
  const names = (await readdir(sources)).filter(name => name.startsWith("web-") && name.endsWith(".ts")).sort();
  assert.ok(names.length > 0, "scan the production Web entrypoints");
  const clients = (await Promise.all(names.map(async name => directWebClients(name, await readFile(new URL(name, sources), "utf8"))))).flat();
  const retained = clients.filter(client => client.file === "web-request.ts" && client.route === "alchemist");
  assert.ok(retained.length <= 1, "BL-376 retains only the existing Alchemist binding");
  assert.deepEqual(clients.filter(client => !retained.includes(client)), [],
    "Web entrypoints must resolve the person's authority from installation grants before invoking an action");
});
