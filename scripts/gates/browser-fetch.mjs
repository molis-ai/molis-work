// W3-10-5: AST calls, including local aliases, in programs the browser runs. Strings/comments are not calls.
import ts from "typescript";
import { browserPrograms } from "./browser-programs.mjs";
import { unwrapBrowserNode as unwrap, browserName } from "./browser-graph.mjs";

const namedFunction = (node) => ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node);
const scopeOf = (node) => {
  for (let at = node.parent; at; at = at.parent) if (ts.isSourceFile(at) || ts.isBlock(at) || namedFunction(at)) return at;
  return node.getSourceFile();
};
const siteOwner = (program, position) => {
  let offset = 0;
  for (const part of program.parts) {
    if (position < offset + part.text.length) return { file: part.file, position: part.start + position - offset };
    offset += part.text.length;
  }
  return { file: program.parts.at(-1)?.file ?? "unknown", position };
};

// These are the three existing transport roles, not directory exemptions. Each role admits one source site; a copied
// or neighboring call still counts. The exact call shapes and enclosing declaration are also checked.
function transportRole(node, file) {
  const compact = node.getText().replace(/\s+/g, "");
  const enclosing = (predicate) => { for (let at = node.parent; at; at = at.parent) if (predicate(at)) return true; return false; };
  if (file === "packages/ui-host/src/request-client.ts") {
    if (/^(?:init\.scope|ports)\.fetch\(target\.href,options\)$/.test(compact)
      && enclosing((at) => namedFunction(at) && browserName(at.name) === "createUiRequest")) return compact.startsWith("ports") ? "request-ports" : "request-scope";
    if (compact === "fetch(input,init)" && ts.isArrowFunction(node.parent) && ts.isPropertyAssignment(node.parent.parent)
      && browserName(node.parent.parent.name) === "fetch") return "request-page-port";
  }
  if (file === "packages/ui-host/src/client-lifecycle.ts" && compact === "fetch(input,{...init,signal})"
    && enclosing((at) => ts.isMethodDeclaration(at) && browserName(at.name) === "fetch")) return "lifecycle-transport";
  return null;
}

const countDetails = new WeakMap();
export function scanBrowserFetch(snapshot, isSource) {
  const found = browserPrograms(snapshot, isSource), counts = {}, sites = new Map(), problems = [...found.problems];
  const admitted = new Map(), seen = new Set();
  const scan = (program, tree) => {
    const bindings = new WeakMap();
    const put = (scope, name, value) => {
      if (!name) return;
      let names = bindings.get(scope); if (!names) bindings.set(scope, names = new Map()); names.set(name, value);
    };
    const collect = (node) => {
      if (ts.isVariableDeclaration(node) || ts.isParameter(node)) {
        if (ts.isIdentifier(node.name)) put(scopeOf(node), node.name.text, { node, value: node.initializer });
        if (ts.isObjectBindingPattern(node.name)) for (const item of node.name.elements) {
          if (ts.isIdentifier(item.name)) put(scopeOf(node), item.name.text, { node: item, value: node.initializer, property: browserName(item.propertyName ?? item.name) });
        }
      } else if (namedFunction(node) && node.name) put(scopeOf(node), browserName(node.name), { node, value: node });
      else if (ts.isImportDeclaration(node) && node.importClause) {
        const names = node.importClause.namedBindings;
        if (names && ts.isNamedImports(names)) for (const item of names.elements) put(tree, item.name.text, { node: item, property: (item.propertyName ?? item.name).text });
      }
      ts.forEachChild(node, collect);
    };
    collect(tree);
    const lookup = (node, name) => {
      for (let at = node; at; at = at.parent) { const value = bindings.get(at)?.get(name); if (value) return value; }
      return null;
    };
    const assignments = (node) => {
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left)) {
        const binding = lookup(node.left, node.left.text);
        if (binding) { binding.assigned ??= []; binding.assigned.push(node.right); }
      }
      ts.forEachChild(node, assignments);
    };
    assignments(tree);
    const staticName = (expression, resolving = new Set()) => {
      const node = unwrap(expression); if (!node) return null;
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = staticName(node.left, resolving), right = staticName(node.right, resolving);
        return left !== null && right !== null ? left + right : null;
      }
      if (ts.isIdentifier(node)) {
        const binding = lookup(node, node.text); if (!binding?.value || resolving.has(binding.node)) return null;
        return staticName(binding.value, new Set([...resolving, binding.node]));
      }
      return null;
    };
    const isFetch = (expression, resolving = new Set()) => {
      const node = unwrap(expression); if (!node) return false;
      if (ts.isPropertyAccessExpression(node)) return node.name.text === "fetch"
        || (["call", "apply"].includes(node.name.text) && isFetch(node.expression, resolving));
      if (ts.isElementAccessExpression(node)) return staticName(node.argumentExpression) === "fetch";
      if (ts.isIdentifier(node)) {
        const binding = lookup(node, node.text);
        if (!binding) return node.text === "fetch";
        if (binding.property === "fetch") return true;
        if (resolving.has(binding.node)) return false;
        const next = new Set([...resolving, binding.node]);
        return Boolean(binding.value && isFetch(binding.value, next)) || (binding.assigned ?? []).some((value) => isFetch(value, next));
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "bind") return isFetch(node.expression.expression, resolving);
      return false;
    };
    const visit = (node) => {
      if (ts.isCallExpression(node) && isFetch(node.expression)) {
        const owner = siteOwner(program, node.getStart()), key = owner.file + ":" + owner.position;
        if (!seen.has(key)) {
          seen.add(key); const role = transportRole(node, owner.file), roleKey = owner.file + ":" + role;
          if (!role || admitted.has(roleKey)) {
            counts[owner.file] = (counts[owner.file] ?? 0) + 1;
            if (!sites.has(owner.file)) sites.set(owner.file, []);
            sites.get(owner.file).push(`${owner.position}: ${node.expression.getText()}`);
          } else admitted.set(roleKey, key);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  };
  for (const program of found.programs) {
    const tree = ts.createSourceFile("browser.js", program.text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (tree.parseDiagnostics.length) {
      const first = tree.parseDiagnostics[0];
      problems.push(`${program.where}: browser program parse failed: ${ts.flattenDiagnosticMessageText(first.messageText, " ")}`);
    } else scan(program, tree);
  }
  for (const entry of found.typed) {
    const program = { parts: [{ file: entry.file, start: 0, text: entry.text }] };
    if (entry.tree.parseDiagnostics.length) problems.push(`${entry.file}: typed browser source parse failed`);
    else scan(program, entry.tree);
  }
  const result = { counts, problems: [...new Set(problems)], sites, programs: found.programs.length, typed: found.typed.length };
  countDetails.set(counts, result);
  return result;
}

const cache = new WeakMap();
export const browserFetchScan = (snapshot, isSource) => {
  if (!cache.has(snapshot)) cache.set(snapshot, scanBrowserFetch(snapshot, isSource));
  return cache.get(snapshot);
};
export const browserFetchProblems = (counts) => {
  const result = countDetails.get(counts);
  if (!result) return ["rawFetchInScripts: browser program measurement is missing"];
  return [...result.problems, ...Object.entries(result.counts).filter(([file]) => file.startsWith("apps/workbench/"))
    .map(([file, count]) => `Workbench raw fetch must be zero: ${file} has ${count}; use the public UiRequest`)].map((message) => `rawFetchInScripts: ${message}`);
};
