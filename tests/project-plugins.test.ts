import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("Project plugin HTTP persists only the selected project, rejects unauthorized input, and repeats without duplicate facts", async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-project-plugins-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const first = await catalog.createProject({ display_name: "第一项目", actor_id: "test" });
  const second = await catalog.createProject({ display_name: "第二项目", actor_id: "test" });
  const token = "project-plugin-test-token-01234567890123";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    catalog.close(); await rm(homeDirectory, { recursive: true, force: true });
  });
  let sequence = 0;
  const add = (projectId: string, plugin: string, authorized = true) => fetch(`${origin}/api/settings/projects/${projectId}/plugins`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": authorized ? token : "invalid",
      "x-molis-work-idempotency-key": `add-plugin-${++sequence}` }, body: JSON.stringify({ plugin_id: plugin }),
  });
  assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["goals", "schedule"]);
  assert.equal((await add(second.project_id, "inbox", false)).status, 403);
  assert.deepEqual(catalog.listProjectPlugins(second.project_id), ["goals", "schedule"]);
  assert.equal((await add(second.project_id, "unknown")).status, 400);
  assert.equal((await add("missing", "inbox")).status, 404);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await add(second.project_id, "inbox");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { project_id: second.project_id, plugins: ["goals", "inbox", "schedule"], hidden: [] });
  }
  assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["goals", "schedule"]);
  const reopened = await openMolisWorkProjectCatalog({ homeDirectory });
  try { assert.deepEqual(reopened.listProjectPlugins(second.project_id), ["goals", "inbox", "schedule"]); }
  finally { reopened.close(); }
  const db = new Database(join(homeDirectory, "projects/catalog.db"), { readonly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND type = 'project.plugin_added'").get(second.project_id).n, 1);
  } finally { db.close(); }
  const index = await (await fetch(origin + "/api/settings/project-plugins")).json();
    assert.deepEqual(index.projects.find((item: { project_id: string }) => item.project_id === second.project_id).plugins, ["goals", "inbox", "schedule"]);
});

test("Adding Feed also enables Inbox, Inbox can be added alone, and repeats stay idempotent", async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-feed-inbox-companion-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "信息流项目", actor_id: "test" });
  const inboxOnly = await catalog.createProject({ display_name: "只要 Inbox", actor_id: "test" });
  const token = "project-plugin-inbox-test-token-01234567890123";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    catalog.close(); await rm(homeDirectory, { recursive: true, force: true });
  });
  let sequence = 0;
  const add = (projectId: string, plugin: string) => fetch(`${origin}/api/settings/projects/${projectId}/plugins`, {
    method: "POST", headers: { origin, "content-type": "application/json", "x-molis-work-control-token": token,
      "x-molis-work-idempotency-key": `add-plugin-${++sequence}` }, body: JSON.stringify({ plugin_id: plugin }),
  });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await add(project.project_id, "feed");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { project_id: project.project_id, plugins: ["feed", "goals", "inbox", "schedule"], hidden: [] });
  }
  assert.deepEqual((await (await add(inboxOnly.project_id, "inbox")).json()).plugins, ["goals", "inbox", "schedule"]);
  const feedPage = await (await fetch(`${origin}/projects/${project.project_id}/`)).text();
  assert.match(feedPage, /data-plugin-id="inbox"[^>]*data-work-surface-open="inbox"/);
  assert.doesNotMatch(feedPage, /data-directory-open="inbox"/);
  assert.doesNotMatch(feedPage, /data-directory-panel="inbox"/);
  assert.match(feedPage, /data-work-surface="inbox" data-work-surface-label="Inbox"/);
  assert.doesNotMatch(feedPage, /data-feed-views|data-directory-open="sources"/);
  const inboxOnlyPage = await (await fetch(`${origin}/projects/${inboxOnly.project_id}/`)).text();
  assert.match(inboxOnlyPage, /data-plugin-id="inbox"/);
  assert.doesNotMatch(inboxOnlyPage, /data-plugin-id="feed"/);
  const db = new Database(join(homeDirectory, "projects/catalog.db"), { readonly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND type = 'project.plugin_added'").get(project.project_id).n, 2);
    assert.deepEqual(
      db.prepare("SELECT payload_json FROM project_events WHERE project_id = ? AND type = 'project.plugin_added'").all(project.project_id)
        .map((row: { payload_json: string }) => JSON.parse(row.payload_json).plugin_id)
        .sort(),
      ["feed", "inbox"],
    );
  } finally { db.close(); }
});

