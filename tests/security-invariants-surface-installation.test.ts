import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { HomeConsentLedger, PluginInstallService, SandboxPackageStore, pluginInstallActions, readSandboxIntegrationPackage, readSandboxPackage } from "@molis-ai/molis-work-app-local-host";
import { ActionError, defineSubjectContextAction, type ActionCallContext, type ActionClient, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { PLACEMENT_READ_PERMISSION, PLACEMENT_WRITE_PERMISSION, placementGoalActions, type PlacementCreateRequest } from "@molis-ai/molis-work-contracts/services/placement";
import { SANDBOX_PACKAGE_FILES, type PluginDefinition, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definePresentationOverviewAction, definePresentationValuesAction } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { HOST_BUILD_TRUST, MemoryPluginConsentLedger, MemoryPluginRuntimeRepository, PluginRuntime, signPluginPackage, verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { sandboxActionId, sandboxPackageBuildId, sandboxPluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { integrationPackage } from "./fixtures/home-upgrade-source.js";
import { APPROVED, fixture, homePackage, mac, person, ref } from "./fixtures/home-sandbox.js";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { PENDING, within } from "./fixtures/stopped-calls.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

const dependencyId = "io.molis.work.surface.source";
const actionId = (pluginId: string, publisher: string, localId: string) => sandboxActionId(sandboxPackageBuildId(pluginId, publisher), localId);

function surfacePackage(publisher = newPublisher(), options: { pluginId?: string; version?: string; dependency?: string; writable?: boolean; listId?: string } = {}): PluginPackageBundle {
  return signedPackage(publisher, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    const subject = { kind: "note", id: "n1" };
    const listId = options.listId ?? "notes.list";
    contract.operations[0]!.id = listId;
    contract.pages[0]!.regions[0]!.operationIds[0] = listId;
    files[SANDBOX_PACKAGE_FILES.interface] = files[SANDBOX_PACKAGE_FILES.interface]!.replaceAll("notes.list", listId);
    const context = defineSubjectContextAction(actionId(contract.pluginId, publisher.identity, "notes.context"), 1, "note", "Read note", []);
    const values = definePresentationValuesAction(actionId(contract.pluginId, publisher.identity, "notes.values"), 1, ["note"], "Read note values", []);
    contract.operations.push({ id: "notes.values", kind: "query", read_protocol: { kind: "presentation_values", subject_kinds: ["note"] },
      input: values.action.input_schema, output: values.action.output_schema!, effects: {}, errors: [], examples: [{ input: { subjects: [{ kind: "note", id: "n1" }], fields: [] }, output: { items: [] } }] });
    contract.operations.push({ id: "notes.context", kind: "query", read_protocol: { kind: "subject_context", subject_kind: "note" },
      input: context.action.input_schema, output: context.action.output_schema!, effects: {}, errors: [],
      examples: [{ input: { subject_id: subject.id }, output: { subject, revision: "1", title: "Note", content: "", truncated: false } }] });
    if (options.writable) contract.operations[1]!.effects.storage = ["read", "write"];
    else contract.operations[1]!.effects = {};
    contract.presentation = { objects: [{ kind: "note", fields: [{ key: "title", role: "title" }], forms: { chip: { fields: ["title"] } },
      actions: options.dependency ? [{ ref: options.dependency }] : [] }] };
    const runtime = { scope: "home" as const };
    Object.assign(manifest, sandboxPluginManifest({ pluginId: contract.pluginId, version: manifest.version, name: manifest.name,
      publisher: manifest.publisher, contract, runtime, presentation: false }));
    if (options.version) manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = `export const operations = {
      '${listId}': async () => [],
      'notes.add': async (input, sdk) => {${options.writable ? "await sdk.storage.set('note', input.text);" : ""} return true;},
      'notes.values': async () => ({ items: [] }),
      'notes.context': async input => ({ subject: { kind: 'note', id: input.subject_id }, revision: '1', title: 'Note', content: '', truncated: false }),
    };`;
  }, options);
}

function replacement(publisher: ReturnType<typeof newPublisher>, from: string, version: string, localId: string) {
  return signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" };
    manifest.upgrade_compatibility = { compatible_from_versions: [from] };
    for (const path of [SANDBOX_PACKAGE_FILES.contract, SANDBOX_PACKAGE_FILES.interface, SANDBOX_PACKAGE_FILES.entrypoint]) {
      files[path] = files[path]!.replaceAll("notes.list", localId);
    }
  }, { pluginId: dependencyId, version });
}

