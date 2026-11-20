import { findSubjectReader, type ActionCallContext, type ActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { acceptanceErrors, type AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { openAcceptance, type AcceptanceService } from "@molis-ai/molis-work-module-acceptance";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import type { MolisWorkLocalHost, MolisWorkProjectRuntime } from "./project-host.js";

/**
 * The platform's requirements and acceptance of one project, on that project's library (contract-design §10.2). A decision made through
 * the trusted-decision entry counts where its record is in this same library; the project approvals answer that, not this module (§10.5).
 */
export function withProjectAcceptance<T>(host: MolisWorkLocalHost, project: LocalHostProjectReference,
  work: (service: AcceptanceService, store: MolisWorkProjectRuntime["store"]) => T | Promise<T>): Promise<T> {
  return host.withProject(project, ({ store }) => {
    const decisions = projectReviewDecisions(store.db, project.project_id);
    return work(openAcceptance(store.db, project.project_id, { vouched: id => decisions.findCommitted(id) !== null }), store);
  });
}

/** The three callers that speak for the object itself (`S-acceptance-subject-owner`): its provider, the Host acting for it, the person. */
export function speaksForSubject(caller: ActionCallContext, subject: AcceptanceSubject, person: boolean): boolean {
  if (person) return true;
  // The provider itself: the plugin the Host issued this call to (`host_plugin`, S-15). A Host action never sees `calling_plugin_id`, which
  // the Plugin Runtime sets only for a plugin's own handlers; `host_plugin` is the same issued fact and no caller can carry one in.
  if (caller.host_plugin !== undefined && caller.host_plugin.plugin_id === subject.provider_id) return true;
  const acting = caller.acting_for;
  return acting !== undefined && acting.provider_id === subject.provider_id && acting.kind === subject.subject.kind && acting.id === subject.subject.id;
}

/**
 * Anyone else must be able to read this very object through its owner's declared reader, asked as itself (`S-acceptance-subject-owner`).
 * No reader declared for the kind, none available, more than one, or a read that fails: refused the same way, saying nothing of whether
 * the object exists, and nothing is written.
 */
export async function assertReadsSubject(caller: ActionCallContext, client: ActionClient, subject: AcceptanceSubject): Promise<void> {
  const refused = () => acceptanceErrors.subject_unknown("这个对象上没有你能写或读的要求");
  const asked = { ...caller, query_only: true as const };
  const views = (await client.discover(asked)).filter(view => view.provider.provider_id === subject.provider_id);
  const reader = findSubjectReader(views, subject.subject.kind);
  if (reader.found !== "one") throw refused();
  try {
    await client.invoke(asked, { capability_id: reader.view.capability_id, version: reader.view.version, provider_id: reader.view.provider.provider_id }, { subject_id: subject.subject.id });
  } catch (error) {
    if (caller.signal?.aborted) throw error;
    throw refused();
  }
}
