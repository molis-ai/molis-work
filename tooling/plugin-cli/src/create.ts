import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { UI_FORMAT_VERSIONS } from "@molis-ai/molis-work-contracts/platform/ui";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { textKeyPrefix } from "@molis-ai/molis-work-plugin-sdk/ui";
import { samplePluginSource, samplePluginActions, sampleArtifactType, SAMPLE_ARTIFACT_TYPE_ID } from "./sample-source.js";

export interface CreatePluginProjectInput {
  directory: string;
  plugin_id: string;
  publisher_id: string;
  binding_signature: string;
}

/** The sample's words, one file a language (`locales/<language>.json`, specs/font-and-skin-system/a-section-contract.md §1.2); a word has no `<>&"'`. */
const SAMPLE_WORDS: Readonly<Record<string, Readonly<Record<string, string | { plural_arg: string; forms: Record<string, string> }>>>> = {
  en: { saved: "Saved results: {count}", "saved-count": { plural_arg: "count", forms: { one: "{count} result saved", other: "{count} results saved" } }, source: "Source: {name}", title: "Local Plugin Sample" },
  zh: { saved: "已保存的结果：{count}", "saved-count": "已保存 {count} 个结果", source: "来源：{name}", title: "本地插件样例" },
};

export async function createPluginProject(input: CreatePluginProjectInput): Promise<{ directory: string; plugin_id: string }> {
  const owner = textKeyPrefix(input.plugin_id);
  const manifest = parsePluginManifest({
    schema_version: /* @version manifest.schema */ 1, host_api_version: /* @version host.api */ 1, plugin_id: input.plugin_id, version: "2.0.0",
    name: "Local Plugin Sample", name_text: { key: owner + ".main.title" }, kind: "integration",
    publisher: { publisher_id: input.publisher_id, signature: input.binding_signature },
    entrypoints: [{ deployment: "local", entrypoint: "./index.mjs" }],
    permissions: ["storage:private", "artifact:write", "artifact:read", "ui:register"].map(permission => ({
      permission, required: true, reason: "Save a personal result, consume its exact version and show the local sample" })),
    actions: samplePluginActions(input.plugin_id),
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [sampleArtifactType(input.plugin_id)],
      consumes: [{ artifact_type_id: SAMPLE_ARTIFACT_TYPE_ID, schema_version: 1 }] },
    ui: { contributions: [input.plugin_id + ".main"], locales: { default: "en", available: ["en", "zh"] } },
  });
  const directory = resolve(input.directory);
  // Exclusive directory creation: never overwrite a developer's existing project, even an empty one.
  await mkdir(directory);
  await mkdir(join(directory, "locales"));
  // A key starts with the last segment of the plugin_id, so the sample's keys follow the id it was made with.
  const localeFiles = Object.fromEntries(Object.entries(SAMPLE_WORDS).map(([locale, words]) => [`locales/${locale}.json`, JSON.stringify({ format_version: UI_FORMAT_VERSIONS.locale,
    owner: input.plugin_id, locale, messages: Object.fromEntries(Object.entries(words).map(([name, text]) => [`${owner}.main.${name}`, text])) }, null, 2) + "\n"]));
  const files: Record<string, string> = {
    "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
    "index.mjs": samplePluginSource.replaceAll('t("notes.', `t("${owner}.`),
    ...localeFiles,
    "package.json": JSON.stringify({ name: input.plugin_id.replaceAll(".", "-"), version: "2.0.0", private: true,
      type: "module", files: ["index.mjs", "manifest.json", ...Object.keys(localeFiles), "README.md"],
      dependencies: { "@molis-ai/molis-work-plugin-sdk": "0.0.0" } }, null, 2) + "\n",
    "README.md": "# Local Plugin Sample\n\nThis is a local development sample, not a reviewed marketplace release.\n"
      + "The supplied publisher signature is a binding identity, not proof of cryptographic signing.\n\n"
      + "Install the matching local Molis Work SDK distribution, then run through the Molis Work application Host.\n"
      + "The manifest registers health, results.read, results.publish and results.preview with the common action service.\n"
      + "Interface words use stable keys and the declared locales/en.json and locales/zh.json. Run molis-work plugin validate before packaging.\n"
      + "The saved result type has a display name and a preview action of its own, which every Artifact type a plugin pins must declare.\n"
      + "Each poll invokes the same registered publish action; the UI displays the original private counter.\n"
      + "Health can be explicitly authorized for MCP. Personal results use the local startup owner's identity and are not exposed to other clients.\n"
      + "It performs no network request, Team sharing, or Runtime configuration changes.\n",
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(join(directory, name), contents, { flag: "wx" });
  return { directory, plugin_id: manifest.plugin_id };
}
