import { currentCallId, refusalExpected, type CallObserved } from "@molis-ai/molis-work-kernel";
import type { ScheduleWakeupEnded } from "@molis-ai/molis-work-service-scheduler";
import type { ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { OBSERVATION_PROVIDER_ID, type ObservationService } from "@molis-ai/molis-work-contracts/services/observation";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { ObservationLayer, observationKeys, purgeObservationPluginFile, type ObservationEnvironment, type PluginPurge } from "@molis-ai/molis-work-service-observation";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { hostLog } from "./host-log.js";
import { isRegenerableDemo } from "./plugin-demo-seed.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { OBSERVATION_OWNER } from "./project-deleted-owners.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { observationShellDoor } from "./observation-shell-entry.js";
import { liveObservation, setLiveObservation } from "./observation-live.js";

/**
 * The observation layer of the running Host (specs/observation-collection/contract-design.md §2): one per Home, in the process that runs the
 * actions. It records from the kernel's exit, gives each platform service a sink of its own, answers `observation.report@1`, and clears a
 * deleted project's records. Nothing here may fail or slow the work it records.
 */
export interface HostObservation {
  readonly layer: ObservationLayer;
  /** `system.observation` with `observation.report@1`, for the Host's one list of its own providers. */
  readonly provider: ActionProviderRegistration;
  /** The kernel's collection exit, for `CallReports.observed`. */
  readonly observed: CallObserved;
  sink(service: ObservationService): ReturnType<ObservationLayer["sink"]>;
  /** A project's runtime opened: learn its data class from the catalog, so a demonstration's records are `demo` (§5). */
  projectOpened(projectId: string): Promise<void>;
  /** The person cleared a plugin's data on uninstall (§6). Never throws: a failure is the plugin's data left, which the next purge retries. */
  pluginPurged(purge: PluginPurge): void;
  close(): void;
}

/**
 * The person removed a plugin and chose to delete its data (or later discarded data they had kept): its records go, and the content of the
 * calls it answered or made (§6). `project_id`: a project-level installation, only that project's. A Host-shipped plugin answers under its
 * plugin id as well as its installation's (`actionProviderId`). Never throws: what could not be cleared stays for the next clean-up.
 */
export function observationPluginDataCleared(home: string, record: Pick<PluginInstanceRecord, "plugin_id" | "install_id" | "publisher_trust">, projectId?: string): void {
  const purge: PluginPurge = { plugin_id: record.plugin_id, install_ids: [record.install_id],
    provider_ids: record.publisher_trust === "host" ? [record.install_id, record.plugin_id] : [record.install_id], ...(projectId ? { project_id: projectId } : {}) };
  const live = liveObservation(home);
  if (live) { live.pluginPurged(purge); return; }
  try { purgeObservationPluginFile(home, purge, new Date().toISOString()); }
  catch (error) { hostLog.warn("observation", "plugin_purge_failed", error); }
}

/**
 * A project clock's wakeups as work records (design §4「定时与后台任务」): one per wakeup, in the operation it ran as, so the action call
 * it made carries the same `call_id`. One that could not run (its plugin gone) is `no_action`; one stopped part-way is `cancelled`.
 */
export function scheduleWakeupRecords(home: string, projectId: string): (ended: ScheduleWakeupEnded) => void {
  return ({ wakeup, job, install_id, interrupted }) => {
    const live = liveObservation(home), call_id = currentCallId();
    if (!live) return;
    const outcome = interrupted ? "cancelled" : wakeup.status === "ok" ? "succeeded" : wakeup.status === "plugin_unavailable" ? "no_action" : "failed";
    live.sink("scheduler").bind({ kind: "background", entry: "schedule", actor_id: `plugin:${job.plugin_id}`, project_id: projectId,
      ...(install_id ? { install_id } : {}), ...(call_id ? { call_id } : {}) }).record({ fact: "scheduler.wakeup", outcome, stage: job.recurrence_kind,
      occurred_at: wakeup.started_at, subjects: [{ kind: "schedule_job", id: job.job_id }], work: { work_ref: wakeup.wakeup_id },
      detail: { capability_id: job.capability_id, object_ref: job.object_ref, due_at: wakeup.due_at, late_ms: Math.max(0, Date.parse(wakeup.started_at) - Date.parse(wakeup.due_at)),
        status: wakeup.status, ...(wakeup.detail ? { reply: wakeup.detail } : {}) } });
  };
}

export function createHostObservation(home: string): HostObservation {
  const projects = new Map<string, "user" | "regenerable_demo">();
  const env: ObservationEnvironment = { platformVersion: PRODUCT_VERSION, now: () => new Date(), projectClass: id => projects.get(id) };
  const secrets = createLazyFileSecretStore(home);
  const layer = new ObservationLayer({ home, env, keys: hasEvidence => observationKeys(secrets, hasEvidence) });
  const report = layer.reportAction(caller => { observationShellDoor.entryOf(caller); });
  let closed = false, stepDown = () => {};
  const disposeOwner = projectDeletedHooksFor(home).register({ ...OBSERVATION_OWNER, survivesRebuild: false, alive: () => !closed,
    clear: projectId => { projects.delete(projectId); layer.clearProject(projectId); } });
  const host: HostObservation = {
    layer,
    provider: { provider: { provider_id: OBSERVATION_PROVIDER_ID, title: "工作记录", kind: "system" }, definitions: [report.definition], handlers: [report.handler] },
    // A refusal its caller was looking for is not the person's work (the diagnostic log leaves it out the same way, §4).
    observed: (caller, action, observation) => {
      if (!observation.outcome.ok && observation.outcome.refused && refusalExpected(observation.outcome.code)) return;
      layer.observed(caller, action, observation);
    },
    sink: service => layer.sink(service),
    projectOpened: async projectId => {
      try { projects.set(projectId, await isRegenerableDemo(home, projectId) ? "regenerable_demo" : "user"); }
      catch { projects.delete(projectId); }
    },
    pluginPurged: purge => {
      try { layer.purgePlugin(purge); }
      catch (error) { hostLog.warn("observation", "plugin_purge_failed", error); }
    },
    close: () => {
      if (closed) return;
      closed = true;
      stepDown();
      disposeOwner();
      layer.close();
    },
  };
  stepDown = setLiveObservation(home, host);
  return host;
}
