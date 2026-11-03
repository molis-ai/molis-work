import { ActionError, requireSynchronous } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginManifest, PluginOwnerFilesClient, PluginOwnerFilesDeclaration, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { currentPluginAction, currentPluginInvocation, inPluginInstance, pluginInvocationReadOnly, type PluginActionScope, type PluginInstance } from "./action-scope.js";

/** The executor supplies its existing lifetime and live installation grants. */
export interface PluginOwnerFilesGate extends PluginInstance {
  assertActive(): void;
  requireGrant(permission: string): void;
}

/**
 * Every primitive is synchronous; the Host port itself carries no authority. Inside the plugin's own action (or a job it started) the
 * action and its original caller decide. Outside every action and job (`start`, a route, a timer set up there) there is no caller to
 * ask, and the installation's current grants alone decide, as for every other service (`assertPluginActionCurrent`): a plugin whose
 * installation is stopped, disabled, uninstalled or without the grants can neither read nor write. Inside another instance's action,
 * or a scene, it is refused.
 */
export function createPluginOwnerFilesClient(manifest: PluginManifest, declaration: PluginOwnerFilesDeclaration,
  port: PluginOwnerFilesWriter, gate: PluginOwnerFilesGate, rootPath?: string): { client: PluginOwnerFilesClient } {
  const permissions = new Set(manifest.permissions.map(item => item.permission));
  const permit = (permission: string) => {
    gate.assertActive();
    for (const required of ["storage:private", permission]) {
      if (!permissions.has(required)) throw new ActionError("actions.forbidden", "插件未声明文件权限");
      gate.requireGrant(required);
    }
  };
  const check = (scope: PluginActionScope | undefined, permission: string, write: boolean) => {
    if (!scope && currentPluginInvocation() === undefined) { permit(permission); return; }
    if (!scope || scope !== currentPluginAction() || !inPluginInstance(scope, gate)) {
      throw new ActionError("actions.forbidden", "文件服务只能由本插件的原动作调用，或在动作之外由本插件自己调用");
    }
    if (write && pluginInvocationReadOnly(scope)) throw new ActionError("actions.forbidden", "查询不能写文件");
    if (!scope.definition.action.permissions.includes(permission) || !scope.caller.permissions.includes(permission)) {
      throw new ActionError("actions.forbidden", "动作或调用者没有文件权限");
    }
    scope.caller.signal?.throwIfAborted();
    permit(permission);
    requireSynchronous(scope.caller.assert_authority_current?.(), "文件最终授权检查必须同步完成");
  };
  const read = () => check(currentPluginAction(), declaration.read_permission, false);
  const runWriter = <Result>(run: (writer: PluginOwnerFilesWriter) => Result, authorize: () => void): Result => {
    let active = true;
    const current = () => {
      if (!active) throw new ActionError("actions.expired", "文件写入作用域已结束");
      authorize();
    };
    const writer = Object.freeze<PluginOwnerFilesWriter>({
      stat(relative) { current(); return port.stat(relative); },
      read(relative) { current(); return port.read(relative); },
      list(relative) { current(); return port.list(relative); },
      mkdir(relative) { current(); port.mkdir(relative); },
      writeFile(relative, bytes, mode) { current(); port.writeFile(relative, bytes, mode); },
      replaceFileAtomic(relative, bytes) { current(); port.replaceFileAtomic(relative, bytes); },
      copyFile(source, target) { current(); port.copyFile(source, target); },
      removeTree(relative) { current(); port.removeTree(relative); },
      setAccess(relative, access) { current(); port.setAccess(relative, access); },
    });
    try { authorize(); return requireSynchronous(run(writer), "文件写入回调必须同步完成"); }
    finally { active = false; }
  };
  return { client: Object.freeze<PluginOwnerFilesClient>({
    rootPath() { read(); if (!rootPath) throw new ActionError("actions.unavailable", "文件服务没有本机位置"); return rootPath; },
    stat(relative) { read(); return port.stat(relative); },
    read(relative) { read(); return port.read(relative); },
    list(relative) { read(); return port.list(relative); },
    async write<Result>(run: (writer: PluginOwnerFilesWriter) => Result): Promise<Result> {
      const scope = currentPluginAction();
      const authorize = () => check(scope, declaration.write_permission, true);
      authorize();
      if (scope) { await scope.caller.beforeEffect(); authorize(); }
      return runWriter(run, authorize);
    },
  }) };
}
