#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { hostLog, runLocalCli, runLocalPluginDevelopment, runLocalPluginInstall, gatewayFactory, configureMemberActions, restoreWorkAssets, readRestoredAssets } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog, inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { runServer } from "@molis-ai/molis-work-app-server";
import { runPluginCli } from "@molis-ai/molis-work-plugin-cli";

export async function main(args = process.argv.slice(2)): Promise<number> {
  if (args[0] === "server") {
    const result = await runServer(args.slice(1), { gatewayFactory, configureMemberActions, restoreWorkAssets, readRestoredAssets,
      diagnostics: { debug: (event, fields) => hostLog.debug("server", event, fields), warn: (event, fields) => hostLog.warn("server", event, undefined, fields),
        error: (event, error, fields) => hostLog.error("server", event, error, fields) } });
    if (result === "serving") return new Promise<number>(() => {});
    return 0;
  }
  return runLocalCli(args, {
    defaultSourceDirectory: () => fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../../" : "../../", import.meta.url)),
    withCatalog: withMolisWorkProjectCatalog,
    inspectCatalog: inspectMolisWorkProjectCatalogSnapshot,
    runPlugin: (args) => runPluginCli(args, {
      stdout: value => process.stdout.write(value), stderr: value => process.stderr.write(value),
    }, { runDevelopment: runLocalPluginDevelopment, install: runLocalPluginInstall }),
  });
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("cli/main.ts") ||
    process.argv[1].endsWith("cli/main.js") ||
    process.argv[1].endsWith("molis-work"));

if (isMain) {
  main().then((code) => process.exit(code)).catch((error: unknown) => {
    hostLog.error("cli", "entry_failed", error);
    process.exit(1);
  });
}
