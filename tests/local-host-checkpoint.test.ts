import assert from "node:assert/strict";
import test from "node:test";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HostCapabilityInvocation } from "@molis-ai/molis-work-contracts/platform/app-host";

test("trusted capability checkpoints remain outside business input and cannot outlive caller or registration", async () => {
  const capability: ActionDefinition<{ value: number }, number> = { capability_id: "fixture.effect", version: 1, operation: "command",
    action: { title: "Effect", description: "Add a value", kind: "operation", scope: "project", audiences: ["user"], permissions: [], subject_kinds: [],
      input_schema: { type: "object", properties: { value: { type: "integer" } }, required: ["value"], additionalProperties: false }, output_schema: { type: "integer" } } };
  let writes = 0, release!: () => void, enter!: () => void, checkpoint: HostCapabilityInvocation | undefined;
  let wait = Promise.resolve();
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => {} } });
  const reference = { project_id: "board", storage_key: "memory:checkpoint" };
  const register = () => host.registerAction(capability, async (_runtime, input, invocation) => {
    assert.deepEqual(Object.keys(input), ["value"], "callback cannot enter cloned inputs or business audit records");
    checkpoint = invocation; enter?.(); await wait;
    await invocation.beforeEffect();
    writes += input.value;
    return writes;
  });
  let remove = register();
  try {
    let allowed = true;
    const before_effect = async () => { if (!allowed) throw new Error("authority revoked"); };
    assert.equal(await host.client(reference).invoke(capability, { value: 1 }, { before_effect }), 1);
    await assert.rejects(checkpoint!.beforeEffect(), { code: "actions.expired" });
    for (const mode of ["revoked", "replaced"] as const) {
      const entered = new Promise<void>(resolve => { enter = resolve; });
      wait = new Promise<void>(resolve => { release = resolve; });
      const pending = host.client(reference).invoke(capability, { value: 10 }, { before_effect });
      const rejected = assert.rejects(pending, mode === "revoked" ? /authority revoked/ : { code: "actions.provider_changed" });
      await entered;
      if (mode === "revoked") allowed = false;
      else { remove(); remove = register(); }
      release(); await rejected;
      assert.equal(writes, 1);
      allowed = true;
    }
    wait = Promise.resolve();
    assert.equal(await host.client(reference).invoke(capability, { value: 2 }, { before_effect }), 3);
  } finally { release?.(); remove(); await host.close(); }
});
