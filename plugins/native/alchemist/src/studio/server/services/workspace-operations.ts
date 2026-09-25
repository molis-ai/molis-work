import type { ApiDependencies } from "../api/dependencies.js";
import type { AlchemistOperationInput } from "../../shared/contracts/actions.js";
import { AlchemistOperationError } from "./action-error.js";
import { sendConversationMessage } from "./conversation-message.js";

/** Discussion, decisions, calibration and Pulse operate on the same original Studio repositories. */
export function createWorkspaceOperations(d: ApiDependencies) {
  return {
    conversationList: () => ({ messages: d.conversations.list(d.workspaceId) }),
    conversationSend: (input: AlchemistOperationInput<"conversationSend">, signal?: AbortSignal) => sendConversationMessage(d, input, signal),
    decisionsList: () => {
      const persisted = d.activity.list(d.workspaceId);
      const jobs = d.jobs.listRecent().map(job => ({ id: `job_activity:${job.id}`, workspaceId: d.workspaceId, kind: `run.${job.status}`, targetKind: "job", targetId: job.id,
        payload: { jobKind: job.kind, attempt: job.attempt, ...(job.errorCode ? { errorCode: job.errorCode } : {}) }, createdAt: job.updatedAt }));
      return { cases: d.decisionWorkspace.listCases(), log: d.decisionWorkspace.listLog(), activities: [...persisted, ...jobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100) };
    },
    decisionGet: (input: AlchemistOperationInput<"decisionGet">) => d.decisionWorkspace.getWorkspace(input.id, input.version),
    decisionCreate: ({ id, version, ...input }: AlchemistOperationInput<"decisionCreate">) => ({ decision: d.decisionWorkspace.decide({ ideaId: id, ideaVersion: version, ...input }) }),
    annotationsList: (input: AlchemistOperationInput<"annotationsList">) => ({ annotations: d.calibration.listAnnotations({ ...input, blockId: "*" }) }),
    annotationCreate: (input: AlchemistOperationInput<"annotationCreate">) => {
      const target = input.target;
      const exists = target.kind === "idea_brief" ? Boolean(d.ideas.getVersion(target.objectId, target.revision))
        : target.kind === "lens_report" ? d.research.getReport(target.objectId)?.revision === target.revision
        : d.pulse.getReport(target.objectId)?.revision === target.revision;
      if (!exists) throw new AlchemistOperationError("ANNOTATION_TARGET_NOT_FOUND", "这个报告版本已经不存在或无法定位。", 404);
      const now = d.clock.now();
      const annotation = d.calibration.createAnnotation({ id: d.idFactory.next("annotation"), workspaceId: d.workspaceId, actorId: d.actorId, ...input, status: "open", createdAt: now });
      d.activity.create({ id: d.idFactory.next("activity"), workspaceId: d.workspaceId, kind: "annotation.created", targetKind: annotation.target.kind, targetId: annotation.target.objectId,
        payload: { annotationId: annotation.id, revision: annotation.target.revision }, createdAt: now });
      return { annotation };
    },
    annotationResolve: (input: AlchemistOperationInput<"annotationResolve">) => ({ annotation: d.calibration.markAnnotationResolved(input.id, d.clock.now()) }),
    memoryGet: () => ({ taste: d.memory.listTasteRules(d.workspaceId), playbook: d.memory.listPlaybookRules(d.workspaceId).map(rule => ({ ...rule,
      applications: d.memory.listApplications(rule.id).map(({ planId, runId }) => ({ planId, ...(runId ? { runId } : {}) })) })) }),
    playbookPropose: ({ id, ...input }: AlchemistOperationInput<"playbookPropose">) => ({ proposal: d.calibrationMemory.createPlaybookProposal(id, input) }),
    proposalApply: (input: AlchemistOperationInput<"proposalApply">) => d.calibrationMemory.applyProposal(input.id),
    tasteCreate: (input: AlchemistOperationInput<"tasteCreate">) => {
      const now = d.clock.now();
      const rule = d.memory.createTasteRule({ id: d.idFactory.next("taste"), workspaceId: d.workspaceId, actorId: d.actorId, version: 1, ...input,
        source: { kind: "direct", id: "memory_settings" }, status: "active", createdAt: now, updatedAt: now });
      d.activity.create({ id: d.idFactory.next("activity"), workspaceId: d.workspaceId, kind: "memory.taste_created", targetKind: "taste_rule", targetId: rule.id,
        payload: { source: "direct" }, createdAt: now });
      return { rule };
    },
    tasteDisable: (input: AlchemistOperationInput<"tasteDisable">) => ({ rule: d.memory.updateTasteStatus(input.id, "disabled", d.clock.now()) }),
    playbookDisable: (input: AlchemistOperationInput<"playbookDisable">) => ({ rule: d.memory.updatePlaybookStatus(input.id, "disabled", d.clock.now()) }),
    pulseReports: () => ({ latestRun: d.pulse.getLatestRun(), reports: d.pulse.listReports().map(report => ({ report, opportunities: d.pulse.listOpportunities(report.id), signals: d.pulse.listSignals(report.runId) })) }),
    pulseSources: () => ({ sources: d.pulse.listSourceSettings() }),
    pulseSourceUpdate: (input: AlchemistOperationInput<"pulseSourceUpdate">) => ({ source: d.pulse.updateSourceSetting(input.sourceId, input.enabled, d.clock.now()) }),
    pulseStart: (input: AlchemistOperationInput<"pulseStart">) => ({ run: d.startPulseRun(input) }),
    opportunitySave: (input: AlchemistOperationInput<"opportunitySave">) => ({ opportunity: d.opportunityActions.saveForLater(input.id), destination: { surface: "pulse", collection: "saved_for_later" } }),
    opportunityConvert: (input: AlchemistOperationInput<"opportunityConvert">) => {
      const result = d.opportunityActions.convert(input.id);
      return { ...result, destination: { surface: "ideas", directionId: result.direction.id } };
    },
  };
}
