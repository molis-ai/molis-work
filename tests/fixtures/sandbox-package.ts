import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { SANDBOX_PACKAGE_FILES, type PluginManifest, type PluginPackageBundle, type PluginPackagePayload, type PluginPackageSigner } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { pluginComponentChoices, type PluginComponentPlan } from "@molis-ai/molis-work-design-system";
import { sandboxPluginManifest } from "@molis-ai/molis-work-app-local-host";
import { signPluginPackage } from "@molis-ai/molis-work-plugin-runtime";

export const PACKAGE_PLUGIN_ID = "io.molis.work.example.notes";

export function packageContract(pluginId = PACKAGE_PLUGIN_ID): SandboxPluginContract {
  return { version: 1, pluginId, revision: "one", entities: [], acceptance: [],
    operations: [
      { id: "notes.list", kind: "query", input: { type: "object", properties: {}, required: [], additionalProperties: false }, output: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"], additionalProperties: false } },
        errors: [], effects: { storage: ["read"] }, examples: [{ input: {}, output: [] }] },
      { id: "notes.add", kind: "command", input: { type: "object", properties: { text: { type: "string", maxLength: 200 } }, required: ["text"], additionalProperties: false }, output: { type: "boolean" },
        errors: [], effects: { storage: ["write"] }, examples: [{ input: { text: "a" }, output: true }] },
    ],
    pages: [{ id: "home", title: "笔记", regions: [{ id: "main", title: "笔记", operationIds: ["notes.list", "notes.add"] }] }] };
}

export const packageParts = (): PluginComponentPlan[] => [
  { id: "title", pageId: "home", regionId: "main", intent: "heading", purpose: "说明插件", props: { title: "笔记" } },
  { id: "notes", pageId: "home", regionId: "main", intent: "collection", purpose: "浏览笔记", props: { idField: "id", titleField: "text" }, read: { operationId: "notes.list", input: {} } },
  { id: "editor", pageId: "home", regionId: "main", intent: "input", purpose: "写一条笔记", props: { submitLabel: "添加" }, submit: { operationId: "notes.add", input: { text: { source: "form", field: "text" } } } },
];

const CODE = `export const operations = {
  'notes.list': async (_input, sdk) => JSON.parse((await sdk.storage.get('notes')) ?? '[]'),
  'notes.add': async (input, sdk) => { const notes = JSON.parse((await sdk.storage.get('notes')) ?? '[]'); notes.push({ id: String(notes.length + 1), text: input.text }); await sdk.storage.set('notes', JSON.stringify(notes)); return true; },
};\n`;

export function newPublisher() {
  const keys = generateKeyPairSync("ed25519");
  const spki = keys.publicKey.export({ type: "spki", format: "der" });
  const identity = `ed25519:sha256:${createHash("sha256").update(spki).digest("hex")}`;
  const signer: PluginPackageSigner = { publisher_identity: identity, public_key_spki_base64: spki.toString("base64"), sign: bytes => sign(null, bytes, keys.privateKey) };
  return { identity, signer, keys };
}

export interface PackageFiles { [path: string]: string | undefined }

/** The files of a sandbox package that is in the format; `change` edits them (undefined removes one) before the Manifest is written. */
export function packageFiles(publisher: string, change?: (files: PackageFiles, manifest: PluginManifest) => void, options: { pluginId?: string; version?: string } = {}): { files: PackageFiles; manifest: PluginManifest } {
  const pluginId = options.pluginId ?? PACKAGE_PLUGIN_ID, contract = packageContract(pluginId), parts = packageParts();
  const nodes = parts.map(part => ({ ...part, kind: pluginComponentChoices(part, contract)[0]!.kind }));
  const manifest = sandboxPluginManifest({ pluginId, version: options.version ?? "1.0.0", name: "Example notes", publisher: { publisher_id: "example", signature: publisher }, presentation: false });
  const files: PackageFiles = {
    [SANDBOX_PACKAGE_FILES.entrypoint]: CODE, [SANDBOX_PACKAGE_FILES.contract]: JSON.stringify(contract),
    [SANDBOX_PACKAGE_FILES.interface]: JSON.stringify({ parts, nodes }), [SANDBOX_PACKAGE_FILES.prompts]: "[]",
  };
  change?.(files, manifest);
  return { files, manifest };
}

export function payloadOf(manifest: PluginManifest, files: PackageFiles): PluginPackagePayload {
  const all: PackageFiles = { ...files, [SANDBOX_PACKAGE_FILES.manifest]: JSON.stringify(manifest) };
  return { schema_version: 1, manifest, files: Object.entries(all).filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([path, content]) => ({ path, content_base64: Buffer.from(content).toString("base64") })) };
}

/** A signed package in the format, made by `publisher`; `change` edits its files and Manifest before signing. */
export function signedPackage(publisher = newPublisher(), change?: (files: PackageFiles, manifest: PluginManifest) => void, options: { pluginId?: string; version?: string } = {}): PluginPackageBundle {
  const { files, manifest } = packageFiles(publisher.identity, change, options);
  return signPluginPackage({ payload: payloadOf(manifest, files), signature: null, publisher_key: null }, publisher.signer);
}
