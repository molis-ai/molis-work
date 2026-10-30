import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlanningMethodPack } from "@molis-ai/molis-work-plugin-goals/contract";
import { DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { boardSnapshot } from "./fixtures/goal-application.js";

// About 16 s on a development Mac; past 60 s on the loaded Linux CI runner. The budget only stops a hang.
for (const width of [1440, 390]) test(`Planning ${width}px copies a template, recovers failed saves and adopts an independent project version`, { timeout: 180_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { origin, projectId, store, before, command, sessionId, evaluate, waitFor, click, reloadPage, navigate } = browser;
  assert.ok(projectId);
  const prefix = "/projects/" + projectId;
  const globalApi = "/api/settings/planning-methods";
  const projectApi = prefix + globalApi;
  const read = async (path: string) => (await (await fetch(origin + path)).json()) as { methods: PlanningMethodPack[]; composition?: { method_pack_ids: string[] } };
  const original = await read(globalApi);
  const id = "domain-software-development";
  const template = original.methods.find(x => x.method_id === id)!;
  assert.equal(template.scope, "built_in");
  await command("Network.enable", {}, sessionId);
  await command("Emulation.setDeviceMetricsOverride", { width, height: width === 390 ? 844 : 1100, deviceScaleFactor: 1, mobile: width === 390 }, sessionId);
  // Planning settings open in the workbench (specs/artifact-positioning S6); a page inside them opens in place, and a save
  // reloads the workbench on the page it returns to.
  await navigate(() => command("Page.navigate", { url: origin + "/settings/planning" }, sessionId));
  await command("Page.bringToFront", {}, sessionId);
  const dom = (selector: string) => "document.querySelector(" + JSON.stringify(selector) + ")";
  await waitFor("document.readyState === 'complete' && " + dom('[data-work-surface=settings] [data-planning-filter="mine"]'), 15_000);
  assert.equal(await evaluate("location.pathname"), prefix + "/");
  await click('[data-planning-filter="mine"]');
  assert.equal(await evaluate(dom("[data-planning-filter-empty]") + ".hidden"), false);
  await click('[data-planning-filter="domain"]');
  assert.equal(await evaluate("Array.from(document.querySelectorAll('[data-planning-method]')).filter(x=>!x.hidden).every(x=>x.dataset.kind==='domain')"), true);
  await click('a[href="/settings/planning/' + id + '"]');
  await waitFor(dom("[data-work-surface=settings] .planning-detail"), 15_000);
  await click(".planning-detail-header .mw-btn--primary");
  await waitFor(dom("[data-work-surface=settings] [data-planning-edit-form]"), 15_000);
  assert.equal(await evaluate(dom("[data-planning-edit-form]") + ".dataset.saveScope"), "personal");
  const row = '[data-planning-row-list="steps"] [data-planning-row]';
  const count = await evaluate<number>("document.querySelectorAll(" + JSON.stringify(row) + ").length");
  await click('.planning-edit-section.form-disclosure > summary');
  // The natural-height disclosure clips its children while opening. Wait until it contains the last control before
  // the click helper scrolls that control into view; scrolling during the clipped phase leaves it below the viewport.
  await waitFor(`(() => { const button = document.querySelector('[data-add-planning-row="steps"]');
    const disclosure = button.closest('details');
    return disclosure.open && disclosure.getBoundingClientRect().bottom >= button.getBoundingClientRect().bottom; })()`);
  await click('[data-add-planning-row="steps"]');
  assert.equal(await evaluate("document.activeElement.name"), "steps");
  assert.equal(await evaluate("document.querySelectorAll(" + JSON.stringify(row) + ").length"), count + 1);
  await click(row + ":last-child [data-remove-planning-row]");
  const values = { name: 'Browser method "<safe>', summary: "Verified browser method", instructions: "Read all instructions.\nKeep the original template.",
    applies_to: "Delivery, Validation", domain_tags: "software, reliability", confidence: "0.9", source_refs: "project://requirements.md\nproject://validation.md" };
  await evaluate("(() => { const form = document.querySelector('[data-planning-edit-form]'); for (const [name,value] of Object.entries(" +
    JSON.stringify(values) + ")) { const input=form.elements.namedItem(name); input.value=value; input.dispatchEvent(new Event('input',{bubbles:true})); } return true; })()");
  const submit = '[data-planning-edit-form] button[type="submit"]';
  await command("Network.setBlockedURLs", { urls: [origin + globalApi] }, sessionId);
  await click(submit);
  await waitFor(dom("[data-planning-method-error]") + "?.hidden === false && !" + dom(submit) + ".disabled");
  assert.equal(await evaluate(dom('[name="name"]') + ".value"), values.name);
  assert.deepEqual(await read(globalApi), original);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click(submit));
  await waitFor("document.readyState === 'complete' && " + dom("[data-work-surface=settings] .planning-detail"), 15_000);
  const saved = (await read(globalApi)).methods.find(x => x.method_id === id)!;
  assert.equal(saved.scope, "personal");
  assert.deepEqual(saved.event_types, template.event_types);
  assert.deepEqual(saved.default_requirements, template.default_requirements);
  assert.equal(saved.version, 1);
  assert.equal(saved.name, values.name);
  assert.equal(saved.instructions, values.instructions);
  assert.equal(saved.summary, values.summary);
  assert.equal(saved.confidence, 0.9);
  assert.deepEqual(saved.applies_to, ["Delivery", "Validation"]);
  assert.deepEqual(saved.domain_tags, ["software", "reliability"]);
  assert.deepEqual(saved.source_refs, ["project://requirements.md", "project://validation.md"]);
  assert.deepEqual(saved.steps, template.steps);
  assert.deepEqual(saved.required_coverage.map(x => ({ label: x.label, question: x.question })),
    template.required_coverage.map(x => ({ label: x.label, question: x.question })));
  assert.deepEqual(saved.evidence_requirements, template.evidence_requirements);
  assert.deepEqual(saved.completion_checks, template.completion_checks);
  assert.deepEqual(saved.failure_modes, template.failure_modes);
  assert.deepEqual((await read(globalApi)).methods.filter(x => x.method_id !== id), original.methods.filter(x => x.method_id !== id));
  await reloadPage();
  await waitFor(dom("[data-work-surface=settings] .planning-detail h1"), 15_000);
  assert.equal(await evaluate(dom(".planning-detail h1") + ".textContent"), values.name);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/planning" }, sessionId));
  await waitFor(dom('[data-work-surface=project-settings] [data-adopt-planning-method="' + id + '"]'), 15_000);
  const projectBefore = await read(projectApi);
  const unconfirmed = await evaluate<{ status: number; error: string }>("(async()=>{const response=await fetch(" + JSON.stringify(projectApi + "/apply") +
    ",{method:'POST',headers:globalThis.molisWorkControlHeaders(),body:JSON.stringify({method_id:" + JSON.stringify(id) +
    "})});return {status:response.status,...await response.json()};})()");
  assert.equal(unconfirmed.status, 400);
  assert.match(unconfirmed.error, /必须由用户确认/);
  assert.deepEqual(await read(projectApi), projectBefore);
  const adopt = '[data-adopt-planning-method="' + id + '"]';
  await command("Network.setBlockedURLs", { urls: [origin + projectApi + "/apply"] }, sessionId);
  await click(adopt);
  await waitFor(dom("[data-planning-adoption-error]") + "?.hidden === false && !" + dom(adopt) + ".disabled");
  assert.deepEqual(await read(projectApi), projectBefore);
  await command("Network.setBlockedURLs", { urls: [] }, sessionId);
  await navigate(() => click(adopt));
  await waitFor("document.readyState === 'complete' && !" + dom(adopt) + " && " + dom("[data-work-surface=project-settings] .planning-composition-row"), 15_000);
  const adopted = (await read(projectApi)).methods.find(x => x.method_id === id)!;
  assert.equal(adopted.scope, "project");
  assert.equal(adopted.version, 1);
  assert.equal(adopted.instructions, saved.instructions);
  assert.equal(adopted.name, saved.name);
  assert.ok(saved.event_types.length > 0);
  assert.ok(saved.default_requirements.length > 0);
  assert.deepEqual(adopted.event_types, saved.event_types);
  assert.deepEqual(adopted.default_requirements, saved.default_requirements);
  assert.equal((await read(projectApi)).methods.filter(x => x.method_id === id).length, 1);
  await click('.planning-composition-row[data-planning-detail-path="' + prefix + '/settings/planning/' + id + '"]');
  await waitFor(dom('[data-planning-split="detail"] .planning-detail'));
  await waitFor("document.readyState === 'complete' && " + dom(".planning-detail"));
  await click("[data-planning-detail] .planning-detail-header .mw-btn--primary");
  await waitFor("document.readyState === 'complete' && " + dom("[data-planning-edit-form]"));
  await click('[name="enabled"]');
  await navigate(() => click(submit));
  await waitFor("document.readyState === 'complete' && " + dom("[data-work-surface=project-settings] .planning-detail"), 15_000);
  const disabled = (await read(projectApi)).methods.find(x => x.method_id === id)!;
  assert.equal(disabled.enabled, false);
  assert.deepEqual(disabled.event_types, saved.event_types);
  assert.deepEqual(disabled.default_requirements, saved.default_requirements);
  assert.equal(disabled.version, 2);
  assert.deepEqual((await read(globalApi)).methods.find(x => x.method_id === id), saved);
  await click(".planning-back");
  await waitFor(dom("[data-work-surface=project-settings] .planning-inactive-section"), 15_000);
  assert.equal((await read(projectApi)).composition!.method_pack_ids.includes(id), false);
  await reloadPage();
  await waitFor(dom("[data-work-surface=project-settings] .planning-inactive-section"), 15_000);
  assert.ok(await evaluate(dom(".planning-inactive-section") + "?.textContent.includes(" + JSON.stringify(values.name) + ")"));
  const after = boardSnapshot(store, DEMO_PROJECT_ID);
  assert.deepEqual(after.goals, before.goals);
  assert.deepEqual(after.relations, before.relations);
  assert.deepEqual(after.runs, before.runs);
  if (process.env.MOLIS_WORK_TEST_CAPTURE) {
    const captures = await mkdtemp(join(tmpdir(), "molis-work-gw5-planning-"));
    for (const [name, width, height] of [["desktop", 1440, 1100], ["mobile", 390, 844]] as const) {
      await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: name === "mobile" }, sessionId);
      await evaluate("window.scrollTo(0,0); new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
      const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      await writeFile(join(captures, name + ".png"), Buffer.from(data, "base64"));
    }
    t.diagnostic("Planning screenshots: " + captures);
  }
});

