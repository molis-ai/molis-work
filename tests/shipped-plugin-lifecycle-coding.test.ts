// W6-02 rest (specs/archive/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1099–RAC-1103): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the shipped plugins of the coding family that run on a project's supervisor and that no
// project starts with: 编程 (Coding), Git, 对比 (Diff) and 字数 (Text Stats) (文件 (Files), RAC-1101, retired in batch 06: its reading
// position is the platform materials service's now). The person adds each to the project;
// taking it out stops its installation in that project and adding it back runs it again. Coding keeps sessions; Git keeps
// one choice the person made in a bound workspace (the change being looked at); Diff and Text Stats keep
// nothing of their own, so what the walk follows is that their page keeps answering the same.
import { execFile } from "node:child_process";
import { chmod, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { promisify } from "node:util";
import { walk, type Shipped, type Web } from "./fixtures/shipped-lifecycle.js";
import { projectOutputOf, readProjectDirectories, setProjectOutputFolder } from "./fixtures/project-directories-http.js";

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

/** The project's output, made `directory` in the project's settings the first time it is asked for. */
async function workspaceOf(web: Web, routes: string): Promise<string> {
  const project = decodeURIComponent(routes.split("/")[2] ?? "");
  const canonical = await realpath(directory);
  const output = projectOutputOf(await readProjectDirectories(web, project));
  if (output.canonical_path === canonical) return output.workspace_id;
  return (await setProjectOutputFolder(web, project, directory)).workspace_id;
}
const phase = async (web: Web, routes: string) => [(await web.get<{ view: { phase: string } }>(`${routes}/state`)).view.phase];

const CODING: Record<string, Shipped> = {
  coding: { key: "coding", plugin_id: "io.molis.work.coding", scope: "project", joins: true, stops_when_removed: true,
    write: (web, routes, title) => web.post(`${routes}/sessions`, { title }),
    titles: async (web, routes) => (await web.get<{ sessions: Array<{ title: string }> }>(`${routes}/state`)).sessions.map(session => session.title) },
  git: { key: "git", plugin_id: "io.molis.work.git", scope: "project", joins: true, stops_when_removed: true, kept: ["note"],
    write: async (web, routes) => web.post(`${routes}/diff`, { workspace_id: await workspaceOf(web, routes), path: ["note"], side: "worktree" }),
    titles: async (web, routes) => {
      const { selected } = await web.get<{ selected: { path: readonly string[] } | null }>(`${routes}/state`);
      return selected ? [selected.path.join("/")] : [];
    } },
  // Stateless: no other plugin of the project embeds them, and the permission they need is the one that reads the project's results.
  diff: { key: "diff", plugin_id: "io.molis.work.diff", scope: "project", joins: true, stops_when_removed: true, revoke: "artifact:read", kept: ["waiting"],
    write: async () => undefined, titles: phase },
  // Text Stats reads its snapshot from the platform materials service, and no plugin embeds it: it is taken out and added back on its own.
  "text-stats": { key: "text-stats", plugin_id: "io.molis.work.text-stats", scope: "project", joins: true, stops_when_removed: true,
    revoke: "artifact:read", kept: ["waiting"], write: async () => undefined, titles: phase },
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1099 W6-02 编程 (Coding) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CODING.coding!));
test(`RAC-1100 W6-02 Git on a project's supervisor, with the change it was asked to show: ${walked}`, { timeout: 180_000 }, () => walk(CODING.git!));
test(`RAC-1102 W6-02 对比 (Diff) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CODING.diff!));
test(`RAC-1103 W6-02 字数 (Text Stats) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CODING["text-stats"]!));
