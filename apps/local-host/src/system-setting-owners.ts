import { observationSettingOwner } from "@molis-ai/molis-work-service-observation";
import { projectRuntimeSettingOwner } from "./project-runtime-setting-actions.js";

/** The same host declarations reserve setting keys at installation and identify them in the live action directory. */
export const systemSettingOwners = [projectRuntimeSettingOwner, observationSettingOwner];
