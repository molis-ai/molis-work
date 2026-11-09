import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { BASELINE_SPEC, PLUGIN_COMPONENTS } from "@molis-ai/molis-work-design-system";
import { AgentBuilderStore } from "@molis-ai/molis-work-plugin-builder";
import { memoryStorage } from "./fixtures/builder-workflow-design.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { readingContract, readingNodes } from "./fixtures/plugin-composition.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("FSS-05 FSS-26 the Folio catalog and the Builder candidate board use the same shipped component records", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null);
  if (!b) return;
  const navigate = (path: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  await b.setViewport(1440, 940);
  await navigate("/settings/appearance");
  const applied = await b.evaluate<{ receipt: { selection_revision: number } }>(`molisWorkRequest('/api/ui/appearance', ${JSON.stringify({ body: {
    request_id: randomUUID(), expected_revision: 0,
    choice: { kind: "selection", selection: { skin: { id: "folio", revision: 1 }, font: { policy: "follow-skin" }, mono: null } },
  } })})`);
  assert.equal(applied.receipt.selection_revision, 1);

  await navigate("/__ui/catalog");
  assert.equal(await b.evaluate("document.documentElement.dataset.uiSkin"), "folio@1");
  assert.equal(await b.evaluate("Boolean(document.querySelector('[data-primitive=look-card]'))"), true);
  assert.equal(await b.evaluate("Boolean(document.querySelector('[data-skin-option]'))"), false);

  // Only the paused design is supplied by the fixture. The authenticated state request, shipped component records,
  // Workbench frame and Builder renderer are all the production ones.
  const build = new AgentBuilderStore(memoryStorage()).create("阅读摘记");
  build.phase = "paused";
  build.design = { id: "reading", title: "阅读摘记", description: "浏览与记录读过的文字", rationale: "先读后写",
    journey: ["打开摘记", "写下自己的想法"], contract: readingContract, parts: readingNodes, acceptance: [] };
  build.nodes = [readingNodes[0]!];
  build.pendingPart = { id: "notes", candidates: ["directory", "table"], reason: "浏览已有摘记" };
  const prefix = `/projects/${b.projectId}/api/plugin-builder/studio`;
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: `{
    const original = window.fetch.bind(window), prefix = ${JSON.stringify(prefix)}, build = ${JSON.stringify(build)};
    window.fetch = async (input, options) => {
      const url = new URL(input instanceof Request ? input.url : String(input), location.href);
      if (url.origin !== location.origin || (options?.method ?? 'GET') !== 'GET') return original(input, options);
      if (url.pathname === prefix + '/state') {
        const response = await original(input, options);
        if (!response.ok) return response;
        const state = await response.json();
        window.testBuilderComponents = state.components;
        return Response.json({ ...state, builds: [build] });
      }
      if (url.pathname === prefix + '/builds/' + build.id) return Response.json({ build, versions: [] });
      if (url.pathname === prefix + '/builds/' + build.id + '/events') return new Response(null, { status: 204 });
      return original(input, options);
    };
  }` }, b.sessionId);
  const frame = await pluginFrameBrowser(t, b, "plugin-builder");
  await navigate(`/projects/${b.projectId}/?openPlugin=plugin-builder`);
  await frame.click(`[data-as-open="${build.id}"]`);
  await frame.waitFor("document.querySelector('[data-as-board]:not([hidden]) [data-kind=directory][data-legal]')");
  assert.deepEqual(await b.evaluate("testBuilderComponents"), PLUGIN_COMPONENTS);
  assert.equal(await frame.evaluate("document.documentElement.dataset.uiSkin"), "folio@1");

  await frame.click("[data-as-catalog=components]");
  const look = "[data-as-catalog-panel]:not([hidden]) [data-kind=look-card]";
  await frame.waitFor(`document.querySelector(${JSON.stringify(look)})`);
  const row = BASELINE_SPEC.components.find(component => component.kind === "look-card");
  assert.ok(row && "literal" in row.name && "literal" in row.description);
  assert.equal(await frame.evaluate(`document.querySelector(${JSON.stringify(look)}).getAttribute('aria-label')`),
    `${row.name.literal} ${row.catalog}：${row.description.literal}`);

  const folder = join(process.cwd(), ".impeccable", "qa", "review", "batch-16-appearance");
  mkdirSync(folder, { recursive: true });
  const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
  writeFileSync(join(folder, "builder-folio-candidates.png"), Buffer.from(shot.data, "base64"));
});
