import assert from "node:assert/strict";
import test from "node:test";
import { get as httpGet } from "node:http";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { agentAuthorizationActions, type AuthorizationDetail, type AuthorizationList } from "@molis-ai/molis-work-contracts/services/agent-host";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { openTestHome } from "./fixtures/test-home.js";

test("H1: an old Assistant settings page cannot overwrite the person's newer confirmation choice", { timeout: 30_000 }, async t => {
  const f = await openTestHome(t), project = await f.createProject("Authorization settings", ["todo"]);
  const path = `/projects/${project.project_id}/api/assistant/capabilities`;
  const read = async () => {
    const { capabilities } = await f.web.get<{ capabilities: Array<{ capability_id: string; provider_id: string; version: number;
      expected: string; reversible: boolean; confirm_always: boolean; enabled: boolean }> }>(path);
    const row = capabilities.find(entry => entry.capability_id === "todo.items.create" && entry.reversible);
    assert.ok(row);
    return row;
  };
  const { capability_id, provider_id, version, expected } = await read();
  const action = { capability_id, provider_id, version };
  await assert.rejects(f.web.post(path, { ...action, confirm_always: true }), { status: 400, code: "assistant.invalid" });
  const saved = await f.web.post<{ expected: string }>(path, { ...action, expected, confirm_always: true });
  assert.notEqual(saved.expected, expected);
  await assert.rejects(f.web.post(path, { ...action, expected, enabled: false, confirm_always: false }), { status: 409, code: "assistant.conflict" });
  const current = await read();
  assert.deepEqual([current.expected, current.enabled, current.confirm_always], [saved.expected, true, true]);
  const changed = await f.web.post<{ expected: string }>(path, { ...action, expected: current.expected, enabled: false });
  const after = await read();
  assert.deepEqual([after.expected, after.enabled, after.confirm_always], [changed.expected, false, true]);
  const restored = await f.web.post<{ expected: string }>(path, { ...action, expected: after.expected, enabled: true });
  assert.notEqual(restored.expected, current.expected, "the same switches do not revive an older edit");
  await assert.rejects(f.web.post(path, { ...action, expected: current.expected, confirm_always: false }), { status: 409, code: "assistant.conflict" });
});

test("H1: the unified settings gate keeps original MCP and Assistant tokens and reports a failed owner", { timeout: 50_000 }, async t => {
  const f = await openTestHome(t), project = await f.createProject("Unified authorizations", ["todo"]);
  const endpoint = "/api/settings/authorizations";
  const get = async <Output>(query: Record<string, string> = {}) => {
    return new Promise<Output>((resolve, reject) => {
      httpGet(f.origin + endpoint + "?" + new URLSearchParams(query), { headers: { "x-molis-work-control-token": f.controlToken } }, response => {
        response.setEncoding("utf8");
        let body = "";
        response.on("data", chunk => { body += chunk; });
        response.once("error", reject);
        response.once("end", () => {
          try { assert.equal(response.statusCode, 200, body); resolve(JSON.parse(body) as Output); }
          catch (error) { reject(error); }
        });
      }).once("error", reject);
    });
  };
  await assert.rejects(f.web.get(endpoint), { code: "actions.forbidden" });
  for (const audience of ["user", "agent", "mcp", "plugin"] as const) {
    await assert.rejects(f.host.homeActionClient().invoke({ actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience, project_id: null, permissions: [] },
      agentAuthorizationActions.list, {}), { code: audience === "plugin" ? "host.plugin_caller_invalid" : "actions.forbidden" });
  }
  const capability = `/projects/${project.project_id}/api/assistant/capabilities`;
  const { capabilities } = await f.web.get<{ capabilities: Array<{ capability_id: string; provider_id: string; version: number; expected: string }> }>(capability);
  const todo = capabilities.find(item => item.capability_id === "todo.items.create")!;
  const action = { capability_id: todo.capability_id, version: todo.version, provider_id: todo.provider_id };
  await f.web.post(capability, { ...action, expected: todo.expected, confirm_always: true });
  const grantPath = "/api/settings/mcp/actions";
  const granted = await f.web.post<{ generation: string }>(grantPath, { ...action, client_id: "runtime:test", project_id: null, enabled: true, expected: { expected_absent: true } });
  const listed = await get<AuthorizationList>({ project: "" });
  assert.ok(listed.owners.every(owner => owner.state === "complete"), JSON.stringify(listed.owners));
  const entry = listed.entries.find(item => item.owner === "mcp-client" && item.expected === granted.generation)!;
  assert.ok(entry);
  const opened = await get<AuthorizationDetail>({ project: "", owner: entry.owner, id: entry.id });
  assert.equal(opened.availability, "available");
  assert.ok(!("permissions" in opened));
  const changed = await f.web.post<AuthorizationDetail>(endpoint + "?project=", { owner: entry.owner, id: entry.id, expected: entry.expected, kind: "revoke" });
  assert.equal(changed.status, "revoked");
  await assert.rejects(f.web.post(endpoint, { owner: entry.owner, id: entry.id, expected: entry.expected, kind: "revoke" }), { code: "actions.conflict" });
  const original = await f.web.get<{ grants: { enabled: boolean; generation: string }[] }>(grantPath + "?" + new URLSearchParams({ client_id: "runtime:test" }));
  assert.deepEqual(original.grants.map(({ enabled, generation }) => [enabled, generation]), [[false, changed.expected]]);
  await writeFile(join(f.home, "config", "mcp-tools.json"), "{malformed");
  const partial = await get<AuthorizationList>();
  assert.ok(partial.entries.some(item => item.owner === "assistant-policy"));
  assert.equal(partial.owners.find(item => item.owner === "mcp-client")?.state, "failed");
  assert.equal(partial.owners.find(item => item.owner === "task-grant")?.state, "failed");
});
