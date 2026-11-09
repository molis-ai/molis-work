import { createCapsuleWorkbench, type CapsuleRendererPorts, type MolisWorkWebView } from "@molis-ai/molis-work-app-workbench";
import { createGoalsCapsuleProjection } from "@molis-ai/molis-work-plugin-goals/page";
import { readText, htmlLang, pluginTitleScript } from "./web-locale.js";

import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { drawRegisteredText } from "./ui-text-provider.js";

export function createLocalHostCapsule(renderDesktopShell: CapsuleRendererPorts["renderDesktopShell"]) {
  const shell = createCapsuleWorkbench({ locale: { readText, htmlLang, pluginTitleScript }, renderDesktopShell });
  const { buildCapsuleSnapshot } = createGoalsCapsuleProjection();
  const registered = PLATFORM_PLUGIN_REGISTRATIONS.find(entry => entry.project_plugin_id === "goals")?.manifest;
  return { ...shell, buildCapsuleSnapshot(view: Parameters<typeof buildCapsuleSnapshot>[0] & MolisWorkWebView, directory: { goal_id: string }[]) {
    const draw = () => buildCapsuleSnapshot(view, directory);
    const source = view.plugin_stage_views?.["project:goals"];
    if (source?.drawText) return source.drawText(draw);
    // The capsule's empty state still ships with the built-in Goals presentation, without reading project data.
    return registered ? drawRegisteredText(registered, draw) : draw();
  } };
}
