// The check before review of a Coding write (specs/coding-plugin/next-requirements.md A4-2; docs/design/coding-daily-basics
// scheme A): the proposed text is formatted by the language server, only the errors the change brings are reported, and the
// formatted text is what goes up for review (F-1). A file type no server answers for is "not checked" with the reason, never
// "no errors". CLS-03: a server that is missing or fails does not pass for a clean check.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodeIntelligence, languageServersFrom, registerWriteChecks, writeCheckKey } from "@molis-ai/molis-work-service-agent-host";

const fake = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures/fake-format-lsp-server.mjs");

function round(t: test.TestContext, env: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "molis-write-check-"));
  mkdirSync(join(root, "src"));
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  const servers = languageServersFrom({ servers: [
    { extensions: [".go"], command: process.execPath, args: [fake], languageId: "go" },
    { extensions: [".ts"], command: process.execPath, args: [fake], languageId: "typescript" },
  ] });
  const intelligence = createCodeIntelligence({ servers, rootPath: root });
  t.after(async () => {
    await intelligence.close(); rmSync(root, { recursive: true, force: true });
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  return { root, intelligence };
}

test("A4-2 CLS-01: a write is formatted before review and only the errors it brings are reported", async (t) => {
  const { root, intelligence } = round(t);
  writeFileSync(join(root, "src/a.go"), "package a\nBAD old\n");
  const checked = await intelligence.checkWrite({ path: "src/a.go", before: "package a\nBAD old\n", after: "package a   \nBAD old\nBAD new\nx := 1  \n" });
  assert.equal(checked.text, "package a\nBAD old\nBAD new\nx := 1\n", "go: the whole file is the formatter's");
  assert.deepEqual(checked.checks.formatting, { state: "formatted", source: "node", lines: 2, as_written: "package a   \nBAD old\nBAD new\nx := 1  \n" });
  assert.deepEqual(checked.checks.diagnostics, { state: "errors", source: "node", errors: [{ code: "E1", line: 3, text: "bad line" }], more: 0 },
    "the error the file already had is not new; the one the change brings is, on its line, with the first line of its message");
});

test("A4-2: elsewhere only the lines the change touched are formatted; a clean change says so", async (t) => {
  const { root, intelligence } = round(t, { FAKE_LSP_PULL: "1" });
  writeFileSync(join(root, "src/b.ts"), "keep  \nold\n");
  const checked = await intelligence.checkWrite({ path: "src/b.ts", before: "keep  \nold\n", after: "keep  \nnew  \n" });
  assert.equal(checked.text, "keep  \nnew\n", "the untouched line keeps its own form");
  assert.deepEqual(checked.checks.diagnostics, { state: "clean", source: "node" }, "pulled diagnostics");
});

test("B35-R8 a stale empty push cannot clear new diagnostics, including after the symbol tool opened the file", async t => {
  const { root, intelligence } = round(t, { FAKE_LSP_STALE: "1" });
  const path = "src/a.ts", before = "export const n = 1;\n";
  writeFileSync(join(root, path), before);
  await intelligence.symbolIndex({ args: { path } } as never);
  for (const after of ["BAD new\n", "BAD new  \n"]) {
    const checked = await intelligence.checkWrite({ path, before, after });
    assert.equal(checked.text, "BAD new\n");
    assert.equal(checked.checks.diagnostics.state, "errors");
  }
});

test("B35-R8 unversioned diagnostics leave the current text unchecked", async t => {
  const { intelligence } = round(t, { FAKE_LSP_UNVERSIONED: "1" });
  const checked = await intelligence.checkWrite({ path: "src/new.go", before: undefined, after: "package test\n" });
  assert.equal(checked.checks.diagnostics.state, "unchecked");
});

test("B35-R8 TypeScript's advertised pull reports the error in the current formatted document", async t => {
  const { root, intelligence } = round(t, { FAKE_LSP_UNVERSIONED: "1", FAKE_LSP_TS_REQUEST: "1" });
  const path = "src/pull.ts", before = "export const n = 1;\n";
  writeFileSync(join(root, path), before);
  const checked = await intelligence.checkWrite({ path, before, after: "BAD new  \n" });
  assert.equal(checked.text, "BAD new\n");
  assert.deepEqual(checked.checks.diagnostics, { state: "errors", source: "node", errors: [{ code: "1001", line: 1, text: "bad line" }], more: 0 });
});

test("A4-2 CLS-03: no server, no formatter or a failing one are said as such, never as clean", async (t) => {
  const { intelligence } = round(t, { FAKE_LSP_FORMAT_ERROR: "1" });
  const none = await intelligence.checkWrite({ path: "src/c.zig", before: undefined, after: "const x = 1;\n" });
  assert.equal(none.text, "const x = 1;\n");
  assert.equal(none.checks.diagnostics.state, "unchecked");
  assert.equal(none.checks.formatting.state, "unavailable");
  const failed = await intelligence.checkWrite({ path: "src/new.go", before: undefined, after: "package new  \n" });
  assert.equal(failed.text, "package new  \n", "a formatter that failed leaves the text as written");
  assert.deepEqual(failed.checks.formatting, { state: "failed", source: "node", reason: "rustfmt.toml: unknown key `max_widht`" });
  assert.equal(failed.checks.diagnostics.state, "clean", "a new file has no old errors to subtract");
  await assert.rejects(intelligence.checkWrite({ path: "../outside.go", before: undefined, after: "x" }), /outside/);
});

test("A4-2 F-1: the round's hook rewrites a write and an edit to the formatted text and keeps the facts for that exact text", async (t) => {
  const { root, intelligence } = round(t);
  writeFileSync(join(root, "src/a.go"), "package a\nold\n");
  let handler: ((context: { toolName?: string; input: unknown }) => Promise<{ kind: string; input?: unknown }>) | undefined;
  const hooks = { register: (hook: { handler: typeof handler }) => { handler = hook.handler; }, unregister: () => { handler = undefined; } };
  const store = new Map();
  const stop = registerWriteChecks({ hooks } as never, store, { sessionId: "s1", rootPath: root, intelligence });
  assert.deepEqual(await handler!({ toolName: "read", input: { path: "src/a.go" } }), { kind: "allow" }, "other tools pass untouched");
  const write = await handler!({ toolName: "write", input: { path: "src/a.go", text: "package a  \nnew\n" } });
  assert.deepEqual(write, { kind: "rewrite", input: { path: "src/a.go", text: "package a\nnew\n" }, why: "格式化后再审查" });
  assert.equal(store.get(writeCheckKey("s1", "src/a.go", "package a\nnew\n"))?.formatting.state, "formatted", "the card finds the facts by the reviewed text");
  assert.equal(store.get(writeCheckKey("s1", "src/a.go", "package a  \nnew\n")), undefined, "and only by it");
  const edit = await handler!({ toolName: "edit", input: { path: "src/a.go", find: "old", replace: "new  " } });
  assert.deepEqual(edit, { kind: "rewrite", input: { path: "src/a.go", find: "package a\nold\n", replace: "package a\nnew\n" }, why: "格式化后再审查" });
  assert.deepEqual(await handler!({ toolName: "edit", input: { path: "src/a.go", find: "zzz", replace: "q" } }), { kind: "allow" }, "an edit that cannot be worked out passes as it is");
  stop();
  assert.equal(handler, undefined, "the hook goes when the round ends");
});

test("A4-2 the round's hook reads nothing outside the round's directory: through `..` or a link, a write passes on untouched", async (t) => {
  const { root, intelligence } = round(t);
  const outside = mkdtempSync(join(tmpdir(), "write-check-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, "secret.go"), "package secret\nold\n");
  symlinkSync(join(outside, "secret.go"), join(root, "src", "linked.go"));
  let handler: ((context: { toolName?: string; input: unknown }) => Promise<{ kind: string; input?: unknown }>) | undefined;
  const store = new Map();
  registerWriteChecks({ hooks: { register: (hook: { handler: typeof handler }) => { handler = hook.handler; }, unregister: () => undefined } } as never, store, { sessionId: "s2", rootPath: root, intelligence });
  for (const input of [{ path: "src/linked.go", find: "old", replace: "new  " }, { path: `../${basename(outside)}/secret.go`, find: "old", replace: "new  " }]) {
    assert.deepEqual(await handler!({ toolName: "edit", input }), { kind: "allow" }, input.path);
  }
  assert.equal(store.size, 0, "nothing was read or checked for a file outside the directory");
});

test("B35 P1-E1: LSP applyEdits clamps oversized character positions to each line end (LF and CRLF) and keeps same-start edits deterministic", async (t) => {
  // Case 1: character = 2147483647 on line 0 with CRLF must clamp before \r\n without swallowing line 1.
  const crlfEdits = [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 2147483647 } }, newText: "package main" },
  ];
  {
    const { intelligence } = round(t, { FAKE_LSP_CUSTOM_EDITS: JSON.stringify(crlfEdits) });
    const checked = await intelligence.checkWrite({ path: "src/crlf.go", before: undefined, after: "package main   \r\nvar x = 1\r\n" });
    assert.equal(checked.text, "package main\r\nvar x = 1\r\n");
  }

  // Case 2: same-start insertion + replacement (in either order) and multiple zero-width insertions at one position.
  const sameStartForward = [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "/*a*/" },
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "/*b*/" },
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, newText: "package" },
  ];
  {
    const { intelligence } = round(t, { FAKE_LSP_CUSTOM_EDITS: JSON.stringify(sameStartForward) });
    const checked = await intelligence.checkWrite({ path: "src/same-start-a.go", before: undefined, after: "pkg_old main\n" });
    assert.equal(checked.text, "/*a*//*b*/package main\n");
  }

  const sameStartReverse = [
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, newText: "package" },
    { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: "/*pre*/" },
  ];
  {
    const { intelligence } = round(t, { FAKE_LSP_CUSTOM_EDITS: JSON.stringify(sameStartReverse) });
    const checked = await intelligence.checkWrite({ path: "src/same-start-b.go", before: undefined, after: "pkg_old main\n" });
    assert.equal(checked.text, "/*pre*/package main\n");
  }

  // Case 3 (P2-5): overlapping, inverted, fractional, or null/NaN LSP edits must fail formatting safely and keep original text.
  const original = "package main  \nvar x = 1\n";
  const malformedCases: Array<[string, unknown[]]> = [
    ["overlapping ranges", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 6 } }, newText: "A" },
      { range: { start: { line: 0, character: 3 }, end: { line: 0, character: 9 } }, newText: "B" },
    ]],
    ["same-start overlapping replacements", [
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } }, newText: "A" },
      { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 7 } }, newText: "B" },
    ]],
    ["inverted range", [
      { range: { start: { line: 0, character: 7 }, end: { line: 0, character: 2 } }, newText: "X" },
    ]],
    ["fractional coordinate", [
      { range: { start: { line: 0, character: 1.5 }, end: { line: 0, character: 3 } }, newText: "X" },
    ]],
    ["null/NaN coordinate", [
      { range: { start: { line: Number.NaN, character: 0 }, end: { line: 0, character: 2 } }, newText: "X" },
    ]],
  ];
  for (const [label, edits] of malformedCases) {
    const { intelligence } = round(t, { FAKE_LSP_CUSTOM_EDITS: JSON.stringify(edits) });
    const checked = await intelligence.checkWrite({ path: "src/malformed.go", before: undefined, after: original });
    assert.equal(checked.text, original, `${label}: original text must remain intact`);
    assert.equal(checked.checks.formatting.state, "failed", `${label}: formatting must report failed`);
  }
});
