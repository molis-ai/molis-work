import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createCodingTurnChanges } from "@molis-ai/molis-work-plugin-coding";

type TurnNode = {
  className: string;
  dataset: { codingTurnChanges?: string; key?: string };
  innerHTML: string;
  children: TurnNode[];
  querySelector(selector: string): { open?: boolean } | null;
};

function element(): TurnNode {
  return { className: "", dataset: {}, innerHTML: "", children: [], querySelector: () => null };
}

test("the per-turn change UI typechecks as its own module and draws a row", () => {
  const pluginRoot = fileURLToPath(new URL("../plugins/native/coding/", import.meta.url));
  const sourcePath = fileURLToPath(new URL("../plugins/native/coding/src/turn-changes-client.ts", import.meta.url));
  const source = readFileSync(sourcePath, "utf8");
  assert.match(source, /^export function createCodingTurnChanges\(\)/m);
  const config = ts.readConfigFile(`${pluginRoot}tsconfig.json`, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, pluginRoot);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  const diagnostics = ts.getPreEmitDiagnostics(program).filter(item => item.file?.fileName.endsWith("turn-changes-client.ts"));
  assert.deepEqual(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), []);

  Object.assign(globalThis, { document: { createElement: () => element() } });
  const block = element();
  const changes = { turn: 2, sequence: 4, files: [{ path: "src/app.ts", byte_length: 20, digest: "abc", checkpoint_id: "cp-1" }] };
  const run = { ref: { run_id: "run-1" }, phase: "completed", activity: [] };
  const node = createCodingTurnChanges().place(block, changes, run, true);
  assert.match(node.innerHTML, /src\/app\.ts/);
  assert.match(node.innerHTML, /按写入回执记下的实际修改/);
  assert.equal(node.dataset.codingTurnChanges, "run-1:2");
});
