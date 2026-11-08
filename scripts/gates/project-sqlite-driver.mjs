// The project database uses exactly the driver that owns its lock. Alchemist has its own approved private driver.
import { readFileSync } from "node:fs";
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
const ownsDriver = (file) => file.startsWith("packages/storage/") || file.startsWith("plugins/native/alchemist/");
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
