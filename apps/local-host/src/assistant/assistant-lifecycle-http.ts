import type { IncomingMessage, ServerResponse } from "node:http";
import { LOCAL_PERSON_ACTOR_ID } from "@molis-ai/molis-work-contracts/platform/actions";
import type { AssistantHttpPorts } from "./assistant-http.js";
import type { AssistantService } from "./assistant-service.js";
import type { AssistantStore } from "./assistant-store.js";
import type { AssistantArchiveRequest } from "./assistant-work-lifecycle.js";
import { assistantErrors } from "./assistant-errors.js";

function archiveRequest(input: unknown): AssistantArchiveRequest {
  const invalid = () => assistantErrors.invalid("请提交完整的原归档预览");
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid();
  const body = input as Record<string, unknown>;
  const { revision, session_id, archived, decision } = body;
  if (Object.keys(body).some(key => !["revision", "session_id", "archived", "decision"].includes(key))
    || typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1 || typeof archived !== "boolean"
    || session_id !== null && (typeof session_id !== "string" || !session_id.trim())) throw invalid();
  if (session_id === null) { if (decision !== undefined) throw invalid(); return { revision, session_id, archived }; }
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) throw invalid();
  const value = decision as Record<string, unknown>;
  const { operation_id, expected_version, expected_state } = value;
  if (Object.keys(value).some(key => !["operation_id", "expected_version", "expected_state"].includes(key))
    || typeof operation_id !== "string" || !operation_id.trim() || operation_id.length > 200
    || typeof expected_version !== "number" || !Number.isSafeInteger(expected_version) || expected_version < 1
    || expected_state !== "active" && expected_state !== "archived") throw invalid();
  return { revision, session_id, archived, decision: { operation_id, expected_version, expected_state } };
}

/** The existing authenticated local-user transport, held to its Work's actual project until settlement. */
export async function assistantLifecycleHttp(request: IncomingMessage, response: ServerResponse, url: URL, parts: string[], body: Record<string, unknown>,
  ports: AssistantHttpPorts, service: AssistantService, store: AssistantStore) {
  if (parts.length !== 3 || !["archive", "archive-preview"].includes(parts[2]!)) return null;
  const workId = parts[1]!;
  if (request.method === "GET" && parts[2] === "archive-preview") {
    const archived = url.searchParams.get("archived");
    if (archived !== "true" && archived !== "false") throw assistantErrors.invalid("需要明确选择归档或恢复");
    return { status: 200, body: await service.lifecycle.preview(workId, archived === "true") };
  }
  if (request.method !== "POST" || parts[2] !== "archive") return null;
  const ended = new AbortController(), stop = () => ended.abort(), work = store.get(LOCAL_PERSON_ACTOR_ID, workId);
  const assert_current = () => {
    if (ports.localHost.lifecycle() !== "running") throw assistantErrors.cancelled("原助理服务已关闭");
    if (request.aborted || response.destroyed) ended.abort();
    ended.signal.throwIfAborted();
    if (work.project_ref && !ports.localHost.projects().some(project => project.project_id === work.project_ref!.project_id
      && project.storage_key === work.project_ref!.storage_key && project.state === "ready")) throw assistantErrors.scope("原项目已关闭，归档操作停止");
  };
  const input = archiveRequest(body);
  const change = async () => ({ status: 200, body: { work: await service.archive(workId, input,
    { beforeEffect: async () => assert_current(), assert_current }) } });
  response.once("close", stop);
  try { return work.project_ref ? await ports.localHost.withProject(work.project_ref, change) : await change(); }
  finally { response.off("close", stop); }
}
