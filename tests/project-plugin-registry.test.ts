import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { ProjectPluginRegistry } from "@molis-ai/molis-work-contracts/modules/projects";
import { BUILTIN_PROJECT_PLUGIN_REGISTRY } from "@molis-ai/molis-work-contracts/modules/projects";
import { ProjectsModule, createProjectsSchema } from "@molis-ai/molis-work-module-projects";

function openProjects(directory: string, plugins?: ProjectPluginRegistry) {
  const db = new Database(join(directory, "catalog.db"));
  createProjectsSchema(db);
  const projects = new ProjectsModule({
    db,
    errorFactory: (code, message) => Object.assign(new Error(message), { code }),
    plugins,
  });
  return { db, projects };
}

function createProject(projects: ProjectsModule, directory: string, name: string) {
  const draft = projects.lifecycle.prepareRecord({
    display_name: name,
    projects_directory: directory,
    data_class: "user",
  });
  projects.lifecycle.register(draft, "project.created", "tester");
  return draft;
}

test("a Plugin the registry knows can be enabled without touching the schema", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-registry-"));
  try {
    // A registry that also knows a Plugin this build never compiled into a literal set.
    const registry: ProjectPluginRegistry = {
      has: (pluginId) => BUILTIN_PROJECT_PLUGIN_REGISTRY.has(pluginId) || pluginId === "coding",
      companions: (pluginId) => BUILTIN_PROJECT_PLUGIN_REGISTRY.companions(pluginId),
    };
    const { db, projects } = openProjects(directory, registry);
    const project = createProject(projects, directory, "编码项目");

    const enabled = projects.commands.addProjectPlugin({
      project_id: project.project_id,
      plugin_id: "coding",
      actor_id: "tester",
    });
    assert.ok(enabled.includes("coding"), "注册表认识的插件应该能启用");
    assert.deepEqual(projects.query.listProjectPlugins(project.project_id).sort(), ["coding", "goals"]);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a Plugin the registry does not know is still refused", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-registry-unknown-"));
  try {
    const { db, projects } = openProjects(directory);
    const project = createProject(projects, directory, "普通项目");
    assert.throws(
      () => projects.commands.addProjectPlugin({
        project_id: project.project_id,
        plugin_id: "coding",
        actor_id: "tester",
      }),
      (error: unknown) => (error as { code?: string }).code === "catalog.plugin_not_found",
    );
    assert.deepEqual(projects.query.listProjectPlugins(project.project_id), ["goals"]);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("enabling a Plugin still pulls in the companions it cannot appear without", () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-registry-companion-"));
  try {
    const { db, projects } = openProjects(directory);
    const project = createProject(projects, directory, "带 Feed 的项目");
    const enabled = projects.commands.addProjectPlugin({
      project_id: project.project_id,
      plugin_id: "feed",
      actor_id: "tester",
    });
    assert.deepEqual(enabled.sort(), ["feed", "goals", "inbox"]);
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
