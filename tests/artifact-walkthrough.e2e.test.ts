import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// What the artifact-positioning walkthrough in an isolated Home turned up (desktop and 390), each kept fixed here.
for (const width of [1440, 390]) {
  test(`成果库 ${width}px: titles, the side panel, the Goal card and the import dialog read as one product`, { timeout: 120_000 }, async t => {
    const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
    const { command, sessionId, evaluate, waitFor, navigate, store, projectId, surfaceReady } = b;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    const coordinator = new GoalProjectApplication(store);
    coordinator.artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-brief", version: 1,
      artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
      producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
      content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "范围与验收" }] }] } } },
      ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, "1") });
    const scope = { kind: "personal" as const, id: DEMO_BOARD_ID };
    createContextLedger(store.db, { authorize: () => true }).commands.put({ actor_id: "web-user", scope }, { key: "goal.output:V1:fixture", type: "goal.output", cause: "goals.deliverable",
      source: { module: "goals", id: "V1", version: null, scope }, target: { module: "artifacts", id: "pages-brief", version: 1, scope } });

    // A direct link opens the workbench on the version, and the tab is named after it, not its address.
    await navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/artifacts/pages-brief/versions/1` }, sessionId));
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && Boolean(document.querySelector('[data-artifact-links]'))", 15_000);
    assert.match(await evaluate<string>("document.title"), /^需求说明 · /);
    // 「被谁引用」 keeps the Goal's name and its role apart.
    assert.ok(await evaluate<number>("parseFloat(getComputedStyle(document.querySelector('[data-artifact-links] li span')).marginLeft)") >= 4);

    // The side panel groups 成果 by the names owners declare, and opens a version in the 成果库.
    await evaluate("document.dispatchEvent(new CustomEvent('molis:side-open', { detail: { tab: 'files', focus: true } }))");
    await waitFor("[...document.querySelectorAll('.side-files-group h3')].some(h => h.textContent === '项目成果')", 15_000);
    const groups = await evaluate<string>("[...document.querySelectorAll('[data-side-file]')].map(row => row.closest('section')?.innerText ?? '').join('|')");
    assert.doesNotMatch(groups, /io\.molis\.work\.pages\.document/);
    assert.match(groups, /文档/);

    // The Goal page's card names the type as Pages declares it, and does not claim no plugin can read it.
    const goal = await evaluate<string>(`fetch(${JSON.stringify(`/projects/${projectId}/goals/V1`)}, { headers: { "x-molis-work-fragment": "goal-document" } }).then(r => r.text())`);
    const card = goal.slice(goal.indexOf("交付物与输入"));
    assert.match(card, /需求说明/);
    assert.doesNotMatch(card.slice(0, 2000), /没有兼容插件/);
    assert.match(card.slice(0, 2000), /文档 · io\.molis\.work\.pages\.document/);
    // The Goal's overview says what it hands in, without opening 「完成要求」 (F6), and leads there.
    assert.match(goal, /data-event-reader="requirements" data-goal-deliverables-entry><span>交付物<\/span><span>1 份<\/span>/);

    // The import dialog has room around its content (the side panel, which covers a phone screen, is put away first).
    await evaluate("document.dispatchEvent(new CustomEvent('molis:side-close'))");
    // On a phone the version fills the screen; the list with its import button is one step back.
    if (!await evaluate("[...document.querySelectorAll('[data-artifact-import-open]')].some(button => button.getClientRects().length)")) {
      await evaluate("document.querySelector('[data-artifact-collapse]')?.click()");
      // The list reloads after stepping back; wait until it no longer shows the version, then use its import button.
      await waitFor("!document.querySelector('[data-artifact-detail] [data-artifact-id]') && [...document.querySelectorAll('[data-artifact-import-open]')].some(button => button.getClientRects().length)", 10_000);
    }
    // The 成果 surface's client loads on first use (#150); its buttons work once it is ready.
    await surfaceReady("artifacts");
    await evaluate("[...document.querySelectorAll('[data-artifact-import-open]')].find(button => button.getClientRects().length)?.click()");
    await waitFor("document.querySelector('[data-artifact-import-dialog]')?.open === true");
    assert.ok(await evaluate<number>("parseFloat(getComputedStyle(document.querySelector('[data-artifact-import-dialog]')).paddingLeft)") >= 16);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  });
}
