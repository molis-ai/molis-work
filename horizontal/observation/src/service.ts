import type { ActionCallContext, ActionDefinition, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { observationActions, type ObservationCleanupResult, type ObservationFactInput, type ObservationRecorder, type ObservationService, type ObservationSink } from "@molis-ai/molis-work-contracts/services/observation";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { sweepExpiredRecords } from "./cleanup.js";
import type { CoveragePlanEntry } from "./coverage-plan.js";
import { retentionActions, retentionSettingHandlers } from "./retention-setting.js";
import { exitRecord, exitSkips, type ExitAction, type ExitObservation } from "./exit.js";
import { handleHoldsList, handleHoldsPut, handleHoldsRelease } from "./holds.js";
import type { ObservationKeys } from "./keys.js";
import type { PluginPurge } from "./lifecycle.js";
import { handleCleanupApply, handleCleanupPreview, handleSettingsGet, handleSettingsSet, handleSpaceGet } from "./management-actions.js";
import { handleCoverageGet, handleEvidenceGet, handleRecordsQuery } from "./read-actions.js";
import { handleReport } from "./report.js";
import { factOwned, pendingRecord, type ObservationEnvironment, type Origin } from "./records.js";
import { ObservationWriter } from "./writer.js";

export interface ObservationLayerOptions {
  readonly home: string;
  readonly env: ObservationEnvironment;
  readonly keys: (hasEvidence: () => boolean) => ObservationKeys;
  readonly flushDelayMs?: number;
  readonly batchRows?: number;
  /** Additional coverage plan entries declared by installed plugins. */
  readonly extraCoverage?: readonly CoveragePlanEntry[];
  /** Plugin ids whose observation records belong to the `"flow"` bucket. */
  readonly flowOwners?: ReadonlySet<string>;
}

/**
 * The observation layer of one Home (contract-design §2–§4): the kernel's exit, the services' sinks and the report action all write through
 * one queue. Nothing here throws into, waits in or slows the work it records.
 */
export class ObservationLayer {
  readonly writer: ObservationWriter;

  constructor(private readonly options: ObservationLayerOptions) {
    this.writer = new ObservationWriter(options);
  }

  /** The kernel's collection exit (`CallReports.observed`). The Host leaves out a refusal its caller expected before calling this. */
  observed(context: ActionCallContext, action: ExitAction, observation: ExitObservation): void {
    if (exitSkips(action)) return;
    try { this.writer.enqueue(exitRecord(this.options.env, context, action, observation)); }
    catch { this.writer.gap({ owner: "service:gateway", fact: "action.call", entry: "host", project_id: context.project_id ?? "" }, "lost", "exit_failed", 1); }
  }

  /**
   * A platform service's way in: it is given a sink for its own name, and binds a recorder to who and where when a piece of its work begins
   * (a run, a sync, a timer firing), so a record made later in a callback still has the identity of the work it belongs to.
   */
  sink(service: ObservationService): ObservationSink {
    const owner = { kind: "service", id: service } as const, env = this.options.env, writer = this.writer;
    return {
      bind(origin: Origin): ObservationRecorder {
        return {
          record(fact: ObservationFactInput): void {
            try {
              const pending = pendingRecord(env, owner, origin, fact);
              if (!factOwned(owner, fact.fact)) { writer.gap(pending.coverage, "lost", "fact_not_owned", 1); return; }
              writer.enqueue(pending);
            } catch {
              writer.gap({ owner: `service:${service}`, fact: fact.fact, entry: "host", project_id: origin.project_id ?? "" }, "lost", "record_failed", 1);
            }
          },
        };
      },
    };
  }

  /** `observation.report@1`, its handler bound to the Host's shell-door check (contract-design §4). */
  reportAction(shellEntry: (caller: ActionCallContext) => void): { readonly definition: typeof observationActions.report; readonly handler: ActionHandlerBinding } {
    const { definition, handler } = defineAction(observationActions.report, (caller, input) => handleReport({ env: this.options.env, writer: this.writer, shellEntry }, caller, input));
    return { definition, handler };
  }

  /** All public actions of `system.observation`: `report@1` plus the read, management, clean-up, and evaluation-hold actions (contract-design §4, §16.2; evaluation-path-design §2). */
  actions(shellEntry: (caller: ActionCallContext) => void): {
    readonly definitions: readonly ActionDefinition[];
    readonly handlers: readonly ActionHandlerBinding[];
  } {
    const deps = {
      env: this.options.env,
      writer: this.writer,
      ...(this.options.extraCoverage ? { extraCoverage: this.options.extraCoverage } : {}),
      ...(this.options.flowOwners ? { flowOwners: this.options.flowOwners } : {}),
    };
    const bound = [
      this.reportAction(shellEntry),
      defineAction(observationActions.recordsQuery, (caller, input) => handleRecordsQuery(deps, caller, input)),
      defineAction(observationActions.evidenceGet, (caller, input) => handleEvidenceGet(deps, caller, input)),
      defineAction(observationActions.coverageGet, (caller, input) => handleCoverageGet(deps, caller, input)),
      defineAction(observationActions.settingsGet, (caller) => handleSettingsGet(deps, caller)),
      defineAction(observationActions.settingsSet, (caller, input) => handleSettingsSet(deps, caller, input)),
      defineAction(observationActions.spaceGet, (caller) => handleSpaceGet(deps, caller)),
      defineAction(observationActions.cleanupPreview, (caller, input) => handleCleanupPreview(deps, caller, input)),
      defineAction(observationActions.cleanupApply, (caller, input) => handleCleanupApply(deps, caller, input)),
      defineAction(observationActions.holdsPut, (caller, input) => handleHoldsPut(deps, caller, input)),
      defineAction(observationActions.holdsRelease, (caller, input) => handleHoldsRelease(deps, caller, input)),
      defineAction(observationActions.holdsList, (caller, input) => handleHoldsList(deps, caller, input)),
    ];
    const settings = retentionSettingHandlers(deps);
    return {
      definitions: [...bound.map((item) => item.definition as ActionDefinition), retentionActions.read, retentionActions.write],
      handlers: [...bound.map((item) => item.handler), settings.read, settings.write],
    };
  }

  /** Run the automatic retention sweep when a bounded retention period (`365`, `180`, `90`, `30`) is configured (OCL-12). */
  sweepRetention(): ObservationCleanupResult | null {
    this.writer.flush();
    const opened = this.writer.database();
    if (!opened) return null;
    const result = sweepExpiredRecords(opened.db, this.options.env.now());
    if (result && result.deleted_records > 0) this.writer.clearFolds();
    return result;
  }

  clearProject(projectId: string): void { this.writer.clearProject(projectId); }
  purgePlugin(purge: PluginPurge): void { this.writer.purgePlugin(purge); }
  flush(): void { this.writer.flush(); }
  close(): void { this.writer.close(); }
}
