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

interface Dependencies {
  ideas: SqliteIdeaRepository;
  research: SqliteResearchRepository;
  runtime: AiRuntimePort;
}

export function createGetResearchWorkspaceService(dependencies: Dependencies) {
  return async (ideaId: string, ideaVersion: number): Promise<IdeaResearchWorkspaceDto> => {
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
        market_space: lensWorkspace(dependencies.research, marketKey),
        build_cost: costKey
          ? lensWorkspace(dependencies.research, costKey)
          : { lens: "build_cost", status: "not_started" },
      },
    };
  };
}

function lensWorkspace(repository: SqliteResearchRepository, key: LensCompatibilityKey): LensWorkspaceDto {
  const plan = repository.getLatestPlan(key);
  const run = repository.getLatestRun(key);
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
  if (report) return report.status;
  return plan ? "planned" : "not_started";
}

export type GetResearchWorkspace = ReturnType<typeof createGetResearchWorkspaceService>;
