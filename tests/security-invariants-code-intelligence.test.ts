// S-code-intelligence (docs/system/security-invariants/S-code-intelligence.md): the Host-side code intelligence reads only
// inside the round's directory — a symlink that leaves it is refused — and the language server it starts never inherits the
// Home's own secret environment. Both are refusals, not happy paths.

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createCodeIntelligence, languageServersFrom } from "@molis-ai/molis-work-service-agent-host";

const here = fileURLToPath(new URL(".", import.meta.url));
const fake = join(here, "fixtures/fake-lsp-server.mjs");

function workspace(): { readonly root: string; readonly log: string; close(): void } {
  const root = mkdtempSync(join(tmpdir(), "molis-code-intelligence-invariant-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src/a.ts"), "export function greet(): string {\n  return 'hi';\n}\n");
  const log = join(root, "server.log");
  return { root, log, close: () => rmSync(root, { recursive: true, force: true }) };
}

const servers = (log: string) => {
  process.env.FAKE_LSP_LOG = log;
  return languageServersFrom({ servers: [{ extensions: [".ts"], command: process.execPath, args: [fake], languageId: "typescript" }] });
};

test("S-code-intelligence: a symlink inside the round that points outside it is refused", { timeout: 30_000 }, async () => {
  const home = workspace();
  const outside = mkdtempSync(join(tmpdir(), "molis-code-intelligence-outside-"));
  try {
    writeFileSync(join(outside, "secret.ts"), "export const leaked = 1;\n");
    symlinkSync(join(outside, "secret.ts"), join(home.root, "src/link.ts"));
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    await assert.rejects(intelligence.symbolIndex({ args: { path: "src/link.ts", symbol: "leaked" } } as never), /outside it/u);
    // The refusal came before the server was even started for that file.
    await intelligence.close();
  } finally { delete process.env.FAKE_LSP_LOG; home.close(); rmSync(outside, { recursive: true, force: true }); }
});

test("S-code-intelligence: the language server never inherits MOLIS_WORK_* environment", { timeout: 30_000 }, async () => {
  const home = workspace();
  process.env.MOLIS_WORK_ENCRYPTION_KEY = "must-not-reach-the-server";
  try {
    const intelligence = createCodeIntelligence({ servers: servers(home.log), rootPath: home.root });
    await intelligence.symbolIndex({ args: { path: "src/a.ts", symbol: "greet" } } as never);
    await intelligence.close();
    const log = readFileSync(home.log, "utf8");
    assert.match(log, /started/u);
    // The fake server writes a line when the platform key reached it; the client strips MOLIS_WORK_* before spawn.
    assert.doesNotMatch(log, /leaked-env/u);
  } finally { delete process.env.MOLIS_WORK_ENCRYPTION_KEY; delete process.env.FAKE_LSP_LOG; home.close(); }
});
