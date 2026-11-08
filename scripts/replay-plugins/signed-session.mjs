// A signed plugin package on a resident Host: the entry `plugin install` really goes through, and the checks that it stayed the same installation.
// Shared by the plugin replay (scripts/replay-plugins.mjs) and the golden Homes, which install the same sample and replay it after an upgrade.
import { execFile } from "node:child_process";
import path from "node:path";
import { isDeepStrictEqual, promisify } from "node:util";

const { HomeConsentLedger, MolisWorkLocalHost, runningProjectPlatform } = await import("@molis-ai/molis-work-app-local-host");
const { createDesktopWebCore } = await import("@molis-ai/molis-work-app-desktop");
const runFile = promisify(execFile);

/** An already selected synthetic Home uses the production business core and real installation CLI; no account login or anonymous installation fallback. */
export async function residentHost(root, home, secretEnvironment, hostOptions = {}) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, ...hostOptions });
  const server = createDesktopWebCore({ ptyClientFilePath: () => path.join(root, "dist/web/pty-client.js") })({ homeDirectory: home, localHost: host });
  const close = async () => {
    try {
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } finally { await host.close(); }
  };
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const cli = async (file, projectId, ...flags) => {
      const result = await runFile(process.execPath, ["--disable-warning=ExperimentalWarning", path.join(root, "dist/cli/main.js"), "plugin", "install", file, projectId, ...flags],
        { env: { ...process.env, MOLIS_WORK_HOME: home, MOLIS_WORK_WEB_URL: origin, ...secretEnvironment }, timeout: 60_000 }).then(
        ok => ({ code: 0, text: ok.stdout }), error => ({ code: error.code, text: error.stderr }));
      return { code: result.code, out: JSON.parse(result.text.trim().split("\n").at(-1)) };
    };
    return { host, cli, close, origin };
  } catch (error) { await close(); throw error; }
}

export function expectAnswer(action, result) {
  if (action.expect === undefined && action.expect_texts === undefined) throw new Error(`${action.operation_id} needs a fixed expected answer`);
  if (action.expect !== undefined && !isDeepStrictEqual(result, action.expect)) {
    throw new Error(`${action.operation_id} returned ${JSON.stringify(result)}, expected ${JSON.stringify(action.expect)}`);
  }
  if (action.expect_texts !== undefined) {
    // The list brief excludes only the random id/time values from its fixed oracle, never fields, count, order or text.
    const rows = result?.items;
    if (!result || !isDeepStrictEqual(Object.keys(result), ["items"]) || !Array.isArray(rows)
      || rows.some(row => !row || !isDeepStrictEqual(Object.keys(row).sort(), ["created_at", "id", "text"])
        || typeof row.id !== "string" || !row.id || typeof row.text !== "string" || typeof row.created_at !== "string"
        || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at)))) {
      throw new Error(`${action.operation_id} returned invalid items, expected { items: [{ id, text, created_at }] }`);
    }
    if (!isDeepStrictEqual(rows.map(row => row.text), action.expect_texts)) throw new Error(`${action.operation_id} returned ${JSON.stringify(rows.map(row => row.text))}, expected ${JSON.stringify(action.expect_texts)}`);
  }
}

/** The installed plugin as the project sees it. `currentHost` is a function because the Host is replaced across a restart. */
export function installedPluginSession(currentHost, { home, ref, projectId, pluginId, publisher }) {
  const discovered = async () => {
    const host = currentHost(), owner = await host.localPersonContext(ref);
    await host.inspectActions(owner, ref);
    return (await host.actionClient(ref).discover(owner)).filter(view => view.provider.plugin_id === pluginId);
  };
  const records = async () => {
    const platform = await currentHost().withProject(ref, runtime => runningProjectPlatform(runtime.store, projectId));
    if (!platform) throw new Error("the project's plugin platform did not start");
    return platform.runtime.list().filter(record => record.plugin_id === pluginId);
  };
  const pins = () => new HomeConsentLedger(home).publishers();
  const installed = async (version, installId) => {
    await discovered();
    const [record, ...extra] = await records();
    if (!record || extra.length || record.version !== version || record.state !== "running" || record.publisher_trust !== "pinned"
      || record.publisher_signature !== publisher || (installId !== undefined && record.install_id !== installId)
      || !pins().some(pin => pin.key_id === publisher && !pin.revoked_at)) throw new Error(`expected the same pinned running ${pluginId}@${version}, got ${JSON.stringify(record)}`);
    return { install_id: record.install_id, plugin_id: record.plugin_id, version: record.version, state: record.state, trust: record.publisher_trust, publisher: record.publisher_signature };
  };
  const invoke = async action => {
    const offered = (await discovered()).filter(view => view.action.local_id === action.operation_id && view.version === action.version);
    if (offered.length !== 1) throw new Error(`${action.operation_id}@${action.version} is not uniquely in the installed plugin's action directory`);
    const view = offered[0], host = currentHost(), owner = await host.localPersonContext(ref);
    return host.actionClient(ref).invoke(owner, { capability_id: view.capability_id, version: view.version, provider_id: view.provider_id }, action.input);
  };
  return { discovered, records, pins, installed, invoke };
}
