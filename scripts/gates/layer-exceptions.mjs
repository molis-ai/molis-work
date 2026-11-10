// The layer exceptions only shrink (docs/system/PACKAGE-BOUNDARIES.md §2, W1-05).
//
// packages/test-kit/src/boundaries.ts lists the App → App launcher edges (APP_IMPORT_ALLOWLIST) and the one Plugin → Module edge
// (PLUGIN_MODULE_IMPORT_ALLOWLIST) that exist today; every other edge between those layers is rejected by `pnpm boundary:check`.
// packages/test-kit/tests/boundaries.test.mjs pins the lists to literal values, and boundary:check reports an entry that no
// import or dependency uses any more. Neither stops a pull request from adding an entry and editing the pin in the same
// change. This counts the entries, one record per listed edge, against the merge-base: a new entry starts at 0, so adding one
// fails, and removing one passes.
//   app-import#<importer> -> <target>
//   plugin-module-import#<importer> -> <target>
// A merge-base that does not have the two lists yet (the change that introduces them) has nothing to compare with; the
// record `lists#declared` says the lists exist and can be read, and once the merge-base has it, a head that can no longer be
// read fails too, so the lists cannot be emptied out of the gate's sight. Readable means: each list is a variable named as
// below, initialised with an array literal whose every element is a string literal. Renaming or moving a list, or adding an
// element that is not a string literal (`...EXTRA_EDGES`, an identifier, a call, a template with a substitution), makes it
// unreadable and fails. `lists#declared` is not counted as an exception.
import ts from "typescript";
import path from "node:path";
import { hasPath, recordMetric } from "./record-metric.mjs";

export const BOUNDARIES_SOURCE = "packages/test-kit/src/boundaries.ts";
const LISTS = { APP_IMPORT_ALLOWLIST: "app-import", PLUGIN_MODULE_IMPORT_ALLOWLIST: "plugin-module-import" };
const DECLARED = "lists#declared";

/** Text this gate reads besides source files (the entry reads it from the merge-base too). */
export const layerExceptionsWantsText = (file) => hasPath(file, BOUNDARIES_SOURCE);

/** The listed edges of a boundaries.ts text, keyed `<list>#<edge>`. Exported for the gate's test. */
export function listedLayerExceptions(text) {
  const record = {};
  const found = new Set();
  const source = ts.createSourceFile(BOUNDARIES_SOURCE, text, ts.ScriptTarget.Latest, true);
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && LISTS[node.name.text] && node.initializer) {
      let list = node.initializer;
      while (ts.isAsExpression(list) || ts.isSatisfiesExpression(list) || ts.isParenthesizedExpression(list)) list = list.expression;
      // Readable means an array literal of string literals only: a spread of another array, an identifier, a call or a template
      // with a substitution hides edges from this count (the pinned test could then be edited together with the new import).
      if (ts.isArrayLiteralExpression(list) && list.elements.every((element) => ts.isStringLiteralLike(element))) {
        found.add(node.name.text);
        for (const element of list.elements) record[`${LISTS[node.name.text]}#${element.text}`] = 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.size === Object.keys(LISTS).length) record[DECLARED] = 1;
  return record;
}

/** D0272/D0280: listed edges cannot hide a second import point in an existing or new file. */
export function appImportSites(snapshot) {
  const counts = {};
  for (const file of snapshot.files.filter(file => /\.[cm]?[jt]sx?$/.test(file) && !file.includes("/dist/") && !file.startsWith("tests/"))) {
    const app = /^apps\/([^/]+)\/src\//.exec(file), importer = app ? `apps/${app[1]}` : file.startsWith("apps/desktop/launchers/") ? "." : null;
    if (!importer) continue;
    const source = ts.createSourceFile(file, snapshot.read(file) ?? "", ts.ScriptTarget.Latest, true);
    const visit = node => {
      const spec = (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) ? node.moduleSpecifier
        : ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") ? node.arguments[0]
        : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) ? node.argument.literal : null;
      if (spec && ts.isStringLiteralLike(spec)) {
        const named = /^@molis-ai\/molis-work-app-([^/]+)/.exec(spec.text);
        const relative = spec.text.startsWith(".") ? /^apps\/([^/]+)\//.exec(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec.text))) : null;
        const target = named ? `apps/${named[1]}` : relative ? `apps/${relative[1]}` : null;
        if (target && importer !== target) { const key = `import-site#${file} -> ${target}`; counts[key] = (counts[key] ?? 0) + 1; }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return counts;
}

// User approved this exact replacement with the server composition plan on 2026-11-09.
// Only the transition from both retired server edges to one root import is admitted; later imports still compare per file.
export function reviewedServerComposition(head, ref) {
  const old = ["app-import#apps/server -> apps/desktop", "app-import#apps/server -> apps/local-host"];
  const edge = "app-import#. -> apps/server", site = "import-site#apps/desktop/launchers/cli/main.ts -> apps/server";
  if (!old.every(key => ref[key] === 1 && !head[key]) || ref[edge] || head[edge] !== 1 || head[site] !== 1) return ref;
  return { ...ref, [edge]: 1, [site]: 1 };
}

export const layerExceptions = (helpers) => {
  const metric = recordMetric(helpers, {
    id: "layerExceptions",
    recordKey: "layerExceptions",
    totalKey: "layerExceptionsTotal",
    title: "Listed layer exceptions (App → App launcher edges, Plugin → Module edges)",
    summaryLabel: "layer exceptions",
    totalOf: (record) => Object.keys(record).filter((key) => key !== DECLARED).length,
    measure: (snapshot) => ({ ...listedLayerExceptions(snapshot.read(BOUNDARIES_SOURCE) ?? ""), ...appImportSites(snapshot) }),
    message: (key) => `new layer exception ${key.replace("#", " ")}; the lists in ${BOUNDARIES_SOURCE} only shrink: an App reaches another App only along the listed launcher edges, and a Plugin reaches a Module through a public Contract or the action directory (docs/system/PACKAGE-BOUNDARIES.md §2)`,
  });
  return {
    ...metric,
    grew(head, ref, env) {
      if (!(DECLARED in ref)) return [];
      if (!(DECLARED in head)) return [`the layer exception lists can no longer be read from ${BOUNDARIES_SOURCE}; keep them as array literals of string literals named ${Object.keys(LISTS).join(" and ")} (no spread, identifier or call among the elements), or change scripts/gates/layer-exceptions.mjs in the same review`];
      return metric.grew(head, reviewedServerComposition(head, ref), env);
    },
  };
};
