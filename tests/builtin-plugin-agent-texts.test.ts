import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_AGENTS, BUILTIN_PLUGIN_CATALOG } from "../apps/workbench/src/plugin-catalog.js";

/**
 * A Manifest names its prompts and methods; the package ships their bodies beside it in the catalog entry. A declared
 * prompt without a body starts an Agent with an empty role, and nothing fails until someone reads the transcript.
 */
test("every built-in Agent declaration ships a body for each prompt and method it names", () => {
  const declaring = BUILTIN_PLUGIN_CATALOG.filter(entry => entry.manifest.agent !== undefined);
  assert.ok(declaring.length >= 3, "the catalog must actually contain Agent Plugins");
  for (const entry of BUILTIN_PLUGIN_CATALOG) {
    const declared = entry.manifest.agent;
    if (declared === undefined) {
      assert.equal(entry.agent, undefined, `${entry.project_plugin_id} ships Agent texts without declaring an Agent`);
      continue;
    }
    const shipped = BUILTIN_PLUGIN_AGENTS.get(entry.manifest.plugin_id);
    assert.ok(shipped, `${entry.project_plugin_id} declares an Agent the catalog does not expose`);
    const body = (id: string, version?: number) => shipped.prompts.find(p => p.prompt_id === id && (version === undefined || p.version === version))?.body.trim();
    for (const prompt of declared.prompts) {
      assert.ok(body(prompt.prompt_id, prompt.version), `${entry.project_plugin_id} declares prompt ${prompt.prompt_id}@${prompt.version} without a body`);
    }
    if (declared.compaction) assert.ok(body(declared.compaction.prompt_id), `${entry.project_plugin_id} declares compaction prompt ${declared.compaction.prompt_id} without a body`);
    for (const skill of declared.skills ?? []) {
      const method = shipped.skills.find(s => s.skill_id === skill.skill_id && s.version === skill.version);
      assert.ok(method?.body.trim(), `${entry.project_plugin_id} declares method ${skill.skill_id}@${skill.version} without a body`);
    }
  }
});
