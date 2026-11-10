import { installHostUiText, projectTextPacks, registeredBuiltinText } from "./ui-text-provider.js";
import { createWorkbenchRenderer, type WorkbenchRenderer, type WorkbenchRendererPorts } from "@molis-ai/molis-work-app-workbench";
import { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref } from "./web-locale.js";

/** Bind Workbench to this Host's request scope; Desktop supplies its own optional-shell behavior. */
export function createLocalHostWorkbenchRenderer(desktop: WorkbenchRendererPorts["desktop"], accountRegistration=false, appearance?: WorkbenchRendererPorts["appearance"], projectDeletionLabels?: WorkbenchRendererPorts["projectDeletionLabels"]): WorkbenchRenderer {
  installHostUiText();
  return createWorkbenchRenderer({
    locale: { readText, currentLocale, htmlLang, dateTimeLocale, listJoin, localeSwitchHref },
    desktop, accountRegistration, appearance, projectDeletionLabels,
    catalogTextPacks(manifest) {
      const reader = registeredBuiltinText(manifest), locale = currentLocale();
      return reader ? projectTextPacks(reader, locale, reader.available.includes(locale)) : [];
    },
  });
}
