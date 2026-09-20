import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import {
  HOME_DOCK_SCENE_ID,
  INBOX_NEXT_SCENE_ID,
  type JudgmentPort,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  createFunctionsService,
  createHttpTypeSafeProvider,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-plugin-functions";
import { hostAllowedBehaviorIds } from "./behavior-catalog.js";

export interface FunctionSceneChoice {
  readonly function_key: string;
  readonly name: string;
}

export interface FunctionScenesView {
  readonly published: readonly FunctionSceneChoice[];
  readonly inbox_next: string | null;
  readonly home_dock: string | null;
}

export interface FunctionSceneHttpBody {
  readonly function_key: string | null;
  readonly functions: readonly FunctionSceneChoice[];
}

export interface FunctionsHostOptions {
  readonly secrets?: FunctionsSecretPort;
  readonly provider?: TypeSafeProvider;
  readonly env?: NodeJS.Dict<string>;
  readonly allowed_behavior_ids?: readonly string[];
}

export function withFunctionsService<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => T,
  options: FunctionsHostOptions = {},
): T {
  const store = openFunctionsStore(homeDirectory);
  try {
    return run(createFunctionsService({
      store,
      secrets: options.secrets ?? createFileSecretStore(),
      env: options.env ?? process.env,
      provider: options.provider ?? createHttpTypeSafeProvider(),
      allowed_behavior_ids: options.allowed_behavior_ids ?? hostAllowedBehaviorIds(),
    }));
  } finally {
    store.close();
  }
}

export async function withFunctionsServiceAsync<T>(
  homeDirectory: string,
  run: (service: ReturnType<typeof createFunctionsService>) => Promise<T>,
  options: FunctionsHostOptions = {},
): Promise<T> {
  const store = openFunctionsStore(homeDirectory);
  try {
    return await run(createFunctionsService({
      store,
      secrets: options.secrets ?? createFileSecretStore(),
      env: options.env ?? process.env,
      provider: options.provider ?? createHttpTypeSafeProvider(),
      allowed_behavior_ids: options.allowed_behavior_ids ?? hostAllowedBehaviorIds(),
    }));
  } finally {
    store.close();
  }
}

export function createFunctionsJudgmentPort(
  homeDirectory: string,
  options: FunctionsHostOptions = {},
): JudgmentPort {
  return {
    judge: (input) => withFunctionsServiceAsync(homeDirectory, (service) => service.judge(input), options),
    bindScene: (sceneId, functionKey, boardId, ref) =>
      withFunctionsService(homeDirectory, (service) => service.bindScene(sceneId, functionKey, boardId, ref), options),
    unbindScene: (sceneId, boardId, ref) =>
      withFunctionsService(homeDirectory, (service) => service.unbindScene(sceneId, boardId, ref), options),
    sceneBinding: (sceneId, boardId, ref) =>
      withFunctionsService(homeDirectory, (service) => service.sceneBinding(sceneId, boardId, ref), options),
    latest: (kind, id, boardId) =>
      withFunctionsService(homeDirectory, (service) => service.latestJudgment(kind, id, boardId), options),
  };
}

export function readFunctionScenesView(
  homeDirectory: string,
  boardId: string,
  options: FunctionsHostOptions = {},
): FunctionScenesView {
  return withFunctionsService(homeDirectory, (service) => ({
    published: service.listPublished().map((row) => ({
      function_key: row.function_key,
      name: row.name,
    })),
    inbox_next: service.sceneBinding(INBOX_NEXT_SCENE_ID, boardId)?.function_key ?? null,
    home_dock: service.sceneBinding(HOME_DOCK_SCENE_ID, boardId)?.function_key ?? null,
  }), options);
}

export function functionSceneHttpBody(
  homeDirectory: string,
  boardId: string,
  sceneId: typeof INBOX_NEXT_SCENE_ID | typeof HOME_DOCK_SCENE_ID,
  options: FunctionsHostOptions = {},
): FunctionSceneHttpBody {
  const view = readFunctionScenesView(homeDirectory, boardId, options);
  return {
    function_key: sceneId === INBOX_NEXT_SCENE_ID ? view.inbox_next : view.home_dock,
    functions: view.published,
  };
}

export function bindBoardFunctionScene(
  homeDirectory: string,
  sceneId: string,
  boardId: string,
  functionKey: string | null,
  options: FunctionsHostOptions = {},
): { function_key: string | null } {
  return withFunctionsService(homeDirectory, (service) => {
    if (!functionKey) {
      service.unbindScene(sceneId, boardId);
      return { function_key: null };
    }
    return { function_key: service.bindScene(sceneId, functionKey, boardId).function_key };
  }, options);
}

export function parseSceneFunctionKey(body: Readonly<Record<string, unknown>>): string | null | undefined {
  if (!("function_key" in body)) return undefined;
  const value = body.function_key;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
