import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { closeSync, existsSync, fstatSync, openSync, readSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const childEntry = fileURLToPath(new URL("./plugin-home-rollback-child.mjs", import.meta.url));

function tailHas(path: string, marker: string): boolean {
  try {
    const fd = openSync(path, "r");
    try {
      const tail = Buffer.alloc(4096), size = fstatSync(fd).size;
      const count = readSync(fd, tail, 0, tail.length, Math.max(0, size - tail.length));
      return tail.subarray(0, count).includes(marker);
    } finally { closeSync(fd); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function runRollbackPair(t: TestContext, files: { file: string; libraryFile: string },
  interrupt: boolean, subject?: string): Promise<string | undefined> {
  const { file, libraryFile } = files;
  const mode = subject ? "host-pair" : "pair";
  const child = spawn(process.execPath, [childEntry, file, "2", "trusted", mode, libraryFile, subject ?? ""], { stdio: ["ignore", "ignore", "inherit"] });
  const ended = once(child, "exit");
  const markerIn = () => readdirSync(dirname(file)).find(name => name.startsWith("molis-work.db-mj"));
  let selected: string | undefined;
  const observer = interrupt ? setInterval(() => {
    const marker = markerIn();
    if (selected || !marker) return;
    const path = join(dirname(file), marker);
    if (tailHas(file + "-journal", path) && tailHas(libraryFile + "-journal", path) && child.kill("SIGKILL")) selected = path;
  }, 1) : undefined;
  try {
    const result = await Promise.race([ended, once(t.signal, "abort").then(() => [])]);
    if (interrupt) {
      assert.equal(result[1], "SIGKILL");
      assert.ok(selected && existsSync(selected), "both rollback journals named the live super-journal at SIGKILL");
    } else assert.deepEqual(result, [0, null]);
    return selected;
  } finally {
    clearInterval(observer);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await ended;
  }
}
