import assert from "node:assert/strict";
import test from "node:test";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { projectSettingsCapabilities } from "@molis-ai/molis-work-contracts/modules/projects";
import { blueprintActions } from "@molis-ai/molis-work-contracts/services/blueprints";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("ONB-21/22/28/30: review actual setting values one by one, resume from the project and undo", { timeout: 95_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  const { projectId, databasePath, localHost, origin, sessionId, command, evaluate, waitFor, click, navigate } = b;
  assert.ok(projectId && localHost);
  const reference = molisWorkHostProjectReference({ projectId, databasePath });
  const caller = await localHost.localPersonContext(reference), user = bindActionClient(localHost.actionClient(reference), () => caller);
  const title = { literal: "Weekly review" };
  const { draft } = await user.invoke(blueprintActions.draftSave, { expected_revision: null,
    blueprint: { title, purpose: { audience: title, work: title, inputs: title, outputs: title, first_result: title },
      parts: [{ part_id: "engine", layer: "project", required: true, proposal: { kind: "setting", key: "projects.runtime", value: "prologue" } },
        { part_id: "outline", layer: "project", required: false, proposal: { kind: "content", type: "notes.outline.v1", body: {} } }],
      steps: [{ step_id: "prepare", title, part_ids: ["engine", "outline"] }],
      example_task: { title, input: title, step_ids: ["prepare"], result: { part_id: "outline", location: title } } } });
  const address = origin + "/projects/" + projectId + "/onboarding?scene";
  await navigate(() => command("Page.navigate", { url: address }, sessionId));
  const draftLink = '[data-scene-main] a[href*="' + draft.source.draft_id + '"]';
  await waitFor("document.querySelector('[data-scene-main] h2, [data-scene-error]:not([hidden])')");
  assert.ok(await evaluate<boolean>('Boolean(document.querySelector(' + JSON.stringify(draftLink) + '))'),
    await evaluate<string>("document.querySelector('[data-scene-workspace]').innerText"));
  await navigate(() => click(draftLink));
  await waitFor("document.querySelector('[data-scene-main] select')?.value === 'current_project'");
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("document.querySelector('[data-scene-main] dd') && document.querySelector('[data-scene-main] input[type=checkbox]')?.checked");
  assert.match(await evaluate<string>("document.querySelector('[data-scene-main]').textContent"), /prologue/);
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
  for (const width of [1440, 1024, 390]) {
    await b.setViewport(width, width === 390 ? 844 : 950, width === 390);
    assert.ok(await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth + 1"));
  }
  await click("[data-scene-aside] details summary");
  await waitFor("document.querySelector('[data-scene-aside] details')?.open");
  assert.equal(await evaluate<number>("document.querySelectorAll('[data-scene-aside] input:disabled').length"), 1);
  await click(".arrival-bar .bar-end .mw-btn--primary");
  await waitFor("location.search.includes('adoption=') && document.querySelectorAll('[data-scene-main] details').length === 2");
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), "prologue");
  await navigate(() => command("Page.navigate", { url: address }, sessionId));
  await waitFor("document.querySelector('[data-scene-aside] a[href*=adoption]')");
  await navigate(() => click("[data-scene-aside] a[href*=adoption]"));
  await waitFor("document.querySelector('[data-scene-aside] button') && document.querySelectorAll('[data-scene-main] details:not([open])').length === 2");
  await click("[data-scene-aside] button");
  await waitFor("document.querySelector('[data-scene-main]').textContent.match(/已恢复原设置|Previous setting restored/)");
  assert.equal(await user.invoke(projectSettingsCapabilities.runtime, []), null);
});
