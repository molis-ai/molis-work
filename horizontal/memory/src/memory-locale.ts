import { activeUiIntlLocale } from "@molis-ai/molis-work-plugin-sdk/ui";

/** Resolve an Intl locale tag from an explicit port setting or the active Host UI text context. */
export function resolveMemoryIntlLocale(locale?: string | (() => string | undefined)): string | undefined {
  const direct = typeof locale === "function" ? locale() : locale;
  return direct || activeUiIntlLocale();
}
