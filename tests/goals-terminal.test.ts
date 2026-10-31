import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalProjectDatabase, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { goalsTerminalActions } from "@molis-ai/molis-work-plugin-goals";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { GoalProjectApplication } from "./fixtures/goal-application.js";

// A Goal's work terminals are Goals' (T-137): four actions over the platform's `services.terminal` (S-103), offered to the person only.
// The runtime recipes are looked up on the platform's PATH, whose first entry is `~/.local/bin`: this process's HOME is a folder of its
// own with a `codex` there that writes where it ran, with what arguments and variables, to a log, and then reads its input.
const fakeHome = mkdtempSync(join(tmpdir(), "goals-terminal-user-"));
process.env.HOME = fakeHome;
const log = join(fakeHome, "codex.log");
mkdirSync(join(fakeHome, ".local", "bin"), { recursive: true });
writeFileSync(join(fakeHome, ".local", "bin", "codex"),
  `#!/bin/sh\nprintf '%s|%s|%s|%s\\n' "$(pwd -P)" "$*" "$MOLIS_WORK_FOCUS_ID" "$MOLIS_WORK_RUNTIME_ID" >> '${log}'\nexec /bin/cat\n`, { mode: 0o700 });
test.after(() => rm(fakeHome, { recursive: true, force: true }));

const GOALS = "/api/plugins/io.molis.work.goals/goals";

function addGoal(project: { database_path: string; project_id: string }, goalId: string, decomposition: "closed_leaf" | "closed_compound", parent?: string) {
  const store = new LocalProjectDatabase(project.database_path);
  try {
    const application = new GoalProjectApplication(store);
    application.projectOpened(project.project_id);
    application.goals.commands.createGoal(project.project_id, { goal_id: goalId, title: `目标 ${goalId}`, outcome: "有结果", why: "终端归属于一条 Goal",
      business_logic: "可以推进", definition_state: "accepted", decomposition_state: decomposition,
      acceptance_criteria: [{ criterion_id: `${goalId}-done`, statement: "可以验收", decision_method: "inspection", pass_condition: "能判断" }] },
    { actor_id: "test-user", idempotency_key: `goal-${goalId}` });
    if (parent) application.goals.commands.addRelation(project.project_id, { from_goal_id: goalId, to_goal_id: parent, type: "part_of", reason: "子目标" },
      { actor_id: "test-user", idempotency_key: `relation-${goalId}` });
  } finally { store.close(); }
}

/** A Home with two projects, each with a linked folder; the first has a Goal, a parent Goal and its child. */
async function served(t: TestContext) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "goals-terminal-")));
  const folders: string[] = [];
  const projects = await withMolisWorkProjectCatalog({ homeDirectory: home }, async catalog => {
    const made = [];
    for (const name of ["终端项目", "别的项目"]) {
      const project = await catalog.createProject({ display_name: name, actor_id: "test-user" });
      const folder = await realpath(await mkdtemp(join(tmpdir(), "goals-terminal-workspace-")));
      folders.push(folder);
      await catalog.commit(() => catalog.addWorkspaceProject({ canonical_path: folder, project_id: project.project_id, actor_id: "test-user", user_confirmed: true }));
      made.push({ ...project, workspace_id: catalog.listWorkspaceDirectory(project.project_id).find(record => record.canonical_path === folder)!.workspace_id });
    }
    return made;
  });
  t.after(() => Promise.all(folders.map(folder => rm(folder, { recursive: true, force: true }))));
  const [project, other] = projects as [typeof projects[number], typeof projects[number]];
  addGoal(project, "LEAF", "closed_leaf"); addGoal(project, "PARENT", "closed_compound"); addGoal(project, "CHILD", "closed_leaf", "PARENT");
  const f = await serveHomeRuntime(t, { homeDirectory: home });
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const api = (path: string, input: { method?: string; body?: unknown } = {}) => f.request(`/projects/${project.project_id}${GOALS}${path}`, input);
  return { f, project, other, folder: folders[0]!, reference, api };
}

