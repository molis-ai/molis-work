import assert from "node:assert/strict";
import { sendBarrier } from "./fixtures/assistant-send-journey.js";
import { spawn, type ChildProcess } from "node:child_process";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AgentRuntimeAdapter } from "@molis-ai/molis-work-contracts/services/agent-host";
import { emptyCapabilityMatrix } from "@molis-ai/molis-work-service-agent-host";
import { codingSessions, noEffect } from "./fixtures/coding-sessions.js";
import { armResponse, openAuditBrowser, releaseResponse, waitHeld, type AuditBrowser } from "./fixtures/workbench-audit-browser.js";

// A public Runtime port around a real disposable child process. No model, shell, user files or global process control.
async function backgroundCommand(browser: AuditBrowser, t: import("node:test").TestContext) {
  assert.ok(browser.localHost);
  const host = browser.localHost, projectId = browser.projectId!;
  await withMolisWorkProjectCatalog({ homeDirectory: browser.homeDirectory }, catalog => catalog.addProjectPlugin({ project_id: projectId, plugin_id: "coding", actor_id: "audit" }));
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
  return { sessionId, start, ended, allow: () => { denied = false; }, attempts: () => attempts,
    pause: () => store.setState(noEffect, projectId, sessionId, "paused", new Date().toISOString()),
    sync: async () => { const response = await fetch(browser.origin + "/projects/" + projectId + "/api/plugins/io.molis.work.coding/state"); assert.equal(response.status, 200); await response.text(); } };
}

test("W2-18-STOP-FEEDBACK-01: a refused stop retains the real process and its diagnostic; a lost reply is unknown with no retry; success stops the process and follows the owner projection", { timeout: 120_000 }, async t => {
  const browser = await openAuditBrowser(t); if (!browser) return;
  const command = await backgroundCommand(browser, t);
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await browser.waitFor("!document.querySelector('[data-background-tasks]').hidden", 15_000);
  await browser.click("[data-background-tasks]");
  const stop = ".background-task-command button", alert = ".background-tasks-menu [role=alert]";
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
  await command.sync();
  const afterUnknown = await (await fetch(browser.origin + "/api/attention")).json() as { background_tasks: Array<{ session_id: string; commands?: unknown[] }> };
  assert.equal(afterUnknown.background_tasks.find(task => task.session_id === command.sessionId)?.commands?.length ?? 0, 0);
  await command.start();
  await browser.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await browser.waitFor("document.querySelector('.background-task-command code')?.textContent.includes('audit-command-2')");
  await armResponse(browser, "stop-success", "/stop", "POST");
  await browser.click(stop); await waitHeld(browser, "stop-success");
  assert.equal(command.ended(), true); assert.equal(command.attempts(), 3);
  // Coding owns this persistent projection; its normal state read reconciles the actual Runtime result.
  await command.sync(); await releaseResponse(browser, "stop-success");
  await browser.waitFor("!document.querySelector('.background-task-command')");
  const final = await (await fetch(browser.origin + "/api/attention")).json() as typeof afterUnknown;
  assert.equal(final.background_tasks.find(task => task.session_id === command.sessionId)?.commands?.length ?? 0, 0);
});
