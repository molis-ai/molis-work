import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";
import { acquireStorageOwner, borrowStorageOwner, type StorageOwner, type StorageOwnerBorrow } from "@molis-ai/molis-work-storage";

interface Answer { state?: string; code?: string; inode?: number; device?: number }
type Command = "acquire" | "borrow" | "release-borrow" | "release" | "stop";
const DEADLINE_MS = 2500;

/** Register before temporary directories so failed assertions also return every owned borrow and parent first. */
export function storageOwnerResources(t: TestContext) {
  const owners: StorageOwner[] = [], borrows: StorageOwnerBorrow[] = [];
  t.after(() => {
    for (const borrow of borrows) borrow.release();
    for (const owner of owners) owner.release();
  });
  return {
    acquire(directory: string) { const owner = acquireStorageOwner(directory); owners.push(owner); return owner; },
    borrow(directory: string, owner: unknown) { const borrow = borrowStorageOwner(directory, owner); borrows.push(borrow); return borrow; },
  };
}

/** The timer starts after the public package import, and includes the operation's actual answer. */
export function storageOwnerProcesses(t: TestContext) {
  const active = new Set<{ kill(): void; closed: Promise<unknown> }>();
  t.after(async () => {
    for (const child of active) child.kill();
    await Promise.all([...active].map(child => child.closed));
  });
  return { start: async (directory: string) => {
    const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), directory],
      { stdio: ["ignore", "ignore", "pipe", "ipc"], env: process.env });
    let stderr = "", serial = 0;
    const pending = new Map<number, { done(value: Answer): void; fail(error: Error): void; timer: NodeJS.Timeout }>();
    const kill = () => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); };
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => child.once("close", (code, signal) => {
      for (const request of pending.values()) { clearTimeout(request.timer); request.fail(new Error("owner child closed before answering: " + stderr)); }
      pending.clear(); resolve({ code, signal });
    }));
    const entry = { kill, closed }; active.add(entry);
    const abort = () => kill(); t.signal.addEventListener("abort", abort, { once: true });
    void closed.then(() => { active.delete(entry); t.signal.removeEventListener("abort", abort); });
    assert.ok(child.stderr); child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr = (stderr + chunk).slice(-2000); });
    const ready = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.on("message", (message: { ready?: boolean; id?: number; answer?: Answer }) => {
        if (message.ready) resolve();
        if (typeof message.id !== "number" || !message.answer) return;
        const request = pending.get(message.id); if (!request) return;
        pending.delete(message.id); clearTimeout(request.timer); request.done(message.answer);
      });
      void closed.then(result => reject(new Error("owner child did not become ready: " + JSON.stringify(result) + " " + stderr)));
    });
    if (t.signal.aborted) kill();
    await ready;
    const request = (command: Command): Promise<Answer> => new Promise((resolve, reject) => {
      const id = ++serial;
      const timer = setTimeout(() => { pending.delete(id); kill(); reject(new Error("the public ownership operation exceeded its ready deadline")); }, DEADLINE_MS);
      pending.set(id, { done: resolve, fail: reject, timer });
      child.send({ id, command }, error => { if (error) { clearTimeout(timer); pending.delete(id); reject(error); } });
    });
    return { request, closed, kill,
      stop: async () => { const answer = await request("stop"); assert.equal(answer.state, "stopped"); return closed; } };
  } };
}

async function runOwnerChild(directory: string) {
  const send = process.send?.bind(process);
  if (!send) throw new Error("The storage owner fixture needs its own IPC parent");
  let owner: StorageOwner | undefined, borrow: StorageOwnerBorrow | undefined;
  process.on("message", (message: { id: number; command: Command }) => {
    let answer: Answer;
    try {
      switch (message.command) {
        case "acquire": {
          owner = acquireStorageOwner(directory);
          const identity = statSync(join(directory, ".molis-runtime-owner.db"));
          answer = { state: "held", inode: identity.ino, device: identity.dev }; break;
        }
        case "borrow": borrow = borrowStorageOwner(directory, owner); answer = { state: "borrowed" }; break;
        case "release-borrow": borrow?.release(); borrow = undefined; answer = { state: "borrow-returned" }; break;
        case "release": owner?.release(); answer = { state: "released" }; break;
        case "stop": borrow?.release(); owner?.release(); answer = { state: "stopped" }; break;
      }
    } catch (error) {
      answer = { code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "no-code" };
    }
    send({ id: message.id, answer }, () => { if (message.command === "stop") process.disconnect(); });
  });
  send({ ready: true });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2]) await runOwnerChild(process.argv[2]);
