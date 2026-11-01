import { createCapsuleWorkbench, inWordsOf, type CapsuleRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { createGoalsCapsuleProjection } from "@molis-ai/molis-work-plugin-goals/page";
import { GOALS_PLUGIN_ID } from "@molis-ai/molis-work-plugin-goals";
import { L, htmlLang, clientI18nScript } from "./web-locale.js";

export function createLocalHostCapsule(renderDesktopShell: CapsuleRendererPorts["renderDesktopShell"]) {
  return { ...createCapsuleWorkbench({ locale: { L, htmlLang, clientI18nScript }, renderDesktopShell }), ...createGoalsCapsuleProjection(inWordsOf(GOALS_PLUGIN_ID, L)) };
}
