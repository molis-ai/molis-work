import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";
import type { RuntimeHostApi } from "@molis-ai/molis-work-contracts/services/runtime-host";
import {
  MolisWorkSessionError,
  type MolisWorkSessionRecord,
  type RuntimeSessionAdapterResult,
} from "./types.js";

export interface SessionDirectoryCreateInput {
  runtime_id: string;
  actor_id: string;
  user_confirmed: boolean;
  project_id: string;
  current_goal_id?: string | null;
  workspace_id?: string | null;
  workspace_path?: string | null;
  title?: string | null;
}

export interface SessionDirectoryDiscoveryResult {
  runtime_id: string;
  status: "ok" | "unsupported" | "failed";
  records: MolisWorkSessionRecord[];
  code?: string;
  message?: string;
}

interface NativeSessionMetadata {
  native_runtime_session_id: string;
  title: string | null;
  metadata: Record<string, unknown>;
}

export class SessionDirectoryService {
  constructor(
    private readonly registry: WorkSessionApi,
    private readonly router: RuntimeHostApi,
  ) {}

  async discover(runtimeId: string): Promise<SessionDirectoryDiscoveryResult> {
    const normalizedRuntimeId = requiredText(runtimeId, "Runtime 标识不能为空");
    const result = await this.router.invoke(normalizedRuntimeId, "discover", {
      limit: 100,
      includeTurns: false,
      sortKey: "updated_at",
    });
    if (result.status !== "ok") {
      return {
        runtime_id: normalizedRuntimeId,
        status: result.status,
        records: [],
        code: result.code,
        message: result.message,
      };
    }
    const candidates = nativeSessionMetadata(result.value);
    if (candidates.length === 0 && hasCandidateCollection(result.value)) {
      return { runtime_id: normalizedRuntimeId, status: "ok", records: [] };
    }
    if (candidates.length === 0) {
      return {
        runtime_id: normalizedRuntimeId,
        status: "failed",
        records: [],
        code: "runtime.discovery_shape_unknown",
        message: "Runtime 返回了 Molis Work 不能识别的 Session 列表结构",
      };
    }
    return {
      runtime_id: normalizedRuntimeId,
      status: "ok",
      records: candidates.map((candidate) => this.registry.discoverSession({
        runtime_id: normalizedRuntimeId,
        native_runtime_session_id: candidate.native_runtime_session_id,
        title: candidate.title,
        metadata: candidate.metadata,
      })),
    };
  }

  async create(input: SessionDirectoryCreateInput): Promise<MolisWorkSessionRecord> {
    if (!input.user_confirmed) {
      throw new MolisWorkSessionError("session.confirmation_required", "Session 写入必须由用户明确确认");
    }
    const runtimeId = requiredText(input.runtime_id, "Runtime 标识不能为空");
    const projectId = requiredText(input.project_id, "新 Session 必须关联 Project");
    const actorId = requiredText(input.actor_id, "Session 写入必须记录执行者");
    const capability = this.router.capabilities(runtimeId).create;
    if (capability === "registry") {
      const result = await this.router.invoke(runtimeId, "create", {
        actor_id: actorId,
        user_confirmed: true,
        project_id: projectId,
        current_goal_id: optionalText(input.current_goal_id),
        workspace_id: optionalText(input.workspace_id),
        workspace_path: optionalText(input.workspace_path),
        title: optionalText(input.title),
      });
      return resultRecord(result, "Runtime fallback 无法创建 Session 记录");
    }
    if (capability !== "native") {
      throw new MolisWorkSessionError("session.invalid_input", `${runtimeId} 不支持创建 Session`);
    }
    const result = await this.router.invoke(runtimeId, "create", {
      ...(optionalText(input.workspace_path) ? { cwd: optionalText(input.workspace_path) } : {}),
    });
    if (result.status !== "ok") {
      throw new MolisWorkSessionError("session.invalid_input", result.message);
    }
    const nativeId = nativeSessionId(result.value);
    if (!nativeId) {
      throw new MolisWorkSessionError("session.invalid_input", "Runtime 已响应，但没有返回可识别的原生 Session ID");
    }
    return this.registry.explicitlyLinkSession({
      runtime_id: runtimeId,
      native_runtime_session_id: nativeId,
      actor_id: actorId,
      user_confirmed: true,
      project_id: projectId,
      current_goal_id: optionalText(input.current_goal_id),
      workspace_id: optionalText(input.workspace_id),
      workspace_path: optionalText(input.workspace_path),
      title: optionalText(input.title),
    });
  }
}

function resultRecord(result: RuntimeSessionAdapterResult, message: string): MolisWorkSessionRecord {
  if (result.status !== "ok" || !isRecord(result.value) || typeof result.value.session_id !== "string") {
    throw new MolisWorkSessionError(
      "session.invalid_input",
      result.status === "ok" ? message : result.message,
    );
  }
  return result.value as unknown as MolisWorkSessionRecord;
}

function nativeSessionId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const thread = isRecord(value.thread) ? value.thread : null;
  return optionalText(thread?.id)
    ?? optionalText(value.threadId)
    ?? optionalText(value.thread_id)
    ?? optionalText(value.id);
}

function nativeSessionMetadata(value: unknown): NativeSessionMetadata[] {
  const items = candidateCollection(value);
  const records: NativeSessionMetadata[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const nativeId = optionalText(item.id) ?? optionalText(item.threadId) ?? optionalText(item.thread_id);
    if (!nativeId) continue;
    const title = optionalText(item.title) ?? optionalText(item.name) ?? optionalText(item.preview);
    records.push({
      native_runtime_session_id: nativeId,
      title,
      metadata: compactMetadata({
        native_status: optionalText(item.status)?.toLowerCase(),
        runtime_cwd: optionalText(item.cwd) ?? optionalText(item.workspacePath) ?? optionalText(item.workspace_path),
        native_created_at: timestamp(item.createdAt ?? item.created_at),
        native_updated_at: timestamp(item.updatedAt ?? item.updated_at),
        source: optionalText(item.source),
      }),
    });
  }
  return records;
}

function candidateCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["data", "threads", "items", "sessions"] as const) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function hasCandidateCollection(value: unknown): boolean {
  return Array.isArray(value)
    || (isRecord(value) && ["data", "threads", "items", "sessions"].some((key) => Array.isArray(value[key])));
}

function timestamp(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return new Date(milliseconds).toISOString();
  }
  const text = optionalText(value);
  if (!text || !Number.isFinite(Date.parse(text))) return null;
  return new Date(text).toISOString();
}

function compactMetadata(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item != null));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function requiredText(value: unknown, message: string): string {
  const text = optionalText(value);
  if (!text) throw new MolisWorkSessionError("session.invalid_input", message);
  return text;
}
