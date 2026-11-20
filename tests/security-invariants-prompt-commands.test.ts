import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { issuePluginCaller, LocalHost, personalPromptCommands, projectPromptCommands, registerProjectCapabilities } from "@molis-ai/molis-work-app-local-host";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { personalPromptCommandsCapability, projectPromptCommandsCapability, PROMPT_COMMANDS_READ_PERMISSION, type PromptCommandFile } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import type { HostPluginCaller } from "@molis-ai/molis-work-contracts/platform/app-host";

// S-prompt-commands (docs/system/security-invariants/S-prompt-commands.md): the person's own commands are only the plain `.md`
// files in two folders of their home directory; a link is never followed, and only a plugin holding `commands:read` gets them.

const SECRET = "the text of a file the command folder only links to";

async function home(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "prompt-commands-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const outside = join(root, "elsewhere");
  await mkdir(join(outside, "folder"), { recursive: true });
  await writeFile(join(outside, "secret.md"), SECRET);
  await writeFile(join(outside, "folder", "inside.md"), SECRET);
  const molis = join(root, "me", ".molis", "commands");
  await mkdir(join(molis, "release", "deeper"), { recursive: true });
  return { root: join(root, "me"), molis, outside };
}

const texts = (found: readonly PromptCommandFile[]) => JSON.stringify(found);

test("S-prompt-commands: a link is listed as unreadable and never followed", async t => {
  const { root, molis, outside } = await home(t);
  await writeFile(join(molis, "tests.md"), "Add tests for $ARGUMENTS");
  await symlink(join(outside, "secret.md"), join(molis, "linked.md"));
  await symlink(join(outside, "folder"), join(molis, "linked-folder"));
  const found = await personalPromptCommands(root);
  assert.deepEqual(found.map(one => [one.name, "unreadable" in one ? one.unreadable : "ok"]), [["linked", "link"], ["tests", "ok"]]);
  assert.ok(!texts(found).includes(SECRET), "nothing a link points at reaches the plugin");
});

test("S-prompt-commands: the person's own command folder may be their link (a dotfiles set-up), and its files are still read only as plain files", async t => {
  const { root, outside } = await home(t);
  await mkdir(join(outside, "dotfiles", "release"), { recursive: true });
  await writeFile(join(outside, "dotfiles", "review.md"), "Review $ARGUMENTS");
  await writeFile(join(outside, "dotfiles", "release", "notes.md"), "Write release notes");
  await symlink(join(outside, "secret.md"), join(outside, "dotfiles", "linked.md"));
  await mkdir(join(root, ".claude"), { recursive: true });
  await symlink(join(outside, "dotfiles"), join(root, ".claude", "commands"));
  const found = (await personalPromptCommands(root)).filter(one => one.location === ".claude/commands");
  assert.deepEqual(found.map(one => [one.name, "unreadable" in one ? one.unreadable : "ok"]), [["linked", "link"], ["release:notes", "ok"], ["review", "ok"]]);
  assert.ok(!texts(found).includes(SECRET), "a link inside the linked folder is still not followed");
});

test("S-prompt-commands: only plain .md files one folder down, at most 100 a place, none over 64 KB read", async t => {
  const { root, molis } = await home(t);
  await writeFile(join(molis, "notes.txt"), "not a command");
  await writeFile(join(molis, ".hidden.md"), "hidden");
  await writeFile(join(molis, "release", "check.md"), "---\ndescription: Check before release\nallowed-tools: Bash(rm:*)\nmodel: other\n---\nCheck everything.");
  await writeFile(join(molis, "release", "deeper", "far.md"), "two folders down");
  await writeFile(join(molis, "big.md"), "x".repeat(64 * 1024 + 1));
  await writeFile(join(molis, "binary.md"), Buffer.from([0xff, 0xfe, 0x00, 0x41]));
  const found = await personalPromptCommands(root);
  assert.deepEqual(found.map(one => [one.name, "unreadable" in one ? one.unreadable : "ok"]), [["big", "too-large"], ["binary", "not-text"], ["release:check", "ok"]]);
  assert.ok(!texts(found).includes("xxxx"), "a file over the limit is not read");
  const check = found.find(one => one.name === "release:check")!;
  assert.deepEqual(Object.keys(check).sort(), ["argument_hint", "description", "location", "name", "path", "takes_arguments", "text"], "no tool, model or permission field is carried");
  await Promise.all(Array.from({ length: 120 }, (_, index) => writeFile(join(molis, `c${String(index).padStart(3, "0")}.md`), "one")));
  assert.equal((await personalPromptCommands(root)).filter(one => one.location === ".molis/commands").length, 100);
});

