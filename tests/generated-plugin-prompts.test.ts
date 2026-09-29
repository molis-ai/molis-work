import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRelease } from "@molis-ai/molis-work-plugin-builder";
import { agentDefinitionsFor } from "../apps/local-host/src/agent-definitions/agent-definitions.js";
import { builtinRegistrations } from "../apps/local-host/src/agent-definitions/builtin-registrations.js";
import { UNREGISTERED_MODEL_CALLS } from "../apps/local-host/src/agent-definitions/builtin-instructions.js";
import { generatedRegistration, promptVersions, readPluginPrompts, registerGeneratedPrompts, resolvePluginPrompt, unregisterGeneratedPrompts } from "../apps/local-host/src/plugin-builder/prompts.js";

const OPERATION = `
export const prompts = [
  { id: 'summary', title: '要点提炼', purpose: '把笔记提炼成三条要点', body: '只输出三条中文要点。' },
  { id: 'hint', title: '启发提问', purpose: '给出一个启发式问题', body: \`只输出一个问题，不超过 50 字。\` },
] as const;
export default async function run(input: { text: string }, sdk: any) {
  const { text } = await sdk.capability.call('model.generate', { prompt: 'summary', input: input.text }) as { text: string };
  return text.trim();
}`;

test("a generated plugin's prompts are read from its source, and every model call must name one of them", () => {
  const read = readPluginPrompts(new Map([["src/operations/0.ts", OPERATION]]));
  assert.deepEqual(read.problems, []);
  assert.deepEqual(read.prompts.map(prompt => [prompt.id, prompt.title, prompt.body]), [["summary", "要点提炼", "只输出三条中文要点。"], ["hint", "启发提问", "只输出一个问题，不超过 50 字。"]]);
  assert.deepEqual(read.calls.map(call => call.prompt), ["summary"]);

  const problems = (source: string) => readPluginPrompts(new Map([["src/operations/0.ts", OPERATION], ["src/operations/1.ts", source]])).problems.join("\n");
  assert.match(problems(`await sdk.capability.call('model.generate', { instructions: '总结', input: x });`), /still sends instructions/);
  assert.match(problems(`await sdk.capability.call('model.generate', { prompt: 'other', input: x });`), /which no export const prompts declares/);
  assert.match(problems(`const id = 'summary'; await sdk.capability.call('model.generate', { prompt: id, input: x });`), /string literal id/);
  assert.match(problems(`const request = { prompt: 'summary', input: x }; await sdk.capability.call('model.generate', request);`), /object literal/);
  assert.match(problems(`export const prompts = [{ id: 'summary', title: 't', purpose: 'p', body: 'b' }];`), /already declared/);
  assert.match(problems(`export const prompts = [{ id: 'Bad Id', title: 't', purpose: 'p', body: 'b' }];`), /lowercase/);
  assert.match(problems(`const body = 'x'; export const prompts = [{ id: 'made', title: 't', purpose: 'p', body }];`), /string literals/);
});

function release(version: number, prompts: AgentRelease["prompts"]): AgentRelease {
  return { buildId: "b1", pluginId: "io.molis.work.generated.b1", version, nodes: [], manifest: { version: 1, pluginId: "io.molis.work.generated.b1", revision: "r", effects: {} },
    directory: "", bundlePath: "", packagePath: "", permissions: {}, publishedAt: "2026-09-28T00:00:00.000Z", ...(prompts ? { prompts } : {}),
    design: { title: "笔记助手", contract: { operations: [{ id: "notes.summarize", effects: { capabilities: ["model.generate"] } }] } } as unknown as AgentRelease["design"] };
}

test("a prompt keeps its registered version until its default text changes, so only a real update is flagged", () => {
  const v1 = release(1, [{ id: "summary", title: "要点", purpose: "p", body: "A" }, { id: "hint", title: "提问", purpose: "p", body: "H" }]);
  const v2 = release(2, [{ id: "summary", title: "要点", purpose: "p", body: "A" }, { id: "hint", title: "提问", purpose: "p", body: "H2" }]);
  const versions = promptVersions(v2, [v1, v2]);
  assert.equal(versions.get("summary"), 1);
  assert.equal(versions.get("hint"), 2);
});

