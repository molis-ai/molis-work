// The Host's public entry is wide (specs/repository-anti-corruption N-11, W1-05).
//
// apps/local-host/src/index.ts re-exports whole files with `export *`, so every helper added to those files becomes public
// surface that tests and other packages can import. This counts the `export *` / `export * as ns` declarations in the
// listed entry files. It may only fall; the narrowing itself (an assembly interface apart from a test port) is a later
// slice, and nothing new may be added to the surface in the meantime.
import ts from "typescript";
import { recordMetric } from "./record-metric.mjs";

/** The entry files whose `export *` are counted. */
export const HOST_ENTRY_FILES = ["apps/local-host/src/index.ts"];

/** `export * from "…"` and `export * as ns from "…"` declarations of a source text. Exported for the gate's own test. */
export const exportStarCount = (file, text) => {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  return source.statements.filter((statement) => ts.isExportDeclaration(statement) && statement.moduleSpecifier
    && (!statement.exportClause || ts.isNamespaceExport(statement.exportClause))).length;
};

export const hostEntryExports = (helpers) => recordMetric(helpers, {
  id: "hostEntryExports",
  recordKey: "hostEntryExportStar",
  totalKey: "hostEntryExportStarTotal",
  title: "Host entry `export *` declarations",
  summaryLabel: "host export *",
  measure(snapshot) {
    const record = {};
    for (const file of HOST_ENTRY_FILES) {
      const text = snapshot.read(file);
      const count = text === null ? 0 : exportStarCount(file, text);
      if (count) record[`${file}#export-star`] = count;
    }
    return record;
  },
  message: (key, was, now) => `Host entry \`export *\` in ${key} ${was} → ${now}; export the names a consumer needs from the entry, or let it import the file's package entry; the Host's public surface only narrows`,
});
