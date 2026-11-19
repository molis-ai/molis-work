import { ActionError, bindActionHandler, requireSynchronous, type ActionCallContext, type ActionClient, type ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import type { LocalHostProjectReference } from "@molis-ai/molis-work-contracts/platform/app-host";
import { ACCEPTANCE_PROVIDER_ID, acceptanceActions, acceptanceErrors, type AcceptanceSubject } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { AcceptanceCaller, AcceptanceEvidencePorts, AcceptanceService } from "@molis-ai/molis-work-module-acceptance";
import { hostBoundSession } from "@molis-ai/molis-work-plugin-sdk";
import { projectApprovalRules, projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { acceptanceSubjectFromReview, assertAcceptanceObjectReadable, buildAcceptanceReviewOffer } from "./acceptance-review.js";
import { assertReadsSubject, speaksForSubject, withProjectAcceptance } from "./acceptance-library.js";
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
 * Requirements and acceptance in the Host (`modules/acceptance`), registered once as `system.acceptance`, on each project's own library
 * (contract-design §10.2). `acceptance.decide@1` requires a platform trusted decision (`project-review-commands.ts`): the item
 * decisions and the immutable `ProjectTrustedDecision` commit in one transaction of that library (APR-15, APR-16).
 *
 * Who may write (`S-acceptance-subject-owner`): `set` only the object's own side — its provider plugin, the Host acting for it, the
 * person; `deliver` and `report` also anyone who can read that very object through its owner's reader; `read` and `review` the same,
 * the person reading wherever the owner declares no reader. Refused calls write nothing.
 */
export function acceptanceProvider(
  clientFor: (caller: ActionCallContext) => ActionClient,
  localHost: MolisWorkLocalHost,
  resolveProject: (projectId: string) => Promise<LocalHostProjectReference | null>,
): ActionProviderRegistration {
  const projectOf = async (projectId: string): Promise<LocalHostProjectReference> => {
    const project = await resolveProject(projectId);
    if (!project) throw acceptanceErrors.scope("要求与认可记在项目里，找不到这个项目");
    return project;
  };
  const run = async <T>(caller: ActionCallContext, work: (service: AcceptanceService) => T | Promise<T>): Promise<T> =>
    withProjectAcceptance(localHost, await projectOf(callerOf(caller).project_id), service => work(service));
  /** The gate before any read of the object or write to it; nothing is written before it passes. */
  const admit = async (caller: ActionCallContext, subjects: readonly AcceptanceSubject[], owners: "only" | "or_readers"): Promise<void> => {
    const person = callerOf(caller).person;
    for (const subject of subjects) {
      if (speaksForSubject(caller, subject, person)) {
        if (person && owners === "or_readers") await assertAcceptanceObjectReadable(caller, clientFor(caller), localHost, await projectOf(caller.project_id!), subject);
        continue;
      }
      if (owners === "only") throw acceptanceErrors.subject_unknown("这个对象上没有你能写或读的要求");
      await assertReadsSubject(caller, clientFor(caller), subject);
    }
  };
  const A = acceptanceActions;
  return {
    provider: { provider_id: ACCEPTANCE_PROVIDER_ID, title: "要求、证据与认可", kind: "system" },
    definitions: [A.set, A.deliver, A.report, A.read, A.review, A.decide],
    handlers: [
      bindActionHandler(A.set, async (input, caller) => { await admit(caller, [input.subject], "only"); await caller.beforeEffect(); return run(caller, service => service.set(callerOf(caller), input)); }),
      bindActionHandler(A.deliver, async (input, caller) => { await admit(caller, [input.subject], "or_readers"); await caller.beforeEffect(); return run(caller, service => service.deliver(callerOf(caller), input, evidencePorts(caller, clientFor(caller)))); }),
      bindActionHandler(A.report, async (input, caller) => { await admit(caller, [input.subject], "or_readers"); await caller.beforeEffect(); return run(caller, service => service.report(callerOf(caller), input, evidencePorts(caller, clientFor(caller)))); }),
      bindActionHandler(A.read, async (input, caller) => { await admit(caller, input.subjects, "or_readers"); return run(caller, service => service.read(callerOf(caller), input)); }),
      bindActionHandler(A.review, async (input, caller) => {
        const person = callerOf(caller);
        if (!person.person) throw acceptanceErrors.scope("只有用户本人能查看或提交交付要求的认可决定");
        const subject = acceptanceSubjectFromReview(input);
        const project = await projectOf(person.project_id);
        await assertAcceptanceObjectReadable(caller, clientFor(caller), localHost, project, subject);
        const view = await run(caller, service => service.read(person, { subjects: [subject] }).views[0]!);
        return localHost.withProject(project, ({ store }) => {
          const decisions = projectReviewDecisions(store.db, person.project_id);
          return buildAcceptanceReviewOffer(view, person.project_id, input, decisions.findCommitted, person.actor_id);
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
        const result = await withProjectAcceptance(localHost, project, (service, store) => {
          const checkCommit = () => {
            check();
            if (bound.held.deadline !== undefined && Date.now() >= bound.held.deadline) {
              throw new ActionError("actions.expired", "原决定请求已过期");
            }
            if (projectApprovalRules(store.db, person.project_id).read(false).revision !== bound.held.rulesRevision) {
              throw new ActionError("actions.conflict", "项目审批规则已变化，请重新查看");
            }
          };
          // The item decisions and the trusted-decision record commit together, or neither does (§10.2).
          const view = store.db.transaction(() => {
            checkCommit();
            return service.decide(person, input, bound.held.decisionId, () => {
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
          }).immediate();
          try { attentionChanged(person.project_id); } catch { /* the write is done */ }
          return view;
        });
        bound.submit();
        return result;
      }),
    ],
  };
}
