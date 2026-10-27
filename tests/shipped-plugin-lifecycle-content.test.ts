// W6-02 rest (specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1090–RAC-1094): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the shipped plugins that keep the person's titled content in a project on that
// project's supervisor: 数据表, 演示稿, 问卷, 工作流程 and 定时任务. Each person-written thing is made through the plugin's own route and read
// back from its list; the walk then removes the plugin from the project and adds it back, takes a required permission away and
// gives it back, upgrades the installation and uninstalls it, with a restart after.
import test from "node:test";
import { titlesOf, walk, type Shipped } from "./fixtures/shipped-lifecycle.js";

const CONTENT: Record<string, Shipped> = {
  dataset: { key: "dataset", plugin_id: "io.molis.work.dataset", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/datasets`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ datasets: Array<{ title: string }> }>(`${routes}/datasets`)).datasets) },
  ppt: { key: "ppt", plugin_id: "io.molis.work.ppt", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/ppt`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ presentations: Array<{ title: string }> }>(`${routes}/ppt`)).presentations) },
  form: { key: "form", plugin_id: "io.molis.work.form", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/forms`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ forms: Array<{ title: string }> }>(`${routes}/forms`)).forms) },
  workflows: { key: "workflows", plugin_id: "io.molis.work.native.workflows", scope: "project",
    write: (web, routes, title) => web.post(`${routes}/workflows`, { title }),
    titles: async (web, routes) => titlesOf((await web.get<{ workflows: Array<{ title: string }> }>(`${routes}/workflows`)).workflows) },
  // In every new project by its plugin list; a daily task is what the person writes here.
  schedule: { key: "schedule", plugin_id: "io.molis.work.schedule", scope: "project", stops_when_removed: true,
    write: (web, routes, title) => web.post(`${routes}/tasks`, { title, instructions: "每天看一遍", time: "09:00" }),
    titles: async (web, routes) => titlesOf((await web.get<{ tasks: Array<{ title: string }> }>(`${routes}/list`)).tasks) },
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1090 W6-02 数据表 (Dataset) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CONTENT.dataset!));
test(`RAC-1091 W6-02 演示稿 (PPT) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CONTENT.ppt!));
test(`RAC-1092 W6-02 问卷 (Form) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CONTENT.form!));
test(`RAC-1093 W6-02 工作流程 (Workflows) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CONTENT.workflows!));
test(`RAC-1094 W6-02 定时任务 (Schedule) on a project's supervisor: ${walked}`, { timeout: 180_000 }, () => walk(CONTENT.schedule!));
