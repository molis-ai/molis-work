// W6-02 rest (specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1095–RAC-1098): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the personal plugins that run on the Home supervisor: 问题 (Issues), 知识库 (Cognia),
// 图片 (Images) and 置物架 (Shelf, which is also 常开 and has a half of its own in every project). Each keeps what the person wrote in the Home, whichever project they are in; the project's plugin list only decides
// whether the project may reach it. Each thing is made through the plugin's own route and read back from its list; the walk then
// removes the plugin from the project and adds it back, takes a required permission away and gives it back, upgrades the
// installation and uninstalls it, with a restart after.
import test from "node:test";
import { titlesOf, walk, type Shipped } from "./fixtures/shipped-lifecycle.js";

const PERSONAL: Record<string, Shipped> = {
  issues: { key: "issues", plugin_id: "io.molis.work.issues", scope: "home",
    write: (web, routes, title) => web.post(`${routes}/create`, { title, type: "bug", description: "第一稿" }),
    titles: async (web, routes) => titlesOf((await web.get<{ items: Array<{ title: string }> }>(`${routes}/list`)).items) },
  cognia: { key: "cognia", plugin_id: "io.molis.work.cognia", scope: "home",
    write: (web, routes, title) => web.post(`${routes}/library/materials`, { title, body: "材料" }),
    titles: async (web, routes) => titlesOf((await web.get<{ materials: Array<{ title: string }> }>(`${routes}/library`)).materials) },
  // What the person keeps of Images in the Home is its generation services; the name is what the list shows.
  images: { key: "images", plugin_id: "io.molis.work.images", scope: "home",
    write: (web, routes, name) => web.post(`${routes}/connections`, { name, api_format: "openai-images", base_url: "http://127.0.0.1:9/v1", model: "fixture" }),
    titles: async (web, routes) => (await web.get<{ connections: Array<{ name: string }> }>(`${routes}/connections`)).connections.map(connection => connection.name) },
  // Shelf keeps its copies in the Home; a new shelf also holds a sample, so the list is read for the names this walk gives.
  shelf: { key: "shelf", plugin_id: "io.molis.work.shelf", scope: "home", always_on: true, dual: true, kept: ["first-lifecycle.md"],
    write: (web, routes, title) => web.post(`${routes}/items`, { filename: `${title}-lifecycle.md`, bytes_base64: Buffer.from("第一稿").toString("base64") }),
    titles: async (web, routes) => (await web.get<{ materials: Array<{ name: string }> }>(`${routes}/`)).materials.map(item => item.name).filter(name => name.endsWith("-lifecycle.md")) },
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1095 W6-02 问题 (Issues) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.issues!));
test(`RAC-1096 W6-02 知识库 (Cognia) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.cognia!));
test(`RAC-1097 W6-02 图片 (Images) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.images!));
test(`RAC-1098 W6-02 置物架 (Shelf) on the Home supervisor: refused removal from a project, revoked, upgraded and uninstalled, its project half left alone`, { timeout: 180_000 }, () => walk(PERSONAL.shelf!));
