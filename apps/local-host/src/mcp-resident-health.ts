import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "node:http";
import path from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { residentHostOrigin } from "./resident-host-request.js";
import { WEB_CONTROL_TOKEN_RELATIVE_PATH, webHealthProof } from "./web-control-token.js";

export type McpResidentHealth = "absent" | "starting" | "ready" | "pending";

/** Read-only challenge probe. A listener that cannot prove this Home is never a reason to spawn or send credentials. */
export async function probeMcpResident(home: string, address: string, signal: AbortSignal): Promise<McpResidentHealth> {
  const origin = residentHostOrigin(address);
  signal.throwIfAborted();
  const challenge = randomBytes(32).toString("base64url");
  const result = await new Promise<{ status: number; proof: string | undefined; body: Buffer } | "pending" | null>((resolve, reject) => {
    const req = request(`${origin}/health?challenge=${challenge}`, { signal, maxHeaderSize: 8192, agent: false }, response => {
      const length = response.headers["content-length"];
      if (response.headers["transfer-encoding"] !== undefined || typeof length !== "string" || !/^\d+$/.test(length) || Number(length) > 4096) {
        req.destroy(new ActionError("actions.transport_invalid", "常驻服务健康响应长度无效")); return;
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 4096) { req.destroy(new ActionError("actions.transport_invalid", "常驻服务健康响应过大")); return; }
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => resolve({ status: response.statusCode ?? 0,
        proof: typeof response.headers["x-molis-work-proof"] === "string" ? response.headers["x-molis-work-proof"] : undefined,
        body: Buffer.concat(chunks) }));
    });
    const timer = setTimeout(() => { resolve("pending"); req.destroy(); }, 1000);
    req.once("close", () => clearTimeout(timer));
    req.once("error", (error: NodeJS.ErrnoException) => {
      if (signal.aborted) reject(signal.reason);
      else if (error.code === "ECONNREFUSED") resolve(null);
      else if (error instanceof ActionError) reject(error);
      else reject(new ActionError("actions.transport_invalid", "常驻服务健康响应不完整或无效"));
    });
    req.end();
  });
  signal.throwIfAborted();
  if (!result) return "absent";
  if (result === "pending") return result;
  let token: string | undefined;
  try { token = (await readFile(path.join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH), { encoding: "utf8", signal })).trim(); }
  catch { signal.throwIfAborted(); /* Missing Home key means this listener cannot be authenticated. */ }
  signal.throwIfAborted();
  if (!token || token.length < 32 || token.length > 512 || /[\r\n\0]/.test(token) || !result.proof || !/^[A-Za-z0-9_-]{43}$/.test(result.proof)) {
    throw new ActionError("actions.transport_invalid", "监听服务未通过当前 Home 的健康认证");
  }
  const expected = webHealthProof(token, challenge, result.body);
  const supplied = Buffer.from(result.proof, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new ActionError("actions.transport_invalid", "监听服务的 Home 健康签名无效");
  }
  let body: unknown;
  try { body = JSON.parse(result.body.toString("utf8")); }
  catch { throw new ActionError("actions.transport_invalid", "常驻服务健康内容无效"); }
  if (body && typeof body === "object" && "status" in body) {
    if (result.status === 200 && body.status === "ok" && "desktop_tui" in body && body.desktop_tui === true) return "ready";
    if (result.status === 503 && body.status === "starting") return "starting";
  }
  throw new ActionError("actions.transport_invalid", "常驻服务健康状态无效");
}
