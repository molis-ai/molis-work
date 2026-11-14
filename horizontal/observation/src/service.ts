import type { ActionCallContext, ActionHandlerBinding } from "@molis-ai/molis-work-contracts/platform/actions";
import { observationActions, type ObservationFactInput, type ObservationRecorder, type ObservationService, type ObservationSink } from "@molis-ai/molis-work-contracts/services/observation";
import { defineAction } from "@molis-ai/molis-work-plugin-sdk";
import { exitRecord, exitSkips, type ExitAction, type ExitObservation } from "./exit.js";
import type { ObservationKeys } from "./keys.js";
import type { PluginPurge } from "./lifecycle.js";
import { handleReport } from "./report.js";
import { factOwned, pendingRecord, type ObservationEnvironment, type Origin } from "./records.js";
import { ObservationWriter } from "./writer.js";

export interface ObservationLayerOptions {
  readonly home: string;
  readonly env: ObservationEnvironment;
  readonly keys: (hasEvidence: () => boolean) => ObservationKeys;
  readonly flushDelayMs?: number;
  readonly batchRows?: number;
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

  clearProject(projectId: string): void { this.writer.clearProject(projectId); }
  purgePlugin(purge: PluginPurge): void { this.writer.purgePlugin(purge); }
  flush(): void { this.writer.flush(); }
  close(): void { this.writer.close(); }
}
