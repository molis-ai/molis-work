import { observationSettingOwner } from "@molis-ai/molis-work-service-observation";
import { assistantSettingOwner } from "./assistant/assistant-settings-actions.js";
import { memorySettingOwner } from "@molis-ai/molis-work-service-memory";
import { projectRuntimeSettingOwner } from "./project-runtime-setting-actions.js";

/** The same host declarations reserve setting keys at installation and identify them in the live action directory. */
export const systemSettingOwners = [projectRuntimeSettingOwner, observationSettingOwner, memorySettingOwner, assistantSettingOwner];
