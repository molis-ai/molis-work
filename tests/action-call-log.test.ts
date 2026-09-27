import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { DEMO_BOARD_ID, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { feedSourceActions as s } from "@molis-ai/molis-work-plugin-feed";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "../apps/local-host/src/project-host.js";
import { NATIVE_CONTENT_PERMISSIONS } from "../apps/local-host/src/content-action-providers.js";
import { ActionCallLog } from "../apps/local-host/src/action-call-log.js";

const PROJECT = "project-call-log";

test("commands that ran are recorded with caller and outcome, queries are not, and inputs never reach the record", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-"));
  const dbPath = join(home, "project.db");
  seedDemoBoard(dbPath);
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const reference = molisWorkHostProjectReference({ databasePath: dbPath, boardId: DEMO_BOARD_ID, projectId: PROJECT });
  const caller: ActionCallContext = { actor_id: "web-user", project_id: PROJECT, audience: "user", permissions: NATIVE_CONTENT_PERMISSIONS };
  const actions = bindActionClient(host.actionClient(reference), () => caller);
  try {
    const secret = "只在输入里出现的检索词";
    const { source } = await actions.invoke(s.register, { kind: "web_query", query: secret, name: "记录测试" });
    await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed_source_invalid_state" });
    await host.actionClient(reference).discover(caller);
    // A page retrying the same refused command becomes one entry with a count, not a flood that pushes real entries out.
    for (let i = 0; i < 3; i++) await assert.rejects(actions.invoke(s.disconnect, { source_id: source.source_id }), { code: "feed_source_invalid_state" });

    const calls = host.callLog!.list(PROJECT);
    assert.deepEqual(calls.map(row => [row.capability_id, row.ok]), [[s.disconnect.capability_id, false], [s.register.capability_id, true]], "newest first, commands only");
    assert.equal(calls[0]!.count, 4);
    assert.ok(calls[0]!.last_at! >= calls[0]!.at);
    assert.equal(calls[0]!.code, "feed_source_invalid_state");
    assert.equal(calls[1]!.actor_id, "web-user");
    assert.equal(calls[1]!.audience, "user");
    assert.equal(calls[1]!.provider_title, "Feed");
    assert.deepEqual(host.callLog!.list(null), [], "another scope sees none of them");
    assert.ok(!readFileSync(join(home, "logs/action-calls.jsonl"), "utf8").includes(secret), "the input is never written");
  } finally {
    await host.close();
    rmSync(home, { recursive: true, force: true });
  }
});

test("two processes sharing a Home keep each other's records, and a repeat rewrites only the last line", () => {
  const home = mkdtempSync(join(tmpdir(), "action-call-log-shared-"));
  const first = new ActionCallLog(home), second = new ActionCallLog(home);
  const caller: ActionCallContext = { actor_id: "web-user", project_id: null, audience: "user", permissions: [] };
  const action = (capability_id: string, operation = "command") => ({ capability_id, version: 1, provider_id: "system.test", operation, title: capability_id, provider_title: "测试" });
  try {
    first.record(caller, action("a.run"), { ok: true });
    second.record(caller, action("b.run"), { ok: true });
    first.record(caller, action("b.run"), { ok: true });
    first.record(caller, action("b.run"), { ok: true });
    second.record(caller, action("c.run"), { ok: false, message: "拒绝" });
    first.record(caller, action("q.read", "query"), { ok: true });
    assert.deepEqual(first.list(null).map(row => [row.capability_id, row.count ?? 1]), [["c.run", 1], ["b.run", 3], ["a.run", 1]]);
    assert.equal(readFileSync(join(home, "logs/action-calls.jsonl"), "utf8").trim().split("\n").length, 3, "one line per entry, none torn");
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
