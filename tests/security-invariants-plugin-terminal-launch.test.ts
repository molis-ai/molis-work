import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { WebSocket } from "ws";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { HomePluginHost, LocalHost, LocalProjectDatabase, PluginHostExecutor, hostDependencyCheck, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginHostServices, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { PluginRuntime } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";

// S-103 (specs/repository-anti-corruption/slices/platform-terminal-launch.md, 用户 2026-10-30 裁定): the platform's `services.terminal.open`
// starts a local interactive terminal for a plugin the Host runs itself, Home instance or project instance alike. Only the Manifest's
// terminal:run and the person's grant give the service; only the installation's own user command that declares terminal:run may call it;
// the installation, project and person come from the call; the folder is inside the project's linked workspace (with workspace:read) or
// the plugin's owner files. Every refusal here is proven twice: the program (a script that writes where it ran) never wrote its marker, and
// the panel the Host would have derived is not alive.

const TERMINAL = "terminal:run", WORKSPACE = "workspace:read";
type Where = "project" | "home";
type Use = (own: PluginHostServices, caller: ActionExecutionContext) => unknown;
type Outcome = { outcome: string; message?: string; value?: unknown };
type Fixture = Awaited<ReturnType<typeof serveHomeRuntime>>;
type Project = Awaited<ReturnType<Fixture["project"]>>;

/**
 * One plugin, in the halves asked for. Each half offers: `run`, a user command that declares terminal:run; `undeclared`, a user command
 * that does not; `query`, a user query that declares it; `others`, a command for Agents, workflows, MCP and plugins that declares it. The test says
 * what the next call does (`use`), and the action answers with what came back or the code and message it was refused with.
 */
function launchProbe(name: string, options: { terminal?: boolean; ownerFiles?: boolean; halves?: readonly Where[] } = {}) {
  const id = `io.molis.work.example.${name}`, halves = options.halves ?? ["project"];
  const files = { read: `${name}:files-read`, write: `${name}:files-write` };
  // An action that starts a terminal in the owner files also makes the folder it starts in.
  const declared = [...(options.terminal === false ? [] : [TERMINAL]), ...(options.ownerFiles ? [files.read, files.write] : [])];
  const define = (where: Where, suffix: string, operation: "command" | "query", audiences: ActionDefinition["action"]["audiences"], permissions: string[]): ActionDefinition =>
    ({ capability_id: `${name}.${where}-${suffix}`, version: 1, operation, action: { title: `${where} ${suffix}`, description: "启动终端探针", kind: operation === "query" ? "query" : "operation",
      scope: where, audiences, permissions, ...(operation === "command" ? { scheduling: "concurrent" as const } : {}), subject_kinds: [], input_schema: { type: "object", additionalProperties: false } } });
  const actionsOf = (where: Where) => ({ run: define(where, "run", "command", ["user"], declared), undeclared: define(where, "undeclared", "command", ["user"], []),
    query: define(where, "query", "query", ["user"], declared), others: define(where, "others", "command", ["agent", "workflow", "mcp", "plugin"], declared) });
  const actions = Object.fromEntries(halves.map(where => [where, actionsOf(where)])) as Record<Where, ReturnType<typeof actionsOf>>;
  const required = options.ownerFiles ? ["storage:private", files.read, files.write] : [];
  const manifest: PluginManifest = { schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name, kind: "app",
    publisher: { publisher_id: "example", signature: `launch-${name}` }, entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [...required.map(permission => ({ permission, required: true, reason: "启动终端探针" })),
      ...(options.terminal === false ? [] : [{ permission: TERMINAL, required: false, reason: "启动终端探针" }]), { permission: WORKSPACE, required: false, reason: "启动终端探针" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] },
    actions: halves.flatMap(where => Object.values(actions[where])),
    ...(options.ownerFiles ? { owner_files: { store_name: name, entries: [{ name: "notes", kind: "directory" as const }], read_permission: files.read, write_permission: files.write } } : {}) };
  const services: Partial<Record<Where, PluginHostServices>> = {};
  let next: Use | undefined;
  const half = (where: Where): PluginDefinition => ({ manifest, start(context) {
    services[where] = context.services;
    return { kind: "app", actions: Object.values(actions[where]).map(action => ({ ...action, handle: async (caller: ActionExecutionContext): Promise<Outcome> => {
      const use = next; next = undefined;
      try { return { outcome: "ok", value: await use!(services[where]!, caller) ?? null }; }
      catch (error) { return error instanceof Error && "code" in error ? { outcome: String(error.code), message: error.message } : { outcome: "error", message: String(error) }; }
    } })) };
  } });
  const definitions = Object.fromEntries(halves.map(where => [where, half(where)])) as Record<Where, PluginDefinition>;
  return { id, actions, services, required, definitions, use(run: Use) { next = run; },
    fixtures: { project: halves.includes("project") ? [definitions.project] : [], home: halves.includes("home") ? [halves.length === 2 ? { definition: definitions.home, dual_instance: true as const } : definitions.home] : [] } };
}
type Probe = ReturnType<typeof launchProbe>;

/** A served Home with the probes' halves, a program that writes the folder it ran in to its first argument, and a folder for its markers. */
async function open(t: TestContext, probes: readonly Probe[]) {
  const f = await serveHomeRuntime(t, { pluginFixtures: { project: probes.flatMap(probe => probe.fixtures.project), home: probes.flatMap(probe => probe.fixtures.home) } });
  const bin = join(f.home, "bin"), markers = join(f.home, "markers"); await mkdir(bin); await mkdir(markers);
  const program = join(bin, "term");
  await writeFile(program, "#!/bin/sh\npwd -P > \"$1\"\nexec /bin/cat\n", { mode: 0o700 });
  let count = 0;
  return { ...f, program, marker: () => join(markers, String(++count)) };
}
type Served = Awaited<ReturnType<typeof open>>;

/**
 * A folder outside the Home linked to the project as its workspace, with a sub-folder, a file, a link that leaves it, and a folder named
 * `trail ` (ending in a space) beside a link `trail` that leaves it. (The catalog trims a linked folder's path, so the workspace's own name
 * never ends in a space.)
 */
async function linkWorkspace(t: TestContext, f: Served, project: Project) {
  const folder = await realpath(await mkdtemp(join(tmpdir(), "terminal-workspace-")));
  t.after(() => rm(folder, { recursive: true, force: true }));
  await mkdir(join(folder, "sub")); await writeFile(join(folder, "file.txt"), "not a folder");
  await symlink(tmpdir(), join(folder, "outside"));
  await mkdir(join(folder, "trail ")); await symlink(tmpdir(), join(folder, "trail"));
  const workspace = await withMolisWorkProjectCatalog({ homeDirectory: f.home }, async catalog => {
    await catalog.commit(() => catalog.addWorkspaceProject({ canonical_path: folder, project_id: project.project_id, actor_id: "test-user", user_confirmed: true }));
    return catalog.listWorkspaceDirectory(project.project_id).find(record => record.canonical_path === folder)!;
  });
  assert.ok(workspace, "the folder is linked to the project");
  return { folder, workspace_id: workspace.workspace_id };
}

/** The project's platform, started by a first call, and the probe's installation in it. */
async function projectInstall(f: Served, project: Project, probe: Probe) {
  await f.host.actionClient(project.reference).discover(await f.host.localPersonContext(project.reference));
  const platform = await f.host.withProject(project.reference, runtime => runningProjectPlatform(runtime.store, project.project_id));
  assert.ok(platform);
  const install = platform.runtime.list().find(record => record.plugin_id === probe.id);
  assert.ok(install);
  return { platform, install };
}

/** Grants the probe's optional permissions in the project and restarts it, as the person's switch does. */
async function grantInProject(f: Served, project: Project, probe: Probe, grants: readonly string[] = [TERMINAL, WORKSPACE]) {
  const { platform, install } = await projectInstall(f, project, probe);
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, [...probe.required, ...grants]);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}