const previewOf = async (client: ActionClient, caller: ActionCallContext, bundle: PluginPackageBundle) =>
  (await client.invoke(caller, ref(pluginInstallActions.preview), { bundle }) as { preview_id: string }).preview_id;
const confirm = (client: Parameters<typeof previewOf>[0], caller: ActionCallContext, preview_id: string) =>
  client.invoke(caller, ref(pluginInstallActions.confirm), { preview_id, consent: true, pin_label: "Surface author" });

/** The action gateway first validates admission, then the handler, then the actual write. */
function holdFinalAuthorization(t: TestContext) {
  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let validations = 0;
  t.after(() => release.resolve());
  return { entered: entered.promise, release: release.resolve, async validate() {
    if (++validations === 3) { entered.resolve(); await release.promise; }
  } };
}

function watchConfirmation() {
  const entered = Promise.withResolvers<void>(), final = Promise.withResolvers<void>();
  let validations = 0;
  return { entered: entered.promise, final: final.promise, validate() {
    if (++validations === 2) entered.resolve();
    if (validations === 3) final.resolve();
  } };
}

function assertAbsent(home: string, pluginId: string, publisher: string, record: () => unknown) {
  assert.equal(record(), null);
  assert.equal(new HomeConsentLedger(home).publishers().some(pin => pin.key_id === publisher), false);
  assert.equal(new SandboxPackageStore(home).scopeOf(pluginId), undefined);
}

test("S-surface-composition SCS-16 signed Home confirmations from different projects keep the complete declaration check ahead of durable writes", mac, async t => {
  const h = await openTestHome(t);
  const one = await h.createProject("First confirmation"), two = await h.createProject("Second confirmation");
  const home = h.host.homePlugins!;
  const a = h.host.actionClient(one.reference), b = h.host.actionClient(two.reference);
  const first = person(one.project_id), second = person(two.project_id), source = newPublisher();
  const old = homePackage(source, { pluginId: dependencyId });
  assert.equal(old.payload.manifest.kind === "app" && old.payload.manifest.actions, undefined, "the kept app uses its contract operation projection");
  await confirm(b, second, await previewOf(b, second, old));
  await h.web.post("/api/settings/plugin-permissions/disable", { plugin_id: dependencyId });
  assert.equal(home.installation(dependencyId)?.state, "disabled");

  const oldRef = actionId(dependencyId, source.identity, "notes.list") + "@1";
  const candidate = await previewOf(a, first, surfacePackage(newPublisher(), { dependency: oldRef }));
  const newer = await previewOf(b, second, replacement(source, "1.0.0", "1.1.0", "notes.scan"));
  const leader = holdFinalAuthorization(t), follower = watchConfirmation();
  const installing = confirm(a, { ...first, validate_authority: leader.validate }, candidate);
  try {
    await Promise.race([leader.entered, installing.then(() => assert.fail("confirmation finished before its final authorization check"))]);
    const changing = confirm(b, { ...second, validate_authority: follower.validate }, newer);
    void changing.catch(() => undefined);
    await follower.entered;
    assert.equal(await within(follower.final), PENDING, "another project's final write waits behind the first confirmation");
    assert.equal(home.installation(dependencyId)?.version, "1.0.0");
    leader.release();
    await Promise.all([installing, changing]);
  } finally { leader.release(); }
  assert.equal(home.installation(PACKAGE_PLUGIN_ID)?.state, "running");
  assert.equal(home.installation(dependencyId)?.version, "1.1.0");

  const refusedId = "io.molis.work.surface.refused", refusedPublisher = newPublisher();
  const currentRef = actionId(dependencyId, source.identity, "notes.scan") + "@1";
  const stalePreview = await previewOf(a, first, surfacePackage(refusedPublisher, { pluginId: refusedId, dependency: currentRef }));
  const removing = await previewOf(b, second, replacement(source, "1.1.0", "1.2.0", "notes.search"));
  const removes = holdFinalAuthorization(t), waits = watchConfirmation();
  const updating = confirm(b, { ...second, validate_authority: removes.validate }, removing);
  try {
    await Promise.race([removes.entered, updating.then(() => assert.fail("upgrade finished before its final authorization check"))]);
    const stale = confirm(a, { ...first, validate_authority: waits.validate }, stalePreview);
    const rejected = assert.rejects(stale, { code: "plugin.declaration_invalid" });
    await waits.entered;
    assert.equal(await within(waits.final), PENDING);
    removes.release();
    await updating;
    await rejected;
  } finally { removes.release(); }
  assert.equal(home.installation(dependencyId)?.version, "1.2.0");
  assertAbsent(h.home, refusedId, refusedPublisher.identity, () => home.installation(refusedId));
});

