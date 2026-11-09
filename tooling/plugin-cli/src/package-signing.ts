import { createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { PluginPackageSigner } from "@molis-ai/molis-work-contracts/platform/plugin";
import { pluginPublisherIdentity, signPluginPackage, verifyPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { readPluginPackageFile, writePluginPackageFile } from "./package-files.js";

export async function readPublisherIdentity(publicKeyFile: string): Promise<string> {
  return pluginPublisherIdentity(await readFile(publicKeyFile));
}

/** The signer of a private key in a PEM file the caller names: only the CLI adapter reads a key, and only one it is explicitly given. */
export async function keyFileSigner(privateKeyFile: string): Promise<PluginPackageSigner> {
  const privateKey = createPrivateKey(await readFile(privateKeyFile));
  return {
    publisher_identity: pluginPublisherIdentity(privateKey),
    public_key_spki_base64: createPublicKey(privateKey).export({ type: "spki", format: "der" }).toString("base64"),
    sign: payload => sign(null, payload, privateKey),
  };
}

/** The core supports external signing adapters; this one signs with a key file. */
export async function signPluginPackageFile(input: string, privateKeyFile: string, output: string): Promise<void> {
  const bundle = await readPluginPackageFile(input);
  await writePluginPackageFile(output, signPluginPackage(bundle, await keyFileSigner(privateKeyFile)));
}

export async function verifyPluginPackageFile(input: string, publicKeyFile: string) {
  return verifyPluginPackage(await readPluginPackageFile(input), await readFile(publicKeyFile));
}
