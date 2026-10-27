import { existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { ActionError, type ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { ProjectsModule } from "@molis-ai/molis-work-module-projects";
import { LocalSqliteStorage } from "@molis-ai/molis-work-storage";
import { currentCallId, markCallRecorded, newCallId, assertActionInput } from "@molis-ai/molis-work-kernel";
import { actionErrorFromResponse } from "@molis-ai/molis-work-plugin-sdk";
import { assertOwnedCatalog, assertCurrentCatalog } from "./catalog-schema.js";
import { actionGatewayHomeId } from "./action-gateway.js";
import { postToResidentHost, residentHostOrigin } from "./resident-host-request.js";
import { goalsManagementContext, type GoalsManagementActions } from "./goal-callers.js";

export const MANAGEMENT_ACTION_PATH = "/api/internal/management-action";

/** Catalog ownership is read without creating, upgrading or writing a Home. Project facts stay in Projects. */
export function catalogManagementProject(home: string, databasePath: string): { project_id: string; database_path: string } | undefined {
  const path = join(home, "projects", "catalog.db");
  if (!existsSync(path) || !existsSync(databasePath)) return undefined;
  const storage = new LocalSqliteStorage(path, { readonly: true });
  try {
    assertOwnedCatalog(storage, path); assertCurrentCatalog(storage, path);
    const target = realpathSync(databasePath);
    // Only reads the catalog, so it knows no Plugin to enable.
    const matches = new ProjectsModule({ db: storage.db, plugins: { has: () => false, companions: () => [] } }).query.listProjects()
      .filter(project => existsSync(project.database_path) && realpathSync(project.database_path) === target);
    if (matches.length > 1) throw new ActionError("actions.scope_mismatch", "这个数据库对应多个项目，不能选择管理调用范围");
    const project = matches[0];
    return project && { project_id: project.project_id, database_path: project.database_path };
  } finally { storage.close(); }
}

/** Only a never-delivered call may use its original in-process path. Refusal and unknown delivery never fall back. */
export function residentManagementActions(options: {
  home: string; origin: string; databasePath: string; projectId: string; signal?: AbortSignal;
  ensureResident?(): Promise<void>;
  fallback(): GoalsManagementActions;
}): GoalsManagementActions {
  const origin = residentHostOrigin(options.origin);
  let delivered = false;
  return { project_id: options.projectId, async invoke<Input, Output>(definition: ActionDefinition<Input, Output>, input: Input, evidence?: unknown): Promise<Output> {
    options.signal?.throwIfAborted();
    if (options.ensureResident) {
      goalsManagementContext(options.projectId, definition, input, evidence, options.signal);
      assertActionInput(definition.action.input_schema, input);
      await options.ensureResident(); options.signal?.throwIfAborted();
    }
    const callId = currentCallId() ?? newCallId();
    const answer = await postToResidentHost({ origin, homeDirectory: options.home, path: MANAGEMENT_ACTION_PATH, signal: options.signal,
      retryHint: "请先按调用编号核对结果，不要另起一次管理操作",
      body: { home_id: actionGatewayHomeId(options.home), database_path: options.databasePath, project_id: options.projectId, call_id: callId,
        capability: { capability_id: definition.capability_id, version: definition.version }, input, ...(evidence !== undefined ? { evidence } : {}) } });
    if (!answer) {
      options.signal?.throwIfAborted();
      if (delivered) throw new ActionError("actions.delivery_unknown", "这次管理操作已经交给常驻服务，不能换进程继续执行");
      if (options.ensureResident) throw new ActionError("actions.service_unavailable", "生产 MCP 的常驻管理入口不可用，请重新发现并核对原调用");
      return options.fallback().invoke(definition, input, evidence);
    }
    delivered = true;
    if (answer.body.call_id === callId && currentCallId() === callId) markCallRecorded();
    if (!answer.ok) throw actionErrorFromResponse(answer.status, answer.body);
    if (!("result" in answer.body)) throw new ActionError("actions.delivery_unknown", "常驻服务未返回完整管理结果");
    return answer.body.result as Output;
  } };
}
