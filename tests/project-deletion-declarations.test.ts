import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG, type BuiltinPluginEntry } from "@molis-ai/molis-work-app-workbench";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";

/** The catalog is one array shared by the process: a test that adds entries to it takes them out again. */
const catalog: BuiltinPluginEntry[] = BUILTIN_PLUGIN_CATALOG as BuiltinPluginEntry[];

/** An entry for the test: a real entry's other parts (the deletion reads only `project_data`), under its own id. */
function declaringEntry(id: string, data: ProjectDataDeclaration): BuiltinPluginEntry {
  const template = catalog.find(entry => entry.project_plugin_id === "pages");
  assert.ok(template);
  return { ...template, project_plugin_id: id, project_data: data };
}

/** A Home directory that has no registry yet in this process: the registry is made from the catalog the first time it is asked for. */
async function withFreshHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-declarations-"));
  try { return await run(join(directory, "home")); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("a plugin's project data is what its catalog entry declares, and the confirmation dialog lists it in the declared order", async () => {
  await withFreshHome(async home => {
    const owners = projectDeletedHooksFor(home).owners();
    // The ids are the receipt's stable names, so a change here orphans the steps of receipts that are still pending.
    assert.deepEqual(owners.map(owner => owner.id), [
      "pages", "form", "dataset", "ppt", "workflows", "todo", "functions", "lingguang", "images",
      "alchemist", "plugin-builder", "assistant", "memory", "search",
    ]);
    assert.deepEqual(owners.flatMap(owner => owner.label ? [owner.label] : []), [
      "Pages 文稿与文件夹", "Forms 问卷及收到的全部回答", "Dataset 数据表", "PPT 演示稿", "工作流程及其运行记录", "放在这个项目里的待办",
      "判断规则在这个项目里的场景绑定和判断记录", "灵光里的想法与对话", "图片生成记录和已生成的图片",
      "炼金术士的研究空间", "插件创作台的构建、发布包和已保存的密钥", "助理在这个项目里的工作", "这个项目及其角色的记忆",
    ]);
    const declared = catalog.filter(entry => entry.project_data);
    assert.deepEqual(declared.map(entry => entry.project_plugin_id).sort(), ["dataset", "form", "images", "lingguang", "pages", "ppt", "todo", "workflows"]);
    for (const entry of declared) assert.equal(owners.find(owner => owner.id === entry.project_plugin_id)?.label, entry.project_data!.label, entry.project_plugin_id);
  });
});

test("a plugin added to the catalog with a declaration is cleared by a project's deletion without the Host naming it", async () => {
  const calls: Array<[string, string]> = [];
  catalog.push(declaringEntry("declared-in-test", { label: "声明里的数据", order: 0, purge: (home, projectId) => { calls.push([home, projectId]); } }));
  try {
    await withFreshHome(async home => {
      const hooks = projectDeletedHooksFor(home);
      const owners = hooks.owners();
      assert.equal(owners[0]?.id, "declared-in-test", "its declared order puts it first");
      assert.equal(owners[0]?.label, "声明里的数据");
      assert.equal(await hooks.clear("declared-in-test", "project-1"), true);
      assert.deepEqual(calls, [[home, "project-1"]], "the purge gets the Home and the project it was asked to clear");
    });
  } finally { catalog.pop(); }
});

test("declarations without an order run after every numbered one, in catalog order", async () => {
  const entry = (id: string, order?: number) => declaringEntry(id, { label: id, ...(order === undefined ? {} : { order }), purge: () => undefined });
  catalog.push(entry("unordered-a"), entry("early", 5), entry("unordered-b"));
  try {
    await withFreshHome(async home => {
      const ids = projectDeletedHooksFor(home).owners().map(owner => owner.id);
      assert.equal(ids[0], "early");
      const [a, b, images, alchemist] = [ids.indexOf("unordered-a"), ids.indexOf("unordered-b"), ids.indexOf("images"), ids.indexOf("alchemist")];
      assert.ok(images < a && a < b && b < alchemist, `${ids.join(",")}`);
    });
  } finally { catalog.splice(catalog.length - 3, 3); }
});
