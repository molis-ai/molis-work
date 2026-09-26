import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { releaseAssetPaths } from "../apps/local-host/src/installer/release-assets.js";
import { copyReleaseEntries, declaredReleaseFileEntries } from "../apps/local-host/src/installer/package-release-files.js";
import { computeSourceContentDigest } from "../apps/local-host/src/installer/home-source.js";

test("Home and npm keep SDK runtime and provenance, excluding source archives from copies and fingerprints", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "molis-release-assets-"));
  const source = path.join(directory, "source");
  const files = {
    "package.json": JSON.stringify({ name: "fixture", files: ["dist", "vendor"] }),
    "dist/index.js": "export const app = true;",
    "skills/example.md": "skill",
    "vendor/prologue-sdk/current.tgz": "current source archive",
    "vendor/prologue-sdk/old.tgz": "historical source archive",
    "vendor/prologue-sdk/history/old.tgz": "nested historical archive",
    "vendor/prologue-sdk/README.md": "SDK provenance",
    "vendor/prologue-sdk/source.patch": "SDK patch",
    "vendor/other/sbom.cdx.json": "other vendor provenance",
    "vendor/other/current.tgz": "unrelated vendor asset",
    "sdk/package.json": JSON.stringify({ name: "@prologue/sdk", version: "1.0.0", files: ["dist"] }),
    "sdk/dist/index.js": "export const sdk = 'current';",
  };
  try {
    for (const [relative, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(source, relative)), { recursive: true });
      await writeFile(path.join(source, relative), content);
    }
    const homeEntries = await releaseAssetPaths(source);
    const npmEntries = await declaredReleaseFileEntries(source, { name: "fixture", files: ["dist", "vendor"] });
    assert.deepEqual(npmEntries.filter(entry => entry.startsWith("vendor/")), homeEntries);
    for (const [name, entries] of [["home", homeEntries], ["npm", npmEntries]] as const) {
      const output = path.join(directory, name);
      await copyReleaseEntries(source, output, entries);
      for (const relative of ["vendor/prologue-sdk/README.md", "vendor/prologue-sdk/source.patch", "vendor/other/sbom.cdx.json", "vendor/other/current.tgz"]) {
        assert.equal(await readFile(path.join(output, relative), "utf8"), files[relative as keyof typeof files]);
      }
      for (const relative of ["vendor/prologue-sdk/current.tgz", "vendor/prologue-sdk/old.tgz", "vendor/prologue-sdk/history/old.tgz"]) {
        await assert.rejects(access(path.join(output, relative)), { code: "ENOENT" });
        assert.equal(await readFile(path.join(source, relative), "utf8"), files[relative as keyof typeof files]);
      }
    }
    const dependencies = [{ name: "@prologue/sdk", version: "1.0.0", directory: path.join(source, "sdk"), nests: [] }];
    const digest = () => computeSourceContentDigest(source, dependencies, false);
    const before = await digest();
    await writeFile(path.join(source, "vendor/prologue-sdk/old.tgz"), "updated historical archive");
    await writeFile(path.join(source, "vendor/prologue-sdk/next.tgz"), "next source archive");
    assert.equal(await digest(), before, "unshipped archives must not replace an unchanged release");
    await writeFile(path.join(source, "sdk/dist/index.js"), "export const sdk = 'updated';");
    assert.notEqual(await digest(), before, "the actual bundled SDK must still trigger a release update");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
