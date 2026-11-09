import assert from "node:assert/strict";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { projectDirectoryActions, type ProjectDirectories } from "@molis-ai/molis-work-contracts/modules/projects";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * C1 的验收：Coding 够得到工作区目录这份事实，而且够不到它不该够到的东西。
 * 见 specs/coding-plugin/implementation.md 的 C1。目录这份事实现在是 `projects.directories.get@1`（输入目录与唯一的输出目录，
 * specs/shared-sources-and-surfaces §3），由 Home 的目录库回答。
 */

/** Two projects in one Home; `catalog` says whether the Host is given the Home catalog that keeps their folders. */
async function fixture(catalog = true) {
  const home = await mkdtemp(join(tmpdir(), "coding-capabilities-"));
  const projects = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const a = await projects.createProject({ display_name: "项目 A", actor_id: "web-user" });
  const b = await projects.createProject({ display_name: "项目 B", actor_id: "web-user" });
  projects.close();
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  if (catalog) host.configurePersonalPlanning(home, withMolisWorkProjectCatalog);
  const client = (project: typeof a) => host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  const person = (project: typeof a): ActionCallContext => ({ actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: ["projects:settings"] });
  const read = (project: typeof a) => client(project).invoke(person(project), projectDirectoryActions.get, {}) as Promise<ProjectDirectories>;
  const close = async () => { await host.close(); await rm(home, { recursive: true, force: true }); };
  return { home, host, a, b, client, person, read, close };
}

test("工作区能力只回答本运行时那个项目，答案里没有可写句柄", async () => {
  const item = await fixture();
  try {
    const folder = join(item.home, "goalboard");
    await mkdir(folder);
    const before = await item.read(item.a);
    await item.client(item.a).invoke(item.person(item.a), projectDirectoryActions.addInput, { workspace_path: folder, expected_revision: before.revision });
    const own = await item.read(item.a);
    assert.equal(own.project_id, item.a.project_id);
    const added = own.directories.find(row => row.roles.includes("input"));
    assert.equal(added?.canonical_path, await realpath(folder));
    assert.equal(added?.realpath_verified, true);
    // 能力不收 project id 参数，所以插件没法问别的项目：B 读不到 A 的文件夹，带 project id 的输入被拒，冒充 B 的调用在 A 这里被拒
    assert.equal((await item.read(item.b)).directories.some(row => row.canonical_path === added?.canonical_path), false);
    await assert.rejects(item.client(item.a).invoke(item.person(item.a), projectDirectoryActions.get, { project_id: item.b.project_id }), { code: "actions.input_invalid" });
    await assert.rejects(item.client(item.a).invoke(item.person(item.b), projectDirectoryActions.get, {}),
      (error: { code?: string }) => ["actions.scope_mismatch", "actions.owner_mismatch"].includes(error.code ?? ""));
    // 只有已核过的路径和角色，没有句柄、没有写入面
    for (const row of own.directories) assert.deepEqual(Object.keys(row).sort(), ["canonical_path", "display_name", "realpath_verified", "roles", "state", "workspace_id"]);
  } finally {
    await item.close();
  }
});

test("项目没有选文件夹时如实回答：只有它自己的默认输出目录，没有输入目录，不编一个路径", async () => {
  const item = await fixture();
  try {
    const { directories } = await item.read(item.a);
    assert.deepEqual(directories.map(row => row.roles), [["output"]], "exactly one output, the project's default location, and no input");
    assert.notEqual(directories[0]!.canonical_path, (await item.read(item.b)).directories[0]!.canonical_path, "each project's default output is its own");
  } finally {
    await item.close();
  }
});

test("没有接上目录来源时，这个能力不可用——插件看到的是不可用，不是「没有工作区」", async () => {
  const item = await fixture(false);
  try {
    await assert.rejects(
      () => item.read(item.a),
      (error: { code?: string } | null) => {
        // 拒绝的理由必须是「这个能力现在不可用」，而不是返回一个空答案冒充
        assert.notEqual(error, null);
        assert.equal(error!.code, "actions.service_unavailable");
        return true;
      },
    );
  } finally {
    await item.close();
  }
});
