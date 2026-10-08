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
// record `lists#declared` says the lists exist, and once the merge-base has it, a head that can no longer be read (the lists
// renamed or moved) fails too, so the lists cannot be emptied out of the gate's sight. It is not counted as an exception.
import ts from "typescript";
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
      if (ts.isArrayLiteralExpression(list)) {
        found.add(node.name.text);
        for (const element of list.elements) if (ts.isStringLiteralLike(element)) record[`${LISTS[node.name.text]}#${element.text}`] = 1;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.size === Object.keys(LISTS).length) record[DECLARED] = 1;
  return record;
}

export const layerExceptions = (helpers) => {
  const metric = recordMetric(helpers, {
    id: "layerExceptions",
    recordKey: "layerExceptions",
    totalKey: "layerExceptionsTotal",
    title: "Listed layer exceptions (App → App launcher edges, Plugin → Module edges)",
    summaryLabel: "layer exceptions",
    totalOf: (record) => Object.keys(record).filter((key) => key !== DECLARED).length,
    measure: (snapshot) => listedLayerExceptions(snapshot.read(BOUNDARIES_SOURCE) ?? ""),
    message: (key) => `new layer exception ${key.replace("#", " ")}; the lists in ${BOUNDARIES_SOURCE} only shrink: an App reaches another App only along the listed launcher edges, and a Plugin reaches a Module through a public Contract or the action directory (docs/system/PACKAGE-BOUNDARIES.md §2)`,
  });
  return {
    ...metric,
    grew(head, ref, env) {
      if (!(DECLARED in ref)) return [];
      if (!(DECLARED in head)) return [`the layer exception lists can no longer be read from ${BOUNDARIES_SOURCE}; keep them as array literals named ${Object.keys(LISTS).join(" and ")}, or change scripts/gates/layer-exceptions.mjs in the same review`];
      return metric.grew(head, ref, env);
    },
  };
};
