import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { ScheduleHost } from "./types.js";

/** One POST of a JSON body that must succeed (`path` follows the plugin's route): the answer, or an error that says why in the Host's words. */
export const post = <T = unknown>(host: ScheduleHost, path: string, body: Record<string, unknown>, fallback: string): Promise<T> =>
  molisWorkRequest<T>(host.pluginRoute(path), { method: "POST", body, fallback });

/** One read of a route (`path` follows the plugin's route). */
export const read = <T>(host: ScheduleHost, path: string): Promise<T> => molisWorkRequest<T>(host.pluginRoute(path));