test("S-surface-composition SCS-16 cancellation, revoked authority and Home closure refuse a queued confirmation before pin or save", mac, async t => {
  const h = await openTestHome(t);
  const project = await h.createProject("Queued confirmation");
  const home = h.host.homePlugins!, client = h.host.actionClient(project.reference), caller = person(project.project_id);
  for (const cause of ["cancelled", "forbidden", "closed"] as const) {
    const publisher = newPublisher(), pluginId = "io.molis.work.surface." + cause;
    const preview = await previewOf(client, caller, surfacePackage(publisher, { pluginId }));
    const release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
    const held = home.installationScope.run(async () => { entered.resolve(); await release.promise; });
    const waiting = watchConfirmation(), controller = new AbortController();
    let authorized = true;
    try {
      await entered.promise;
      const pending = confirm(client, { ...caller, signal: controller.signal, validate_authority: waiting.validate, assert_authority_current: () => {
        if (!authorized) throw new ActionError("actions.forbidden", "Authority was revoked while queued");
      } }, preview);
      const rejected = assert.rejects(pending, { code: cause === "closed" ? "actions.plugin_unavailable" : "actions." + cause });
      await waiting.entered;
      assert.equal(await within(waiting.final), PENDING);
      if (cause === "cancelled") controller.abort(new ActionError("actions.cancelled", "Request cancelled while queued"));
      if (cause === "forbidden") authorized = false;
      const closing = cause === "closed" ? home.close() : undefined;
      release.resolve();
      await rejected;
      await closing;
      assertAbsent(h.home, pluginId, publisher.identity, () => home.installation(pluginId));
    } finally { release.resolve(); await held; }
  }
});

