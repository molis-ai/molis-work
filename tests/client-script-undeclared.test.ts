import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { CLIENT_SCRIPT } from "../apps/workbench/src/browser-assets.js";

/**
 * The Workbench browser program is assembled from string segments, so TypeScript never sees inside it: a variable
 * whose declaration was removed but whose use was not only fails when that branch runs (a Feed schedule failure once
 * threw `phase is not defined` and left the form disabled). Check the assembled program for names nothing declares.
 */
// Globals other scripts on the same page define before this program runs.
const PAGE_GLOBALS = new Set([
  "L", // client i18n script
  "molisWorkControlHeaders", // control client script
  "__name", // keep-names helper the bundler adds to functions serialized with toString()
]);

function undeclaredNames(source: string): Map<string, number> {
  const file = "client.js";
  const options: ts.CompilerOptions = { allowJs: true, checkJs: true, noEmit: true, target: ts.ScriptTarget.ES2022, strict: false, noImplicitAny: false,
    lib: ["lib.es2023.d.ts", "lib.dom.d.ts", "lib.dom.iterable.d.ts"] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, language) => name === file ? ts.createSourceFile(file, source, language, true, ts.ScriptKind.JS) : read(name, language);
  const names = new Map<string, number>();
  for (const diagnostic of ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))) {
    // 2304: Cannot find name. 2552: Cannot find name, did you mean …
    if (diagnostic.file?.fileName !== file || (diagnostic.code !== 2304 && diagnostic.code !== 2552)) continue;
    const name = ts.flattenDiagnosticMessageText(diagnostic.messageText, "").match(/'([^']+)'/)?.[1] ?? "?";
    names.set(name, (names.get(name) ?? 0) + 1);
  }
  return names;
}

test("the assembled Workbench browser program uses no name that nothing declares", { timeout: 120_000 }, () => {
  const unknown = [...undeclaredNames(CLIENT_SCRIPT)].filter(([name]) => !PAGE_GLOBALS.has(name));
  assert.deepEqual(unknown, [], "declare these, or list a real page global here with where it comes from");
});

test("the check catches a leftover reference in a branch that rarely runs", () => {
  const leftover = `document.addEventListener("click", async () => { try { await fetch("/x"); } catch { const label = phase === "out-rule" ? "a" : "b"; console.log(label); } });`;
  assert.deepEqual([...undeclaredNames(leftover).keys()], ["phase"]);
});
