// S-108: who may switch the account a consumer uses (spec assistant-service-connections §13.4). This first part holds the
// contract every consumer's switch is declared with; the aggregate action and the consumers add their refusals here.
import assert from "node:assert/strict";
import test from "node:test";
import { actionReachesAudience, type ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { defineConnectorUsagesSwitchAction } from "@molis-ai/molis-work-contracts/services/connector-host";
import { compileActionSchema } from "@molis-ai/molis-work-kernel";

const switchAction = defineConnectorUsagesSwitchAction("example.connection.switch", "换用账号", ["connectors:management:write"], "home");

test("S-108 only the person reaches a consumer's switch: Agent, MCP, workflow and plugin callers are refused", () => {
  const others: ActionAudience[] = ["agent", "mcp", "workflow", "plugin"];
  assert.equal(actionReachesAudience(switchAction.action, switchAction.capability_id, "user"), true);
  for (const audience of others) assert.equal(actionReachesAudience(switchAction.action, switchAction.capability_id, audience), false, audience);
  assert.deepEqual(switchAction.action.audiences, ["user"]);
  assert.equal(switchAction.operation, "command");
  assert.equal(switchAction.action.effect, "write");
});

test("S-108 a switch input names only the two connections and the usages, never who calls or where", () => {
  const input = compileActionSchema(switchAction.action.input_schema);
  assert.equal(input({ from_connection_id: "a", to_connection_id: "b" }), true);
  assert.equal(input({ from_connection_id: "a", to_connection_id: "b", usage_ids: ["slot-1"] }), true);
  for (const trusted of ["actor_id", "project_id", "install_id", "audience", "credential"]) {
    assert.equal(input({ from_connection_id: "a", to_connection_id: "b", [trusted]: "x" }), false, trusted);
  }
  assert.equal(input({ to_connection_id: "b" }), false);
  assert.equal(input({ from_connection_id: "", to_connection_id: "b" }), false);
  const output = compileActionSchema(switchAction.action.output_schema!);
  assert.equal(output({ switched: ["slot-1"], refused: [{ usage_id: "slot-2", code: "connector.plugin_slots.slot_undeclared" }] }), true);
  // A refusal says which usage and a stable code; free text or a credential has no place to go.
  assert.equal(output({ switched: [], refused: [{ usage_id: "slot-2", code: "x", message: "token abc" }] }), false);
});
