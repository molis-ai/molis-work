import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createDesktopWebHost, desktopLaunchSpec, openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { captureHostLog, GoalProjectApplication, LocalProjectDatabase, MolisWorkLocalHost, resolveWebControlToken, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";
import type { DesktopPanelRecord } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ActionError } from "@molis-ai/molis-work-plugin-sdk";
import { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";
import { isLocalHostHttpError, LocalHostHttpClient } from "@molis-ai/molis-work-test-kit/local-host-http";

const PRIVATE_ARG = "desktop-private-argument /私人目录/keep this out of errors";
const ERROR_MESSAGE = "终端面板的启动参数记录无效，无法读取。";
const EXACT_ARGS = ["", "  spaced value  ", "\"quoted\"", "中文参数", PRIVATE_ARG];

function addGoal(project: { project_id: string; database_path: string }, goalId: string): void {
  const store = new LocalProjectDatabase(project.database_path);
  try {
    const application = new GoalProjectApplication(store);
    application.projectOpened(project.project_id);
    application.goals.commands.createGoal(project.project_id, {
      goal_id: goalId, title: goalId, outcome: "", why: "", business_logic: "",
      definition_state: "draft", decomposition_state: "abstract", acceptance_criteria: [],
    }, { actor_id: "test-user", idempotency_key: `desktop-args-${goalId}` });
  } finally {
    store.close();
  }
}

async function fixture() {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-desktop-args-"));
  await new MolisWorkLocalHost({ homeDirectory, completeText: null }).close();
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory });
  const db = new DatabaseSync(catalog.databasePath);
  try {
    const project = await catalog.createProject({ display_name: "Desktop arguments", actor_id: "test-user" });
    for (const goal of ["ARGS-BAD", "ARGS-GOOD"]) addGoal(project, goal);
    const cwd = join(homeDirectory, "workspace");
    mkdirSync(cwd);
    const open = (goal: string, args: string[], runtime = "generic", hostSession: string | null = null) => catalog.openDesktopPanel({
      project_id: project.project_id, goal_id: goal, runtime_kind: runtime,
      launch_command: process.execPath, launch_args: args, cwd, host_session_id: hostSession,
      actor_id: "test-user", user_confirmed: true,
    });
    const resume = desktopLaunchSpec({ runtime_kind: "codex", resume_session_id: "thread-keep" });
    const bad = open("ARGS-BAD", resume.args, "codex", "thread-keep");
    catalog.markDesktopPanelExited(bad.panel_id);
    const good = open("ARGS-GOOD", EXACT_ARGS);
    const setRaw = (value: string) => { db.prepare("UPDATE goal_desktop_panels SET launch_args = ? WHERE panel_id = ?").run(value, bad.panel_id); };
    const snapshot = () => ({
      panel: db.prepare("SELECT * FROM goal_desktop_panels WHERE panel_id = ?").get(bad.panel_id),
      aliases: db.prepare("SELECT * FROM goal_desktop_panel_aliases WHERE panel_id = ? ORDER BY runtime_id, stable_work_context_id").all(bad.panel_id),
      events: db.prepare("SELECT * FROM project_events WHERE project_id = ? ORDER BY event_id").all(project.project_id),
      bindings: catalog.listRuntimeContextBindings(),
      bindingEvents: catalog.listRuntimeContextBindingEvents(),
    });
    return { homeDirectory, catalog, db, project, bad, good, open, setRaw, snapshot,
      dispose: () => { db.close(); catalog.close(); rmSync(homeDirectory, { recursive: true, force: true }); } };
  } catch (error) {
    db.close(); catalog.close(); rmSync(homeDirectory, { recursive: true, force: true }); throw error;
  }
}

function refused(error: unknown): boolean {
  assert.ok(error instanceof ActionError);
  assert.equal(error.code, "desktop.launch_args_invalid");
  assert.equal(error.kind, "internal");
  assert.equal(error.message, ERROR_MESSAGE);
  assert.equal(error.cause, undefined);
  assert.doesNotMatch(JSON.stringify(error), /desktop-private-argument|私人目录|molis-desktop-args-/);
  return true;
}

