import { mkdtemp, rm } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ActionError, LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginUninstallTarget } from "@molis-ai/molis-work-contracts/platform/plugin-trust";
import { SANDBOX_PACKAGE_FILES, type PluginPackageBundle } from "@molis-ai/molis-work-contracts/platform/plugin";
import { SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { DEMO_PROJECT_ID, HomeConsentLedger, MolisWorkLocalHost, PLUGIN_INSTALL_PERMISSIONS, PluginInstallService, SandboxPackageStore, handlePluginTrustHttp, molisWorkHostProjectReference,
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
  // Taking a plugin off is the project settings door's alone (S-94, BL-915): the fixture sends it through that door's real route, as the 插件 page does.
  let door: Promise<{ server: Server; origin: string }> | undefined;
  const settingsDoor = () => door ??= new Promise((resolve, reject) => {
    const server = createServer((request, response) => {
      handlePluginTrustHttp(request, response, new URL(request.url ?? "/", "http://127.0.0.1"), { localHost: host, projectRef: reference })
        .then(handled => { if (!handled) { response.statusCode = 404; response.end(); } }, error => { response.statusCode = 500; response.end(String(error)); });
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve({ server, origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}` }));
  });
  /** The row's own `uninstall_target`, as the 插件 page sends it; a row without one (not from a signed package, or none at all) names one that matches nothing. */
  const targetOf = async (pluginId: string): Promise<PluginUninstallTarget> => {
    const rows = (await host.actionClient(reference).invoke(person, { capability_id: pluginInstallActions.installed.capability_id, version: pluginInstallActions.installed.version }, {}) as
      { plugins: Array<{ plugin_id: string; install_id: string; uninstall_target?: PluginUninstallTarget }> }).plugins.filter(item => item.plugin_id === pluginId);
    return rows[0]?.uninstall_target ?? { install_id: rows[0]?.install_id ?? "none", installation_generation: "none", version: "0.0.0", manifest_digest: "none" };
  };
  /** The person switches a signed-package plugin off or on, or takes it off (BL-623). */
  const control = async (action: "disable" | "enable" | "uninstall", input: { plugin_id: string; keep_data?: boolean; target?: PluginUninstallTarget }) => {
    if (action !== "uninstall") return host.actionClient(reference).invoke(person, { capability_id: pluginControlActions[action].capability_id, version: 1 }, { plugin_id: input.plugin_id });
    const { origin } = await settingsDoor(), payload = JSON.stringify({ ...input, target: input.target ?? await targetOf(input.plugin_id) });
    // `node:http`, not `fetch`: a test may stand in for the global `fetch` (a model's answers), and this request is not one of those.
    const text = await new Promise<string>((resolve, reject) => {
      const sent = httpRequest(`${origin}/api/plugin-trust/installed/uninstall`, { method: "POST", headers: { "content-type": "application/json" } }, response => {
        const chunks: Buffer[] = []; response.on("data", chunk => chunks.push(chunk)); response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8"))); response.on("error", reject);
      });
      sent.on("error", reject); sent.end(payload);
    });
    const body = JSON.parse(text) as { plugin_id: string; state: string } | { error: string; code: string };
    if ("code" in body) throw new ActionError(body.code, body.error);
    return body;
  };
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
    async close() {
      try { if (door) { const { server } = await door; server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } await host.close(); }
      finally { await rm(home, { recursive: true, force: true }); }
    } };
}
