import { ActionError, parseExactActionReferences } from "@molis-ai/molis-work-contracts/platform/actions";
import { parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import assert from "node:assert/strict";
import test from "node:test";

const MCP_PROVIDERS = [
  "system.connectors#mcp:3f6c1a52-9b0e-4c1d-8a47-2d5e7b9c0f11",
  "io.molis.work.coding#mcp:notes server",
  "io.molis.work.coding#mcp:数据库/main",
];

test("EXR-01 an exact selection accepts every provider id the platform makes, an external MCP's #mcp: ids included", () => {
  const refs = MCP_PROVIDERS.map(provider_id => ({ capability_id: "mcp.tool.call", version: 1, provider_id }));
  assert.deepEqual(parseExactActionReferences(refs), refs);
  assert.deepEqual(parseExactActionReferences([{ capability_id: "goals.create", version: 2, provider_id: "io.molis.work.goals" }]),
    [{ capability_id: "goals.create", version: 2, provider_id: "io.molis.work.goals" }]);
});

test("EXR-01 a Character's exact action_tools carry an external MCP provider through the content parser", () => {
  const action_tools = MCP_PROVIDERS.map(provider_id => ({ capability_id: "mcp.tool.call", version: 1, provider_id }));
  const parsed = parseCharacterContent({ character_id: "c1", title: "角色", instructions: "做事", host_tools: [], action_tools,
    source: { owner_actor_id: "actor-a", draft_revision: 1 } });
  assert.deepEqual(parsed.action_tools, action_tools);
});

test("EXR-02 a provider id that names no provider is refused: blank, a control character, over 512 characters, not a string", () => {
  const bad: unknown[] = [" ", "", "a\nb", "a\u0000b", "p".repeat(513), 42, null, undefined, {}];
  for (const provider_id of bad) {
    assert.throws(() => parseExactActionReferences([{ capability_id: "mcp.tool.call", version: 1, provider_id }]),
      (error: unknown) => error instanceof ActionError && error.code === "actions.reference_invalid", String(provider_id));
  }
  assert.equal(parseExactActionReferences([{ capability_id: "mcp.tool.call", version: 1, provider_id: "p".repeat(512) }]).length, 1);
});

test("EXR-03 the capability id, the version, the count and duplicates are still held to their rules", () => {
  const ok = { capability_id: "mcp.tool.call", version: 1, provider_id: "system.connectors#mcp:c" };
  const refused = (value: unknown) => assert.throws(() => parseExactActionReferences(value),
    (error: unknown) => error instanceof ActionError && error.code === "actions.reference_invalid");
  refused([{ ...ok, capability_id: "mcp tool#call" }]);
  refused([{ ...ok, version: 0 }]);
  refused([{ ...ok, version: 1.5 }]);
  refused([ok, ok]);
  refused(Array.from({ length: 101 }, (_, index) => ({ ...ok, provider_id: `p#mcp:${index}` })));
  refused("not a list");
});
