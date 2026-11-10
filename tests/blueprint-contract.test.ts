import assert from "node:assert/strict";
import test from "node:test";
import { BLUEPRINT_LIMITS, type Blueprint, type BlueprintPart, type BlueprintProposal } from "@molis-ai/molis-work-contracts/platform/blueprints";
import type { RoleTemplate } from "@molis-ai/molis-work-contracts/modules/characters";
import type { TextRef } from "@molis-ai/molis-work-contracts/platform/ui";
import { inspectBlueprint, inspectBlueprintLocales } from "@molis-ai/molis-work-plugin-sdk";

const packageOptions = { source: "package", owner: "io.molis.work.notes" } as const;
const draftOptions = { source: "draft" } as const;

function fixture(options: Parameters<typeof inspectBlueprint>[1] = packageOptions) {
  const text = (name: string): TextRef => options.source === "draft" ? { literal: name } : { key: `notes.${name}` };
  const capability: Extract<BlueprintProposal, { kind: "capability" }> = { kind: "capability", requires: {
    capability_id: "future-plugin.publish", version: 7, optional: true, reason: "Publish a copy",
  } };
  const skill = { kind: "skill", skill: { pack: "io.molis.work.future-skills", skill_id: "find-input" }, state: "manual" } satisfies BlueprintProposal;
  const editor: RoleTemplate = {
    title: text("role.editor"), instructions: "Prepare a draft.", materials: text("role.materials"),
    outputs: text("role.outputs"), works_with: ["reviewer"], host_tools: null,
    action_tools: [{ capability_id: "future-plugin.search", version: 5, provider_id: "system.connectors#mcp:future" }],
  };
  const reviewer: RoleTemplate = { title: text("role.reviewer"), instructions: "Review the draft.", works_with: ["editor"] };
  const setting = { kind: "setting", key: "future-setting", value: { view: { title: "Fixed", instructions: "Fixed", body: ["Fixed"], count: 0 } } } satisfies BlueprintProposal;
  const connection = { kind: "connection", category: "future-service", purpose: text("connection.purpose") } satisfies BlueprintProposal;
  const content: Extract<BlueprintProposal, { kind: "content" }> = { kind: "content", type: "molis.home-page.v1", body: { title: "Draft" } };
  const part = (part_id: string, proposal: BlueprintProposal, required = true, layer: BlueprintPart["layer"] = "project"): BlueprintPart => (
    { part_id, required, layer, proposal }
  );
  const blueprint: Blueprint = {
    title: text("blueprint.title"),
    parts: [
      part("publication", capability, false), part("search", skill), part("editor", { kind: "role", template: editor }),
      part("reviewer", { kind: "role", template: reviewer }, false, "personal"), part("settings", setting),
      part("account", connection, false), part("home", content),
    ],
    purpose: { audience: text("purpose.audience"), work: text("purpose.work"), inputs: text("purpose.inputs"),
      outputs: text("purpose.outputs"), first_result: text("purpose.first-result") },
    steps: [
      { step_id: "prepare", title: text("step.prepare"), part_ids: ["editor", "search", "settings", "home"] },
      { step_id: "publish", title: text("step.publish"), part_ids: ["account", "publication"] },
    ],
    example_task: { title: text("example.title"), input: text("example.input"), step_ids: ["prepare"],
      result: { part_id: "home", location: text("example.result") } },
  };
  return { blueprint, capability, skill, editor, reviewer, setting, connection, content };
}

function rejectAt(value: unknown, path: string, reason?: RegExp): void {
  const problems = inspectBlueprint(value, packageOptions);
  const problem = problems.find(problem => problem.path === path);
  assert.ok(problem, `Expected ${path}, got ${JSON.stringify(problems)}`);
  if (reason) assert.match(problem.reason, reason);
}

test("SPC-C03: all six proposals validate without installed providers or implicit collaborator dependencies", () => {
  for (const options of [packageOptions, draftOptions]) {
    const { blueprint, capability, connection } = fixture(options);
    if (options.source === "package") connection.purpose = { key: "common.connect" };
    const before = structuredClone(blueprint);
    assert.deepEqual(inspectBlueprint(blueprint, options), []);
    assert.deepEqual(blueprint, before);

    blueprint.example_task.step_ids = ["publish"];
    blueprint.example_task.result.part_id = "publication";
    assert.deepEqual(inspectBlueprint(blueprint, options), []);
    blueprint.parts[0].required = true;
    capability.requires.optional = false;
    assert.deepEqual(inspectBlueprint(blueprint, options), []);
  }
});

