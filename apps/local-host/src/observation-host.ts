import { currentCallId, refusalExpected, type CallObserved } from "@molis-ai/molis-work-kernel";
import type { ScheduleWakeupEnded } from "@molis-ai/molis-work-service-scheduler";
import {
  findSubjectReader,
  isSubjectReader,
  retainActionAuthority,
  resolveActionSubject,
  type ActionClient,
  type ActionExecutionContext,
  type ActionProviderRegistration,
} from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference, LocalHostStatus } from "@molis-ai/molis-work-contracts/platform/app-host";
import { OBSERVATION_PROVIDER_ID, observationActions, type ObservationService } from "@molis-ai/molis-work-contracts/services/observation";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { ObservationLayer, observationKeys, purgeObservationPluginFile, type CoveragePlanEntry, type ObservationEnvironment, type PluginPurge } from "@molis-ai/molis-work-service-observation";
import type { PluginInstanceRecord } from "@molis-ai/molis-work-contracts/platform/plugin";
import { hostLog } from "./host-log.js";
import { isRegenerableDemo } from "./plugin-demo-seed.js";
import { SHIPPED_PARTS } from "./plugin-registry.js";
import { PRODUCT_VERSION } from "./product-version.js";
import { OBSERVATION_OWNER } from "./project-deleted-owners.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { observationShellDoor } from "./observation-shell-entry.js";
import { liveObservation, setLiveObservation } from "./observation-live.js";
import type { ProjectVersionStores } from "./project-version-stores.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";

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

export interface HostObservationPorts {
  readonly catalogProjects?: () => Promise<readonly string[] | undefined>;
  readonly openProjects?: () => LocalHostStatus["projects"];
  readonly withOpenProject?: <T>(reference: LocalHostProjectReference, fn: (runtime: ProjectVersionStores) => T | Promise<T>) => Promise<T | null>;
  readonly actionClientFor?: (reference?: LocalHostProjectReference) => ActionClient;
  readonly readableProjects?: ObservationEnvironment["readableProjects"];
  readonly resolveSubject?: ObservationEnvironment["resolveSubject"];
}

export function hostObservationPorts(
  homeDirectory: string,
  localHost: { actionClient(reference: LocalHostProjectReference): ActionClient; homeActionClient(): ActionClient },
  host: { projects(): LocalHostStatus["projects"]; withExistingRuntime<T>(reference: LocalHostProjectReference, fn: (runtime: ProjectVersionStores) => T | Promise<T>): Promise<T | null> },
  catalogRunner: () => LocalWebCatalogRunner | undefined,
): HostObservationPorts {
  return {
    catalogProjects: () => {
      const runner = catalogRunner();
      return runner ? runner({ homeDirectory }, catalog => catalog.listProjects().map(project => project.project_id)) : Promise.resolve(undefined);
    },
    openProjects: () => host.projects(),
    withOpenProject: (reference, fn) => host.withExistingRuntime(reference, fn),
    actionClientFor: reference => reference ? localHost.actionClient(reference) : localHost.homeActionClient(),
  };
}

