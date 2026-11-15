import { spawn } from "node:child_process";
import {
  EXTERNAL_SESSION_NATIVE_ID_PATTERN,
  EXTERNAL_TOOLS,
  type ExternalToolEntry,
} from "@molis-ai/molis-work-contracts/platform/external-tools";
import {
  EXTERNAL_SESSION_ENTRY_MAX_BYTES,
  sessionsErrors,
  type ExternalSessionActivity,
  type ExternalSessionEntry,
} from "@molis-ai/molis-work-contracts/services/sessions";
import { cutCharacters } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import {
  sessionSourceFailure,
  type CodexThreadListResponse,
  type CodexThreadReadResponse,
  type SessionsPorts,
} from "@molis-ai/molis-work-service-sessions";
import { PRODUCT_VERSION } from "./product-version.js";

const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER_BYTES = 8 * 1024 * 1024;
const UNREAD_ATTACHMENT_NOTE = "[附件未读取]";

function mapCodexStatus(status: unknown): ExternalSessionActivity {
  if (typeof status === "string") {
    const lower = status.toLowerCase();
    if (
      lower === "running"
      || lower === "active"
      || lower === "inprogress"
      || lower === "in_progress"
      || lower === "waiting"
      || lower === "waiting_input"
      || lower === "needs_approval"
    ) {
      return "running";
    }
    if (lower === "idle" || lower === "completed" || lower === "ended" || lower === "notloaded") return "idle";
  }
  if (status && typeof status === "object") {
    const type = (status as { type?: unknown }).type;
    if (typeof type === "string") return mapCodexStatus(type);
  }
  return "unknown";
}

function capEntryText(text: string): { text: string; truncated: boolean } {
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes <= EXTERNAL_SESSION_ENTRY_MAX_BYTES) return { text, truncated: false };
  return { text: cutCharacters(text, Math.floor(EXTERNAL_SESSION_ENTRY_MAX_BYTES / 4)), truncated: true };
}

