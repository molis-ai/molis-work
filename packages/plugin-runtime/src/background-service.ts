import { ActionError, requireSynchronous, type ActionExecutionContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginBackgroundClient, PluginExecutionControl, PluginJobControl } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { currentPluginAction, inPluginInstance, pluginActionBeforeEffect, runInPluginAction, type PluginInstance } from "./action-scope.js";
import { backgroundErrors as errors, createActivationJobs, type ActivationJobGate } from "./activation-jobs.js";

/**
 * No persistence, retries or job state. One installation owns every continuation and revokes it before its cleanup. Each execution
 * keeps the project its action was called in, from the call, never from the work: deleting a project stops that project's executions
 * before the platform clears what the plugin declared (`stopProject`, PG-038). The activation's jobs (`keep`, `createActivationJobs`)
 * stop there too, and also when their project closes (`stopProjectJobs`).
 */
export function createPluginBackgroundClient(gate: PluginInstance & {
  assertActive(): void; requireGrant(permission: string): void;
  /** Present when the Manifest declares jobs (`background.jobs`). */
  jobs?: Omit<ActivationJobGate, keyof PluginInstance | "assertActive" | "requireGrant">;
}): { client: PluginBackgroundClient; starting<T>(run: () => T): T; stopProject(projectId: string): void; stopProjectJobs(projectId: string): void; close(): void } {
  let closed = false;
  const active = new Map<AbortController, string | null>();
  const jobs = gate.jobs?.declarations.length
    ? createActivationJobs({ ...gate.jobs, install_id: gate.install_id, installation_generation: gate.installation_generation, assertActive: gate.assertActive, requireGrant: gate.requireGrant }) : undefined;
  const assertActive = () => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件后台执行已关闭");
    gate.assertActive();
  };
  return { client: Object.freeze({
    async start<T>(work: (control: PluginExecutionControl) => Promise<T>, options: { signal?: AbortSignal } = {}) {
      assertActive();
      const scope = currentPluginAction();
      if (!scope || !inPluginInstance(scope, gate) || !scope.caller.retainBackgroundAuthority) {
        throw errors.background_action_required("后台执行只能由本插件正在执行的动作受理");
      }
      // The work shares the call's `checked` record, and with it the model answers the call holds (PG-047); a call without one
      // passed its last check once its `beforeEffect` below returns.
      const { definition, caller } = scope, checked = scope.checked ?? { passed: true };
      if (definition.operation !== "command" || definition.action.scheduling !== "concurrent" || !definition.action.background_job) {
        throw errors.background_undeclared("后台执行需要并发 command，并声明 background_job 查询合同");
      }
      const controller = new AbortController();
      // Counted before the first wait: deleting the project also stops an execution still being accepted.
      active.set(controller, caller.project_id);
      let lifetime: ReturnType<typeof createExecutionLifetime>, control: ActionExecutionContext, check: () => void, running = true;
      try {
        await caller.beforeEffect();
        caller.signal?.throwIfAborted(); assertActive(); controller.signal.throwIfAborted();
        const authority = caller.retainBackgroundAuthority!();
        check = () => {
          if (!running) throw new ActionError("actions.expired", "这次后台执行已经结束");
          assertActive();
          for (const permission of definition.action.permissions) gate.requireGrant(permission);
          requireSynchronous(authority.assertCurrent(), "最终后台授权检查必须同步完成");
        };
        check(); options.signal?.throwIfAborted();
        lifetime = createExecutionLifetime({ signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
          monitor: { intervalMs: 200, check } });
        control = { ...caller, signal: lifetime.signal, on_progress: undefined, original_input: undefined,
          retainAuthority: undefined, retainBackgroundAuthority: undefined, retain_background_authority: undefined,
          assert_authority_current: () => { lifetime.assertActive(); check(); },
          beforeEffect: pluginActionBeforeEffect(async () => { lifetime.assertActive(); check(); await authority(); lifetime.assertActive(); check(); }, checked) };
      } catch (error) { active.delete(controller); throw error; }
      const pending = Promise.resolve().then(() => {
        control.assert_authority_current!();
        return runInPluginAction({ ...scope, caller: control, checked }, () => work({ signal: control.signal, beforeEffect: control.beforeEffect,
          assert_authority_current: control.assert_authority_current, page_context: control.page_context, locale: control.locale, ...(control.project_id ? { project_id: control.project_id } : {}) }));
      }).then(value => { control.assert_authority_current!(); return value; });
      const result = lifetime.wait(pending).finally(() => { running = false; active.delete(controller); lifetime.dispose(); });
      // The handle may be stored before its owner attaches a handler; a late refusal must still be observed.
      void result.catch(() => undefined);
      return Object.freeze({ result, cancel: () => controller.abort(new ActionError("actions.cancelled", "后台执行已取消")) });
    },
    keep(job: string, work: (control: PluginJobControl) => Promise<void>) {
      if (!jobs) throw errors.background_undeclared("这个插件没有在 Manifest 的 background.jobs 里声明后台作业");
      return jobs.keep(job, work);
    },
  }), starting: run => jobs ? jobs.starting(run) : run(), stopProject(projectId) {
    for (const [controller, project] of active) {
      if (project === projectId) controller.abort(new ActionError("actions.cancelled", "项目已删除，这次后台执行已停止"));
    }
    jobs?.stopProject(projectId, "项目已删除，这个后台作业已停止");
  }, stopProjectJobs(projectId) {
    jobs?.stopProject(projectId, "项目已关闭，这个后台作业已停止");
  }, close() {
    closed = true;
    for (const controller of active.keys()) controller.abort(new ActionError("actions.plugin_unavailable", "插件实例已停止"));
    active.clear();
    jobs?.close();
  } };
}
