import type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { dispatchMcpProjectTool, type McpPresentationErrorFactory } from "@molis-ai/molis-work-app-mcp";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { namedDatabasePath, prepareLocalProjectStorage } from "./project-storage.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { catalogManagementProject, residentManagementActions } from "./management-action-client.js";
import { bindGoalsManagementActions } from "./goal-callers.js";
import { ensureStandaloneProjectRoot } from "./managed-project-database.js";

export const createPresentationError: McpPresentationErrorFactory = (code, message, details) => new ActionError(code, message, { details });

/** Who is calling a v1 project tool, and on what. A Runtime call runs in its bound project; a management call names its own database. */
interface McpV1ToolCaller {
  localHost: MolisWorkLocalHost;
  audience: "runtime" | "management";
  /** The Runtime's bound project; null for the management audience. */
  runtimeConnection: MolisWorkRuntimeConnection | null;
  resident?: { home: string; origin: string; signal?: AbortSignal };
}

/**
 * Resolves the database and project a v1 project tool call runs against, opens the Host Client for it, and dispatches the tool.
 * A Runtime call uses its connection and nothing in its arguments; a management call names `database_path` (or has
 * MOLIS_WORK_DATABASE) and may name `project_id`. There is no default path.
 */
export async function callMcpV1Tool(caller: McpV1ToolCaller, name: string, arguments_: Record<string, unknown>): Promise<string> {
  const { audience, runtimeConnection } = caller;
  const location = audience === "runtime"
    ? runtimeConnection!.databasePath
    : namedDatabasePath(arguments_.database_path) ?? namedDatabasePath(readProductEnv("DATABASE"));
  if (!location) {
    throw new ActionError("mcp.path_required",
      "管理入口需要明确的数据库路径：在参数 database_path 里给出，或设置环境变量 MOLIS_WORK_DATABASE。没有默认路径，不会按当前目录猜一个。");
  }
  const storage = prepareLocalProjectStorage(location, name === "molis_work_v1_initialize" ? "create" : "existing");
  const { databasePath } = storage;
  if (storage.status === "missing") {
    throw new ActionError("mcp.not_found", `Molis Work 数据库不存在: ${databasePath}`);
  }
  const projectId = String(
    audience === "runtime"
      ? runtimeConnection!.projectId
      : arguments_.project_id ?? `database:${databasePath}`,
  );
  let reference = molisWorkHostProjectReference({
    databasePath,
    projectId,
  });
  const fallback = () => bindGoalsManagementActions(caller.localHost.actionClient(reference), reference, { signal: caller.resident?.signal });
  const owned = audience === "management" && caller.resident ? catalogManagementProject(caller.resident.home, databasePath) : undefined;
  if (owned && owned.project_id !== projectId) throw new ActionError("actions.scope_mismatch", "管理请求与 Home 登记的项目不匹配");
  if (owned) reference = molisWorkHostProjectReference({ databasePath: owned.database_path, projectId: owned.project_id });
  if (!owned && name === "molis_work_v1_initialize" && audience === "management") await ensureStandaloneProjectRoot(caller.localHost, reference);
  if (!owned) await caller.localHost.client(reference).withScope(() => undefined);
  const actions = audience !== "management" ? null : owned && caller.resident ? residentManagementActions({
    home: caller.resident.home, origin: caller.resident.origin, signal: caller.resident.signal,
    databasePath: owned.database_path, projectId: owned.project_id, fallback }) : fallback();

  return dispatchMcpProjectTool(actions, name, arguments_, {
    audience,
    createError: createPresentationError,
  });
}
