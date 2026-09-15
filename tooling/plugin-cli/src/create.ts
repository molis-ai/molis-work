import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parsePluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { samplePluginSource } from "./sample-source.js";

export interface CreatePluginProjectInput {
  directory: string;
  plugin_id: string;
  publisher_id: string;
  binding_signature: string;
}

export async function createPluginProject(input: CreatePluginProjectInput): Promise<{ directory: string; plugin_id: string }> {
  const manifest = parsePluginManifest({
    schema_version: 1, host_api_version: 1, plugin_id: input.plugin_id, version: "1.0.0",
    name: "Local Plugin Sample", kind: "integration",
    publisher: { publisher_id: input.publisher_id, signature: input.binding_signature },
    entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: ["storage:private", "artifact:write", "artifact:read", "ui:register"].map(permission => ({
      permission, required: true, reason: "Save a personal result, consume its exact version and show the local sample" })),
    capabilities: { provides: ["connector.sample.v1"], consumes: [] },
    artifacts: { produces: [{ artifact_type_id: "io.molis.work.example.note", schema_version: 1 }],
      consumes: [{ artifact_type_id: "io.molis.work.example.note", schema_version: 1 }] },
    ui: { contributions: [input.plugin_id + ".main"] },
  });
  const directory = resolve(input.directory);
  // Exclusive directory creation: never overwrite a developer's existing project, even an empty one.
  await mkdir(directory);
  const files: Record<string, string> = {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "index.mjs": samplePluginSource,
    "package.json": JSON.stringify({ name: input.plugin_id.replaceAll(".", "-"), version: "1.0.0", private: true,
      type: "module", files: ["index.mjs", "manifest.json", "README.md"],
      dependencies: { "@molis-ai/molis-work-plugin-sdk": "0.0.0" } }, null, 2) + "\n",
    "README.md": "# Local Plugin Sample\n\nThis is a local development sample, not a reviewed marketplace release.\n"
      + "The supplied publisher signature is a binding identity, not proof of cryptographic signing.\n\n"
      + "Install the matching local Molis Work SDK distribution, then run through the Molis Work application Host.\n"
      + "Each poll saves one personal Artifact version and a private counter; the UI displays that counter.\n"
      + "It performs no network request, Team sharing, or Runtime configuration changes.\n",
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(join(directory, name), contents, { flag: "wx" });
  return { directory, plugin_id: manifest.plugin_id };
}
