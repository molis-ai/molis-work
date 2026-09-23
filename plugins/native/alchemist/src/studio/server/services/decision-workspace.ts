import { createDecision, decisionDestination, inspectDecisionGate } from "../../domain/decision/decision.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import { buildLensCompatibilityKey, marketLensCompatibilityKey } from "../../domain/research/lens.js";
import type {
  DecisionCaseDto,
  DecisionMaterialDto,
  DecisionOutcomeDto,
  DecisionWorkspaceDto,
} from "../../shared/contracts/decision.js";
import type { SqliteDecisionRepository } from "../db/decision-repository.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";

export class DecisionServiceError extends Error {
  readonly name = "DecisionServiceError";
  constructor(
    readonly code:
      | "IDEA_VERSION_NOT_FOUND"
      | "DECISION_VERSION_NOT_CURRENT"
      | "DECISION_REPORTS_INCOMPLETE"
      | "DECISION_REPORTS_PARTIAL"
      | "DECISION_REPORTS_STALE"
      | "DECISION_ALREADY_EXISTS",
  ) {
    super(code);
  }
}

interface Dependencies {
  actorId: string;
  clock: Clock;
  idFactory: IdFactory;
  ideas: SqliteIdeaRepository;
  research: SqliteResearchRepository;
  decisions: SqliteDecisionRepository;
}

export function createDecisionWorkspaceService(dependencies: Dependencies) {
  const getWorkspace = (ideaId: string, ideaVersion: number): DecisionWorkspaceDto => {
    const idea = dependencies.ideas.getIdea(ideaId);
    const version = dependencies.ideas.getVersion(ideaId, ideaVersion);
    if (!idea || !version) throw new DecisionServiceError("IDEA_VERSION_NOT_FOUND");
    const scope = dependencies.research.getMvpScopeForIdeaVersion(ideaId, ideaVersion);
    const marketReport = dependencies.research.getLatestReport(
      marketLensCompatibilityKey(ideaId, ideaVersion),
    );
    const costReport = scope
      ? dependencies.research.getLatestReport(buildLensCompatibilityKey(ideaId, ideaVersion, scope.version))
      : undefined;
    const gate = inspectDecisionGate({
      ideaId,
      ideaVersion,
      mvpScopeVersion: scope?.version ?? 1,
      marketReport,
      costReport,
    });
    const existing = dependencies.decisions.getForVersion(ideaId, ideaVersion);
    return {
      ideaId,
      ideaVersion,
      currentVersion: idea.currentVersion,
      title: version.content.title,
      lifecycle: idea.lifecycle,
      gate:
        ideaVersion === idea.currentVersion
          ? gate
          : {
              ready: false,
              code: "DECISION_VERSION_NOT_CURRENT",
              message: "这是旧 Idea 版本，只能回看，不能形成新的正式决策。",
            },
      materials: {
        market_space: material(
          marketReport,
          dependencies.research.getLatestRun(marketLensCompatibilityKey(ideaId, ideaVersion))?.status,
        ),
        build_cost: material(
          costReport,
          scope
            ? dependencies.research.getLatestRun(
                buildLensCompatibilityKey(ideaId, ideaVersion, scope.version),
              )?.status
            : undefined,
        ),
      },
      ...(existing
        ? {
            decision: {
              id: existing.id,
              outcome: existing.outcome,
              reason: existing.reason,
              revisitCondition: existing.revisitCondition,
              sourceKind: existing.sourceKind,
              reportBindings: existing.reportBindings,
              createdAt: existing.createdAt,
            },
          }
        : {}),
    };
  };

  const decide = (input: {
    ideaId: string;
    ideaVersion: number;
    outcome: DecisionOutcomeDto;
    reason: string;
    revisitCondition?: string;
  }) => {
    const workspace = getWorkspace(input.ideaId, input.ideaVersion);
    if (workspace.decision) throw new DecisionServiceError("DECISION_ALREADY_EXISTS");
    if (!workspace.gate.ready)
      throw new DecisionServiceError(workspace.gate.code as DecisionServiceError["code"]);
    const scope = dependencies.research.getMvpScopeForIdeaVersion(input.ideaId, input.ideaVersion);
    const marketReport = dependencies.research.getLatestReport(
      marketLensCompatibilityKey(input.ideaId, input.ideaVersion),
    );
    const costReport = scope
      ? dependencies.research.getLatestReport(
          buildLensCompatibilityKey(input.ideaId, input.ideaVersion, scope.version),
        )
      : undefined;
    if (!scope) throw new DecisionServiceError("DECISION_REPORTS_INCOMPLETE");
    const decision = createDecision({
      id: dependencies.idFactory.next("decision"),
      ideaId: input.ideaId,
      ideaVersion: input.ideaVersion,
      mvpScopeVersion: scope.version,
      outcome: input.outcome,
      reason: input.reason,
      revisitCondition: input.revisitCondition,
      sourceKind: "direct",
      actorId: dependencies.actorId,
      now: dependencies.clock.now(),
      marketReport,
      costReport,
    });
    return dependencies.decisions.create(decision);
  };

  const listCases = (): DecisionCaseDto[] =>
    dependencies.ideas.listVersions().map((version) => {
      const workspace = getWorkspace(version.ideaId, version.revision.version);
      const status: DecisionCaseDto["status"] = workspace.decision
        ? "decided"
        : workspace.ideaVersion !== workspace.currentVersion
          ? "old_version"
          : "pending";
      return { ...workspace, status, ...nextStep(workspace, status) };
    });

  const listLog = () =>
    dependencies.decisions.list().map((decision) => ({
      ...decision,
      title:
        dependencies.ideas.getVersion(decision.ideaId, decision.ideaVersion)?.content.title ?? "未命名 Idea",
      destination: decisionDestination(decision.outcome),
    }));

  return { getWorkspace, decide, listCases, listLog };
}

function nextStep(
  workspace: DecisionWorkspaceDto,
  status: DecisionCaseDto["status"],
): Pick<DecisionCaseDto, "nextPanel" | "nextAction"> {
  if (status === "old_version") return { nextPanel: "decision", nextAction: "回看旧版本" };
  if (workspace.decision) {
    const label = workspace.decision.outcome[0].toUpperCase() + workspace.decision.outcome.slice(1);
    return { nextPanel: "decision", nextAction: `查看 ${label} 决定` };
  }
  if (workspace.gate.ready) return { nextPanel: "decision", nextAction: "做出决定" };
  if (workspace.materials.market_space.status !== "completed") {
    return { nextPanel: "market", nextAction: "补齐市场空间" };
  }
  return { nextPanel: "cost", nextAction: "补齐实现成本" };
}

function material(
  report: ReturnType<SqliteResearchRepository["getLatestReport"]>,
  runStatus?: string,
): DecisionMaterialDto {
  if (report) return { status: report.status, summary: report.summary, reportId: report.id };
  if (
    runStatus === "running" ||
    runStatus === "queued" ||
    runStatus === "failed" ||
    runStatus === "cancelled"
  ) {
    return { status: runStatus };
  }
  return { status: "not_started" };
}

export type DecisionWorkspaceService = ReturnType<typeof createDecisionWorkspaceService>;
