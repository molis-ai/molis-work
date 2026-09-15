import { createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pluginPublisherIdentity, signPluginPackage, verifyPluginPackage } from "@molis-ai/molis-work-plugin-runtime";
import { readPluginPackageFile, writePluginPackageFile } from "./package-files.js";

export async function readPublisherIdentity(publicKeyFile: string): Promise<string> {
  return pluginPublisherIdentity(await readFile(publicKeyFile));
}

/** Only the CLI adapter reads an explicitly supplied key; the core supports external signing adapters. */
export async function signPluginPackageFile(input: string, privateKeyFile: string, output: string): Promise<void> {
  const bundle = await readPluginPackageFile(input);
  const privateKey = createPrivateKey(await readFile(privateKeyFile));
  const signed = signPluginPackage(bundle, {
    publisher_identity: pluginPublisherIdentity(privateKey),
    sign: payload => sign(null, payload, privateKey),
  });
  await writePluginPackageFile(output, signed);
}

export async function verifyPluginPackageFile(input: string, publicKeyFile: string) {
  return verifyPluginPackage(await readPluginPackageFile(input), await readFile(publicKeyFile));
}
