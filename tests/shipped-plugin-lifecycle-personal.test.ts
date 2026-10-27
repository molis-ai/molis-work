// W6-02 rest (specs/repository-anti-corruption/slices/w6-02-lifecycle-rest.md; RAC-1095–RAC-1097): the lifecycle walk of
// tests/fixtures/shipped-lifecycle.ts, for the personal plugins that run on the Home supervisor: 问题 (Issues), 知识库 (Cognia)
// and 图片 (Images). Each keeps what the person wrote in the Home, whichever project they are in; the project's plugin list only
// decides whether the project may reach it. Each thing is made through the plugin's own route and read back from its list; the
// walk then removes the plugin from the project and adds it back, takes a required permission away and gives it back, upgrades
// the installation and uninstalls it, with a restart after. 置物架 (Shelf) is not walked here: slice spec §3 says why (BL-804).
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
};

const walked = "added, removed and added back in a project, revoked, upgraded and uninstalled";
test(`RAC-1095 W6-02 问题 (Issues) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.issues!));
test(`RAC-1096 W6-02 知识库 (Cognia) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.cognia!));
test(`RAC-1097 W6-02 图片 (Images) on the Home supervisor: ${walked}`, { timeout: 180_000 }, () => walk(PERSONAL.images!));
