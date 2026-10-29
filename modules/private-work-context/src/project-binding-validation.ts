import type { RuntimeWorkContext, NormalizedRuntimeWorkContext, RuntimeWorkspaceContext, NormalizedRuntimeWorkspaceContext } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import { bindingErrors } from "./binding-errors.js";
import { projectCatalogErrors } from "@molis-ai/molis-work-contracts/modules/projects";
interface RuntimeProjectBindingValidationPorts {
  normalizeProjectWorkspace(input: RuntimeWorkspaceContext | null | undefined): NormalizedRuntimeWorkspaceContext | undefined;
}

/** Preserve host-declared identity, exact workspace normalization and explicit-confirmation validation. */
export function createRuntimeProjectBindingValidation({ normalizeProjectWorkspace }: RuntimeProjectBindingValidationPorts) {
function normalizeRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const runtimeId = requiredRuntimeId(input.runtime_id);
  const stableWorkContextId = input.host_declares_stable === true
    && typeof input.stable_work_context_id === "string"
    ? input.stable_work_context_id.trim() || null
    : null;
  const workspace = normalizeRuntimeWorkspaceContext(input.workspace);
  return {
    runtime_id: runtimeId,
    stable_work_context_id: stableWorkContextId,
    ...(workspace ? { workspace } : {}),
  };
}

function normalizeRuntimeWorkspaceContext(
  input: RuntimeWorkspaceContext | null | undefined,
): NormalizedRuntimeWorkspaceContext | undefined {
  return normalizeProjectWorkspace(input);
}

function requireStableRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const normalized = normalizeRuntimeWorkContext(input);
  if (!normalized.stable_work_context_id) {
    throw bindingErrors.stable_identity_required("当前 Runtime 没有宿主明确声明的稳定工作入口，不能建立自动连接绑定",
    );
  }
  return normalized;
}

function requireRoutableRuntimeWorkContext(input: RuntimeWorkContext): NormalizedRuntimeWorkContext {
  const normalized = normalizeRuntimeWorkContext(input);
  if (!normalized.stable_work_context_id && !normalized.workspace) {
    throw bindingErrors.stable_identity_required("当前 Runtime 没有 Session 标识或可用的项目目录，不能保存项目关联",
    );
  }
  return normalized;
}

function runtimeContextPersistenceId(context: NormalizedRuntimeWorkContext): string {
  if (context.stable_work_context_id) return context.stable_work_context_id;
  // Callers hold a context that passed requireRoutableRuntimeWorkContext: without a Session id it has a workspace.
  return `workspace-request:${context.workspace!.workspace_id}`;
}

function requiredName(value: string): string {
  const name = value.trim();
  if (!name) throw projectCatalogErrors.invalid_name("项目显示名称不能为空");
  return name;
}

function requiredProjectId(value: string): string {
  const projectId = value.trim();
  if (!projectId) {
    throw projectCatalogErrors.project_not_found("项目 ID 不能为空");
  }
  return projectId;
}

function requiredRuntimeId(value: string): string {
  const runtimeId = value.trim();
  if (!runtimeId) {
    throw bindingErrors.stable_identity_required("Runtime 标识不能为空");
  }
  return runtimeId;
}

function requiredActorId(value: string): string {
  const actorId = value.trim();
  if (!actorId) {
    throw bindingErrors.user_confirmation_required("绑定操作必须记录执行者");
  }
  return actorId;
}

function requiredContextIdempotencyKey(value: string): string {
  const key = value.trim();
  if (!key) {
    throw bindingErrors.idempotency_key_required("创建并绑定项目需要幂等请求键",
    );
  }
  return key;
}
  return { normalizeRuntimeWorkContext, normalizeRuntimeWorkspaceContext, requireStableRuntimeWorkContext, requireRoutableRuntimeWorkContext, runtimeContextPersistenceId, requiredName, requiredProjectId, requiredRuntimeId, requiredActorId, requiredContextIdempotencyKey };
}
export type RuntimeProjectBindingValidation = ReturnType<typeof createRuntimeProjectBindingValidation>;