async function grantInHome(f: Served, probe: Probe, grants: readonly string[] = [TERMINAL, WORKSPACE]) {
  const platform = await f.host.homePlugins!.ready(), install = f.host.homePlugins!.installation(probe.id)!;
  await platform.runtime.stop(install.install_id);
  platform.runtime.grant(install.install_id, [...probe.required, ...grants]);
  await platform.supervisor.restart(probe.id);
  return { platform, install: platform.runtime.get(install.install_id) };
}

/** Runs `use` inside the probe's action, as `caller` (the local person in the project by default); a refusal by the kernel is an outcome too. */
async function run(f: Served, probe: Probe, where: Where, action: keyof Probe["actions"][Where], use: Use, options: { project?: Project; caller?: ActionCallContext } = {}): Promise<Outcome> {
  const client = options.project ? f.host.actionClient(options.project.reference) : f.host.homeActionClient();
  const caller = options.caller ?? await f.host.localPersonContext(options.project?.reference);
  probe.use(use);
  try { return await client.invoke(caller, probe.actions[where][action], {}) as Outcome; }
  catch (error) { return error instanceof Error && "code" in error ? { outcome: String(error.code), message: error.message } : { outcome: "error", message: String(error) }; }
}

/** The panel the Host derives for this installation, project, person and key (`pluginTerminalFor`). */
const panelOf = (installId: string, projectId: string | null, key: string, actorId = LOCAL_PERSON_ACTOR_ID) =>
  "plugin-" + createHash("sha256").update(JSON.stringify([installId, projectId, actorId, key])).digest("hex").slice(0, 32);

/** What the Host's own terminal connection finds for a panel: a running one is attached, none is reported not started. */
async function panelState(f: Served, panelId: string): Promise<{ started: unknown; attached: unknown }> {
  const socket = new WebSocket(f.origin.replace("http:", "ws:") + "/pty");
  try {
    const reply = new Promise<Record<string, unknown>>((resolve, reject) => socket.on("message", raw => {
      const message = JSON.parse(raw.toString());
      if (message.type === "ready") socket.send(JSON.stringify({ type: "spawn", panelId, attachOnly: true }));
      if (message.type === "spawned") resolve(message);
      if (message.type === "error") reject(new Error(String(message.message)));
    }));
    await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
    socket.send(JSON.stringify({ type: "auth", token: f.token }));
    const spawned = await reply;
    return { started: spawned.started, attached: spawned.attached };
  } finally { socket.terminate(); }
}

