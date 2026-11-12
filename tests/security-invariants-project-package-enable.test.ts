import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { homeAgentDefinitions, pluginControlActions, pluginInstallActions } from "@molis-ai/molis-work-app-local-host";
import { ActionError, type ActionCallContext, type ActionDefinition, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { PLUGIN_PROJECTS_EXIST_PERMISSION, SANDBOX_PACKAGE_FILES, type PluginExecutor } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { ProjectPluginInstalledView } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";
import { SqlitePluginRuntimeRepository } from "@molis-ai/molis-work-plugin-runtime";
import { deferred, serveHomeRuntime } from "./fixtures/home-runtime.js";
import { person, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID, newPublisher, packageContract, signedAgentPackage, signedPackage } from "./fixtures/sandbox-package.js";
import { installedPackageHost, mac, observeSignedPackageLifecycle, projectInstallation } from "./fixtures/signed-package-host.js";

const target = { plugin_id: PACKAGE_PLUGIN_ID };
const empty = { type: "object", additionalProperties: false } as const;
const denied = () => new ActionError("actions.forbidden", "fixture withdrew the original enable permission");
const hold = () => ({ entered: deferred(), release: deferred() });
const enteredBefore = (pending: Promise<unknown>, marker: Promise<void>) =>
  Promise.race([marker, pending.then(() => assert.fail("the operation finished before its real wait point"))]);

function projectPackage(f: Awaited<ReturnType<typeof serveHomeRuntime>>, project: Awaited<ReturnType<typeof f.project>>) {
  const client = f.host.actionClient(project.reference), caller = person(project.project_id);
  return {
    client, caller,
    async install(bundle: ReturnType<typeof signedPackage>) {
      const { preview_id } = await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string };
      await client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id, consent: true, pin_label: "Fixture publisher" });
    },
    async row() {
      const { plugins } = await client.invoke(caller, ref(pluginInstallActions.installed), {}) as { plugins: ProjectPluginInstalledView[] };
      const row = plugins.find(plugin => plugin.plugin_id === PACKAGE_PLUGIN_ID);
      assert.ok(row);
      return row;
    },
    disable: () => client.invoke(caller, ref(pluginControlActions.disable), target),
    enable: (input: unknown, control?: Partial<ActionCallContext>) => client.invoke({ ...caller, ...control }, ref(pluginControlActions.enable), input),
  };
}

test("S-84 SCS-08 project enable requires the displayed disabled installation even across projects", mac, async t => {
  const f = await serveHomeRuntime(t), observe = observeSignedPackageLifecycle(t);
  const a = projectPackage(f, await f.project("Original installation")), b = projectPackage(f, await f.project("Other installation"));
  const bundle = signedPackage(newPublisher());
  await a.install(bundle); const first = observe();
  await b.install(bundle); const second = observe();
  await a.disable(); await b.disable();
  const selected = projectInstallation(await a.row()), other = projectInstallation(await b.row());
  assert.equal(selected.install_id, other.install_id, "the stable id alone cannot distinguish the two project installations");
  assert.notEqual(selected.installation_generation, other.installation_generation);
  const before = first.runtime.get(selected.install_id), otherBefore = second.runtime.get(other.install_id);
  const firstStart = t.mock.method(first.runtime, "start"), secondStart = t.mock.method(second.runtime, "start");

  await assert.rejects(a.enable(target), { code: "actions.input_invalid" });
  await assert.rejects(a.enable({ ...target, expected_installation: { ...selected, scope: "home" } }), { code: "actions.input_invalid" });
  for (const changed of [{ install_id: "a-forged-install" }, { installation_generation: "a-forged-generation" }, { version: "9.9.9" }, { manifest_digest: "0".repeat(64) }]) {
    await assert.rejects(a.enable({ ...target, expected_installation: { ...selected, ...changed } }), { code: "actions.provider_replaced" });
  }
  await assert.rejects(b.enable({ ...target, expected_installation: selected }), { code: "actions.provider_replaced" });
  assert.equal(firstStart.mock.callCount() + secondStart.mock.callCount(), 0);
  assert.deepEqual(first.runtime.get(selected.install_id), before);
  assert.deepEqual(second.runtime.get(other.install_id), otherBefore);
  assert.deepEqual(await a.enable({ ...target, expected_installation: selected }), { ...target, state: "running" });
  assert.ok(first.runtime.contribution(selected.install_id));
  await assert.rejects(a.enable({ ...target, expected_installation: selected }), { code: "plugin.state_invalid" });
  assert.equal(firstStart.mock.callCount(), 1, "a second click cannot restart a running installation");
});

