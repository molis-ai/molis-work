import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const tool = fileURLToPath(new URL("../scripts/compact-client-string.mjs", import.meta.url));
const factory = `(host) => {
  // Formatting is not part of the browser program.
  const text = \`<p>
    \${host.word}
  </p>\`;
  return { text, matches: /a b/.test(host.word), padding: "  unchanged  " };
}`;
const execute = (script: string) => Function(`return (${script});`)()({ word: "a b" });

test("RING-06 client compaction preserves literal content and unrelated exports", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-ring-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "client.mjs");
  await writeFile(path, `export const CLIENT = ${JSON.stringify(factory)};\nexport const metadata = { name: "client" };\nexport function separate() { return 7; }\n`);
  await run(process.execPath, [tool, path, "CLIENT"]);
  const built = await import(pathToFileURL(path).href);
  assert.deepEqual(execute(built.CLIENT), { text: "<p>\n    a b\n  </p>", matches: true, padding: "  unchanged  " });
  assert.equal(built.separate(), 7);
  assert.deepEqual(built.metadata, { name: "client" });
  assert.ok(built.CLIENT.length < factory.length);
});

test("RING-06 delivery compaction derives factories from the catalog and keeps the public source", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-ring-catalog-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "catalog.mjs");
  await writeFile(path, `export const SOURCE = ${JSON.stringify(factory)};
    export const CATALOG = [{ project_plugin_id: "first", workbench: { clientFactory: SOURCE, stylesheet: "p { color: red }" } },
      { project_plugin_id: "without-client", workbench: { contributions: [] } }];`);
  await run(process.execPath, [tool, path, "CATALOG", "catalog"]);
  const built = await import(pathToFileURL(path).href);
  assert.equal(built.SOURCE, factory);
  assert.deepEqual(execute(built.CATALOG[0].workbench.clientFactory), execute(factory));
  assert.equal(built.CATALOG[0].workbench.stylesheet, "p { color: red }");
  assert.deepEqual(built.CATALOG[1], { project_plugin_id: "without-client", workbench: { contributions: [] } });
  assert.ok((await readFile(path, "utf8")).includes('export const SOURCE ='));
});

test("RING-06 program delivery keeps template text, return newlines and side-effect order", async t => {
  const directory = await mkdtemp(join(tmpdir(), "molis-ring-program-build-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "program.mjs");
  const source = `(() => {
    function stopped() { return /* a newline is significant
      */ host.effects.push("unreachable"); }
    function step(value) { host.effects.push(value); return value; }
    host.text = \`first \${step("one")}
      second \${\`nested \${step("two")}\`}
    \`;
    host.matches = /a b\\/c/.test("a b/c");
    host.stopped = stopped();
    if (host.enabled) { step("enabled"); } else { step("disabled"); }
  })();`;
  await writeFile(path, `export const ORIGINAL = ${JSON.stringify(source)};\nexport const DELIVERY = ORIGINAL;`);
  await run(process.execPath, [tool, path, "DELIVERY", "program"]);
  const built = await import(pathToFileURL(path).href);
  assert.equal(built.ORIGINAL, source);
  for (const enabled of [true, false]) {
    const host = { enabled, effects: [] };
    Function("host", built.DELIVERY)(host);
    assert.deepEqual(host, {
      enabled, effects: ["one", "two", enabled ? "enabled" : "disabled"],
      text: "first one\n      second nested two\n    ", matches: true, stopped: undefined,
    });
  }
});
