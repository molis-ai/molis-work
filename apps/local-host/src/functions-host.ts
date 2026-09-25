import { selectedTypeSafeConnection, typeSafeCredential } from "./typesafe-connection.js";
import { withConnectorConnections } from "./connector-connection-store.js";
import { createLazyFileSecretStore, peekSealedEntry, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import {
  FUNCTIONS_CREDENTIAL_REF,
  FEED_CAPTURE_SCENE_ID,
  HOME_DOCK_SCENE_ID,
  INBOX_NEXT_SCENE_ID,
  functionFitsScene,
  type JudgmentPort,
  type FunctionsSettingsStatus,
} from "@molis-ai/molis-work-contracts/modules/functions";
import {
  createFunctionsService,
  createHttpTypeSafeProvider,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import { hostHomeDockBehaviors, liveHostAllowedBehaviorIds } from "./behavior-catalog.js";

export interface FunctionSceneChoice {
  readonly function_key: string;
  readonly name: string;
}

export interface FunctionScenesView {
  readonly inbox_next: string | null;
  readonly home_dock: string | null;
  readonly inbox_next_functions: readonly FunctionSceneChoice[];
  readonly home_dock_functions: readonly FunctionSceneChoice[];
  readonly feed_capture_functions: readonly FunctionSceneChoice[];
  readonly dock_behaviors: readonly {
    readonly behavior_id: string;
    readonly title: string;
    readonly subject_kinds: readonly string[];
  }[];
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

/** Discovery inspects configuration without unlocking the user's Keychain. Execution resolves the secret. */
export function functionsCredentialConfigured(home: string, options: FunctionsHostOptions = {}): boolean {
  if ((options.env ?? process.env).TYPESAFE_API_KEY?.trim()) return true;
  if (options.secrets) return !!options.secrets.get(FUNCTIONS_CREDENTIAL_REF)?.trim();
  const selected = selectedTypeSafeConnection(home, "functions");
  const ref = selected ? withConnectorConnections(home, store => {
    const connection = store.get(selected.connection_id);
    return connection && connection.service_id === "typesafe" && !connection.disconnected_at ? connection.credential_ref : null;
  }) : FUNCTIONS_CREDENTIAL_REF;
  return !!ref && runWithMolisWorkHome(home, () => peekSealedEntry(ref) !== null);
}

export function functionsConnectionStatus(home: string, options: FunctionsHostOptions = {}): FunctionsSettingsStatus {
  const configured = functionsCredentialConfigured(home, options);
  return { has_credential: configured, source: (options.env ?? process.env).TYPESAFE_API_KEY?.trim() ? "env" : configured ? "ui" : "none" };
}

function functionsSecrets(home: string, options: FunctionsHostOptions): FunctionsSecretPort {
  if (options.secrets) return options.secrets;
  const base = createLazyFileSecretStore(home);
  return { get: ref => ref === FUNCTIONS_CREDENTIAL_REF ? typeSafeCredential(home, "functions") : base.get(ref),
    put: (ref, value) => base.put(ref, value), delete: ref => base.delete(ref) };
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
      secrets: functionsSecrets(homeDirectory, options),
      env: options.env ?? process.env,
      provider: options.provider ?? createHttpTypeSafeProvider(),
      allowed_behavior_ids: options.allowed_behavior_ids ?? (() => runWithMolisWorkHome(homeDirectory, liveHostAllowedBehaviorIds)),
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
      secrets: functionsSecrets(homeDirectory, options),
      env: options.env ?? process.env,
      provider: options.provider ?? createHttpTypeSafeProvider(),
      allowed_behavior_ids: options.allowed_behavior_ids ?? (() => runWithMolisWorkHome(homeDirectory, liveHostAllowedBehaviorIds)),
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
    latest: (kind, id, boardId, sceneId) =>
      withFunctionsService(homeDirectory, (service) => service.latestJudgment(kind, id, boardId, sceneId), options),
  };
}

export function readFunctionScenesView(
  homeDirectory: string,
  boardId: string,
  options: FunctionsHostOptions = {},
): FunctionScenesView {
  return withFunctionsService(homeDirectory, (service) => ({
    inbox_next: service.sceneBinding(INBOX_NEXT_SCENE_ID, boardId)?.function_key ?? null,
    home_dock: service.sceneBinding(HOME_DOCK_SCENE_ID, boardId)?.function_key ?? null,
    inbox_next_functions: publishedChoicesForScene(service, INBOX_NEXT_SCENE_ID),
    home_dock_functions: publishedChoicesForScene(service, HOME_DOCK_SCENE_ID),
    feed_capture_functions: publishedChoicesForScene(service, FEED_CAPTURE_SCENE_ID),
    dock_behaviors: hostHomeDockBehaviors(),
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
    functions: sceneId === INBOX_NEXT_SCENE_ID ? view.inbox_next_functions : view.home_dock_functions,
  };
}

function publishedChoicesForScene(
  service: ReturnType<typeof createFunctionsService>,
  sceneId: string,
): FunctionSceneChoice[] {
  return service.list()
    .filter((row) => row.status === "published" && row.version != null && functionFitsScene(row, sceneId))
    .map((row) => ({
      function_key: row.function_key,
      name: row.name,
    }));
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
