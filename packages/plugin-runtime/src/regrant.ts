import type { PluginInstanceRecord, PluginLifecycleReceipt, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { assertMutable, toggledGrants } from "./install-rules.js";
import { sameStrings } from "./runtime-rules.js";

/** What `PluginRuntime.regrant` lends to the switch: the Runtime's own lifecycle steps and nothing else. */
export interface RegrantSteps {
  install(installId: string): PluginInstanceRecord;
  manifest(record: PluginInstanceRecord): PluginManifest;
  save(record: PluginInstanceRecord): void;
  now(): string;
  /** Withdraws the live activation's authority at once, before anything is queued (the first step of `stop()`). */
  revoke(installId: string): void;
  /** Runs one step of the installation's lifecycle under its lock. */
  locked<Result>(installId: string, run: () => Promise<Result>): Promise<Result>;
  /** Stops the activation and leaves the installation startable (`preserve_enabled`). */
  stop(installId: string): Promise<unknown>;
  start(installId: string): Promise<PluginLifecycleReceipt>;
  receipt(record: PluginInstanceRecord, replayed: boolean): PluginLifecycleReceipt;
}

/**
 * The person's switch for one optional permission (PG-002, S-94): the grants change only while no activation holds the old ones, so a
 * running plugin is stopped, given the new grants and started again as one step under the installation's lock. Taking a permission
 * away withdraws the live activation's authority now, before the queue, and saves the new grants before anything is stopped: a stop
 * that fails still leaves the permission off. Adding one saves after the old activation is gone, so a failed stop adds nothing.
 * Whatever follows is the plugin's ordinary start (it may crash, as any start can); the grants stay as the person set them.
 */
export async function regrantInstall(steps: RegrantSteps, installId: string, permission: string, granted: boolean): Promise<PluginLifecycleReceipt> {
  const first = steps.install(installId);
  assertMutable(first);
  const wanted = toggledGrants(steps.manifest(first), first.grants, permission, granted);
  if (!granted && first.state === "running" && !sameStrings(wanted, first.grants)) steps.revoke(installId);
  return steps.locked(installId, async () => {
    const current = steps.install(installId);
    assertMutable(current);
    const next = toggledGrants(steps.manifest(current), current.grants, permission, granted);
    if (sameStrings(next, current.grants)) return steps.receipt(current, true);
    const running = current.state === "running";
    if (!granted) steps.save({ ...current, grants: next, updated_at: steps.now() });
    if (running) await steps.stop(installId);
    const stopped = steps.install(installId);
    const saved = granted ? { ...stopped, grants: next, updated_at: steps.now() } : stopped;
    if (granted) steps.save(saved);
    return running ? steps.start(installId) : steps.receipt(saved, false);
  });
}
