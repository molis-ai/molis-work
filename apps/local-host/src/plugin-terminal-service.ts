import { createHash } from "node:crypto";
import { isAbsolute, resolve } from "node:path";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginOwnerFilesClient, PluginStartContext, PluginTerminalClient } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, pluginInvocationReadOnly } from "@molis-ai/molis-work-plugin-runtime";
import type { MolisWorkPtyHost } from "@molis-ai/molis-work-service-runtime-host";

const hosts = new Map<string, MolisWorkPtyHost>();
const permission = "terminal:run";

/** The same PTY host that serves page attachments; a second process is never created here. */
export function bindPluginTerminalHost(home: string, host: MolisWorkPtyHost): () => void {
  const key = resolve(home);
  if (hosts.has(key)) throw new ActionError("actions.unavailable", "此 Home 已连接终端宿主");
  hosts.set(key, host);
  return () => { if (hosts.get(key) === host) hosts.delete(key); };
}

/** The backend chooses the program. Its current action and declared owner files determine all remaining authority. */
export function pluginTerminalFor(home: string, manifest: PluginManifest, context: PluginStartContext,
  files: PluginOwnerFilesClient | undefined, assertActive: () => void) {
  if (!files || !manifest.permissions.some(item => item.permission === permission)) return undefined;
  const panels = new Map<string, MolisWorkPtyHost>();
  const client = Object.freeze<PluginTerminalClient>({ async open(input) {
    const scope = currentPluginInvocation();
    if (!scope || scope.install_id !== context.install_id || !("definition" in scope) || scope.definition.operation !== "command"
      || pluginInvocationReadOnly(scope) || scope.caller.audience !== "user" || !scope.definition.action.permissions.includes(permission))
      throw new ActionError("actions.forbidden", "交互终端只能由当前页面的授权动作启动");
    if (!/^[a-z][a-z0-9-]{0,63}$/u.test(input.key) || !isAbsolute(input.command) || input.command.includes("\0")
      || !input.title.trim() || input.title.length > 120) throw new ActionError("actions.input_invalid", "终端启动参数无效");
    const check = () => { assertActive(); context.requireGrant(permission); assertCapturedPluginActionCurrent(scope, context.install_id); };
    check(); await scope.caller.beforeEffect(); check();
    const host = hosts.get(resolve(home));
    if (!host) throw new ActionError("actions.unavailable", "终端宿主尚未连接");
    const identity = [context.install_id, scope.caller.project_id, scope.caller.actor_id, input.key];
    const panelId = "plugin-" + createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 32);
    const cwd = files.rootPath(); check();
    host.spawn({ panelId, command: input.command, args: [], cwd });
    panels.set(panelId, host);
    return { panelId };
  } });
  return { client, dispose() { for (const [id, host] of panels) host.kill(id); panels.clear(); } };
}
