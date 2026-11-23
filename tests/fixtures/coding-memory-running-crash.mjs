import { MolisWorkLocalHost, ensureSystemAgentService, molisWorkHostProjectReference, runningProjectPlatform } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

// A real SDK queue has durably changed queued -> running before it enters this Host runner's current-owner call.
// Exit at that boundary without closing: recovery must reconcile, never automatically replay the uncertain attempt.
const [homeDirectory, projectId, taskKey] = process.argv.slice(2);
if (!homeDirectory || !projectId || !taskKey) throw new Error("explicit temporary Home, project and task are required");
globalThis.fetch = async () => { throw new Error("crash proof must dispatch no network request"); };
const host = new MolisWorkLocalHost({ homeDirectory });
const catalog = host.configurePersonalPlanning(homeDirectory, withMolisWorkProjectCatalog);
const reference = await catalog({ homeDirectory }, catalog => {
  const project = catalog.getProject(projectId);
  return molisWorkHostProjectReference({ projectId, databasePath: project.database_path });
});
const service = ensureSystemAgentService(host, homeDirectory, catalog);
const platform = await host.withProject(reference, runtime => runningProjectPlatform(runtime.store, projectId), { activatePlugins: true });
if (!platform) throw new Error("normal project owner assembly did not start");
const invoke = platform.invokeOwnedAction.bind(platform);
platform.invokeOwnedAction = async (owner, action, input, control) => {
  if (input.task_key !== taskKey) return invoke(owner, action, input, control);
  const task = service.agentHost.adapter("prologue").schedule.find(taskKey);
  if (task?.state !== "running") throw new Error("original queue did not enter its persisted running state");
  process.stdout.write("running-durable\n", () => process.exit(0));
  await new Promise(() => {});
};
// Start the real queue only after the catalog and the interruption point are ready.
await service.ready;
setTimeout(() => {
  const task = service.agentHost.adapter("prologue").schedule.find(taskKey);
  throw new Error(`Original running queue did not reach the current owner: ${task?.state ?? "missing"} (${task?.last_failure ?? "no failure recorded"})`);
}, 25_000);
