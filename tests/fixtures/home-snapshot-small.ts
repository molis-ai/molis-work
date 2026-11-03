import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { createHomeSnapshot } from "@molis-ai/molis-work-app-local-host";

export async function smallSnapshotHome(t: TestContext) {
  const area = await realpath(await mkdtemp(join(tmpdir(), "molis-snapshot-refusal-"))), home = join(area, "home"), snapshot = join(area, "snapshot");
  await mkdir(home);
  t.after(() => rm(area, { recursive: true, force: true }));
  return { area, home, snapshot, async file(path: string, value: string | Buffer = "Retained user bytes") {
    const target = join(home, path); await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, value, { mode: 0o640 }); return target;
  } };
}

/** Never open an ownership lock or a SQLite sidecar, even while asserting zero business writes. */
export async function snapshotBusinessFingerprint(home: string): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  const visit = async (directory: string, prefix: string) => {
    for (const name of (await readdir(directory)).sort()) {
      const path = prefix ? prefix + "/" + name : name;
      if (/^\.molis-runtime-owner\.db(?:-journal|-wal|-shm)?$/u.test(basename(path))
        || /^secrets\.lock\.sqlite(?:-journal|-wal|-shm)?$/u.test(basename(path)) || /-(?:journal|wal|shm)$/u.test(name)
        || path === "images/runners") continue;
      const file = join(directory, name), info = await lstat(file);
      if (info.isSymbolicLink()) result[path] = { link: await readlink(file) };
      else if (info.isDirectory()) await visit(file, path);
      else if (info.isFile()) result[path] = { mode: info.mode & 0o777, mtime: info.mtimeMs, sha256: createHash("sha256").update(await readFile(file)).digest("hex") };
      else result[path] = { mode: info.mode, type: "special" };
    }
  };
  await visit(home, ""); return result;
}

export async function assertSnapshotRefused(f: Awaited<ReturnType<typeof smallSnapshotHome>>, code?: string, message?: RegExp) {
  const before = await snapshotBusinessFingerprint(f.home);
  await assert.rejects(createHomeSnapshot({ homeDirectory: f.home, destination: f.snapshot }), error => {
    assert.ok(error instanceof Error);
    if (code) { assert.ok("code" in error); assert.equal(error.code, code); }
    if (message) assert.match(error.message, message);
    return true;
  });
  assert.deepEqual(await snapshotBusinessFingerprint(f.home), before, "the refusal did not rewrite business files, keys or permissions");
  assert.equal((await readdir(f.area)).some(name => name === "snapshot" || name.startsWith(".molis-home-snapshot-")), false, "no complete output or private staging is left by a normal refusal");
}
