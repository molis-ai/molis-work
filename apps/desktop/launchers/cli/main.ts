#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { runLocalCli, runLocalPluginDevelopment } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { runPluginCli } from "@molis-ai/molis-work-plugin-cli";

export function main(args = process.argv.slice(2)): Promise<number> {
  return runLocalCli(args, {
    defaultSourceDirectory: () => fileURLToPath(new URL(import.meta.url.endsWith(".ts") ? "../../../../" : "../../", import.meta.url)),
    withCatalog: withMolisWorkProjectCatalog,
    runPlugin: (args) => runPluginCli(args, {
      stdout: value => process.stdout.write(value), stderr: value => process.stderr.write(value),
    }, { runDevelopment: runLocalPluginDevelopment }),
  });
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("cli/main.ts") ||
    process.argv[1].endsWith("cli/main.js") ||
    process.argv[1].endsWith("molis-work"));

if (isMain) {
  main().then((code) => process.exit(code));
}
