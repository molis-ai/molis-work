// The project database uses exactly the driver that owns its lock. Alchemist has its own approved private driver.
import ts from "typescript";
import { extractImportSpecifiers } from "@molis-ai/molis-work-test-kit";

const isDriver = (name) => name === "better-sqlite3" || name.startsWith("better-sqlite3/");
const ownsDriver = (file) => file === "packages/storage/src/sqlite-connection.ts" || file.startsWith("plugins/native/alchemist/");

/** Node -e programs in lock tests and installation probes are callers too. Inspect literal programs, not prose or patterns in tests. */
function evalPrograms(source, file) {
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest), programs = [];
  const visit = (node) => {
    if (ts.isArrayLiteralExpression(node)) {
      for (const [i, argument] of node.elements.entries()) {
        if (!ts.isStringLiteralLike(argument) || !["-e", "--eval"].includes(argument.text)) continue;
        const program = node.elements[i + 1];
        if (program && ts.isStringLiteralLike(program)) programs.push(program.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return programs;
}

export function usesProjectSqliteDriver(file, source) {
  if (ownsDriver(file) || !source.includes("better-sqlite3")) return false;
  return [source, ...evalPrograms(source, file)].some(part => extractImportSpecifiers(part).some(isDriver));
}
