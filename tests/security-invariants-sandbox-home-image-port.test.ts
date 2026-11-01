import { sandboxDerivedPermissions, sandboxPluginManifest } from '@molis-ai/molis-work-plugin-sdk';
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LOCAL_PERSON_ACTOR_ID, type ActionDefinition, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { HomePluginDatabaseDeclaration, PluginDefinition, PluginImageGenerationClient, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { MolisWorkLocalHost, forgetSandboxImageBindings, homeStores, pluginImageGenerationFor, pluginModelFor, installedLibrarySnapshots, openSandboxHomeLibrary, reservedHomeName, sandboxImageGenerationFor, sandboxImageNamespace, sandboxModelDeclaration, sandboxProviderId, withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { runInPluginAction } from "@molis-ai/molis-work-plugin-runtime";
import { resetSecretStoreCache } from "@molis-ai/molis-work-storage";
import { IMAGE_PNG } from "./fixtures/images-runtime.js";

// BL-491 (S-60, S-91): the names the Host derives for a sandboxed package, and the Host's side of its image connections. A package never writes a name: they come
// from the plugin id (32 hex digits of its SHA-256) and the installation id. The pinned-origin rule is the Host's: a connection reaches only the address the person
// used it at, and a package can neither be the first to use it nor move it. The broker's half is tests/security-invariants-sandbox-model-image-broker.test.ts; real packages in real
// processes are tests/security-invariants-sandbox-home-signed-model.test.ts.

const PLUGIN = "io.molis.work.example.imageport", OTHER = "io.molis.work.example.imageother", INSTALL = "image-port", OTHER_INSTALL = "image-other";
const refused = (code: string) => (error: unknown) => (error as { code?: string } | undefined)?.code === code;

test("BL-491 RAC-2631 the derived names are 32 hex digits of the installation id, differ per installation, and no library or ledger row may take them", async t => {
  assert.match(sandboxImageNamespace(INSTALL), /^imageconn-[0-9a-f]{32}$/u);
  assert.match(sandboxProviderId(INSTALL), /^sbx-[0-9a-f]{32}$/u);
  assert.equal(sandboxImageNamespace(INSTALL), sandboxImageNamespace(INSTALL));
  assert.notEqual(sandboxImageNamespace(INSTALL), sandboxImageNamespace(OTHER_INSTALL));
  assert.notEqual(sandboxProviderId(INSTALL), sandboxProviderId(OTHER_INSTALL));
  const first = sandboxModelDeclaration("install-one"), second = sandboxModelDeclaration("install-two");
  assert.notEqual(first.preference.store_name, second.preference.store_name, "another installation reads another choice");
  assert.equal(first.preference.store_name, join("plugin-files", "install-one", ".model-settings"));
  assert.equal(first.custom_provider.provider_id, sandboxProviderId("install-one"), "the choice and the provider id are keyed by the same installation id");
  assert.equal(reservedHomeName(sandboxImageNamespace(INSTALL)) && reservedHomeName(sandboxProviderId(INSTALL)) && !reservedHomeName("notes"), true);

  // The path that opens a library: the ledger's `holderOf` refuses the reserved prefixes.
  const home = await mkdtemp(join(tmpdir(), "sandbox-names-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  const declaration = (store_name: string): HomePluginDatabaseDeclaration => ({ store_name, version: 1, read_permission: "names:read", write_permission: "names:write", schema: "CREATE TABLE names_notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL);" });
  const owner = { plugin_id: PLUGIN, publisher_signature: "probe-names" }, instance = { install_id: "names", installation_generation: "1" };
  for (const name of [sandboxImageNamespace(OTHER_INSTALL), sandboxProviderId(OTHER_INSTALL), "imageconn-mine", "sbx-mine"]) {
    assert.throws(() => openSandboxHomeLibrary(home, owner, declaration(name), homeStores(), () => {}, instance), refused("plugin.home_database.object_taken"), name);
  }
  // The path that lists them: a ledger row that holds a reserved name makes the whole ledger unreadable, as any other held name does.
  const library = openSandboxHomeLibrary(home, owner, declaration("names-notes"), homeStores(), () => {}, instance);
  library.close();
  assert.deepEqual(installedLibrarySnapshots(home, homeStores()).map(row => row.store_name), ["names-notes"]);
  const ledger = new DatabaseSync(join(home, "plugin-libraries", "plugin-libraries.db"));
  try { ledger.prepare("INSERT INTO plugin_home_libraries VALUES (?, ?, ?, 1, ?, '2026-10-24T00:00:00.000Z')").run(OTHER, "x", sandboxImageNamespace(OTHER_INSTALL), "0".repeat(64)); } finally { ledger.close(); }
  assert.throws(() => installedLibrarySnapshots(home, homeStores()), refused("plugin.home_database.shape_mismatch"));
});

test("BL-491 RAC-2631 a declaration that names the provider id or the image store the Host derives for a package is refused where it is used", () => {
  const manifest = sandboxPluginManifest({ pluginId: OTHER, version: "1.0.0", name: "declares", publisher: { publisher_id: "example", signature: "probe-declares" }, presentation: false, runtime: { scope: "home" }, effects: { model: ["invoke"] } });
  const definition: PluginDefinition = { manifest, async start() { return { kind: "app", views: [], actions: [] }; } };
  const context: PluginStartContext = { install_id: "declares", installation_generation: "1", plugin_id: OTHER, version: "1.0.0", deployment: "local", grants: [], requireGrant: () => {} };
  const home = { directory: tmpdir() };
  assert.throws(() => pluginModelFor(home, definition, context, () => {}, { preference: { store_name: "declares-model", file_name: "preference.json" }, custom_provider: { provider_id: sandboxProviderId(OTHER_INSTALL), display_name: "x" } }),
    refused("host.model_configuration_invalid"), "the provider id of a package's own provider");
  assert.throws(() => pluginImageGenerationFor(home, definition, context, { store_name: sandboxImageNamespace(OTHER_INSTALL), read_permission: "a:read", write_permission: "a:write", generate_permission: "a:generate" }, () => {}),
    refused("host.image_target_invalid"), "the namespace of a package's image slots");
});

/** A Home with an inference owner and a provider on this machine, and the image client the Host builds for a sandboxed package that asked for generation. */
async function rig(t: test.TestContext) {
  const previous = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file"; resetSecretStoreCache();
  const home = await mkdtemp(join(tmpdir(), "sandbox-image-port-"));
  const owner = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const requests: string[] = [];
  const provider = createServer((request, response) => { requests.push(request.url ?? ""); request.resume(); response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify({ data: [{ b64_json: IMAGE_PNG }] })); });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    provider.closeAllConnections(); await new Promise<void>(resolve => provider.close(() => resolve())); await owner.close(); await rm(home, { recursive: true, force: true });
    if (previous === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = previous; resetSecretStoreCache();
  });
  const address = provider.address(); assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`, url = `${origin}/v1`;
  const manifest = sandboxPluginManifest({ pluginId: PLUGIN, version: "1.0.0", name: "image port", publisher: { publisher_id: "example", signature: "probe-image" }, presentation: false,
    runtime: { scope: "home" }, effects: { model: ["invoke"], imageGeneration: ["read", "bind", "generate"] } });
  const definition: PluginDefinition = { manifest, execution: "sandbox", async start() { return { kind: "app", views: [], actions: [] }; } };
  const grants = manifest.permissions.map(entry => entry.permission);
  const context: PluginStartContext = { install_id: "image-port", installation_generation: "1", plugin_id: PLUGIN, version: "1.0.0", deployment: "local", grants, requireGrant: () => {} };
  const client = sandboxImageGenerationFor({ directory: home }, definition, context, () => {});
  assert.ok(client, "a package that derived the image rows is given the client");
  const account = (name: string, pinned?: string) => {
    const created = withConnectorConnections(home, store => store.createToken({ serviceId: "image-api", displayName: name, token: `image-${name}` }));
    if (pinned) withConnectorConnections(home, store => store.assertTarget(created.connection_id, "image-api", pinned));
    return created.connection_id;
  };
  const targetOf = (id: string) => withConnectorConnections(home, store => store.targetOrigin(id));
  const bound = () => withConnectorConnections(home, store => store.binding("home", sandboxImageNamespace(INSTALL), "main")?.connection_id ?? null);
  /** One call inside the plugin's own concurrent command, as the Runtime's scope of an installed operation names it. */
  const inAction = <T>(work: (image: PluginImageGenerationClient) => Promise<T>, permissions: readonly string[] = grants.filter(item => item !== "storage:private")): Promise<T> => {
    const action: ActionDefinition<null, null> = { capability_id: "generated.imageport.draw", version: 1, operation: "command", action: { title: "draw", description: "probe", kind: "operation", scope: "home",
      scheduling: "concurrent", audiences: ["user"], permissions: [...permissions], subject_kinds: [], input_schema: { type: "null" }, output_schema: { type: "null" } } };
    const caller: ActionExecutionContext = { actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: [...permissions], signal: new AbortController().signal, beforeEffect: async () => {} };
    return runInPluginAction({ install_id: context.install_id, installation_generation: context.installation_generation, definition: action, caller }, () => work(client!));
  };
  return { home, origin, url, client: client!, account, targetOf, bound, inAction, requests, definition, context };
}

test("BL-491 RAC-2632 the Host's client binds and generates only through a connection already pinned to the origin the call names, and a refusal changes nothing", async t => {
  const r = await rig(t);
  const never = r.account("never"), elsewhere = r.account("elsewhere", "https://other.example.com"), pinned = r.account("pinned", r.origin);
  const tables = () => JSON.stringify([r.targetOf(never), r.targetOf(elsewhere), r.targetOf(pinned), r.bound()]);
  const before = tables();
  const notAuthorized = refused("sandbox.not_authorized");
  await assert.rejects(r.inAction(image => image.bind({ slot_id: "main", base_url: r.url }, never)), notAuthorized, "bind: never pinned");
  await assert.rejects(r.inAction(image => image.bind({ slot_id: "main", base_url: r.url }, elsewhere)), notAuthorized, "bind: pinned elsewhere");
  assert.equal(tables(), before);
  // Bound by something other than the package (the person's own use of the namespace), a generate still needs the pin to match the call's origin.
  withConnectorConnections(r.home, store => store.bind({ scopeId: "home", pluginId: sandboxImageNamespace(INSTALL), slotId: "main", serviceId: "image-api", connectionId: elsewhere }));
  // Each generate carries the revision the connection really has (asked first), so the only thing that can refuse it is the pin rule.
  const generate = async () => r.inAction(async image => {
    const state = await image.inspect({ slot_id: "main", base_url: r.url });
    return image.generate({ slot_id: "main", base_url: r.url, expected_revision: state.revision, protocol: "openai-images", model: "fixture", prompt: "一只猫" });
  });
  await assert.rejects(generate(), notAuthorized, "generate: pinned elsewhere");
  // Bound by the person's own use of the namespace to a connection nobody has used yet: generate must not be the first use, whatever address it names.
  withConnectorConnections(r.home, store => store.unbind("home", sandboxImageNamespace(INSTALL), "main"));
  withConnectorConnections(r.home, store => store.bind({ scopeId: "home", pluginId: sandboxImageNamespace(INSTALL), slotId: "main", serviceId: "image-api", connectionId: never }));
  await assert.rejects(generate(), notAuthorized, "generate: bound to a connection that was never pinned");
  assert.equal(r.targetOf(never), null, "generate did not pin it");
  withConnectorConnections(r.home, store => store.unbind("home", sandboxImageNamespace(INSTALL), "main"));
  await assert.rejects(generate(), notAuthorized, "generate: nothing bound");
  assert.equal(tables(), before, "no refusal pinned, bound or moved a connection");
  assert.deepEqual(r.requests, [], "nothing was sent to the provider");
});

test("BL-491 RAC-2655 a connection the person pinned is bound by the package and used to generate, and a package without the rows cannot even ask", async t => {
  const r = await rig(t);
  const pinned = r.account("pinned", r.origin);
  await r.inAction(image => image.bind({ slot_id: "main", base_url: r.url }, pinned));
  assert.equal(r.bound(), pinned);
  const listed = await r.inAction(async image => image.connections());
  assert.equal(listed.find(item => item.connection_id === pinned)?.target_origin, r.origin);
  const state = await r.inAction(async image => image.inspect({ slot_id: "main", base_url: r.url }));
  assert.equal(state.available, true);
  const result = await r.inAction(image => image.generate({ slot_id: "main", base_url: r.url, expected_revision: state.revision, protocol: "openai-images", model: "fixture", prompt: "一只猫" }));
  assert.equal(Buffer.from(result.images[0]!.bytes).toString("base64"), IMAGE_PNG);
  assert.deepEqual(r.requests, ["/v1/images/generations"]);
  // Without the derived rows no client is built; without the scope's permission the Runtime's client refuses.
  const bare = sandboxPluginManifest({ pluginId: OTHER, version: "1.0.0", name: "bare", publisher: { publisher_id: "example", signature: "probe-bare" }, presentation: false, runtime: { scope: "home" }, effects: {} });
  assert.equal(sandboxImageGenerationFor({ directory: r.home }, { ...r.definition, manifest: bare }, r.context, () => {}), undefined);
  await assert.rejects(r.inAction(image => image.bind({ slot_id: "main", base_url: r.url }, pinned), []), refused("plugin.image_permission_undeclared"));
  assert.deepEqual(sandboxDerivedPermissions({}), []);
});

test("BL-491 RAC-2635 forgetting a package's image slots unbinds them all and keeps the person's accounts", async t => {
  const r = await rig(t);
  const pinned = r.account("pinned", r.origin);
  await r.inAction(image => image.bind({ slot_id: "main", base_url: r.url }, pinned));
  await r.inAction(image => image.bind({ slot_id: "second", base_url: r.url }, pinned));
  withConnectorConnections(r.home, store => store.bind({ scopeId: "home", pluginId: sandboxImageNamespace(OTHER_INSTALL), slotId: "main", serviceId: "image-api", connectionId: pinned }));
  forgetSandboxImageBindings(r.home, INSTALL);
  assert.equal(r.bound(), null);
  assert.equal(withConnectorConnections(r.home, store => store.binding("home", sandboxImageNamespace(INSTALL), "second")), null);
  assert.equal(withConnectorConnections(r.home, store => store.binding("home", sandboxImageNamespace(OTHER_INSTALL), "main")?.connection_id ?? null), pinned, "another plugin's slot is not touched");
  assert.equal(r.targetOf(pinned), r.origin, "the account is the person's");
  const empty = await mkdtemp(join(tmpdir(), "sandbox-no-connectors-"));
  t.after(() => rm(empty, { recursive: true, force: true }));
  forgetSandboxImageBindings(empty, INSTALL);
  assert.equal(existsSync(join(empty, "connectors")), false, "a Home that never had connectors gets none made");
});
