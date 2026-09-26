import { ZodError, z } from "zod";
import type { DirectionUnderstanding } from "../../domain/discovery/exploration.js";
import type { IdeaCard } from "../../domain/discovery/idea-card.js";
import type { SourcePort } from "../../domain/discovery/source.js";
import type { Clock, IdFactory } from "../../domain/kernel/identity.js";
import type { AiRuntimePort } from "../../domain/kernel/ports.js";
import type { TasteRule } from "../../domain/memory/rules.js";
import { explorationGenerationSchema } from "../../shared/contracts/exploration.js";
import type { SqliteExplorationRepository } from "../db/exploration-repository.js";
import type { SqliteIdeaRepository } from "../db/idea-repository.js";
import type { SqlitePulseRepository } from "../db/pulse-repository.js";
import type { SqliteResearchRepository } from "../db/research-repository.js";
import type { ExplorationCheckpoint } from "../runtime/fixture-ai-runtime.js";
import type { ResearchExecutionRuntimePort } from "../runtime/fixture-research-runtime.js";
import type { PulseSynthesizerPort } from "../runtime/pulse-synthesizer.js";
import {
  DISCOVERY_BRAINSTORM_JOB,
  type DiscoveryBrainstormJobInput,
} from "../services/create-exploration.js";
import { createLensJobHandler } from "./lens-job-handler.js";
import {
  JobExecutionError,
  type JobHandler,
  type JobHandlerControl,
  type JobHandlers,
} from "./local-worker.js";
import { createPulseJobHandler } from "./pulse-job-handler.js";
import type { PersistedJob } from "./sqlite-job-runner.js";

const discoveryInputSchema = z
  .object({
    explorationRunId: z.string().min(1),
    directionId: z.string().min(1),
    directionTitle: z.string().min(1),
    directionDescription: z.string().min(1),
    actorId: z.string().min(1).optional(),
  })
  .strict();

const checkpointSchema = z
  .object({
    stage: z.literal("ready_to_persist"),
    runtimeLabel: z.string().min(1),
    understanding: explorationGenerationSchema.shape.understanding,
    cards: z.array(
      explorationGenerationSchema.shape.cards.element.extend({
        id: z.string().min(1),
        explorationRunId: z.string().min(1),
        directionId: z.string().min(1),
        status: z.literal("candidate"),
        createdAt: z.string().datetime(),
      }),
    ),
  })
  .strict();

import type { WorkReuseService } from "../../../work-reuse/service.js";

interface JobHandlerDependencies {
  explorations: SqliteExplorationRepository;
  runtime: AiRuntimePort;
  idFactory: IdFactory;
  clock: Clock;
  taste?(): readonly TasteRule[];
  research?: {
    repository: SqliteResearchRepository;
    ideas: SqliteIdeaRepository;
    runtime: ResearchExecutionRuntimePort;
    workReuse?: WorkReuseService;
  };
  pulse?: {
    repository: SqlitePulseRepository;
    sources: readonly SourcePort[];
    synthesizer: PulseSynthesizerPort;
  };
}

export function createJobHandlers(dependencies: JobHandlerDependencies): JobHandlers {
  const handlers: Record<string, JobHandler> = {
    [DISCOVERY_BRAINSTORM_JOB]: async (job, control) => handleBrainstormJob(job, control, dependencies),
  };
  if (dependencies.research) {
    const lens = createLensJobHandler({
      ...dependencies.research,
      idFactory: dependencies.idFactory,
      clock: dependencies.clock,
    });
    handlers[lens.kind] = lens.handler;
  }
  if (dependencies.pulse) {
    const pulse = createPulseJobHandler({
      ...dependencies.pulse,
      idFactory: dependencies.idFactory,
      clock: dependencies.clock,
    });
    handlers[pulse.kind] = pulse.handler;
  }
  return handlers;
}

