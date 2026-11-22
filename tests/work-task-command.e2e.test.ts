import assert from "node:assert/strict";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { ActionError, defineBackgroundTasksAction } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";

test("QEA-17 a project task uses the owner's new command input and returns a successful attempt to a fresh identical offer", { timeout: 120_000 }, async t => {
  let revision = 1;
  const plugin = backgroundPlugin(() => ({ source: { surface: "example", title: "Example", icon: "list" }, tasks: [{
    subject: { kind: "homebg_task", id: "export" }, title: "Export notes", state: "running", details: [], waiting: false,
    updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "Example" }, serves: [], scope: "project", decisions: [], open: null,
    commands: [{ role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: { job: `export-${revision}` }, summary: "Export notes" }],
  }] }));
  // One provider can declare several task sources: failure of its other list does not stale this list's current offer.
  const other = defineBackgroundTasksAction("homebg.other-tasks", 1, ["homebg_task"], "Other tasks", ["homebg:read"]);
  const definition: PluginDefinition = { ...plugin.definition, manifest: { ...plugin.definition.manifest, actions: [...plugin.definition.manifest.actions!, other] },
    async start(context) {
      const contribution = await plugin.definition.start(context);
      return { ...contribution, actions: [...contribution.actions!, { ...other, async handle() { throw new ActionError("example.other_unavailable", "Other list unavailable"); } }] };
    } };
  const b = await openGoalBrowser(t, "empty", undefined, null, undefined, undefined, {}, { project: [definition] });
  assert.ok(b); assert.ok(b.localHost);
  await b.setViewport(1440, 900);
  const project = await createProject(b.web, "Command owner");
  await startProjectPlugins(b.localHost, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${project.project_id}/` }, b.sessionId));
  // POLISH-17: 在办 is the one way in to the background tasks; the key inside the input opens the conversation on that list.
  await b.waitFor("document.querySelector('[data-work-counts] [data-work-list=\"now\"]')", 15_000);
  await b.evaluate("document.querySelector('[data-work-counts] [data-work-list=\"now\"]').click()");
  const stop = "[data-work-lists] [data-task-control=stop]";
  await b.waitFor(`document.querySelector('${stop}')`);
  await b.evaluate(`window.__taskReads = []; window.__taskCommands = []; document.addEventListener('molis-work:attention', event => window.__taskReads.push(event.detail.tasks));
    const fetchBefore = window.fetch; window.fetch = function(input, init) { if (String(input).endsWith('/api/mainline/tasks/command')) window.__taskCommands.push(JSON.parse(init.body)); return fetchBefore.apply(this, arguments); };`);
  // Only the command input changes. A partial cache key using commands.length misses it.
  revision = 2;
  await b.evaluate("document.dispatchEvent(new CustomEvent('molis-work:attention-refresh'))");
  await b.waitFor("window.__taskReads.some(read => read?.tasks.some(task => task.commands.some(command => command.input.job === 'export-2')))");
  assert.equal(await b.evaluate("window.__taskReads.at(-1).issues.some(issue => issue.source.capability_id === 'homebg.other-tasks')"), true);
  await b.click(stop);
  await b.waitFor("window.__taskCommands.length === 1");
  assert.equal(await b.evaluate("window.__taskCommands[0].command.input.job"), "export-2", "the actual command request uses the current owner input");
  await b.waitFor(`document.querySelector('${stop}')?.disabled === false`, 15_000);
  assert.deepEqual(plugin.state.stops, [{ project: project.project_id, job: "export-2" }]);
  // The provider immediately offers the same command again; no received snapshot ever omits it.
  await b.click(stop);
  await b.waitFor(`window.__taskCommands.length === 2 && document.querySelector('${stop}')?.disabled === false`, 15_000);
  assert.deepEqual(plugin.state.stops, [{ project: project.project_id, job: "export-2" }, { project: project.project_id, job: "export-2" }]);
  // Even if performance.now() is coarse/frozen (WKWebView 1ms resolution), monotonic attention sequence still unlocks the stop button.
  await b.evaluate("const frozen = performance.now(); performance.now = () => frozen;");
  await b.click(stop);
  await b.waitFor(`window.__taskCommands.length === 3 && document.querySelector('${stop}')?.disabled === false`, 15_000);
  assert.deepEqual(plugin.state.stops, [
    { project: project.project_id, job: "export-2" },
    { project: project.project_id, job: "export-2" },
    { project: project.project_id, job: "export-2" },
  ]);
});
