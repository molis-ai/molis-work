// K-1/BL-302: a child Run inherits the parent's pack, so its write triggers the same after-write executor. The SDK now
// names the Session and Run on the check; the executor must hand that identity to the note so the card can find the
// checker on the child's own attempt, not the parent's.

import assert from "node:assert/strict";
import test from "node:test";
import { afterWriteExecutor } from "../horizontal/agent-host/dist/adapters/prologue-after-write.js";

const checker = { checker_id: "node-check", display_name: "Node 语法", executable: "node", args: ["--check", "{file}"],
  applies_to: [".ts"], cwd: ".", timeout_ms: 30_000 };

test("the after-write note receives the Session and Run that wrote", async () => {
  const notes: Array<{ readonly about: unknown; readonly note: unknown }> = [];
  const executor = afterWriteExecutor({
    projectId: "p",
    rootPath: "/project",
    workspaceAt: async () => "app",
    store: { read: async () => ({ version: 4, checkers: [checker] }) } as never,
    note: async (about, note) => { notes.push({ about, note }); },
  });
  const session = { kind: "session", id: "s-child", revision: 2 } as const;
  const run = { kind: "run", id: "r-child", revision: 3 } as const;
  const answer = await executor({
    registration: { name: "molis-after-write", version: "1" } as never,
    args: { path: "src/a.ts" },
    afterWriteCheck: { operationKey: "after-write-check:1", writeCallId: "w1", session, run },
  } as never);
  assert.match(String(answer), /--check/u);
  assert.deepEqual(notes, [{
    about: { operationKey: "after-write-check:1", writeCallId: "w1", session, run },
    note: { checker_id: "node-check", display_name: "Node 语法", version: 4, write_call_id: "w1" },
  }]);
});

test("a direct model call has no afterWriteCheck and is refused, not run", async () => {
  const executor = afterWriteExecutor({
    projectId: "p", rootPath: "/project", workspaceAt: async () => "app",
    store: { read: async () => ({ version: 4, checkers: [checker] }) } as never,
    note: async () => undefined,
  });
  await assert.rejects(executor({ registration: { name: "molis-after-write", version: "1" } as never, args: { path: "src/a.ts" } } as never), /写后检查只由 SDK/u);
});
