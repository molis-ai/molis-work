import { pluginErrors, type PluginDefinition, type PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { createExecutionLifetime } from "@molis-ai/molis-work-plugin-sdk";
import { hostLog } from "./host-log.js";

/** How long the Host waits for an author's asynchronous stop hook (BL-367, user 2026-11-09). */
export const PLUGIN_STOP_HOOK_MS = 2_000;

export type PluginStopExecution = PluginDefinition["execution"];

/**
 * Waits for one installation's stop hook, the one wait point both executors share (BL-367). The caller has already revoked the old
 * activation's authority, and disposes its session after this returns or throws, so the time counted here is the hook alone.
 *
 * A sandboxed definition's stop is the Host's own (it stops the runner, waits for the process group to exit and its directory to go):
 * it is awaited in full, with its real failures. An in-process hook that finishes or throws in time keeps its own result; one still
 * pending after `PLUGIN_STOP_HOOK_MS` is no longer waited for. Only the reason this wait's own timer issued ends it, never an error the
 * hook returned, and that expiry writes one local warning with ids only and is not a failure: no `last_error_code`, no recovery spent.
 * The hook's later settlement is observed and goes nowhere. `execution` is what the activation was admitted with, captured at start.
 */
export async function awaitPluginStopHook(definition: PluginDefinition, context: PluginStartContext, scope: "home" | "project",
  execution: PluginStopExecution = definition.execution, timeoutMs = PLUGIN_STOP_HOOK_MS): Promise<void> {
  if (!definition.stop) return;
  if (execution === "sandbox") { await definition.stop(context); return; }
  const pending: unknown = definition.stop(context);
  if (!pending || typeof (pending as PromiseLike<void>).then !== "function") return;
  const expired = pluginErrors.stop_timeout("插件的停止钩子没有在期限内返回，宿主不再等它");
  const lifetime = createExecutionLifetime({ timeout: { milliseconds: timeoutMs, reason: expired } });
  try { await lifetime.wait(pending as PromiseLike<void>); } catch (error) {
    if (error !== expired) throw error;
    hostLog.warn("plugins", "plugin_stop_timeout", undefined, { code: "plugin.stop_timeout", plugin_id: definition.manifest.plugin_id,
      install_id: context.install_id, installation_generation: context.installation_generation, scope, timeout_ms: timeoutMs });
  } finally { lifetime.dispose(); }
}
