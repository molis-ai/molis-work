import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveHomeDirectory, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

export async function runHomeEntry(t: TestContext, kind: "cli" | "web", args: string[], home?: string) {
  const launcher = kind === "cli" ? "cli/main.ts" : "web/server.ts";
  const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(new URL("../../apps/desktop/launchers/" + launcher, import.meta.url)), ...args],
    { env: { ...process.env, MOLIS_WORK_TEST: "1", ...(home === undefined ? {} : { MOLIS_WORK_HOME: home }) }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
  const closed = new Promise<{ code: number | null }>((done, fail) => { child.once("error", fail); child.once("close", code => done({ code })); });
  t.after(async () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); await closed; });
  return { ...await closed, stdout, stderr };
}

export function testHomeEntryErrors(kind: "cli" | "web") {
  for (const code of ["EACCES", "ELOOP"] as const) {
    for (const source of ["--home", "MOLIS_WORK_HOME"] as const) {
      // Give each real launcher its own isolated Home and timeout. Under Linux load, four sequential launches can exceed 30 seconds.
      test(`R59-ERROR-01 ${kind} from ${source}: real ${code} reports the configured Home and recovery without entering business or writing`, { timeout: 30_000 }, async t => {
        const area = await realpath(await mkdtemp(join(tmpdir(), "molis-home-error-")));
        const parent = join(area, code === "EACCES" ? "blocked" : "loop-a"), home = join(parent, "home"), snapshot = join(area, "snapshot");
        await writeFile(join(area, "retained.txt"), "the original user's bytes\n");
        t.after(async () => {
          if (code === "EACCES") await chmod(parent, 0o700);
          await rm(area, { recursive: true, force: true });
        });
        if (code === "EACCES") { await mkdir(parent); await chmod(parent, 0o000); }
        else { await symlink("loop-b", parent); await symlink("loop-a", join(area, "loop-b")); }
        const originalEntries = (await readdir(area)).sort(), parentInode = (await lstat(parent)).ino;
        let native: NodeJS.ErrnoException | undefined;
        try { realpathSync(home); } catch (error) { native = error as NodeJS.ErrnoException; }
        assert.equal(native?.code, code, "the filesystem itself produces the required refusal");
        const reason = code === "EACCES" ? "权限不足" : "符号链接循环";
        const checkError = (value: unknown): boolean => {
          assert.ok(value instanceof Error);
          const error = value as NodeJS.ErrnoException;
          for (const field of ["code", "path", "syscall", "errno", "cause"] as const) assert.equal(error[field], native![field]);
          assert.ok(error.message.includes(JSON.stringify(home)), "the complete configured Home, not only the failing ancestor");
          assert.ok(error.message.includes(reason));
          assert.ok(error.message.includes("--home") && error.message.includes("MOLIS_WORK_HOME"));
          assert.ok(error.message.endsWith(native!.message), "the original system diagnosis is retained");
          return true;
        };
        assert.throws(() => resolveHomeDirectory(home), checkError);
        let entered = false;
        assert.throws(() => runWithMolisWorkHome(home, () => { entered = true; }), checkError);
        assert.equal(entered, false, "Home resolution refuses before entering the scoped operation");

        const homeArgs = source === "--home" ? ["--home", home] : [];
        const args = kind === "web" ? [...homeArgs, "--port", "0"] : ["home", "snapshot", ...homeArgs, "--to", snapshot];
        if (kind === "cli" && source === "MOLIS_WORK_HOME") args.push("--json");
        const result = await runHomeEntry(t, kind, args, source === "MOLIS_WORK_HOME" ? home : undefined);
        assert.equal(result.code, 1, result.stderr);
        assert.equal(result.stdout, "", "neither a snapshot nor a listening Web server is announced");
        for (const text of [JSON.stringify(home), reason, code, "--home", "MOLIS_WORK_HOME"]) assert.ok(result.stderr.includes(text), result.stderr);
        if (kind === "cli") assert.ok(result.stderr.startsWith("错误: "), "native errors retain the existing CLI text exit, including --json");
        await assert.rejects(lstat(snapshot), { code: "ENOENT" }, "no snapshot is published");
        assert.deepEqual((await readdir(area)).sort(), originalEntries, "no Home, lock, business record or staging is created");
        assert.equal((await lstat(parent)).ino, parentInode, "the original directory or link is not replaced");
        assert.equal(await readFile(join(area, "retained.txt"), "utf8"), "the original user's bytes\n");
        if (code === "EACCES") {
          assert.equal((await stat(parent)).mode & 0o777, 0, "the product does not change permissions");
          await chmod(parent, 0o700);
          assert.deepEqual(await readdir(parent), [], "no Home or business data was created in the blocked parent");
        } else {
          assert.equal(await readlink(parent), "loop-b");
          assert.equal(await readlink(join(area, "loop-b")), "loop-a", "the product does not repair the loop");
        }
      });
    }
  }
}