test("S-84 SCS-08 project enable rechecks after the project line and supervisor gate", mac, async t => {
  const observe = observeSignedPackageLifecycle(t), h = await installedPackageHost();
  t.after(() => h.close());
  await h.install(signedPackage());
  const { runtime, supervisor } = observe();
  await h.control("disable", target);
  const selected = projectInstallation((await h.plugins())[0]!);
  const before = runtime.get(selected.install_id);
  const records = await h.host.withProject(h.reference, project => new SqlitePluginRuntimeRepository(project.store.db));
  const blocker = hold(), enqueued = deferred();
  const action: ActionDefinition = { capability_id: "fixture.hold_enable_line", version: 1, operation: "command",
    action: { title: "Hold project line", description: "Hold the real project line", scope: "project", kind: "operation", audiences: ["user"], permissions: [], subject_kinds: [], input_schema: empty, output_schema: { type: "null" } } };
  t.after(h.host.actionRegistry(h.reference).registerProvider({
    provider: { provider_id: "fixture.hold_enable_line", title: "Hold project line", kind: "system" },
    definitions: [action],
    handlers: [{ ...action, async handle() { blocker.entered.resolve(); await blocker.release.promise; return null; } }],
  }));
  const owner = Reflect.get(h.host, "host"), line = Reflect.get(owner, "line") as {
    enqueue(reference: LocalHostProjectReference, capability: ActionReference, invoke: () => Promise<unknown>, step?: boolean): Promise<unknown>;
  };
  const enqueue = line.enqueue;
  t.mock.method(line, "enqueue", function(this: typeof line, ...args: Parameters<typeof enqueue>) {
    const pending = enqueue.apply(this, args);
    if (args[1].capability_id === pluginControlActions.enable.capability_id) enqueued.resolve();
    return pending;
  });
  const start = t.mock.method(runtime, "start");
  const holding = h.client.invoke(h.person, action, {});
  try {
    await blocker.entered.promise;
    const pending = h.client.invoke(h.person, pluginControlActions.enable, { ...target, expected_installation: selected });
    await enteredBefore(pending, enqueued.promise);
    const replacement = { ...before, installation_generation: "replacement-while-queued" };
    records.save(replacement); blocker.release.resolve();
    await assert.rejects(pending, { code: "actions.provider_replaced" });
    assert.equal(start.mock.callCount(), 0);
    assert.deepEqual(runtime.get(selected.install_id), replacement);
  } finally { blocker.release.resolve(); await holding; records.save(before); }

  await h.control("enable", target);
  const gate = hold(), enableEntered = deferred(), stop = runtime.stop;
  t.mock.method(runtime, "stop", async function(this: typeof runtime, ...args: Parameters<typeof stop>) {
    const stopped = await stop.apply(this, args);
    gate.entered.resolve(); await gate.release.promise;
    return stopped;
  });
  const enable = supervisor.enable;
  t.mock.method(supervisor, "enable", function(this: typeof supervisor, ...args: Parameters<typeof enable>) {
    const pending = enable.apply(this, args); enableEntered.resolve(); return pending;
  });
  let allowed = true;
  supervisor.revoke(PACKAGE_PLUGIN_ID);
  try {
    await gate.entered.promise;
    const stopped = runtime.get(selected.install_id);
    assert.equal(stopped.state, "disabled", "the real stop has committed and still holds the Supervisor gate");
    const pending = h.client.invoke({ ...h.person, validate_authority: async () => { if (!allowed) throw denied(); } },
      pluginControlActions.enable, { ...target, expected_installation: selected });
    await enteredBefore(pending, enableEntered.promise);
    allowed = false; gate.release.resolve();
    await assert.rejects(pending, { code: "actions.forbidden" });
    assert.equal(start.mock.callCount(), 1, "only the earlier valid enable reached Runtime.start");
    assert.deepEqual(runtime.get(selected.install_id), stopped);
    assert.equal(await supervisor.ensureStarted(PACKAGE_PLUGIN_ID), undefined);
  } finally { gate.release.resolve(); }
});