async function logged(count: number): Promise<string[]> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const lines = existsSync(log) ? (await readFile(log, "utf8")).split("\n").filter(Boolean) : [];
    if (lines.length >= count) return lines;
    if (Date.now() > deadline) throw new Error(`codex ran ${lines.length} times, expected ${count}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/** Goals' page in the project, on the terminal channel (S-47). */
async function goalsPage(t: TestContext, f: Awaited<ReturnType<typeof served>>["f"], projectId: string) {
  const opened = await f.request(`/projects/${projectId}/api/host/plugin-pages`, { method: "POST", body: { plugin_id: "io.molis.work.goals" } });
  assert.equal(opened.status, 200, await opened.clone().text());
  const { page_id } = await opened.json() as { page_id: string };
  const socket = new WebSocket(f.origin.replace("http:", "ws:") + "/pty"), messages: Array<Record<string, unknown>> = [];
  socket.on("message", raw => messages.push(JSON.parse(raw.toString())));
  t.after(() => socket.terminate());
  const wait = async (predicate: (message: Record<string, unknown>) => boolean) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const index = messages.findIndex(predicate);
      if (index >= 0) return messages.splice(index, 1)[0]!;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Terminal event not received: " + JSON.stringify(messages));
  };
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  const send = (message: unknown) => socket.send(JSON.stringify(message));
  send({ type: "page-auth", pageId: page_id }); await wait(message => message.type === "ready");
  // Closed by the test before the fixture stops the server: an upgraded socket is not among the connections it closes.
  return { send, wait, close: () => socket.terminate() };
}

const runs = async () => existsSync(log) ? (await readFile(log, "utf8")).split("\n").filter(Boolean).length : 0;
const json = async (response: Response) => ({ status: response.status, body: await response.json() as Record<string, unknown> });

test("RAC-2562 Goals opens a Goal's terminal with a runtime recipe in the project's preferred workspace; the page attaches and writes; a parent Goal and another project's workspace are refused", { timeout: 60_000 }, async t => {
  const { f, folder, other, project, api } = await served(t);
  const opened = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex" } }));
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.started, true);
  assert.match(String(opened.body.key), /^t[0-9a-f]{12}$/u, "a new tab's key");
  assert.deepEqual((await logged(1)).at(-1), `${folder}||LEAF|codex`, "the recipe ran in the preferred workspace, focused on the Goal");
  const panelId = String(opened.body.panel_id);
  const page = await goalsPage(t, f, project.project_id);
  page.send({ type: "spawn", panelId, attachOnly: true });
  assert.equal((await page.wait(message => message.type === "spawned")).attached, true);
  page.send({ type: "write", panelId, data: "GOAL_INPUT\n" });
  await page.wait(message => message.type === "data" && String(message.data).includes("GOAL_INPUT"));
  const listed = await json(await api("/LEAF/terminals"));
  assert.equal(listed.status, 200);
  assert.deepEqual((listed.body.panels as Array<Record<string, unknown>>).map(({ created_at: _created, ...row }) => row),
    [{ key: opened.body.key, panel_id: panelId, title: "Codex", runtime: "codex", program: { runtime: "codex" }, running: true }]);
  assert.equal(listed.body.read_only, false);
  assert.deepEqual((await json(await api("/CHILD/terminals"))).body.panels, [], "another Goal's terminals are its own");
  const again = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: opened.body.key } }));
  assert.deepEqual(again.body, { panel_id: panelId, key: opened.body.key, started: false }, "the same key attaches to the running terminal");
  // A key stays with its Goal: another Goal's open neither attaches the running terminal nor starts a stopped one again.
  const conflict = async (key: unknown, why: string) => {
    const stolen = await api("/CHILD/terminals", { method: "POST", body: { runtime: "codex", key } });
    assert.equal(stolen.status, 409, why);
    assert.match(await stolen.text(), /actions\.conflict/, why);
  };
  await conflict(opened.body.key, "running");
  const spare = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: "spare" } }));
  assert.equal(spare.status, 200, JSON.stringify(spare.body));
  await logged(2);
  page.send({ type: "spawn", panelId: String(spare.body.panel_id), attachOnly: true }); await page.wait(message => message.type === "spawned");
  page.send({ type: "kill", panelId: String(spare.body.panel_id) }); await page.wait(message => message.type === "exit");
  await conflict("spare", "stopped");
  assert.equal((await logged(2)).length, 2, "neither attempt started anything");
  assert.equal((await api("/LEAF/terminals/spare", { method: "DELETE" })).status, 200);

  const parent = await api("/PARENT/terminals", { method: "POST", body: { runtime: "codex" } });
  assert.equal(parent.status, 409);
  assert.match(await parent.text(), /goals\.terminal\.read_only/);
  assert.equal((await json(await api("/PARENT/terminals"))).body.read_only, true);
  assert.equal((await api("/PARENT/advance-prompt")).status, 409);
  const foreign = await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", workspace_id: other.workspace_id } });
  assert.equal(foreign.status, 403, await foreign.clone().text());
  for (const body of [{}, { runtime: "codex", command: "sh" }, { runtime: "codex", args: [] }, { runtime: "nope" }, { command: "sh", cwd: "/" },
    { command: "sh", resume_session_id: "s-1" }, { runtime: "codex", resume_session_id: "s-1 rm" }, { runtime: "codex", resume_session_id: "s-1;rm" }]) {
    assert.equal((await api("/LEAF/terminals", { method: "POST", body })).status, 400, JSON.stringify(body));
  }
  assert.equal((await logged(2)).length, 2, "nothing else ran");
  const closed = await json(await api(`/LEAF/terminals/${opened.body.key}`, { method: "DELETE" }));
  assert.deepEqual(closed, { status: 200, body: { closed: true } });
  await page.wait(message => message.type === "exit");
  assert.deepEqual((await json(await api("/LEAF/terminals"))).body.panels, []);
  assert.equal((await api(`/LEAF/terminals/${opened.body.key}`, { method: "DELETE" })).status, 404);
  page.close();
});

test("RAC-2563 the four Goals terminal actions are the person's only: an Agent, a workflow and an MCP client are refused before they run, and no plugin is offered them", { timeout: 60_000 }, async t => {
  const { f, reference } = await served(t);
  const person = await f.host.localPersonContext(reference), client = f.host.actionClient(reference), before = await runs();
  const inputs = { list: { goal_id: "LEAF" }, open: { goal_id: "LEAF", runtime: "codex" }, close: { goal_id: "LEAF", key: "tabc" }, prompt: { goal_id: "LEAF" } } as const;
  // A plugin's caller is issued by the Host and cannot be made here (a made-up one is refused as `host.plugin_caller_invalid` before any
  // audience check); the actions offer themselves to the person only, which is what the gateway reads for every caller.
  for (const definition of Object.values(goalsTerminalActions)) assert.deepEqual(definition.action.audiences, ["user"], definition.capability_id);
  for (const audience of ["agent", "workflow", "mcp"] as const) {
    const caller: ActionCallContext = { ...person, audience, runtime_session_id: `goals-terminal-${audience}` };
    for (const [name, input] of Object.entries(inputs) as Array<[keyof typeof inputs, unknown]>) {
      await assert.rejects(client.invoke(caller, goalsTerminalActions[name], input), (error: { code?: string }) => {
        assert.equal(error.code, "actions.forbidden", `${audience} ${name}`);
        return true;
      });
    }
  }
  assert.equal(await runs(), before, "nothing ran");
});

test("RAC-2565 a terminal whose runtime reported its session starts again with the recipe's resume arguments, one opened with resume_session_id resumes it from the first start; another program or session under the same key is a conflict", { timeout: 60_000 }, async t => {
  const { f, folder, project, api } = await served(t);
  const before = await runs();
  const opened = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: "main" } }));
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const panelId = String(opened.body.panel_id);
  await logged(before + 1);
  await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog =>
    catalog.commit(() => catalog.terminalPanels.aliasSession({ panel_id: panelId, runtime_id: "codex", host_session_id: "sess-42" })));
  const page = await goalsPage(t, f, project.project_id);
  const end = async () => {
    page.send({ type: "spawn", panelId, attachOnly: true }); await page.wait(message => message.type === "spawned");
    page.send({ type: "kill", panelId }); await page.wait(message => message.type === "exit");
  };
  await end();
  const listed = await json(await api("/LEAF/terminals"));
  assert.equal((listed.body.panels as Array<{ running: boolean }>)[0]?.running, false, "the record stays after the process ended");
  const resumed = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: "main" } }));
  assert.deepEqual(resumed.body, { panel_id: panelId, key: "main", started: true });
  assert.equal((await logged(before + 2)).at(-1), `${folder}|resume sess-42|LEAF|codex`, "started again with the resume arguments");
  await end();
  const conflict = await api("/LEAF/terminals", { method: "POST", body: { command: "sh", key: "main" } });
  assert.equal(conflict.status, 409);
  assert.match(await conflict.text(), /actions\.conflict/);
  const otherSession = await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: "main", resume_session_id: "sess-7" } });
  assert.equal(otherSession.status, 409, "the recorded session is the one it resumes");
  assert.equal((await logged(before + 2)).length, before + 2, "nothing else ran");
  const named = await json(await api("/LEAF/terminals", { method: "POST", body: { runtime: "codex", key: "named", resume_session_id: "sess-7" } }));
  assert.equal(named.status, 200, JSON.stringify(named.body));
  assert.equal((await logged(before + 3)).at(-1), `${folder}|resume sess-7|LEAF|codex`, "the first start resumes the named session");
  page.close();
});
