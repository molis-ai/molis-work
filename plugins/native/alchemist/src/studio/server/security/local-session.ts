import { timingSafeEqual } from "node:crypto";
import type { MiddlewareHandler } from "hono";

export interface LocalSecurityOptions {
  sessionToken: string;
  allowedOrigins: readonly string[];
}

const cookieName = "alchemist_session";
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function localSessionGuard(options: LocalSecurityOptions): MiddlewareHandler {
  return async (context, next) => {
    const method = context.req.method.toUpperCase();
    const session = readCookie(context.req.header("cookie"), cookieName);
    if (safeMethods.has(method)) {
      if (!session || !safeEqual(session, options.sessionToken)) {
        context.header("set-cookie", sessionCookie(options.sessionToken));
      }
      await next();
      return;
    }
    if (!session || !safeEqual(session, options.sessionToken)) {
      return context.json({ code: "LOCAL_SESSION_REQUIRED", message: "本地会话已失效，请刷新页面。" }, 401);
    }
    const origin = context.req.header("origin");
    if (!origin || !options.allowedOrigins.includes(origin)) {
      return context.json({ code: "LOCAL_ORIGIN_REJECTED", message: "拒绝来自其他站点的写入请求。" }, 403);
    }
    await next();
  };
}

function readCookie(header: string | undefined, name: string): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([key]) => key === name)?.[1];
}

function sessionCookie(token: string): string {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict`;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
