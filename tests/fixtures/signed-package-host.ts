import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, HomeConsentLedger, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, molisWorkHostProjectReference,
  pluginControlActions, pluginInstallActions, seedDemoBoard } from "@molis-ai/molis-work-app-local-host";
import { PACKAGE_PLUGIN_ID, type PackageFiles } from "./sandbox-package.js";

// A project of the demo Home with a Host that installs signed packages as the person does (preview, then confirm): shared by the tests of S-84 (install,
// upgrade, switch off and on, take off) and S-87 (a publisher taken back).

/** The fixture's adding operation reads before it writes but declares only the write; a package that can really add a note declares both. */
export function readsAndWrites(files: PackageFiles) {
  const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]!);
  for (const operation of contract.operations) if (operation.id === "notes.add") operation.effects = { storage: ["read", "write"] };
  files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
}

export const mac = { skip: process.platform !== "darwin", timeout: 90_000 };
export const caller = { actor_id: LOCAL_PERSON_ACTOR_ID, audience: "user" as const, permissions: [], project_id: DEMO_PROJECT_ID };

export async function installedPackageHost() {
  const home = await mkdtemp(join(tmpdir(), "publisher-revoke-"));
  let host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const databasePath = join(home, "project.sqlite"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, projectId: DEMO_PROJECT_ID });
  const person = { ...caller, permissions: PLUGIN_INSTALL_PERMISSIONS, user_action: { source: "management" as const, conversation_ref: "s86:install", message_ref: "s86:confirm" } };
  const install = async (bundle: PluginPackageBundle) => {
    const client = host.actionClient(reference);
    const preview = await client.invoke(person, { capability_id: pluginInstallActions.preview.capability_id, version: pluginInstallActions.preview.version }, { bundle }) as { preview_id: string };
    return client.invoke(person, { capability_id: pluginInstallActions.confirm.capability_id, version: 1 }, { preview_id: preview.preview_id, consent: true, pin_label: "Example" });
  };
  const plugins = async () => (await host.actionClient(reference).invoke(person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {}) as
    { plugins: Array<{ install_id: string; plugin_id: string; version: string; state: string }> }).plugins.filter(item => item.plugin_id === PACKAGE_PLUGIN_ID);
  /** The person switches a signed-package plugin off or on, or takes it off (BL-623). */
  const control = (action: "disable" | "enable" | "uninstall", input: { plugin_id: string; keep_data?: boolean }) =>
    host.actionClient(reference).invoke(person, { capability_id: pluginControlActions[action].capability_id, version: 1 }, action === "uninstall" ? input : { plugin_id: input.plugin_id });
  const operation = async (name: string) => {
    await host.inspectActions(caller, reference);
    const view = (await host.actionClient(reference).discover(caller)).find(item => new RegExp(`^generated\\.[0-9a-f]{8}\\.${name.replace(".", "\\.")}$`).test(item.capability_id));
    return view && { capability_id: view.capability_id, version: view.version, provider_id: view.provider_id };
  };
  const data = (installId: string) => host.withProject(reference, runtime => new SqlitePluginPrivateStorage(runtime.store.db).snapshotInstallationData(installId));
  return { home, reference, install, control, plugins, operation, data, ledger: new HomeConsentLedger(home), person,
    get host() { return host; }, get client() { return host.actionClient(reference); },
    async reopen() { await host.close(); host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); },
    service: () => new PluginInstallService({ ledger: new HomeConsentLedger(home), packages: new SandboxPackageStore(home), installInProject: async () => undefined, installInHome: async () => undefined, installed: async () => [], control: async () => "disabled" }),
    async close() { try { await host.close(); } finally { await rm(home, { recursive: true, force: true }); } } };
}
