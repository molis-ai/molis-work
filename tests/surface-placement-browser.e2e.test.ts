import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import type { PlacementRelatedItem } from "@molis-ai/molis-work-contracts/services/placement";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";

test("IUI-07 IUI-08 IUI-26: a real Home card can choose a project and a receiver without leaving its source", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "user", undefined, null);
  if (!b) return;
  const { projectId } = b;
  assert.ok(projectId);
  const prefix = "/projects/" + projectId;
  const title = "Keep this original Goal in place", target = await createProject(b.web, "Use the original here");
  const { goal } = await b.web.post<{ goal: { goal_id: string } }>(prefix + "/api/plugins/io.molis.work.goals/goals", {
    title, outcome: "A real original Goal in this project", idempotency_key: randomUUID(),
  });
  await b.setViewport(1440, 900);
  await b.command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: b.origin }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + prefix + "/" }, b.sessionId));
  const row = '[data-home-card="io.molis.work.goals"] [data-home-subject-id="' + goal.goal_id + '"]';
  const q = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  const visible = (selector: string) => "!!" + q(selector) + "?.checkVisibility()";
  const select = async (where: string, label: string) => {
    const found = `[...document.querySelectorAll(${JSON.stringify(where)})].find(button => button.checkVisibility() && button.textContent.trim() === ${JSON.stringify(label)})`;
    await b.waitFor(`!!${found}`);
    await b.evaluate(`${found}.setAttribute("data-test-actual-choice", "")`);
    await b.click("[data-test-actual-choice]");
    await b.evaluate('document.querySelector("[data-test-actual-choice]")?.removeAttribute("data-test-actual-choice")');
  };
  const menu = row + " .mw-presentation__more summary";
  await b.waitFor(visible(menu)); await b.click(menu);
  await select(row + " [role=menuitem]", "改成卡片");
  await b.waitFor(visible(row + " .mw-presentation--card"));
  assert.equal(await b.evaluate(`!!${q(row + ' [data-presentation-action$=":peek"]')}`), false, "the card uses its own operations");
  const dialog = "dialog[data-position-dialog][open]", choice = dialog + " [data-position-offer]";
  const click = async (kind: string) => {
    const action = row + ' [data-presentation-action$=":' + kind + '"]';
    if (!await b.evaluate(visible(action))) {
      await b.evaluate(`${q(action)}.closest("details").querySelector("summary").setAttribute("data-test-card-menu", "")`);
      await b.click("[data-test-card-menu]");
    }
    await b.click(action);
    await b.waitFor(visible(dialog));
  };
  const confirms: string[] = [];
  await b.command("Network.enable", {}, b.sessionId);
  t.after(b.on("Network.requestWillBeSent", params => {
    const request = params.request as { url: string; postData?: string };
    if (request.postData && JSON.parse(request.postData).offer?.intent === "confirm") confirms.push(new URL(request.url).pathname);
  }));
  await click("place");
  await select(choice, "Use the original here");
  await b.click(dialog + ' [data-position-offer="confirm"]');
  await b.waitFor(`${q("[data-toast]")}?.textContent.includes("Use the original here") && !${q(dialog)}`);
  const related = await b.web.get<{ items: PlacementRelatedItem[] }>("/projects/" + target.project_id + "/api/placement/related?project_id=" + target.project_id);
  assert.ok(related.items.some(item => item.object.id === goal.goal_id && item.object.project_id === projectId));
  await click("hand_off");
  await b.waitFor(`document.querySelectorAll(${JSON.stringify(choice)}).length > 1`);
  await select(choice, "Pages");
  await b.click(dialog + ' [data-position-offer="confirm"]');
  await b.waitFor(`${q("[data-toast]")}?.textContent.includes("已转成") && !${q(dialog)}`);
  const pages = openPagesStore(b.homeDirectory);
  try { assert.ok(pages.list(projectId).some(page => page.title === title)); } finally { pages.close(); }
  assert.ok(await b.evaluate(`${q(row)}?.textContent.includes(${JSON.stringify(title)})`));
  assert.deepEqual(confirms, [prefix + "/api/host/surface-home", prefix + "/api/host/surface-home"]);
});
