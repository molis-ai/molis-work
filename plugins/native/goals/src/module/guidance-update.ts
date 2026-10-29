import type {
  ProjectGuidanceEntryRecord,
  ProjectGuidanceKind,
  UpdateProjectGuidanceInput,
  UpdateProjectGuidanceResult,
} from "../contract/goals.js";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import { goalErrors } from "./errors.js";
import {
  isProjectGuidanceKind,
  normalizeProjectGuidanceContent,
  PROJECT_GUIDANCE_ENTRY_MAX_CHARS,
  PROJECT_GUIDANCE_TOTAL_MAX_CHARS,
} from "./guidance.js";
import { guidanceContentHash, writeGuidanceRevision } from "./guidance-write.js";
import { sqliteJson, type GoalsRepository } from "./repository.js";

type UpdateAction = UpdateProjectGuidanceInput["action"];
type UpdateOutcome = Omit<UpdateProjectGuidanceResult, "replayed">;

const CHANGE_KIND = { edit: "edited", deactivate: "deactivated", restore: "restored" } as const;

interface UpdateGuidanceRequest {
  project_id: string;
  guidance_id: string;
  action: UpdateAction;
  kind: string | null;
  content: string | null;
  source_refs: string[] | null;
  reason: string;
  confirmation_summary: string;
  user_confirmed: true;
}

interface GuidanceState {
  kind: ProjectGuidanceKind;
  content: string;
  contentHash: string;
  sourceRefs: string[];
  active: boolean;
}

function readUpdateRequest(input: UpdateProjectGuidanceInput): UpdateGuidanceRequest {
  const action = String(input.action).trim() as UpdateAction;
  const reason = input.reason.trim();
  const confirmationSummary = input.confirmation_summary.trim();
  const kind = input.kind == null ? null : String(input.kind).trim();
  const content = input.content == null ? null : normalizeProjectGuidanceContent(input.content);
  const sourceRefs = input.source_refs == null
    ? null
    : unique(input.source_refs.map((item) => item.trim()).filter(Boolean));
  if (input.user_confirmed !== true) {
    throw goalErrors["goals.project_guidance.user_confirmation_required"]("项目说明修改必须来自用户在当前对话的明确确认，或用户在项目说明页面的直接提交");
  }
  if (!(["edit", "deactivate", "restore"] as const).includes(action)) {
    throw goalErrors["goals.project_guidance.action_invalid"](`不支持的项目说明操作: ${action}`);
  }
  if (!input.guidance_id.trim() || !reason || !confirmationSummary) {
    throw goalErrors["goals.project_guidance.invalid"]("项目说明 ID、变更原因和用户确认摘要不能为空");
  }
  if (action === "edit") {
    if (kind == null || !isProjectGuidanceKind(kind)) {
      throw goalErrors["goals.project_guidance.kind_invalid"](`不支持的项目说明分类: ${kind ?? ""}`);
    }
    if (!content) {
      throw goalErrors["goals.project_guidance.invalid"]("修改后的项目说明内容不能为空");
    }
    if (content.length > PROJECT_GUIDANCE_ENTRY_MAX_CHARS) {
      throw goalErrors["goals.project_guidance.entry_too_large"](`单条项目说明不能超过 ${PROJECT_GUIDANCE_ENTRY_MAX_CHARS} 个字符`);
    }
  }
  return {
    project_id: input.project_id,
    guidance_id: input.guidance_id.trim(),
    action,
    kind,
    content,
    source_refs: sourceRefs,
    reason,
    confirmation_summary: confirmationSummary,
    user_confirmed: true,
  };
}

function requireActionAllowed(action: UpdateAction, current: ProjectGuidanceEntryRecord): void {
  if (action === "deactivate" && !current.active) {
    throw goalErrors["goals.project_guidance.already_inactive"]("这条项目说明已经停用");
  }
  if (action === "restore" && current.active) {
    throw goalErrors["goals.project_guidance.already_active"]("这条项目说明已经生效");
  }
  if (action === "edit" && !current.active) {
    throw goalErrors["goals.project_guidance.inactive"]("请先恢复这条项目说明，再进行修改");
  }
}

/** What the entry will hold after the action: an edit takes the request's fields, deactivate and restore keep the current ones. */
function nextGuidanceState(request: UpdateGuidanceRequest, current: ProjectGuidanceEntryRecord): GuidanceState {
  const edit = request.action === "edit";
  const content = edit ? request.content! : current.content;
  return {
    kind: edit ? (request.kind as ProjectGuidanceKind) : current.kind,
    content,
    contentHash: guidanceContentHash(content),
    sourceRefs: edit && request.source_refs != null ? request.source_refs : current.source_refs,
    active: request.action !== "deactivate",
  };
}