/** The program ran: its marker names the folder it ran in. */
async function ranIn(marker: string): Promise<string> {
  const deadline = Date.now() + 5000;
  while (!existsSync(marker) || (await readFile(marker, "utf8")).trim() === "") {
    if (Date.now() > deadline) throw new Error("the terminal program did not run");
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return (await readFile(marker, "utf8")).trim();
}

/** Refused with `code`, and nothing ran. */
async function refused(f: Served, answer: Outcome, code: string, marker: string, panelId: string, why: string) {
  assert.equal(answer.outcome, code, `${why}: ${answer.message ?? JSON.stringify(answer.value)}`);
  await nothingRan(f, marker, panelId, why);
}

/** No program ran: no marker, and the derived panel is not alive. */
async function nothingRan(f: Served, marker: string, panelId: string, why: string) {
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(existsSync(marker), false, `${why}: no program ran`);
  assert.deepEqual(await panelState(f, panelId), { started: false, attached: false }, `${why}: no panel is alive`);
}

async function until(check: () => Promise<boolean>, why: string) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(why);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

/** A page of the plugin in a project, on the terminal channel (S-47). */
async function pageSocket(t: TestContext, f: Served, pluginId: string, project: Project) {
  const opened = await f.request(`/projects/${project.project_id}/api/host/plugin-pages`, { method: "POST", body: { plugin_id: pluginId } });
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
  return { send, wait, close: () => socket.terminate() };
}

const launch = (f: Served, key: string, marker: string, directory: unknown) => ({ key, title: "探针", program: { command: f.program, args: [marker] }, directory });
const opened = (own: PluginHostServices, input: unknown) => own.terminal!.open(input as Parameters<NonNullable<PluginHostServices["terminal"]>["open"]>[0]);

test("RAC-2550 S-103 a project plugin starts its terminal in a folder of the project's linked workspace; only its own page in this project attaches", { timeout: 60_000 }, async t => {
  const a = launchProbe("launcha"), b = launchProbe("launchb");
  const f = await open(t, [a, b]), project = await f.project("终端项目"), other = await f.project("另一个项目");
  const { folder, workspace_id } = await linkWorkspace(t, f, project);
  const { install } = await grantInProject(f, project, a); await grantInProject(f, project, b);
  const marker = f.marker();
  const answer = await run(f, a, "project", "run", own => opened(own, launch(f, "main", marker, { root: "workspace", workspace_id, path: "sub" })), { project });
  assert.equal(answer.outcome, "ok", answer.message);
  const panelId = (answer.value as { panelId: string }).panelId;
  assert.equal(panelId, panelOf(install.install_id, project.project_id, "main"), "the panel is derived from the call's installation, project and person");
  assert.equal(await ranIn(marker), join(folder, "sub"));
  const own = await pageSocket(t, f, a.id, project);
  own.send({ type: "spawn", panelId, attachOnly: true });
  assert.equal((await own.wait(message => message.type === "spawned")).attached, true);
  own.send({ type: "write", panelId, data: "LAUNCHED_INPUT\n" });
  await own.wait(message => message.type === "data" && String(message.data).includes("LAUNCHED_INPUT"));
  for (const [page, why] of [[await pageSocket(t, f, b.id, project), "another plugin's page in the project"], [await pageSocket(t, f, a.id, other), "the same plugin's page in another project"]] as const) {
    page.send({ type: "spawn", panelId, attachOnly: true });
    assert.match(String((await page.wait(message => message.type === "error")).message), /不属于/, why);
    page.close();
  }
  own.send({ type: "kill", panelId });
  await own.wait(message => message.type === "exit");
  own.close();
});

test("RAC-2551 S-103 a plugin that does not declare terminal:run has no terminal service; an optional terminal:run the person did not approve starts nothing", { timeout: 60_000 }, async t => {
  const bare = launchProbe("launchbare", { terminal: false }), bareHome = launchProbe("launchbarehome", { terminal: false, halves: ["home"] }), unapproved = launchProbe("launchunapproved");
  const f = await open(t, [bare, bareHome, unapproved]), project = await f.project("没有终端");
  const { workspace_id } = await linkWorkspace(t, f, project);
  await projectInstall(f, project, bare); await f.host.homePlugins!.ready();
  assert.ok(bare.services.project, "the project half started");
  assert.equal(bare.services.project.terminal, undefined, "project instance: no terminal service without terminal:run");
  assert.ok(bareHome.services.home, "the Home instance started");
  assert.equal(bareHome.services.home.terminal, undefined, "Home instance: no terminal service without terminal:run");
  const { install } = await grantInProject(f, project, unapproved, [WORKSPACE]);
  const marker = f.marker();
  // The person's call does not hold an ungranted permission, so the kernel refuses the action that declares it before the handler runs;
  // a grant taken away while the call runs is the service's own check (RAC-2556).
  const answer = await run(f, unapproved, "project", "run", own => opened(own, launch(f, "main", marker, { root: "workspace", workspace_id })), { project });
  await refused(f, answer, "actions.forbidden", marker, panelOf(install.install_id, project.project_id, "main"), "terminal:run declared optional and not approved");
});

test("RAC-2552 S-103 revoking terminal:run, disabling, uninstalling and stopping the project end the terminal; a handle kept from that activation starts nothing", { timeout: 90_000 }, async t => {
  const probe = launchProbe("launchend");
  const f = await open(t, [probe]), project = await f.project("终端结束");
  const { workspace_id } = await linkWorkspace(t, f, project);
  const start = async (key: string) => {
    const { platform, install } = await grantInProject(f, project, probe);
    const answer = await run(f, probe, "project", "run", own => opened(own, launch(f, key, f.marker(), { root: "workspace", workspace_id })), { project });
    assert.equal(answer.outcome, "ok", answer.message);
    const panelId = (answer.value as { panelId: string }).panelId;
    assert.deepEqual(await panelState(f, panelId), { started: false, attached: true }, `${key}: running`);
    return { platform, install, panelId, handle: probe.services.project! };
  };
  const ended = (panelId: string, why: string) => until(async () => (await panelState(f, panelId)).attached === false, `${why}: the terminal kept running`);

  const revoked = await start("revoked");
  await revoked.platform.runtime.regrant(revoked.install.install_id, TERMINAL, false);
  await ended(revoked.panelId, "revoking terminal:run");
  // Outside any action the stopped activation's handle does nothing: its promise never settles (BL-411, servicesUntilStopped).
  const outside = f.marker();
  const late = opened(revoked.handle, launch(f, "stale", outside, { root: "workspace", workspace_id })).then(() => "settled", () => "refused");
  assert.equal(await Promise.race([late, new Promise(resolve => setTimeout(() => resolve("pending"), 300))]), "pending");
  await nothingRan(f, outside, panelOf(revoked.install.install_id, project.project_id, "stale"), "the old handle outside an action");

  const disabled = await start("disabled");
  disabled.platform.supervisor.revoke(probe.id);
  await ended(disabled.panelId, "disabling");
  await disabled.platform.supervisor.enable(probe.id);

  const stopped = await start("stopped");
  await f.host.closeProject(project.reference);
  await ended(stopped.panelId, "stopping the project instance");
  // The next activation's own action, holding the old activation's handle: nothing starts.
  const { install } = await grantInProject(f, project, probe), stale = f.marker();
  const answer = await run(f, probe, "project", "run", () => opened(stopped.handle, launch(f, "stale-inside", stale, { root: "workspace", workspace_id })), { project });
  assert.equal(answer.outcome, "actions.forbidden", `the old handle inside the new activation's action: ${answer.message}`);
  await nothingRan(f, stale, panelOf(install.install_id, project.project_id, "stale-inside"), "the old handle inside the new activation's action");

  const uninstalled = await start("uninstalled");
  await uninstalled.platform.runtime.uninstall(uninstalled.install.install_id);
  await ended(uninstalled.panelId, "uninstalling");
});

test("RAC-2553 S-103 a query, a read-only call, another audience (the plugin's own included), an action that does not declare terminal:run, no action and another installation's action are refused", { timeout: 60_000 }, async t => {
  const probe = launchProbe("launchcalls"), other = launchProbe("launchcallsother");
  const f = await open(t, [probe, other]), project = await f.project("调用不对");
  const { workspace_id } = await linkWorkspace(t, f, project);
  const { install } = await grantInProject(f, project, probe); await grantInProject(f, project, other);
  const person = await f.host.localPersonContext(project.reference);
  const cases: Array<[string, () => Promise<Outcome>]> = [
    ["query", () => run(f, probe, "project", "query", own => opened(own, launch(f, "query", markers.query!, { root: "workspace", workspace_id })), { project })],
    // A read-only caller cannot run a command at all: the kernel refuses it before the service is reached.
    ...(["query_only", "read_only_effects"] as const).map((flag): [string, () => Promise<Outcome>] => [flag, () => run(f, probe, "project", "run",
      own => opened(own, launch(f, flag.replace(/_/gu, "-"), markers[flag]!, { root: "workspace", workspace_id })), { project, caller: { ...person, [flag]: true } })]),
    ["plugin", async () => {
      // The installation's own call outside any action is the `plugin` audience (PG-028): the Host issues that caller, the test cannot.
      probe.use(own => opened(own, launch(f, "plugin", markers.plugin!, { root: "workspace", workspace_id })));
      try { return await probe.services.project!.actions!.invoke(probe.actions.project.others, {}) as Outcome; }
      catch (error) { return { outcome: String((error as { code?: string }).code), message: String(error) }; }
    }],
    ...(["agent", "workflow", "mcp"] as const).map((audience): [string, () => Promise<Outcome>] => [audience, () => run(f, probe, "project", "others",
      own => opened(own, launch(f, audience, markers[audience]!, { root: "workspace", workspace_id })), { project, caller: { ...person, audience, runtime_session_id: `launch-${audience}` } })]),
    ["undeclared", () => run(f, probe, "project", "undeclared", own => opened(own, launch(f, "undeclared", markers.undeclared!, { root: "workspace", workspace_id })), { project })],
    ["outside", async () => {
      try { return { outcome: "ok", value: await opened(probe.services.project!, launch(f, "outside", markers.outside!, { root: "workspace", workspace_id })) }; }
      catch (error) { return { outcome: String((error as { code?: string }).code), message: String(error) }; }
    }],
    ["another-installation", () => run(f, other, "project", "run", () => opened(probe.services.project!, launch(f, "another-installation", markers["another-installation"]!, { root: "workspace", workspace_id })), { project })],
  ];
  const markers: Record<string, string> = Object.fromEntries(cases.map(([key]) => [key, f.marker()]));
  for (const [key, call] of cases) {
    const answer = await call();
    await refused(f, answer, "actions.forbidden", markers[key]!, panelOf(install.install_id, project.project_id, key.replace(/_/gu, "-")), key);
  }
});

test("RAC-2554 S-103 the folder must be in the project's own linked workspace (with workspace:read) or the plugin's owner files", { timeout: 90_000 }, async t => {
  const probe = launchProbe("launchdirs"), reader = launchProbe("launchnoread"), home = launchProbe("launchhomedirs", { halves: ["home"] });
  const f = await open(t, [probe, reader, home]), project = await f.project("目录不对"), other = await f.project("别的项目");
  const { workspace_id } = await linkWorkspace(t, f, project), foreign = await linkWorkspace(t, f, other);
  const { install } = await grantInProject(f, project, probe), noRead = await grantInProject(f, project, reader, [TERMINAL]);
  const homeInstall = (await grantInHome(f, home)).install;
  const cases: Array<[string, unknown, string, Probe?]> = [
    ["another project's workspace", { root: "workspace", workspace_id: foreign.workspace_id }, "actions.forbidden"],
    ["no such workspace", { root: "workspace", workspace_id: "ws-missing" }, "actions.forbidden"],
    ["dot-dot", { root: "workspace", workspace_id, path: ".." }, "actions.input_invalid"],
    ["climbing", { root: "workspace", workspace_id, path: "sub/../.." }, "actions.input_invalid"],
    ["absolute", { root: "workspace", workspace_id, path: "/etc" }, "actions.input_invalid"],
    ["nul", { root: "workspace", workspace_id, path: "sub\0" }, "actions.input_invalid"],
    ["empty segment", { root: "workspace", workspace_id, path: "sub//x" }, "actions.input_invalid"],
    ["dot", { root: "workspace", workspace_id, path: "./sub" }, "actions.input_invalid"],
    ["link out of the root", { root: "workspace", workspace_id, path: "outside" }, "actions.forbidden"],
    ["a file", { root: "workspace", workspace_id, path: "file.txt" }, "actions.input_invalid"],
    ["missing", { root: "workspace", workspace_id, path: "missing" }, "actions.input_invalid"],
    ["no owner files", { root: "owner_files" }, "actions.forbidden"],
    ["no workspace:read", { root: "workspace", workspace_id }, "plugin.grant_denied", reader],
    // The terminal host trims the folder it is given: `trail ` would run in `trail`, a link out of the root.
    ["trailing space", { root: "workspace", workspace_id, path: "trail " }, "actions.input_invalid"],
  ];
  for (const [key, directory, code, who = probe] of cases) {
    const marker = f.marker();
    const answer = await run(f, who, "project", "run", own => opened(own, launch(f, key.replace(/[^a-z]/gu, "-"), marker, directory)), { project });
    await refused(f, answer, code, marker, panelOf((who === reader ? noRead.install : install).install_id, project.project_id, key.replace(/[^a-z]/gu, "-")), key);
  }
  const marker = f.marker();
  const answer = await run(f, home, "home", "run", own => opened(own, launch(f, "homeless", marker, { root: "workspace", workspace_id })));
  await refused(f, answer, "actions.forbidden", marker, panelOf(homeInstall.install_id, null, "homeless"), "a Home call has no project, so no workspace");
});

test("RAC-2555 S-103 the input is the five keys and nothing else, bounded, the program one of two shapes; the identity is the call's", { timeout: 60_000 }, async t => {
  const probe = launchProbe("launchinput");
  const f = await open(t, [probe]), project = await f.project("输入不对");
  const { folder, workspace_id } = await linkWorkspace(t, f, project);
  const { install } = await grantInProject(f, project, probe);
  const directory = { root: "workspace", workspace_id };
  const base = (key: string, marker: string) => launch(f, key, marker, directory);
  type Input = ReturnType<typeof base>;
  const program = (input: Input, change: Record<string, unknown>) => ({ ...input, program: { ...input.program, ...change } });
  const cases: Array<[string, (input: Input) => unknown]> = [
    ...["cwd", "project_id", "actor_id", "install_id", "env", "command", "args"].map((extra): [string, (input: Input) => unknown] => [`extra-${extra.replace("_", "-")}`, input => ({ ...input, [extra]: extra === "env" ? { PATH: "/" } : "/" })]),
    ["relative-command", input => program(input, { command: "./term" })],
    ["nul-command", input => program(input, { command: f.program + "\0" })],
    // The terminal host trims the program it is given.
    ["spaced-command", input => program(input, { command: f.program + " " })],
    ["newline-command", input => program(input, { command: f.program + "\n" })],
    ["sparse-args", input => program(input, { args: new Array(3) })],
    // A Proxy passes Array.isArray; its length answers 0 once, then 40, each index a valid argument.
    ["proxy-length", input => {
      let reads = 0;
      return program(input, { args: new Proxy([input.program.args[0]], { get: (target, name) => name === "length" ? { valueOf: () => reads++ ? 40 : 0 }
        : typeof name === "string" && /^\d+$/u.test(name) ? input.program.args[0] : Reflect.get(target, name) }) });
    }],
    ["many-args", input => program(input, { args: Array.from({ length: 33 }, () => input.program.args[0]) })],
    ["nul-arg", input => program(input, { args: [input.program.args[0] + "\0"] })],
    ["number-arg", input => program(input, { args: [1] })],
    ["long-arg", input => program(input, { args: ["a".repeat(4097)] })],
    ["no-program", ({ program: _program, ...input }) => input],
    ["both-programs", input => program(input, { runtime: "codex" })],
    ["program-extra-key", input => program(input, { cwd: "/" })],
    ["unknown-runtime", input => ({ ...input, program: { runtime: "nope" } })],
    ["runtime-args", input => ({ ...input, program: { runtime: "codex", args: [] } })],
    ["long-subject", input => ({ ...input, subject: "s".repeat(201) })],
    ["empty-subject", input => ({ ...input, subject: "" })],
    ["Bad-Key", input => input],
    ["empty-title", input => ({ ...input, title: " " })],
    ["long-title", input => ({ ...input, title: "题".repeat(121) })],
    ["no-directory", ({ directory: _directory, ...input }) => input],
    ["other-root", input => ({ ...input, directory: { root: "home" } })],
    ["extra-directory-key", input => ({ ...input, directory: { ...directory, cwd: "/" } })],
  ];
  for (const [key, change] of cases) {
    const marker = f.marker();
    const answer = await run(f, probe, "project", "run", own => opened(own, change(base(key, marker))), { project });
    await refused(f, answer, "actions.input_invalid", marker, panelOf(install.install_id, project.project_id, key), key);
  }
  // The arguments are read once, by index, into the copy that is checked and started: an iterator or a getter that answers differently later
  // changes nothing (an iterator here yields 1000 arguments with NUL; a getter answers NUL on its second read).
  const iterated = (marker: string) => Object.assign([marker], { *[Symbol.iterator]() { for (let index = 0; index < 1000; index++) yield "\0bad"; } });
  const changing = (marker: string) => { let reads = 0; const args: string[] = []; Object.defineProperty(args, 0, { enumerable: true, get: () => reads++ ? "\0bad" : marker }); return args; };
  for (const [key, args] of [["iterated-args", iterated], ["changing-args", changing]] as const) {
    const marker = f.marker();
    const answer = await run(f, probe, "project", "run", own => opened(own, { ...base(key, marker), program: { command: f.program, args: args(marker) } }), { project });
    assert.equal(answer.outcome, "ok", `${key}: ${answer.message}`);
    assert.equal(await ranIn(marker), folder, `${key}: started with the checked arguments`);
  }
  // Two people, the same key: two panels. The person is the call's, never the input's.
  const person = await f.host.localPersonContext(project.reference), panels: string[] = [];
  for (const actor_id of [person.actor_id, "second-person"]) {
    const answer = await run(f, probe, "project", "run", own => opened(own, base("shared", f.marker())), { project, caller: { ...person, actor_id } });
    assert.equal(answer.outcome, "ok", `${actor_id}: ${answer.message}`);
    panels.push((answer.value as { panelId: string }).panelId);
  }
  assert.notEqual(panels[0], panels[1]);
  assert.equal(panels[1], panelOf(install.install_id, project.project_id, "shared", "second-person"));
});

test("RAC-2556 S-103 revoking terminal:run or workspace:read, or cancelling the call, while the folder is being looked up starts nothing", { timeout: 90_000 }, async t => {
  const probe = launchProbe("launchrace");
  const f = await open(t, [probe]), project = await f.project("解析中撤权");
  const { workspace_id } = await linkWorkspace(t, f, project);
  // The first await of the folder lookup is the catalog read: hold it there.
  let gate: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;
  f.host.configurePersonalPlanning(f.home, async (options, read) => {
    const held = gate; gate = undefined;
    if (held) { held.entered.resolve(); await held.release.promise; }
    return withMolisWorkProjectCatalog(options, read);
  });
  for (const invalidation of ["terminal:run", "workspace:read", "cancel"] as const) {
    const { platform, install } = await grantInProject(f, project, probe);
    const marker = f.marker(), key = invalidation.replace(":", "-"), controller = new AbortController();
    const held = { entered: deferred(), release: deferred() };
    const caller = await f.host.localPersonContext(project.reference, controller.signal);
    // Armed inside the handler, so the catalog read it holds is the one `open` makes.
    const pending = run(f, probe, "project", "run", own => { gate = held; return opened(own, launch(f, key, marker, { root: "workspace", workspace_id })); }, { project, caller });
    assert.equal(await Promise.race([held.entered.promise.then(() => "entered"), pending.then(answer => JSON.stringify(answer))]), "entered", `${invalidation}: the lookup reached the catalog`);
    const invalidated = invalidation === "cancel" ? (controller.abort(), Promise.resolve()) : platform.runtime.regrant(install.install_id, invalidation, false);
    held.release.resolve();
    const answer = await pending; await invalidated;
    // A revocation stops the instance after revoking its grant (regrant), so the check that answers is the instance's; a cancellation answers
    // with the call's own abort. The checks between the awaits are defence in depth: this proves one of them refuses before the spawn.
    // The cancellation's answer is the DOMException the abort raises: its raw `code` is ABORT_ERR (20).
    assert.deepEqual(answer, invalidation === "cancel" ? { outcome: String(DOMException.ABORT_ERR), message: "This operation was aborted" }
      : { outcome: "actions.forbidden", message: "此插件实例已停止，请重新打开" }, invalidation);
    await nothingRan(f, marker, panelOf(install.install_id, project.project_id, key), invalidation);
  }
});

test("RAC-2557 S-103 a sandboxed package that asks for terminal:run is stopped before its code starts, in a project and in the Home", { timeout: 60_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "terminal-sandbox-"));
  const manifest = (id: string, required: boolean): PluginManifest => ({ schema_version: 2, host_api_version: 2, plugin_id: id, version: "1.0.0", name: id.split(".").pop()!, kind: "app",
    publisher: { publisher_id: "example", signature: `sandbox-${id}` }, entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: [{ permission: "storage:private", required: true, reason: "probe" }, { permission: TERMINAL, required, reason: "probe" }],
    capabilities: { provides: [], consumes: [] }, artifacts: { produces: [], consumes: [] }, ui: { contributions: [] } });
  const started: string[] = [];
  const sandboxed = (id: string, required: boolean): PluginDefinition => ({ manifest: manifest(id, required), execution: "sandbox",
    async start(context) { started.push(context.plugin_id); return { kind: "app" }; } });
  const asks = [["io.molis.work.example.sbxtermrequired", true, ["storage:private", TERMINAL]], ["io.molis.work.example.sbxtermapproved", false, ["storage:private", TERMINAL]]] as const;

  const project = { project_id: "board", storage_key: join(home, "project.sqlite") };
  const store = new LocalProjectDatabase(project.storage_key);
  const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store.appendEvent(event), eventCursor: projectId => store.eventCursor(projectId) });
  const local = new LocalHost({ runtimeFactory: { open: () => ({ project_id: project.project_id, store, artifacts }), close: () => {} } });
  const actions = { registry: local.actionRegistry(project), client: { ...local.actionClient(project), ...local.syncActionClient(project) }, project_id: project.project_id };
  const executor = new PluginHostExecutor({ actions, project_id: project.project_id, actor_id: "web-user", artifacts, processItems, ui: new UiHost(), dependencyCheck: hostDependencyCheck(local.client(project)),
    privateStorageFor: () => ({ get: () => null, set: () => {}, delete: () => false }) });
  const runtime = new PluginRuntime(undefined, executor, { hostIds: ISOLATED_HOST_IDS });
  const homeActions = new ActionService();
  const homeHost = new HomePluginHost({ home, actorId: LOCAL_PERSON_ACTOR_ID, registry: homeActions, client: homeActions, entries: [] });
  t.after(async () => { try { await homeHost.close(); await local.close(); store.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const homeRuntime = (await homeHost.ready()).runtime;
  for (const [where, target] of [["project", runtime], ["Home", homeRuntime]] as const) {
    for (const [id, required, grants] of asks) {
      const { install } = target.install({ trust: { level: "unsigned" }, definition: sandboxed(`${id}${where.toLowerCase()}`, required), deployment: "local", grants: [...grants] });
      await assert.rejects(target.start(install.install_id), { code: "plugin.executor_failed" });
      assert.deepEqual({ state: target.get(install.install_id).state, code: target.get(install.install_id).last_error_code }, { state: "crashed", code: "sandbox.service_not_given" },
        `${where}: ${required ? "required" : "approved optional"} terminal:run`);
    }
  }
  assert.deepEqual(started, [], "no sandboxed package's code ran");
});

test("RAC-2564 S-103 a command is an absolute path or a bare name on the platform's PATH, anything else is refused and a missing name is unavailable; the terminal gets the platform's variables and, without a named workspace, the preferred one", { timeout: 60_000 }, async t => {
  const probe = launchProbe("launchprogram");
  const f = await open(t, [probe]), project = await f.project("程序");
  const { folder, workspace_id } = await linkWorkspace(t, f, project);
  const { install } = await grantInProject(f, project, probe);
  const directory = { root: "workspace", workspace_id };
  for (const [key, command, code] of [["semicolon", "a;b", "actions.input_invalid"], ["climbing", "../x", "actions.input_invalid"], ["relative-path", "x/y", "actions.input_invalid"],
    ["dot", ".", "actions.input_invalid"], ["dot-dot", "..", "actions.input_invalid"], ["spaced-name", "a b", "actions.input_invalid"],
    ["missing-name", "molis-work-no-such-command", "actions.unavailable"]] as const) {
    const marker = f.marker();
    const answer = await run(f, probe, "project", "run", own => opened(own, { key, title: "探针", program: { command, args: [marker] }, directory }), { project });
    await refused(f, answer, code, marker, panelOf(install.install_id, project.project_id, key), key);
  }
  const marker = f.marker();
  const answer = await run(f, probe, "project", "run", own => opened(own, { key: "named", program: { command: "sh", args: ["-c", `pwd -P > '${marker}.cwd'; env > '${marker}'; exec /bin/cat`] },
    subject: "S-1", directory: { root: "workspace" } }), { project });
  assert.equal(answer.outcome, "ok", answer.message);
  const panelId = panelOf(install.install_id, project.project_id, "named");
  assert.deepEqual(answer.value, { panelId, started: true });
  const env = Object.fromEntries((await ranIn(marker)).split("\n").map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]));
  assert.equal((await readFile(`${marker}.cwd`, "utf8")).trim(), folder, "the project's preferred linked workspace");
  assert.deepEqual({ MOLIS_WORK_HOME: env.MOLIS_WORK_HOME, MOLIS_WORK_MCP_AUDIENCE: env.MOLIS_WORK_MCP_AUDIENCE, MOLIS_WORK_RUNTIME_ID: env.MOLIS_WORK_RUNTIME_ID,
    MOLIS_WORK_WORK_CONTEXT_ID: env.MOLIS_WORK_WORK_CONTEXT_ID, MOLIS_WORK_WORK_CONTEXT_STABLE: env.MOLIS_WORK_WORK_CONTEXT_STABLE, MOLIS_WORK_PANEL_ID: env.MOLIS_WORK_PANEL_ID,
    MOLIS_WORK_FOCUS_ID: env.MOLIS_WORK_FOCUS_ID, MOLIS_WORK_WEB_URL: env.MOLIS_WORK_WEB_URL, TERM: env.TERM, COLORTERM: env.COLORTERM }, {
    MOLIS_WORK_HOME: f.home, MOLIS_WORK_MCP_AUDIENCE: "runtime", MOLIS_WORK_RUNTIME_ID: "command", MOLIS_WORK_WORK_CONTEXT_ID: panelId,
    MOLIS_WORK_WORK_CONTEXT_STABLE: "true", MOLIS_WORK_PANEL_ID: panelId, MOLIS_WORK_FOCUS_ID: "S-1", MOLIS_WORK_WEB_URL: f.origin, TERM: "xterm-256color", COLORTERM: "truecolor" });
  assert.equal(env.MOLIS_WORK_GOAL_ID, undefined, "the retired name is not set");
});

