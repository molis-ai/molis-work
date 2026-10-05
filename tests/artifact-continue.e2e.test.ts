import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROJECT_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// specs/artifact-positioning A4b: 「从这一版继续」 in a version's detail opens the new object in its plugin, in the workbench.
for (const width of [1440, 390]) {
  test(`成果库 ${width}px: continuing from a version opens a new Pages document in the workbench`, { timeout: 90_000 }, async t => {
    const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, store, projectId } = b;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    new GoalProjectApplication(store).artifacts.commands.registerVersion({ project_id: DEMO_PROJECT_ID, actor_id: "web-user", artifact_id: "pages-plan", version: 1,
      artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
      producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
      content: { kind: "inline", payload: { title: "季度方案", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "目标与里程碑" }] }] } } },
      ...pinnedArtifact("季度方案", { kind: "pages_document", id: "plan" }, "1") });
    await navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/artifacts/pages-plan/versions/1` }, sessionId));
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && Boolean(document.querySelector('[data-artifact-continue=\"io.molis.work.pages\"]'))", 15_000);
    assert.equal(await evaluate<string>("document.querySelector('[data-artifact-continue=\"io.molis.work.pages\"]').textContent"), "在 Pages 继续");

    await click('[data-artifact-continue="io.molis.work.pages"]');
    // The new document opens in Pages, in the workbench; the version stays in the 成果库.
    await waitFor("document.body.dataset.desktopSurface === 'pages' && document.querySelector('[data-pages-title]')?.value === '季度方案'", 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-pages-editor] .ProseMirror')?.textContent ?? ''"), /目标与里程碑/);
    assert.equal(new GoalProjectApplication(store).artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, "pages-plan").length, 1);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  });
}
