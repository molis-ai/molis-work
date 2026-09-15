import { createCapsuleWorkbench, type CapsuleRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { L, htmlLang, clientI18nScript } from "./web-locale.js";

export function createLocalHostCapsule(renderDesktopShell: CapsuleRendererPorts["renderDesktopShell"]) {
  return createCapsuleWorkbench({ locale: { L, htmlLang, clientI18nScript }, renderDesktopShell });
}
