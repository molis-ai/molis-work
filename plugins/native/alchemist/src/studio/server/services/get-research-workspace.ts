import type { AiRuntimePort } from "../../domain/kernel/ports.js";
import {
  buildLensCompatibilityKey,
  type LensCompatibilityKey,
  marketLensCompatibilityKey,
} from "../../domain/research/lens.js";
import type {
  IdeaResearchWorkspaceDto,
  LensViewStatus,
  LensWorkspaceDto,
} from "../../shared/contracts/research.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { WorkReuseService } from "../../../work-reuse/service.js";

interface Dependencies {
  ideas: SqliteIdeaRepository;
  research: SqliteResearchRepository;
  runtime: AiRuntimePort;
  workReuse?: WorkReuseService;
}

export function createGetResearchWorkspaceService(dependencies: Dependencies) {
  return async (ideaId: string, ideaVersion: number, signal?: AbortSignal): Promise<IdeaResearchWorkspaceDto> => {
    const version = dependencies.ideas.getVersion(ideaId, ideaVersion);
    if (!version) throw new Error("IDEA_VERSION_NOT_FOUND");
    const scope = dependencies.research.getMvpScopeForIdeaVersion(ideaId, ideaVersion);
    const marketKey = marketLensCompatibilityKey(ideaId, ideaVersion);
    const costKey = scope ? buildLensCompatibilityKey(ideaId, ideaVersion, scope.version) : undefined;
    return {
      ideaId,
      ideaVersion,
      models: await dependencies.runtime.listModels(),
      lenses: {
        market_space: await lensWorkspace(dependencies, marketKey, signal),
        build_cost: costKey
          ? await lensWorkspace(dependencies, costKey, signal)
          : { lens: "build_cost", status: "not_started" },
      },
    };
  };
}

async function lensWorkspace(dependencies: Dependencies, key: LensCompatibilityKey, signal?: AbortSignal): Promise<LensWorkspaceDto> {
  const repository = dependencies.research;
  const storedPlan = repository.getLatestPlan(key);
  const plan = storedPlan ? await dependencies.workReuse?.projectPlan(storedPlan, signal) ?? storedPlan : undefined;
  const run = plan ? repository.getRunForPlan(plan.id) : repository.getLatestRun(key);
  const report = repository.getLatestReport(key);
  return {
    lens: key.lens,
    status: deriveStatus(plan, run, report),
    ...(plan ? { plan } : {}),
    ...(run ? { run } : {}),
    ...(report ? { report, evidence: repository.listEvidence(report.id) } : {}),
  };
}

function deriveStatus(
  plan: ReturnType<SqliteResearchRepository["getLatestPlan"]>,
  run: ReturnType<SqliteResearchRepository["getLatestRun"]>,
  report: ReturnType<SqliteResearchRepository["getLatestReport"]>,
): LensViewStatus {
  if (run) {
    if (run.status === "interrupted") return "queued";
    return run.status;
  }
  if (plan) return "planned";
  return report ? report.status : "not_started";
}

export type GetResearchWorkspace = ReturnType<typeof createGetResearchWorkspaceService>;
