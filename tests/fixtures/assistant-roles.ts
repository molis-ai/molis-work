import type { AssistantMethod } from "@molis-ai/molis-work-contracts/services/assistant";

/** A signed role's material as the Assistant offers it. */
export type AssistantRole = Extract<AssistantMethod, { kind: "role" }>;

/** Picks the role material one plugin's installation offers, out of what a work may follow (Skills are the catalog's). */
export const roleOf = (pluginId: string) => (item: AssistantMethod): item is AssistantRole => item.kind === "role" && item.plugin_id === pluginId;