test("S-surface-composition SCS-16 system references are sampled once for a signed confirmation and resampled for its next request", mac, async t => {
  const h = await fixture(t);
  const definition: ActionDefinition = { capability_id: "surface.reference", version: 1, operation: "query", action: {
    title: "Surface reference", description: "Temporary system declaration", kind: "query", scope: "home", audiences: ["user"], permissions: [],
    subject_kinds: [], input_schema: { type: "object" }, output_schema: { type: "boolean" },
  } };
  const remove = h.host.actionRegistry().registerProvider({ provider: { provider_id: "system.surface-reference", kind: "system", title: "Reference" },
    definitions: [definition], handlers: [{ ...definition, handle: () => true }] });
  const first = newPublisher(), second = newPublisher(), secondId = "io.molis.work.surface.next";
  const dependency = definition.capability_id + "@1", client = h.projectClient(), base = person();
  const initial = await previewOf(client, base, surfacePackage(first, { dependency }));
  const next = await previewOf(client, base, surfacePackage(second, { pluginId: secondId, dependency }));
  const kept = new SandboxPackageStore(h.home);
  let removed = false;
  await confirm(client, { ...base, assert_authority_current: () => {
    if (!removed && kept.scopeOf(PACKAGE_PLUGIN_ID) === "home") { remove(); removed = true; }
  } }, initial);
  assert.equal(removed, true);
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running");
  await assert.rejects(confirm(client, base, next), { code: "plugin.declaration_invalid" });
  assertAbsent(h.home, secondId, second.identity, () => h.host.homePlugins!.installation(secondId));
});

test("S-surface-composition SCS-16 recovery restores the exact signed edition after a late cancellation with its dependency gone", mac, async t => {
  const h = await fixture(t), source = newPublisher(), owner = newPublisher();
  await h.install(homePackage(source, { pluginId: dependencyId }));
  const original = surfacePackage(owner, { writable: true, dependency: actionId(dependencyId, source.identity, "notes.list") + "@1" });
  await h.install(original);
  const originalRecord = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID);
  assert.ok(originalRecord);
  const approval = () => h.store(db => db.prepare("SELECT item_value FROM plugin_private_values WHERE item_key = ?").get(APPROVED + PACKAGE_PLUGIN_ID));
  const originalApproval = approval();
  assert.ok(originalApproval);
  await h.host.homePlugins!.packageAction(dependencyId, "uninstall");
  await h.reopen();
  const home = h.host.homePlugins!;
  assert.equal(home.installation(PACKAGE_PLUGIN_ID)?.state, "running", "the exact installed edition starts without re-admitting its external reference");
  const next = surfacePackage(owner, { version: "1.1.0" });
  const client = h.projectClient(), base = person();
  const absentOwnAction = surfacePackage(owner, { version: "1.1.0", listId: "notes.browse",
    dependency: actionId(PACKAGE_PLUGIN_ID, owner.identity, "notes.list") + "@1" });
  await assert.rejects(previewOf(client, base, absentOwnAction), { code: "plugin.declaration_invalid" });
  assert.equal(home.installation(PACKAGE_PLUGIN_ID)?.version, "1.0.0");
  let sawCommitted = false;
  const lateCancel = { ...base, assert_authority_current: () => {
    const record = home.installation(PACKAGE_PLUGIN_ID);
    if (record?.version === "1.1.0" && record.state === "running") {
      sawCommitted = true;
      throw new ActionError("actions.cancelled", "Cancellation after the Runtime adopted the upgrade");
    }
  } };
  await assert.rejects(confirm(client, lateCancel, await previewOf(client, base, next)), { code: "actions.cancelled" });
  assert.equal(sawCommitted, true);
  const restored = home.installation(PACKAGE_PLUGIN_ID);
  assert.deepEqual([restored?.install_id, restored?.installation_generation, restored?.version, restored?.manifest_digest, restored?.state],
    [originalRecord.install_id, originalRecord.installation_generation, "1.0.0", originalRecord.manifest_digest, "running"]);
  assert.deepEqual(approval(), originalApproval);
  const running = await h.homeClient().discover(h.homeCaller());
  assert.ok(running.some(view => view.provider.plugin_id === PACKAGE_PLUGIN_ID && view.action.local_id === "notes.values" && view.availability.available));

  const runtime = (await home.ready()).runtime;
  const rollback = runtime.rollback.bind(runtime), restoring = Promise.withResolvers<void>(), resume = Promise.withResolvers<void>();
  const paused = t.mock.method(runtime, "rollback", async (input: Parameters<PluginRuntime["rollback"]>[0]) => {
    restoring.resolve();
    await resume.promise;
    return rollback(input);
  });
  const switching = confirm(client, lateCancel, await previewOf(client, base, next));
  const refused = assert.rejects(switching);
  try {
    await Promise.race([restoring.promise, refused.then(() => assert.fail("the attempt did not reach Runtime recovery"))]);
    await runtime.uninstall(originalRecord.install_id, { retain_private_data: true });
    const nextDefinition: PluginDefinition = { manifest: readSandboxPackage(next.payload).manifest, execution: "sandbox",
      start: async () => assert.fail("this test keeps the replacement stopped") };
    const replacement = runtime.install({ definition: nextDefinition, grants: ["storage:private"], deployment: "local",
      trust: { level: "pinned", publisher_key_id: owner.identity } }).install;
    assert.notEqual(replacement.installation_generation, originalRecord.installation_generation);
    resume.resolve();
    await refused;
    assert.deepEqual(runtime.get(replacement.install_id), replacement, "recovery cannot write over another installation generation");
  } finally { resume.resolve(); paused.mock.restore(); }
  const former: PluginDefinition = { manifest: readSandboxPackage(original.payload).manifest, execution: "sandbox", start: async () => ({ kind: "app" }) };
  await assert.rejects(rollback({ install_id: originalRecord.install_id, definition: former }), { code: "plugin.declaration_invalid" });
  assert.equal(home.installation(PACKAGE_PLUGIN_ID)?.version, "1.1.0", "an ordinary rollback has no failed-switch authority");
});

