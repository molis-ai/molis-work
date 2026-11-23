import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, actionReachesAudience, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { HOST_BUILD_TRUST, UNSIGNED_TRUST } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, SandboxPackageStore, readSandboxPackage, pluginInstallActions, type HomePluginHost } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./fixtures/sandbox-package.js";
import { APPROVED, SECOND_PLUGIN_ID, fixture, homePackage, mac, operate, operationsOf, person, ref, refused, valuesOf } from "./fixtures/home-sandbox.js";

// BL-628 (S-80, S-84, S-91): what the Home's instance of a signed package does NOT take. Each case asserts the refusal itself and what
// it left behind (nothing: no installation, no kept approval, no offered action); the positive cases are in home-installed-plugins.test.ts.

type Release = Parameters<HomePluginHost["installPackage"]>[0];
const APPROVAL_OWNER = "agent-studio:~home";

/** A stored, verified release without the publisher pin that confirmation normally records. */
function releaseOf(home: string, bundle: PluginPackageBundle): Release {
  const pkg = readSandboxPackage(bundle.payload), store = new SandboxPackageStore(home);
  store.save(bundle, pkg);
  return store.load(pkg.manifest.plugin_id, pkg.manifest.publisher.signature, pkg.manifest.version);
}
const changed = (release: Release, edit: { manifest?: (manifest: PluginManifest) => PluginManifest; trust?: unknown }): Release => {
  const packaged = release.packaged!;
  return { ...release, packaged: { manifest: edit.manifest ? edit.manifest(packaged.manifest) : packaged.manifest, trust: (edit.trust ?? packaged.trust) as typeof packaged.trust } };
};

// QEA-136: the positive install includes the person's real confirmation.
test("RAC-962 RAC-963 S-80 the Home's Runtime takes a package only of its own range, under a pin, in the sandbox, without what only a project holds; a refusal leaves nothing", mac, async t => {
  const h = await fixture(t), publisher = newPublisher();
  const bundle = homePackage(publisher), home = releaseOf(h.home, bundle);
  const cases: Array<[string, Release, string]> = [
    ["a package of the project's range", releaseOf(h.home, signedPackage(newPublisher(), undefined, { pluginId: SECOND_PLUGIN_ID })), "plugin.home_scope_unavailable"],
    ["output ports, which a project's database holds", changed(home, { manifest: manifest => Object.assign({}, manifest, { ports: { inputs: [], outputs: [{ port_id: "x" }] } }) }), "plugin.state_invalid"],
    ["no signature behind it (unsigned)", changed(home, { trust: UNSIGNED_TRUST }), "plugin.home_scope_unavailable"],
    ["the Host's own trust level on a sandboxed package", changed(home, { trust: HOST_BUILD_TRUST }), "plugin.grant_denied"],
    ["a signed release with no publisher pin", home, "plugin.publisher_revoked"],
  ];
  for (const [name, release, code] of cases) {
    await assert.rejects(h.host.homePlugins!.installPackage(release), refused(code), name);
    const id = release.pluginId;
    assert.ok(!h.host.homePlugins!.installation(id), `${name}: no installation`);
    assert.equal(h.host.homePlugins!.hasPackage(id), false, `${name}: not a Home package`);
    assert.equal(h.host.homePlugins!.outsideBuild().includes(id), false, `${name}: not offered to a project`);
    assert.deepEqual(valuesOf(h.home, APPROVAL_OWNER).filter(key => key === APPROVED + id), [], `${name}: no approval was kept`);
    assert.deepEqual(await operationsOf(h.homeClient(), h.homeCaller(), id), [], `${name}: no action is offered`);
  }
  await h.install(bundle);
  assert.equal(h.ledger.publishers().find(pin => pin.key_id === publisher.identity)?.revoked_at, null);
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running");
});

