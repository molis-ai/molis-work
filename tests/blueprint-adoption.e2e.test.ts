import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  const selected = "[data-scene-main] input[type=checkbox]";
  await click(selected);
  await click("[data-scene-aside] button:nth-of-type(2)");
  await waitFor("document.activeElement === document.querySelector('[data-scene-main] h2') && location.search.includes('preview=')");
  await b.reloadPage();
  await waitFor("document.querySelector('[data-scene-aside] button:nth-of-type(2)')?.disabled");
  await evaluate("document.querySelector('[data-scene-aside] button').focus()");
  const enter = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
  await command("Input.dispatchKeyEvent", { type: "keyDown", ...enter, text: "\r" }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", ...enter }, sessionId);
  await waitFor("document.querySelector('[data-scene-main] input[type=checkbox]') && document.activeElement === document.querySelector('[data-scene-main] h2')");
  assert.equal(await evaluate<boolean>("document.querySelector('[data-scene-main] input').checked"), false, "reload keeps an explicit exclusion");
  await click(selected);
  await click("[data-scene-main] details summary");
  await evaluate("document.querySelector('[data-scene-main] textarea').value = ''");
  await click("[data-scene-main] details button");
  await waitFor("!document.querySelector('[data-scene-error]').hidden");
  assert.ok(await evaluate<boolean>("document.querySelector('[data-scene-main] details').open && document.querySelector('[data-scene-main] textarea').value === ''"),
    "the rejected edit stays on screen for correction");
  await evaluate("document.querySelector('[data-scene-main] textarea').value = 'prologue'");
  await click("[data-scene-main] details button");
  await waitFor("document.querySelector('[data-scene-workspace]').getAttribute('aria-busy') === 'false' && document.querySelector('[data-scene-error]').hidden");
  const reviewDir = join(process.cwd(), ".impeccable", "qa", "review", "batch-38");
  await mkdir(reviewDir, { recursive: true });
  for (const width of [1440, 1024, 390]) {
    await b.setViewport(width, width === 390 ? 844 : 950, width === 390);
    const mode = width === 1024 ? "dark" : "light";
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }] }, sessionId);
    if (width === 1024) {
      await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
    }
    await b.reloadPage();
    await waitFor("document.querySelector('[data-scene-main] input')?.checked");
    if (width !== 1440) assert.match(await evaluate<string>("document.documentElement.lang"), /^en/);
    await waitFor("document.documentElement.dataset.resolvedTheme === " + JSON.stringify(mode));
    assert.ok(await evaluate<boolean>("document.documentElement.scrollWidth <= innerWidth + 1"));
    const shot = await command<{data: string}>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(reviewDir, "review-" + width + "-" + mode + ".png"), Buffer.from(shot.data, "base64"));
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
