import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalHost } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { personalPromptCommandsCapability, PROMPT_COMMANDS_READ_PERMISSION, type PromptCommandFile } from "@molis-ai/molis-work-contracts/services/prompt-commands";
import { personalPromptCommands } from "../apps/local-host/dist/prompt-commands.js";
import { registerProjectCapabilities } from "../apps/local-host/dist/project-capabilities.js";
import { issuePluginCaller } from "../apps/local-host/dist/plugin-callers.js";
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
    const host_plugin = { plugin_id: "io.molis.work.coding", install_id: `install-${permissions.length}`, actor_id: "owner", project_id: "project-a", assertActive: () => undefined } as unknown as HostPluginCaller;
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