// QEA-136: check the durable installation, data and availability after reopening the Home.
test("RAC-964 S-84 a Home package runs only while its publisher's pin stands: a missing or revoked pin prevents startup and leaves its data intact", mac, async t => {
  const h = await fixture(t), revoked = newPublisher(), missing = newPublisher();
  const third = "com.example.third";
  await h.install(homePackage(revoked));
  await h.install(homePackage(newPublisher(), { pluginId: SECOND_PLUGIN_ID }));
  await h.install(homePackage(missing, { pluginId: third }));
  const rowsFor = (installId: string) => h.store(db => db.prepare("SELECT item_key, item_value FROM plugin_private_values WHERE install_id = ? ORDER BY item_key").all(installId));
  const held = [];
  for (const id of [PACKAGE_PLUGIN_ID, third]) {
    const installId = h.host.homePlugins!.installation(id)!.install_id;
    const views = await operationsOf(h.homeClient(), h.homeCaller(), id);
    assert.equal(await operate(h.homeClient(), h.homeCaller(), views, "notes.add", { text: id }), true);
    assert.deepEqual(await operate(h.homeClient(), h.homeCaller(), views, "notes.list", {}), [{ id: "1", text: id }]);
    const rows = rowsFor(installId);
    assert.ok(rows.length, `${id} has stored data`);
    held.push({ id, installId, rows });
  }

  await h.host.close();
  const revokedAt = "2026-10-26T00:00:00.000Z";
  assert.equal(h.ledger.revokePublisher(revoked.identity, revokedAt)?.revoked_at, revokedAt);
  // Keep the cold fixture's installed package and data, but remove its publisher pin from the isolated store.
  const store = new DatabaseSync(join(h.home, "plugin-runtime", "plugin-runtime.db"));
  try { assert.equal(store.prepare("DELETE FROM plugin_publishers WHERE key_id = ?").run(missing.identity).changes, 1); }
  finally { store.close(); }
  await h.reopen();

  for (const { id, installId, rows } of held) {
    assert.equal(h.host.homePlugins!.packageError(id, "code"), "plugin.publisher_revoked");
    assert.match(h.host.homePlugins!.packageError(id) ?? "", /撤销信任/, `${id} says why it does not run`);
    assert.equal(h.host.homePlugins!.installation(id)?.install_id, installId, `${id} keeps its installation`);
    assert.notEqual(h.host.homePlugins!.installation(id)?.state, "running", `${id} does not start`);
    assert.equal(h.host.homePlugins!.outsideBuild().includes(id), false, `${id} is not offered to a project`);
    assert.deepEqual(await operationsOf(h.homeClient(), h.homeCaller(), id), [], `${id} offers no action`);
    assert.deepEqual(rowsFor(installId), rows, `${id} keeps its stored data`);
  }
  assert.equal(h.host.homePlugins!.packageError(SECOND_PLUGIN_ID), undefined, "another publisher's package is not affected");
  assert.ok(h.host.homePlugins!.outsideBuild().includes(SECOND_PLUGIN_ID));
  const other = await operationsOf(h.homeClient(), h.homeCaller(), SECOND_PLUGIN_ID);
  assert.equal(await operate(h.homeClient(), h.homeCaller(), other, "notes.add", { text: "still running" }), true);
  assert.deepEqual(await operate(h.homeClient(), h.homeCaller(), other, "notes.list", {}), [{ id: "1", text: "still running" }]);
  const pins = new HomeConsentLedger(h.home).publishers();
  assert.deepEqual(pins.filter(pin => pin.revoked_at !== null).map(pin => pin.key_id), [revoked.identity]);
  assert.equal(pins.some(pin => pin.key_id === missing.identity), false);
});

/** `homePackage`'s notes, plus one command per capability that calls it and answers what became of the call. */
function reaching(publisher: ReturnType<typeof newPublisher>, capabilities: Record<string, string>, pluginId?: string): PluginPackageBundle {
  return signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.add")!.effects.storage = ["read", "write"];
    const probes = Object.entries(capabilities);
    for (const [operationId, capability] of probes) {
      contract.operations.push({ id: operationId, kind: "command", input: { type: "object", properties: {}, required: [], additionalProperties: false }, output: { type: "string" },
        errors: [], effects: { capabilities: [capability] }, examples: [{ input: {}, output: "x" }] });
    }
    contract.pages[0]!.regions[0]!.operationIds.push(...probes.map(([operationId]) => operationId));
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] += probes.map(([operationId, capability]) =>
      `operations[${JSON.stringify(operationId)}] = async (_input, sdk) => { try { await sdk.capability.call(${JSON.stringify(capability)}, {}); return 'allowed'; } catch (error) { return error.code ?? String(error); } };\n`).join("");
  }, pluginId ? { pluginId } : {});
}

