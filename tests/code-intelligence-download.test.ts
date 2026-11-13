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
  // Allowing downloads without saying where they come from is refused: no silent npmjs default in production config.
  assert.throws(() => languageServerSettings({ servers: [], downloads: "allow" }), /explicit registry/u);
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

test("Q5: scoped packages and build versions can be installed; a local command is used before downloading", async () => {
  const home = toolHome();
  try {
    // Scoped package and a build version survive the directory trip.
    const scoped = { package: "@scope/fake-lsp", version: "1.2.3+build.7", bin: "fake-lsp" } as const;
    let installs = 0;
    const downloaded = await ensureTool(scoped, {
      toolsRoot: home.tools, allow: () => true,
      install: async ({ destination }: { readonly destination: string }) => { installs += 1; installFake(destination); },
    });
    assert.equal(downloaded.source, "downloaded");
    assert.equal(installs, 1);
    assert.ok(downloaded.command.includes("@scope__fake-lsp"));

    // A local executable on PATH is used as is: no download (Q5 "prefer the local applicable version").
    const bin = join(home.root, "bin");
    mkdirSync(bin, { recursive: true });
    const local = join(bin, "fake-lsp-local");
    writeFileSync(local, `#!/bin/sh\nexec "${process.execPath}" "${fileURLToPath(new URL("./fixtures/fake-lsp-server.mjs", import.meta.url))}"\n`);
    chmodSync(local, 0o755);
    const saved = process.env.PATH;
    process.env.PATH = `${bin}${process.env.PATH ? `:${process.env.PATH}` : ""}`;
    try {
      const workspace = join(home.root, "work");
      mkdirSync(join(workspace, "src"), { recursive: true });
      writeFileSync(join(workspace, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n");
      process.env.FAKE_LSP_LOG = join(home.root, "local.log");
      const intelligence = createCodeIntelligence({
        servers: [{ extensions: [".ts"], command: "fake-lsp-local", languageId: "typescript",
          install: { package: "not-downloaded", version: "9.9.9", bin: "not-downloaded" } }],
        rootPath: workspace,
        tools: { root: home.tools, allow: () => true },
      });
      const result = await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
      assert.match(result, /a\.ts:3:10/u);
      await intelligence.close();
      assert.equal(existsSync(join(home.tools, "not-downloaded")), false);
    } finally { process.env.PATH = saved; delete process.env.FAKE_LSP_LOG; }
  } finally { home.close(); }
});

test("Q5: the real installer runs npm without scripts, with the registry, and without MOLIS_WORK_*", { timeout: 30_000 }, async () => {
  const home = toolHome();
  const bin = join(home.root, "bin");
  mkdirSync(bin, { recursive: true });
  const log = join(home.root, "npm.log");
  // A stand-in `npm` on PATH: it records what it was asked to do and lays down the package the fetcher verifies.
  writeFileSync(join(bin, "npm"), `#!/bin/sh
printf '%s\\n' "$@" > "${log}"
env | grep '^MOLIS_WORK_' >> "${log}" || true
# install --prefix <dir> ... <pkg>@<version>
while [ "$#" -gt 0 ]; do case "$1" in --prefix) shift; DEST="$1";; esac; shift; done
mkdir -p "$DEST/node_modules/.bin"
printf '#!/bin/sh\\nexec "%s" "%s"\\n' "${process.execPath}" "${fileURLToPath(new URL("./fixtures/fake-lsp-server.mjs", import.meta.url))}" > "$DEST/node_modules/.bin/fake-lsp"
chmod +x "$DEST/node_modules/.bin/fake-lsp"
`, { mode: 0o755 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${process.env.PATH ? `:${process.env.PATH}` : ""}`;
  process.env.MOLIS_WORK_ENCRYPTION_KEY = "must-not-reach-npm";
  try {
    const tool = await ensureTool(spec, { toolsRoot: home.tools, allow: () => true, registry: "https://registry.example.test" });
    assert.equal(tool.source, "downloaded");
    const recorded = readFileSync(log, "utf8").split("\n");
    assert.ok(recorded.includes("--ignore-scripts"), recorded.join(" "));
    assert.ok(recorded.includes("--registry") && recorded.includes("https://registry.example.test"));
    assert.ok(recorded.includes("fake-lsp@1.2.3"));
    assert.ok(!recorded.some(line => line.startsWith("MOLIS_WORK_")), "the platform environment does not reach npm");
  } finally { process.env.PATH = saved; delete process.env.MOLIS_WORK_ENCRYPTION_KEY; home.close(); }
});
