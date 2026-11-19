import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { codeIntelligenceReadiness, createCodeIntelligence, type LanguageServerSpec } from "@molis-ai/molis-work-service-agent-host";
import { buildCodeIntelligenceHtml } from "@molis-ai/molis-work-plugin-coding";
import { installTextForTest } from "@molis-ai/molis-work-plugin-sdk/ui";
import { pagePack } from "./fixtures/page-text.js";

/** A program that exists: readiness only looks for it, never starts it. */
async function program(directory: string, name: string): Promise<string> {
  const file = path.join(directory, name);
  await writeFile(file, "#!/bin/sh\nexit 0\n");
  await chmod(file, 0o755);
  return file;
}

test("CLS-01 A4: a round lists only the languages its directory uses, and whether each one's program is on this machine", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-code-ready-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const bin = path.join(root, ".bin"); await mkdir(bin);
  const tsServer = await program(bin, "ts-server");
  await writeFile(path.join(root, "tsconfig.json"), "{}");
  await writeFile(path.join(root, "package.json"), "{}");
  await mkdir(path.join(root, "src"));
  await writeFile(path.join(root, "src", "a.ts"), "export const a = 1;\n");
  await writeFile(path.join(root, "src", "b.js"), "export const b = 1;\n");
  await writeFile(path.join(root, "pyproject.toml"), "[project]\n");
  const servers: LanguageServerSpec[] = [
    { command: tsServer, extensions: [".ts"], languageId: "typescript" },
    { command: tsServer, extensions: [".js"], languageId: "javascript" },
    { command: "molis-no-such-language-server", extensions: [".py"], languageId: "python" },
    { command: "molis-no-such-go-server", extensions: [".go"], languageId: "go" },
  ];
  const found = await codeIntelligenceReadiness({ servers, rootPath: root });
  // TypeScript's server reads the JavaScript too: one row. Go has no files here, so it is not listed or looked for. Rows go by language.
  assert.deepEqual(found, { languages: [
    { language: "python", command: "molis-no-such-language-server", state: "missing" },
    { language: "typescript", command: tsServer, state: "ready", source: "this_machine" },
  ] });

  const empty = await mkdtemp(path.join(tmpdir(), "molis-code-empty-"));
  t.after(() => rm(empty, { recursive: true, force: true }));
  assert.deepEqual(await codeIntelligenceReadiness({ servers, rootPath: empty }), { languages: [] }, "a directory with no source lists nothing");
});

test("B35-R8 a directory and a non-executable file are missing; an executable that exits reports a startup failure", async t => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-code-start-failure-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, "main.ts"), "const a = 1;\n");
  const plainFile = path.join(root, "plain");
  await writeFile(plainFile, "not a program", { mode: 0o600 });
  for (const command of [root, plainFile]) {
    const { languages } = await codeIntelligenceReadiness({ rootPath: root, servers: [{ command, extensions: [".ts"] }] });
    assert.equal(languages[0]?.state, "missing");
  }
  const command = await program(root, "exits-on-start");
  const intelligence = createCodeIntelligence({ rootPath: root, servers: [{ command, extensions: [".ts"] }] });
  t.after(() => intelligence.close());
  assert.equal((await intelligence.readiness()).languages[0]?.state, "ready", "discovery found the executable");
  const checked = await intelligence.checkWrite({ path: "main.ts", before: "const a = 1;\n", after: "const a = 2;\n" });
  assert.equal(checked.checks.diagnostics.state, "unchecked");
  if (checked.checks.diagnostics.state === "unchecked") {
    assert.equal(checked.checks.diagnostics.cause, "failed");
    assert.match(checked.checks.diagnostics.reason, /failed to start/);
  }
});

test("CLS-03 A4: after a restart a complete tool in the Home's tools folder is used as is; a half-finished one is not counted", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "molis-code-tools-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const project = path.join(root, "project"), tools = path.join(root, "tools");
  await mkdir(project); await writeFile(path.join(project, "main.py"), "print(1)\n");
  const install = { package: "pyright", version: "1.1.389", bin: "pyright-langserver" };
  const servers: LanguageServerSpec[] = [{ command: "molis-no-such-pyright", extensions: [".py"], languageId: "python", install }];
  const directory = path.join(tools, "pyright", "1.1.389");
  await mkdir(path.join(directory, "node_modules", ".bin"), { recursive: true });
  await program(path.join(directory, "node_modules", ".bin"), "pyright-langserver");
  // No marker yet: an interrupted install is not usable.
  assert.equal((await codeIntelligenceReadiness({ servers, rootPath: project, tools: { root: tools } })).languages[0]!.state, "missing");
  await writeFile(path.join(directory, "installed.json"), JSON.stringify({ ...install, registry: "https://registry.npmjs.org" }));
  assert.deepEqual((await codeIntelligenceReadiness({ servers, rootPath: project, tools: { root: tools } })).languages,
    [{ language: "python", command: "molis-no-such-pyright", state: "ready", source: "tools" }]);
});

test("CLS-03 A4 scheme A: the process line folds when every language is ready and opens with a recovery block when one is not", (t) => {
  t.after(installTextForTest({ locale: "zh", packs: [pagePack("coding", "zh")] }));
  assert.equal(buildCodeIntelligenceHtml(undefined), "", "a round without code understanding shows nothing");
  assert.equal(buildCodeIntelligenceHtml({ languages: [] }), "");
  const ready = buildCodeIntelligenceHtml({ languages: [
    { language: "typescript", command: "typescript-language-server", state: "ready", source: "this_machine" },
    { language: "rust", command: "rust-analyzer", state: "ready", source: "tools" },
  ] });
  assert.match(ready, /代码理解 · 已找到 2 种语言的工具/);
  assert.doesNotMatch(ready, /<details[^>]* open/, "all ready: the line stays folded");
  assert.match(ready, /TypeScript<\/b><span[^>]*>在本机找到 typescript-language-server/);
  assert.match(ready, /Rust<\/b><span[^>]*>在 Molis 工具目录找到 rust-analyzer/);

  const missing = buildCodeIntelligenceHtml({ languages: [
    { language: "typescript", command: "typescript-language-server", state: "ready", source: "this_machine" },
    { language: "python", command: "pyright-langserver", state: "missing" },
  ] });
  assert.match(missing, /<details[^>]* open/, "a language not ready opens the line");
  assert.match(missing, /代码理解 · Python 没准备好/);
  assert.match(missing, /本机没有 pyright-langserver/);
  assert.match(missing, /这轮不查/);
  assert.match(missing, /data-slot="env-recovery"/);
  assert.match(missing, /写完不会说成「没有错误」/, "not checked is never said as no errors");

  const broken = buildCodeIntelligenceHtml({ problem: "language-servers.json 读不了：Unexpected token", languages: [] });
  assert.match(broken, /<details[^>]* open/);
  assert.match(broken, /语言服务器设置读不了/);
  assert.match(broken, /Unexpected token/);
});