function requireStateAllowed(
  request: UpdateGuidanceRequest,
  entries: ProjectGuidanceEntryRecord[],
  current: ProjectGuidanceEntryRecord,
  next: GuidanceState,
): void {
  if (
    request.action === "edit" &&
    next.kind === current.kind &&
    next.content === current.content &&
    JSON.stringify(next.sourceRefs) === JSON.stringify(current.source_refs)
  ) {
    throw goalErrors["goals.project_guidance.no_changes"]("项目说明没有发生变化");
  }
  const duplicate = entries.find(
    (entry) =>
      entry.guidance_id !== current.guidance_id &&
      entry.kind === next.kind &&
      entry.content_hash === next.contentHash,
  );
  if (duplicate) {
    throw goalErrors["goals.project_guidance.duplicate"]("相同分类和内容的项目说明已经存在");
  }
  const totalChars = entries
    .filter((entry) => entry.guidance_id !== current.guidance_id && entry.active)
    .reduce((sum, entry) => sum + entry.content.length, 0) + (next.active ? next.content.length : 0);
  if (totalChars > PROJECT_GUIDANCE_TOTAL_MAX_CHARS) {
    throw goalErrors["goals.project_guidance.total_too_large"](`项目说明总长度不能超过 ${PROJECT_GUIDANCE_TOTAL_MAX_CHARS} 个字符`);
  }
}

function updateGuidanceEntry(
  repository: GoalsRepository,
  row: { guidanceId: string; projectId: string; actorId: string; revision: number; at: string },
  request: UpdateGuidanceRequest,
  next: GuidanceState,
): void {
  repository.db.prepare(`
    UPDATE project_guidance_entries
    SET revision = ?, active = ?, kind = ?, content = ?, content_hash = ?,
        source_refs_json = ?, confirmation_summary = ?, reason = ?, updated_by = ?, updated_at = ?
    WHERE guidance_id = ? AND project_id = ?
  `).run(
    row.revision,
    next.active ? 1 : 0,
    next.kind,
    next.content,
    next.contentHash,
    sqliteJson(next.sourceRefs),
    request.confirmation_summary,
    request.reason,
    row.actorId,
    row.at,
    row.guidanceId,
    row.projectId,
  );
}

function applyGuidanceUpdate(
  context: GoalsCommandContext,
  input: UpdateProjectGuidanceInput,
  request: UpdateGuidanceRequest,
): { outcome: UpdateOutcome; at: string } {
  const repository = context.repository;
  const entries = repository.listProjectGuidanceEntries(input.project_id, true);
  const current = entries.find((entry) => entry.guidance_id === request.guidance_id);
  if (!current) {
    throw goalErrors["goals.project_guidance.not_found"](`找不到项目说明: ${request.guidance_id}`);
  }
  requireActionAllowed(request.action, current);
  const next = nextGuidanceState(request, current);
  requireStateAllowed(request, entries, current, next);

  const revision = current.revision + 1;
  const now = context.now().toISOString();
  const changeKind = CHANGE_KIND[request.action];
  updateGuidanceEntry(
    repository,
    { guidanceId: current.guidance_id, projectId: input.project_id, actorId: input.actor_id, revision, at: now },
    request,
    next,
  );
  const { revisionId, cursor } = writeGuidanceRevision(repository, {
    projectId: input.project_id,
    actorId: input.actor_id,
    guidanceId: current.guidance_id,
    revision,
    kind: next.kind,
    content: next.content,
    contentHash: next.contentHash,
    sourceRefs: next.sourceRefs,
    active: next.active,
    changeKind,
    confirmationSummary: request.confirmation_summary,
    reason: request.reason,
    at: now,
    eventType: `project.guidance_${changeKind}`,
    eventPayload: {
      action: request.action,
      revision,
      kind: next.kind,
      content_hash: next.contentHash,
      active: next.active,
      source_refs: next.sourceRefs,
    },
  });
  const entry = repository
    .listProjectGuidanceEntries(input.project_id, true)
    .find((candidate) => candidate.guidance_id === current.guidance_id)!;
  const revisionRecord = repository
    .listProjectGuidanceRevisions(input.project_id)
    .find((candidate) => candidate.revision_id === revisionId)!;
  return { outcome: { entry, revision: revisionRecord, observed_event_cursor: cursor }, at: now };
}

export function updateProjectGuidance(
  context: GoalsCommandContext,
  input: UpdateProjectGuidanceInput,
): UpdateProjectGuidanceResult {
  const request = readUpdateRequest(input);
  const hash = requestHash(request);
  return context.repository.immediate(() => {
    const replay = context.replay<UpdateOutcome>(
      input.project_id,
      input.actor_id,
      "update_project_guidance",
      input.idempotency_key,
      hash,
    );
    if (replay) return { ...replay, replayed: true };
    context.requireGoalsLibrary(input.project_id);
    const { outcome, at } = applyGuidanceUpdate(context, input, request);
    context.remember(input.project_id, input.actor_id, "update_project_guidance", input.idempotency_key, hash, outcome, at);
    return { ...outcome, replayed: false };
  });
}
