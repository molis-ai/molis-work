import { randomBytes } from "node:crypto";
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
