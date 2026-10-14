import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "esbuild";
import ts from "typescript";

// Browser programs are exported as strings, so normal module compilation cannot compact them.
// Keep source and string contents intact; only strip JavaScript trivia in the built client.
const [file, name, mode = "factory"] = process.argv.slice(2);
if (!file || !name || !["factory", "program", "catalog"].includes(mode)) {
  throw new Error("usage: compact-client-string.mjs <built-module> <export> [factory|program|catalog]");
}
const target = resolve(file), module = await import(pathToFileURL(target).href), value = module[name];
async function compact(value, factory = true) {
  if (typeof value !== "string") throw new Error(`Expected a client string: ${name}`);
  const prefix = "globalThis.__molisClient=";
  const result = await transform(factory ? `${prefix}${value};` : value, {
    minifyWhitespace: true, target: "es2022", charset: "utf8", legalComments: "none",
  });
  const code = result.code.trim();
  if (factory && (!code.startsWith(prefix) || !code.endsWith(";"))) throw new Error(`Unexpected client factory output: ${name}`);
  return factory ? code.slice(prefix.length, -1) : code;
}
const source = await readFile(target, "utf8"), ast = ts.createSourceFile(target, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
const statement = ast.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => declaration.name.getText(ast) === name));
const declaration = statement?.declarationList.declarations.find(node => node.name.getText(ast) === name);
if (!declaration?.initializer) throw new Error(`Expected an initialized client export: ${name}`);
const edits = [];
if (mode === "catalog") {
  const array = declaration.initializer;
  if (!ts.isArrayLiteralExpression(array) || !Array.isArray(value) || value.length !== array.elements.length) throw new Error("Expected the built plugin catalog array");
  const property = (node, key) => ts.isObjectLiteralExpression(node)
    ? node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(ast) === key)?.initializer : undefined;
  for (const [index, entry] of array.elements.entries()) {
    const workbench = property(entry, "workbench"), factory = workbench && property(workbench, "clientFactory");
    if (factory) edits.push({ node: factory, text: await compact(value[index].workbench.clientFactory) });
  }
  if (!edits.length) throw new Error("No plugin client factories found");
} else edits.push({ node: declaration.initializer, text: await compact(value, mode === "factory") });
let result = source;
for (const { node, text } of edits.sort((a, b) => b.node.pos - a.node.pos)) result = result.slice(0, node.getStart(ast)) + JSON.stringify(text) + result.slice(node.end);
await writeFile(target, result);
