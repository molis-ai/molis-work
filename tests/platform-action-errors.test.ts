import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { recordedCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { openTestHome } from "./fixtures/test-home.js";

const command: ActionDefinition<Record<string, never>, null> = {
  capability_id: "example.platform.save", version: 1, operation: "command", action: {
    title: "Save", description: "A rejected write", kind: "operation", scope: "project", audiences: ["mcp"],
    permissions: [], subject_kinds: [], input_schema: { type: "object", additionalProperties: false }, output_schema: { type: "null" },
  },
};

test("W3-02-G1-01 real gateway preserves owner kind and details and marks only the matching recorded failure", { timeout: 60_000 }, async t => {
  const { host, home, origin, controlToken, createProject, grant, mcp } = await openTestHome(t);
  const project = await createProject("Gateway errors");
  const details = { current_version: 3, call_id: "owner-data-only", code: "owner-data-only" };
  let failure: unknown = new ActionError("example.stale", "原资料已变化", { kind: "conflict", details });
  const writes: string[] = [];
  await host.withProject(project.reference, () => host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "example-platform", title: "Example", kind: "plugin", plugin_id: "io.molis.work.example.platform" },
    definitions: [command], handlers: [{ ...command, handle: () => { if (failure) throw failure; writes.push("saved"); return null; } }],
  }));
  const clientId = "runtime:platform-errors";
  await grant(clientId, project.project_id, [command]);
  const { client, caller } = await mcp(clientId, project.project_id);
  const homeId = createHash("sha256").update(home).digest("hex");
  const send = (body: Record<string, unknown>) => fetch(origin + "/api/internal/action-service", { method: "POST", headers: {
    origin, "content-type": "application/json", "x-molis-work-control-token": controlToken, "x-molis-work-idempotency-key": randomUUID(),
  }, body: JSON.stringify({ home_id: homeId, client_id: clientId, project_id: project.project_id, ...body }) });
  const directory = await send({ operation: "discover" });
  const { instance_id } = await directory.json();
  const rawId = randomUUID();
  const denied = await send({ operation: "invoke", instance_id, call_id: rawId, capability: { capability_id: command.capability_id, version: 1 }, input: {} });
  assert.equal(denied.status, 409);
  assert.deepEqual(await denied.json(), { error: "原资料已变化", code: "example.stale", details, call_id: rawId });
  assert.equal(denied.headers.get("x-molis-work-call-id"), rawId);
  assert.equal(host.callLog!.find(rawId).length, 1);
  const forwardedId = randomUUID();
  await withCallId(forwardedId, async () => {
    await assert.rejects(client.invoke(caller, command, {}), (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.deepEqual([error.code, error.message, error.kind, error.details], ["example.stale", "原资料已变化", "conflict", details]);
      return true;
    });
    assert.equal(recordedCallId(), forwardedId, "the matching Host row is marked before the client throws");
  });
  assert.equal(host.callLog!.find(forwardedId).length, 1);
  const doorId = randomUUID();
  const malformed = await send({ operation: "invoke", instance_id, call_id: doorId, capability: "not a reference", input: {} });
  assert.equal(malformed.status, 400);
  assert.equal(Object.hasOwn(await malformed.json(), "call_id"), false);
  assert.equal(malformed.headers.get("x-molis-work-call-id"), null);
  assert.deepEqual(host.callLog!.find(doorId), []);
  failure = Object.assign(new Error("存储读取失败"), { code: "EIO", details: { private_driver: "not owner data" } });
  const internal = await send({ operation: "invoke", instance_id, call_id: randomUUID(), capability: { capability_id: command.capability_id, version: 1 }, input: {} });
  assert.equal(internal.status, 500);
  const internalBody = await internal.json();
  assert.deepEqual([internalBody.error, internalBody.code], ["存储读取失败", "actions.execution_failed"]);
  assert.equal(Object.hasOwn(internalBody, "details"), false);
  assert.deepEqual(writes, [], "no refused gateway call writes business data");
});
