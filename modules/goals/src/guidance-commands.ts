import { createHash, randomUUID } from "node:crypto";

import type {
  AddProjectGuidanceInput,
  AddProjectGuidanceResult,
  ProjectGuidanceView,
  UpdateProjectGuidanceInput,
  UpdateProjectGuidanceResult,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import {
  isProjectGuidanceKind,
  normalizeProjectGuidanceContent,
  PROJECT_GUIDANCE_ENTRY_MAX_CHARS,
  PROJECT_GUIDANCE_TOTAL_MAX_CHARS,
  projectGuidanceView,
} from "./guidance.js";
import { sqliteJson } from "./repository.js";

export class GuidanceCommands {
  constructor(private readonly context: GoalsCommandContext) {}

  read(boardId: string): ProjectGuidanceView {
    this.context.requireBoard(boardId);
    const repository = this.context.repository;
    const board = repository.db
      .prepare("SELECT title FROM boards WHERE board_id = ?")
      .get(boardId) as { title: unknown };
    return projectGuidanceView({
      projectTitle: String(board.title ?? ""),
      entries: repository.listProjectGuidanceEntries(boardId, true),
      revisions: repository.listProjectGuidanceRevisions(boardId),
    });
  }

  add(input: AddProjectGuidanceInput): AddProjectGuidanceResult {
    const kind = String(input.kind).trim();
    const content = normalizeProjectGuidanceContent(input.content);
    const reason = input.reason.trim();
    const confirmationSummary = input.confirmation_summary.trim();
    const sourceRefs = unique((input.source_refs ?? []).map((item) => item.trim()).filter(Boolean));
    if (input.user_confirmed !== true) {
      throw this.context.error(
        "project_guidance.user_confirmation_required",
        "项目长期说明必须先向用户展示精确分类和原文，并获得明确同意后才能写入",
      );
    }
    if (!isProjectGuidanceKind(kind)) {
      throw this.context.error("project_guidance.kind_invalid", `不支持的项目说明分类: ${kind}`);
    }
    if (!content || !reason || !confirmationSummary) {
      throw this.context.error(
        "project_guidance.invalid",
        "项目说明内容、持久化原因和用户确认摘要不能为空",
      );
    }
    if (content.length > PROJECT_GUIDANCE_ENTRY_MAX_CHARS) {
      throw this.context.error(
        "project_guidance.entry_too_large",
        `单条项目说明不能超过 ${PROJECT_GUIDANCE_ENTRY_MAX_CHARS} 个字符`,
      );
    }
    const contentHash = createHash("sha256").update(content).digest("hex");
    const normalized = {
      board_id: input.board_id,
      kind,
      content,
      source_refs: sourceRefs,
      reason,
      confirmation_summary: confirmationSummary,
      user_confirmed: true,
    };
    const hash = requestHash(normalized);
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<Omit<AddProjectGuidanceResult, "replayed">>(
        input.board_id,
        input.actor_id,
        "add_project_guidance",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(input.board_id);
      const existing = repository
        .listProjectGuidanceEntries(input.board_id, true)
        .find((entry) => entry.kind === kind && entry.content_hash === contentHash);
      const now = this.context.now().toISOString();
      if (existing) {
        const outcome = {
          entry: existing,
          created: false,
          observed_event_cursor: repository.eventCursor(input.board_id),
        };
        this.context.remember(
          input.board_id,
          input.actor_id,
          "add_project_guidance",
          input.idempotency_key,
          hash,
          outcome,
          now,
        );
        return { ...outcome, replayed: false };
      }
      const entries = repository.listProjectGuidanceEntries(input.board_id, true);
      const totalChars = entries
        .filter((entry) => entry.active)
        .reduce((sum, entry) => sum + entry.content.length, 0) + content.length;
      if (totalChars > PROJECT_GUIDANCE_TOTAL_MAX_CHARS) {
        throw this.context.error(
          "project_guidance.total_too_large",
          `项目说明总长度不能超过 ${PROJECT_GUIDANCE_TOTAL_MAX_CHARS} 个字符`,
        );
      }
      const guidanceId = randomUUID();
      const position = entries.reduce((max, entry) => Math.max(max, entry.position), 0) + 1;
      repository.db.prepare(`
        INSERT INTO project_guidance_entries (
          guidance_id, board_id, position, revision, active, kind, content, content_hash,
          source_refs_json, created_by, confirmation_summary, reason, created_at, updated_by, updated_at
        ) VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        guidanceId,
        input.board_id,
        position,
        kind,
        content,
        contentHash,
        sqliteJson(sourceRefs),
        input.actor_id,
        confirmationSummary,
        reason,
        now,
        input.actor_id,
        now,
      );
      repository.db.prepare(`
        INSERT INTO project_guidance_revisions (
          revision_id, guidance_id, board_id, revision, kind, content, content_hash,
          source_refs_json, active, changed_by, change_kind, confirmation_summary, reason, created_at
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 1, ?, 'created', ?, ?, ?)
      `).run(
        randomUUID(),
        guidanceId,
        input.board_id,
        kind,
        content,
        contentHash,
        sqliteJson(sourceRefs),
        input.actor_id,
        confirmationSummary,
        reason,
        now,
      );
      repository.db.prepare("UPDATE boards SET updated_at = ? WHERE board_id = ?")
        .run(now, input.board_id);
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: "project.guidance_added",
        objectType: "project_guidance",
        objectId: guidanceId,
        reason,
        payload: { kind, content_hash: contentHash, position, revision: 1, source_refs: sourceRefs },
        at: now,
      });
      const entry = repository
        .listProjectGuidanceEntries(input.board_id, true)
        .find((candidate) => candidate.guidance_id === guidanceId)!;
      const outcome = { entry, created: true, observed_event_cursor: cursor };
      this.context.remember(
        input.board_id,
        input.actor_id,
        "add_project_guidance",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }

  update(input: UpdateProjectGuidanceInput): UpdateProjectGuidanceResult {
    const action = String(input.action).trim() as UpdateProjectGuidanceInput["action"];
    const reason = input.reason.trim();
    const confirmationSummary = input.confirmation_summary.trim();
    const requestedKind = input.kind == null ? null : String(input.kind).trim();
    const requestedContent = input.content == null
      ? null
      : normalizeProjectGuidanceContent(input.content);
    const requestedSourceRefs = input.source_refs == null
      ? null
      : unique(input.source_refs.map((item) => item.trim()).filter(Boolean));
    if (input.user_confirmed !== true) {
      throw this.context.error(
        "project_guidance.user_confirmation_required",
        "项目说明修改必须来自用户在当前对话的明确确认，或用户在项目说明页面的直接提交",
      );
    }
    if (!( ["edit", "deactivate", "restore"] as const).includes(action)) {
      throw this.context.error(
        "project_guidance.action_invalid",
        `不支持的项目说明操作: ${action}`,
      );
    }
    if (!input.guidance_id.trim() || !reason || !confirmationSummary) {
      throw this.context.error(
        "project_guidance.invalid",
        "项目说明 ID、变更原因和用户确认摘要不能为空",
      );
    }
    if (action === "edit") {
      if (requestedKind == null || !isProjectGuidanceKind(requestedKind)) {
        throw this.context.error(
          "project_guidance.kind_invalid",
          `不支持的项目说明分类: ${requestedKind ?? ""}`,
        );
      }
      if (!requestedContent) {
        throw this.context.error("project_guidance.invalid", "修改后的项目说明内容不能为空");
      }
      if (requestedContent.length > PROJECT_GUIDANCE_ENTRY_MAX_CHARS) {
        throw this.context.error(
          "project_guidance.entry_too_large",
          `单条项目说明不能超过 ${PROJECT_GUIDANCE_ENTRY_MAX_CHARS} 个字符`,
        );
      }
    }
    const request = {
      board_id: input.board_id,
      guidance_id: input.guidance_id.trim(),
      action,
      kind: requestedKind,
      content: requestedContent,
      source_refs: requestedSourceRefs,
      reason,
      confirmation_summary: confirmationSummary,
      user_confirmed: true,
    };
    const hash = requestHash(request);
    const repository = this.context.repository;
    return repository.immediate(() => {
      const replay = this.context.replay<Omit<UpdateProjectGuidanceResult, "replayed">>(
        input.board_id,
        input.actor_id,
        "update_project_guidance",
        input.idempotency_key,
        hash,
      );
      if (replay) return { ...replay, replayed: true };
      this.context.requireBoard(input.board_id);
      const entries = repository.listProjectGuidanceEntries(input.board_id, true);
      const current = entries.find((entry) => entry.guidance_id === request.guidance_id);
      if (!current) {
        throw this.context.error(
          "project_guidance.not_found",
          `找不到项目说明: ${request.guidance_id}`,
        );
      }
      if (action === "deactivate" && !current.active) {
        throw this.context.error("project_guidance.already_inactive", "这条项目说明已经停用");
      }
      if (action === "restore" && current.active) {
        throw this.context.error("project_guidance.already_active", "这条项目说明已经生效");
      }
      if (action === "edit" && !current.active) {
        throw this.context.error("project_guidance.inactive", "请先恢复这条项目说明，再进行修改");
      }

      const kind = action === "edit" ? requestedKind! : current.kind;
      const content = action === "edit" ? requestedContent! : current.content;
      const sourceRefs = action === "edit" && requestedSourceRefs != null
        ? requestedSourceRefs
        : current.source_refs;
      const active = action !== "deactivate";
      const contentHash = createHash("sha256").update(content).digest("hex");
      if (
        action === "edit" &&
        kind === current.kind &&
        content === current.content &&
        JSON.stringify(sourceRefs) === JSON.stringify(current.source_refs)
      ) {
        throw this.context.error("project_guidance.no_changes", "项目说明没有发生变化");
      }
      const duplicate = entries.find(
        (entry) =>
          entry.guidance_id !== current.guidance_id &&
          entry.kind === kind &&
          entry.content_hash === contentHash,
      );
      if (duplicate) {
        throw this.context.error(
          "project_guidance.duplicate",
          "相同分类和内容的项目说明已经存在",
        );
      }
      const totalChars = entries
        .filter((entry) => entry.guidance_id !== current.guidance_id && entry.active)
        .reduce((sum, entry) => sum + entry.content.length, 0) + (active ? content.length : 0);
      if (totalChars > PROJECT_GUIDANCE_TOTAL_MAX_CHARS) {
        throw this.context.error(
          "project_guidance.total_too_large",
          `项目说明总长度不能超过 ${PROJECT_GUIDANCE_TOTAL_MAX_CHARS} 个字符`,
        );
      }

      const revision = current.revision + 1;
      const now = this.context.now().toISOString();
      repository.db.prepare(`
        UPDATE project_guidance_entries
        SET revision = ?, active = ?, kind = ?, content = ?, content_hash = ?,
            source_refs_json = ?, confirmation_summary = ?, reason = ?, updated_by = ?, updated_at = ?
        WHERE guidance_id = ? AND board_id = ?
      `).run(
        revision,
        active ? 1 : 0,
        kind,
        content,
        contentHash,
        sqliteJson(sourceRefs),
        confirmationSummary,
        reason,
        input.actor_id,
        now,
        current.guidance_id,
        input.board_id,
      );
      const revisionId = randomUUID();
      repository.db.prepare(`
        INSERT INTO project_guidance_revisions (
          revision_id, guidance_id, board_id, revision, kind, content, content_hash,
          source_refs_json, active, changed_by, change_kind, confirmation_summary, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        revisionId,
        current.guidance_id,
        input.board_id,
        revision,
        kind,
        content,
        contentHash,
        sqliteJson(sourceRefs),
        active ? 1 : 0,
        input.actor_id,
        action === "edit" ? "edited" : action === "deactivate" ? "deactivated" : "restored",
        confirmationSummary,
        reason,
        now,
      );
      repository.db.prepare("UPDATE boards SET updated_at = ? WHERE board_id = ?")
        .run(now, input.board_id);
      const cursor = repository.appendEvent({
        eventId: randomUUID(),
        boardId: input.board_id,
        actorId: input.actor_id,
        type: `project.guidance_${
          action === "edit" ? "edited" : action === "deactivate" ? "deactivated" : "restored"
        }`,
        objectType: "project_guidance",
        objectId: current.guidance_id,
        reason,
        payload: { action, revision, kind, content_hash: contentHash, active, source_refs: sourceRefs },
        at: now,
      });
      const entry = repository
        .listProjectGuidanceEntries(input.board_id, true)
        .find((candidate) => candidate.guidance_id === current.guidance_id)!;
      const revisionRecord = repository
        .listProjectGuidanceRevisions(input.board_id)
        .find((candidate) => candidate.revision_id === revisionId)!;
      const outcome = { entry, revision: revisionRecord, observed_event_cursor: cursor };
      this.context.remember(
        input.board_id,
        input.actor_id,
        "update_project_guidance",
        input.idempotency_key,
        hash,
        outcome,
        now,
      );
      return { ...outcome, replayed: false };
    });
  }
}
