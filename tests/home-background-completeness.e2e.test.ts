import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { addProjectPlugin, createProject } from "@molis-ai/molis-work-test-kit/local-host-http";
import { backgroundPlugin } from "./fixtures/home-background-plugin.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startProjectPlugins } from "./fixtures/plugin-callers.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";

test("QEA-15/16 QEA-169 Home keeps partial background work visible and retries only the read, in both languages and themes", { timeout: 180_000 }, async t => {
  let mode: "failed" | "partial" | "complete" | "empty" = "failed", healthyProject = "", otherProject = "";
  const plugin = backgroundPlugin(project => {
    if (mode === "failed" || mode === "partial" && project !== healthyProject) throw new ActionError("example.read_failed", "private-provider-diagnostic");
    return { source: { surface: "example", title: "Example", icon: "list" }, tasks: mode === "empty" ? [] : [{
      subject: { kind: "homebg_task", id: project }, title: "Export customer notes", state: "running", details: [], waiting: false,
      updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "Example" }, serves: [], scope: "project", commands: [], decisions: [], open: null,
    }] };
  });
  const b = await openGoalBrowser(t, "empty", undefined, null, undefined, undefined, {}, { project: [plugin.definition] });
  assert.ok(b, "QEA-15 needs the isolated test browser");
  assert.ok(b.localHost);
  for (const name of ["Alpha", "Beta"]) {
    const project = await createProject(b.web, name);
    if (name === "Alpha") healthyProject = project.project_id;
    else { otherProject = project.project_id; await addProjectPlugin(b.web, otherProject, "goals"); }
    await startProjectPlugins(b.localHost, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  }
  const go = (path: string) => b.navigate(() => b.command("Page.navigate", { url: b.origin + path }, b.sessionId));
  const list = "document.querySelector('[data-background-tasks-list]')";
  const problem = "[data-background-tasks-problem]", retry = "[data-background-tasks-retry]";
  const waitRows = (count: number, incomplete: boolean) => b.waitFor(`${list}?.querySelectorAll('.background-task').length === ${count} && Boolean(${list}?.querySelector('${problem}')) === ${incomplete}`, 15_000);
  const refresh = () => b.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await go("/");
  await b.click(`.chooser-list [data-id="${healthyProject}"]`);
  await b.waitFor(`document.body.dataset.projectId === ${JSON.stringify(healthyProject)}`);
  await b.waitFor(`document.querySelector('${retry}')`);
  await b.click('[data-side-tab="tasks"]');
  await b.waitFor("document.body.dataset.sideOpen === 'true'");
  await waitRows(0, true);
  assert.equal(await b.evaluate(`${list}.querySelectorAll('${problem}').length`), 1);
  assert.equal(await b.evaluate(`${list}.querySelector('.side-tasks-empty') === null`), true, "failure must not be shown as no work");
  assert.equal(await b.evaluate(`${list}.textContent.includes('private-provider-diagnostic') || ${list}.textContent.includes('example.read_failed')`), false);
  const calls = plugin.state.calls.length;
  await b.click(retry);
  await b.waitFor(`!document.querySelector('${retry}').disabled`);
  assert.ok(plugin.state.calls.length > calls, "retry reached the real provider even when its failure stayed the same");

  mode = "partial";
  await b.click(retry); await waitRows(1, true);
  assert.match(await b.evaluate<string>(`${list}.textContent`), /Alpha/);
  assert.equal(await b.evaluate("document.querySelector('[data-side-tab=tasks]').parentElement.querySelector('[data-background-tasks-count]').textContent"), "1+");
  mode = "complete";
  await b.web.post(`/projects/${otherProject}/api/plugins/io.molis.work.goals/goals`,
    { title: "Another project updates Home", idempotency_key: "QEA-169-home-invalidation" });
  await waitRows(2, false);
  assert.match(await b.evaluate<string>(`${list}.textContent`), /Beta/);
  assert.equal(await b.evaluate("document.querySelector('[data-side-tab=tasks]').parentElement.querySelector('[data-background-tasks-count]').textContent"), "2");
  mode = "failed"; await refresh(); await waitRows(0, true);
  mode = "empty"; await b.click(retry); await waitRows(0, false);
  assert.equal(await b.evaluate(`${list}.querySelector('.side-tasks-empty')?.textContent`), "现在没有后台任务");

  mode = "partial";
  const evidence = `${REVIEW_EVIDENCE}/quality-experience-audit`;
  await mkdir(evidence, { recursive: true });
  for (const language of ["zh", "en"]) {
    await go(`/locale?lang=${language}&next=%2F`);
    await b.waitFor(`document.querySelector('${retry}')`);
    await b.click('[data-side-tab="tasks"]');
    await b.waitFor("document.body.dataset.sideOpen === 'true'");
    await waitRows(1, true);
    assert.equal(await b.evaluate(`document.querySelector('${retry}').textContent`), language === "zh" ? "重试" : "Retry");
    for (const width of [1440, 1024, 390]) for (const theme of ["light", "dark"]) {
      await b.setViewport(width, 900);
      await b.command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, b.sessionId);
      await b.waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
      assert.equal(await b.evaluate(`${list}.scrollWidth <= ${list}.clientWidth && document.documentElement.scrollWidth <= innerWidth`), true);
      const shot = await b.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, b.sessionId);
      await writeFile(`${evidence}/background-incomplete-${language}-${width}-${theme}.png`, Buffer.from(shot.data, "base64"));
    }
  }
  assert.ok(plugin.state.calls.every(call => call.query_only));
  assert.deepEqual(plugin.state.stops, [], "retrying the list never sends a task command");
  assert.deepEqual(plugin.state.answers, []);
});