async function callCodexAppServer<T>(
  binary: string,
  env: NodeJS.ProcessEnv,
  cwd: string,
  method: "thread/list" | "thread/read",
  params: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolvePromise, rejectPromise) => {
    const child = spawn(binary, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      cwd,
      env,
      windowsHide: true,
    });

    let settled = false;
    let buffer = "";
    let totalBytes = 0;

    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      try { child.kill("SIGTERM"); } catch { /* exited */ }
    };
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      rejectPromise(err);
    };
    const succeed = (val: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(val);
    };

    const onAbort = () => fail(signal.reason instanceof Error ? signal.reason : new Error("Aborted"));
    signal.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      fail(sessionSourceFailure("timed_out", "Codex app-server 响应超时", true));
    }, COMMAND_TIMEOUT_MS);
    timer.unref?.();

    child.on("error", () => fail(sessionSourceFailure("read_error", "无法启动 Codex app-server", true)));

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      totalBytes += Buffer.byteLength(chunk, "utf8");
      if (totalBytes > COMMAND_MAX_BUFFER_BYTES) {
        fail(sessionSourceFailure("read_error", "Codex app-server 输出超过上限", false));
        return;
      }
      buffer += chunk;
      let newlineIdx = buffer.indexOf("\n");
      while (newlineIdx >= 0) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        newlineIdx = buffer.indexOf("\n");
        if (!line) continue;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(line) as Record<string, unknown>;
        } catch {
          fail(sessionSourceFailure("parse_error", "Codex app-server 返回了非法 JSON", false));
          return;
        }
        if (msg.id === 1) {
          if (msg.error) {
            fail(sessionSourceFailure("version_mismatch", "Codex app-server 初始化失败", false));
            return;
          }
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "initialized", params: {} })}\n`);
          child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method, params })}\n`);
        } else if (msg.id === 2) {
          if (msg.error) {
            fail(sessionSourceFailure("read_error", "Codex app-server 读取失败", false));
            return;
          }
          succeed(msg.result as T);
          return;
        }
      }
    });

    child.on("close", () => {
      if (!settled) fail(sessionSourceFailure("read_error", "Codex app-server 提前退出", true));
    });

    child.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { clientInfo: { name: "molis-work", version: PRODUCT_VERSION } },
      })}\n`,
    );
  });
}

function parseCodexThreadItems(turns: readonly unknown[]): ExternalSessionEntry[] {
  const entries: ExternalSessionEntry[] = [];
  let seq = 0;
  for (let tIdx = 0; tIdx < turns.length; tIdx++) {
    const turn = turns[tIdx];
    if (!turn || typeof turn !== "object") continue;
    const items = Array.isArray((turn as Record<string, unknown>).items)
      ? ((turn as Record<string, unknown>).items as unknown[])
      : [];
    for (let iIdx = 0; iIdx < items.length; iIdx++) {
      const item = items[iIdx];
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const type = typeof rec.type === "string" ? rec.type : "";
      if (type === "reasoning" || type === "thinking") continue;
      const position = `turn:${tIdx}:item:${iIdx}:seq:${seq++}`;
      if (type === "userMessage" || type === "user_message") {
        const content = Array.isArray(rec.content) ? rec.content : [];
        const parts: string[] = [];
        for (const part of content) {
          if (!part || typeof part !== "object") continue;
          const p = part as Record<string, unknown>;
          if (p.type === "text" && typeof p.text === "string") parts.push(p.text);
          else if (p.type === "image" || p.type === "localImage" || p.type === "file") parts.push(UNREAD_ATTACHMENT_NOTE);
        }
        const joined = parts.length > 0 ? parts.join("\n") : (typeof rec.text === "string" ? rec.text : "");
        if (!joined) continue;
        const capped = capEntryText(joined);
        entries.push({ position, role: "you", at: null, text: capped.text, truncated: capped.truncated });
      } else if (type === "agentMessage" || type === "assistant_message") {
        const textVal = typeof rec.text === "string" ? rec.text : "";
        if (!textVal) continue;
        const capped = capEntryText(textVal);
        entries.push({ position, role: "tool", at: null, text: capped.text, truncated: capped.truncated });
      } else if (type === "commandExecution" || type === "mcpToolCall" || type === "fileChange") {
        const label = typeof rec.command === "string" ? rec.command : typeof rec.tool === "string" ? rec.tool : type;
        const out = typeof rec.aggregatedOutput === "string" ? rec.aggregatedOutput : typeof rec.output === "string" ? rec.output : "";
        const capped = capEntryText(out ? `${label}\n${out}` : label);
        const rawStatus = typeof rec.status === "string" ? rec.status.toLowerCase() : "";
        const stepStatus: "ok" | "failed" | "unknown" =
          rawStatus === "completed" || rawStatus === "ok" || rawStatus === "succeeded"
            ? "ok"
            : rawStatus === "failed" || rawStatus === "error" || rawStatus === "declined"
              ? "failed"
              : "unknown";
        entries.push({ position, role: "tool_step", at: null, text: capped.text, truncated: capped.truncated, step: { name: type, status: stepStatus } });
      }
    }
  }
  return entries;
}

export function createHostCodexProtocolsPort(params: {
  homeRoot: string;
  searchPath: string;
  sourceEnv: NodeJS.ProcessEnv;
  resolveBinary: (tool: ExternalToolEntry, env: NodeJS.ProcessEnv, signal: AbortSignal) => Promise<{ binary: string; env: NodeJS.ProcessEnv }>;
}): SessionsPorts["protocols"] {
  const { homeRoot, sourceEnv, resolveBinary } = params;
  const codexTool = EXTERNAL_TOOLS.find(item => item.id === "codex");

  return {
    async codexThreadList(root: string, cursor: string | null, signal: AbortSignal): Promise<CodexThreadListResponse> {
      if (!codexTool) throw sessionsErrors.source_unsupported("未登记 Codex 工具");
      const envWithRoot = root ? { ...sourceEnv, CODEX_HOME: root } : sourceEnv;
      const { binary, env } = await resolveBinary(codexTool, envWithRoot, signal);
      const raw = await callCodexAppServer<Record<string, unknown>>(
        binary, env, homeRoot, "thread/list", { limit: 50, ...(cursor ? { cursor } : {}) }, signal,
      );
      const list = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw?.threads) ? raw.threads : [];
      const threads: CodexThreadListResponse["threads"] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const rec = item as Record<string, unknown>;
        const id = typeof rec.id === "string" ? rec.id : null;
        if (!id || !EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(id)) continue;
        const updatedRaw = rec.updatedAt ?? rec.updated_at ?? rec.createdAt ?? rec.created_at;
        const updatedAt = typeof updatedRaw === "number"
          ? new Date(updatedRaw * (updatedRaw < 10_000_000_000 ? 1000 : 1)).toISOString()
          : typeof updatedRaw === "string" && !Number.isNaN(Date.parse(updatedRaw))
            ? new Date(updatedRaw).toISOString()
            : new Date(0).toISOString();
        const sourceObj = rec.source && typeof rec.source === "object" ? (rec.source as Record<string, unknown>) : null;
        const subAgent = sourceObj?.subAgent && typeof sourceObj.subAgent === "object" ? (sourceObj.subAgent as Record<string, unknown>) : null;
        const threadSpawn = subAgent?.threadSpawn && typeof subAgent.threadSpawn === "object" ? (subAgent.threadSpawn as Record<string, unknown>) : null;
        const parentId = typeof threadSpawn?.parentThreadId === "string"
          ? threadSpawn.parentThreadId
          : typeof rec.parent_thread_id === "string" ? rec.parent_thread_id : null;
        const titleRaw = typeof rec.name === "string" && rec.name.trim()
          ? rec.name.trim()
          : typeof rec.preview === "string" && rec.preview.trim()
            ? rec.preview.trim()
            : typeof rec.title === "string" && rec.title.trim() ? rec.title.trim() : null;
        threads.push({
          id, title: titleRaw, cwd: typeof rec.cwd === "string" ? rec.cwd : null,
          updated_at: updatedAt, activity: mapCodexStatus(rec.status), parent_thread_id: parentId,
        });
      }
      const nextCursor = typeof raw?.nextCursor === "string" && raw.nextCursor
        ? raw.nextCursor
        : typeof raw?.next_cursor === "string" && raw.next_cursor ? raw.next_cursor : null;
      return { threads, next_cursor: nextCursor };
    },
    async codexThreadRead(root: string, nativeId: string, signal: AbortSignal): Promise<CodexThreadReadResponse> {
      if (!EXTERNAL_SESSION_NATIVE_ID_PATTERN.test(nativeId) || nativeId.startsWith("-")) {
        throw sessionsErrors.not_allowed("非法的 Codex 会话标识");
      }
      if (!codexTool) throw sessionsErrors.source_unsupported("未登记 Codex 工具");
      const envWithRoot = root ? { ...sourceEnv, CODEX_HOME: root } : sourceEnv;
      const { binary, env } = await resolveBinary(codexTool, envWithRoot, signal);
      const raw = await callCodexAppServer<Record<string, unknown>>(
        binary, env, homeRoot, "thread/read", { threadId: nativeId, includeTurns: true }, signal,
      );
      const thread = raw?.thread && typeof raw.thread === "object" ? (raw.thread as Record<string, unknown>) : raw;
      const turns = Array.isArray(thread?.turns) ? thread.turns : [];
      return { activity: mapCodexStatus(thread?.status), entries: parseCodexThreadItems(turns) };
    },
  };
}