test("RAC-2569 S-103 a terminal's record is its installation's, project's and person's: nobody else lists or closes it; a Home call's record has no project", { timeout: 60_000 }, async t => {
  const probe = launchProbe("launchowners"), other = launchProbe("launchownersother"), home = launchProbe("launchownershome", { halves: ["home"], ownerFiles: true });
  const f = await open(t, [probe, other, home]), project = await f.project("记录归属");
  const { workspace_id } = await linkWorkspace(t, f, project);
  const { install } = await grantInProject(f, project, probe); await grantInProject(f, project, other);
  const homeInstall = (await grantInHome(f, home)).install;
  const person = await f.host.localPersonContext(project.reference), stranger = { ...person, actor_id: "second-person" };
  const panelId = panelOf(install.install_id, project.project_id, "mine");
  const mine = f.marker();
  const opening = await run(f, probe, "project", "run", own => opened(own, { ...launch(f, "mine", mine, { root: "workspace", workspace_id }), subject: "s1" }), { project });
  assert.equal(opening.outcome, "ok", opening.message);
  const list = (who: Probe, input?: { subject?: string }, caller = person) => run(f, who, "project", "query", own => own.terminal!.list(input), { project, caller });
  const close = (who: Probe, caller = person) => run(f, who, "project", "run", own => own.terminal!.close({ key: "mine" }), { project, caller });
  const listed = await list(probe, { subject: "s1" });
  assert.equal(listed.outcome, "ok", listed.message);
  assert.deepEqual((listed.value as Array<Record<string, unknown>>).map(({ created_at: _created, ...row }) => row),
    [{ key: "mine", panelId, title: "探针", runtime: "command", program: { command: f.program, args: [mine] }, subject: "s1", running: true }]);
  assert.deepEqual((await list(probe, { subject: "s2" })).value, [], "another subject");
  assert.deepEqual((await list(probe, undefined, stranger)).value, [], "another person lists nothing");
  assert.deepEqual((await list(other)).value, [], "another installation lists nothing");
  for (const [answer, why] of [[await close(probe, stranger), "another person"], [await close(other), "another installation"]] as const) {
    assert.equal(answer.outcome, "actions.missing", `${why}: ${answer.message}`);
    assert.deepEqual(await panelState(f, panelId), { started: false, attached: true }, `${why}: the terminal still runs`);
  }
  assert.equal((await close(probe)).outcome, "ok");
  await until(async () => (await panelState(f, panelId)).attached === false, "closing ends the terminal");
  assert.deepEqual((await list(probe)).value, [], "closing forgets it");
  // The owner files exist once written: the Home probe makes its folder first, as Shelf opens its store before its terminal.
  const homeAnswer = await run(f, home, "home", "run", async own => {
    await own.ownerFiles!.write(writer => writer.mkdir("notes"));
    return opened(own, launch(f, "home", f.marker(), { root: "owner_files", path: "notes" }));
  });
  assert.equal(homeAnswer.outcome, "ok", homeAnswer.message);
  const homePanel = panelOf(homeInstall.install_id, null, "home");
  await withMolisWorkProjectCatalog({ homeDirectory: f.home }, catalog => {
    assert.equal(catalog.terminalPanels.get(homePanel)?.project_id, null, "a Home call's record has no project");
    assert.equal(catalog.terminalPanels.listIds(project.project_id).includes(homePanel), false, "a project does not count a Home terminal");
  });
});

