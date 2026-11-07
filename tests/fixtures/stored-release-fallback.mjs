// A test's Runtime, not a way the product builds one: on a scratch copy of a golden's library it starts a plugin without `host` trust in this process, with no
// `inProcess` admission, to reach the supervisor's fallback. tests/plugin-in-process-call-sites.test.ts (RAC-994) holds every production site to a closed
// list; this is here, under tests/, because it is not one.
import { copyFileSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { goldenFailure } from "../../scripts/golden/failure.mjs";

const { NativePluginExecutor, PluginRuntime, PluginSupervisor, SqlitePluginRuntimeReleaseArtifactRepository, SqlitePluginRuntimeRepository } = await import("@molis-ai/molis-work-plugin-runtime");

const FALLBACK_ACTION = "text-stats.count";
const FALLBACK_INPUT = { text: "一行\nline" }, FALLBACK_ANSWER = '{"characters":7,"utf8_bytes":11,"lines":2}';

/**
 * The fallback itself, on a copy of a restored library. A build whose version does not read the installed one, and whose own code would refuse to
 * start, is offered over the installation: only the stored code can be what comes up, at the installed version, and it answers.
 * Neither the candidate nor, on this copy, the installation has `host` trust, and that is the only way to reach this branch today: a build of the
 * Host always takes over (`directlyUsable`), and a candidate without `host` trust may not start over an installation that has it. So every release
 * a golden holds is one the product would not fall back to as things stand. What this proves is that the branch brings up the restored bytes and they answer.
 */
export async function assertInstalledVersionKeepsRunning(library, current, release) {
  const pluginId = current.manifest.plugin_id, scratch = realpathSync(mkdtempSync(path.join(tmpdir(), "golden-fallback-")));
  const where = `stored-release/${pluginId}`;
  const refusesToStart = async () => { throw goldenFailure("golden.incompatible_build_started", where); };
  const newer = { ...current, start: refusesToStart, manifest: { ...current.manifest, version: "999.0.0" } };
  const copy = path.join(scratch, "molis-work.db");
  copyFileSync(library, copy);
  const db = new DatabaseSync(copy, { defensive: false });
  try {
    const records = new SqlitePluginRuntimeRepository(db);
    const installed = records.list().find(record => record.plugin_id === pluginId && record.state !== "uninstalled");
    if (!installed) throw goldenFailure("golden.stored_release_missing", where);
    records.save({ ...installed, publisher_trust: "unsigned" });
    let offered;
    const registry = { registerProvider(registration) { offered = registration; return () => undefined; } };
    const runtime = new PluginRuntime(records, new NativePluginExecutor(), { hostIds: new Set(), actions: { registry } });
    const supervisor = new PluginSupervisor(runtime, { releaseArtifacts: new SqlitePluginRuntimeReleaseArtifactRepository(db) });
    const report = await supervisor.start([{ definition: newer, releaseArtifact: release }]);
    if (!report.running.includes(pluginId) || supervisor.manifest(pluginId)?.version !== installed.version) throw goldenFailure("golden.stored_release_not_running", where);
    const handler = offered?.handlers.find(action => action.capability_id === FALLBACK_ACTION);
    const answer = handler && await handler.handle({ actor_id: "golden", project_id: null, audience: "user", permissions: [], beforeEffect: async () => undefined }, FALLBACK_INPUT);
    if (JSON.stringify(answer) !== FALLBACK_ANSWER) throw goldenFailure("golden.stored_release_wrong_answer", where);
    await runtime.stop(installed.install_id);
  } finally {
    db.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}
