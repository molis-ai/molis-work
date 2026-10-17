import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);

test("UIV-05 native voice build replaces a worktree link without changing the other checkout", { skip: process.platform !== "darwin" }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-voice-build-"));
  try {
    const native = join(directory, "native"), commands = join(directory, "commands");
    await mkdir(join(native, "whisper", ".build", "release"), { recursive: true });
    await mkdir(join(native, "bin")); await mkdir(commands);
    await copyFile(new URL("../apps/local-host/native/materials/build-whisper.sh", import.meta.url), join(native, "build-whisper.sh"));
    await writeFile(join(commands, "swift"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    await writeFile(join(native, "whisper", ".build", "release", "jelly-whisper"), "new helper", { mode: 0o755 });
    const other = join(directory, "other-checkout-helper"), destination = join(native, "bin", "jelly-whisper");
    await writeFile(other, "other checkout original", { mode: 0o755 });
    await symlink(other, destination);
    const options = { env: { ...process.env, PATH: `${commands}:${process.env.PATH}` } };
    await run("/bin/bash", [join(native, "build-whisper.sh")], options);
    assert.equal(await readFile(other, "utf8"), "other checkout original");
    assert.equal((await lstat(destination)).isSymbolicLink(), false);
    assert.equal(await readFile(destination, "utf8"), "new helper");
    assert.notEqual((await lstat(destination)).mode & 0o111, 0);
    assert.deepEqual(await readdir(join(native, "bin")), ["jelly-whisper"]);
    await writeFile(join(commands, "swift"), "#!/bin/sh\nexit 7\n", { mode: 0o700 });
    await assert.rejects(run("/bin/bash", [join(native, "build-whisper.sh")], options));
    assert.equal(await readFile(destination, "utf8"), "new helper", "a failed build preserves the usable helper");
    assert.equal(await readFile(other, "utf8"), "other checkout original");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
