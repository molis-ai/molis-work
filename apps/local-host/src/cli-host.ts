import { dispatchCli, type CliCommandPorts } from "@molis-ai/molis-work-app-cli";
import { runLocalInstallCli, runLocalServiceCli } from "./cli-install-service.js";
import { runLocalDemoCli, runLocalUninstallCli } from "./cli-project-maintenance.js";
import { runV1Cli } from "./cli-project.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import { runLocalHomeCli } from "./cli-home.js";
import type { HomeRestoreCatalogInspector } from "./home-restore-contract.js";

export interface LocalCliOptions {
  defaultSourceDirectory(): string;
  withCatalog: LocalWebCatalogRunner;
  runPlugin: CliCommandPorts["plugin"];
  inspectCatalog?: HomeRestoreCatalogInspector;
}

export function runLocalCli(args: string[], options: LocalCliOptions): Promise<number> {
  return dispatchCli(args, {
    home: args => runLocalHomeCli(args, options.inspectCatalog),
    plugin: options.runPlugin,
    install: (args) => runLocalInstallCli(args, options.defaultSourceDirectory),
    service: runLocalServiceCli,
    demo: (args) => runLocalDemoCli(args, options.withCatalog),
    uninstall: (args) => runLocalUninstallCli(args, options.withCatalog),
    v1: runV1Cli,
  });
}
