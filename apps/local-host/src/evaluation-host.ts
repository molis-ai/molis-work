import type { ActionCallContext, ActionClient, ActionProviderRegistration } from "@molis-ai/molis-work-contracts/platform/actions";
import { EvaluationService, type EvaluationReplayScenario } from "@molis-ai/molis-work-service-evaluation";
import { withObservationSource } from "@molis-ai/molis-work-service-observation";
import { resolveConfiguredHome } from "./product-home.js";
import { projectDeletedHooksFor } from "./project-deleted-hooks.js";
import { EVALUATION_OWNER } from "./project-deleted-owners.js";

export interface HostEvaluationOwner {
  readonly service: EvaluationService;
  provider(): ActionProviderRegistration;
  setClientFor(clientFor: (caller: ActionCallContext) => ActionClient): void;
  close(): void;
}

const owners = new Map<string, HostEvaluationOwner>();

export function evaluationForHome(
  homeDirectory: string,
  clientFor: (caller: ActionCallContext) => ActionClient,
): HostEvaluationOwner {
  const home = resolveConfiguredHome(homeDirectory);
  const existing = owners.get(home);
  if (existing) {
    existing.setClientFor(clientFor);
    return existing;
  }
  let currentClientFor = clientFor;
  let closed = false;
  const service = new EvaluationService({
    home,
    clientFor: (caller) => currentClientFor(caller),
    runInReplayScope: (fn, replayId) => withObservationSource("replay", fn, replayId),
  });
  const disposeProjectOwner = projectDeletedHooksFor(home).register({
    ...EVALUATION_OWNER,
    survivesRebuild: false,
    alive: () => !closed,
    clear: (projectId) => {
      service.clearProject(projectId);
    },
  });
  const owner: HostEvaluationOwner = {
    service,
    provider: () => service.provider(),
    setClientFor: (next) => {
      currentClientFor = next;
    },
    close: () => {
      if (closed) return;
      closed = true;
      disposeProjectOwner();
      service.close();
      owners.delete(home);
    },
  };
  owners.set(home, owner);
  return owner;
}

export function closeHomeEvaluation(home: string | undefined): void {
  if (!home) return;
  const resolved = resolveConfiguredHome(home);
  owners.get(resolved)?.close();
}

export function registerEvaluationReplayScenario(
  homeDirectory: string,
  scenarioId: string,
  scenario: EvaluationReplayScenario,
): () => void {
  const home = resolveConfiguredHome(homeDirectory);
  const owner = owners.get(home);
  if (!owner) {
    throw new Error(`当前 Home 尚未装配评测服务，无法登记隔离回放场景 ${scenarioId}`);
  }
  return owner.service.registerReplayScenario(scenarioId, scenario);
}
