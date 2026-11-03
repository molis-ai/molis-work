import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { bindPluginActionRoute } from "@molis-ai/molis-work-plugin-sdk";
import { probeManifest } from "./manifest.js";
import { probeMethods } from "./methods.js";
import { PROBE_KEEP_JOB, probeActionHandlers, probeActions } from "./actions.js";

/** Each project's probe instance. Its kept job waits until the platform stops it and writes nothing. */
export function createProbePlugin(): PluginDefinition {
  return { manifest: probeManifest, methods: probeMethods, async start(context) {
    for (const permission of probeManifest.permissions) if (permission.required) context.requireGrant(permission.permission);
    const storage = context.services?.storage, background = context.services?.background;
    if (!storage || !background) throw new ActionError("actions.unredeemed", "宿主未提供探针要的私有存储或后台服务");
    background.keep(PROBE_KEEP_JOB, control => new Promise<void>(resolve => {
      if (control.signal.aborted) resolve(); else control.signal.addEventListener("abort", () => resolve(), { once: true });
    }));
    return { kind: "app", views: [], actions: probeActionHandlers(storage),
      routes: [
        bindPluginActionRoute(context, probeActions.list, () => ({})),
        bindPluginActionRoute(context, probeActions.create, request => ({ title: String((request.body as { title?: unknown } | null)?.title ?? "") })),
      ] };
  } };
}
