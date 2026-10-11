import type { MolisWorkRuntimeConnection } from "@molis-ai/molis-work-contracts/platform/app-host";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import { dispatchMcpProjectTool, type McpPresentationErrorFactory } from "@molis-ai/molis-work-app-mcp";
import { readProductEnv } from "@molis-ai/molis-work-storage";
import { molisWorkHostProjectReference, type MolisWorkLocalHost } from "./project-host.js";
import { namedDatabasePath, prepareLocalProjectStorage } from "./project-storage.js";

export const createPresentationError: McpPresentationErrorFactory = (code, message, details) => new MolisWorkV1Error(code, message, details);

/** Who is calling a v1 project tool, and on what. A Runtime call runs in its bound project; a management call names its own database. */
export interface McpV1ToolCaller {
  localHost: MolisWorkLocalHost;
  audience: "runtime" | "management";
  /** The Runtime's bound project; null for the management audience. */
  runtimeConnection: MolisWorkRuntimeConnection | null;
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
    throw new MolisWorkV1Error("store.path_required",
      "管理入口需要明确的数据库路径：在参数 database_path 里给出，或设置环境变量 MOLIS_WORK_DATABASE。没有默认路径，不会按当前目录猜一个。");
  }
  const storage = prepareLocalProjectStorage(location, name === "molis_work_v1_initialize" ? "create" : "existing");
  const { databasePath } = storage;
  if (storage.status === "missing") {
    throw new MolisWorkV1Error("store.not_found", `Molis Work 数据库不存在: ${databasePath}`);
  }
  const projectId = String(
    audience === "runtime"
      ? runtimeConnection!.projectId
      : arguments_.project_id ?? `database:${databasePath}`,
  );
  const reference = molisWorkHostProjectReference({
    databasePath,
    projectId,
  });
  const client = caller.localHost.client(reference);
  return dispatchMcpProjectTool(client, name, arguments_, {
    audience,
    webBaseUrl: () => String(audience === "runtime" ? runtimeConnection!.webBaseUrl
      : arguments_.web_base_url ?? readProductEnv("WEB_URL") ?? "http://127.0.0.1:4173"),
    projectId: runtimeConnection?.projectId,
    createError: createPresentationError,
  });
}
