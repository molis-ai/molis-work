import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";
import type { SessionContentService } from "./content.js";
import type { SessionDirectoryService } from "./directory.js";
import {
  MolisWorkSessionError,
  type MolisWorkSessionHandoffRecord,
  type MolisWorkSessionRecord,
  type SessionHandoffGoalContext,
  type PrepareSessionHandoffInput,
  type SendSessionHandoffInput,
  type SessionHandoffResult,
} from "./types.js";
import { buildSessionHandoffPackage } from "./handoff-package.js";
import { SessionHandoffDelivery } from "./handoff-delivery.js";

export class SessionHandoffService {
  private readonly delivery: SessionHandoffDelivery;

  constructor(
    private readonly registry: WorkSessionApi,
    router: RuntimeHostApi,
    directory: SessionDirectoryService,
    private readonly content: SessionContentService,
  ) {
    this.delivery = new SessionHandoffDelivery(registry, router, directory);
  }

  async prepare(input: PrepareSessionHandoffInput): Promise<{ handoff: MolisWorkSessionHandoffRecord; reused: boolean }> {
    const source = this.validateSource(input.source_session_id, input.project_id, input.goal_contract);
    const existing = this.registry.latestPendingHandoff(source.session_id);
    if (
      existing
      && existing.source_project_id === input.project_id
      && existing.source_goal_id === input.goal_contract.goal.goal_id
      && existing.content_available
    ) {
      return { handoff: existing, reused: true };
    }
    const timeline = await this.content.read(source.session_id);
    const packageContent = buildSessionHandoffPackage({
      source_session: source,
      project_name: input.project_name,
      goal_contract: input.goal_contract,
      timeline: timeline.events,
    });
    return {
      handoff: this.registry.createHandoffDraft({
        source_session_id: source.session_id,
        source_project_id: input.project_id,
        source_goal_id: input.goal_contract.goal.goal_id,
        source_goal_version: input.goal_contract.goal.current_contract_revision,
        target_runtime_id: input.target_runtime_id,
        target_project_id: input.project_id,
        target_workspace_id: input.target_workspace_id,
        target_workspace_path: input.target_workspace_path,
        content: packageContent,
        actor_id: input.actor_id,
      }),
      reused: false,
    };
  }

  update(input: SendSessionHandoffInput): MolisWorkSessionHandoffRecord {
    const current = this.registry.getHandoff(input.package_id);
    this.validatePersistedSource(current);
    const targetWorkspacePath = input.target_workspace_path === undefined
      ? current.target_workspace_path
      : input.target_workspace_path;
    const targetWorkspaceId = input.target_workspace_id !== undefined
      ? input.target_workspace_id
      : targetWorkspacePath === current.target_workspace_path
        ? current.target_workspace_id
        : null;
    return this.registry.updateHandoffDraft({
      package_id: current.package_id,
      target_runtime_id: input.target_runtime_id,
      target_project_id: current.source_project_id,
      target_workspace_id: targetWorkspaceId,
      target_workspace_path: targetWorkspacePath,
      content: input.content,
      actor_id: input.actor_id,
    });
  }

  async send(input: SendSessionHandoffInput): Promise<SessionHandoffResult> {
    if (!input.user_confirmed) {
      throw new MolisWorkSessionError("session.confirmation_required", "创建目标 Session 并发送 Handoff 前必须明确确认");
    }
    const persisted = this.registry.getHandoff(input.package_id);
    if (persisted.state === "sent") {
      return {
        handoff: persisted,
        destination_session: persisted.destination_session_id
          ? this.registry.get(persisted.destination_session_id)
          : null,
      };
    }
    if (persisted.state === "failed" && !persisted.retryable) {
      throw new MolisWorkSessionError(
        "session.handoff_invalid_state",
        "这次失败不能安全重试；请取消后重新创建 Handoff",
      );
    }
    this.validatePersistedSource(persisted);
    const draft = this.update(input);
    if (!draft.content_available || !draft.content) {
      throw new MolisWorkSessionError("session.invalid_input", "Handoff 加密正文当前不可读取，不能发送");
    }
    const sending = this.registry.markHandoffSending(draft.package_id);
    if (sending.state === "sent") {
      return {
        handoff: sending,
        destination_session: sending.destination_session_id
          ? this.registry.get(sending.destination_session_id)
          : null,
      };
    }
    return this.delivery.send(sending, input.actor_id);
  }

  cancel(packageId: string): MolisWorkSessionHandoffRecord {
    return this.registry.cancelHandoff(packageId);
  }

  private validateSource(
    sessionId: string,
    projectId: string,
    contract: SessionHandoffGoalContext,
  ): MolisWorkSessionRecord {
    const source = this.registry.get(sessionId);
    if (source.project_id !== projectId) {
      throw new MolisWorkSessionError("session.not_found", "找不到当前 Project 的这条来源 Session");
    }
    if (!source.current_goal_id) {
      throw new MolisWorkSessionError("session.invalid_input", "请先为来源 Session 选择当前 Goal");
    }
    if (source.current_goal_id !== contract.goal.goal_id || contract.goal.board_id !== contract.board.board_id) {
      throw new MolisWorkSessionError("session.invalid_input", "来源 Session 的当前 Goal 已变化，请重新打开 Handoff");
    }
    return source;
  }

  private validatePersistedSource(handoff: MolisWorkSessionHandoffRecord): MolisWorkSessionRecord {
    const source = this.registry.get(handoff.source_session_id);
    if (source.project_id !== handoff.source_project_id || source.current_goal_id !== handoff.source_goal_id) {
      throw new MolisWorkSessionError("session.invalid_input", "来源 Session 的当前 Project 或 Goal 已变化，请重新生成 Handoff");
    }
    if (handoff.target_project_id !== handoff.source_project_id) {
      throw new MolisWorkSessionError("session.invalid_input", "当前版本只允许在来源 Project 内创建 Handoff");
    }
    return source;
  }

}
