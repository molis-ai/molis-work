import { ActionError, defineErrorCodes, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginExecutionControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { currentPluginAction, runInPluginAction } from "./action-scope.js";

const errors = defineErrorCodes("plugin", { background_action_required: "forbidden", background_undeclared: "forbidden" });

/** No persistence, retries or job state. One installation owns every continuation and revokes it before its cleanup. */
export function createPluginBackgroundClient(gate: {
  install_id: string; assertActive(): void; requireGrant(permission: string): void;
}): { client: PluginBackgroundClient; close(): void } {
  let closed = false;
  const active = new Set<AbortController>();
  const assertActive = () => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件后台执行已关闭");
    gate.assertActive();
  };
  return { client: Object.freeze({
    async start<T>(work: (control: PluginExecutionControl) => Promise<T>, options: { signal?: AbortSignal } = {}) {
      assertActive();
      const scope = currentPluginAction();
      if (!scope || scope.install_id !== gate.install_id || !scope.caller.retainBackgroundAuthority) {
        throw errors.background_action_required("后台执行只能由本插件正在执行的动作受理");
      }
      const { definition, caller } = scope;
      if (definition.operation !== "command" || definition.action.scheduling !== "concurrent" || !definition.action.background_job) {
        throw errors.background_undeclared("后台执行需要并发 command，并声明 background_job 查询合同");
      }
      await caller.beforeEffect();
      caller.signal?.throwIfAborted(); assertActive();
      const authority = caller.retainBackgroundAuthority!();
      const controller = new AbortController();
      let running = true;
      const check = () => {
        if (!running) throw new ActionError("actions.expired", "这次后台执行已经结束");
        assertActive();
        for (const permission of definition.action.permissions) gate.requireGrant(permission);
        requireSynchronous(authority.assertCurrent(), "最终后台授权检查必须同步完成");
      };
      check(); options.signal?.throwIfAborted();
      const lifetime = createExecutionLifetime({ signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
        monitor: { intervalMs: 200, check } });
      const control: ActionExecutionContext = { ...caller, signal: lifetime.signal, on_progress: undefined,
        retainAuthority: undefined, retainBackgroundAuthority: undefined, retain_background_authority: undefined,
        assert_authority_current: () => { lifetime.assertActive(); check(); },
        beforeEffect: async () => { lifetime.assertActive(); check(); await authority(); lifetime.assertActive(); check(); } };
      active.add(controller);
      const pending = Promise.resolve().then(() => {
        control.assert_authority_current!();
        return runInPluginAction({ ...scope, caller: control }, () => work({ signal: control.signal, beforeEffect: control.beforeEffect,
          assert_authority_current: control.assert_authority_current, page_context: control.page_context, locale: control.locale, ...(control.project_id ? { project_id: control.project_id } : {}) }));
      }).then(value => { control.assert_authority_current!(); return value; });
      const result = lifetime.wait(pending).finally(() => { running = false; active.delete(controller); lifetime.dispose(); });
      // The handle may be stored before its owner attaches a handler; a late refusal must still be observed.
      void result.catch(() => undefined);
      return Object.freeze({ result, cancel: () => controller.abort(new ActionError("actions.cancelled", "后台执行已取消")) });
    },
  }), close() {
    closed = true;
    for (const controller of active) controller.abort(new ActionError("actions.plugin_unavailable", "插件实例已停止"));
    active.clear();
  } };
}
