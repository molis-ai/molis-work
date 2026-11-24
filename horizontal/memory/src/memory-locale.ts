/** Resolve an Intl locale tag from an explicit port setting or the active Host UI text context. */
export function resolveMemoryIntlLocale(locale?: string | (() => string | undefined)): string | undefined {
  const direct = typeof locale === "function" ? locale() : locale;
  if (direct) return direct;
  const provider = Reflect.get(globalThis, Symbol.for("molis.work.ui-text.v1")) as {
    locale?(): string | null;
    intlLocale?(tag: string): string | undefined;
  } | undefined;
  const tag = provider?.locale?.();
  return tag ? provider?.intlLocale?.(tag) ?? tag : undefined;
}