test("S-84 SCS-08 a project enable cancelled or replaced during real executor startup commits nothing", mac, async t => {
  const observe = observeSignedPackageLifecycle(t), h = await installedPackageHost();
  t.after(() => h.close());
  await h.install(signedAgentPackage()); await h.control("disable", target);
  const { runtime, supervisor } = observe();
  const before = runtime.get((await h.plugins())[0]!.install_id), expected_installation = projectInstallation(before);
  const declarations = new DatabaseSync(homeSqlitePath(h.home, "agent-declarations"), { readOnly: true });
  t.after(() => declarations.close());
  const remembered = () => declarations.prepare("SELECT registration, updated_at FROM install_declarations WHERE install_id = ? AND owner_id = ?")
    .get(before.install_id, PACKAGE_PLUGIN_ID);
  const originalWords = remembered();
  assert.ok(originalWords, "the original signed method and role are remembered");
  const agent = homeAgentDefinitions(h.home);
  // Live material: the signed roles a round may be handed, then the methods, each with the installation that offers it.
  const offered = () => [
    ...agent.signedRoles().filter(role => role.owner_id === PACKAGE_PLUGIN_ID).map(({ name, install_id }) => ({ kind: "role", name, install_id })),
    ...agent.methods().filter(method => method.owner_id === PACKAGE_PLUGIN_ID).map(({ name, install_id }) => ({ kind: "method", name, install_id })),
  ];
  const editable = () => agent.registrations().find(registration => registration.owner_id === PACKAGE_PLUGIN_ID);
  const disabled = editable();
  assert.equal(disabled?.source.kind === "plugin" && disabled.source.state, "disabled");
  assert.deepEqual(offered(), []);
  const records = await h.host.withProject(h.reference, project => new SqlitePluginRuntimeRepository(project.store.db));
  const executor = Reflect.get(runtime, "executor") as PluginExecutor, start = executor.start;
  const stop = t.mock.method(executor, "stop");
  let gate = hold(), atRedemption = false;
  t.mock.method(executor, "start", async function(this: PluginExecutor, ...args: Parameters<PluginExecutor["start"]>) {
    const started = await start.apply(this, args);
    if (!atRedemption) { gate.entered.resolve(); await gate.release.promise; }
    return started;
  });
  const prototype: { redeem(...args: unknown[]): Promise<void> } = Object.getPrototypeOf(runtime);
  const redeem = prototype.redeem;
  t.mock.method(prototype, "redeem", async function(this: object, ...args: unknown[]) {
    await redeem.apply(this, args);
    if (this === runtime && atRedemption) { gate.entered.resolve(); await gate.release.promise; }
  });
  for (const change of ["cancel", "digest", "authority"] as const) {
    gate = hold();
    atRedemption = change === "authority";
    let allowed = true;
    const controller = new AbortController(), replacement = { ...before, manifest_digest: "0".repeat(64) };
    const pending = h.client.invoke({ ...h.person, signal: controller.signal, validate_authority: async () => { if (!allowed) throw denied(); } },
      pluginControlActions.enable, { ...target, expected_installation });
    try {
      await enteredBefore(pending, gate.entered.promise);
      assert.equal(supervisor.generation(PACKAGE_PLUGIN_ID), undefined, "the in-flight enable does not admit a lazy start");
      assert.equal(await supervisor.ensureStarted(PACKAGE_PLUGIN_ID), undefined);
      assert.deepEqual(runtime.get(before.install_id), before, "the original row is disabled at the real startup or redemption boundary");
      if (change === "cancel") controller.abort(new ActionError("actions.cancelled", "left the settings page"));
      else if (change === "digest") records.save(replacement);
      else allowed = false;
      gate.release.resolve();
      const code = change === "cancel" ? "actions.cancelled" : change === "digest" ? "actions.provider_replaced" : "actions.forbidden";
      await assert.rejects(pending, { code });
      assert.deepEqual(runtime.get(before.install_id), change === "digest" ? replacement : before);
      assert.equal(runtime.contribution(before.install_id), null);
      assert.deepEqual(offered(), [], "the stopped candidate leaves no live material");
      assert.deepEqual(editable(), disabled, "the disabled declaration stays editable");
      assert.deepEqual(remembered(), originalWords, "the rejected start does not write the remembered declaration");
      assert.equal(supervisor.generation(PACKAGE_PLUGIN_ID), undefined);
      assert.equal(await supervisor.ensureStarted(PACKAGE_PLUGIN_ID), undefined);
    } finally { gate.release.resolve(); if (change === "digest") records.save(before); }
  }
  assert.equal(stop.mock.callCount(), 3, "the successful worker starts were released without a new crash or recovery write");
  assert.deepEqual(await h.control("enable", target), { ...target, state: "running" });
  assert.deepEqual(offered().map(({ kind, name, install_id }) => ({ kind, name, install_id })), [
    { kind: "role", name: "审稿", install_id: before.install_id },
    { kind: "method", name: "校对", install_id: before.install_id },
  ], "the real role and method are offered by the same installation after successful enable");
});

