// 08-3 (specs/skill-packs/spec.md §10, contract-design §4.2): the methods the built-in Todo, Issues and Pages plugins declare in their
// Manifests say when to use them (`description`) and who may pick them (`applies_to`), before C-3 makes both required. Pinned here so a
// new built-in method cannot be added without them, and so none claims Coding while its tools are the business ones Coding does not have.
import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_APPLIES_TO, SKILL_LIMITS, SKILL_TOOLS } from "@molis-ai/molis-work-contracts/platform/plugin-agent";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { todoManifest } from "@molis-ai/molis-work-plugin-todo";
import { issuesManifest } from "@molis-ai/molis-work-plugin-issues";
import { pagesManifest } from "@molis-ai/molis-work-plugin-pages";

const PLUGINS = [todoManifest, issuesManifest, pagesManifest];
const methods = PLUGINS.flatMap(manifest => (manifest.methods ?? []).map(method => ({ plugin_id: manifest.plugin_id, method })));

test("builtin-methods: the three built-in plugins declare four methods, each with its own id", () => {
  assert.deepEqual(methods.map(item => item.method.skill_id).sort(), ["issues-capture", "meeting-notes", "todo-advance", "todo-organize"]);
});

test("builtin-methods: every method says when to use it and who may pick it, within the limits", () => {
  for (const { plugin_id, method } of methods) {
    const where = `${plugin_id} / ${method.skill_id}`;
    assert.ok(method.description && [...method.description].length <= SKILL_LIMITS.descriptionChars, `${where}: description`);
    assert.ok((SKILL_APPLIES_TO as readonly unknown[]).includes(method.applies_to), `${where}: applies_to`);
    for (const key of ["when_to_use", "when_not_to_use"] as const) {
      const text = method[key];
      assert.ok(text === undefined || (text.trim() && [...text].length <= SKILL_LIMITS.whenChars), `${where}: ${key}`);
    }
    // A person's words: no skill id, capability id (`todo.items.get`) or tool name (`read-capability`).
    for (const text of [method.description, method.when_to_use, method.when_not_to_use]) {
      assert.ok(!text || !/[a-z]+\.[a-z]+\.[a-z]+|[a-z]+-[a-z]+/u.test(text), `${where}: system words in "${text}"`);
    }
  }
});

test("builtin-methods: a method with business tools is the Assistant's, never Coding's", () => {
  // The business tools are exactly SKILL_TOOLS; Coding's roles have none of them, and a method's tools never widen a role's host_tools.
  for (const { plugin_id, method } of methods) {
    const usesBusinessTools = method.tools.some(tool => (SKILL_TOOLS as readonly string[]).includes(tool));
    if (usesBusinessTools) assert.equal(method.applies_to, "assistant", `${plugin_id} / ${method.skill_id}: its tools are the business ones, so it is the Assistant's`);
  }
});

test("builtin-methods: every method's words the catalog shows have an English entry", () => {
  for (const manifest of PLUGINS) {
    const words = manifest.ui?.translations ?? {};
    for (const method of manifest.methods ?? []) for (const text of [method.name, method.description, method.when_to_use, method.when_not_to_use]) {
      if (text) assert.ok(words[text], `${manifest.plugin_id} / ${method.skill_id}: no English for "${text}"`);
    }
  }
});

test("builtin-methods: the Manifests still parse with the new fields", () => {
  for (const manifest of PLUGINS) {
    const parsed = parsePluginManifest(JSON.parse(JSON.stringify(manifest)));
    assert.deepEqual(parsed.methods?.map(method => method.applies_to), manifest.methods?.map(method => method.applies_to));
  }
});
