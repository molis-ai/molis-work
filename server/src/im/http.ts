import type { IncomingMessage, ServerResponse } from "node:http";
import { ImError } from "./errors.js";

const MAX_BODY_BYTES = 64_000;
export function readImBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = request.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new ImError("im.invalid_content_type", "请使用 JSON 提交消息", 415);
  return new Promise((resolve, reject) => {
    let bytes = 0;
    const chunks: Buffer[] = [];
    let finished = false;
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      chunks.length = 0;
      reject(error);
    };
    request.on("data", (chunk: Buffer | string) => {
      if (finished) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > MAX_BODY_BYTES) { fail(new ImError("im.body_too_large", "提交内容过大", 413)); return; }
      chunks.push(buffer);
    });
    request.once("aborted", () => fail(new ImError("im.request_aborted", "提交已中断，请重试原消息", 400)));
    request.once("error", () => fail(new ImError("im.request_failed", "无法读取提交内容", 400)));
    request.once("end", () => {
      if (finished) return;
      try {
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
        finished = true;
        resolve(body as Record<string, unknown>);
      } catch { fail(new ImError("im.invalid_json", "提交内容必须是 JSON 对象")); }
    });
  });
}

export function imJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(value));
}

export function imFailure(response: ServerResponse, error: unknown): void {
  if (error instanceof ImError) { imJson(response, error.status, { code: error.code, error: error.message }); return; }
  // Identity providers may expose their own typed authentication errors.
  if (error instanceof Error && "status" in error && [400, 401, 403, 409, 422].includes(Number(error.status))
    && "code" in error && typeof error.code === "string") {
    imJson(response, Number(error.status), { code: error.code, error: error.message }); return;
  }
  imJson(response, 500, { code: "im.internal", error: "群聊暂时无法处理，请保留原消息并重试" });
}
