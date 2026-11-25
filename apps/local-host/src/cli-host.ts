import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cliFlagValue, dispatchCli, parseCliLocale, resolveEnvCliLocale, withCliText, type CliCommandPorts, type CliTextFn } from "@molis-ai/molis-work-app-cli";
import { UI_LOCALE_FILE, UI_LOCALE_RELATIVE_PATH } from "@molis-ai/molis-work-service-appearance";
import { runLocalInstallCli, runLocalServiceCli } from "./cli-install-service.js";
import { runLocalDemoCli, runLocalUninstallCli } from "./cli-project-maintenance.js";
import { runV1Cli } from "./cli-project.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { runLocalHomeCli } from "./cli-home.js";
import type { HomeRestoreCatalogInspector } from "./home-restore-contract.js";
import { resolveConfiguredHome } from "./product-home.js";
import { workbenchDisplayReader, workbenchPlatformText } from "./ui-text-provider.js";
import { DEFAULT_WEB_LOCALE, isWebLocale, type WebLocale } from "./web-locale.js";

export interface LocalCliOptions {
  defaultSourceDirectory(): string;
  withCatalog: LocalWebCatalogRunner;
  runPlugin: CliCommandPorts["plugin"];
  inspectCatalog?: HomeRestoreCatalogInspector;
}

/** Read-only Home language check without touching disk, creating watchers, or failing on inaccessible Home paths. */
function readHomeCliLocale(homeDirectory: string | undefined, args: readonly string[]): WebLocale | null {
  const flagHome = cliFlagValue([...args], "--home");
  const candidate = homeDirectory
    ?? (flagHome && !flagHome.startsWith("--") ? flagHome : undefined)
    ?? process.env.MOLIS_WORK_HOME
    ?? (process.env.MOLIS_WORK_TEST ? undefined : (() => { try { return resolveConfiguredHome(); } catch { return undefined; } })());
  if (!candidate) return null;
  try {
    const raw = readFileSync(join(candidate, UI_LOCALE_RELATIVE_PATH), "utf8");
    const { locale } = UI_LOCALE_FILE.parse(JSON.parse(raw));
    return isWebLocale(locale) ? locale : null;
  } catch {
    return null;
  }
}

function resolveLocalCliLocale(homeDirectory: string | undefined, args: readonly string[] = []): WebLocale {
  const envLocale = resolveEnvCliLocale();
  if (envLocale && isWebLocale(envLocale)) return envLocale;
  const fromHome = readHomeCliLocale(homeDirectory, args);
  if (fromHome) return fromHome;
  const parsed = parseCliLocale(DEFAULT_WEB_LOCALE);
  return parsed && isWebLocale(parsed) ? parsed : DEFAULT_WEB_LOCALE;
}

function createLocalCliText(locale: WebLocale): CliTextFn {
  const reader = workbenchDisplayReader(locale);
  const { owner } = workbenchPlatformText;
  return (key, values) => {
    const args = values ? Object.entries(values).map(([name, value]) =>
      typeof value === "number" ? { name, kind: "number" as const, number: value } : { name, kind: "text" as const, text: value },
    ) : undefined;
    return reader.text({ owner, key, ...(args?.length ? { args } : {}) });
  };
}

export function runWithLocalCliLocale<T>(homeDirectory: string | undefined, args: readonly string[], run: (locale: WebLocale) => T): T {
  const locale = resolveLocalCliLocale(homeDirectory, args);
  return withCliText(createLocalCliText(locale), () => run(locale));
}

export function runLocalCli(args: string[], options: LocalCliOptions): Promise<number> {
  return runWithLocalCliLocale(undefined, args, () => dispatchCli(args, {
    home: homeArgs => runLocalHomeCli(homeArgs, options.inspectCatalog),
    plugin: options.runPlugin,
    install: installArgs => runLocalInstallCli(installArgs, options.defaultSourceDirectory),
    service: runLocalServiceCli,
    demo: demoArgs => runLocalDemoCli(demoArgs, options.withCatalog),
    uninstall: uninstallArgs => runLocalUninstallCli(uninstallArgs, options.withCatalog),
    v1: runV1Cli,
  }));
}
