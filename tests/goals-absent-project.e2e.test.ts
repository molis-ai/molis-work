import assert from "node:assert/strict";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
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
  const page = await b.evaluate<{ surface: string | null; tile: string | null; open: number; goalNodes: number; errors: string[] }>(`new Promise(resolve => setTimeout(() => resolve({
    surface: document.querySelector('[data-desktop-surface]')?.getAttribute('data-desktop-surface') ?? null,
    tile: document.querySelector('[data-plugin-tile="goals"]')?.className ?? null,
    open: document.querySelectorAll('dialog[open]').length,
    goalNodes: document.querySelectorAll('#molis-work-data, [data-goal-canvas-shell], [data-goal-frame-surface], [data-create-dialog], [data-goal-trash-dialog]').length,
    errors: window.__errors }), 1500))`);
  assert.equal(page.surface, "home", "the page opens on the project's home");
  assert.match(page.tile ?? "", /is-available/, "Goals is one to add, not one the project has");
  assert.equal(page.open, 0, "the link opened no dialog");
  assert.equal(page.goalNodes, 0, "an absent owner supplies no Goal data, canvas or dialogs");
  assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, c => c.projectPluginMembership(project.project_id).plugins.includes("goals")), false);
  assert.deepEqual(page.errors, [], "the page's program did not fail");
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project.project_id}/` }, b.sessionId));
  await b.click('[data-plugin-strip] [data-plugin-id="pages"]');
  await b.waitFor("document.body.dataset.desktopSurface === 'pages'");
  await b.reloadPage();
  await b.waitFor("document.body.dataset.desktopSurface === 'pages'");
  assert.deepEqual(await b.evaluate("window.__errors"), [], "personal navigation and its restored tab remain usable without Goals");
});

test("RAC-400 Goals added again from the plugin list to a project without it opens as in any other project, and takes the lock off again", { timeout: 240_000 }, async t => {
  const b = await openGoalBrowser(t, "user");
  if (!b) return;
  const project = await createProjectWithoutGoals(b.homeDirectory);
  await b.command("Page.addScriptToEvaluateOnNewDocument", { source: RECORD_ERRORS }, b.sessionId);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project.project_id}/` }, b.sessionId));
  await b.waitFor("Boolean(document.querySelector('[data-plugin-tile=\"goals\"]'))");
  await b.navigate(() => b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').click(); true"));
  await b.waitFor("document.querySelector('[data-plugin-tile=\"goals\"]').classList.contains('is-kept')");
  assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, c => c.projectPluginMembership(project.project_id).plugins.includes("goals")), true);
  assert.equal(await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').disabled"), false,
    "the agreement was taken back, so the project may remove it again");
  await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] > .plugin-rail-item').click(); true");
  await b.waitFor("document.querySelector('[data-desktop-surface]')?.getAttribute('data-desktop-surface') === 'goals'");
  assert.deepEqual(await b.evaluate("window.__errors"), [], "the page's program did not fail");
  await b.evaluate("document.querySelector('[data-create-dialog][open]')?.close(); true");
  await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').click(); true");
  await b.waitFor("document.querySelector('[data-plugin-tile=\"goals\"]').classList.contains('is-confirming')");
  await b.navigate(() => b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').click(); true"));
  await b.waitFor("document.querySelector('[data-plugin-tile=\"goals\"]').classList.contains('is-available') && document.body.dataset.desktopSurface === 'home'");
  assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, c => c.projectPluginMembership(project.project_id).plugins.includes("goals")), false);
  assert.equal(await b.evaluate("document.querySelectorAll('#molis-work-data, [data-goal-canvas-shell], [data-goal-frame-surface], [data-create-dialog], [data-goal-trash-dialog]').length"), 0);
  assert.deepEqual(await b.evaluate("window.__errors"), [], "taking Goals away also keeps the platform page usable");
  await b.navigate(() => b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] [data-plugin-toggle]').click(); true"));
  await b.waitFor("document.querySelector('[data-plugin-tile=\"goals\"]').classList.contains('is-kept')");
  await b.evaluate("document.querySelector('[data-plugin-tile=\"goals\"] > .plugin-rail-item').click(); true");
  await b.waitFor("document.body.dataset.desktopSurface === 'goals' && Boolean(document.querySelector('#molis-work-data'))");
  assert.equal(await withMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory }, c => c.projectPluginMembership(project.project_id).plugins.includes("goals")), true);
  assert.deepEqual(await b.evaluate("window.__errors"), [], "adding Goals after removal rebuilds the real owner controller");
});
