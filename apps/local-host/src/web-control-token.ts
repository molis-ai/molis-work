import type { ServerResponse } from "node:http";
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveConfiguredHome } from "./product-home.js";

export const WEB_CONTROL_TOKEN_RELATIVE_PATH = "config/web-control-token";

export function resolveWebControlToken(options: {
  controlToken?: string;
  homeDirectory?: string;
}): string {
  const injected = options.controlToken?.trim();
  if (injected) {
    if (injected.length < 32 || injected.length > 512) {
      throw new Error("Web control token 长度无效");
    }
    return injected;
  }
  const home = path.resolve(options.homeDirectory ?? resolveConfiguredHome());
  const filePath = path.join(home, WEB_CONTROL_TOKEN_RELATIVE_PATH);
  try {
    const existing = fs.readFileSync(filePath, "utf8").trim();
    if (existing.length >= 32 && existing.length <= 512 && !/[\r\n\0]/.test(existing)) {
      return existing;
    }
  } catch {
    // First start, or the file is missing.
  }
  const token = randomBytes(32).toString("base64url");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  return token;
}

/** SYS-14: a fresh challenge authenticates these exact health bytes without disclosing the Home key. */
export function webHealthProof(token: string, challenge: string, body: Buffer | string): Buffer {
  return createHmac("sha256", token).update(challenge + "\n").update(body).digest();
}

export function sendWebHealth(response: ServerResponse, status: number, payload: unknown, token: string, challenge: string | null): void {
  if (challenge !== null && !/^[A-Za-z0-9_-]{43}$/.test(challenge)) { response.writeHead(400); response.end(); return; }
  const body = JSON.stringify(payload);
  const proof = challenge === null ? undefined : webHealthProof(token, challenge, body).toString("base64url");
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
    "content-length": Buffer.byteLength(body), ...(proof ? { "x-molis-work-proof": proof } : {}) });
  response.end(body);
}