test("S-prompt-commands: a plugin without commands:read, a person and an agent are refused", async t => {
  const { root, molis } = await home(t);
  await writeFile(join(molis, "tests.md"), "Add tests");
  const prior = process.env.HOME; process.env.HOME = root;
  t.after(() => { if (prior === undefined) delete process.env.HOME; else process.env.HOME = prior; });
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined } });
  registerProjectCapabilities(host as never, { workspacesFor: async () => [] });
  const client = host.actionClient({ project_id: "project-a", storage_key: join(root, "project.db") });
  // A plugin the Host issued an identity holding these permissions, as every plugin call carries (S-15).
  const plugin = (permissions: string[]): ActionCallContext => {
    const host_plugin: HostPluginCaller = { plugin_id: "io.molis.work.coding", install_id: `install-${permissions.length}`, actor_id: "owner", project_id: "project-a",
      declaration: { manifest: codingManifest }, assertActive: () => undefined };
    t.after(issuePluginCaller(host_plugin, permissions));
    return { actor_id: "owner", project_id: "project-a", audience: "plugin", permissions: [PROMPT_COMMANDS_READ_PERMISSION], plugin_install_id: host_plugin.install_id, host_plugin };
  };
  await assert.rejects(client.invoke(plugin([]), personalPromptCommandsCapability, {}), { code: "actions.plugin_permission" }, "claiming the permission is not holding it");
  for (const audience of ["user", "agent"] as const) {
    await assert.rejects(client.invoke({ actor_id: "owner", project_id: "project-a", audience, permissions: [PROMPT_COMMANDS_READ_PERMISSION] }, personalPromptCommandsCapability, {}),
      { code: "actions.forbidden" }, `${audience}: only plugins are offered the person's own commands`);
  }
  const allowed = await client.invoke(plugin([PROMPT_COMMANDS_READ_PERMISSION]), personalPromptCommandsCapability, {});
  assert.deepEqual(allowed.commands.map(one => one.name), ["tests"]);
});

test("S-prompt-commands: a project folder's command folder that links out of it is not read", async t => {
  const { root, outside } = await home(t);
  const folder = join(root, "repo");
  await mkdir(join(folder, ".claude"), { recursive: true });
  await mkdir(join(folder, ".molis"), { recursive: true });
  await writeFile(join(outside, "folder", "kept.md"), SECRET);
  // `.molis/commands` is a link to a folder outside the project; `.claude/commands` is the project's own, with a file linked out.
  await symlink(join(outside, "folder"), join(folder, ".molis", "commands"));
  await mkdir(join(folder, ".claude", "commands"));
  await writeFile(join(folder, ".claude", "commands", "lint.md"), "Run the linters.");
  await symlink(join(outside, "secret.md"), join(folder, ".claude", "commands", "secret.md"));
  const found = await projectPromptCommands(folder);
  assert.deepEqual(found.map(one => [one.location, one.name, "unreadable" in one ? one.unreadable : "ok"]), [[".claude/commands", "lint", "ok"], [".claude/commands", "secret", "link"]]);
  assert.ok(!texts(found).includes(SECRET), "nothing outside the project folder reaches the plugin");
});

test("S-prompt-commands: a project's commands go only to a plugin with workspace:read, and only from the current project's folder", async t => {
  const { root } = await home(t);
  const folder = join(root, "repo");
  await mkdir(join(folder, ".molis", "commands"), { recursive: true });
  await writeFile(join(folder, ".molis", "commands", "tests.md"), "Add tests");
  const host = new LocalHost({ runtimeFactory: { open: () => ({}), close: () => undefined } });
  const [provider] = registerProjectCapabilities(host as never, { workspacesFor: async () => [{ workspace_id: "work", canonical_path: folder, realpath_verified: true, display_name: "repo" }] });
  // The Host lists these with its other platform providers; here they stand alone, beside the Host's own registered actions.
  host.actionRegistry().registerProvider({ ...provider!, provider: { ...provider!.provider, provider_id: "host-workspace-reads" } });
  const client = host.actionClient({ project_id: "project-a", storage_key: join(root, "project.db") });
  const plugin = (permissions: string[]): ActionCallContext => {
    const host_plugin: HostPluginCaller = { plugin_id: "io.molis.work.coding", install_id: `install-project-${permissions.length}`, actor_id: "owner", project_id: "project-a",
      declaration: { manifest: codingManifest }, assertActive: () => undefined };
    t.after(issuePluginCaller(host_plugin, permissions));
    return { actor_id: "owner", project_id: "project-a", audience: "plugin", permissions: ["workspace:read"], plugin_install_id: host_plugin.install_id, host_plugin };
  };
  await assert.rejects(client.invoke(plugin([]), projectPromptCommandsCapability, { workspace_id: "work" }), { code: "actions.plugin_permission" }, "claiming workspace:read is not holding it");
  for (const audience of ["user", "agent"] as const) {
    await assert.rejects(client.invoke({ actor_id: "owner", project_id: "project-a", audience, permissions: ["workspace:read"] }, projectPromptCommandsCapability, { workspace_id: "work" }),
      { code: "actions.forbidden" }, `${audience}: only plugins are offered a project's commands`);
  }
  await assert.rejects(client.invoke(plugin(["workspace:read"]), projectPromptCommandsCapability, { workspace_id: "elsewhere" }), { code: "actions.forbidden" }, "a folder that is not the current project's is refused");
  const allowed = await client.invoke(plugin(["workspace:read"]), projectPromptCommandsCapability, { workspace_id: "work" });
  assert.deepEqual(allowed.commands.map(one => one.name), ["tests"]);
});
