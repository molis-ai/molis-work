import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import ts from "typescript";

// PG-056: a plugin's page code asks the Host only through the shared request helper (`molisWorkRequest`), which adds the
// control token, the one-time key, no-store and the error shape. These two plugins are bypassed, not migrated (BL-376/377).
// RAC-556/557 statically scan .ts/.mts/.tsx (not .d.ts) under plugins/native/*/src, including template/string literals.
// They recognize the named direct/property transport calls and literal text shapes below. This scan does not cover
// .js/.mjs, plugins/official-integrations, fetch aliases (const f = fetch; f(url)), WebSocket or dynamic import().
// It is a regression check for those shapes, not a security boundary for all network paths.
const BYPASSED = ["alchemist", "plugin-builder"];
const TRANSPORT_IN_TEXT = /(?<![\w$.])fetch\(|\.fetch\(|XMLHttpRequest|EventSource|sendBeacon/u;

const sources = (dir: string): string[] => readdirSync(dir).flatMap(name => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === "node_modules" || name === "dist" ? [] : sources(path);
  return /\.(m?ts|tsx)$/u.test(name) && !/\.d\.ts$/u.test(name) ? [path] : [];
});

/** Direct transport calls in code, and in the text of programs the plugin serves to the page (template and string literals). */
function transports(file: string, text = readFileSync(file, "utf8")): string[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const at = (node: ts.Node) => `${file}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : "";
      if (["fetch", "sendBeacon", "XMLHttpRequest", "EventSource"].includes(name)) found.push(at(node));
    } else if (ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isStringLiteral(node)) {
      if (TRANSPORT_IN_TEXT.test(node.text)) found.push(at(node));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const plugins = readdirSync("plugins/native").filter(name => statSync(join("plugins/native", name, "src"), { throwIfNoEntry: false })?.isDirectory());
const violations = (plugin: string) => sources(join("plugins/native", plugin, "src")).flatMap(file => transports(file));

test("RAC-556 no plugin's page code calls fetch, XMLHttpRequest, EventSource or sendBeacon itself, except the two bypassed plugins", () => {
  assert.ok(plugins.length > 20, "the scan sees the plugin packages");
  for (const plugin of plugins.filter(name => !BYPASSED.includes(name))) {
    assert.deepEqual(violations(plugin), [], `${plugin}: send requests through molisWorkRequest (scope: lifetime for what the page's lifetime must cancel)`);
  }
});

test("RAC-557 each bypassed plugin still has its own transport, so an entry leaves the list when the plugin moves to the shared request", () => {
  for (const plugin of BYPASSED) assert.ok(violations(plugin).length > 0, `${plugin} no longer calls fetch itself: remove it from BYPASSED`);
});

test("RAC-557 the scanner recognizes the shapes it is meant to refuse", () => {
  const hits = (code: string) => transports("probe.ts", code).length;
  assert.equal(hits("await fetch(url)"), 1);
  assert.equal(hits("await life.fetch(url, init)"), 1);
  assert.equal(hits("new EventSource(url)"), 1);
  assert.equal(hits("const s = `await fetch(route('/x'))`"), 1);
  assert.equal(hits("molisWorkRequest(url, { scope: lifetime })"), 0);
  assert.equal(hits("// fetch(url)\nconst word = 'prefetch'"), 0);
});
