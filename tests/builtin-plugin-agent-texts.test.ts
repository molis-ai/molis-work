import assert from "node:assert/strict";
import test from "node:test";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { createCodingPlugin } from "@molis-ai/molis-work-plugin-coding";
import { createSchedulePlugin } from "@molis-ai/molis-work-plugin-schedule";
import { createTodoPlugin } from "@molis-ai/molis-work-plugin-todo";
import { BUILDER_PLUGIN_ID } from "@molis-ai/molis-work-plugin-builder";

/**
 * A Manifest names its prompts and methods; the plugin's definition ships their bodies beside it (`agent_prompts`, `agent_skills`,
 * PG-051). A declared prompt without a body starts an Agent with an empty role, and nothing fails until someone reads the transcript.
 * Plugin Builder's Agents are the platform's own (PG-051 Q2), registered by the Host, so it is not among them.
 */
const AGENT_DEFINITIONS: readonly PluginDefinition[] = [createCodingPlugin(), createSchedulePlugin(), createTodoPlugin()];

test("RAC-192 every built-in Agent declaration's definition ships a body for each prompt and method it names", () => {
  const declaring = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.agent !== undefined && entry.manifest.plugin_id !== BUILDER_PLUGIN_ID)
    .map(entry => entry.manifest.plugin_id).sort();
  assert.deepEqual(AGENT_DEFINITIONS.map(definition => definition.manifest.plugin_id).sort(), declaring, "every built-in plugin with an Agent block is checked here");
  for (const definition of AGENT_DEFINITIONS) {
    const declared = definition.manifest.agent!, id = definition.manifest.plugin_id;
    const body = (prompt: string, version?: number) => definition.agent_prompts?.find(p => p.prompt_id === prompt && (version === undefined || p.version === version))?.body.trim();
    for (const prompt of declared.prompts) assert.ok(body(prompt.prompt_id, prompt.version), `${id} declares prompt ${prompt.prompt_id}@${prompt.version} without a body`);
    if (declared.compaction) assert.ok(body(declared.compaction.prompt_id), `${id} declares compaction prompt ${declared.compaction.prompt_id} without a body`);
    if (declared.ending_review) assert.ok(body(declared.ending_review.prompt_id), `${id} declares ending review prompt ${declared.ending_review.prompt_id} without a body`);
    for (const skill of declared.skills ?? []) {
      const method = definition.agent_skills?.find(s => s.skill_id === skill.skill_id && s.version === skill.version);
      assert.ok(method?.body.trim(), `${id} declares method ${skill.skill_id}@${skill.version} without a body`);
    }
  }
});
