#!/usr/bin/env node
// Signs the sample plugin with a Home library that a golden Home installs (tests/fixtures/golden-home-library/README.md). Run on the built workspace,
// and only when the sample itself has to change: a new key signs v1 and v2 together, the key leaves with this process, and a golden that holds the old
// package keeps it. Generating and replaying a golden need no key: they install and upgrade what is signed here.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.resolve(here, "../../tests/fixtures/golden-home-library");
const { sandboxPluginManifest, effectsFromContract } = await import("@molis-ai/molis-work-plugin-sdk");
const { SANDBOX_PACKAGE_FILES } = await import("@molis-ai/molis-work-contracts/platform/plugin");
const { signPluginPackage } = await import("@molis-ai/molis-work-plugin-runtime");
const { newPublisher, packageFiles, payloadOf } = await import(new URL("../../tests/fixtures/sandbox-package.ts", import.meta.url).href);

const PLUGIN_ID = "io.molis.work.example.golden-home-library";
const SCHEMA = "CREATE TABLE notes (id INTEGER PRIMARY KEY, text TEXT NOT NULL UNIQUE);";
const code = version => `// ${version}
export const operations = {
  'notes.list': async (_input, sdk) => {
    const rows = await sdk.homeDatabase.all('SELECT CAST(id AS TEXT) AS id, text FROM notes ORDER BY id'), file = await sdk.ownerFiles.read('notes.txt');
    return [...rows, { id: 'file', text: file?.data_base64 ?? 'no file' }];
  },
  'notes.add': async (input, sdk) => {
    await sdk.homeDatabase.transaction([{ sql: 'INSERT INTO notes(text) VALUES (?)', parameters: [input.text] }]);
    await sdk.ownerFiles.write([{ op: 'write', path: 'notes.txt', data_base64: 'Z29sZGVu', mode: (await sdk.ownerFiles.read('notes.txt')) ? 'replace' : 'create' }]);
    return true;
  },
};
`;

function bundle(publisher, version) {
  const { files, manifest } = packageFiles(publisher.identity, (files, manifest) => {
    const contract = JSON.parse(files[SANDBOX_PACKAGE_FILES.contract]);
    const [list, add] = contract.operations;
    list.effects = { homeDatabase: ["read"], ownerFiles: ["read"] };
    add.effects = { homeDatabase: ["read", "write"], ownerFiles: ["read", "write"] };
    const rebuilt = sandboxPluginManifest({ pluginId: manifest.plugin_id, name: "金样 Home 库样本", version, publisher: manifest.publisher, presentation: false, runtime: { scope: "home" },
      ...(version === "1.0.0" ? {} : { upgradesFrom: ["1.0.0"] }), effects: effectsFromContract(contract), homeDatabase: { version: 1, schema: SCHEMA }, ownerFiles: [{ name: "notes.txt", kind: "file" }] });
    Object.assign(manifest, rebuilt);
    files[SANDBOX_PACKAGE_FILES.contract] = JSON.stringify(contract);
    files[SANDBOX_PACKAGE_FILES.entrypoint] = code(version);
  }, { pluginId: PLUGIN_ID, version });
  return signPluginPackage({ payload: payloadOf(manifest, files), signature: null, publisher_key: null }, publisher.signer);
}

mkdirSync(directory, { recursive: true });
const publisher = newPublisher();
for (const [name, version] of [["v1.json", "1.0.0"], ["v2.json", "1.1.0"]]) writeFileSync(path.join(directory, name), `${JSON.stringify(bundle(publisher, version), null, 2)}\n`);
process.stdout.write(`signed ${PLUGIN_ID} by ${publisher.identity}\n`);
process.exit(0);
