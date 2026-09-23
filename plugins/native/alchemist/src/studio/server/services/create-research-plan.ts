import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { AiRuntimePort } from "../../domain/kernel/ports.js";
import { assertValidBudget, type ResearchBudget } from "../../domain/research/budget.js";
import {
  buildLensCompatibilityKey,
  type LensKind,
  marketLensCompatibilityKey,
  type ResearchPlan,
} from "../../domain/research/lens.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteMemoryRepository } from "../db/memory-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";

export class ResearchPlanError extends Error {
  readonly name = "ResearchPlanError";

  constructor(
    readonly code: "IDEA_VERSION_NOT_FOUND" | "RUNTIME_MODEL_NOT_FOUND" | "RESEARCH_BUDGET_INVALID",
  ) {
    super(code);
  }
}

interface Dependencies {
  actorId: string;
  workspaceId: string;
  clock: Clock;
  idFactory: IdFactory;
  ideas: SqliteIdeaRepository;
  memory: SqliteMemoryRepository;
  research: SqliteResearchRepository;
  runtime: AiRuntimePort;
}

export function createResearchPlanService(dependencies: Dependencies) {
  return async (input: {
    ideaId: string;
    ideaVersion: number;
    lens: LensKind;
    modelPolicy: "auto" | "fixed";
    modelId?: string;
    budget: ResearchBudget;
  }): Promise<ResearchPlan> => {
    const idea = dependencies.ideas.getIdea(input.ideaId);
    const version = dependencies.ideas.getVersion(input.ideaId, input.ideaVersion);
    if (!idea || !version) throw new ResearchPlanError("IDEA_VERSION_NOT_FOUND");
    const models = await dependencies.runtime.listModels();
    const model =
      input.modelPolicy === "fixed" ? models.find((candidate) => candidate.id === input.modelId) : models[0];
    if (!model) throw new ResearchPlanError("RUNTIME_MODEL_NOT_FOUND");
    let budget: ResearchBudget;
    try {
      budget = assertValidBudget(input.budget);
    } catch {
      throw new ResearchPlanError("RESEARCH_BUDGET_INVALID");
    }
    const now = dependencies.clock.now();
    const key =
      input.lens === "market_space"
        ? marketLensCompatibilityKey(input.ideaId, input.ideaVersion)
        : buildLensCompatibilityKey(
            input.ideaId,
            input.ideaVersion,
            dependencies.research.ensureMvpScope({
              id: dependencies.idFactory.next("mvp_scope"),
              ideaId: input.ideaId,
              ideaVersion: input.ideaVersion,
              actorId: dependencies.actorId,
              inScope: version.content.mvp.inScope,
              outOfScope: version.content.mvp.outOfScope,
              platformAssumptions: [],
              integrationAssumptions: [],
              now,
            }).version,
          );
    const plan: ResearchPlan = {
      id: dependencies.idFactory.next("research_plan"),
      key,
      scopeSummary:
        input.lens === "market_space"
          ? "验证需求强度、付出意愿、竞争压力、切入缝隙与触达时机。"
          : `评估 ${version.content.mvp.inScope.join("、") || "当前 MVP 范围"} 的实现路径、投入与持续负担。`,
      modelPolicy: input.modelPolicy,
      modelId: model.id,
      runtimeLabel: model.runtimeLabel,
      estimatedDuration:
        input.lens === "market_space" ? { minMinutes: 2, maxMinutes: 4 } : { minMinutes: 1, maxMinutes: 3 },
      budget,
      appliedPlaybookRuleIds:
        input.lens === "market_space"
          ? dependencies.memory
              .listApplicablePlaybookRules({
                workspaceId: dependencies.workspaceId,
                reportId: dependencies.research.getLatestReport(key)?.id,
                directionId: idea.directionId,
              })
              .map((rule) => rule.id)
          : [],
      createdAt: now,
    };
    const created = dependencies.research.createPlan(plan);
    for (const ruleId of created.appliedPlaybookRuleIds) {
      dependencies.memory.recordPlaybookApplication({
        id: dependencies.idFactory.next("memory_application"),
        ruleId,
        planId: created.id,
        appliedAt: now,
      });
    }
    return created;
  };
}

export type CreateResearchPlan = ReturnType<typeof createResearchPlanService>;
