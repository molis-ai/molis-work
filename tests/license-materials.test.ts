import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("CSL-02 first-party packages carry regular license copies matching the single root text", async () => {
  const root = process.cwd();
  const license = path.join(root, "LICENSE");
  const text = await readFile(license, "utf8");
  assert.match(text, /^Molis AI Cooperation Source License\n/);
  const files = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" })
    .split("\0").filter(file => path.basename(file) === "package.json" && !file.startsWith("vendor/"));
  assert.ok(files.includes("package.json") && files.includes("packages/plugin-sdk/package.json"));
  for (const file of files) {
    const metadata = JSON.parse(await readFile(path.join(root, file), "utf8"));
    assert.equal(metadata.license, "SEE LICENSE IN LICENSE", file);
    const copy = path.join(root, path.dirname(file), "LICENSE");
    assert.equal(await readFile(copy, "utf8"), text, file);
    assert.ok((await lstat(copy)).isFile(), file);
  }
  const cargo = await readFile(path.join(root, "apps/desktop/src-tauri/Cargo.toml"), "utf8");
  const licenseFile = cargo.match(/^license-file = "([^"]+)"$/m)?.[1];
  assert.ok(licenseFile);
  assert.equal(await realpath(path.join(root, "apps/desktop/src-tauri", licenseFile)), license);
});

test("CSL-03 independently packed contracts and SDK carry the complete license as a regular file", async () => {
  const root = process.cwd();
  const directory = await mkdtemp(path.join(tmpdir(), "molis-license-pack-"));
  try {
    const license = await readFile(path.join(root, "LICENSE"), "utf8");
    for (const name of ["contracts", "plugin-sdk"]) {
      execFileSync("pnpm", ["--dir", path.join(root, "packages", name), "pack", "--pack-destination", directory, "--json"], { encoding: "utf8" });
      const archive = path.join(directory, `molis-ai-molis-work-${name}-0.0.0.tgz`);
      const contents = (file: string) => execFileSync("tar", ["-xOf", archive, `package/${file}`], { encoding: "utf8" });
      assert.equal(contents("LICENSE"), license);
      assert.equal(JSON.parse(contents("package.json")).license, "SEE LICENSE IN LICENSE");
      const entry = execFileSync("tar", ["-tvf", archive, "package/LICENSE"], { encoding: "utf8" });
      assert.match(entry, /^-/); // A package must not retain a link outside the archive.
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
