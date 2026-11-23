import { PLUGIN_ID_PATTERN } from "@molis-ai/molis-work-contracts/platform/plugin";

/** What a plugin id looks like: the Manifest's own id, and every other plugin a Manifest names (any publisher's reverse domain name, V16). */
export const PLUGIN_ID = new RegExp(PLUGIN_ID_PATTERN, "u");