test("SPC-C03: structural objects are closed to installation identity, credentials and other extra fields", () => {
  const { blueprint, capability, skill, editor, connection, content, setting } = fixture();
  const cases = [
    [blueprint, "source", "$.source"],
    [blueprint.purpose, "owner", "$.purpose.owner"],
    [blueprint.parts[0], "install_id", "$.parts[0].install_id"],
    [capability.requires, "plugin_id", "$.parts[0].proposal.requires.plugin_id"],
    [skill.skill, "project_id", "$.parts[1].proposal.skill.project_id"],
    [editor, "actor_id", "$.parts[2].proposal.template.actor_id"],
    [setting, "approval", "$.parts[4].proposal.approval"],
    [connection, "credential", "$.parts[5].proposal.credential"],
    [content, "owner", "$.parts[6].proposal.owner"],
    [blueprint.steps[0], "install_id", "$.steps[0].install_id"],
    [blueprint.example_task, "request_id", "$.example_task.request_id"],
    [blueprint.example_task.result, "object_id", "$.example_task.result.object_id"],
  ] as const;
  for (const [target, key, path] of cases) {
    Reflect.set(target, key, "forged");
    rejectAt(blueprint, path);
    Reflect.deleteProperty(target, key);
  }
  rejectAt(null, "$", /对象/);
  rejectAt({ ...blueprint, parts: [] }, "$.parts", /至少/);
  rejectAt({ ...blueprint, purpose: {} }, "$.purpose.first_result");
  rejectAt({ ...blueprint, steps: Array(1) }, "$.steps[0]");
  rejectAt({ ...blueprint, example_task: null }, "$.example_task");
});

test("SPC-C03: each proposal checks its own fields and reuses role and bounded JSON validation", () => {
  const { blueprint, capability, skill, editor, connection, content, setting } = fixture();
  let deep: unknown = null;
  for (let depth = 0; depth < 34; depth++) deep = [deep];
  const cases = [
    [blueprint.parts[0], "required", "yes", "$.parts[0].required"],
    [blueprint.parts[0], "layer", "task", "$.parts[0].layer"],
    [capability, "kind", "other", "$.parts[0].proposal.kind"],
    [capability.requires, "capability_id", "future plugin", "$.parts[0].proposal.requires.capability_id"],
    [capability.requires, "version", 0, "$.parts[0].proposal.requires.version"],
    [capability.requires, "version", Number.MAX_SAFE_INTEGER + 1, "$.parts[0].proposal.requires.version"],
    [capability.requires, "reason", " ", "$.parts[0].proposal.requires.reason"],
    [capability.requires, "optional", "yes", "$.parts[0].proposal.requires.optional"],
    [skill.skill, "pack", "other", "$.parts[1].proposal.skill.pack"],
    [skill.skill, "skill_id", "Find_Input", "$.parts[1].proposal.skill.skill_id"],
    [skill, "state", "off", "$.parts[1].proposal.state"],
    [editor, "instructions", "x".repeat(20_001), "$.parts[2].proposal.template.instructions"],
    [editor, "action_tools", [{ capability_id: "future-plugin.search", version: 1 }], "$.parts[2].proposal.template.action_tools"],
    [setting, "key", "  ", "$.parts[4].proposal.key"],
    [setting, "value", undefined, "$.parts[4].proposal.value"],
    [setting, "value", { invalid: Infinity }, "$.parts[4].proposal.value"],
    [connection, "category", "  ", "$.parts[5].proposal.category"],
    [content, "type", "home-page.v1", "$.parts[6].proposal.type"],
    [content, "type", "molis.home-page.v0", "$.parts[6].proposal.type"],
    [content, "body", deep, "$.parts[6].proposal.body"],
  ] as const;
  for (const [target, key, value, path] of cases) {
    const previous = Reflect.get(target, key);
    Reflect.set(target, key, value);
    rejectAt(blueprint, path);
    Reflect.set(target, key, previous);
  }
  Reflect.deleteProperty(capability.requires, "optional");
  rejectAt(blueprint, "$.parts[0].proposal.requires.optional", /相反/);
  blueprint.parts[0].required = true;
  assert.deepEqual(inspectBlueprint(blueprint, packageOptions), []);
  capability.requires.optional = true;
  rejectAt(blueprint, "$.parts[0].proposal.requires.optional", /相反/);
});

