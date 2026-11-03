import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { TestContext } from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionClient, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { DEMO_PROJECT_ID, HomeConsentLedger, type HostCompleteText, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, molisWorkHostProjectReference, pluginInstallActions, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, newPublisher, signedPackage } from "./sandbox-package.js";

// What the tests of a signed package installed in the Home (BL-628) share: the fixture package asking for the Home, a Host on a temporary
// Home that can be closed and opened again, and the Home's plugin store read back without opening the Host's own connection.

export const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
export const SECOND_PLUGIN_ID = "io.molis.work.example.second";
export const APPROVED = "plugin-builder:agent-studio:approved:";

/** The fixture package, asking for the Home. Its `notes.add` reads the notes it adds to, so the contract says so. */
export const homePackage = (publisher = newPublisher(), options: { pluginId?: string; version?: string; prompt?: boolean } = {}): PluginPackageBundle =>
  signedPackage(publisher, (files, manifest) => {
    manifest.runtime = { scope: "home" };
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!) as SandboxPluginContract;
    contract.operations.find(operation => operation.id === "notes.add")!.effects.storage = ["read", "write"];
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    if (options.prompt) files[SANDBOX_PACKAGE_FILES.prompts] = JSON.stringify([{ id: "summary", title: "Summary", purpose: "Summarize the notes", body: "Summarize the notes." }]);
  }, options);
export const ref = (action: { capability_id: string; version: number }) => ({ capability_id: action.capability_id, version: action.version });
export const person = (projectId: string | null = DEMO_PROJECT_ID): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: projectId, permissions: PLUGIN_INSTALL_PERMISSIONS,
  user_action: { source: "management", conversation_ref: "bl628:install", message_ref: "bl628:confirm" } });
export const operationsOf = async (client: ActionClient, caller: ActionCallContext, pluginId = PACKAGE_PLUGIN_ID) =>
  (await client.discover(caller)).filter(view => view.provider.plugin_id === pluginId);
export const operate = (client: ActionClient, caller: ActionCallContext, views: readonly ActionView[], localId: string, input: unknown) => {
  const view = views.find(item => item.action.local_id === localId);
  assert.ok(view, `${localId} is offered`);
  return client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
};
export const refused = (code: string) => (error: unknown) => error instanceof ActionError && error.code === code;

/** A Host on a temporary Home with one project, which can be closed and opened again over the same Home. */
export async function fixture(t: TestContext, options: { completeText?: HostCompleteText | null } = {}) {
  const home = await mkdtemp(join(tmpdir(), "bl628-home-"));
  // The Host makes the Home first: a Home that already holds files is an older one, and its memory is not adopted.
  const completeText = options.completeText ?? null;
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const open = async () => { await host.withProject(reference, () => undefined); return host; };
  await open();
  t.after(async () => { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } });
  const install = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(reference);
    const preview = await client.invoke(person(), ref(pluginInstallActions.preview), { bundle }) as { preview_id: string; runtime_scope: string };
    const installed = await client.invoke(person(), ref(pluginInstallActions.confirm), { preview_id: preview.preview_id, consent: true, pin_label: "Test publisher" });
    return { preview, installed };
  };
  const store = <Result>(read: (db: DatabaseSync) => Result): Result => {
    const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
    try { return read(db); } finally { db.close(); }
  };
  return { home, reference, install, store, ledger: new HomeConsentLedger(home), open,
    get host() { return host; },
    async reopen() { await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText }); await open(); await host.homePlugins!.ready(); return host; },
    homeClient: () => host.homeActionClient(), projectClient: () => host.actionClient(reference), homeCaller: (): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: null, permissions: [] }),
    projectCaller: (): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user", project_id: DEMO_PROJECT_ID, permissions: [] }) };
}

export const runtimeStore = <Result>(home: string, read: (db: DatabaseSync) => Result): Result => {
  const db = new DatabaseSync(join(home, "plugin-runtime", "plugin-runtime.db"), { readOnly: true });
  try { return read(db); } finally { db.close(); }
};
export const valuesOf = (home: string, installId: string) => runtimeStore(home, db => db.prepare("SELECT item_key FROM plugin_private_values WHERE install_id = ?").all(installId).map(row => (row as { item_key: string }).item_key));