test("QEA-15/16 Home keeps a pending stop disabled across a null attention part, network loss and a partial read", { timeout: 120_000 }, async t => {
  let taskProject = "", partial = false, offered = true, resumed = false;
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), secondEntered = Promise.withResolvers<void>();
  t.after(() => release.resolve());
  const plugin = backgroundPlugin(project => {
    if (partial && project !== taskProject) throw new ActionError("example.read_failed", "private-provider-diagnostic");
    return { source: { surface: "example", title: "Example", icon: "list" }, tasks: project !== taskProject ? [] : [{
      subject: { kind: "homebg_task", id: "export" }, title: "Export notes", state: "running", details: [], waiting: false,
      updated_at: "2026-10-01T10:00:00.000Z", executor: { kind: "plugin", label: "Example" }, serves: [], scope: "project", decisions: [], open: null,
      commands: offered ? [{ role: "stop", action: { capability_id: "homebg.stop", version: 1 }, input: { job: "export" }, summary: "Export notes" }] : [],
    }] };
  });
  plugin.state.stop = async () => { entered.resolve(); if (plugin.state.stops.length === 2) secondEntered.resolve(); await release.promise; offered = resumed; return { stopped: "export" }; };
  const b = await openGoalBrowser(t, "empty", undefined, null, undefined, undefined, {}, { project: [plugin.definition] });
  assert.ok(b); assert.ok(b.localHost);
  for (const name of ["Alpha", "Beta"]) {
    const project = await createProject(b.web, name);
    if (!taskProject) taskProject = project.project_id;
    await startProjectPlugins(b.localHost, molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path }));
  }
  await b.navigate(() => b.command("Page.navigate", { url: b.origin + "/" }, b.sessionId));
  const stop = "[data-background-tasks-list] .background-task-command button";
  const problem = "[data-background-tasks-problem]";
  const rows = "document.querySelectorAll('[data-background-tasks-list] .background-task').length";
  await b.waitFor(`document.querySelector('${stop}')`);
  await b.click('[data-side-tab="tasks"]');
  await b.click(stop); await entered.promise;
  try {
    for (const failure of ["null", "network"] as const) {
      const barrier = await sendBarrier(b, [{ urlPattern: "*/api/attention?*", requestStage: "Response" }]);
      try {
        await b.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
        const paused = await barrier.next();
        if (failure === "network") await barrier.drop(paused);
        else {
          const body = await b.command<{ body: string; base64Encoded: boolean }>("Fetch.getResponseBody", { requestId: paused.requestId }, b.sessionId);
          const data = JSON.parse(body.base64Encoded ? Buffer.from(body.body, "base64").toString() : body.body);
          data.background_tasks = null;
          await b.command("Fetch.fulfillRequest", { requestId: paused.requestId, responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "application/json" }], body: Buffer.from(JSON.stringify(data)).toString("base64") }, b.sessionId);
        }
        await b.waitFor(`document.querySelector('${problem}') && ${rows} === 1`);
        assert.equal(await b.evaluate(`document.querySelector('${stop}').disabled`), true, "a new list presentation must not release a pending command");
        await b.click(stop, { allowDisabled: true });
        assert.equal(plugin.state.stops.length, 1);
      } finally { await barrier.close(); }
    }
    partial = true;
    await b.click('[data-background-tasks-retry]');
    await b.waitFor(`!document.querySelector('[data-background-tasks-retry]').disabled`);
    assert.equal(await b.evaluate(`document.querySelector('${stop}').disabled`), true);
    await b.click(stop, { allowDisabled: true });
    assert.equal(plugin.state.stops.length, 1, "one accepted stop through all read failures");
  } finally { release.resolve(); }
  await b.waitFor(`!document.querySelector('${stop}')`);
  partial = false;
  await b.click('[data-background-tasks-retry]');
  await b.waitFor(`!document.querySelector('${problem}') && ${rows} === 1`);
  assert.equal(plugin.state.stops.length, 1);
  offered = true; // The owner restarted the same task; the same command is legitimate again.
  await b.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await b.waitFor(`document.querySelector('${stop}') && !document.querySelector('${stop}').disabled`);
  resumed = true; // This time it restarts before the next read; the offer never disappears from a received snapshot.
  await b.click(stop); await secondEntered.promise;
  await b.waitFor(`document.querySelector('${stop}') && !document.querySelector('${stop}').disabled`);
  assert.equal(plugin.state.stops.length, 2, "an old successful attempt does not suppress the owner's next offered command");
});
