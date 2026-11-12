import assert from "node:assert/strict";
import test from "node:test";
import { CHARACTER_PLUGIN_ID } from "@molis-ai/molis-work-contracts/modules/characters";
import { PLUGIN_INSTALL_PROVIDER_ID } from "@molis-ai/molis-work-contracts/platform/plugin";
import { CONNECTOR_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/connector-host";
import {
  KIT_AGENT_DEFINITIONS_PROVIDER_ID, KIT_AGENT_MCP_PROVIDER_ID, KIT_AGENT_TOOLS_PROVIDER_ID, KIT_MCP_ACCESS_PROVIDER_ID,
} from "@molis-ai/molis-work-contracts/services/kit";
import { SKILLS_PROVIDER_ID } from "@molis-ai/molis-work-contracts/services/skills";
import { KIT_SYSTEM_REPORTERS } from "@molis-ai/molis-work-service-kit";

// The AI kit's reporter table is a trust boundary (specs/capability-pack/contract-design.md §4.6): a provider is believed only when the
// Host registered it. Its keys are identities, so they come from the contract and never from a second literal here; this test pins the
// keys and the two entries whose ids the Host used to write out a second time (the connections provider and the plugin install service).

test("CPK-09 CPK-10 the kit's system reporters are the contract's provider ids, one entry per provider", () => {
  const expected = [
    SKILLS_PROVIDER_ID,
    KIT_AGENT_DEFINITIONS_PROVIDER_ID,
    KIT_AGENT_TOOLS_PROVIDER_ID,
    CHARACTER_PLUGIN_ID,
    KIT_AGENT_MCP_PROVIDER_ID,
    CONNECTOR_PROVIDER_ID,
    KIT_MCP_ACCESS_PROVIDER_ID,
    PLUGIN_INSTALL_PROVIDER_ID,
  ];
  assert.deepEqual(Object.keys(KIT_SYSTEM_REPORTERS).sort(), [...expected].sort());
  assert.equal(new Set(Object.keys(KIT_SYSTEM_REPORTERS)).size, expected.length, "one entry per provider, no aliases");
  // The two ids the Host also names: the contract carries the one spelling and the table is keyed by it.
  assert.equal(CONNECTOR_PROVIDER_ID, "system.connectors");
  assert.equal(PLUGIN_INSTALL_PROVIDER_ID, "plugin-install");
  assert.deepEqual(KIT_SYSTEM_REPORTERS[CONNECTOR_PROVIDER_ID], { kinds: ["mcp"], sources: ["mcp_server"], packs: ["plugin", "system:builtin"] });
  assert.deepEqual(KIT_SYSTEM_REPORTERS[PLUGIN_INSTALL_PROVIDER_ID], { kinds: [], sources: [], packs: [], headers: true });
});
