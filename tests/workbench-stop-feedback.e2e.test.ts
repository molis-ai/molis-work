import assert from "node:assert/strict";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { HomeBackgroundTaskRow, HomeBackgroundTasksReadResult } from "@molis-ai/molis-work-contracts/services/mainline";
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
    const attention = await response.json() as { background_tasks: HomeBackgroundTasksReadResult | null };
    assert.ok(attention.background_tasks && attention.background_tasks.issues.length === 0, "the owner background projection is readable");
    const task = attention.background_tasks.tasks.find(row => row.project_id === projectId && row.origin.surface === "coding" && row.subject.id === sessionId);
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
      t.diagnostic(JSON.stringify({ projectId, surface: "coding", sessionId, commands: task?.commands.map(command => command.input.task_id), ended: ended(), attempts }));
      throw error;
    }
  };
  return { sessionId, start, ended, readProjection, waitForObservation, allow: () => { denied = false; }, attempts: () => attempts,
    pause: () => store.setState(noEffect, projectId, sessionId, "paused", new Date().toISOString()) };
}

test("QEA-17 W2-18-STOP-FEEDBACK-01: a refused stop retains the real process and its diagnostic; a lost reply is unknown with no retry; success stops the process and follows the owner projection", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const command = await backgroundCommand(browser, t);
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  // POLISH-17, POLISH-40: there is no task panel. The task's row stands under its event, and the event stands where its owner's
  // state puts it: a list of the information column or — once Coding says the session wants checking — a card of the stack,
  // which opens the event with its tasks in that column. The row opens the task's card, and 停止 is always there (a row that
  // asks for the person offers 去处理 instead). \`reach\` goes to that card wherever the row stands now.
  const stop = "[data-task-card] [data-task-control=stop]", toast = "[data-toast]";
  const REACH = `(() => {
    if (document.querySelector('${stop}')) return true;
    const rows = [...document.querySelectorAll('[data-assistant-side] [data-task-open]')].filter(row => row.textContent.includes('Audit background process'));
    const seen = rows.find(row => row.getClientRects().length), list = rows[0]?.closest('[data-work-list-rows]');
    if (seen) seen.click();
    else if (list) document.querySelector('[data-work-counts] [data-work-list="' + list.dataset.workListRows + '"]').click();
    else (document.querySelector('[data-work-stack-card][aria-label="Audit background process"] [data-work-stack-open]') ?? document.querySelector('[data-work-stack-next]'))?.click();
    return false;
  })()`;
  const reach = () => browser.waitFor(REACH, 20_000);
  await reach();
  await armResponse(browser, "stop-refused", "/api/mainline/tasks/command", "POST");
  await browser.click(stop); await waitHeld(browser, "stop-refused");
  await command.pause();
  for (const until = Date.now() + 10_000; (await command.readProjection()).state !== "paused" && Date.now() < until;) await delay(100);
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await browser.waitFor(`${REACH} && Boolean(document.querySelector('[data-task-card] [data-mw-state=paused]'))`, 20_000);
  assert.equal(await browser.evaluate(`document.querySelector('${stop}').disabled`), true, "QEA-17: a new owner projection must keep the pending stop disabled");
  await browser.click(stop, { allowDisabled: true });
  assert.equal(command.attempts(), 1, "QEA-17: repainting cannot submit the same pending stop twice");
  assert.equal(await browser.evaluate("[...document.querySelectorAll('[data-assistant-side] [data-task-control=stop]')].every(key => key.disabled)"), true, "a row that offers 停止 shares the pending attempt");
  await releaseResponse(browser, "stop-refused");
  await browser.waitFor(`document.querySelector('${toast}')?.textContent.includes('The fixture Runtime refused this stop')`);
  await browser.waitFor(`${REACH} && document.querySelector('${stop}').disabled === false`, 20_000);
  assert.equal(command.ended(), false); assert.equal(command.attempts(), 1);
  assert.match(await browser.evaluate<string>(`document.querySelector('${toast} [data-molis-call-id]')?.dataset.molisCallId || ''`), /^[a-f0-9-]{36}$/);
  command.allow();
  const lost = await sendBarrier(browser, [{urlPattern:"*/api/mainline/tasks/command",requestStage:"Response"}]);
  await reach(); await browser.click(stop);
  const stopped = await lost.next(); assert.equal(stopped.responseStatusCode, 200);
  await lost.drop(stopped); await lost.close();
  await browser.waitFor(`document.querySelector('${toast}')?.textContent.includes('不知道这次操作有没有完成')`);
  assert.equal(command.ended(), true, "the actual accepted stop occurred even though its HTTP reply was lost");
  assert.equal(command.attempts(), 2, "the unknown operation was not retried");
  await command.waitForObservation();
  const afterUnknown = await command.readProjection();
  assert.equal(afterUnknown.commands.length, 0);
  await command.start();
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await reach();
  await armResponse(browser, "stop-success", "/api/mainline/tasks/command", "POST");
  await reach(); await browser.click(stop); await waitHeld(browser, "stop-success");
  assert.equal(command.ended(), true); assert.equal(command.attempts(), 3);
  // Wait for Coding's real observation job before the held success response prompts the page to read its projection.
  await command.waitForObservation(); await releaseResponse(browser, "stop-success");
  await browser.waitFor("!document.querySelector('[data-task-control=stop]')");
  const final = await command.readProjection();
  assert.equal(final.commands.length, 0);
});
