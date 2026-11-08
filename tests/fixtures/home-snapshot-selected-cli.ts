import { runV1Cli } from "@molis-ai/molis-work-app-local-host";

// Ownership tests select a Home through the public embedding port; the shipped installation CLI still requires account attachment.
const [homeDirectory, ...args] = process.argv.slice(2);
if (!homeDirectory) throw new Error("selected CLI fixture requires an explicit Home");
try {
  process.exitCode = await runV1Cli(args, { homeDirectory });
} catch (error) {
  process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}
