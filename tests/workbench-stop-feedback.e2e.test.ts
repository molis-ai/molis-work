import assert from "node:assert/strict";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference, type HomeBackgroundTaskRow } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { armResponse, openAuditBrowser, releaseResponse, waitHeld, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

// A public Runtime port around a real disposable child process. No model, shell, user files or global process control.
async function backgroundCommand(browser: AuditBrowser, t: import("node:test").TestContext) {
  assert.ok(browser.localHost);
  const host = browser.localHost, projectId = browser.projectId!;
  await host.ensureWebCatalog(browser.homeDirectory, openMolisWorkProjectCatalog).withCatalog({ homeDirectory: browser.homeDirectory }, catalog => catalog.addProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "audit" }));
  const reference = molisWorkHostProjectReference({ databasePath: browser.databasePath, projectId });
  const store = await host.withProject(reference, runtime => codingSessions(runtime.store));
  const at = new Date().toISOString(), sessionId = "audit-command-session", runtimeId = "audit-command-runtime";
  await store.create(noEffect, { project_id: projectId, session_id: sessionId, title: "Audit background process", runtime_id: runtimeId, at });
  await store.setRuntimeSession(noEffect, projectId, sessionId, sessionId, at); await store.setState(noEffect, projectId, sessionId, "done", at);
  let child: ChildProcess, denied = true, attempts = 0, generation = 0, taskId = "", started = 0;
  const start = async () => {
    child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", cwd: browser.homeDirectory });
    await new Promise<void>((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    taskId = "audit-command-" + ++generation; started = Date.now();
    await store.setBackground(noEffect, projectId, sessionId, [{ task_id: taskId, summary: "Fixture interval process " + taskId, started_at_ms: started }]);
  };
  await start();
  const ended = () => child.exitCode !== null || child.signalCode !== null;
  t.after(async () => { if (ended()) return; const closed = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGKILL"); await closed; });
  const unused = async (): Promise<never> => { throw new Error("This background-only fixture does not start or inspect model runs"); };
  const adapter: AgentRuntimeAdapter = {
    descriptor: { runtime_id: runtimeId, display_name: "Audit process Runtime", provider_version: "1", capabilities: emptyCapabilityMatrix() },
    async health() { return { ok: true, status: "ready", message: "ready" }; },
    createSession: unused, readSession: unused, start: unused, read: unused, control: unused, readCommandOutput: unused,
    observe() { throw new Error("This fixture has no model run to observe"); },
    background: {
      async read(project, session) { assert.equal(project, projectId); return session && session !== sessionId ? [] : [{ task_id: taskId,
        session_id: sessionId, summary: "Fixture interval process " + taskId, state: ended() ? "stopped" : "running", started_at_ms: started }]; },
      async stop(project, id) {
        assert.equal(project, projectId); assert.equal(id, taskId); attempts++;
        if (denied) throw new ActionError("audit.stop_refused", "The fixture Runtime refused this stop");
        if (ended()) return false;
        const closed = new Promise<void>(resolve => child.once("exit", () => resolve())); child.kill("SIGTERM"); await closed; return true;
      },
    },
  };
  host.ensureAgentService(browser.homeDirectory, () => { throw new Error("The web Host must own its Agent service"); }).agentHost.register(adapter);
  const readProjection = async (signal?: AbortSignal): Promise<HomeBackgroundTaskRow> => {
    const response = await fetch(browser.origin + "/api/attention", { signal });
    assert.equal(response.status, 200);
    const attention = await response.json() as { background_tasks: HomeBackgroundTaskRow[] | null };
    assert.ok(Array.isArray(attention.background_tasks), "the owner background projection is readable");
    const task = attention.background_tasks.find(row => row.project_id === projectId && row.surface === "coding" && row.id === sessionId);
    assert.ok(task, "the fixture Coding task remains in its project's background projection");
    assert.ok(Array.isArray(task.commands), "the owner projection supplies its commands");
    return task;
  };
  const waitForObservation = async () => {
    const signal = AbortSignal.timeout(10_000);
    let task: HomeBackgroundTaskRow | undefined;
    try {
      // This query remains read-only; the activation's observation job owns the persistent projection.
      const response = await fetch(browser.origin + "/projects/" + projectId + "/api/plugins/io.molis.work.coding/state", { signal });
      assert.equal(response.status, 200); await response.text();
      for (;;) {
        task = await readProjection(signal);
        if (task.commands.length === 0) return;
        await delay(50, undefined, { signal });
      }
    } catch (error) {
      t.diagnostic(JSON.stringify({ projectId, surface: "coding", sessionId, commands: task?.commands.map(command => command.task_id), ended: ended(), attempts }));
      throw error;
    }
  };
  return { sessionId, start, ended, readProjection, waitForObservation, allow: () => { denied = false; }, attempts: () => attempts,
    pause: () => store.setState(noEffect, projectId, sessionId, "paused", new Date().toISOString()) };
}

test("W2-18-STOP-FEEDBACK-01: a refused stop retains the real process and its diagnostic; a lost reply is unknown with no retry; success stops the process and follows the owner projection", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const command = await backgroundCommand(browser, t);
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  // The background tasks are a tab of the right side since 07-S1; its badge counts the tasks not finished.
  await browser.waitFor("!document.querySelector('.tab-item:has([data-side-tab=\"tasks\"]) [data-background-tasks-count]').hidden", 15_000);
  await browser.click('[data-side-tab="tasks"]');
  await browser.waitFor("document.body.dataset.sideOpen === 'true' && !document.querySelector('[data-side-body=\"tasks\"]').hidden");
  const stop = ".background-task-command button", alert = "[data-background-tasks-list] [role=alert]";
  await armResponse(browser, "stop-refused", "/stop", "POST");
  await browser.click(stop); await waitHeld(browser, "stop-refused");
  await command.pause(); await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await browser.waitFor("!!document.querySelector('.background-task[data-state=paused]')");
  await releaseResponse(browser, "stop-refused");
  await browser.waitFor(`[...document.querySelectorAll('${alert}')].some(node=>node.textContent.includes('The fixture Runtime refused this stop')) && !document.querySelector('${stop}').disabled`);
  assert.equal(command.ended(), false); assert.equal(command.attempts(), 1);
  assert.match(await browser.evaluate<string>(`[...document.querySelectorAll('${alert}')].find(node=>node.textContent.includes('The fixture Runtime refused this stop'))?.querySelector('[data-molis-call-id]')?.dataset.molisCallId || ''`), /^[a-f0-9-]{36}$/);
  command.allow();
  const lost = await sendBarrier(browser, [{urlPattern:"*/stop",requestStage:"Response"}]);
  await browser.click(stop);
  const stopped = await lost.next(); assert.equal(stopped.responseStatusCode, 200);
  await lost.drop(stopped); await lost.close();
  await browser.waitFor(`[...document.querySelectorAll('${alert}')].some(node=>node.textContent.includes('不知道这次操作有没有完成')) && !document.querySelector('${stop}').disabled`);
  assert.equal(command.ended(), true, "the actual accepted stop occurred even though its HTTP reply was lost");
  assert.equal(command.attempts(), 2, "the unknown operation was not retried");
  await command.waitForObservation();
  const afterUnknown = await command.readProjection();
  assert.equal(afterUnknown.commands.length, 0);
  await command.start();
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await browser.waitFor("document.querySelector('.background-task-command code')?.textContent.includes('audit-command-2')");
  await armResponse(browser, "stop-success", "/stop", "POST");
  await browser.click(stop); await waitHeld(browser, "stop-success");
  assert.equal(command.ended(), true); assert.equal(command.attempts(), 3);
  // Wait for Coding's real observation job before the held success response prompts the page to read its projection.
  await command.waitForObservation(); await releaseResponse(browser, "stop-success");
  await browser.waitFor("!document.querySelector('.background-task-command')");
  const final = await command.readProjection();
  assert.equal(final.commands.length, 0);
});
