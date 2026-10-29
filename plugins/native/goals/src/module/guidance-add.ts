import { randomUUID } from "node:crypto";

import type {
  AddProjectGuidanceInput,
  AddProjectGuidanceResult,
  ProjectGuidanceKind,
} from "@molis-ai/molis-work-contracts/modules/goals";

import { GoalsCommandContext, requestHash, unique } from "./command-support.js";
import { goalErrors } from "./errors.js";
import {
  isProjectGuidanceKind,
  normalizeProjectGuidanceContent,
  PROJECT_GUIDANCE_ENTRY_MAX_CHARS,
  PROJECT_GUIDANCE_TOTAL_MAX_CHARS,
  projectGuidanceLength,
  withinProjectGuidanceEntryLimit,
} from "./guidance.js";
import { guidanceContentHash, writeGuidanceRevision } from "./guidance-write.js";
import { sqliteJson, type GoalsRepository } from "./repository.js";

type AddOutcome = Omit<AddProjectGuidanceResult, "replayed">;

interface AddGuidanceRequest {
  kind: ProjectGuidanceKind;
  content: string;
  contentHash: string;
  sourceRefs: string[];
  reason: string;
  confirmationSummary: string;
}

function readAddRequest(input: AddProjectGuidanceInput): AddGuidanceRequest {
  const kind = String(input.kind).trim();
  const content = normalizeProjectGuidanceContent(input.content);
  const reason = input.reason.trim();
  const confirmationSummary = input.confirmation_summary.trim();
  const sourceRefs = unique((input.source_refs ?? []).map((item) => item.trim()).filter(Boolean));
  if (input.user_confirmed !== true) {
    throw goalErrors["goals.project_guidance.user_confirmation_required"]("项目长期说明必须先向用户展示精确分类和原文，并获得明确同意后才能写入");
  }
  if (!isProjectGuidanceKind(kind)) {
    throw goalErrors["goals.project_guidance.kind_invalid"](`不支持的项目说明分类: ${kind}`);
  }
  if (!content || !reason || !confirmationSummary) {
    throw goalErrors["goals.project_guidance.invalid"]("项目说明内容、持久化原因和用户确认摘要不能为空");
  }
  if (!withinProjectGuidanceEntryLimit(content)) {
    throw goalErrors["goals.project_guidance.entry_too_large"](`单条项目说明不能超过 ${PROJECT_GUIDANCE_ENTRY_MAX_CHARS} 个字符`);
  }
  return { kind, content, contentHash: guidanceContentHash(content), sourceRefs, reason, confirmationSummary };
}

function insertGuidanceEntry(
  repository: GoalsRepository,
  row: { guidanceId: string; projectId: string; actorId: string; position: number; at: string },
  request: AddGuidanceRequest,
): void {
  repository.db.prepare(`
    INSERT INTO project_guidance_entries (
      guidance_id, project_id, position, revision, active, kind, content, content_hash,
      source_refs_json, created_by, confirmation_summary, reason, created_at, updated_by, updated_at
    ) VALUES (?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.guidanceId,
    row.projectId,
    row.position,
    request.kind,
    request.content,
    request.contentHash,
    sqliteJson(request.sourceRefs),
    row.actorId,
    request.confirmationSummary,
    request.reason,
    row.at,
    row.actorId,
    row.at,
  );
}

function createGuidanceEntry(
  context: GoalsCommandContext,
  input: AddProjectGuidanceInput,
  request: AddGuidanceRequest,
  now: string,
): AddOutcome {
  const repository = context.repository;
  const entries = repository.listProjectGuidanceEntries(input.project_id, true);
  const totalChars = entries
    .filter((entry) => entry.active)
    .reduce((sum, entry) => sum + projectGuidanceLength(entry.content), 0) + projectGuidanceLength(request.content);
  if (totalChars > PROJECT_GUIDANCE_TOTAL_MAX_CHARS) {
    throw goalErrors["goals.project_guidance.total_too_large"](`项目说明总长度不能超过 ${PROJECT_GUIDANCE_TOTAL_MAX_CHARS} 个字符`);
  }
  const guidanceId = randomUUID();
  const position = entries.reduce((max, entry) => Math.max(max, entry.position), 0) + 1;
  insertGuidanceEntry(
    repository,
    { guidanceId, projectId: input.project_id, actorId: input.actor_id, position, at: now },
    request,
  );
  const { cursor } = writeGuidanceRevision(repository, {
    projectId: input.project_id,
    actorId: input.actor_id,
    guidanceId,
    revision: 1,
    kind: request.kind,
    content: request.content,
    contentHash: request.contentHash,
    sourceRefs: request.sourceRefs,
    active: true,
    changeKind: "created",
    confirmationSummary: request.confirmationSummary,
    reason: request.reason,
    at: now,
    eventType: "project.guidance_added",
    eventPayload: {
      kind: request.kind,
      content_hash: request.contentHash,
      position,
      revision: 1,
      source_refs: request.sourceRefs,
    },
  });
  const entry = repository
    .listProjectGuidanceEntries(input.project_id, true)
    .find((candidate) => candidate.guidance_id === guidanceId)!;
  return { entry, created: true, observed_event_cursor: cursor };
}

export function addProjectGuidance(
  context: GoalsCommandContext,
  input: AddProjectGuidanceInput,
): AddProjectGuidanceResult {
  const request = readAddRequest(input);
  const hash = requestHash({
    project_id: input.project_id,
    kind: request.kind,
    content: request.content,
    source_refs: request.sourceRefs,
    reason: request.reason,
    confirmation_summary: request.confirmationSummary,
    user_confirmed: true,
  });
  const repository = context.repository;
  return repository.immediate(() => {
    const replay = context.replay<AddOutcome>(
      input.project_id,
      input.actor_id,
      "add_project_guidance",
      input.idempotency_key,
      hash,
    );
    if (replay) return { ...replay, replayed: true };
    context.requireGoalsLibrary(input.project_id);
    const existing = repository
      .listProjectGuidanceEntries(input.project_id, true)
      .find((entry) => entry.kind === request.kind && entry.content_hash === request.contentHash);
    const now = context.now().toISOString();
    const outcome: AddOutcome = existing
      ? { entry: existing, created: false, observed_event_cursor: repository.eventCursor(input.project_id) }
      : createGuidanceEntry(context, input, request, now);
    context.remember(input.project_id, input.actor_id, "add_project_guidance", input.idempotency_key, hash, outcome, now);
    return { ...outcome, replayed: false };
  });
}