test("RAC-966 RAC-2644 S-91 S-107 without a triggering project and its consent, a Home package reads Home actions but cannot call project actions", mac, async t => {
  const h = await fixture(t);
  const caller: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [] };
  await h.host.homePlugins!.ready();
  // A read that needs no input, of the Home's and of a project's, as the Host offers them to a plugin.
  const reads = (views: Awaited<ReturnType<ReturnType<typeof h.homeClient>["discover"]>>, scope: string) => views.find(view => view.action.kind === "query" && view.action.scope === scope
    && actionReachesAudience(view.action, view.capability_id, "plugin") && view.availability.available !== false && !view.action.permissions.length
    && !(view.action.input_schema as { required?: string[] }).required?.length);
  const homeRead = reads(await h.homeClient().discover(caller), "home"), projectRead = reads(await h.projectClient().discover(h.projectCaller()), "project");
  assert.ok(homeRead && projectRead, "the Host offers a read of each range");

  await h.install(reaching(newPublisher(), { "probe.home": homeRead.capability_id })); await h.switchOn(PACKAGE_PLUGIN_ID, "capabilities:call");
  const views = await operationsOf(h.homeClient(), caller);
  assert.notEqual(await operate(h.homeClient(), caller, views, "probe.home", {}), "plugin.capability_denied", "a read of the Home's passes");

  // A package naming an action of a project installs (the Home cannot know what a person's projects will hold), but the Home's catalog does
  // not have it: the operation that depends on it is refused before any code runs, and the one that does not depend on it is not affected.
  await h.install(reaching(newPublisher(), { "probe.project": projectRead.capability_id }, SECOND_PLUGIN_ID)); await h.switchOn(SECOND_PLUGIN_ID, "capabilities:call");
  const second = await operationsOf(h.homeClient(), caller, SECOND_PLUGIN_ID);
  await assert.rejects(operate(h.homeClient(), caller, second, "probe.project", {}), (error: { code?: string; message?: string }) =>
    error.code === "plugin.capability_unavailable" || /这项功能依赖的能力当前不可用/.test(error.message ?? ""));
  assert.equal(await operate(h.homeClient(), caller, second, "notes.add", { text: "fine" }), true, "an operation that names no action of a project still runs");
  assert.equal(h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID)?.state, "running", "the other package is untouched");
});

test("RAC-1500 RAC-1501 RAC-1504 RAC-1683 RAC-2616 S-84 another publisher is refused without writes; its own compatible Home upgrade preserves the installation", mac, async t => {
  const h = await fixture(t), a = newPublisher(), b = newPublisher(), c = newPublisher();
  await h.install(homePackage(a));
  await h.install(homePackage(c, { pluginId: SECOND_PLUGIN_ID }));
  await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.add", { text: "kept" });

  const written = async () => ({ pins: h.ledger.publishers().map(pin => pin.key_id).sort(), dirs: (await readdir(join(h.home, "plugin-packages"))).sort() });
  const held = () => {
    const installation = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID);
    return { install_id: installation?.install_id, version: installation?.version, state: installation?.state,
      approvals: valuesOf(h.home, APPROVAL_OWNER).filter(key => key.startsWith(APPROVED)).sort() };
  };
  const installation = held();
  // Each confirmation is compared with what was written just before it, and all of them in one assertion, so a failure shows each.
  const results: Record<string, { code: string | undefined; unchanged: boolean }> = {};
  for (const [rac, bundle] of [["RAC-1500 b, not pinned yet", homePackage(b, { version: "2.0.0" })], ["RAC-1501 c, pinned", homePackage(c, { version: "2.0.0" })]] as const) {
    const before = await written();
    const outcome = await h.install(bundle).then(() => ({ code: "installed" }), (caught: { code?: string }) => caught);
    results[rac] = { code: outcome.code, unchanged: isDeepStrictEqual(await written(), before) };
  }
  const refusedUntouched = { code: "plugin.definition_conflict", unchanged: true };
  assert.deepEqual(results, { "RAC-1500 b, not pinned yet": refusedUntouched, "RAC-1501 c, pinned": refusedUntouched }, "refused, with no publisher pinned and no package kept");

  // RAC-1504: the installation that holds the id is the one it was, with its data and its actions.
  assert.deepEqual(held(), installation);
  assert.deepEqual([installation.version, installation.state], ["1.0.0", "running"]);
  assert.equal(h.host.homePlugins!.hasPackage(PACKAGE_PLUGIN_ID), true);
  const views = await operationsOf(h.homeClient(), h.homeCaller());
  assert.deepEqual(await operate(h.homeClient(), h.homeCaller(), views, "notes.list", {}), [{ id: "1", text: "kept" }]);
  assert.equal(await operate(h.homeClient(), h.homeCaller(), views, "notes.add", { text: "still" }), true);
  const next = signedPackage(a, (files, manifest) => {
    manifest.runtime = { scope: "home" }; manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
    contract.operations.find((operation: { id: string }) => operation.id === "notes.add").effects.storage = ["read", "write"];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
  }, { version: "1.1.0" });
  await h.install(next);
  assert.equal(held().install_id, installation.install_id, "RAC-1683 own publisher upgrades the same installation");
  assert.equal(held().version, "1.1.0");
  assert.deepEqual(await operate(h.homeClient(), h.homeCaller(), await operationsOf(h.homeClient(), h.homeCaller()), "notes.list", {}), [{ id: "1", text: "kept" }, { id: "2", text: "still" }]);
});