test("RAC-117 valid stored arguments preserve empty, explicit strings and Codex resume identities", async () => {
  const f = await fixture();
  try {
    const empty = f.open("ARGS-GOOD", []);
    for (const panel of [empty, f.good, f.bad]) {
      assert.deepEqual(f.catalog.getDesktopPanel(panel.panel_id).launch_args, panel.launch_args);
      assert.deepEqual(f.catalog.findDesktopPanelByWorkContext(panel.runtime_kind, panel.work_context_id)?.launch_args, panel.launch_args);
    }
    assert.deepEqual(f.catalog.listDesktopPanels(f.project.project_id, "ARGS-GOOD").map(panel => panel.launch_args), [EXACT_ARGS, []]);
    assert.deepEqual(f.catalog.findDesktopPanelByWorkContext("codex", "thread-keep")?.launch_args, ["resume", "thread-keep"]);
    assert.equal(f.catalog.markDesktopPanelOpen(f.bad.panel_id).host_session_id, "thread-keep");
    assert.equal(f.catalog.markDesktopPanelExited(f.bad.panel_id).status, "exited");
  } finally {
    f.dispose();
  }
});

test("RAC-117 damaged SQLite arguments refuse every complete-record read and mutation without changing facts", async t => {
  const f = await fixture();
  const logs: HostLogEntry[] = [];
  const restoreLog = captureHostLog(logs);
  try {
    const cases = [
      ["malformed JSON", `[${JSON.stringify(PRIVATE_ARG)},${JSON.stringify(f.homeDirectory)}`],
      ["object", JSON.stringify({ command: PRIVATE_ARG, cwd: f.homeDirectory })],
      ["null", "null"],
      ["string", JSON.stringify(PRIVATE_ARG)],
      ["mixed array", JSON.stringify([PRIVATE_ARG, 12, null, { cwd: f.homeDirectory }])],
    ];
    for (const [name, raw] of cases) await t.test(name, () => {
      f.setRaw(raw);
      const before = f.snapshot();
      try {
        const operations = [
          () => f.catalog.getDesktopPanel(f.bad.panel_id),
          () => f.catalog.listDesktopPanels(f.project.project_id, "ARGS-BAD"),
          () => f.catalog.listDesktopPanels(f.project.project_id),
          () => f.catalog.findDesktopPanelByWorkContext("codex", "thread-keep"),
          () => f.catalog.findDesktopPanelByWorkContext("codex", f.bad.work_context_id),
          () => f.catalog.markDesktopPanelOpen(f.bad.panel_id),
          () => f.catalog.markDesktopPanelExited(f.bad.panel_id),
          () => f.catalog.aliasDesktopPanelSession({ panel_id: f.bad.panel_id, runtime_id: "codex", host_session_id: "must-not-bind", actor_id: "test-user" }),
          () => f.catalog.closeDesktopPanel(f.bad.panel_id, "test-user"),
        ];
        for (const operation of operations) {
          assert.throws(operation, refused);
          assert.deepEqual(f.snapshot(), before);
        }
        assert.deepEqual(f.catalog.listDesktopPanels(f.project.project_id, "ARGS-GOOD").map(panel => panel.launch_args), [EXACT_ARGS]);
        assert.equal(f.catalog.getDesktopPanel(f.good.panel_id).panel_id, f.good.panel_id);
      } finally {
        f.setRaw(JSON.stringify(f.bad.launch_args)); // Clear only this fixture's injected fault; production never repairs it.
      }
      assert.deepEqual(f.catalog.markDesktopPanelOpen(f.bad.panel_id).launch_args, ["resume", "thread-keep"]);
      f.catalog.markDesktopPanelExited(f.bad.panel_id);
    });
    assert.doesNotMatch(JSON.stringify(logs), /desktop-private-argument|私人目录|molis-desktop-args-/);
  } finally {
    restoreLog(); f.dispose();
  }
});

