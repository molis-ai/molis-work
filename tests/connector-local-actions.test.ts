import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { connectorLocalActions, connectorManagementActions, connectorSetupIntentAction, holdConnectorAuthorizationsForSession, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";
import { MCP_FIXTURE } from "./fixtures/mcp-notes-server.js";

const caller: ActionCallContext = { actor_id: "local-plan-person", audience: "agent", project_id: null,
  permissions: ["connectors:management:read", "connectors:management:write", "mcp:external"] };
function plan(home: string, secret = false) {
  writeFileSync(join(home, "tool.mjs"), (secret ? "if(process.env.SERVICE_KEY!=='fixture-page-only')process.exit(1);\n" : "") + MCP_FIXTURE);
  return { display_name: "My local tool", expected_revision: null, source: { kind: "executable", executable: realpathSync(process.execPath) },
    args: ["tool.mjs"], cwd: realpathSync(home), environment_names: secret ? ["SERVICE_KEY"] : [] };
}
test("ASC-05 ASC-14 ASC-22: prepare does not execute, execution joins the actual directory and cannot be repeated", async t => {
  const home = await openTestHome(t), input = plan(home.home), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(caller, connectorLocalActions.prepare, input) as { authorization_id: string; setup: { installation: { platform: string } } };
  assert.equal(prepared.setup.installation.platform, process.platform);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  const result = await actions.invoke(caller, connectorLocalActions.execute, { authorization_id: prepared.authorization_id }) as { status: string; connectionId: string };
  assert.equal(result.status, "connected"); assert.equal(existsSync(join(home.home, "mcp-notes.jsonl")), false);
  await actions.invoke(caller, { capability_id: `mcp.connector.${result.connectionId}.record_review_note`, provider_id: `system.connectors#mcp:${result.connectionId}`, version: 1 }, { note: "through the common directory" });
  assert.deepEqual(JSON.parse(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8")), { note: "through the common directory" });
  await assert.rejects(actions.invoke(caller, connectorLocalActions.execute, { authorization_id: prepared.authorization_id }), /已开始|已结束/);
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 1);
  // ASC-20 ASC-23: the settings HTTP path must control Home connections without a selected project.
  const manage = `/api/settings/connectors/connections/${result.connectionId}/manage`;
  const revision = () => withConnectorConnections(home.home, store => store.require(result.connectionId).updated_at);
  const initial = revision();
  await assert.rejects(home.web.post(manage, { action: "disable", expected_revision: "stale-revision" }), { status: 409 });
  assert.equal(revision(), initial);
  await home.web.post(manage, { action: "disable", expected_revision: initial });
  const ref = { capability_id: `mcp.connector.${result.connectionId}.record_review_note`, provider_id: `system.connectors#mcp:${result.connectionId}`, version: 1 };
  await assert.rejects(actions.invoke(caller, ref, { note: "must not write" }));
  assert.equal(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8").trim().split("\n").length, 1);
  await assert.rejects(home.web.post(manage, { action: "enable", expected_revision: initial }), { status: 409 });
  await home.web.post(manage, { action: "enable", expected_revision: revision() });
  await actions.invoke(caller, ref, { note: "after re-enabling" });
  assert.deepEqual(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line)),
    [{ note: "through the common directory" }, { note: "after re-enabling" }]);
  await home.web.post(manage, { action: "remove", expected_revision: revision() });
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  await assert.rejects(actions.invoke(caller, ref, { note: "removed connection must not write" }));
  assert.equal(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8").trim().split("\n").length, 2);
});
test("S-36 ASC-08 ASC-14: only the protected local form supplies environment values and cannot substitute a prepared launch", async t => {
  const home = await openTestHome(t), input = plan(home.home, true), actions = home.host.homeActionClient();
  const prepared = await actions.invoke(caller, connectorLocalActions.prepare, input) as { authorization_id: string; url: string };
  const needed = await actions.invoke(caller, connectorLocalActions.execute, { authorization_id: prepared.authorization_id }) as { status: string };
  assert.equal(needed.status, "needs_person"); assert.equal(withConnectorConnections(home.home, store => store.list().length), 0);
  const body = { setup_id: prepared.authorization_id, environment: { SERVICE_KEY: "fixture-page-only" } };
  const refused = await fetch(home.origin + "/api/settings/connectors/methods/local/connect", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(refused.status, 403);
  await assert.rejects(home.web.post("/api/settings/connectors/methods/local/connect", { ...body, executable: "/other/program" }));
  await assert.rejects(home.web.post("/api/settings/connectors/methods/local/connect", { ...body, environment: { SERVICE_KEY: "fixture-page-only", NODE_OPTIONS: "--inspect" } }));
  const result = await home.web.post<{ status: string; connectionId: string }>("/api/settings/connectors/methods/local/connect", body);
  assert.equal(result.status, "connected");
  const status = await actions.invoke(caller, connectorManagementActions.authorization, { authorization_id: prepared.authorization_id });
  assert.doesNotMatch(JSON.stringify(status), /fixture-page-only/);
  assert.doesNotMatch(await (await fetch(home.origin + prepared.url)).text(), /fixture-page-only/);
  assert.equal(existsSync(join(home.home, "mcp-notes.jsonl")), false);
});

test("S-37 ASC-34 ASC-35: local execution reports the current intent hold before and after protected submission", async t => {
  const home = await openTestHome(t), actions = home.host.homeActionClient(), owner = { ...caller, runtime_session_id: "local-intent-work" };
  const prepared = await actions.invoke(owner, connectorLocalActions.prepare, plan(home.home, true)) as { authorization_id: string };
  holdConnectorAuthorizationsForSession(home.home, owner.runtime_session_id, owner.actor_id, "read-only-intent");
  const execute = () => actions.invoke(owner, connectorLocalActions.execute, { authorization_id: prepared.authorization_id }) as Promise<{ status: string; awaiting_intent?: boolean; intent_revision?: string }>;
  const held = await execute();
  assert.equal(held.status, "pending"); assert.equal(held.awaiting_intent, true); assert.equal(held.intent_revision, "read-only-intent");
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  const submitted = await home.web.post<{ status: string; awaiting_intent?: boolean }>("/api/settings/connectors/methods/local/connect",
    { setup_id: prepared.authorization_id, environment: { SERVICE_KEY: "fixture-page-only" } });
  assert.equal(submitted.status, "pending"); assert.equal(submitted.awaiting_intent, true);
  assert.deepEqual(await execute(), held);
  assert.deepEqual(withConnectorConnections(home.home, store => store.list()), []);
  await assert.rejects(actions.invoke(owner, connectorSetupIntentAction,
    { authorization_id: prepared.authorization_id, intent_revision: "older-intent", decision: "retain" }), /已变化|已结束/);
  const accepted = await actions.invoke(owner, connectorSetupIntentAction,
    { authorization_id: prepared.authorization_id, intent_revision: held.intent_revision, decision: "retain" }) as { status: string; connection_id: string };
  assert.equal(accepted.status, "connected");
  await actions.invoke(owner, { capability_id: `mcp.connector.${accepted.connection_id}.record_review_note`, provider_id: `system.connectors#mcp:${accepted.connection_id}`, version: 1 }, { note: "only after the latest intent" });
  assert.deepEqual(JSON.parse(readFileSync(join(home.home, "mcp-notes.jsonl"), "utf8")), { note: "only after the latest intent" });
  assert.equal(withConnectorConnections(home.home, store => store.list().length), 1);
  assert.doesNotMatch(JSON.stringify([held, submitted, accepted]), /fixture-page-only/);
});

// RAC-1494: the same directory through the cleanup action is a declared invalid refusal, and the refusal itself carries no
// local path (the record read's ENOENT text used to).
test("RAC-1494 cleanup of a managed install without its ownership record is a declared invalid refusal without the home path", async t => {
  const home = await openTestHome(t), id = "0e3b1d6a-4b5f-4c47-9a58-2f0f9d6b9f11", directory = join(home.home, "runtime/connectors/installs", id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "keep.txt"), "not ours");
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorLocalActions.cleanup, { installation_id: id }), (error: { code?: string; kind?: string; message?: string }) => {
    assert.equal(error.code, "connector.install.invalid");
    assert.equal(error.kind, "invalid");
    assert.equal(error.message, "安装所有权记录缺失，未移除任何文件", "the action passes the declared refusal's own sentence on");
    assert.ok(!(error.message ?? "").includes(home.home), "the refusal does not name the local path");
    return true;
  });
  assert.equal(existsSync(join(directory, "keep.txt")), true, "nothing in a directory we cannot own is removed");
});
// RAC-1640: an ownership record that is there but is not JSON is still an owner we cannot read, so the install stays and the
// refusal is the same declared invalid one (not the raw SyntaxError the parse throws).
test("RAC-1640 cleanup of a managed install whose ownership record is not valid JSON is a declared invalid refusal and removes nothing", async t => {
  const home = await openTestHome(t), id = "6f1c2d3e-4a5b-4c6d-8e7f-90a1b2c3d4e5", directory = join(home.home, "runtime/connectors/installs", id);
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "installation.json"), "{\"id\":");
  writeFileSync(join(directory, "keep.txt"), "not ours");
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorLocalActions.cleanup, { installation_id: id }), (error: { code?: string; kind?: string; message?: string }) => {
    assert.equal(error.code, "connector.install.invalid");
    assert.equal(error.kind, "invalid");
    assert.equal(error.message, "安装所有权记录无法读取，未移除任何文件", "the action passes the declared refusal's own sentence on");
    return true;
  });
  assert.equal(existsSync(join(directory, "keep.txt")), true, "nothing in an install whose owner we cannot read is removed");
  assert.equal(readFileSync(join(directory, "installation.json"), "utf8"), "{\"id\":", "the unreadable record is left as it was");
});

// RAC-1641: an ownership record path that is a directory reads as EISDIR; it gets the same declared refusal and nothing goes.
test("RAC-1641 cleanup of a managed install whose ownership record is a directory is a declared invalid refusal and removes nothing", async t => {
  const home = await openTestHome(t), id = "7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d", directory = join(home.home, "runtime/connectors/installs", id);
  mkdirSync(join(directory, "installation.json"), { recursive: true });
  writeFileSync(join(directory, "keep.txt"), "not ours");
  await assert.rejects(home.host.homeActionClient().invoke(caller, connectorLocalActions.cleanup, { installation_id: id }), (error: { code?: string; kind?: string; message?: string }) => {
    assert.equal(error.code, "connector.install.invalid");
    assert.equal(error.kind, "invalid");
    assert.equal(error.message, "安装所有权记录无法读取，未移除任何文件", "the action passes the declared refusal's own sentence on");
    return true;
  });
  assert.equal(existsSync(join(directory, "keep.txt")), true, "nothing in an install whose owner we cannot read is removed");
  assert.equal(existsSync(join(directory, "installation.json")), true, "the record directory is left in place");
});
