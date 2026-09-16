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
  assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["goals"]);
  assert.equal((await add(second.project_id, "sessions", false)).status, 403);
  assert.deepEqual(catalog.listProjectPlugins(second.project_id), ["goals"]);
  assert.equal((await add(second.project_id, "unknown")).status, 400);
  assert.equal((await add("missing", "sessions")).status, 404);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await add(second.project_id, "sessions");
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { project_id: second.project_id, plugins: ["goals", "sessions"] });
  }
  assert.deepEqual(catalog.listProjectPlugins(first.project_id), ["goals"]);
  const reopened = await openMolisWorkProjectCatalog({ homeDirectory });
  try { assert.deepEqual(reopened.listProjectPlugins(second.project_id), ["goals", "sessions"]); }
  finally { reopened.close(); }
  const db = new Database(join(homeDirectory, "projects/catalog.db"), { readonly: true });
  try {
    assert.equal(db.prepare("SELECT count(*) AS n FROM project_events WHERE project_id = ? AND type = 'project.plugin_added'").get(second.project_id).n, 1);
  } finally { db.close(); }
  const index = await (await fetch(origin + "/api/settings/project-plugins")).json();
    assert.deepEqual(index.projects.find((item: { project_id: string }) => item.project_id === second.project_id).plugins, ["goals", "sessions"]);
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
    assert.deepEqual(await response.json(), { project_id: project.project_id, plugins: ["feed", "goals", "inbox"] });
  }
  assert.deepEqual((await (await add(inboxOnly.project_id, "inbox")).json()).plugins, ["goals", "inbox"]);
  const feedPage = await (await fetch(`${origin}/projects/${project.project_id}/`)).text();
  assert.match(feedPage, /data-plugin-id="inbox"[^>]*data-directory-open="inbox"[^>]*data-work-surface-open="inbox"/);
  assert.match(feedPage, /data-directory-panel="inbox"/);
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

test("Catalog migration preserves all old project entries and keeps newly created project defaults after reopen", async t => {
  const homeDirectory = await mkdtemp(join(tmpdir(), "molis-work-plugin-migration-"));
  t.after(() => rm(homeDirectory, { recursive: true, force: true }));
  const old = await openMolisWorkProjectCatalog({ homeDirectory });
  const project = await old.createProject({ display_name: "已有项目", actor_id: "test" });
  old.close();
  const db = new Database(join(homeDirectory, "projects/catalog.db"));
  db.exec("DROP TABLE project_plugins; UPDATE catalog_meta SET value = '10' WHERE key = 'schema_version'"); db.close();
  const migrated = await openMolisWorkProjectCatalog({ homeDirectory });
  assert.deepEqual(migrated.listProjectPlugins(project.project_id), ["artifacts", "feed", "goals", "inbox", "sessions"]);
  const created = await migrated.createProject({ display_name: "新项目", actor_id: "test" });
  assert.deepEqual(migrated.listProjectPlugins(created.project_id), ["goals"]);
  migrated.close();
  const reopened = await openMolisWorkProjectCatalog({ homeDirectory });
  try {
    assert.deepEqual(reopened.listProjectPlugins(project.project_id), ["artifacts", "feed", "goals", "inbox", "sessions"]);
    assert.deepEqual(reopened.listProjectPlugins(created.project_id), ["goals"]);
    assert.equal(reopened.getProject(project.project_id).display_name, "已有项目");
  } finally { reopened.close(); }
});
