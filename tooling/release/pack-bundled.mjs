import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { BUNDLED_PACK_OPTIONS_FILE, keyFileSigner, packBundledContent } from "@molis-ai/molis-work-plugin-cli";
import { publisherKeyReference } from "./profile.mjs";

export async function packBundledReleasePackages(root, destination, profile, environment = process.env) {
  const content = resolve(root, "plugins", "content");
  const directories = (await readdir(content, { withFileTypes: true }))
    .filter(entry => entry.isDirectory())
    .map(entry => resolve(content, entry.name))
    .sort();
  const sources = [];
  for (const directory of directories) {
    const definition = await stat(resolve(directory, BUNDLED_PACK_OPTIONS_FILE), { throwIfNoEntry: false });
    if (definition?.isFile()) sources.push(directory);
  }
  if (!sources.length) return undefined;

  const reference = publisherKeyReference(profile);
  const keyPath = reference && environment[reference];
  if (!keyPath) throw new Error(`Release profile ${profile} requires a publisher key file via ${reference ?? "publisherKeyRef"} (26-9)`);
  const signer = await keyFileSigner(keyPath).catch(() => {
    throw new Error(`Cannot read the publisher key referenced by ${reference}`);
  });
  for (const source of sources) await packBundledContent(source, destination, signer);
  return destination;
}
