export type { UiClientTranslate as Translate } from "@molis-ai/molis-work-contracts/platform/ui";
import type { UiPluginClientHost } from "@molis-ai/molis-work-contracts/platform/ui";

export type FormClientHost = Pick<UiPluginClientHost<HTMLElement, HTMLDialogElement>,
  "translate" | "download" | "pluginId" | "projectId" | "route" | "pluginRoute" | "interaction" | "confirmBox">;

/** One request to the Forms routes; `path` follows `/forms`. A failure is an Error with the Host's `code` and `details`. */
export type FormRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<T>;

export type FormFailure = Error & { code?: string; details?: unknown };
