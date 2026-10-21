import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { directoryForHome } from "@molis-ai/molis-work-app-local-host";

function home(t: { after(fn: () => void): void }) {
  const directory = mkdtempSync(join(tmpdir(), "directory-grant-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("PRR-03 S-47 a directory grant reads only below its chosen root, never through a relative or symlinked escape", async t => {
  const root = home(t), outside = join(root, "outside"); mkdirSync(outside); mkdirSync(join(root, "vault"));
  writeFileSync(join(root, "vault", "inside.md"), "inside"); writeFileSync(join(outside, "secret.md"), "secret");
  symlinkSync(outside, join(root, "vault", "escape"));
  const service = directoryForHome(root), grant = await service.authorize(join(root, "vault"));
  assert.equal((await service.read({ grant_id: grant.grant_id, path: ["inside.md"], kind: "text" })).outcome, "text");
  assert.equal((await service.read({ grant_id: grant.grant_id, path: ["..", "outside", "secret.md"], kind: "text" })).outcome, "denied");
  assert.equal((await service.read({ grant_id: grant.grant_id, path: ["..", "secret.md"], kind: "text" })).outcome, "denied");
  assert.equal((await service.read({ grant_id: grant.grant_id, path: ["escape", "secret.md"], kind: "text" })).outcome, "denied");
  assert.equal((await service.read({ grant_id: grant.grant_id, path: ["inside.md"], kind: "bytes" })).outcome, "bytes");
});

test("PRR-03 S-47 a grant is required and cannot authorize a relative or symlinked directory", async t => {
  const root = home(t), vault = join(root, "vault"), link = join(root, "link"); mkdirSync(vault); symlinkSync(vault, link);
  const service = directoryForHome(root);
  await assert.rejects(service.authorize("vault"), /绝对/);
  await assert.rejects(service.authorize(link), /符号链接|实际目录/);
  assert.equal((await service.read({ grant_id: "missing", path: [], kind: "directory" })).outcome, "denied");
  const grant = await service.authorize(vault);
  assert.equal((await service.read({ grant_id: grant.grant_id, path: [], kind: "directory" })).outcome, "directory");
});
