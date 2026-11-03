import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { type TestContext } from "node:test";

async function fixture(t: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), "molis-home-snapshot-cli-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home"), snapshot = join(directory, "snapshot");
  await mkdir(join(home, "config"), { recursive: true });
  const body = JSON.stringify({ schema_version: 1, completed: true, display_name: "Retained person" }) + "\n";
  await writeFile(join(home, "config", "onboarding.json"), body, { mode: 0o640 });
  return { directory, home, snapshot, body };
}

async function cli(t: TestContext, args: string[]) {
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../apps/desktop/launchers/cli/main.ts", import.meta.url)), "home", ...args],
    { env: { ...process.env, MOLIS_WORK_TEST: "1" }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal }));
  });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
  return { ...await closed, stdout, stderr };
}

test("RAC-104-S-01 RAC-109-S-05: the actual CLI publishes retained Home content and a verifiable manifest", async t => {
  const f = await fixture(t);
  const result = await cli(t, ["snapshot", "--home", f.home, "--to", f.snapshot, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, "created");
  const manifest = JSON.parse(await readFile(join(f.snapshot, "manifest.json"), "utf8"));
  assert.equal(manifest.schema_version, 1);
  const store = manifest.stores.find((entry: { path: string }) => entry.path === "config/onboarding.json");
  assert.equal(store.state, "captured");
  const entry = store.entries.find((item: { kind: string }) => item.kind === "file");
  assert.equal(entry.mode, 0o640);
  assert.equal(await readFile(join(f.snapshot, entry.payload_path), "utf8"), f.body);
  assert.equal(entry.sha256, createHash("sha256").update(f.body).digest("hex"));
  assert.equal(await readFile(join(f.home, "config", "onboarding.json"), "utf8"), f.body);
  assert.equal((await lstat(f.snapshot)).mode & 0o777, 0o700);
  assert.equal((await lstat(join(f.snapshot, entry.payload_path))).mode & 0o777, 0o600);
});

test("RAC-109-S-05: missing/unknown arguments and existing or in-Home destinations produce no snapshot", async t => {
  const f = await fixture(t), existing = join(f.directory, "existing");
  await mkdir(existing); await writeFile(join(existing, "keep"), "existing result");
  for (const suffix of [[], ["--to"], ["--to", "--json"], ["--to", f.snapshot, "--unknown"],
    ["--to", existing], ["--to", join(f.home, "nested")], ["--to", f.snapshot, "--to", join(f.directory, "duplicate")]]) {
    const result = await cli(t, ["snapshot", "--home", f.home, ...suffix]);
    assert.notEqual(result.code, 0, JSON.stringify(suffix));
    assert.equal(result.stdout, "");
  }
  assert.equal(await readFile(join(existing, "keep"), "utf8"), "existing result");
  assert.deepEqual((await readdir(f.directory)).sort(), ["existing", "home"]);
});

test("RAC-109-S-05: a symlink destination and a destination that contains Home are refused without touching either", async t => {
  const f = await fixture(t), existing = join(f.directory, "existing"), alias = join(f.directory, "alias");
  await mkdir(existing); await writeFile(join(existing, "keep"), "another owner's result");
  await symlink(existing, alias);
  for (const destination of [alias, f.directory]) {
    const result = await cli(t, ["snapshot", "--home", f.home, "--to", destination, "--json"]);
    assert.equal(result.code, 1, result.stderr); assert.equal(result.stdout, "");
  }
  assert.equal(await readFile(join(existing, "keep"), "utf8"), "another owner's result");
  assert.deepEqual((await readdir(f.directory)).sort(), ["alias", "existing", "home"]);
});