test("S-surface-composition SCS-16 Placement can call into the project while its signed confirmation owns that project's line", mac, async t => {
  const h = await openTestHome(t), project = await h.createProject("Concurrent placement", ["pages"]);
  const client = h.host.actionClient(project.reference), caller = person(project.project_id);
  const pendingPreview = await previewOf(client, caller, surfacePackage());
  const homeEntered = Promise.withResolvers<void>(), releasePlacement = Promise.withResolvers<void>();
  const placement = h.host.homeActionClient().invoke({ ...person(null), permissions: [PLACEMENT_READ_PERMISSION, PLACEMENT_WRITE_PERMISSION],
    validate_authority: async () => { homeEntered.resolve(); await releasePlacement.promise; },
  }, ref(placementGoalActions.create), { station: "pages", project_id: project.project_id, title: "Placement during install",
    request_id: "place-during-surface-install" } satisfies PlacementCreateRequest) as Promise<{ object: { project_id: string } }>;
  try {
    await Promise.race([homeEntered.promise, placement.then(() => assert.fail("Placement did not enter the Home action line"))]);
    const waiting = watchConfirmation();
    const installing = confirm(client, { ...caller, validate_authority: waiting.validate }, pendingPreview);
    await Promise.race([waiting.entered, installing.then(() => assert.fail("confirmation did not enter the project action line"))]);
    releasePlacement.resolve();
    const [created] = await Promise.all([placement, installing]);
    assert.equal(created.object.project_id, project.project_id);
    assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running");
  } finally { releasePlacement.resolve(); }
});

