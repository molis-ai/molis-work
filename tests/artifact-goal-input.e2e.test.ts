import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

// specs/artifact-positioning A4b: in a 成果 version's detail, choose a Goal and record the version as its input.
for (const width of [1440, 390]) {
  test(`成果库 ${width}px: a version becomes a Goal's input from its own detail`, { timeout: 90_000 }, async t => {
    const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
    const { command, sessionId, evaluate, waitFor, navigate, click, store, projectId } = b;
    await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 950, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
    new GoalProjectApplication(store).artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-brief", version: 1,
      artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
      producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
      content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "范围与验收" }] }] } } },
      ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, "1") });
    await navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/artifacts/pages-brief/versions/1` }, sessionId));
    await waitFor("document.body.dataset.desktopSurface === 'artifacts' && Boolean(document.querySelector('[data-artifact-goal-input] summary'))", 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-links]').innerText"), /还没有目标引用这一版/);

    await click("[data-artifact-goal-input] summary");
    await waitFor("[...document.querySelectorAll('[data-artifact-goal-input] select option')].some(option => option.value === 'V1')", 10_000);
    await evaluate("(() => { const select = document.querySelector('[data-artifact-goal-input] select'); select.value = 'V1'; select.dispatchEvent(new Event('change', { bubbles: true })); })()");
    await click("[data-artifact-goal-input-form] button[type=submit]");
    // The detail reloads and 「被谁引用」 names the Goal, as an input.
    await waitFor("Boolean(document.querySelector('[data-artifact-links] a[href$=\"/goals/V1\"]'))", 15_000);
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-links] li').innerText"), /输入/);
    const inputs = await evaluate<{ inputs: Array<{ reference: { artifact_id: string; version: number }; proposed: boolean }> }>(
      `fetch(${JSON.stringify(`/projects/${projectId}/api/goals/V1/artifact-inputs`)}).then(response => response.json())`);
    assert.deepEqual(inputs.inputs.map(item => [item.reference.artifact_id, item.reference.version, item.proposed]), [["pages-brief", 1, false]]);
    assert.equal(await evaluate("document.documentElement.scrollWidth <= innerWidth"), true);
  });
}
