import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const sources = new URL("../apps/local-host/src/", import.meta.url);

async function collectHttpAndWebFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await collectHttpAndWebFiles(new URL(`${entry.name}/`, directory), rel));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts") && (rel.endsWith("-http.ts") || (!prefix && entry.name.startsWith("web-")))) {
      files.push(rel);
    }
  }
  return files.sort();
}

function unwrapped(node) {
  while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)
    || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
  return node;
}

function isRawHostClientExpr(node) {
  const expr = unwrapped(node);
  if (!expr) return false;
  if (ts.isConditionalExpression(expr)) return isRawHostClientExpr(expr.whenTrue) || isRawHostClientExpr(expr.whenFalse);
  if (!ts.isCallExpression(expr)) return false;
  const method = unwrapped(expr.expression);
  return Boolean(method && ts.isPropertyAccessExpression(method) && ["actionClient", "homeActionClient"].includes(method.name.text));
}

function enclosingFunction(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (ts.isFunctionDeclaration(current) || ts.isFunctionExpression(current) || ts.isArrowFunction(current) || ts.isMethodDeclaration(current)) return current;
  }
  return undefined;
}

function callsAny(root, names) {
  let found = false;
  const scan = node => {
    if (found) return;
    if (ts.isCallExpression(node)) {
      const callee = unwrapped(node.expression);
      if (callee && ts.isIdentifier(callee) && names.has(callee.text)) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, scan);
  };
  scan(root);
  return found;
}

function hasZeroPermissionCaller(fnNode) {
  let found = false;
  const scan = node => {
    if (found) return;
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "permissions") {
      const init = unwrapped(node.initializer);
      if (init && ts.isArrayLiteralExpression(init) && init.elements.length === 0) {
        found = true;
        return;
      }
    }
    ts.forEachChild(node, scan);
  };
  scan(fnNode);
  return found;
}

function directWebClients(name, text) {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  assert.equal(source.parseDiagnostics.length, 0, `${name}: production source must parse`);
  const bindings = new Set();
  const namespaces = new Set();
  const authorityResolvers = new Set();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const imports = statement.importClause?.namedBindings;
    if (imports && ts.isNamespaceImport(imports)) namespaces.add(imports.name.text);
    if (imports && ts.isNamedImports(imports)) for (const binding of imports.elements) {
      const imported = (binding.propertyName ?? binding.name).text;
      if (imported === "bindActionClient") bindings.add(binding.name.text);
      if (imported === "localWebActionContext") authorityResolvers.add(binding.name.text);
    }
  }
  // Wrapper functions and destructured bindings (such as `pagePerson` or `const { personContext } = assistantPersonActions(..., () => localWebActionContext(...))`) that resolve authority via `localWebActionContext`.
  if (authorityResolvers.size > 0) {
    const collectBindingNames = nameNode => {
      if (ts.isIdentifier(nameNode)) {
        authorityResolvers.add(nameNode.text);
      } else if (ts.isObjectBindingPattern(nameNode) || ts.isArrayBindingPattern(nameNode)) {
        for (const element of nameNode.elements) {
          if (ts.isBindingElement(element)) collectBindingNames(element.name);
        }
      }
    };
    const collectResolvers = node => {
      if (ts.isFunctionDeclaration(node) && node.name && callsAny(node, authorityResolvers)) authorityResolvers.add(node.name.text);
      if (ts.isVariableDeclaration(node) && node.initializer && callsAny(node.initializer, authorityResolvers)) collectBindingNames(node.name);
      ts.forEachChild(node, collectResolvers);
    };
    collectResolvers(source);
  }
  const clients = [];
  const visit = node => {
    if (ts.isCallExpression(node)) {
      const bound = unwrapped(node.expression);
      const client = unwrapped(node.arguments[0]);
      const isBinder = bound && (ts.isIdentifier(bound) && bindings.has(bound.text)
        || ts.isPropertyAccessExpression(bound) && ts.isIdentifier(bound.expression)
        && namespaces.has(bound.expression.text) && bound.name.text === "bindActionClient");
      if (isBinder && isRawHostClientExpr(client)) {
        const fn = enclosingFunction(node);
        // Binding after `localWebActionContext` or an explicit zero-permission door (`permissions: []`) resolves authority; raw bindings do not.
        const resolved = Boolean(fn && (callsAny(fn, authorityResolvers) || hasZeroPermissionCaller(fn)));
        if (!resolved) {
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
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return clients;
}

// PG-008 / F-TEST-06: this checks all production Web and HTTP entrypoints (`web-*.ts`, `**/*-http.ts`, including `assistant/*-http.ts`),
// independently of bindLocalWebActions' mechanism tests (RAC-651). Formatting, parentheses, conditionals and import aliases do not hide a raw binding.
test("RAC-651-ROUTES Web entrypoints do not bind raw Host action clients", async () => {
  const names = await collectHttpAndWebFiles(sources);
  assert.ok(names.some(name => name.startsWith("web-")), "scan top-level web-*.ts entrypoints");
  assert.ok(names.some(name => name.endsWith("-http.ts") && !name.includes("/")), "scan top-level *-http.ts entrypoints");
  assert.ok(names.some(name => name.startsWith("assistant/") && name.endsWith("-http.ts")), "scan assistant/*-http.ts entrypoints");
  const clients = (await Promise.all(names.map(async name => directWebClients(name, await readFile(new URL(name, sources), "utf8"))))).flat();
  // The last one, the old Alchemist's (BL-376), left with it in 44B.
  assert.deepEqual(clients, [],
    "Web entrypoints must resolve the person's authority from installation grants before invoking an action");
});