test("SPC-C03: declaration limits and reference array limits are enforced", () => {
  assert.deepEqual(BLUEPRINT_LIMITS, { parts: 128, steps: 128 });
  const { blueprint, editor } = fixture();
  while (blueprint.parts.length < BLUEPRINT_LIMITS.parts) {
    blueprint.parts.push({ ...blueprint.parts[5], part_id: `part-${blueprint.parts.length}` });
  }
  while (blueprint.steps.length < BLUEPRINT_LIMITS.steps) {
    blueprint.steps.push({ ...blueprint.steps[0], step_id: `step-${blueprint.steps.length}` });
  }
  blueprint.steps[0].part_ids = blueprint.parts.map(part => part.part_id);
  blueprint.example_task.step_ids = blueprint.steps.map(step => step.step_id);
  assert.deepEqual(inspectBlueprint(blueprint, packageOptions), []);
  rejectAt({ ...blueprint, parts: [...blueprint.parts, blueprint.parts[0]] }, "$.parts", /128/);
  rejectAt({ ...blueprint, steps: [...blueprint.steps, blueprint.steps[0]] }, "$.steps", /128/);
  blueprint.steps[0].part_ids.push("extra");
  rejectAt(blueprint, "$.steps[0].part_ids", /128/);
  blueprint.steps[0].part_ids.pop();
  blueprint.example_task.step_ids.push("extra");
  rejectAt(blueprint, "$.example_task.step_ids", /128/);
  blueprint.example_task.step_ids.pop();
  editor.works_with = Array.from({ length: BLUEPRINT_LIMITS.parts }, (_, index) => `role-${index}`);
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with", /127/);
});

test("SPC-C03: ids and references are unique and resolve within their declared sets", () => {
  const { blueprint, editor } = fixture();
  blueprint.parts[1].part_id = "publication";
  rejectAt(blueprint, "$.parts[1].part_id", /重复/);
  blueprint.parts[1].part_id = "search";
  blueprint.steps[1].step_id = "prepare";
  rejectAt(blueprint, "$.steps[1].step_id", /重复/);
  blueprint.steps[1].step_id = "publish";

  blueprint.steps[0].part_ids.push("home", "unknown");
  rejectAt(blueprint, "$.steps[0].part_ids[4]", /重复/);
  rejectAt(blueprint, "$.steps[0].part_ids[5]", /找不到/);
  blueprint.steps[0].part_ids.splice(4);
  blueprint.example_task.step_ids.push("prepare", "unknown");
  rejectAt(blueprint, "$.example_task.step_ids", /多于/);
  rejectAt(blueprint, "$.example_task.step_ids[1]", /重复/);
  rejectAt(blueprint, "$.example_task.step_ids[2]", /找不到/);
  blueprint.example_task.step_ids.splice(1);

  editor.works_with = ["editor"];
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with[0]", /自己/);
  editor.works_with = ["publication"];
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with[0]", /另一个角色/);
  editor.works_with = ["reviewer", "unknown"];
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with", /多于/);
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with[1]", /另一个角色/);
  editor.works_with = ["reviewer", "reviewer"];
  rejectAt(blueprint, "$.parts[2].proposal.template.works_with[1]", /重复/);
});

test("SPC-C03: the example result must be a capability or content used by a selected step", () => {
  const { blueprint } = fixture();
  blueprint.example_task.result.part_id = "editor";
  rejectAt(blueprint, "$.example_task.result.part_id", /capability 或 content/);
  blueprint.example_task.result.part_id = "unknown";
  rejectAt(blueprint, "$.example_task.result.part_id", /存在/);
  blueprint.example_task.result.part_id = "publication";
  rejectAt(blueprint, "$.example_task.result.part_id", /所选步骤/);
});

test("SPC-C05: TextRef mode and key ownership come from the caller", () => {
  const { blueprint, editor, connection } = fixture();
  editor.title = { literal: "Editor" };
  rejectAt(blueprint, "$.parts[2].proposal.template.title", /literal/);
  editor.title = { key: "notes.role.editor" };
  connection.purpose = { key: "another.connection.use" };
  rejectAt(blueprint, "$.parts[5].proposal.purpose", /本包/);
  connection.purpose = { key: "common.connect" };
  assert.deepEqual(inspectBlueprint(blueprint, packageOptions), []);
  Reflect.set(blueprint.title, "owner", packageOptions.owner);
  rejectAt(blueprint, "$.title", /不能写 owner/);
  assert.deepEqual(inspectBlueprint(blueprint, { source: "package", owner: "" }).map(problem => problem.path), ["$"]);

  const draft = fixture(draftOptions).blueprint;
  draft.example_task.input = { key: "notes.example.input" };
  assert.deepEqual(inspectBlueprint(draft, draftOptions).map(problem => problem.path), ["$.example_task.input"]);
});

