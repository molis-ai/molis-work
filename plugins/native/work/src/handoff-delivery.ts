import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { SessionDirectoryService } from "./directory.js";
import {
  MolisWorkSessionError,
  type MolisWorkSessionHandoffRecord,
  type MolisWorkSessionRecord,
  type SessionHandoffResult,
} from "./types.js";

/** Send/recovery orchestration only; the Session module owns every persisted transition. */
export class SessionHandoffDelivery {
  constructor(
    private readonly registry: WorkSessionApi,
    private readonly router: RuntimeHostApi,
    private readonly directory: SessionDirectoryService,
  ) {}

  send(handoff: MolisWorkSessionHandoffRecord, actorId: string): Promise<SessionHandoffResult> {
    return this.router.capabilities(handoff.target_runtime_id).handoff === "native"
      ? this.sendNative(handoff, actorId)
      : this.sendFallback(handoff, actorId);
  }

  private async sendNative(
    handoff: MolisWorkSessionHandoffRecord,
    actorId: string,
  ): Promise<SessionHandoffResult> {
    let destination = handoff.destination_session_id
      ? this.registry.get(handoff.destination_session_id)
      : this.findRecordedDestination(handoff);
    if (!destination) {
      const created = await this.router.invoke(handoff.target_runtime_id, "create", {
        ...(handoff.target_workspace_path ? { cwd: handoff.target_workspace_path } : {}),
      });
      if (created.status !== "ok") {
        const retryable = created.status === "failed" && created.recovery?.retryable === true;
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: created.code,
          error_message: retryable
            ? "目标 Runtime 明确没有创建 Session。来源 Session 与草稿已保留，可以重试。"
            : "目标 Session 的创建结果不确定。为避免重复创建，Molis Work 不会自动重试；请先检查目标 Runtime。",
          retryable,
        });
        return { handoff: failed, destination_session: null };
      }
      const nativeSessionId = nativeSessionIdFromValue(created.value);
      if (!nativeSessionId) {
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: "runtime.native_session_id_missing",
          error_message: "目标 Runtime 已响应创建请求，但没有返回可识别的 Session ID。创建结果不确定；为避免重复创建，Molis Work 不会自动重试，请先检查目标 Runtime。",
          retryable: false,
        });
        return { handoff: failed, destination_session: null };
      }
      try {
        destination = this.ensureNativeDestination(handoff, nativeSessionId, actorId);
        handoff = this.registry.attachHandoffDestination({
          package_id: handoff.package_id,
          destination_session_id: destination.session_id,
          delivery_mode: "native",
        });
      } catch (error) {
        const failed = this.registry.markHandoffFailed({
          package_id: handoff.package_id,
          error_code: error instanceof MolisWorkSessionError ? error.code : "session.identity_conflict",
          error_message: error instanceof Error ? error.message : String(error),
          retryable: false,
        });
        return { handoff: failed, destination_session: null };
      }
    } else if (!handoff.destination_session_id) {
      handoff = this.registry.attachHandoffDestination({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
    }
    const nativeSessionId = destination.native_runtime_session_id;
    if (!nativeSessionId) {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "runtime.native_session_id_missing",
        error_message: "目标 Session 缺少 Runtime 原生 ID，不能发送 Handoff。",
        retryable: false,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      return { handoff: failed, destination_session: destination };
    }
    const result = await this.router.invoke(handoff.target_runtime_id, "handoff", {
      prompt: handoff.content,
      existingThreadId: nativeSessionId,
    });
    if (result.status !== "ok") {
      const retryable = result.status === "failed" && result.recovery?.retryable === true;
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: result.code,
        error_message: retryable
          ? "目标 Session 已创建，且 Runtime 明确没有接受 Handoff 内容；重试只会补发内容。"
          : "目标 Session 已创建，但 Handoff 是否送达无法确认。为避免重复消息，Molis Work 不会自动重试；请先检查目标 Session 内容。",
        retryable,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      this.recordDestinationStatus(destination, failed, "Handoff 内容尚未送达，等待重试");
      return { handoff: failed, destination_session: destination };
    }
    const deliveredNativeSessionId = nativeSessionIdFromValue(result.value);
    if (deliveredNativeSessionId && deliveredNativeSessionId !== nativeSessionId) {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "session.identity_conflict",
        error_message: "目标 Runtime 返回了另一条 Session 身份；Molis Work 没有覆盖已确认的目标关系。",
        retryable: false,
        destination_session_id: destination.session_id,
        delivery_mode: "native",
      });
      return { handoff: failed, destination_session: destination };
    }
    const sent = this.registry.markHandoffSent({
      package_id: handoff.package_id,
      destination_session_id: destination.session_id,
      delivery_mode: "native",
    });
    this.recordLineageEvents(destination, sent);
    return { handoff: sent, destination_session: destination };
  }

  private async sendFallback(
    handoff: MolisWorkSessionHandoffRecord,
    actorId: string,
  ): Promise<SessionHandoffResult> {
    let destination = handoff.destination_session_id
      ? this.registry.get(handoff.destination_session_id)
      : null;
    try {
      destination ??= await this.directory.create({
        runtime_id: handoff.target_runtime_id,
        actor_id: actorId,
        user_confirmed: true,
        project_id: handoff.target_project_id,
        current_goal_id: handoff.source_goal_id,
        workspace_id: handoff.target_workspace_id,
        workspace_path: handoff.target_workspace_path,
        title: this.destinationTitle(handoff),
      });
      this.registry.attachHandoffDestination({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "molis_work_fallback",
      });
      this.registry.appendEvent({
        session_id: destination.session_id,
        source: "goalboard",
        kind: "user_message",
        source_id: `handoff:${handoff.package_id}:package`,
        content: handoff.content ?? "",
        metadata: {
          handoff_package_id: handoff.package_id,
          source_session_id: handoff.source_session_id,
          delivery_mode: "molis_work_fallback",
        },
      });
      const sent = this.registry.markHandoffSent({
        package_id: handoff.package_id,
        destination_session_id: destination.session_id,
        delivery_mode: "molis_work_fallback",
      });
      this.recordLineageEvents(destination, sent);
      return { handoff: sent, destination_session: destination };
    } catch {
      const failed = this.registry.markHandoffFailed({
        package_id: handoff.package_id,
        error_code: "handoff.fallback_failed",
        error_message: destination
          ? "目标托管 Session 已创建，但 package 写入失败；重试会继续使用这条 Session。"
          : "Molis Work 无法创建目标托管 Session；来源 Session 与草稿已保留。",
        retryable: true,
        destination_session_id: destination?.session_id,
        delivery_mode: destination ? "molis_work_fallback" : null,
      });
      return { handoff: failed, destination_session: destination };
    }
  }

  private ensureNativeDestination(
    handoff: MolisWorkSessionHandoffRecord,
    nativeSessionId: string,
    actorId: string,
  ): MolisWorkSessionRecord {
    if (handoff.destination_session_id) {
      const current = this.registry.get(handoff.destination_session_id);
      if (current.native_runtime_session_id === nativeSessionId) return current;
      throw new MolisWorkSessionError("session.identity_conflict", "Handoff 已连接另一个目标 Runtime Session");
    }
    const existing = this.registry.findByNativeRuntimeSession(handoff.target_runtime_id, nativeSessionId);
    if (existing) {
      if (
        existing.session_id !== handoff.source_session_id
        && existing.metadata.handoff_package_id === handoff.package_id
      ) return existing;
      throw new MolisWorkSessionError(
        "session.identity_conflict",
        "目标 Runtime 返回的不是一条新的 Session；Molis Work 没有覆盖现有 Session 关系",
      );
    }
    return this.registry.createSession({
      runtime_id: handoff.target_runtime_id,
      native_runtime_session_id: nativeSessionId,
      actor_id: actorId,
      user_confirmed: true,
      project_id: handoff.target_project_id,
      current_goal_id: handoff.source_goal_id,
      workspace_id: handoff.target_workspace_id,
      workspace_path: handoff.target_workspace_path,
      title: this.destinationTitle(handoff),
      provenance: "explicitly_linked",
      metadata: {
        handoff_package_id: handoff.package_id,
        handoff_source_session_id: handoff.source_session_id,
      },
    });
  }

  private findRecordedDestination(handoff: MolisWorkSessionHandoffRecord): MolisWorkSessionRecord | null {
    return this.registry.list({ runtime_id: handoff.target_runtime_id })
      .find((session) => (
        session.session_id !== handoff.source_session_id
        && session.metadata.handoff_package_id === handoff.package_id
      )) ?? null;
  }

  private destinationTitle(handoff: MolisWorkSessionHandoffRecord): string {
    const source = this.registry.get(handoff.source_session_id);
    return `Handoff · ${source.title || handoff.source_goal_id}`.slice(0, 160);
  }

  private recordLineageEvents(destination: MolisWorkSessionRecord, handoff: MolisWorkSessionHandoffRecord): void {
    try {
      this.registry.appendEvent({
        session_id: handoff.source_session_id,
        source: "goalboard",
        kind: "status",
        source_id: `handoff:${handoff.package_id}:sent`,
        content: `Handoff 已创建目标 ${destination.runtime_id} Session：${destination.session_id}`,
        metadata: {
          handoff_package_id: handoff.package_id,
          destination_session_id: destination.session_id,
          delivery_mode: handoff.delivery_mode,
        },
      });
    } catch {
      // The handoff record is the source of truth. Supplementary timeline events
      // must never turn a completed delivery into a false API failure.
    }
    this.recordDestinationStatus(destination, handoff, `由来源 Session ${handoff.source_session_id} 创建`);
  }

  private recordDestinationStatus(
    destination: MolisWorkSessionRecord,
    handoff: MolisWorkSessionHandoffRecord,
    content: string,
  ): void {
    try {
      this.registry.appendEvent({
        session_id: destination.session_id,
        source: "goalboard",
        kind: "status",
        source_id: `handoff:${handoff.package_id}:lineage`,
        content,
        metadata: {
          handoff_package_id: handoff.package_id,
          source_session_id: handoff.source_session_id,
          delivery_mode: handoff.delivery_mode,
        },
      });
    } catch {
      // Delivery state and lineage remain persisted in the handoff record even
      // when the optional human-readable timeline annotation cannot be written.
    }
  }
}

function nativeSessionIdFromValue(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const thread = record.thread && typeof record.thread === "object" && !Array.isArray(record.thread)
    ? record.thread as Record<string, unknown>
    : null;
  return optionalText(thread?.id)
    ?? optionalText(record.threadId)
    ?? optionalText(record.thread_id)
    ?? optionalText(record.id);
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}
