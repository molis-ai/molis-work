#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDesktopWebHost } from "@molis-ai/molis-work-app-desktop";
export type { WebServerOptions } from "@molis-ai/molis-work-app-local-host";
export { resolveWebControlToken, WEB_CONTROL_TOKEN_RELATIVE_PATH } from "@molis-ai/molis-work-app-local-host";

export const createMolisWorkWebServer = createDesktopWebHost({ ptyClientFilePath });

function ptyClientFilePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "pty-client.js"),
    path.resolve(here, "../../../../dist/web/pty-client.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const modulePath = fileURLToPath(import.meta.url);
const requestedModulePath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isMain = requestedModulePath != null && (() => {
  try {
    return fs.realpathSync(modulePath) === fs.realpathSync(requestedModulePath);
  } catch {
    return modulePath === requestedModulePath;
  }
})();
if (isMain) {
  const args = process.argv.slice(2);
  const homeArgument = flag(args, "--home");
  const port = Number(flag(args, "--port") ?? 4173);
  const unsupported = ["--db", "--board-id", "--demo"].find((argument) => args.includes(argument));
  if (unsupported) {
    console.error(`Molis Work Web 只按项目启动；${unsupported} 已不支持。请先在当前 Runtime 使用 Molis Work Skill 创建、连接或迁移项目。`);
    process.exitCode = 1;
  } else {
    const server = createMolisWorkWebServer({
      ...(homeArgument ? { homeDirectory: path.resolve(homeArgument) } : {}),
    });
    const shutdown = () => {
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 2000).unref();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
    server.listen(port, "127.0.0.1", () => {
      console.log(`Molis Work Web: http://127.0.0.1:${port}`);
      console.log("项目列表（网页不会修改 Runtime Session 绑定）");
    });
  }
}
