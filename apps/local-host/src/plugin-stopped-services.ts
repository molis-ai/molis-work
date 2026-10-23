import type { PluginStartContext } from "@molis-ai/molis-work-contracts/platform/plugin";
import { inertAfterStop, type StoppedServiceCalls } from "@molis-ai/molis-work-plugin-runtime";
import { hostLog } from "./host-log.js";

/**
 * BL-411: the context one activation's plugin is given, whose services do nothing for code the plugin left running once the
 * activation stopped (`stopped()`: its `stop` hook returned, or it never started), instead of throwing a refusal nothing catches
 * into the Home's process. Each such call is counted in `calls`; the first of each method by this instance writes one log line,
 * which names the plugin, the service and the method, never what the call was given.
 */
export function servicesUntilStopped(context: PluginStartContext, stopped: () => boolean, calls: StoppedServiceCalls): PluginStartContext {
  if (!context.services) return context;
  const instance = { install_id: context.install_id, installation_generation: context.installation_generation };
  const services = inertAfterStop(context.services, stopped, call => {
    if (calls.note(instance, call)) {
      hostLog.warn("plugins", "stopped_service_call", undefined, { plugin_id: context.plugin_id, install_id: context.install_id, service: call.service, method: call.method });
    }
  });
  return Object.freeze({ ...context, services });
}