test("RAC-2560 S-103 the terminal channel only attaches: a control-token connection that asks to start a program, leaves out attachOnly, adds a key or sends a size out of bounds is refused and starts nothing", { timeout: 60_000 }, async t => {
  const f = await open(t, []);
  const socket = new WebSocket(f.origin.replace("http:", "ws:") + "/pty"), messages: Array<Record<string, unknown>> = [];
  socket.on("message", raw => messages.push(JSON.parse(raw.toString())));
  const reply = async (panelId: string) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const index = messages.findIndex(message => message.panelId === panelId && (message.type === "error" || message.type === "spawned"));
      if (index >= 0) return messages.splice(index, 1)[0]!;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("no answer for " + panelId + ": " + JSON.stringify(messages));
  };
  await new Promise<void>((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  // Closed here, before the fixture stops the server: an upgraded socket is not among the connections it closes.
  try {
    socket.send(JSON.stringify({ type: "auth", token: f.token }));
    await until(async () => messages.some(message => message.type === "ready"), "the control connection is ready");
    const cases: Array<[string, (panelId: string, marker: string) => Record<string, unknown>]> = [
      ["a program", (panelId, marker) => ({ type: "spawn", panelId, command: f.program, args: [marker], cwd: f.home })],
      ["attachOnly false", (panelId, marker) => ({ type: "spawn", panelId, attachOnly: false, command: f.program, args: [marker], cwd: f.home })],
      ["a sixth key", (panelId, marker) => ({ type: "spawn", panelId, attachOnly: true, command: f.program, args: [marker] })],
      ["a width of 0", panelId => ({ type: "spawn", panelId, attachOnly: true, cols: 0, rows: 24 })],
      ["a height of 1001", panelId => ({ type: "spawn", panelId, attachOnly: true, cols: 80, rows: 1001 })],
      ["a fractional width", panelId => ({ type: "spawn", panelId, attachOnly: true, cols: 80.5 })],
    ];
    for (const [why, message] of cases) {
      const panelId = `rac-2560-${why.replaceAll(" ", "-")}`, marker = f.marker();
      socket.send(JSON.stringify(message(panelId, marker)));
      assert.equal((await reply(panelId)).type, "error", `${why}: refused`);
      await nothingRan(f, marker, panelId, why);
    }
    // Attaching to a panel nobody started answers that nothing runs there, and starts nothing.
    socket.send(JSON.stringify({ type: "spawn", panelId: "rac-2560-none", attachOnly: true, cols: 80, rows: 24 }));
    assert.deepEqual(await reply("rac-2560-none"), { type: "spawned", panelId: "rac-2560-none", attached: false, started: false, replay: "" });
  } finally { socket.terminate(); }
});