test("S-84 SCS-08 a committed start still closes after caller withdrawal and cannot undo a newer disable", mac, async t => {
  const observe = observeSignedPackageLifecycle(t), h = await installedPackageHost();
  try {
    await h.install(signedPackage()); await h.control("disable", target);
    const { runtime, supervisor } = observe();
    const row = (await h.plugins())[0]!, expected_installation = projectInstallation(row);
    const executor = Reflect.get(runtime, "executor") as PluginExecutor;
    const stop = t.mock.method(executor, "stop"), start = runtime.start;
    let gate = hold(), notifications = 0;
    const detach = supervisor.observeActivation(() => { notifications++; });
    t.after(detach);
    t.mock.method(runtime, "start", async function(this: typeof runtime, ...args: Parameters<typeof start>) {
      const receipt = await start.apply(this, args);
      gate.entered.resolve(); await gate.release.promise;
      return receipt;
    });
    for (const change of ["disable", "withdraw"] as const) {
      gate = hold();
      let allowed = true;
      const pending = h.client.invoke({ ...h.person, validate_authority: async () => { if (!allowed) throw denied(); } },
        pluginControlActions.enable, { ...target, expected_installation });
      try {
        await enteredBefore(pending, gate.entered.promise);
        assert.equal(runtime.get(row.install_id).state, "running", "Runtime committed before Supervisor resumes");
        if (change === "disable") supervisor.revoke(PACKAGE_PLUGIN_ID);
        else allowed = false;
        gate.release.resolve();
        if (change === "disable") await assert.rejects(pending, /启用没有完成/u);
        else await assert.rejects(pending, { code: "actions.forbidden" });
        assert.equal(runtime.get(row.install_id).state, change === "disable" ? "disabled" : "running");
        assert.equal(await h.operation("notes.list"), undefined, "the rejected request publishes no legacy action");
        assert.equal(notifications, 0);
      } finally { gate.release.resolve(); }
    }
    assert.equal(stop.mock.callCount(), 1, "the newer disable stopped only its own target");
    await h.close();
    assert.equal(stop.mock.callCount(), 2, "closing the Host can still release the valid committed start");
  } finally { await h.close(); }
});

function projectedNotes(scope: "project" | "home", optionalGrant = false) {
  return signedPackage(newPublisher(), (files, manifest) => {
    const contract = packageContract(manifest.plugin_id);
    const add = contract.operations[1]!;
    add.external = true;
    if (optionalGrant) add.effects.projects = ["exist"];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    Object.assign(manifest, sandboxPluginManifest({ pluginId: manifest.plugin_id, name: manifest.name, version: manifest.version,
      publisher: manifest.publisher, presentation: false, contract, ...(scope === "home" ? { runtime: { scope } } : {}) }));
  });
}

