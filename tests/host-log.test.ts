import assert from "node:assert/strict";
import test from "node:test";
import { captureHostLog, hostLog, logMemoryLearning, logSearchIndexFailure, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import { withCallId } from "@molis-ai/molis-work-kernel";

/**
 * W5-13: the Host writes what goes wrong in the background as one structured line, not a console message. An entry is named by
 * a stable area and event, carries the ID of the call it happened in (the one a person copies from a failure) and the error's
 * name and code. It holds keys only: no error message, no stack, no text a person wrote. Developer traces are written only for
 * the areas `MOLIS_WORK_DEBUG` lists.
 */

async function captured(run: () => void | Promise<void>): Promise<HostLogEntry[]> {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { await run(); } finally { restore(); }
  return entries;
}

const CALL_ID = "2f6c1d0e-8a51-4c7b-9d3e-5b0a1c2d3e4f";

test("W5-13-01 a warning is one entry with its area and event, the call it happened in, and the error's name and code", async () => {
  const entries = await captured(async () => {
    const failure = Object.assign(new Error("index busy"), { code: "storage_busy" });
    await withCallId(CALL_ID, async () => { hostLog.warn("search", "index_update_failed", failure, { where: "search.sync", attempt: 2, first: true, previous: null }); });
    hostLog.error("web", "restart_failed", "not an Error");
  });
  assert.deepEqual(entries.map(({ at, ...rest }) => { assert.ok(!Number.isNaN(Date.parse(at))); return rest; }), [
    { level: "warn", area: "search", event: "index_update_failed", call_id: CALL_ID,
      error: { name: "Error", code: "storage_busy" }, fields: { where: "search.sync", attempt: 2, first: true, previous: null } },
    // Outside a call there is no ID.
    { level: "error", area: "web", event: "restart_failed", error: { name: "string" } },
  ]);
});

test("W5-13-02 a developer trace is written only for an area MOLIS_WORK_DEBUG lists; a warning does not depend on it", async () => {
  const before = process.env.MOLIS_WORK_DEBUG;
  try {
    delete process.env.MOLIS_WORK_DEBUG;
    assert.deepEqual(await captured(() => hostLog.debug("memory", "learned", { learned: 1 })), []);
    process.env.MOLIS_WORK_DEBUG = "search, memory";
    const listed = await captured(() => { hostLog.debug("memory", "learned", { learned: 1 }); hostLog.debug("browser", "frame"); });
    assert.deepEqual(listed.map(entry => [entry.level, entry.area, entry.event, entry.fields]), [["debug", "memory", "learned", { learned: 1 }]]);
    process.env.MOLIS_WORK_DEBUG = "*";
    assert.equal((await captured(() => hostLog.debug("browser", "frame"))).length, 1);
    delete process.env.MOLIS_WORK_DEBUG;
    assert.equal((await captured(() => hostLog.warn("memory", "learning_failed", new Error("x")))).length, 1);
  } finally {
    if (before === undefined) delete process.env.MOLIS_WORK_DEBUG; else process.env.MOLIS_WORK_DEBUG = before;
  }
});

test("W5-13-03 no text a person wrote, path or secret reaches the log: not from an error's message or stack, not from a field", async () => {
  const before = process.env.MOLIS_WORK_DEBUG;
  const personal = "我的私人笔记：周三去看医生";
  const secret = "sk-live-0123456789abcdef";
  const path = "/Users/someone/Documents/diary.md";
  try {
    process.env.MOLIS_WORK_DEBUG = "memory";
    const entries = await captured(() => {
      // The search index's background passes, as the Host wires them: a source's failure can quote what it was reading.
      logSearchIndexFailure(Object.assign(new Error(`读不到「${personal}」 ${path}`), { code: "notes.broken" }), "search.sync");
      // A learning pass whose memories say what the person said.
      logMemoryLearning({ ran: true, learned: [{ memory_id: "m1", text: personal }, { memory_id: "m2", text: secret }] });
      hostLog.warn("browser", "cdp_handler_failed", new Error(secret), { method: "Page.loadEventFired", note: personal, file: path, nested: { secret }, list: [secret] });
      hostLog.warn("projects", personal, Object.assign(new Error(path), { code: personal }), { [personal]: 1 });
    });
    const written = entries.map(entry => JSON.stringify(entry)).join("\n");
    for (const text of [personal, "周三", secret, path, "diary", "读不到"]) assert.equal(written.includes(text), false, `${text} is in the log:\n${written}`);
    assert.deepEqual(entries.map(({ at: _at, ...rest }) => rest), [
      { level: "warn", area: "search", event: "index_update_failed", error: { name: "Error", code: "notes.broken" }, fields: { where: "search.sync" } },
      { level: "debug", area: "memory", event: "learned", fields: { ran: true, learned: 2 } },
      { level: "warn", area: "browser", event: "cdp_handler_failed", error: { name: "Error" },
        fields: { method: "Page.loadEventFired", note: "[omitted]", file: "[omitted]", nested: "[omitted]", list: "[omitted]" } },
      // A name that is not a stable key is still written, as omitted, never thrown from the catch that logs it.
      { level: "warn", area: "projects", event: "[omitted]", error: { name: "Error" } },
    ]);
  } finally {
    if (before === undefined) delete process.env.MOLIS_WORK_DEBUG; else process.env.MOLIS_WORK_DEBUG = before;
  }
});
