import assert from "node:assert/strict";
import test from "node:test";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { CURRENT_WORK } from "./fixtures/assistant-current-work.js";
import { openWork, putInput, readWork, seedWork, sendBrowser, waitWork } from "./fixtures/assistant-send-journey.js";

// specs/proactive-assistant §12.1 「默认跟随当前项目，允许固定查看某项工作，固定状态与工作归属必须明显」. Before, the work in front was
// one key for the whole Home: a work opened in project A stayed on the bar in project B, and a line typed there reached A's round.
test("§12.1: each project keeps its own work in the bar, and a work opened from elsewhere names where it belongs", { timeout: 180_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { evaluate, waitFor, navigate, command, sessionId, origin, projectId, web, click } = browser;
  const other = (await createProject(web, "另一个项目")).project_id;
  const visit = async (id: string) => {
    await navigate(() => command("Page.navigate", { url: `${origin}/projects/${id}` }, sessionId));
    await waitFor("!!document.querySelector('[data-assistant-island]') && !!document.querySelector('.workbench-bar')", 20_000);
  };
  const chip = () => evaluate<string | null>(`(() => { const wrap = document.querySelector('[data-assistant-target-wrap]');
    return wrap.hidden || wrap.dataset.mode === 'new' ? null : document.querySelector('[data-assistant-target-label]').textContent; })()`);
  const typed = () => evaluate<string>("document.querySelector('[data-assistant-input]').value");
  const TITLE = "A 项目的工作";

  const work = await seedWork(browser, TITLE);
  await visit(projectId);
  await openWork(browser, work);
  assert.equal(await chip(), `继续：${TITLE}`, "in its own project the work needs no place named");

  // Another project starts from its own: nothing of A's on the bar, in the tabs or waiting to be sent to.
  await visit(other);
  assert.equal(await evaluate(CURRENT_WORK), null);
  await waitFor("document.querySelector('[data-assistant-target-wrap]').dataset.mode === 'new'");
  assert.equal(await chip(), null, "A's work does not follow the person into B");
  assert.ok(!String(await evaluate(`localStorage.getItem(${JSON.stringify(`molis.assistant.tabs:${other}`)})`)).includes(work), "nor do its tabs");

  // What is said here starts a work here, and A's work does not hear it.
  const before = (await readWork(browser, work)).rounds.length;
  await putInput(browser, "在 B 里说的一句");
  await click("[data-assistant-send]");
  await waitFor(`!!${CURRENT_WORK}`, 15_000);
  const inOther = await evaluate<string>(CURRENT_WORK);
  assert.notEqual(inOther, work);
  const said = await waitWork(browser, inOther, view => view.work.state === "completed");
  assert.deepEqual(said.work.scope, { kind: "project", project_id: other });
  assert.equal((await readWork(browser, work)).rounds.length, before, "A's work has no new round");

  // Back in A, the person is where they left it.
  await visit(projectId);
  await waitFor(`${CURRENT_WORK} === ${JSON.stringify(work)} && document.querySelector('[data-assistant-target-label]').textContent.includes(${JSON.stringify(TITLE)})`);
  assert.equal(await chip(), `继续：${TITLE}`);

  // Opening A's work from B on purpose is allowed, and the bar opens with where the next line goes, because little of it fits; the tooltip has it all.
  await visit(other);
  await openWork(browser, work);
  const place = (await readWork(browser, work)).work.scope_title;
  assert.ok(place);
  await waitFor(`document.querySelector('[data-assistant-target-label]').textContent === ${JSON.stringify(`${place} · ${TITLE}`)}`);
  assert.match(await evaluate<string>("document.querySelector('[data-assistant-target]').title"), new RegExp(`^继续：${place} · ${TITLE}\\n`));
  // The panel, which says the same, hides the chip; once it is closed the chip is there at phone width too.
  await click("[data-assistant-panel-close]");
  await waitFor("document.querySelector('[data-assistant-panel]').hidden");
  await evaluate("document.activeElement?.blur?.()");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 780, deviceScaleFactor: 1, mobile: false }, sessionId);
  await waitFor("document.querySelector('[data-assistant-target-label]').getBoundingClientRect().width > 0");
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await evaluate("document.querySelector('[data-assistant-target-clear]').click()");
  await waitFor("document.querySelector('[data-assistant-target-wrap]').dataset.mode === 'new'");

  // The words of a new work stay in the project they were written in.
  await visit(projectId);
  await evaluate("document.querySelector('[data-assistant-target-clear]').click()");
  await putInput(browser, "只想在 A 里新开的一件事");
  await waitFor(`localStorage.getItem(${JSON.stringify(`molis.assistant.new-draft:${projectId}`)}) === '只想在 A 里新开的一件事'`);
  await visit(other);
  assert.equal(await typed(), "", "they do not come along");
  await visit(projectId);
  assert.equal(await typed(), "只想在 A 里新开的一件事", "and are there on the way back");

  // The chooser, where the project in view changes without a new page, follows the same memory.
  await openWork(browser, work);
  await navigate(() => command("Page.navigate", { url: `${origin}/` }, sessionId));
  await waitFor("!!document.querySelector('.chooser')");
  await click(`#row-${projectId}`);
  await waitFor(`document.querySelector('[data-assistant-target-label]').textContent === ${JSON.stringify(`继续：${TITLE}`)}`);
  await click(`#row-${other}`);
  await waitFor("document.querySelector('[data-assistant-target-wrap]').dataset.mode === 'new'");
  assert.equal(await chip(), null, "selecting another project takes A's work off the bar");
});

test("§12.1: a personal work started on a project page stays that project's, and says it is personal", { timeout: 120_000 }, async t => {
  const browser = await sendBrowser(t); if (!browser) return;
  const { waitFor, navigate, command, sessionId, origin, projectId, evaluate } = browser;
  const work = await seedWork(browser, "我个人的一件事", "personal");
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}` }, sessionId));
  await waitFor("!!document.querySelector('[data-assistant-island]') && !!document.querySelector('.workbench-bar')", 20_000);
  await openWork(browser, work);
  await waitFor(`document.querySelector('[data-assistant-target-label]').textContent === '个人 · 我个人的一件事'`);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}` }, sessionId));
  await waitFor("!!document.querySelector('[data-assistant-island]')", 20_000);
  assert.equal(await evaluate(CURRENT_WORK), work, "a reload keeps it in front");
});