test("RAC-1840 S-75 S-84 another publisher's package whose plugin id is on the dotted path of a plugin installed in the Home is refused at the confirmation with plugin.id_namespace_conflict: no pin, no kept package, and the installation stays as it was", mac, async t => {
  const h = await fixture(t), a = newPublisher(), b = newPublisher();
  await h.install(homePackage(a));
  const written = async () => ({ pins: h.ledger.publishers().map(pin => pin.key_id).sort(), dirs: (await readdir(join(h.home, "plugin-packages"))).sort() });
  const results: Record<string, { code: string | undefined; unchanged: boolean }> = {};
  for (const [name, bundle] of [["below the installed id", homePackage(b, { pluginId: `${PACKAGE_PLUGIN_ID}.extra` })], ["above the installed id", homePackage(b, { pluginId: "io.molis.work.example" })]] as const) {
    const before = await written();
    const outcome = await h.install(bundle).then(() => ({ code: "installed" }), (caught: { code?: string }) => caught);
    results[name] = { code: outcome.code, unchanged: isDeepStrictEqual(await written(), before) };
  }
  const refusedUntouched = { code: "plugin.id_namespace_conflict", unchanged: true };
  assert.deepEqual(results, { "below the installed id": refusedUntouched, "above the installed id": refusedUntouched }, "refused, with no publisher pinned and no package kept");
  const installation = h.host.homePlugins!.installation(PACKAGE_PLUGIN_ID);
  assert.deepEqual([installation?.version, installation?.state], ["1.0.0", "running"], "the installation that holds the path is as it was");
});


test("RAC-2618 both Home-to-project and project-to-Home scope changes refuse preview and stale confirmation without writes", mac, async t => {
  for (const originalScope of ["home", "project"] as const) {
    const h = await fixture(t), publisher = newPublisher();
    const bundle = (scope: "home" | "project", version: string) => signedPackage(publisher, (_files, manifest) => {
      if (scope === "home") manifest.runtime = { scope };
      if (version !== "1.0.0") manifest.upgrade_compatibility = { compatible_from_versions: ["1.0.0"] };
    }, { version });
    const client = h.projectClient(), other = bundle(originalScope === "home" ? "project" : "home", "1.1.0");
    const waiting = await client.invoke(person(), ref(pluginInstallActions.preview), { bundle: other }) as { preview_id: string };
    await h.install(bundle(originalScope, "1.0.0"));
    const snapshot = async () => {
      const project = new DatabaseSync(join(h.home, "project.sqlite"), { readOnly: true });
      try { return {
        home: h.store(db => ({ installs: db.prepare("SELECT * FROM plugin_runtime_installs").all(), values: db.prepare("SELECT * FROM plugin_private_values").all() })),
        project: project.prepare("SELECT * FROM plugin_runtime_installs").all(), pins: h.ledger.publishers(),
        packages: (await readdir(join(h.home, "plugin-packages"))).sort(),
        homeActions: (await operationsOf(h.homeClient(), h.homeCaller())).map(view => view.capability_id),
        projectActions: (await operationsOf(client, h.projectCaller())).map(view => view.capability_id),
      }; } finally { project.close(); }
    };
    const before = await snapshot();
    await assert.rejects(client.invoke(person(), ref(pluginInstallActions.preview), { bundle: other }), refused("plugin.declaration_invalid"));
    await assert.rejects(client.invoke(person(), ref(pluginInstallActions.confirm), { preview_id: waiting.preview_id, consent: true }), refused("plugin.preview_unknown"));
    assert.deepEqual(await snapshot(), before, originalScope + " keeps its sole installation, approval, package and actions");
  }
});
