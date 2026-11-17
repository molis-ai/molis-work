import { withAcceptanceTransaction } from "./acceptance-transaction.js";
import { ActionError, bindActionHandler, requireSynchronous, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ACCEPTANCE_PROVIDER_ID, acceptanceActions, acceptanceErrors } from "@molis-ai/molis-work-contracts/modules/acceptance";
import { decideAcceptanceInTransaction, openAcceptance, type AcceptanceCaller, type AcceptanceEvidencePorts, type AcceptanceService } from "@molis-ai/molis-work-module-acceptance";
import { hostBoundSession } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { acceptanceSubjectFromReview, assertAcceptanceObjectReadable, buildAcceptanceReviewOffer } from "./acceptance-review.js";
import { attentionChanged } from "./attention-changes.js";
import { projectReviewForSystemWrite } from "./project-review-effect.js";
import type { MolisWorkLocalHost } from "./project-host.js";

const CHECK_EVIDENCE = { capability_id: "agent.evidence.check", version: /* @version action.agent.evidence.check */ 1 } as const;
const READ_ARTIFACT = { capability_id: "artifacts.read", version: /* @version action.artifacts.read */ 1 } as const;

/**
 * Who is calling, from the call the Host authenticated and from nothing in the input (S-acceptance-person-decides). "The person" is a
 * page's own call as the user: a call a plugin made or handed on is not one, whatever audience it carries. A session counts only
 * when the Host bound it to an Agent round, so an outside client's own naming of one backs no evidence.
 */
function callerOf(caller: ActionCallContext): AcceptanceCaller {
  if (!caller.project_id) throw acceptanceErrors.scope("要求与认可记在项目里，要在项目里调用");
  return { project_id: caller.project_id, actor_id: caller.actor_id, person: caller.audience === "user" && !caller.host_plugin && !caller.delegated_by && !caller.calling_plugin_id,
    session: hostBoundSession(caller) ?? null };
}

/** Cited evidence is looked up as the caller: what it cannot read backs nothing, and a round is only ever one of its own session. */
function evidencePorts(caller: ActionCallContext, client: ActionClient): AcceptanceEvidencePorts {
  return {
    artifactReadable: async reference => (await client.invoke(caller, READ_ARTIFACT, { reference }) as { selected: unknown }).selected != null,
    checkRun: async (run_id, command_call_ids) => {
      try { return await client.invoke(caller, CHECK_EVIDENCE, { run_id, command_call_ids }) as Awaited<ReturnType<AcceptanceEvidencePorts["checkRun"]>>; } catch (error) {
        if (error instanceof ActionError && error.code === "agent.run_unknown") return "none";
        throw error;
      }
    },
    stopped: () => (caller as { signal?: AbortSignal }).signal?.aborted === true,
  };
}

/**
 * Requirements and acceptance in the Host (`modules/acceptance`), registered once as `system.acceptance`. `acceptance.decide@1`
 * requires a platform trusted decision (`project-review-commands.ts`), committing an immutable `ProjectTrustedDecision` in the
 * project database alongside the item decisions in `acceptance.db` (BL-acceptance-first-slice-limits ③, APR-15, APR-16).
 */
export function acceptanceProvider(
  homeDirectory: string,
  clientFor: (caller: ActionCallContext) => ActionClient,
  localHost?: MolisWorkLocalHost,
  resolveProject?: (projectId: string) => Promise<LocalHostProjectReference | null>,
): ActionProviderRegistration {
  const run = async <T>(work: (service: AcceptanceService) => T | Promise<T>): Promise<T> => {
    const opened = openAcceptance(homeDirectory);
    try { return await work(opened.service); } finally { opened.close(); }
  };
  const projectOf = async (projectId: string): Promise<LocalHostProjectReference | undefined> => (await resolveProject?.(projectId)) ?? undefined;
  const A = acceptanceActions;
  return {
    provider: { provider_id: ACCEPTANCE_PROVIDER_ID, title: "要求、证据与认可", kind: "system" },
    definitions: [A.set, A.deliver, A.report, A.read, A.review, A.decide],
    handlers: [
      bindActionHandler(A.set, (input, caller) => run(service => service.set(callerOf(caller), input))),
      bindActionHandler(A.deliver, (input, caller) => run(service => service.deliver(callerOf(caller), input, evidencePorts(caller, clientFor(caller))))),
      bindActionHandler(A.report, (input, caller) => run(service => service.report(callerOf(caller), input, evidencePorts(caller, clientFor(caller))))),
      bindActionHandler(A.read, (input, caller) => run(service => service.read(callerOf(caller), input))),
      bindActionHandler(A.review, async (input, caller) => {
        const person = callerOf(caller);
        if (!person.person) throw acceptanceErrors.scope("只有用户本人能查看或提交交付要求的认可决定");
        const subject = acceptanceSubjectFromReview(input);
        const project = await projectOf(person.project_id);
        await assertAcceptanceObjectReadable(caller, clientFor(caller), localHost, project, subject);
        const view = await run(service => service.read(person, { subjects: [subject] }).views[0]!);
        if (!localHost || !project) return buildAcceptanceReviewOffer(view, person.project_id, input, () => null);
        return localHost.withProject(project, ({ store }) => {
          const decisions = projectReviewDecisions(store.db, person.project_id);
          return buildAcceptanceReviewOffer(view, person.project_id, input, decisions.findCommitted);
        });
      }),
      bindActionHandler(A.decide, async (input, caller) => {
        const person = callerOf(caller);
        if (!person.person) throw acceptanceErrors.scope("只有用户本人能认可或退回");
        await caller.beforeEffect();
        const check = () => {
          caller.signal?.throwIfAborted();
          requireSynchronous(caller.assert_authority_current?.());
        };
        check();
        const bound = projectReviewForSystemWrite(caller, person.project_id, ACCEPTANCE_PROVIDER_ID);
        const project = await projectOf(person.project_id);
        if (!localHost || !project) throw new ActionError("actions.service_unavailable", "当前宿主未挂载项目审批库");
        const result = await localHost.withProject(project, ({ store }) => {
          const checkCommit = () => {
            check();
            if (bound.held.deadline !== undefined && Date.now() >= bound.held.deadline) {
              throw new ActionError("actions.expired", "原决定请求已过期");
            }
            if (projectApprovalRules(store.db, person.project_id).read(false).revision !== bound.held.rulesRevision) {
              throw new ActionError("actions.conflict", "项目审批规则已变化，请重新查看");
            }
          };
          const view = withAcceptanceTransaction(homeDirectory, person.project_id, store.db, () => bound.submit(), schema => {
            checkCommit();
            return decideAcceptanceInTransaction(store.db, schema, person, input, bound.held.decisionId, () => {
              projectReviewDecisions(store.db, person.project_id).commit(
                bound.held.command,
                { actor_id: bound.held.actor_id, source: { kind: "person", actor_id: bound.held.actor_id, entry: bound.held.entry } },
                bound.held.frozenChoice,
                bound.held.review,
                new Date().toISOString(),
                checkCommit,
                bound.held.decisionId,
              );
            });
          });
          try { attentionChanged(person.project_id); } catch { /* the write is done */ }
          return view;
        });
        return result;
      }),
    ],
  };
}
