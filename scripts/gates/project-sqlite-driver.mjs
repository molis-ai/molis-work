// better-sqlite3 is Alchemist's own, until it is rebuilt (BL-377). Everything else is on node:sqlite through packages/storage:
// two SQLite libraries on one file in one process drop each other's locks (S-46). Which directories may import better-sqlite3 is
// data, not code: tooling/gates/sqlite-driver-owners.json. A missing or malformed file fails the boundary check closed, so
// widening the exception is a reviewed data change rather than an edit hidden in this script.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";
import { extractImportSpecifiers } from "@molis-ai/molis-work-test-kit";
import { CODE_FILE, walkFiles } from "../script-paths.mjs";

// Everywhere code lives, not the package list: apps/sync-worker has no package.json and has its own tests.
const SCANNED = ["apps", "packages", "plugins", "modules", "horizontal", "server", "tooling", "tests", "scripts", "examples"];
const NODE_PROGRAM_FLAG = /^(?:-e|-p|-pe|--eval|--print)$/;
const NODE_PROGRAM_INLINE = /^(?:--eval|--print)=([\s\S]*)$/;
const NODE_COMMAND = /\bnode\b[^\n]*?\s(?:-e|-p|-pe|--eval|--print)(?:\s+|=)([\s\S]*)$/;
const SHELL_FLAG = /^-l?c$/, SHELL_CALL = /^(?:exec|spawn)(?:Sync)?$/;
const RUNS_ITS_ARGUMENT = new Set(["eval", "Function", "Script", "compileFunction", "SourceTextModule", "runInThisContext", "runInNewContext", "runInContext"]);

const isDriver = (name) => name === "better-sqlite3" || name.startsWith("better-sqlite3/");
const OWNERS_FILE = fileURLToPath(new URL("../../tooling/gates/sqlite-driver-owners.json", import.meta.url));

/** The directories allowed to import the driver, read from the reviewed data file; anything else fails closed. */
function driverOwners() {
  let data;
  try { data = JSON.parse(readFileSync(OWNERS_FILE, "utf8")); } catch (cause) {
    throw new Error(`tooling/gates/sqlite-driver-owners.json is missing or is not JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  const problems = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) problems.push("the file must hold an object");
  else {
    for (const key of Object.keys(data)) if (key !== "format" && key !== "owners") problems.push(`unknown key ${key}`);
    if (data.format !== 1) problems.push("format must be 1");
    if (!Array.isArray(data.owners) || data.owners.length === 0) problems.push("owners must be a non-empty array");
    else data.owners.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) { problems.push(`owners[${index}] must be an object`); return; }
      for (const key of Object.keys(entry)) if (key !== "prefix" && key !== "reason") problems.push(`owners[${index}].${key} is not allowed`);
      if (typeof entry.prefix !== "string" || !entry.prefix.endsWith("/") || entry.prefix.length < 2) problems.push(`owners[${index}].prefix must be a directory path ending in /`);
      if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) problems.push(`owners[${index}].reason must say why in at least 20 characters`);
    });
    if (problems.length === 0) {
      const prefixes = data.owners.map(entry => entry.prefix);
      if (new Set(prefixes).size !== prefixes.length) problems.push("owners repeat a prefix");
    }
  }
  if (problems.length > 0) throw new Error(`tooling/gates/sqlite-driver-owners.json: ${problems.join("; ")}`);
  return data.owners.map(entry => entry.prefix);
}

const DRIVER_OWNERS = driverOwners();
const ownsDriver = (file) => DRIVER_OWNERS.some(prefix => file.startsWith(prefix));
const nameOf = (node) => ts.isIdentifier(node) ? node.text : ts.isPropertyAccessExpression(node) ? node.name.text : undefined;
const isCreateRequire = (node) => ts.isCallExpression(node) && nameOf(node.expression) === "createRequire";

/** A loader the import scan cannot read: createRequire(url)("x"), one kept in a variable, either's .resolve("x"), and require.resolve("x"). */
function loadsDriver(tree) {
  const loaders = new Set(["require"]);
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && isCreateRequire(node.initializer)) loaders.add(node.name.text);
    ts.forEachChild(node, collect);
  };
  collect(tree);
  let found = false;
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0]) && isDriver(node.arguments[0].text)) {
      const callee = ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "resolve" ? node.expression.expression : node.expression;
      if (isCreateRequire(callee) || (ts.isIdentifier(callee) && loaders.has(callee.text))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/**
 * Text handed to something that runs it: node -e programs in lock tests and installation probes, in an argument list or a shell
 * command, eval, new Function, vm and `new Worker(text, { eval: true })`. By position, not by what the string says, so prose and
 * patterns in tests stay out.
 */
function programs(tree) {
  const constants = new Map(), found = [];
  const collect = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isStringLiteralLike(node.initializer)) constants.set(node.name.text, node.initializer.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.isTemplateExpression(node.initializer)) constants.set(node.name.text, textOf(node.initializer));
    ts.forEachChild(node, collect);
  };
  const textOf = (node) => {
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isTemplateExpression(node)) return [node.head.text, ...node.templateSpans.map(span => span.literal.text)].join(" ");
    return ts.isIdentifier(node) ? constants.get(node.text) : undefined;
  };
  const add = (node) => { const text = node && textOf(node); if (text) found.push(text); };
  const addCommand = (node) => {
    const command = node && NODE_COMMAND.exec(textOf(node) ?? "");
    if (command) found.push(command[1].trim().replace(/^["'`]|["'`]$/g, ""));
  };
  const visit = (node) => {
    if (ts.isArrayLiteralExpression(node)) {
      for (const [index, argument] of node.elements.entries()) {
        if (!ts.isStringLiteralLike(argument)) continue;
        const inline = NODE_PROGRAM_INLINE.exec(argument.text);
        if (inline) found.push(inline[1]);
        else if (NODE_PROGRAM_FLAG.test(argument.text)) add(node.elements[index + 1]);
        else if (SHELL_FLAG.test(argument.text)) addCommand(node.elements[index + 1]);
      }
    }
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments) {
      if (RUNS_ITS_ARGUMENT.has(nameOf(node.expression))) node.arguments.forEach(add);
      if (SHELL_CALL.test(nameOf(node.expression) ?? "")) addCommand(node.arguments[0]);
      const options = node.arguments[1];
      if (ts.isNewExpression(node) && nameOf(node.expression) === "Worker" && options && ts.isObjectLiteralExpression(options)
        && options.properties.some(property => ts.isPropertyAssignment(property) && property.name.getText(tree) === "eval" && property.initializer.kind === ts.SyntaxKind.TrueKeyword)) add(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  collect(tree);
  visit(tree);
  return found;
}

export function usesProjectSqliteDriver(file, source) {
  if (ownsDriver(file) || !source.includes("better-sqlite3")) return false;
  if (extractImportSpecifiers(source).some(isDriver)) return true;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  return loadsDriver(tree) || programs(tree).some(program => usesProjectSqliteDriver(file, program));
}

/** Every file that opens the driver itself. Findings: { file, text }. */
export function sqliteDriverFindings(root) {
  return walkFiles(root, SCANNED, file => CODE_FILE.test(file))
    .filter(file => usesProjectSqliteDriver(file, readFileSync(path.join(root, file), "utf8")))
    .map(file => ({ file, text: /^(?:tests|scripts|examples)\//.test(file)
      ? "[project-sqlite-driver] open test connections through test-kit or production connections through storage"
      : "[project-sqlite-driver] open project connections through storage" }));
}
