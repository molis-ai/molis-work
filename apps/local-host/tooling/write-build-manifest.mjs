import path from "node:path";
import { writeMolisWorkBuildManifest } from "@molis-ai/molis-work-app-local-host";

// Build invocation adapter; the installer owns the source-input and digest rules.
await writeMolisWorkBuildManifest(path.resolve(process.argv[2] ?? process.cwd()));
