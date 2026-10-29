import assert from "node:assert/strict";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createProjectWithoutGoals } from "./fixtures/goals-agreement.js";

// ac-trust T3b (RAC-400, specs/repository-anti-corruption/slices/ac-trust-install.md §3.4.1), in a real browser: the person took back the
// agreement that keeps Goals in every project, and a project made after that has no Goals. Its page opens on its home and offers no Goals;
// a link to a Goal opens nothing; Goals is one to add again from the plugin list, and added, it opens as in any other project.

const RECORD_ERRORS = "window.__errors = []; addEventListener('error', event => window.__errors.push(String(event.message))); addEventListener('unhandledrejection', event => window.__errors.push(String(event.reason)));";

test("RAC-400 a project without Goals opens on its home, offers no Goals and opens no Goal from a link, without a page error", { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, "user");
  if (!b) return;
  const project = await createProjectWithoutGoals(b.homeDirectory);
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_ERRORS }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project.project_id}/?openPlugin=goals&openItem=goal-x&openGoalView=work` }, b.sessionId));
  await b.waitFor("Boolean(document.querySelector('[data-plugin-tile]'))");
  const page = await b.evaluate<{ surface: string | null; tile: string | null; open: number; errors: string[] }>(`new Promise(resolve => setTimeout(() => resolve({
    surface: document.querySelector('[data-desktop-surface]')?.getAttribute('data-desktop-surface') ?? null,
    tile: document.querySelector('[data-plugin-tile="goals"]')?.className ?? null,
    open: document.querySelectorAll('dialog[open]').length, errors: window.__errors }), 1500))`);
  assert.equal(page.surface, "home", "the page opens on the project's home");
  assert.match(page.tile ?? "", /is-available/, "Goals is one to add, not one the project has");
  assert.equal(page.open, 0, "the link opened no dialog");
  assert.deepEqual(page.errors, [], "the page's program did not fail");
});

test("RAC-400 Goals added again from the plugin list to a project without it opens as in any other project, and takes the lock off again", { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, "user");
  if (!b) return;
  const project = await createProjectWithoutGoals(b.homeDirectory);
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_ERRORS }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project.project_id}/` }, b.sessionId));
  await b.waitFor("Boolean(document.querySelector('[data-plugin-tile=\"goals\"]'))");
  await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').click(); true");
  await b.waitFor("document.querySelector('[data-plugin-tile=\"goals\"]').classList.contains('is-kept')");
  assert.equal(await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').disabled"), false,
    "the agreement was taken back, so the project may remove it again");
  await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] > .plugin-rail-item').click(); true");
  await b.waitFor("document.querySelector('[data-desktop-surface]')?.getAttribute('data-desktop-surface') === 'goals'");
  assert.deepEqual(await b.evaluate("window.__errors"), [], "the page's program did not fail");
});
