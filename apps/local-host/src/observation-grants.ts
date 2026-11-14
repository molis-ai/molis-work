import { currentCallId } from "@molis-ai/molis-work-kernel";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ObservationDetail, ObservationEvidenceInput, ObservationSubject } from "@molis-ai/molis-work-contracts/services/observation";
import { ObservationLayer, observationKeys, type ObservationEnvironment } from "@molis-ai/molis-work-service-observation";
import { createLazyFileSecretStore } from "@molis-ai/molis-work-storage";
import { hostLog } from "./host-log.js";
import { liveObservation } from "./observation-live.js";
import { PRODUCT_VERSION } from "./product-version.js";

/**
 * Who changed a grant: the call that did (the person in Settings or at the folder chooser, a task's categories set through its action),
 * or the Host tidying up after something else, with the reason as a text key (an uninstall, a folder that is no longer the one chosen).
 */
export type GrantChangedBy = ActionCallContext | { readonly host_reason: string };

export interface GrantChange {
  readonly fact: "grants.directory" | "grants.mcp";
  readonly change: "granted" | "revoked" | "changed";
  /** The project the grant is for; null for a Home-wide one. */
  readonly project_id: string | null;
  /** The grant, and who held it. */
  readonly subjects: readonly ObservationSubject[];
  readonly detail: ObservationDetail;
  /** What was granted, when its owner will not keep it (a folder's path goes with its row). */
  readonly evidence?: readonly ObservationEvidenceInput[];
}

/**
 * Grants whose owner keeps no history of them, as work records (design §4「授权与撤权」): a folder grant goes by deleting its row and an
 * MCP grant is written over, so when a grant was given or taken back, and whose it was, would otherwise be lost. Consents keep their own
 * (`granted_at`, `revoked_at`, never deleted) and are not copied. Called after the change is saved; never throws, because a grant
 * change is never refused for not being recorded.
 */
export function recordGrantChanges(home: string, by: GrantChangedBy, changes: readonly GrantChange[]): void {
  if (!changes.length) return;
  // A command-line uninstall has no running Host layer: it still keeps the grant change, in the same store and with the same
  // record shape, so the person sees who took what back even when the Host was not running.
  const live = liveObservation(home);
  const layer = live ? undefined : new ObservationLayer({ home, env: grantEnvironment(), keys: has => observationKeys(createLazyFileSecretStore(home), has) });
  try {
    const sink = (live ?? layer!).sink("grants"), call_id = currentCallId();
    for (const change of changes) {
      const host = "host_reason" in by ? by.host_reason : undefined;
      const context = by as ActionCallContext;
      const recorder = host === undefined ? sink.bind({ ...context, project_id: change.project_id, ...(!context.call_id && call_id ? { call_id } : {}) })
        : sink.bind({ kind: "background", entry: "host", actor_id: "host", project_id: change.project_id, ...(call_id ? { call_id } : {}) });
      recorder.record({ fact: change.fact, outcome: "succeeded", stage: change.change, subjects: change.subjects,
        ...(change.evidence ? { evidence: change.evidence } : {}), detail: host === undefined ? change.detail : { ...change.detail, reason: host } });
    }
  } catch (error) { hostLog.warn("observation", "grant_record_failed", error); }
  finally { try { layer?.close(); } catch (error) { hostLog.warn("observation", "grant_store_close_failed", error); } }
}

/** The Home facts a standalone grant write needs: its product version, its clock, and no project catalog to ask. */
function grantEnvironment(): ObservationEnvironment {
  return { platformVersion: PRODUCT_VERSION, now: () => new Date(), projectClass: () => undefined };
}