test("Removing a project plugin leaves companions, removing a dependency takes dependents, and a personal plugin can be hidden then restored", async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-plugin-remove-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await catalog.createProject({ display_name: "可移除", actor_id: "test" });
  const other = await catalog.createProject({ display_name: "旁观", actor_id: "test" });
  const token = "project-plugin-remove-test-token-01234567890123";
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: token });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    catalog.close(); await rm(homeDirectory, { recursive: true, force: true });
  });
  let sequence = 0;
  const change = (method: "POST" | "DELETE", projectId: string, plugin: string, authorized = true) => fetch(`${origin}/api/settings/projects/${projectId}/plugins`, {
    method, headers: { origin, "content-type": "application/json", "x-molis-work-control-token": authorized ? token : "invalid",
      "x-molis-work-idempotency-key": `change-plugin-${++sequence}` }, body: JSON.stringify({ plugin_id: plugin }),
  });
  assert.equal((await change("DELETE", project.project_id, "inbox", false)).status, 403);
  assert.equal((await change("DELETE", project.project_id, "unknown")).status, 400);
  assert.equal((await change("DELETE", "missing", "inbox")).status, 404);
  // Goals and Shelf are 常开插件: no project removes or hides them, and the refusal records nothing (RAC-386, privileges.md V-01).
  for (const plugin of ["shelf", "goals"]) {
    const alwaysOn = await change("DELETE", project.project_id, plugin);
    assert.equal(alwaysOn.status, 400, plugin);
    assert.equal((await alwaysOn.json()).code, "catalog.plugin_always_on", plugin);
  }
  assert.deepEqual(catalog.listHiddenPlugins(project.project_id), []);
  assert.equal(catalog.listProjectPlugins(project.project_id).includes("goals"), true);
  assert.equal((await change("POST", project.project_id, "feed")).status, 200);
  const removedFeed = await change("DELETE", project.project_id, "feed");
  assert.equal(removedFeed.status, 200);
  assert.deepEqual(await removedFeed.json(), { project_id: project.project_id, plugins: ["goals", "inbox", "schedule"], hidden: [] });
  assert.equal((await change("POST", project.project_id, "feed")).status, 200);
  const removedInbox = await change("DELETE", project.project_id, "inbox");
  assert.deepEqual((await removedInbox.json()).plugins, ["goals", "schedule"]);
  assert.equal((await change("DELETE", project.project_id, "inbox")).status, 200);
  const hidden = await change("DELETE", project.project_id, "pages");
  assert.equal(hidden.status, 200);
  assert.deepEqual(await hidden.json(), { project_id: project.project_id, plugins: ["goals", "schedule"], hidden: ["pages"] });
  assert.equal((await change("DELETE", project.project_id, "pages")).status, 200);
  const hiddenPage = await (await fetch(`${origin}/projects/${project.project_id}/`)).text();
  assert.doesNotMatch(hiddenPage, /data-plugin-id="pages"/);
  const restored = await change("POST", project.project_id, "pages");
  assert.deepEqual(await restored.json(), { project_id: project.project_id, plugins: ["goals", "schedule"], hidden: [] });
  const restoredPage = await (await fetch(`${origin}/projects/${project.project_id}/`)).text();
  assert.match(restoredPage, /data-plugin-id="pages"/);
  // RAC-73: Characters is no plugin since CHR-1: Settings › 角色 is the Host's own section, which no project hides.
  const characters = await change("DELETE", project.project_id, "characters");
  assert.equal(characters.status, 400);
  assert.equal((await characters.json()).code, "catalog.plugin_not_found");
  assert.deepEqual(catalog.listHiddenPlugins(project.project_id), [], "the refusal hides nothing");
  assert.match(await (await fetch(`${origin}/projects/${project.project_id}/`)).text(), /data-settings-section="characters"/, "the section is still there after the refusal");
  assert.deepEqual(catalog.listProjectPlugins(other.project_id), ["goals", "schedule"]);
  assert.deepEqual(catalog.listHiddenPlugins(other.project_id), []);
  const db = new Database(join(homeDirectory, "projects/catalog.db"), { readonly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND type = 'project.plugin_removed' AND payload_json LIKE '%pages%'").get(project.project_id).n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND type = 'project.plugin_added' AND payload_json LIKE '%pages%'").get(project.project_id).n, 1);
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND payload_json LIKE '%shelf%'").get(project.project_id).n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND payload_json LIKE '%characters%'").get(project.project_id).n, 0);
  } finally { db.close(); }
});