async function handleBrainstormJob(
  job: PersistedJob,
  control: JobHandlerControl,
  dependencies: JobHandlerDependencies,
): Promise<void> {
  let parsedInput: DiscoveryBrainstormJobInput | undefined;
  try {
    parsedInput = discoveryInputSchema.parse(job.input);
    if ((job.checkpoint as { stage?: string } | undefined)?.stage === "generating") throw new Error("AI_CALL_INTERRUPTED");
    if (control.isCancelled()) return;
    control.commit(() => dependencies.explorations.markRunning(parsedInput!.explorationRunId, dependencies.clock.now()));
    const checkpoint = job.checkpoint
      ? checkpointSchema.parse(job.checkpoint)
      : await generateCheckpoint(job, parsedInput, control, dependencies);
    if (control.isCancelled()) return;
    control.commit(() => dependencies.explorations.saveResult(
      parsedInput!.explorationRunId,
      checkpoint.understanding as DirectionUnderstanding,
      checkpoint.cards as IdeaCard[],
      dependencies.clock.now(),
      checkpoint.runtimeLabel,
    ));
  } catch (error) {
    if (control.isCancelled()) return;
    const code = error instanceof ZodError ? "AI_OUTPUT_INVALID" : classifyError(error);
    if (parsedInput) {
      control.commit(() => dependencies.explorations.saveFailure(parsedInput!.explorationRunId, code, dependencies.clock.now()));
    }
    throw new JobExecutionError(code);
  }
}

async function generateCheckpoint(
  job: PersistedJob,
  input: DiscoveryBrainstormJobInput,
  control: JobHandlerControl,
  dependencies: JobHandlerDependencies,
): Promise<ExplorationCheckpoint> {
  control.signal.throwIfAborted();
  // Persist before dispatch: an ambiguous interrupted call is never silently replayed.
  control.saveCheckpoint({ stage: "generating" });
  const generation = await dependencies.runtime.generateStructured({
    operationId: job.id,
    purpose: "把 Direction 炼化为少量有价值的 Idea 候选",
    systemPrompt: "返回严格符合结构的方向理解和 Idea Brief 草案；不为凑数生成卡牌。",
    userPrompt: JSON.stringify({ title: input.directionTitle, description: input.directionDescription,
      founderTaste: (dependencies.taste?.() ?? []).map(rule => ({ title: rule.title, statement: rule.statement, appliesTo: rule.appliesTo, exceptions: rule.exceptions })) }),
    jsonSchema: z.toJSONSchema(explorationGenerationSchema) as Record<string, unknown>,
    parse: (value) => explorationGenerationSchema.parse(value),
    signal: control.signal,
  });
  if (control.isCancelled()) throw new JobExecutionError("JOB_CANCELLED");
  const validated = explorationGenerationSchema.parse(generation.value);
  const now = dependencies.clock.now();
  const checkpoint: ExplorationCheckpoint = {
    stage: "ready_to_persist",
    runtimeLabel: generation.runtimeLabel,
    understanding: validated.understanding,
    cards: validated.cards.map((draft) => ({
      ...draft,
      id: dependencies.idFactory.next("card"),
      explorationRunId: input.explorationRunId,
      directionId: input.directionId,
      status: "candidate",
      createdAt: now,
    })),
  };
  // The checkpoint is durable before business persistence, so a restart reuses the same card ids.
  control.saveCheckpoint(checkpoint);
  return checkpoint;
}

function classifyError(error: unknown): string {
  if (error instanceof Error) {
    if (["EXPLORATION_RESULT_CONFLICT", "AI_CALL_INTERRUPTED", "AI_OUTPUT_INVALID", "RUNTIME_NOT_CONFIGURED", "RUNTIME_MODEL_UNAVAILABLE", "RUNTIME_SHUTDOWN"].includes(error.message)) return error.message;
    if (
      ["OPENAI_TIMEOUT", "OPENAI_NETWORK_FAILED", "OPENAI_AUTH_FAILED", "OPENAI_RATE_LIMITED"].includes(
        error.message,
      ) ||
      /^OPENAI_HTTP_\d+$/.test(error.message)
    ) {
      return error.message;
    }
  }
  return "AI_RUNTIME_FAILED";
}
