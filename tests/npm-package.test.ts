import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { createMolisWorkNpmPackageDirectory } from "@molis-ai/molis-work-app-local-host";

const exec = promisify(execFile);

test("npm staging packs workspace assets without host binaries or modifying the source manifest", async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), "molis-work-npm-package-test-"));
  const source = process.cwd();
  const manifestBefore = await readFile(path.join(source, "package.json"));
  try {
    const output = path.join(temporary, "package");
    await createMolisWorkNpmPackageDirectory({ sourceDirectory: source, destinationDirectory: output });
    assert.deepEqual(await readFile(path.join(source, "package.json")), manifestBefore);
    const published = await readFile(path.join(output, "package.json"));
    await assert.rejects(createMolisWorkNpmPackageDirectory({ sourceDirectory: source, destinationDirectory: output }), /输出已存在/);
    assert.deepEqual(await readFile(path.join(output, "package.json")), published);
    const { stdout } = await exec("npm", ["pack", "--ignore-scripts", "--json", "--cache", path.join(temporary, "cache")], { cwd: output, maxBuffer: 8 * 1024 * 1024 });
    const [packed] = JSON.parse(stdout);
    const files = new Set<string>(packed.files.map((file: { path: string }) => file.path));
    assert.ok(files.has("node_modules/@molis-ai/molis-work-module-goals/methods/industries/industry-developer-tools.md"));
    assert.ok(files.has("node_modules/@molis-ai/molis-work-plugin-cli/bin/molis-work-plugin.mjs"));
    assert.ok(files.has("dist/cli/main.js"));
    assert.ok(files.has("skills/goal-advance/SKILL.md"));
    assert.ok(files.has("skills/molis-plugin-dev/SKILL.md"));
    assert.ok(files.has("skills/molis-plugin-dev/elements.md"));
    assert.ok(files.has("skills/molis-plugin-dev/ui.md"));
    assert.ok(files.has("skills/molis-plugin-dev/examples.md"));
    assert.ok(files.has("skills/molis-plugin-dev/host.md"));
    assert.ok(files.has("skills/molis-plugin-dev/authoring.md"));
    assert.ok(files.has("skills/molis-plugin-dev/integrations.md"));
    assert.ok(files.has("vendor/search-evidence-layer/sbom.cdx.json"));
    assert.ok(files.has("vendor/prologue-sdk/README.md"));
    assert.ok(files.has("node_modules/@prologue/sdk/package.json"));
    assert.ok(packed.bundled.includes("@prologue/sdk"));
    assert.equal([...files].some(file => file.startsWith("vendor/prologue-sdk/") && file.endsWith(".tgz")), false);
    const desktopPrefix = "node_modules/@molis-ai/molis-work-app-desktop/";
    assert.ok(files.has(`${desktopPrefix}dist/index.js`));
    for (const file of files) {
      assert.doesNotMatch(file, /\.node$|spawn-helper$|node_modules\/(?:better-sqlite3|node-pty)\//);
      if (file === desktopPrefix.slice(0, -1) || file.startsWith(desktopPrefix)) {
        assert.ok(
          file === `${desktopPrefix}package.json`
            || file === `${desktopPrefix}README.md`
            || file === `${desktopPrefix}LICENSE`
            || file.startsWith(`${desktopPrefix}dist/`),
          file,
        );
      }
    }
    assert.ok(packed.bundled.includes("@molis-ai/molis-work-module-goals"));
    for (const name of packed.bundled) {
      const metadata = JSON.parse(await readFile(path.join(output, "node_modules", name, "package.json"), "utf8"));
      for (const spec of Object.values({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
        assert.doesNotMatch(String(spec), /^(workspace|file):/);
      }
    }
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
