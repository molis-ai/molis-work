import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog, withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, createLocalFeedApplication, createLocalFeedSourceService } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

test("the Feed reader shows 「升格为 Goal」 only while the project has Goals to write through", { timeout: 60_000 }, async () => {
  const home = mkdtempSync(join(tmpdir(), "molis-work-feed-promote-reader-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  let itemId: string;
  let projectId: string;
  try {
    const created = await catalog.createProject({ display_name: "读者", actor_id: "test" });
    projectId = created.project_id;
    if (!catalog.listProjectPlugins(projectId).includes("feed")) catalog.addProjectPlugin({ project_id: projectId, plugin_id: "feed", actor_id: "test" });
    const store = new LocalProjectDatabase(catalog.getProject(projectId).database_path);
    try {
      const source = createLocalFeedSourceService(store.db, projectId).register({ kind: "web_query", query: "Review external input" }).source;
      itemId = createLocalFeedApplication(store.db).ingestItem({ source, externalId: "reader", title: "Reader item", summary: "s", body: "b", priority: "high",
        occurredAt: "2026-09-08T00:00:00.000Z", attention: false }).item.item_id;
    } finally { store.close(); }
  } finally { catalog.close(); }
  const server = createMolisWorkWebServer({ homeDirectory: home });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const detail = async () => {
      const response = await fetch(`http://127.0.0.1:${address.port}/projects/${encodeURIComponent(projectId)}/api/feed/items/${itemId}/detail`);
      assert.equal(response.status, 200);
      return response.text();
    };
    const member = (change: "add" | "remove") => withMolisWorkProjectCatalog({ homeDirectory: home }, c => c.commit(() => change === "add"
      ? c.addProjectPlugin({ project_id: projectId, plugin_id: "goals", actor_id: "test" })
      : c.removeProjectPlugin({ project_id: projectId, plugin_id: "goals", actor_id: "test" })));
    const withGoals = await detail();
    assert.match(withGoals, /data-feed-action="promote"/);
    await member("remove");
    const withoutGoals = await detail();
    assert.doesNotMatch(withoutGoals, /data-feed-action="promote"/);
    for (const action of ["inbox", "save", "archive"]) assert.match(withoutGoals, new RegExp(`data-feed-action="${action}"`));
    await member("add");
    assert.match(await detail(), /data-feed-action="promote"/);
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    rmSync(home, { recursive: true, force: true });
  }
});
