import { pagesTestPorts } from "./fixtures/pages-actions.js";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  GoalProjectApplication,
  LocalProjectDatabase,
} from "@molis-ai/molis-work-app-local-host";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import { createPagesRouteHandlers } from "../plugins/native/pages/src/route-handlers.ts";
import { PagesPluginRouteTable } from "../plugins/native/pages/src/routes.ts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";
import { registerPagesArtifactVersion } from "../apps/local-host/src/pages-artifact.ts";

const TOKEN = "pages-project-binding-token-0123456789";

async function listen(homeDirectory: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server = createMolisWorkWebServer({ homeDirectory, controlToken: TOKEN });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function headers(origin: string, key: string): HeadersInit {
  return {
    origin,
    "content-type": "application/json",
    "x-molis-work-control-token": TOKEN,
    "x-molis-work-idempotency-key": key,
  };
}

test("Host 路由里的项目与 query/body 不一致时，发布在写入前失败", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-project-binding-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const first = await catalog.createProject({ display_name: "项目 A", actor_id: "test" });
  const second = await catalog.createProject({ display_name: "项目 B", actor_id: "test" });
  const server = await listen(home);
  try {
    const created = await fetch(`${server.origin}/projects/${first.project_id}/api/plugins/pages?project_id=${first.project_id}`, {
      method: "POST",
      headers: headers(server.origin, "pages-create-a"),
      body: JSON.stringify({ project_id: first.project_id, title: "只属于 A" }),
    });
    assert.equal(created.status, 200);
    const page = (await created.json() as { document: { id: string; version: number; artifact_version: number } }).document;
    const mismatched = await fetch(`${server.origin}/projects/${first.project_id}/api/plugins/pages/${page.id}/promote?project_id=${second.project_id}`, {
      method: "POST",
      headers: headers(server.origin, "pages-promote-mismatch"),
      body: JSON.stringify({ project_id: second.project_id }),
    });
    const mismatchBody = await mismatched.json() as { code?: string; error?: string };
    assert.equal(mismatched.status, 403);
    assert.equal(mismatchBody.code, "actions.scope_mismatch");
    const split = await fetch(`${server.origin}/projects/${first.project_id}/api/plugins/pages/${page.id}/promote?project_id=${first.project_id}`, {
      method: "POST",
      headers: headers(server.origin, "pages-promote-split"),
      body: JSON.stringify({ project_id: second.project_id }),
    });
    assert.equal(split.status, 403);

    const pages = openPagesStore(home);
    try {
      const stored = pages.get(page.id, first.project_id);
      assert.equal(stored.version, page.version);
      assert.equal(stored.artifact_version, 0);
      assert.equal(pages.list(second.project_id).some((item) => item.id === page.id), false);
    } finally {
      pages.close();
    }
    for (const project of [first, second]) {
      const database = new LocalProjectDatabase(project.database_path);
      try {
        const artifacts = new GoalProjectApplication(database).artifacts.query;
        assert.equal(artifacts.getArtifactVersion(project.board_id, { artifact_id: `pages-${page.id}`, version: 1 }), null);
      } finally {
        database.close();
      }
    }

    const promoted = await fetch(`${server.origin}/projects/${first.project_id}/api/plugins/pages/${page.id}/promote?project_id=${first.project_id}`, {
      method: "POST",
      headers: headers(server.origin, "pages-promote-ok"),
      body: JSON.stringify({ project_id: first.project_id }),
    });
    assert.equal(promoted.status, 200);
    const again = await fetch(`${server.origin}/projects/${first.project_id}/api/plugins/pages/${page.id}/promote?project_id=${first.project_id}`, {
      method: "POST",
      headers: headers(server.origin, "pages-promote-again"),
      body: JSON.stringify({ project_id: first.project_id }),
    });
    assert.equal(again.status, 200);
    const published = await again.json() as { artifact: { artifact_id: string; version: number } };
    assert.equal(published.artifact.version, 2);
    const database = new LocalProjectDatabase(first.database_path);
    try {
      const found = new GoalProjectApplication(database).artifacts.query.getArtifactVersion(first.board_id, {
        artifact_id: published.artifact.artifact_id,
        version: 2,
      });
      assert.equal(found?.version, 2);
    } finally {
      database.close();
    }
  } finally {
    await server.close();
    catalog.close();
    await rm(home, { recursive: true, force: true });
  }
});

test("合法旧库映射按目录项目发布到原来的 board，不会把 board 差异当成串项目", async () => {
  const home = await mkdtemp(join(tmpdir(), "pages-legacy-project-"));
  const database = new LocalProjectDatabase(join(home, "legacy.db"));
  const pages = openPagesStore(home);
  try {
    const coordinator = new GoalProjectApplication(database);
    coordinator.initializeBoard({
      board_id: "legacy-board",
      title: "旧库",
      actor_id: "test",
      idempotency_key: "pages-legacy-board",
    });
    const created = pages.create({ project_id: "catalog-project", title: "旧映射" });
    const routes = new PagesPluginRouteTable(createPagesRouteHandlers(pagesTestPorts(pages, "catalog-project", {
      publishArtifact: registerPagesArtifactVersion(coordinator, "legacy-board", "catalog-project"),
    })));
    await assert.rejects(routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/promote`,
      query: new URLSearchParams({ project_id: "other-project" }),
      body: { project_id: "other-project" },
    }), { code: "actions.scope_mismatch" });
    assert.equal(pages.get(created.id, "catalog-project").artifact_version, 0);
    assert.equal(coordinator.artifacts.query.getArtifactVersion("legacy-board", {
      artifact_id: `pages-${created.id}`,
      version: 1,
    }), null);

    const promoted = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/promote`,
      query: new URLSearchParams({ project_id: "catalog-project" }),
      body: { project_id: "catalog-project" },
    });
    assert.equal(promoted?.status, 200);
    const artifact = (promoted?.body as { artifact: { artifact_id: string; version: number } }).artifact;
    assert.equal(artifact.version, 1);
    assert.equal(coordinator.artifacts.query.getArtifactVersion("legacy-board", artifact)?.board_id ?? "legacy-board", "legacy-board");
    assert.ok(coordinator.artifacts.query.getArtifactVersion("legacy-board", artifact));
    const again = await routes.handle({
      method: "POST",
      pathname: `/api/pages/${created.id}/promote`,
      query: new URLSearchParams({ project_id: "catalog-project" }),
      body: { project_id: "catalog-project" },
    });
    assert.equal((again?.body as { artifact: { version: number } }).artifact.version, 2);
  } finally {
    pages.close();
    database.close();
    await rm(home, { recursive: true, force: true });
  }
});
