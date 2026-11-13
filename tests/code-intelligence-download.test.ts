// Q5 (specs/coding-plugin/next-requirements.md，用户 2026-11-28 定)：缺少语言服务器时自动下载到平台管理的隔离目录，
// 装到一半不算可用，已装好的复用，关掉下载就明确拒绝。

import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodeIntelligence, ensureTool, languageServerSettings } from "@molis-ai/molis-work-service-agent-host";

// A test builds the executable it "installed"; the fetcher itself is exercised with an injected installer.
function toolHome(): { readonly root: string; readonly tools: string; close(): void } {
  const root = mkdtempSync(join(tmpdir(), "molis-code-tools-"));
  return { root, tools: join(root, "tools"), close: () => rmSync(root, { recursive: true, force: true }) };
}

const spec = { package: "fake-lsp", version: "1.2.3", bin: "fake-lsp" } as const;

function installFake(directory: string): void {
  mkdirSync(join(directory, "node_modules", ".bin"), { recursive: true });
  const script = join(directory, "node_modules", ".bin", "fake-lsp");
  writeFileSync(script, `#!/bin/sh\nexec "${process.execPath}" "${fileURLToPath(new URL("./fixtures/fake-lsp-server.mjs", import.meta.url))}"\n`);
  chmodSync(script, 0o755);
}

test("Q5 CLS-01: a tool already installed is reused, and the install runs once", async () => {
  const home = toolHome();
  try {
    let installs = 0;
    const options = {
      toolsRoot: home.tools,
      allow: () => true,
      install: async ({ destination }: { readonly destination: string }) => { installs += 1; installFake(destination); },
    };
    const first = await ensureTool(spec, options);
    assert.equal(first.source, "downloaded");
    assert.equal(installs, 1);
    // Reused without installing again.
    const again = await ensureTool(spec, options);
    assert.equal(again.source, "installed");
    assert.equal(installs, 1);
    // And a concurrent second request while one is in flight waits for that one (no second install).
    installs = 0;
    rmSync(join(home.tools, "fake-lsp"), { recursive: true, force: true });
    const both = await Promise.all([ensureTool(spec, options), ensureTool(spec, options)]);
    assert.equal(installs, 1);
    // Both callers waited on the same install, so both got the tool that this call downloaded.
    assert.deepEqual(both.map(one => one.source), ["downloaded", "downloaded"]);
  } finally { home.close(); }
});

test("Q5 CLS-02: downloads off is a refusal, and a failed install leaves nothing behind", async () => {
  const home = toolHome();
  try {
    await assert.rejects(ensureTool(spec, { toolsRoot: home.tools, allow: () => false, install: async () => undefined }), /downloads are off/u);
    let run = 0;
    await assert.rejects(ensureTool(spec, {
      toolsRoot: home.tools, allow: () => true,
      install: async ({ destination }: { readonly destination: string }) => { run += 1; installFake(destination); throw new Error("the registry hung up"); },
    }), /could not install fake-lsp@1\.2\.3: the registry hung up/u);
    assert.equal(run, 1);
    // A half-installed version directory is not marked usable and the temporary directory is gone.
    assert.equal(existsSync(join(home.tools, "fake-lsp", "1.2.3")), false);
    assert.equal(existsSync(join(home.tools, "fake-lsp", "installed.json")), false);
    assert.deepEqual(readdirSync(home.tools).filter(name => name.includes(".tmp-")), []);
  } finally { home.close(); }
});

test("Q5: the configuration says where a missing server comes from, and defaults to no downloads", () => {
  assert.deepEqual(languageServerSettings({ servers: [] }).downloads, false);
  assert.deepEqual(languageServerSettings({ servers: [], downloads: "deny" }).downloads, false);
  assert.deepEqual(languageServerSettings({ servers: [], downloads: "allow", registry: "https://registry.npmjs.org" }).downloads, true);
  assert.throws(() => languageServerSettings({ servers: [], downloads: "yes" }), /"allow" or "deny"/u);
  assert.throws(() => languageServerSettings({ servers: [], registry: "http://example.com" }), /https/u);
  const parsed = languageServerSettings({ servers: [{ extensions: [".ts"], command: "fake-lsp", install: { package: "@scope/fake-lsp", version: "1.2.3", bin: "fake-lsp" } }] });
  assert.deepEqual(parsed.servers[0]?.install, { package: "@scope/fake-lsp", version: "1.2.3", bin: "fake-lsp" });
  assert.throws(() => languageServerSettings({ servers: [{ extensions: [".ts"], command: "x", install: { package: "x", version: "latest", bin: "x" } }] }), /exact version/u);
});

test("Q5: a downloaded server is actually started for a round and closed with it", { timeout: 30_000 }, async () => {
  const home = toolHome();
  try {
    // The persona "installed" this package in the isolated root before the round: a real executable and its marker.
    const directory = join(home.tools, "fake-lsp", "1.2.3");
    installFake(directory);
    writeFileSync(join(directory, "installed.json"), JSON.stringify({ package: "fake-lsp", version: "1.2.3", bin: "fake-lsp", registry: "https://registry.npmjs.org" }) + "\n");
    const workspace = join(home.root, "work");
    mkdirSync(join(workspace, "src"), { recursive: true });
    writeFileSync(join(workspace, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n");
    process.env.FAKE_LSP_LOG = join(home.root, "server.log");
    let installs = 0;
    const intelligence = createCodeIntelligence({
      servers: [{ extensions: [".ts"], command: "/nonexistent/fake-lsp", languageId: "typescript", install: spec }],
      rootPath: workspace,
      tools: { root: home.tools, allow: () => true, registry: "https://registry.npmjs.org" },
    });
    void installs;
    const result = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    assert.match(result, /a\.ts:3:10/u);
    await intelligence.close();
    assert.match(readFileSync(process.env.FAKE_LSP_LOG, "utf8"), /exited/u);
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); }
});
