import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import type { ProjectDataDeclaration } from "@molis-ai/molis-work-contracts/modules/projects";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/** The catalog is one array shared by the process: a test that adds entries to it takes them out again. */
const catalog: PluginRegistration[] = BUILTIN_PLUGIN_CATALOG as PluginRegistration[];

/** An entry for the test: a real entry's other parts (the deletion reads only `project_data` and the library), under its own id. */
function declaringEntry(id: string, data: ProjectDataDeclaration): PluginRegistration {
  const template = catalog.find(entry => entry.project_plugin_id === "pages");
  assert.ok(template);
  // Without its library's `project_rows`, which the deletion would read instead of `project_data`.
  return { ...template, project_plugin_id: id, project_data: data, manifest: { ...template.manifest, databases: {} } };
}

/** A Home directory that has no registry yet in this process: the registry is made from the catalog the first time it is asked for. */
async function withFreshHome<T>(run: (home: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-project-deletion-declarations-"));
  try { return await run(join(directory, "home")); } finally { await rm(directory, { recursive: true, force: true }); }
}

test("RAC-563 a plugin's project data is what it declares, and the confirmation dialog lists it in the declared order", async () => {
  await withFreshHome(async home => {
    const owners = projectDeletedHooksFor(home).owners();
    // The ids are the receipt's stable names, so a change here orphans the steps of receipts that are still pending.
    assert.deepEqual(owners.map(owner => owner.id), [
      "pages", "form", "dataset", "ppt", "workflows", "todo", "functions", "lingguang", "images",
      "characters", "artifacts", "alchemist", "plugin-builder", "assistant", "knowledge", "plugin-originals", "memory", "search",
    ]);
    assert.deepEqual(owners.flatMap(owner => owner.label ? [owner.label] : []), [
      "Pages 文稿与文件夹", "Forms 问卷及收到的全部回答", "Dataset 数据表", "PPT 演示稿", "工作流程及其运行记录", "放在这个项目里的待办",
      "判断规则在这个项目里的场景绑定和判断记录", "灵光里的想法与对话", "图片生成记录和已生成的图片",
      "角色在这个项目里的执行记录", "成果库保存的大文件原件", "炼金术士的研究空间", "插件创作台的构建、发布包和已保存的密钥", "助理在这个项目里的工作", "项目资料的卡片与整理记录", "这个项目及其角色的记忆",
    ]);
    // Rows a library declares in its Manifest (`project_rows`, PG-024), or what a catalog entry still says it keeps (`project_data`).
    const declared = catalog.flatMap(entry => {
      const label = entry.manifest.databases?.home?.project_rows?.label ?? entry.project_data?.label;
      return label ? [{ id: entry.project_plugin_id, label }] : [];
    });
    assert.deepEqual(declared.map(entry => entry.id).sort(), ["artifacts", "dataset", "form", "images", "lingguang", "pages", "ppt", "todo", "workflows"]);
    assert.deepEqual(catalog.filter(entry => entry.project_data).map(entry => entry.project_plugin_id).sort(), ["artifacts", "images"]);
    for (const entry of declared) assert.equal(owners.find(owner => owner.id === entry.id)?.label, entry.label, entry.id);
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