for (const late of ["success", "failure"] as const) test(`W2-18-PLANNING-LATE-01 late A ${late} cannot replace B's draft, reopen a closed detail, or write after teardown`, { timeout: 60_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const { origin, projectId, web, command, sessionId, navigate, evaluate, waitFor, click } = browser;
  assert.ok(projectId);
  const prefix = "/projects/" + projectId, a = "domain-software-development", b = "domain-data-analysis";
  for (const id of [a, b]) await web.post(prefix + "/api/settings/planning-methods/apply", { method_id: id, user_confirmed: true });
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false }, sessionId);
  await navigate(() => command("Page.navigate", { url: origin + prefix + "/settings/planning" }, sessionId));
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] .work-planning')", 15_000);
  const pathA = prefix + "/settings/planning/" + a, pathB = prefix + "/settings/planning/" + b;
  const openA = '.planning-composition-row[data-planning-detail-path="' + pathA + '"]';
  const openB = '.planning-composition-row[data-planning-detail-path="' + pathB + '"]';
  await evaluate(`(() => { const original=window.fetch; window.__planningArm=true; window.__planningWaiting=false; window.__planningFinished=false;
    window.fetch=async(url,options)=>{
      if(new URL(String(url),location.origin).pathname !== ${JSON.stringify(pathA)} || !window.__planningArm) return original(url,options);
      window.__planningArm=false;
      // A real response whose consumer cannot cancel it: both the old and fixed client receive the same late transport.
      const {signal,...request}=options||{}; const response=await original(url,request);
      window.__planningWaiting=true; await new Promise(resolve=>window.__planningRelease=resolve); window.__planningFinished=true;
      ${late === "failure" ? "throw new Error('late A failure');" : "return response;"}
    };
  })()`);
  const arm = () => evaluate("window.__planningArm=true; window.__planningWaiting=false; window.__planningFinished=false");
  const release = async () => {
    await evaluate("window.__planningRelease()"); await waitFor("window.__planningFinished");
    await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  };
  await click(openA); await waitFor("window.__planningWaiting");
  await click('[data-planning-close]');
  await click(openB); await waitFor("!!document.querySelector('[data-planning-detail] .planning-detail')");
  await click('[data-planning-detail] .planning-detail-header .mw-btn--primary');
  await waitFor("document.querySelector('[data-planning-edit-form] [name=method_id]')?.value === " + JSON.stringify(b));
  await evaluate("document.querySelector('[data-planning-edit-form] [name=name]').value='Keep the B draft'");
  await release();
  assert.equal(await evaluate("document.querySelector('[data-planning-edit-form] [name=name]')?.value"), "Keep the B draft");
  assert.equal(await evaluate("!!document.querySelector('[data-planning-detail] .mw-empty--error')"), false);

  await click('[data-planning-detail] .planning-edit-footer a');
  await waitFor("!!document.querySelector('[data-planning-detail] .planning-back')");
  await click('[data-planning-detail] .planning-back');
  await arm(); await click(openA); await waitFor("window.__planningWaiting");
  await click('[data-planning-close]');
  assert.equal(await evaluate("document.querySelector('.work-planning').dataset.planningSplit"), "hero");
  await release();
  assert.equal(await evaluate("document.querySelector('[data-planning-detail]').childElementCount"), 0);
  assert.equal(await evaluate("document.querySelector('.work-planning').dataset.planningSplit"), "hero");

  await arm(); await click(openA); await waitFor("window.__planningWaiting");
  await evaluate(`window.__removedPlanning=document.querySelector('.work-planning');
    document.dispatchEvent(new CustomEvent('molis-work:open-settings-path',{detail:{href:${JSON.stringify(prefix + "/settings/general")}}}))`);
  await waitFor("!!document.querySelector('[data-work-surface=project-settings] [data-project-rename]')", 15_000);
  assert.equal(await evaluate("window.__removedPlanning.isConnected"), false);
  await release();
  assert.equal(await evaluate("!!window.__removedPlanning.querySelector('.planning-detail,.planning-edit,.mw-empty--error')"), false);
  assert.equal(await evaluate("!!document.querySelector('[data-work-surface=project-settings] .planning-edit')"), false);
});
