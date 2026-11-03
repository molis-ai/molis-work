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
import type { WorkReuseService } from "../../../work-reuse/service.js";
import type { ReuseSelection } from "../../../work-reuse/contracts.js";
import type { AlchemistEffectControl } from "./action-operations.js";

export class ResearchPlanError extends Error {
  readonly name = "ResearchPlanError";

  constructor(
    readonly code: "alchemist.idea_version_not_found" | "alchemist.runtime_model_not_found" | "alchemist.research_budget_invalid",
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
  workReuse?: WorkReuseService;
}

export function createResearchPlanService(dependencies: Dependencies) {
  return async (input: {
    ideaId: string;
    ideaVersion: number;
    lens: LensKind;
    modelPolicy: "auto" | "fixed";
    modelId?: string;
    budget: ResearchBudget;
    reuse?: ReuseSelection;
  }, signal?: AbortSignal, control?: AlchemistEffectControl): Promise<ResearchPlan> => {
    const idea = dependencies.ideas.getIdea(input.ideaId);
    const version = dependencies.ideas.getVersion(input.ideaId, input.ideaVersion);
    if (!idea || !version) throw new ResearchPlanError("alchemist.idea_version_not_found");
    const models = await dependencies.runtime.listModels();
    const model =
      input.modelPolicy === "fixed" ? models.find((candidate) => candidate.id === input.modelId) : models[0];
    if (!model) throw new ResearchPlanError("alchemist.runtime_model_not_found");
    let budget: ResearchBudget;
    try {
      budget = assertValidBudget(input.budget);
    } catch {
      throw new ResearchPlanError("alchemist.research_budget_invalid");
    }
    const now = dependencies.clock.now();
    const reportId = input.lens === "market_space" ? dependencies.research.reports.getLatestReport(marketLensCompatibilityKey(input.ideaId, input.ideaVersion))?.id : undefined;
    const reuse = await dependencies.workReuse?.prepare(input.reuse, { directionId: idea.directionId, reportId, lens: input.lens }, signal);
    signal?.throwIfAborted();
    await control?.beforeEffect(); control?.assert_authority_current?.(); signal?.throwIfAborted();
    const key =
      input.lens === "market_space"
        ? marketLensCompatibilityKey(input.ideaId, input.ideaVersion)
        : buildLensCompatibilityKey(
            input.ideaId,
            input.ideaVersion,
            dependencies.research.plans.ensureMvpScope({
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
      ...(reuse ? { reuse } : {}),
      appliedPlaybookRuleIds: reuse ? reuse.methods.map(method => method.id) :
        input.lens === "market_space"
          ? dependencies.memory
              .listApplicablePlaybookRules({
                workspaceId: dependencies.workspaceId,
                reportId: dependencies.research.reports.getLatestReport(key)?.id,
                directionId: idea.directionId,
              })
              .map((rule) => rule.id)
          : [],
      createdAt: now,
    };
    const created = dependencies.research.plans.createPlan(plan);
    return created;
  };
}

export type CreateResearchPlan = ReturnType<typeof createResearchPlanService>;
