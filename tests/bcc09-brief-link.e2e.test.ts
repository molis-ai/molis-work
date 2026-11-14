import assert from "node:assert/strict";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";
import { createLocalFeedApplication } from "./fixtures/feed-library.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

// BCC-09: a brief HTML link clicked after its plugin was removed. The fixture seeds the one thing the chooser needs that the ordinary
// demo project does not: a Home event whose `open` names a plugin item. Feed's source-fault event is ahead (`today`, attention), so the
// brief renders it as a next-item link; removing Feed afterwards leaves the old href stale.
test("BCC-09 an old brief HTML link to a removed plugin opens nothing and writes nothing", { timeout: 120_000 }, async t => {
  let projectId = "", databasePath = "";
  const b = await openGoalBrowser(t, "seeded", undefined, undefined, undefined, undefined, {
    prepareHome: async home => {
      const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
      try {
        const project = catalog.listProjects()[0]!;
        projectId = project.project_id;
        databasePath = project.database_path;
        const store = new LocalProjectDatabase(databasePath);
        try {
          const feed = createLocalFeedApplication(store.db);
          const now = new Date().toISOString();
          feed.sources.upsert({ project_id: projectId, source_id: "bcc09-source", kind: "workflow", definition_id: null, sync_kind: "manual",
            name: "BCC-09 来源", description: "", status: "error", enabled: true, origin: "molis_work", config: {}, schedule: { mode: "manual" },
            credential_ref: null, account_label: null, last_sync_at: null, last_outcome: "failed", last_error_code: "feed_parse_failed",
            imported_at: now, updated_at: now, item_count: 0, cursor: null });
        } finally { store.close(); }
      } finally { await catalog.close(); }
    },
  });
  if (!b) return;
  assert.equal(b.projectId, projectId);
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__errors = []; addEventListener('error', e => window.__errors.push(String(e.message))); addEventListener('unhandledrejection', e => window.__errors.push(String(e.reason)));" }, b.sessionId);
  const brief = await b.web.get<{ html: string }>(`/api/projects/${projectId}/brief`);
  const match = /href="([^"]*openPlugin=feed[^"]*)"/u.exec(brief.html);
  assert.ok(match, "the seeded source error makes the brief carry a Feed next-item link");
  const href = match[1]!.replaceAll("&amp;", "&");
  const settings = await b.web.get<{ projects: { project_id: string; revision: number; plugins: string[] }[] }>("/api/settings/project-plugins");
  const row = settings.projects.find(project => project.project_id === projectId)!;
  assert.ok(row.plugins.includes("feed"), "the seeded project starts with Feed");
  const removed = await b.web.delete(`/api/settings/projects/${projectId}/plugins`, { plugin_id: "feed", expected_revision: row.revision });
  assert.equal((removed as { plugins?: string[] }).plugins?.includes("feed"), false);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + href }, b.sessionId));
  await b.waitFor("Boolean(document.querySelector('[data-plugin-tile]'))");
  const page = await b.evaluate<{ surface: string | null; open: number; feed: number; errors: string[] }>(`new Promise(resolve => setTimeout(() => resolve({
    surface: document.querySelector('[data-desktop-surface]')?.getAttribute('data-desktop-surface') ?? null,
    open: document.querySelectorAll('dialog[open]').length,
    feed: document.querySelectorAll('[data-feed-item], [data-feed-source], [data-feed-detail], [data-feed-out-rules]').length,
    errors: window.__errors }), 1500))`);
  assert.equal(page.surface, "home", "the old link opens the project home, not the removed plugin");
  assert.equal(page.open, 0, "no dialog opens");
  assert.equal(page.feed, 0, "no Feed UI opens from the stale link");
  assert.deepEqual(page.errors, [], "the page's program did not fail on the stale link");
});
