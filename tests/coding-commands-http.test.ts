import { pluginActions, withFakeAgentHost } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { LocalProjectDatabase, DEMO_PROJECT_ID, seedDemoBoard, releaseProjectPlugins, handleProjectPluginHttp, openProjectVersionStores, personalPromptCommands, projectPromptCommands } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectDirectoryActions } from "@molis-ai/molis-work-contracts/modules/projects";
import { personalPromptCommandsCapability, projectPromptCommandsCapability } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { seedConfiguredModels } from "./fixtures/configured-models.js";

// Coding A2 (specs/coding-plugin/next-requirements.md, docs/design/coding-daily-basics scheme A): Coding lists the project's commands
// from the round's workspace (`.molis/commands`, then `.claude/commands`) and the person's own from their home directory, the
// project's first on a name clash; a file that cannot be read is listed with why, and the others still work.

async function codingServer(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "coding-commands-http-")), molis = join(root, "molis"), dbPath = join(molis, "board.db"), workspace = join(root, "repo"), home = join(root, "home");
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(workspace, ".molis", "commands", "release"), { recursive: true });
  mkdirSync(join(workspace, ".claude", "commands"), { recursive: true });
  mkdirSync(join(home, ".claude", "commands"), { recursive: true });
  writeFileSync(join(workspace, ".molis", "commands", "补测试.md"), "---\ndescription: 给一个文件补测试\nargument-hint: 文件\nallowed-tools: Bash(rm:*)\n---\n给 $ARGUMENTS 补测试：覆盖每个分支。");
  writeFileSync(join(workspace, ".molis", "commands", "release", "check.md"), "---\ndescription: 发版前检查\n");
  writeFileSync(join(workspace, ".claude", "commands", "补测试.md"), "the .claude copy, after .molis");
  writeFileSync(join(workspace, ".claude", "commands", "lint.md"), "# 跑一遍检查\nRun the linters.");
  writeFileSync(join(root, "outside.md"), "text outside the workspace");
  symlinkSync(join(root, "outside.md"), join(workspace, ".molis", "commands", "outside.md"));
  writeFileSync(join(home, ".claude", "commands", "lint.md"), "my own lint, after the project's");
  writeFileSync(join(home, ".claude", "commands", "review-ui.md"), "按 DESIGN.md 看一遍界面");
  const prior = process.env.HOME; process.env.HOME = home;
  t.after(() => { if (prior === undefined) delete process.env.HOME; else process.env.HOME = prior; });
  mkdirSync(molis); await seedConfiguredModels(molis); seedDemoBoard(dbPath); const store = new LocalProjectDatabase(dbPath);
  const actions = pluginActions(store, DEMO_PROJECT_ID);
  // The Host's own command readers, for the project's folder "work" and the person's home directory (their refusals are held by
  // tests/security-invariants-prompt-commands.test.ts); a folder that is not the project's is refused, as the Host does.
  actions.registry.registerProvider({ provider: { provider_id: "host-reads-fixture", title: "宿主读取", kind: "system" }, definitions: [projectPromptCommandsCapability, personalPromptCommandsCapability],
    handlers: [{ ...projectPromptCommandsCapability, handle: async (_caller, given) => {
      if ((given as { workspace_id: string }).workspace_id !== "work") throw new ActionError("actions.forbidden", "not this project's folder");
      return { commands: await projectPromptCommands(workspace) };
    } }, { ...personalPromptCommandsCapability, handle: async () => ({ commands: await personalPromptCommands() }) }] });
  const host = () => ({ store, ...openProjectVersionStores(store), homeDirectory: molis, projectId: DEMO_PROJECT_ID, actions, actorId: "web-user",
    escapeHtml: (value: unknown) => String(value), translate: (value: string) => value,
    agentHost: { async invoke<Input, Output>(definition: { capability_id: string }): Promise<Output> {
      if (definition.capability_id === projectDirectoryActions.get.capability_id) return [{ workspace_id: "work", canonical_path: workspace }] as Output;
      throw new Error(`Unexpected capability ${definition.capability_id}`);
    } },
  });
  const server = createServer((request, response) => { void handleProjectPluginHttp(request, response, new URL(request.url!, "http://localhost"), withFakeAgentHost(host())).catch(error => { response.writeHead(500); response.end(String(error)); }); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); releaseProjectPlugins(); store.close(); });
  const address = server.address(); assert.ok(address && typeof address !== "string");
  return async (suffix: string) => {
    const result = await fetch(`http://127.0.0.1:${address.port}/api/plugins/io.molis.work.coding${suffix}`);
    return { status: result.status, body: await result.json() as { commands: Array<Record<string, unknown>> } };
  };
}

test("Coding A2 lists the project's commands and the person's own, the project's first on a clash, an unreadable one with why", async t => {
  const get = await codingServer(t);
  const listed = await get("/commands?workspace=work");
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  const rows = listed.body.commands.map(one => [one.name, one.origin, one.location, one.unreadable ?? "ok"]);
  assert.deepEqual(rows, [
    ["outside", "project", ".molis/commands", "link"],
    ["release:check", "project", ".molis/commands", "front-matter"],
    ["补测试", "project", ".molis/commands", "ok"],
    ["lint", "project", ".claude/commands", "ok"],
    ["review-ui", "mine", ".claude/commands", "ok"],
  ]);
  const tests = listed.body.commands.find(one => one.name === "补测试")!;
  assert.deepEqual({ description: tests.description, argument_hint: tests.argument_hint, takes_arguments: tests.takes_arguments, text: tests.text },
    { description: "给一个文件补测试", argument_hint: "文件", takes_arguments: true, text: "给 $ARGUMENTS 补测试：覆盖每个分支。" });
  assert.ok(!JSON.stringify(listed.body).includes("text outside the workspace"), "a link out of the workspace is not read");
  assert.ok(!JSON.stringify(listed.body).includes("Bash(rm"), "front matter beyond description and argument-hint is not carried");
  // No workspace: the person's own only.
  assert.deepEqual((await get("/commands")).body.commands.map(one => one.name), ["lint", "review-ui"]);
  // A folder that is not the project's: the person's own only, nothing read from it.
  assert.deepEqual((await get("/commands?workspace=elsewhere")).body.commands.map(one => one.name), ["lint", "review-ui"]);
});
