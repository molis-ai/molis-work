import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PLATFORM_PLUGIN_REGISTRATIONS, projectDeletedHooksFor } from "@molis-ai/molis-work-app-local-host";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";

/**
 * The platform's registration list, which the Host reads since W5-02 PR-B (the shell's copy of the catalog is no longer what the
 * deletion reads). It is one array shared by the process: a test that adds entries to it takes them out again.
 */
const catalog: PluginRegistration[] = PLATFORM_PLUGIN_REGISTRATIONS as PluginRegistration[];

/** An entry for the test: a real entry's other parts (the deletion reads only its library's `project_rows`), under its own id. */
function declaringEntry(id: string, rows: { label: string; order?: number }): PluginRegistration {
  const template = catalog.find(entry => entry.project_plugin_id === "pages");
  const library = template?.manifest.databases?.home;
  assert.ok(template && library?.project_rows);
  const { order: _order, ...declared } = library.project_rows;
  return { ...template, project_plugin_id: id,
    manifest: { ...template.manifest, databases: { home: { ...library, project_rows: { ...declared, ...rows } } } } };
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
      "characters", "artifacts", "alchemist", "plugin-builder", "assistant", "knowledge", "plugin-originals", "plugin-connections", "plugin-project-reach", "memory", "search",
    ]);
    assert.deepEqual(owners.flatMap(owner => owner.label ? [owner.label] : []), [
      "Pages 文稿与文件夹", "Forms 问卷及收到的全部回答", "Dataset 数据表", "PPT 演示稿", "工作流程及其运行记录", "放在这个项目里的待办",
      "判断规则在这个项目里的场景绑定和判断记录", "灵光里的想法与对话", "图片生成记录和已生成的图片",
      "角色在这个项目里的执行记录", "成果库保存的大文件原件", "炼金术士的研究空间", "插件创作台的构建、发布包和已保存的密钥", "助理在这个项目里的工作", "项目资料的卡片与整理记录", "这个项目及其角色的记忆",
    ]);
    // Rows a library declares in its Manifest (`project_rows`, PG-024); no catalog entry carries code that clears a project's data
    // (the 成果库's originals are its module's, which the Host names).
    const declared = catalog.flatMap(entry => {
      const label = entry.manifest.databases?.home?.project_rows?.label;
      return label ? [{ id: entry.project_plugin_id, label }] : [];
    });
    assert.deepEqual(declared.map(entry => entry.id).sort(), ["dataset", "form", "images", "lingguang", "pages", "ppt", "todo", "workflows"]);
    assert.deepEqual(catalog.filter(entry => "project_data" in entry).map(entry => entry.project_plugin_id), []);
    for (const entry of declared) assert.equal(owners.find(owner => owner.id === entry.id)?.label, entry.label, entry.id);
  });
});

test("a plugin added to the catalog with a declaration is cleared by a project's deletion without the Host naming it", async () => {
  catalog.push(declaringEntry("declared-in-test", { label: "声明里的数据", order: 0 }));
  try {
    await withFreshHome(async home => {
      const hooks = projectDeletedHooksFor(home);
      const owners = hooks.owners();
      assert.equal(owners[0]?.id, "declared-in-test", "its declared order puts it first");
      assert.equal(owners[0]?.label, "声明里的数据");
      assert.equal(await hooks.clear("declared-in-test", "project-1"), true);
      assert.equal(existsSync(join(home, "pages")), false, "a library that does not exist yet has nothing to clear and is not made");
    });
  } finally { catalog.pop(); }
});

test("declarations without an order run after every numbered one, in catalog order", async () => {
  const entry = (id: string, order?: number) => declaringEntry(id, { label: id, ...(order === undefined ? {} : { order }) });
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
