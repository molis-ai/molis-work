import type { CreateAndBindRuntimeContextInput, MolisWorkRuntimeContextResolution } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import type { RuntimeContextBindingRepository } from "./context-bindings.js";
import type { RuntimeProjectBindingCommands } from "./project-binding-commands.js";
import type { RuntimeProjectBindingValidation, RuntimeProjectBindingErrorFactory } from "./project-binding-validation.js";
import { boundResolution } from "./project-resolution.js";

export interface RuntimeProjectSetupPorts {
  bindings: Pick<RuntimeProjectBindingCommands, "resolveRuntimeContext" | "findRuntimeContextSetupRequest" | "findWorkspaceMembershipByIds" | "bindRuntimeContextInTransaction">;
  validation: RuntimeProjectBindingValidation;
  error: RuntimeProjectBindingErrorFactory;
  getProject(projectId: string): ProjectRecord;
  registerProject(record: ProjectRecord, eventType: "project.created", actorId: string): void;
  insertSetupRequest: RuntimeContextBindingRepository["insertSetupRequest"];
  transaction<T>(operation: () => T): T;
  provisionCreatedProject<T>(input: { displayName: string; actorId: string }, commit: (record: ProjectRecord) => T): Promise<T>;
}

/** Apply confirmation and replay rules around a Host-owned recoverable project provision. */
export function createRuntimeProjectSetup(ports: RuntimeProjectSetupPorts) {
return async function createProjectAndBindRuntimeContext(
    input: CreateAndBindRuntimeContextInput,
  ): Promise<MolisWorkRuntimeContextResolution> {
    const normalized = ports.validation.requireRoutableRuntimeWorkContext(input.context);
    const actorId = ports.validation.requiredActorId(input.actor_id);
    const displayName = ports.validation.requiredName(input.display_name);
    if (input.user_confirmed !== true) {
      throw ports.error(
        "context.user_confirmation_required",
        "只有用户在当前对话明确要求新建项目后才能创建并绑定",
      );
    }
    if (input.binding_scope === "workspace_default") {
      throw ports.error(
        "context.workspace_default_unsupported",
        "工作目录不再保存默认项目；请为当前 Session 选择项目",
      );
    }
    const idempotencyKey = ports.validation.requiredContextIdempotencyKey(input.idempotency_key);
    const requestFingerprint = JSON.stringify({
      display_name: displayName,
      actor_id: actorId,
      rebind_confirmed: input.rebind_confirmed === true,
      binding_scope: input.binding_scope ?? null,
    });
    const replay = ports.bindings.findRuntimeContextSetupRequest(normalized, idempotencyKey);
    if (replay) {
      if (replay.request_fingerprint !== requestFingerprint) {
        throw ports.error(
          "context.idempotency_conflict",
          "同一个项目创建请求键不能用于不同的项目名称、执行者或切换决定",
        );
      }
      const current = ports.bindings.resolveRuntimeContext(input.context);
      const replayMembership = normalized.workspace
        ? ports.bindings.findWorkspaceMembershipByIds(normalized.workspace.workspace_id, replay.project_id)
        : null;
      if (
        (current.status === "bound" && current.project?.project_id !== replay.project_id)
        || (current.status !== "bound" && !replayMembership)
      ) {
        throw ports.error(
          "context.idempotency_conflict",
          "这个项目创建请求已被后续项目切换取代，不能用旧请求恢复连接",
        );
      }
      return boundResolution(normalized, ports.getProject(replay.project_id));
    }

    // Refuse a missing rebind confirmation before creating a directory or DB.
    const current = ports.bindings.resolveRuntimeContext(input.context);
    if (
      current.status === "bound"
      && normalized.stable_work_context_id !== null
      && input.rebind_confirmed !== true
    ) {
      throw ports.error(
        "context.rebind_confirmation_required",
        "这个 Runtime 工作入口已绑定其他项目；请在当前对话明确确认后再创建并切换",
      );
    }

    return ports.provisionCreatedProject({ displayName, actorId }, (record) =>
      ports.transaction(() => {
        const racedReplay = ports.bindings.findRuntimeContextSetupRequest(normalized, idempotencyKey);
        if (racedReplay) {
          throw ports.error(
            "context.idempotency_conflict",
            "同一个项目创建请求正在或已经由另一个调用处理，请重新解析当前项目连接",
          );
        }
        ports.registerProject(record, "project.created", actorId);
        const resolution = ports.bindings.bindRuntimeContextInTransaction({
          normalized,
          projectId: record.project_id,
          actorId,
          rebindConfirmed: input.rebind_confirmed === true,
          bindingScope: input.binding_scope
            ?? (normalized.stable_work_context_id ? "session" : "workspace_member"),
        });
        ports.insertSetupRequest({
          runtime_id: normalized.runtime_id,
          persistence_id: ports.validation.runtimeContextPersistenceId(normalized),
          idempotency_key: idempotencyKey,
          request_fingerprint: requestFingerprint,
          project_id: record.project_id,
          created_at: new Date().toISOString(),
        });
        return resolution;
      }),
    );
  };
}
