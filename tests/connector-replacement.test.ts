// ASC-59 (spec assistant-service-connections §13.2): after logging in again to a remote MCP service, the page says how a switch went,
// usage by usage. These are the counts and reasons it words; the page itself is in connector-mcp-replacement.e2e.test.ts.
import assert from "node:assert/strict";
import test from "node:test";
import { connectorSwitchLeft } from "@molis-ai/molis-work-app-workbench";

const usage = (usage_id: string, provider_id = "system.connectors") => ({ usage_id, title: `用处 ${usage_id}`, source: { provider_id } });

test("ASC-59 every usage that did not move is named with its consumer's refusal", () => {
  const outcome = connectorSwitchLeft({
    results: [{ provider_id: "system.connectors", switched: ["a"], refused: [{ usage_id: "b", code: "model_provider.origin_mismatch" }] }], failed: [],
  }, [usage("a"), usage("b")]);
  assert.deepEqual(outcome, { switched: 1, left: [{ title: "用处 b", code: "model_provider.origin_mismatch" }] });
});

test("ASC-59 a consumer that failed as a whole gives its code to each of its usages, and no other provider's", () => {
  const outcome = connectorSwitchLeft({
    results: [{ provider_id: "system.connectors", switched: ["a"], refused: [] }],
    failed: [{ provider_id: "plugin.notes", code: "connector.switch.consumer_unsupported" }],
  }, [usage("a"), usage("n1", "plugin.notes"), usage("n2", "plugin.notes")]);
  assert.deepEqual(outcome, { switched: 1, left: [
    { title: "用处 n1", code: "connector.switch.consumer_unsupported" }, { title: "用处 n2", code: "connector.switch.consumer_unsupported" },
  ] });
});

test("ASC-59 a usage whose reporter declares no switch is still counted as not moved, with no code for the page to word", () => {
  const outcome = connectorSwitchLeft({ results: [], failed: [] }, [usage("i", "plugin.images")]);
  assert.deepEqual(outcome, { switched: 0, left: [{ title: "用处 i", code: "" }] });
});

test("ASC-59 a usage another provider switched under the same id is not taken as moved", () => {
  const outcome = connectorSwitchLeft({ results: [{ provider_id: "plugin.other", switched: ["x"], refused: [] }], failed: [] }, [usage("x")]);
  assert.deepEqual(outcome, { switched: 1, left: [{ title: "用处 x", code: "" }] });
});

test("ASC-59 a malformed answer counts nothing as moved", () => {
  assert.deepEqual(connectorSwitchLeft({} as never, [usage("a")]), { switched: 0, left: [{ title: "用处 a", code: "" }] });
});
