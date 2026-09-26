import { z } from "zod";
import type { ActionProposal, AnnotationTarget } from "../../domain/calibration/calibration.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { PlaybookRule, PlaybookScope } from "../../domain/memory/rules.js";
import { createPlaybookProposalSchema } from "../../shared/contracts/memory.js";
import type { SqliteActivityRepository } from "../db/activity-repository.js";
import type { SqliteCalibrationRepository } from "../db/calibration-repository.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteMemoryRepository } from "../db/memory-repository.js";
import type { SqliteDatabase } from "../db/open-database.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";

interface Dependencies {
  database: SqliteDatabase;
  workspaceId: string;
  actorId: string;
  clock: Clock;
  idFactory: IdFactory;
  activity: SqliteActivityRepository;
  calibration: SqliteCalibrationRepository;
  ideas: SqliteIdeaRepository;
  memory: SqliteMemoryRepository;
  research: SqliteResearchRepository;
}

export function createCalibrationMemoryService(dependencies: Dependencies) {
  return {
    createPlaybookProposal(annotationId: string, input: unknown): ActionProposal {
      const parsed = createPlaybookProposalSchema.parse(input);
      const annotation = dependencies.calibration.getAnnotation(annotationId);
      if (!annotation) throw new Error("ANNOTATION_NOT_FOUND");
      if (annotation.status !== "open") throw new Error("ANNOTATION_ALREADY_RESOLVED");
      const scope = resolveScope(annotation.target, parsed.scopeKind, dependencies);
      const now = dependencies.clock.now();
      const proposal: ActionProposal = {
        id: dependencies.idFactory.next("proposal"),
        workspaceId: dependencies.workspaceId,
        actorId: dependencies.actorId,
        source: { kind: "annotation", id: annotation.id },
        action: "create_playbook_rule",
        target: annotation.target,
        summary: "把这条报告反馈沉淀为可检验的研究方法",
        diff: [
          {
            field: "研究方法",
            before: "当前默认判断方法",
            after: parsed.methodChange,
          },
          { field: "适用示例", before: "", after: parsed.positiveExamples.join("；") },
          { field: "不适用示例", before: "", after: parsed.negativeExamples.join("；") },
        ],
        versionImpact: "不会改写当前报告；后续兼容研究会显示是否应用。",
        costImpact: "确认本身不触发模型或搜索调用。",
        memoryImpact: `创建一条 ${scopeLabel(scope)} Research Playbook Rule。`,
        status: "pending",
        createdAt: now,
      };
      dependencies.calibration.createProposal(proposal, {
        originalFeedback: annotation.comment,
        methodChange: parsed.methodChange,
        positiveExamples: parsed.positiveExamples,
        negativeExamples: parsed.negativeExamples,
        scope,
      });
      dependencies.activity.create({
        id: dependencies.idFactory.next("activity"),
        workspaceId: dependencies.workspaceId,
        kind: "action_proposal.created",
        targetKind: "action_proposal",
        targetId: proposal.id,
        payload: { action: proposal.action, sourceAnnotationId: annotation.id },
        createdAt: now,
      });
      return proposal;
    },

    applyProposal(id: string): { proposal: ActionProposal; rule: PlaybookRule } {
      const stored = dependencies.calibration.getProposal(id);
      if (!stored) throw new Error("ACTION_PROPOSAL_NOT_FOUND");
      if (stored.proposal.status !== "pending") throw new Error("ACTION_PROPOSAL_NOT_PENDING");
      if (stored.proposal.action !== "create_playbook_rule") {
        throw new Error("ACTION_PROPOSAL_UNSUPPORTED");
      }
      const payload = playbookPayloadSchema.parse(stored.payload);
      const now = dependencies.clock.now();
      return dependencies.database.transaction(() => {
        const rule: PlaybookRule = {
          id: dependencies.idFactory.next("playbook"),
          workspaceId: dependencies.workspaceId,
          actorId: dependencies.actorId,
          version: 1,
          originalFeedback: payload.originalFeedback,
          methodChange: payload.methodChange,
          positiveExamples: payload.positiveExamples,
          negativeExamples: payload.negativeExamples,
          scope: payload.scope,
          source: stored.proposal.source,
          status: "active",
          createdAt: now,
          updatedAt: now,
        };
        dependencies.memory.createPlaybookRule(rule);
        const proposal = dependencies.calibration.markProposalApplied(id, now);
        if (proposal.source.kind === "annotation") {
          dependencies.calibration.markAnnotationResolved(proposal.source.id, now);
        }
        dependencies.activity.create({
          id: dependencies.idFactory.next("activity"),
          workspaceId: dependencies.workspaceId,
          kind: "memory.playbook_created",
          targetKind: "playbook_rule",
          targetId: rule.id,
          payload: { scope: rule.scope.kind, sourceProposalId: proposal.id },
          createdAt: now,
        });
        return { proposal, rule };
      })();
    },
  };
}

const playbookScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("report"), reportId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("direction"), directionId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal("global_market_space") }).strict(),
]);

const playbookPayloadSchema = z
  .object({
    originalFeedback: z.string().min(1),
    methodChange: z.string().min(1),
    positiveExamples: z.array(z.string().min(1)),
    negativeExamples: z.array(z.string().min(1)),
    scope: playbookScopeSchema,
  })
  .strict();

function resolveScope(
  target: AnnotationTarget,
  scopeKind: "report" | "direction" | "global_market_space",
  dependencies: Pick<Dependencies, "research" | "ideas">,
): PlaybookScope {
  if (target.kind !== "lens_report") throw new Error("PLAYBOOK_REQUIRES_LENS_REPORT");
  const report = dependencies.research.getReport(target.objectId);
  if (!report || report.revision !== target.revision) throw new Error("ANNOTATION_TARGET_NOT_FOUND");
  if (report.key.lens !== "market_space") throw new Error("PLAYBOOK_REQUIRES_MARKET_SPACE");
  if (scopeKind === "report") return { kind: "report", reportId: report.id };
  if (scopeKind === "global_market_space") return { kind: "global_market_space" };
  const idea = dependencies.ideas.getIdea(report.key.ideaId);
  if (!idea) throw new Error("IDEA_NOT_FOUND");
  return { kind: "direction", directionId: idea.directionId };
}

function scopeLabel(scope: PlaybookScope): string {
  return {
    report: "仅本报告",
    direction: "当前 Direction",
    global_market_space: "未来所有市场空间分析",
  }[scope.kind];
}