test("RAC-117 real panel HTTP refuses bad reads before status, close, kill or spawn; a corrected fixture resumes", async t => {
  const f = await fixture();
  const logs: HostLogEntry[] = [];
  const restoreLog = captureHostLog(logs);
  const spawn = t.mock.method(MolisWorkPtyHost.prototype, "spawn", () => { throw new Error("unexpected terminal spawn"); });
  const kill = t.mock.method(MolisWorkPtyHost.prototype, "kill", () => {});
  const localHost = new MolisWorkLocalHost({ homeDirectory: f.homeDirectory, completeText: null });
  const controlToken = resolveWebControlToken({ homeDirectory: f.homeDirectory });
  const server = createDesktopWebHost({ ptyClientFilePath: () => new URL("../dist/web/pty-client.js", import.meta.url).pathname })({
    homeDirectory: f.homeDirectory, localHost, controlToken,
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const refusedReplies: Record<string, unknown>[] = [];
    const http = new LocalHostHttpClient({ origin: `http://127.0.0.1:${address.port}`, controlToken,
      fetch: async (input, init) => {
        const response = await fetch(input, init);
        if (!response.ok) refusedReplies.push(await response.clone().json() as Record<string, unknown>);
        return response;
      },
    });
    const prefix = `/projects/${f.project.project_id}/api`;
    const panelPath = `${prefix}/panels/${f.bad.panel_id}`;
    f.setRaw(`[${JSON.stringify(PRIVATE_ARG)},${JSON.stringify(f.homeDirectory)}`);
    const before = f.snapshot();
    const requests = [
      () => http.get(`${prefix}/goals/ARGS-BAD/panels`),
      () => http.post(`${panelPath}/reopen`, {}),
      () => http.post(`${panelPath}/exited`, {}),
      () => http.delete(panelPath),
    ];
    for (const request of requests) {
      await assert.rejects(request, error => {
        assert.ok(isLocalHostHttpError(error));
        assert.equal(error.status, 500);
        assert.equal(error.code, "desktop.launch_args_invalid");
        assert.equal(error.message, ERROR_MESSAGE);
        return true;
      });
      assert.deepEqual(f.snapshot(), before);
      assert.equal(spawn.mock.callCount(), 0);
      assert.equal(kill.mock.callCount(), 0);
    }
    assert.equal(refusedReplies.length, requests.length);
    for (const reply of refusedReplies) {
      assert.equal(reply.spawn, undefined);
      assert.equal(reply.panels, undefined);
      assert.doesNotMatch(JSON.stringify(reply), /desktop-private-argument|私人目录|molis-desktop-args-/);
    }
    const healthy = await http.get<{ panels: Array<{ panel_id: string; spawn: { args: string[] } }> }>(`${prefix}/goals/ARGS-GOOD/panels`);
    assert.deepEqual(healthy.panels.map(panel => [panel.panel_id, panel.spawn.args]), [[f.good.panel_id, EXACT_ARGS]]);
    assert.deepEqual(f.snapshot(), before);
    f.setRaw(JSON.stringify(f.bad.launch_args));
    const reopened = await http.post<{ panel: DesktopPanelRecord; spawn: { args: string[] } }>(`${panelPath}/reopen`, {});
    assert.equal(reopened.panel.status, "open");
    assert.equal(f.catalog.getDesktopPanel(f.bad.panel_id).status, "open");
    assert.equal(reopened.panel.host_session_id, "thread-keep");
    assert.deepEqual(reopened.spawn.args, ["resume", "thread-keep"]);
    assert.equal(f.catalog.findDesktopPanelByWorkContext("codex", "thread-keep")?.panel_id, f.bad.panel_id);
    assert.equal(spawn.mock.callCount(), 0); // HTTP returns the launch spec; only a later explicit PTY request starts a process.
    await http.delete(`${prefix}/panels/${f.good.panel_id}`);
    assert.equal(kill.mock.callCount(), 1); // The same observed production route does kill a healthy panel on an explicit close.
    assert.throws(() => f.catalog.getDesktopPanel(f.good.panel_id), { code: "catalog.panel_not_found" });
    assert.doesNotMatch(JSON.stringify(logs), /desktop-private-argument|私人目录|molis-desktop-args-/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await localHost.close();
    restoreLog(); f.dispose();
  }
});
