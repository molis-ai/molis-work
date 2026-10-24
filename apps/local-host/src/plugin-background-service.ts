import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition, PluginInstanceRecord, PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { newCallId, withCallId } from "@molis-ai/molis-work-kernel";
import { createPluginBackgroundClient } from "@molis-ai/molis-work-plugin-runtime";

/**
 * Definitions that declare a background command, or (Host-run ones only) an activation's jobs; only they get `services.background`. A sandboxed
 * package gets it for a command that starts a run (S-67, PG-017 P3); its kept jobs are refused when it starts (BL-377).
 */
export function hasPluginBackground(definition: PluginDefinition): boolean {
  return !!definition.manifest.actions?.some(action => action.action.background_job)
    || (definition.execution !== "sandbox" && !!definition.manifest.background?.jobs.length);
}

/** What the executor says about the activation its jobs run in (PG-038): who it acts as, its project, how to read its record again. */
interface PluginJobGate {
  readonly actor_id: string;
  /** A project instance's project; none for a Home instance. */
  readonly project_id?: string;
  /** Reads the installation's record from the Runtime's repository; absent when the Host cannot, and then no job runs. */
  readonly record?: () => PluginInstanceRecord | null;
}

export function pluginBackgroundFor(definition: PluginDefinition, context: PluginStartContext, assertActive: () => void, jobs: PluginJobGate) {
  if (!hasPluginBackground(definition)) return undefined;
  const declarations = definition.manifest.background?.jobs ?? [];
  return createPluginBackgroundClient({ install_id: context.install_id, installation_generation: context.installation_generation, assertActive, requireGrant: permission => context.requireGrant(permission),
    ...(declarations.length ? { jobs: { declarations, actor_id: jobs.actor_id, ...(jobs.project_id ? { project_id: jobs.project_id } : {}),
      assertInstallationCurrent: installationCheck(jobs.record),
      // Each job is an operation of its own: the call records name it, never the call that kept it.
      operation: run => withCallId(newCallId(), run) } } : {}) });
}

/**
 * The states that say the installation itself is gone. Not `disabled` or `installed`: the Runtime starts from those and saves the
 * record running only once `start()` returned, so a job kept there would be refused; whether the activation was stopped since is
 * the live activation's answer (`assertActive`).
 */
const GONE: ReadonlySet<PluginInstanceRecord["state"]> = new Set(["uninstalled", "quarantined"]);

/**
 * A job's check of the installation's record, read again each time: the same installation and generation as when the activation
 * opened (read while it starts), not uninstalled or quarantined, granting the job's permissions. Without a reader nothing is trusted
 * and every check refuses.
 */
function installationCheck(read: (() => PluginInstanceRecord | null) | undefined) {
  const generation = read?.()?.installation_generation;
  return (permissions: readonly string[]) => {
    const current = read?.();
    if (!current || generation === undefined || current.installation_generation !== generation || GONE.has(current.state)) {
      throw new ActionError("actions.forbidden", "插件安装已变化或已卸载，后台作业不能继续");
    }
    if (permissions.some(permission => !current.grants.includes(permission))) throw new ActionError("actions.forbidden", "插件的授权已撤销，后台作业不能继续");
  };
}
