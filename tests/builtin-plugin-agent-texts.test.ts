import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { BUILTIN_DEFINITIONS, BUILTIN_WITHOUT_DEFINITION } from "./fixtures/builtin-definitions.js";

/**
 * A Manifest names its prompts and methods; the plugin's definition ships their bodies beside it (`agent_prompts`, `agent_skills`,
 * PG-051). A declared prompt without a body starts an Agent with an empty role, and nothing fails until someone reads the transcript.
 * The other way round is as quiet: the Host registers `agent_prompts` only for a definition whose Manifest has an `agent` block, so
 * texts shipped without one never reach the person's settings.
 */

test("RAC-192 the built-in definitions and the plugins without one are the whole catalog", () => {
  const listed = [...new Set(BUILTIN_DEFINITIONS.map(definition => definition.manifest.plugin_id)), ...Object.keys(BUILTIN_WITHOUT_DEFINITION)].sort();
  assert.deepEqual(listed, BUILTIN_PLUGIN_CATALOG.map(entry => entry.manifest.plugin_id).sort(), "a new built-in plugin is added to tests/fixtures/builtin-definitions.ts");
});

test("RAC-192 every built-in Agent declaration's definition ships a body for each prompt and method it names", () => {
  const declaring = BUILTIN_DEFINITIONS.filter(definition => definition.manifest.agent !== undefined);
  assert.ok(declaring.length >= 3, "Coding, Schedule and Todo declare Agents");
  for (const definition of declaring) {
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

test("RAC-192 a built-in definition whose Manifest declares no Agent ships no Agent texts", () => {
  for (const definition of BUILTIN_DEFINITIONS.filter(item => item.manifest.agent === undefined)) {
    const id = definition.manifest.plugin_id;
    assert.deepEqual(definition.agent_prompts ?? [], [], `${id} ships Agent prompts without declaring an Agent`);
    assert.deepEqual(definition.agent_skills ?? [], [], `${id} ships Agent methods without declaring an Agent`);
  }
});
