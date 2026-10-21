import { AsyncLocalStorage } from "node:async_hooks";
import { ActionError, defineErrorCodes, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginJobControl, PluginJobDeclaration, PluginKeptJob } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertCapturedPluginActionCurrent, currentPluginInvocation, lastBegunPluginInvocation, pluginActionChecked, pluginInvocationReadOnly, runInPluginJob } from "./action-scope.js";

export const backgroundErrors = defineErrorCodes("plugin", {
  background_action_required: "forbidden", background_undeclared: "forbidden", background_job_origin: "forbidden", background_job_unchecked: "forbidden",
});

/** One timer per activation checks every job this often, so a job waiting on something long hears of a lost authority soon. */
const SWEEP_MS = 200;

/** What the Host tells one activation's jobs (PG-038). */
export interface ActivationJobGate {
  readonly install_id: string;
  /** Who the installation acts as in this activation, the Host's word: a job's calls are the installation's, never its caller's. */
  readonly actor_id: string;
  /** The activation's project: a project instance's own; none for a Home instance. */
  readonly project_id?: string;
  readonly declarations: readonly PluginJobDeclaration[];
  assertActive(): void;
  requireGrant(permission: string): void;
  /** Reads the installation's record again: the same installation and generation as at activation, not stopped, granting these. */
  assertInstallationCurrent(permissions: readonly string[]): void;
  /** Runs a job as an operation of its own (the Host gives it a call id of its own). */
  operation?<T>(run: () => Promise<T>): Promise<T>;
}

/**
 * The jobs one activation keeps (`services.background.keep`). A job is kept only from this installation's command once it passed its
 * last authority check and while it is still current, from the activation's `start()` before it returns (`starting`), or from another
 * of its jobs that still runs; its project comes from there, never from the work. It runs with the installation's own authority, as
 * the installation: its control and its scope name no caller, so cancelling or revoking the call that kept it does not stop it. Every
 * check, before each write and on the shared timer, asks that the job still runs, the activation is live and the installation's record
 * still grants the job's permissions; the job stops on `stopProject`, `close` or `cancel`, and whatever it writes through the platform
 * after that is refused. A call begun before its project was stopped keeps nothing there afterwards.
 */
export function createActivationJobs(gate: ActivationJobGate) {
  let closed = false, timer: ReturnType<typeof setInterval> | undefined;
  const window = new AsyncLocalStorage<{ open: boolean }>();
  const jobs = new Map<AbortController, { readonly project: string | null; readonly check: () => void }>();
  /** Per project stopped, the last call begun then: a call still under way from before keeps nothing there. */
  const stoppedUpTo = new Map<string, { readonly begun: number; readonly reason: string }>();
  const sweep = () => {
    for (const [controller, job] of jobs) {
      try { job.check(); } catch (error) { controller.abort(error); }
    }
  };
  const origin = (): { project: string | null; begun?: number } => {
    const scope = currentPluginInvocation();
    if (!scope) {
      if (!window.getStore()?.open) throw backgroundErrors.background_job_origin("后台作业只能在本插件的命令、激活的 start() 或另一个后台作业里登记");
      return { project: gate.project_id ?? null };
    }
    if (scope.install_id !== gate.install_id) throw backgroundErrors.background_job_origin("这次调用属于另一个插件安装，不能为本插件登记后台作业");
    if ("job" in scope) {
      // A job stopped since (cancelled, its project closed or deleted) keeps no successor: its own checks answer first.
      assertCapturedPluginActionCurrent(scope, gate.install_id);
      return { project: scope.caller.project_id, begun: scope.begun };
    }
    if (!("definition" in scope) || scope.definition.operation !== "command" || pluginInvocationReadOnly(scope)) {
      throw backgroundErrors.background_job_origin("后台作业只能由本插件的命令登记");
    }
    if (!pluginActionChecked(scope)) throw backgroundErrors.background_job_unchecked("这次调用还没有通过最后一次授权检查，不能登记后台作业");
    // Having passed once is not enough: a call cancelled or revoked since its check keeps nothing.
    assertCapturedPluginActionCurrent(scope, gate.install_id);
    return { project: scope.caller.project_id, begun: scope.begun };
  };
  const keep = (job: string, work: (control: PluginJobControl) => Promise<void>): PluginKeptJob => {
    if (closed) throw new ActionError("actions.plugin_unavailable", "插件后台执行已关闭");
    gate.assertActive();
    const declaration = gate.declarations.find(item => item.job_id === job);
    if (!declaration) throw backgroundErrors.background_undeclared(`后台作业 ${job} 没有在 Manifest 的 background.jobs 里声明`);
    const { project, begun } = origin();
    const stop = project === null ? undefined : stoppedUpTo.get(project);
    if (stop && begun !== undefined && begun <= stop.begun) throw new ActionError("actions.cancelled", stop.reason);
    const controller = new AbortController();
    let running = true;
    const check = () => {
      if (!running || closed) throw new ActionError("actions.expired", "这个后台作业已经结束");
      controller.signal.throwIfAborted();
      gate.assertActive();
      for (const permission of declaration.permissions) gate.requireGrant(permission);
      gate.assertInstallationCurrent(declaration.permissions);
    };
    check();
    const caller: ActionCallContext = Object.freeze({ actor_id: gate.actor_id, project_id: project, audience: "plugin", plugin_install_id: gate.install_id,
      permissions: Object.freeze([...declaration.permissions]), signal: controller.signal, assert_authority_current: () => check() });
    const control: PluginJobControl = Object.freeze({ job, signal: controller.signal, beforeEffect: async () => check(), assert_authority_current: () => check(),
      ...(project ? { project_id: project } : {}) });
    jobs.set(controller, { project, check });
    if (!timer) { timer = setInterval(sweep, SWEEP_MS); timer.unref?.(); }
    const run = () => runInPluginJob({ install_id: gate.install_id, job, caller, ...(begun === undefined ? {} : { begun }) }, () => work(control));
    const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true }));
    const pending = Promise.resolve().then(() => { check(); return gate.operation ? gate.operation(run) : run(); });
    const done = Promise.race([pending, stopped]).finally(() => {
      running = false; jobs.delete(controller);
      if (!controller.signal.aborted) controller.abort(new ActionError("actions.expired", "这个后台作业已经结束"));
      if (!jobs.size && timer) { clearInterval(timer); timer = undefined; }
    });
    // The handle may be stored before its owner attaches a handler; a late refusal must still be observed.
    void done.catch(() => undefined);
    return Object.freeze({ done, cancel: () => controller.abort(new ActionError("actions.cancelled", "后台作业已取消")) });
  };
  return {
    keep,
    /** Runs the activation's `start()`: until it settles, a job may be kept outside every action. */
    starting<T>(run: () => T): T {
      const state = { open: true }, close = () => { state.open = false; };
      let result: T;
      try { result = window.run(state, run); } catch (error) { close(); throw error; }
      if (typeof (result as { then?: unknown } | null | undefined)?.then === "function") void (result as PromiseLike<unknown>).then(close, close);
      else close();
      return result;
    },
    stopProject(projectId: string, reason: string) {
      stoppedUpTo.set(projectId, { begun: lastBegunPluginInvocation(), reason });
      for (const [controller, job] of jobs) {
        if (job.project === projectId) controller.abort(new ActionError("actions.cancelled", reason));
      }
    },
    close() {
      closed = true;
      for (const controller of jobs.keys()) controller.abort(new ActionError("actions.plugin_unavailable", "插件实例已停止"));
      jobs.clear();
      if (timer) { clearInterval(timer); timer = undefined; }
    },
  };
}
