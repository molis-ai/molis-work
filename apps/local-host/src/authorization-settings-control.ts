import type { IncomingMessage, ServerResponse } from "node:http";
import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import { captureWebSessionAuthority } from "./web-sessions.js";
import { pluginPageRequest } from "./plugin-page-authority.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/** Captures the local management request before its body or any owner is read. */
export function webEffectControl(request: IncomingMessage, response: ServerResponse, host: MolisWorkLocalHost, accountCurrent?: () => void) {
  const sessionCurrent = captureWebSessionAuthority();
  const assertCurrent = () => {
    if (response.destroyed || request.aborted) throw new ActionError("actions.cancelled", "授权请求已断开");
    sessionCurrent();
    requireSynchronous(accountCurrent?.());
    if (host.lifecycle() !== "running") throw new ActionError("actions.host_closed", "宿主正在关闭");
  };
  return { assertCurrent, beforeEffect: assertCurrent };
}

export function authorizationSettingsControl(request: IncomingMessage, response: ServerResponse, host: MolisWorkLocalHost, accountCurrent?: () => void) {
  const requestControl = webEffectControl(request, response, host, accountCurrent);
  const assertCurrent = () => {
    requestControl.assertCurrent();
    if (pluginPageRequest(request) || request.headers["x-molis-plugin-page"] !== undefined || request.headers["x-molis-context-page"] !== undefined) {
      throw new ActionError("actions.forbidden", "只有本机管理入口能访问这些授权");
    }
  };
  return { assertCurrent, beforeEffect: assertCurrent };
}