test("installing registers a generated plugin's prompts; the person's edit runs, survives reinstall, and a release from before prompts says why it cannot be edited", async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-generated-prompts-"));
  try {
    const registry = agentDefinitionsFor(home, builtinRegistrations);
    const v1 = release(1, [{ id: "summary", title: "要点提炼", purpose: "把笔记提炼成三条要点", body: "只输出三条中文要点。" }]);
    registerGeneratedPrompts(home, generatedRegistration(v1, [v1], "enabled", "1.0.0"));
    const view = registry.prompt("io.molis.work.generated.b1/summary");
    assert.deepEqual([view.source.kind, view.kind, view.title, view.used_by], ["plugin", "instruction", "要点提炼", ["笔记助手"]]);
    assert.equal(view.source.kind === "plugin" && view.source.origin, "generated");

    const installed = { kind: "installed" as const, registration: generatedRegistration(v1, [v1], "enabled", "1.0.0") };
    const preview = { kind: "preview" as const, prompts: [{ id: "summary", title: "要点提炼", purpose: "p", body: "BUILD" }] };
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", installed), { body: "只输出三条中文要点。", version: "summary@1" });
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", preview), { body: "BUILD", version: "summary@build" });
    registry.save("io.molis.work.generated.b1/summary", "只输出两条要点。", null, "person");
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", installed), { body: "只输出两条要点。", version: "summary@1+user.1" });
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", preview), { body: "BUILD", version: "summary@build" }, "authoring must test its new text even while an edited older release is installed");
    assert.equal(registry.uses("io.molis.work.generated.b1/summary")[0]?.caller, "plugin:io.molis.work.generated.b1");

    // Uninstalled: nothing registered, the trial runs the build's declaration; the edit is kept for a reinstall.
    unregisterGeneratedPrompts(home, v1.pluginId);
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", preview), { body: "BUILD", version: "summary@build" });
    assert.throws(() => resolvePluginPrompt(home, v1.pluginId, "missing", preview), /没有声明的模型要求/);
    registerGeneratedPrompts(home, generatedRegistration(v1, [v1], "disabled", "1.0.0"));
    const again = registry.prompt("io.molis.work.generated.b1/summary");
    assert.equal(again.effective, "user");
    assert.equal(again.source.kind === "plugin" && again.source.state, "disabled");

    const legacy = generatedRegistration(release(1, undefined), [], "enabled", "1.0.0");
    assert.equal(legacy.prompts.length, 0);
    assert.match(legacy.notes?.[0] ?? "", /登记 Prompt 之前/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("one installation cannot supply another release's defaults, declarations or registration lifetime", () => {
  const home = mkdtempSync(join(tmpdir(), "molis-prompt-installations-"));
  try {
    const registry = agentDefinitionsFor(home, builtinRegistrations);
    const v1 = release(1, [{ id: "summary", title: "Summary", purpose: "p", body: "V1" }, { id: "old-only", title: "Old", purpose: "p", body: "OLD" }]);
    const v2 = release(2, [{ id: "summary", title: "Summary", purpose: "p", body: "V2" }, { id: "new-only", title: "New", purpose: "p", body: "NEW" }]);
    const first = generatedRegistration(v1, [v1], "enabled", "1.0.0"), second = generatedRegistration(v2, [v1, v2], "enabled", "2.0.0");
    registerGeneratedPrompts(home, first, "project-a/install-a");
    registerGeneratedPrompts(home, second, "project-b/install-b");
    const selected = { kind: "installed" as const, registration: first };
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", selected), { body: "V1", version: "summary@1" });
    assert.equal(registry.prompt(v1.pluginId + "/summary").default_body, "V2");
    assert.ok(registry.hasPrompt(v1.pluginId, "old-only"));
    assert.throws(() => resolvePluginPrompt(home, v1.pluginId, "new-only", selected), /没有声明/);
    registry.save(v1.pluginId + "/summary", "EDIT", null, "person");
    registerGeneratedPrompts(home, { ...second, source: { ...second.source, state: "disabled" } } as typeof second, "project-b/install-b");
    assert.equal(registry.prompt(v1.pluginId + "/summary").default_body, "V1");
    unregisterGeneratedPrompts(home, v1.pluginId, "project-b/install-b");
    assert.equal(registry.prompt(v1.pluginId + "/summary").body, "EDIT");
    assert.equal(registry.hasPrompt(v1.pluginId, "new-only"), false);
    assert.deepEqual(resolvePluginPrompt(home, v1.pluginId, "summary", selected), { body: "EDIT", version: "summary@1+user.1" });
    unregisterGeneratedPrompts(home, v1.pluginId, "project-a/install-a");
    assert.equal(registry.hasPrompt(v1.pluginId, "summary"), false);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test("developer diagnostics say what each source registered and what is not in effect, and list calls that bypass the register", () => {
  const home = mkdtempSync(join(tmpdir(), "molis-prompt-diagnostics-"));
  try {
    const registry = agentDefinitionsFor(home, builtinRegistrations);
    const v1 = release(1, [{ id: "summary", title: "要点提炼", purpose: "p", body: "A" }]);
    registerGeneratedPrompts(home, generatedRegistration(v1, [v1], "disabled", "1.0.0"));
    registry.save("io.molis.work.generated.b1/summary", "B", null, "person");
    const v2 = release(2, [{ id: "summary", title: "要点提炼", purpose: "p", body: "A2" }]);
    registerGeneratedPrompts(home, generatedRegistration(v2, [v1, v2], "disabled", "2.0.0"));
    registerGeneratedPrompts(home, { ...generatedRegistration(release(1, undefined), [], "enabled", "1.0.0"), owner_id: "io.molis.work.generated.old" });

    const report = registry.diagnostics(UNREGISTERED_MODEL_CALLS);
    const generated = report.owners.find(owner => owner.owner_id === "io.molis.work.generated.b1")!;
    assert.deepEqual([generated.instructions, generated.edited], [1, 1]);
    assert.ok(generated.issues.some(issue => /插件已停用/.test(issue.text)));
    assert.ok(generated.issues.some(issue => /基于旧默认/.test(issue.text)), "the default moved from A to A2 under the person's edit");
    assert.ok(report.owners.find(owner => owner.owner_id === "io.molis.work.generated.old")!.issues.some(issue => /登记 Prompt 之前/.test(issue.text)));
    const assistant = report.owners.find(owner => owner.owner_id === "io.molis.work.assistant")!;
    assert.ok(assistant.prompts > 0 && assistant.roles > 0);
    assert.ok(assistant.issues.some(issue => issue.level === "info" && /还没有被调用过/.test(issue.text)));
    assert.ok(report.owners.find(owner => owner.owner_id === "io.molis.work.alchemist")!.instructions > 0, "Alchemist now registers its model instructions");
    assert.deepEqual(report.unregistered, [], "migrated consumers are no longer listed as unregistered calls");
  } finally { rmSync(home, { recursive: true, force: true }); }
});