test("SPC-C05: locale comparison allows declared text, role instructions and content body values to differ", () => {
  const { blueprint } = fixture();
  const translated = fixture();
  translated.blueprint.title = { key: "notes.blueprint.title-zh", fallback: "标题" };
  translated.blueprint.purpose.inputs = { key: "notes.purpose.inputs-zh" };
  translated.blueprint.steps[0].title = { key: "notes.step.prepare-zh" };
  translated.blueprint.example_task.result.location = { key: "notes.example.result-zh" };
  translated.connection.purpose = { key: "common.connect" };
  translated.editor.title = { key: "notes.role.editor-zh" };
  translated.editor.materials = { key: "notes.role.materials-zh" };
  translated.editor.outputs = { key: "notes.role.outputs-zh" };
  translated.editor.instructions = "准备草稿。";
  translated.content.body = ["起步内容"];
  translated.setting.value.view = { count: 0, body: ["Fixed"], instructions: "Fixed", title: "Fixed" };
  const reordered = Object.fromEntries(Object.entries(translated.blueprint).reverse());
  assert.deepEqual(inspectBlueprintLocales(blueprint, [{ locale: "zh", blueprint: reordered }], packageOptions), []);
});

test("SPC-C05: each structural difference names the translation file and first differing field", () => {
  const { blueprint } = fixture();
  const changes: ReadonlyArray<readonly [(translation: ReturnType<typeof fixture>) => void, string]> = [
    [draft => { draft.capability.requires.reason = "A translated reason"; }, "$.parts[0].proposal.requires.reason"],
    [draft => { draft.capability.requires.version++; }, "$.parts[0].proposal.requires.version"],
    [draft => { draft.skill.skill.skill_id = "alternative-input"; }, "$.parts[1].proposal.skill.skill_id"],
    [draft => { delete draft.editor.materials; }, "$.parts[2].proposal.template.materials"],
    [draft => { draft.reviewer.outputs = { key: "notes.role.new-output" }; }, "$.parts[3].proposal.template.outputs"],
    [draft => { draft.setting.value.view.title = "Translated"; }, "$.parts[4].proposal.value.view.title"],
    [draft => { draft.setting.value.view.instructions = "Translated"; }, "$.parts[4].proposal.value.view.instructions"],
    [draft => { draft.setting.value.view.body[0] = "Translated"; }, "$.parts[4].proposal.value.view.body[0]"],
    [draft => { draft.setting.value.view.count = -0; }, "$.parts[4].proposal.value.view.count"],
    [draft => { draft.blueprint.parts[5].required = true; }, "$.parts[5].required"],
    [draft => { draft.blueprint.steps[0].part_ids.reverse(); }, "$.steps[0].part_ids[0]"],
    [draft => { draft.blueprint.steps.reverse(); }, "$.steps[0].step_id"],
    [draft => { draft.blueprint.example_task.step_ids.push("publish"); }, "$.example_task.step_ids[1]"],
  ];
  for (const [change, path] of changes) {
    const translated = fixture();
    change(translated);
    assert.deepEqual(inspectBlueprint(translated.blueprint, packageOptions), []);
    assert.deepEqual(inspectBlueprintLocales(blueprint, [{ locale: "zh", blueprint: translated.blueprint }], packageOptions)
      .map(problem => problem.path), [`blueprint.zh.json:${path}`]);
  }
});

test("SPC-C05: invalid package text in either file retains its own field path", () => {
  const original = fixture();
  original.blueprint.title = { literal: "Invalid in a package" };
  const translated = fixture();
  translated.editor.outputs = { key: "another.role.outputs" };
  const problems = inspectBlueprintLocales(original.blueprint, [{ locale: "zh", blueprint: translated.blueprint }], packageOptions);
  assert.deepEqual(problems.map(problem => problem.path), ["blueprint.json:$.title", "blueprint.zh.json:$.parts[2].proposal.template.outputs"]);
});