test("S-surface-composition SCS-16 a built-in Home enable waits on the installation line before following the current build", async t => {
  const h = await fixture(t), pluginId = "io.molis.work.feed";
  const previousHost = h.host.homePlugins!, platform = await previousHost.ready();
  const installation = previousHost.installation(pluginId), current = previousHost.manifest(pluginId);
  assert.ok(installation && current);
  platform.supervisor.revoke(pluginId);
  await platform.runtime.stop(installation.install_id);
  // Seed a disabled record for the build the Home ran before this Host.
  const oldVersion = current.version === "0.1.0" ? "0.0.1" : "0.1.0";
  const old: PluginDefinition = { manifest: { ...current, version: oldVersion }, start: async () => assert.fail("disabled old build should not start") };
  platform.runtime.install({ definition: old, trust: HOST_BUILD_TRUST, deployment: installation.deployment });
  await h.reopen();
  const home = h.host.homePlugins!, web = await serveTestHost(null, { home: h.home, host: h.host });
  const release = Promise.withResolvers<void>(), entered = Promise.withResolvers<void>();
  const held = home.installationScope.run(async () => { entered.resolve(); await release.promise; });
  try {
    await entered.promise;
    const enabling = web.web.post(`/api/plugins/${pluginId}/enable`, {});
    assert.equal(await within(enabling), PENDING);
    assert.deepEqual([home.installation(pluginId)?.state, home.installation(pluginId)?.version], ["disabled", oldVersion]);
    release.resolve();
    await enabling;
    const followed = home.installation(pluginId);
    assert.deepEqual([followed?.state, followed?.version, followed?.installation_generation], ["running", current.version, installation.installation_generation]);
  } finally { release.resolve(); await held; await web.close(); }
});

test("S-surface-composition SCS-16 the Runtime refuses a presented definition without its trusted catalog hook", async t => {
  const publisher = newPublisher(), bundle = surfacePackage(publisher);
  const definition: PluginDefinition = { manifest: readSandboxPackage(bundle.payload).manifest, execution: "sandbox", start: async () => ({ kind: "app" }) };
  const repository = new MemoryPluginRuntimeRepository(), runtime = new PluginRuntime(repository, undefined, { scope: "home", hostIds: new Set() });
  assert.throws(() => runtime.install({ definition, grants: ["storage:private"], deployment: "local", trust: { level: "pinned", publisher_key_id: publisher.identity } }),
    { code: "plugin.declaration_invalid" });
  assert.deepEqual(repository.list(), []);
  const home = await mkdtemp(join(tmpdir(), "surface-catalog-unavailable-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const service = new PluginInstallService({ ledger: new MemoryPluginConsentLedger(), packages: new SandboxPackageStore(home),
    installInProject: async () => assert.fail("unadmitted project installation"), installInHome: async () => assert.fail("unadmitted Home installation"),
    installed: async () => [], control: async () => assert.fail("unadmitted control") });
  await assert.rejects(service.preview({ bundle }, { project_id: "project", actor_id: "person" }), { code: "plugin.declaration_invalid" });
});

test("S-sandbox-presentation a signed integration cannot carry presentation, read protocols or external action metadata", () => {
  const publisher = newPublisher(), original = integrationPackage(publisher);
  assert.equal(readSandboxIntegrationPackage(original.payload).manifest.kind, "integration");
  for (const mutate of [
    (contract: SandboxPluginContract) => { contract.presentation = { objects: [] }; },
    (contract: SandboxPluginContract) => { contract.operations[0]!.external = true; },
    (contract: SandboxPluginContract) => {
      const overview = definePresentationOverviewAction("surface.overview", 1, "Overview", []);
      contract.operations[0] = { id: contract.operations[0]!.id, kind: "query", read_protocol: { kind: "presentation_overview" },
        input: overview.action.input_schema, output: overview.action.output_schema!, effects: {}, errors: [], examples: [{ input: {}, output: { summary: { literal: "Summary" }, subjects: [], start: [] } }] };
    },
  ]) {
    const { payload } = structuredClone(original);
    const file = payload.files.find(file => file.path === SANDBOX_PACKAGE_FILES.contract)!;
    const contract = JSON.parse(Buffer.from(file.content_base64, "base64").toString("utf8")) as SandboxPluginContract;
    mutate(contract);
    file.content_base64 = Buffer.from(JSON.stringify(contract)).toString("base64");
    const signed = verifyPluginPackageSignature(signPluginPackage({ payload, signature: null, publisher_key: null }, publisher.signer)).bundle;
    assert.throws(() => readSandboxIntegrationPackage(signed.payload), error => error instanceof ActionError && error.code === "plugin.declaration_invalid"
      && /集成包.*不能声明/u.test(error.message));
  }
});