export function createHostObservation(home: string, ports: HostObservationPorts = {}): HostObservation {
  const projects = new Map<string, "user" | "regenerable_demo">();
  let seenAnyProject = false;
  const defaultReadableProjects: NonNullable<ObservationEnvironment["readableProjects"]> = async () => {
    const open = ports.openProjects?.() ?? [];
    const closing = new Set(open.filter(project => project.state === "closing").map(project => project.project_id));
    const catalogIds = await ports.catalogProjects?.();
    if (catalogIds !== undefined) {
      return catalogIds.filter(id => !closing.has(id));
    }
    if (open.length > 0 || seenAnyProject) {
      return open.filter(project => project.state !== "closing").map(project => project.project_id);
    }
    return undefined;
  };
  const readableProjects = ports.readableProjects ?? ((ports.catalogProjects || ports.openProjects) ? defaultReadableProjects : undefined);
  const defaultResolveSubject: NonNullable<ObservationEnvironment["resolveSubject"]> = async (projectId, subject, caller) => {
    const live = readableProjects ? await readableProjects() : undefined;
    if (projectId !== null && live !== undefined && !live.includes(projectId)) return "missing";
    const openRef = projectId !== null
      ? (ports.openProjects?.() ?? []).find(project => project.project_id === projectId && project.state === "ready")
      : undefined;
    if (
      projectId !== null
      && (subject.kind === "artifact" || subject.kind === "artifacts" || subject.kind === "process_item" || subject.kind === "process_items")
    ) {
      if (!openRef || !ports.withOpenProject) return "unverified";
      const parsedVersion = subject.version !== undefined ? Number(subject.version) : NaN;
      if (subject.version !== undefined && (!Number.isInteger(parsedVersion) || parsedVersion <= 0)) return "unverified";
      const found = await ports.withOpenProject(openRef, runtime => {
        const store = subject.kind === "process_item" || subject.kind === "process_items"
          ? runtime.processItems.query
          : runtime.artifacts.query;
        const record = subject.version !== undefined
          ? store.getArtifactVersion(projectId, { artifact_id: subject.id, version: parsedVersion })
          : store.latestArtifactVersion(projectId, subject.id);
        return record !== null && record.availability === "available";
      });
      if (found === null) return "unverified";
      return found ? "resolved" : "missing";
    }
    if (!ports.actionClientFor || !caller) return "unverified";
    try {
      const client = ports.actionClientFor(openRef);
      const scopedCaller = caller.project_id === projectId ? caller : { ...caller, project_id: projectId };
      const origin = (scopedCaller as Partial<ActionExecutionContext>).current_action ?? { ...observationActions.recordsQuery, provider_id: OBSERVATION_PROVIDER_ID };
      const nested = retainActionAuthority(scopedCaller, origin);
      const views = await client.discover(nested);
      let resolvedKind = subject.kind;
      let lookup = findSubjectReader(views, resolvedKind);
      if (lookup.found === "none") {
        const providerReaders = views.filter(view =>
          isSubjectReader(view.action)
          && view.action.subject_kinds.length === 1
          && (view.provider.plugin_id === subject.kind || view.provider.provider_id === subject.kind || view.capability_id.startsWith(`${subject.kind}.`)),
        );
        if (providerReaders.length === 1) {
          resolvedKind = providerReaders[0]!.action.subject_kinds[0]!;
          lookup = findSubjectReader(views, resolvedKind);
        }
      }
      if (lookup.found !== "one") return "unverified";
      const { context } = await resolveActionSubject(client, nested, { kind: resolvedKind, id: subject.id });
      // The owner reader returns its current revision. A recorded version that is not that revision
      // can no longer be checked through this reader; never report the current object as the old version.
      if (subject.version !== undefined && String(context.revision) !== String(subject.version)) return "unverified";
      return "resolved";
    } catch (error) {
      if (/not_found$/u.test(String((error as { code?: unknown }).code ?? ""))) return "missing";
      return "unverified";
    }
  };
  const resolveSubject = ports.resolveSubject ?? ((ports.actionClientFor || ports.withOpenProject) ? defaultResolveSubject : undefined);

  const env: ObservationEnvironment = {
    platformVersion: PRODUCT_VERSION,
    now: () => new Date(),
    projectClass: id => projects.get(id),
    ...(readableProjects ? { readableProjects } : {}),
    ...(resolveSubject ? { resolveSubject } : {}),
  };
  const secrets = createLazyFileSecretStore(home);
  const automaticSecrets = createLazyFileSecretStore(home, { keychain: "cached" });
  const extraCoverage: CoveragePlanEntry[] = [];
  const flowOwners = new Set<string>();
  for (const registration of SHIPPED_PARTS) {
    for (const entry of registration.observation?.coverage ?? []) {
      extraCoverage.push({
        owner: `plugin:${registration.manifest.plugin_id}`,
        fact: entry.fact,
        entries: entry.entries,
        state: entry.state,
        ...(entry.reason ? { reason: entry.reason } : {}),
        ...(entry.record_kind ? { record_kind: entry.record_kind } : {}),
      });
      if (entry.record_kind === "flow") flowOwners.add(registration.manifest.plugin_id);
    }
  }
  const layer = new ObservationLayer({ home, env, extraCoverage, flowOwners, keys: hasEvidence => {
    const automatic = observationKeys(automaticSecrets, hasEvidence), explicit = observationKeys(secrets, hasEvidence);
    // Recording must not ask to unlock unrelated credentials. Explicit evidence reads retain the original access path.
    return { digest: automatic.digest, seal: automatic.seal, open: explicit.open };
  } });
  const bound = layer.actions(caller => { observationShellDoor.entryOf(caller); });
  let closed = false, stepDown = () => {};
  const disposeOwner = projectDeletedHooksFor(home).register({ ...OBSERVATION_OWNER, survivesRebuild: false, alive: () => !closed,
    clear: projectId => { seenAnyProject = true; projects.delete(projectId); layer.clearProject(projectId); } });
  const host: HostObservation = {
    layer,
    provider: { provider: { provider_id: OBSERVATION_PROVIDER_ID, title: "工作记录", kind: "system" }, definitions: bound.definitions, handlers: bound.handlers },
    // A refusal its caller was looking for is not the person's work (the diagnostic log leaves it out the same way, §4).
    observed: (caller, action, observation) => {
      if (!observation.outcome.ok && observation.outcome.refused && refusalExpected(observation.outcome.code)) return;
      layer.observed(caller, action, observation);
    },
    sink: service => layer.sink(service),
    projectOpened: async projectId => {
      seenAnyProject = true;
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