test("S-84 SCS-08 withdrawn project enable does not publish declared actions or fail a shared catalog read", mac, async t => {
  const probe = { capability_id: "fixture.catalog_probe", version: 1 };
  let waiting: ReturnType<typeof hold> | undefined;
  const f = await serveHomeRuntime(t, { actionAvailability: async (_caller, view) => {
    if (view.capability_id === probe.capability_id && waiting) { waiting.entered.resolve(); await waiting.release.promise; }
    return view.availability;
  } });
  const project = await f.project("Exposure after enable"), observe = observeSignedPackageLifecycle(t), owned = projectPackage(f, project);
  t.after(f.host.actionRegistry(project.reference).registerProvider({
    provider: { provider_id: "fixture.catalog_probe", title: "Independent query", kind: "system" },
    definitions: [{ ...probe, operation: "query", action: { title: "Independent query", description: "Hold the shared catalog read", scope: "project",
      kind: "query", effect: "read", audiences: ["user", "plugin", "agent"], permissions: [], subject_kinds: [], input_schema: empty, output_schema: { type: "null" } } }],
    handlers: [{ ...probe, handle: () => null }],
  }));
  const bundle = projectedNotes("project");
  assert.equal(bundle.payload.manifest.actions?.length, 2);
  await owned.install(bundle); await owned.disable();
  const row = await owned.row(), { runtime, supervisor } = observe(), gate = hold();
  t.after(supervisor.observeActivation(pluginId => { if (pluginId === PACKAGE_PLUGIN_ID) waiting = gate; }));
  let allowed = true;
  const pending = owned.enable({ ...target, expected_installation: projectInstallation(row) },
    { validate_authority: async () => { if (!allowed) throw denied(); } });
  try {
    await enteredBefore(pending, gate.entered.promise);
    assert.equal(runtime.get(row.install_id).state, "running", "the real catalog wait is after the Runtime commit");
    const unrelated = owned.client.discover(owned.caller);
    allowed = false; waiting = undefined; gate.release.resolve();
    await assert.rejects(pending, { code: "actions.forbidden" });
    assert.ok((await unrelated).find(view => view.capability_id === probe.capability_id)?.availability.available);
    const views = (await owned.client.discover({ ...owned.caller, permissions: [...owned.caller.permissions, "storage:private"] }))
      .filter(view => view.provider.plugin_install_id === row.install_id);
    assert.equal(views.length, bundle.payload.manifest.actions?.length, "the original Runtime has the real declarations");
    assert.ok(views.every(view => !view.availability.available), "the failed exposure publishes none of their operations");
    assert.equal((await owned.row()).recovery_error, null, "caller withdrawal is not a plugin recovery failure");
  } finally { waiting = undefined; gate.release.resolve(); }
});

async function regrantRestoresProjectedAction(t: TestContext, scope: "project" | "home") {
  const f = await serveHomeRuntime(t), project = await f.project("Signed permission switch"), pkg = projectPackage(f, project);
  await pkg.install(projectedNotes(scope, true));
  const row = async () => scope === "project" ? await pkg.row() : f.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)!;
  const original = await row();
  const client = scope === "project" ? pkg.client : f.host.homeActionClient(), caller = person(scope === "project" ? project.project_id : null);
  const invoke = async () => {
    const view = (await client.discover(caller)).find(item => item.provider.plugin_install_id === original.install_id && item.action.local_id === "notes.list");
    assert.ok(view?.availability.available, JSON.stringify(view?.availability));
    return client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, {});
  };
  assert.deepEqual(await invoke(), []);
  const path = scope === "project" ? "/projects/" + project.project_id + "/api/plugin-trust/permissions/set" : "/api/settings/plugin-permissions/set";
  const response = await f.request(path, { method: "POST", body: { install_id: original.install_id, permission: PLUGIN_PROJECTS_EXIST_PERMISSION, granted: true } });
  assert.equal(response.status, 200, await response.clone().text());
  const permission = (await response.json()).permissions.find((item: { permission: string }) => item.permission === PLUGIN_PROJECTS_EXIST_PERMISSION);
  assert.equal(permission.granted, true, "the actual permission switch committed a changed grant");
  const after = await row();
  assert.deepEqual([after.install_id, after.installation_generation, after.version, after.manifest_digest],
    [original.install_id, original.installation_generation, original.version, original.manifest_digest], "permission restart retains the release");
  assert.equal(after.state, "running");
  assert.deepEqual(await invoke(), [], "the actual sandbox query still runs after regrant");
}

test("S-94 S-84 project regrant restores a real projected signed action on the same installation", mac, t => regrantRestoresProjectedAction(t, "project"));
test("S-94 S-84 home regrant restores a real projected signed action on the same installation", mac, t => regrantRestoresProjectedAction(t, "home"));
