// W6-02 rest (specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1099–RAC-1103): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the shipped plugins of the coding family that run on a project's supervisor and that no
// project starts with: 编程 (Coding), 文件 (Files), Git, 对比 (Diff) and 字数 (Text Stats). The person adds each to the project;
// taking it out stops its installation in that project and adding it back runs it again. Coding keeps sessions; Git and Files each
// keep one choice the person made in a bound workspace (the change being looked at, the file last read); Diff and Text Stats keep
// nothing of their own, so what the walk follows is that their page keeps answering the same.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { promisify } from "node:util";
import { walk, type Shipped, type Web } from "./fixtures/shipped-lifecycle.js";

const exec = promisify(execFile);
let directory = "";
before(async () => {
  directory = await mkdtemp(join(tmpdir(), "shipped-lifecycle-workspace-"));
  const git = (...args: string[]) => exec("git", args, { cwd: directory });
  await git("init", "-b", "main"); await git("config", "user.name", "Fixture"); await git("config", "user.email", "fixture@example.invalid");
  await writeFile(join(directory, "note"), "base\n"); await git("add", "."); await git("commit", "-m", "base");
  await chmod(join(directory, "note"), 0o644);
  await writeFile(join(directory, "note"), "working\n");
  await writeFile(join(directory, "note.txt"), "中文🙂\nfirst\n");
});
after(() => rm(directory, { recursive: true, force: true }));

/** The workspace the project has linked to `directory`: linked the first time it is asked for. */
async function workspaceOf(web: Web, routes: string): Promise<string> {
  const project = encodeURIComponent(decodeURIComponent(routes.split("/")[2] ?? ""));
  const linked = async () => (await web.get<{ workspaces: Array<{ workspace_id: string }> }>(`/projects/${project}/api/project-settings/workspaces`)).workspaces[0]?.workspace_id;
  const known = await linked();
  if (known) return known;
  await web.post(`/projects/${project}/api/workspaces`, { workspace_path: directory, user_confirmed: true });
  const workspace = await linked();
  assert.ok(workspace, "the project linked the workspace");
  return workspace;
}
const phase = async (web: Web, routes: string) => [(await web.get<{ view: { phase: string } }>(`${routes}/state`)).view.phase];

const CODING: Record<string, Shipped> = {
  coding: { key: "coding", plugin_id: "io.molis.work.coding", scope: "project", joins: true, stops_when_removed: true,
    write: (web, routes, title) => web.post(`${routes}/sessions`, { title }),
    titles: async (web, routes) => (await web.get<{ sessions: Array<{ title: string }> }>(`${routes}/state`)).sessions.map(session => session.title) },
  git: { key: "git", plugin_id: "io.molis.work.git", scope: "project", joins: true, stops_when_removed: true, kept: ["selected"],
    write: async (web, routes) => web.post(`${routes}/diff`, { workspace_id: await workspaceOf(web, routes), path: ["note"], side: "worktree" }),
    titles: async (web, routes) => (await web.get<{ selected: object | null }>(`${routes}/state`)).selected ? ["selected"] : [] },
  files: { key: "files", plugin_id: "io.molis.work.files", scope: "project", joins: true, stops_when_removed: true, kept: ["note.txt"],
    write: async (web, routes) => web.post(`${routes}/open`, { workspace_id: await workspaceOf(web, routes), path: ["note.txt"] }),
    titles: async (web, routes) => {
      const { position } = await web.get<{ position: { path: readonly string[] } | null }>(`${routes}/state`);
      return position ? [position.path.join("/")] : [];
    } },
  // Stateless: no other plugin of the project embeds them, and the permission they need is the one that reads the project's results.
  diff: { key: "diff", plugin_id: "io.molis.work.diff", scope: "project", joins: true, stops_when_removed: true, revoke: "artifact:read", kept: ["waiting"],
    write: async () => undefined, titles: phase },
  // Text Stats needs Files, and Files embeds it: taking Files out of the project takes it out too, and adding it back brings Files.
  "text-stats": { key: "text-stats", plugin_id: "io.molis.work.text-stats", scope: "project", joins: true, stops_when_removed: true, removed_by: "files",
    revoke: "artifact:read", kept: ["waiting"], write: async () => undefined, titles: phase },
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1099 W6-02 编程 (Coding) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CODING.coding!));
test(`RAC-1100 W6-02 Git on a project's supervisor, with the change it was asked to show: ${walked}`, { timeout: 180_000 }, () => walk(CODING.git!));
test(`RAC-1101 W6-02 文件 (Files) on a project's supervisor, with the file last read: ${walked}`, { timeout: 180_000 }, () => walk(CODING.files!));
test(`RAC-1102 W6-02 对比 (Diff) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CODING.diff!));
test(`RAC-1103 W6-02 字数 (Text Stats) on a project's supervisor, taken out with Files: ${walked}`, { timeout: 180_000 }, () => walk(CODING["text-stats"]!));
