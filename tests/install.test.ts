import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, copyFile, lstat, mkdtemp, mkdir, readFile, readlink, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkHomeInstallError, installMolisWorkHome } from "@molis-ai/molis-work-app-local-host";
import { writeMolisWorkBuildManifest } from "@molis-ai/molis-work-app-local-host";

const execFileAsync = promisify(execFile);

async function fixtureSource(root: string, version: string): Promise<string> {
  const source = join(root, `source-${version}`);
  const dependencyDirectory = join(
    source,
    "node_modules",
    ".pnpm",
    "fixture-dependency@1.0.0",
    "node_modules",
    "fixture-dependency",
  );
  await Promise.all([
    mkdir(join(source, "dist", "cli"), { recursive: true }),
    mkdir(join(source, "dist", "mcp"), { recursive: true }),
    mkdir(join(source, "dist", "web"), { recursive: true }),
    mkdir(join(source, "skills", "goal-advance"), { recursive: true }),
    mkdir(join(source, "skills", "molis-plugin-dev"), { recursive: true }),
    mkdir(dependencyDirectory, { recursive: true }),
  ]);
  const fixtureEntry = (name: string) =>
    `import { marker } from "fixture-dependency";\nconsole.log("${name}:" + marker);\n`;
  await Promise.all([
    writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "fixture-molis-work",
        version,
        type: "module",
        dependencies: { "fixture-dependency": "1.0.0" },
      }),
    ),
    writeFile(join(source, "dist", "cli", "main.js"), fixtureEntry("cli")),
    writeFile(join(source, "dist", "mcp", "server.js"), fixtureEntry("mcp")),
    writeFile(join(source, "dist", "web", "server.js"), fixtureEntry("web")),
    writeFile(join(source, "skills", "goal-advance", "SKILL.md"), "# Fixture Skill\n"),
    writeFile(join(source, "skills", "molis-plugin-dev", "SKILL.md"), "# Fixture Plugin Dev Skill\n"),
    writeFile(
      join(dependencyDirectory, "package.json"),
      JSON.stringify({ name: "fixture-dependency", version: "1.0.0", type: "module", exports: "./index.js" }),
    ),
    writeFile(join(dependencyDirectory, "index.js"), "export const marker = 'embedded';\n"),
  ]);
  await symlink(
    ".pnpm/fixture-dependency@1.0.0/node_modules/fixture-dependency",
    join(source, "node_modules", "fixture-dependency"),
    "dir",
  );
  return source;
}

async function fixtureScopedRuntimeSource(root: string, version: string): Promise<{
  source: string;
  workspacePackage: string;
  cacheSentinel: string;
  payloadSentinel: string;
  shippedModule: string;
  shippedAsset: string;
  nativeBinary: string;
}> {
  const source = await fixtureSource(root, version);
  const workspacePackage = join(source, "apps", "desktop");
  const nativeDirectory = join(
    source,
    "node_modules",
    ".pnpm",
    "fixture-native@1.0.0",
    "node_modules",
    "fixture-native",
  );
  const cacheSentinel = join(workspacePackage, "src-tauri", "target", "cache.sentinel");
  const payloadSentinel = join(workspacePackage, "resources", "molis-work-runtime", "old-payload.sentinel");
  const shippedModule = join(workspacePackage, "dist", "index.js");
  const shippedAsset = join(workspacePackage, "methods", "industry-developer-tools.md");
  const nativeBinary = join(nativeDirectory, "build", "Release", "addon.node");
  await Promise.all([
    mkdir(join(workspacePackage, "dist"), { recursive: true }),
    mkdir(join(workspacePackage, "methods"), { recursive: true }),
    mkdir(join(workspacePackage, "src-tauri", "target"), { recursive: true }),
    mkdir(join(workspacePackage, "resources", "molis-work-runtime"), { recursive: true }),
    mkdir(join(nativeDirectory, "lib"), { recursive: true }),
    mkdir(join(nativeDirectory, "build", "Release"), { recursive: true }),
    mkdir(join(nativeDirectory, "src"), { recursive: true }),
  ]);
  const fixtureEntry = (name: string) =>
    `import { marker } from "fixture-dependency";\nimport { shipped } from "fixture-desktop";\nimport { nativeMarker } from "fixture-native";\nconsole.log("${name}:" + marker + ":" + shipped + ":" + nativeMarker);\n`;
  await Promise.all([
    writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "fixture-molis-work",
        version,
        type: "module",
        dependencies: {
          "fixture-dependency": "1.0.0",
          "fixture-desktop": "workspace:*",
          "fixture-native": "1.0.0",
        },
      }),
    ),
    writeFile(join(source, "dist", "cli", "main.js"), fixtureEntry("cli")),
    writeFile(join(source, "dist", "mcp", "server.js"), fixtureEntry("mcp")),
    writeFile(join(source, "dist", "web", "server.js"), fixtureEntry("web")),
    writeFile(
      join(workspacePackage, "package.json"),
      JSON.stringify({
        name: "fixture-desktop",
        version: "1.0.0",
        type: "module",
        exports: "./dist/index.js",
        files: ["dist", "methods", "README.md"],
      }),
    ),
    writeFile(shippedModule, "export const shipped = 'workspace-dist';\n"),
    writeFile(shippedAsset, "# shipped method\n"),
    writeFile(join(workspacePackage, "README.md"), "# desktop\n"),
    writeFile(cacheSentinel, "build-cache\n"),
    writeFile(payloadSentinel, "nested-old-payload\n"),
    writeFile(
      join(nativeDirectory, "package.json"),
      JSON.stringify({
        name: "fixture-native",
        version: "1.0.0",
        type: "module",
        exports: "./lib/index.js",
        files: ["src/**/*.[ch]pp", "lib/**"],
      }),
    ),
    writeFile(join(nativeDirectory, "lib", "index.js"), "export const nativeMarker = 'native';\n"),
    writeFile(nativeBinary, "native-binary"),
    writeFile(join(nativeDirectory, "src", "addon.cpp"), "// source\n"),
  ]);
  await symlink("../apps/desktop", join(source, "node_modules", "fixture-desktop"), "dir");
  await symlink(
    ".pnpm/fixture-native@1.0.0/node_modules/fixture-native",
    join(source, "node_modules", "fixture-native"),
    "dir",
  );
  return { source, workspacePackage, cacheSentinel, payloadSentinel, shippedModule, shippedAsset, nativeBinary };
}

async function withTemporaryDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-install-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("source and built CLI without --source use the product root even from another directory", async () => {
  await withTemporaryDirectory(async (directory) => {
    const productRoot = process.cwd();
    const home = join(directory, ".molis-work");
    const output = await execFileAsync(process.execPath, [
      join(productRoot, "dist", "cli", "main.js"), "install", "--home", home, "--json",
    ], { cwd: directory });
    const installed = JSON.parse(output.stdout);
    assert.equal(installed.status, "installed");
    const sourcePackage = JSON.parse(await readFile(join(productRoot, "package.json"), "utf8"));
    const installedPackage = JSON.parse(await readFile(join(installed.release_directory, "package.json"), "utf8"));
    assert.equal(installedPackage.name, "@molis-ai/molis-work-home-runtime");
    assert.equal(installedPackage.version, sourcePackage.version);
    assert.equal(await readFile(join(installed.release_directory, "dist", "cli", "main.js"), "utf8"),
      await readFile(join(productRoot, "dist", "cli", "main.js"), "utf8"));
    const help = await execFileAsync(installed.launchers.cli, ["--help"], { cwd: directory });
    assert.match(help.stdout, /Molis Work commands/);
    assert.match(help.stdout, /molis-work plugin/);
    const again = await execFileAsync(process.execPath, [
      "--import", import.meta.resolve("tsx"),
      join(productRoot, "apps", "desktop", "launchers", "cli", "main.ts"), "install", "--home", home, "--json",
    ], { cwd: directory });
    assert.equal(JSON.parse(again.stdout).status, "unchanged");
  });
});

test("home install is scoped, idempotent, and produces an owned release layout", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const projectFile = join(directory, "project", "important.txt");
    const runtimeConfig = join(directory, "runtime", "config.json");
    await mkdir(join(directory, "project"), { recursive: true });
    await mkdir(join(directory, "runtime"), { recursive: true });
    await writeFile(projectFile, "do-not-touch");
    await writeFile(runtimeConfig, "{\"runtime\":\"unchanged\"}");
    await mkdir(home, { recursive: true });
    await writeFile(join(home, "notes.txt"), "user-owned");
    await mkdir(join(home, "config", "postinstall-project-selections"), { recursive: true });
    await writeFile(join(home, "config", "postinstall-project-selections", "obsolete.json"), "{}\n");

    const first = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(first.status, "installed");
    assert.equal(first.runtime_layout, "self_contained");
    assert.match(first.next_steps.message, /没有创建项目/);
    assert.deepEqual(first.next_steps.web_command, [first.launchers.web, "--home", home]);
    assert.equal((await lstat(join(first.release_directory, "node_modules"))).isSymbolicLink(), false);
    assert.deepEqual(first.removed_paths, [join(home, "config", "postinstall-project-selections")]);
    await assert.rejects(stat(join(home, "config", "postinstall-project-selections")));
    assert.equal(await readFile(projectFile, "utf8"), "do-not-touch");
    assert.equal(await readFile(runtimeConfig, "utf8"), "{\"runtime\":\"unchanged\"}");
    assert.equal(await readFile(join(home, "notes.txt"), "utf8"), "user-owned");
    assert.ok((await stat(join(first.release_directory, "dist", "mcp", "server.js"))).isFile());
    assert.ok((await stat(join(first.skill_directory, "goal-advance", "SKILL.md"))).isFile());
    assert.ok((await stat(join(first.skill_directory, "molis-plugin-dev", "SKILL.md"))).isFile());
    assert.ok((await stat(first.launchers.mcp)).isFile());
    await assert.rejects(stat(join(home, "bin", "goalboard")));
    await assert.rejects(stat(join(home, "bin", "goalboard-mcp")));
    await assert.rejects(stat(join(home, "bin", "goalboard-web")));

    const second = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(second.status, "unchanged");
    assert.deepEqual(second.written_paths, []);
  });
});

test("home install rejects a source missing the plugin-dev skill", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    await rm(join(source, "skills", "molis-plugin-dev"), { recursive: true, force: true });
    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: join(directory, "home", ".molis-work"), sourceDirectory: source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError &&
        error.code === "source.asset_missing" &&
        /skills\/molis-plugin-dev\/SKILL\.md/.test(error.message),
    );
  });
});

test("plugin-dev skill is published under skills and linked from Cursor", async () => {
  const canonical = join(process.cwd(), "skills", "molis-plugin-dev");
  const cursor = join(process.cwd(), ".cursor", "skills", "molis-plugin-dev");
  for (const file of ["SKILL.md", "elements.md", "ui.md", "examples.md", "host.md", "authoring.md", "integrations.md"]) {
    assert.ok((await stat(join(canonical, file))).isFile(), file);
  }
  assert.ok((await lstat(cursor)).isSymbolicLink());
  assert.equal(await readlink(cursor), "../../skills/molis-plugin-dev");
});

test("same-version content changes refresh atomically and identical content stays unchanged", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const projectData = join(home, "projects", "user-project.db");
    const first = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    await writeFile(projectData, "user-data");
    const oldCli = await readFile(join(first.release_directory, "dist", "cli", "main.js"), "utf8");
    const oldInstall = await readFile(join(home, "config", "installation.json"), "utf8");

    await writeFile(join(source, "dist", "cli", "main.js"), "#!/usr/bin/env node\nconsole.log(\"refreshed\");\n");
    await assert.rejects(
      installMolisWorkHome({
        homeDirectory: home,
        sourceDirectory: source,
        beforeStep(step) {
          if (step === "before_write_install_manifest") throw new Error("refresh manifest failure");
        },
      }),
      /refresh manifest failure/,
    );
    assert.equal(await readFile(join(first.release_directory, "dist", "cli", "main.js"), "utf8"), oldCli);
    assert.equal(await readFile(join(home, "config", "installation.json"), "utf8"), oldInstall);
    assert.equal(await readFile(projectData, "utf8"), "user-data");

    const refreshed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(refreshed.status, "refreshed");
    assert.match(await readFile(join(refreshed.release_directory, "dist", "cli", "main.js"), "utf8"), /refreshed/);
    const releaseManifest = JSON.parse(
      await readFile(join(refreshed.release_directory, "release.json"), "utf8"),
    ) as { content_digest?: string };
    const installManifest = JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as {
      content_digest?: string;
    };
    assert.match(releaseManifest.content_digest ?? "", /^[0-9a-f]{64}$/);
    assert.equal(installManifest.content_digest, releaseManifest.content_digest);
    assert.equal((await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source })).status, "unchanged");
    assert.equal(await readFile(projectData, "utf8"), "user-data");
  });
});

test("repository sources require a current build fingerprint and local install always builds first", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    await mkdir(join(source, "src"), { recursive: true });
    await writeFile(join(source, "src", "entry.ts"), "export const value = 1;\n");
    await writeFile(join(source, "tsconfig.json"), "{}\n");
    await writeMolisWorkBuildManifest(source);
    const home = join(directory, "home", ".molis-work");
    const installed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(installed.status, "installed");

    await writeFile(join(source, "src", "entry.ts"), "export const value = 2;\n");
    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: home, sourceDirectory: source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError
        && error.code === "source.build_stale"
        && /pnpm install:local/.test(error.message),
    );
    assert.ok((await stat(join(installed.release_directory, "dist", "cli", "main.js"))).isFile());

    const packageMetadata = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    assert.match(packageMetadata.scripts?.["install:local"] ?? "", /^pnpm build && /);
  });
});

test("workspace source changes reject an old build before touching the installed release, while generated files are not source inputs", async () => {
  await withTemporaryDirectory(async directory => {
    const source = await fixtureSource(directory, "1.0.0");
    const workspace = join(source, "apps", "local-host");
    const launchers = join(source, "apps", "desktop", "launchers");
    const sdk = join(workspace, "sdk");
    await mkdir(launchers, { recursive: true });
    await mkdir(sdk, { recursive: true });
    await mkdir(join(workspace, "src"), { recursive: true });
    await mkdir(join(workspace, "dist"), { recursive: true });
    await mkdir(join(workspace, "node_modules"), { recursive: true });
    const launcherSource = join(launchers, "entry.ts");
    const sdkSource = join(sdk, "index.ts");
    const sdkConfig = join(source, "tsconfig.sdk.json");
    await writeFile(launcherSource, "export const root = 1;\n");
    await writeFile(sdkSource, "export const sdk = 1;\n");
    await writeFile(sdkConfig, "{}\n");
    await writeFile(join(source, "tsconfig.json"), "{}\n");
    await writeFile(join(source, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n");
    await writeFile(join(workspace, "package.json"), '{"name":"fixture-workspace","version":"1.0.0"}\n');
    await writeFile(join(workspace, "tsconfig.json"), "{}\n");
    const workspaceSource = join(workspace, "src", "entry.ts");
    await writeFile(workspaceSource, "export const implementation = 1;\n");
    await writeMolisWorkBuildManifest(source);
    const home = join(directory, "home");
    const installed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    const installationPath = join(home, "config", "installation.json");
    const before = await readFile(installationPath, "utf8");
    const launcherBefore = await readFile(installed.launchers.cli, "utf8");
    await writeFile(join(workspace, "dist", "entry.js"), "generated output\n");
    await writeFile(join(workspace, "node_modules", "generated.txt"), "package manager output\n");
    assert.equal((await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source })).status, "unchanged");

    for (const changedInput of [workspaceSource, launcherSource, sdkSource, sdkConfig]) {
      const original = await readFile(changedInput, "utf8");
      await writeFile(changedInput, original + "\n// changed source input\n");
      await assert.rejects(installMolisWorkHome({ homeDirectory: home, sourceDirectory: source }),
        (error: unknown) => error instanceof MolisWorkHomeInstallError && error.code === "source.build_stale");
      assert.equal(await readFile(installationPath, "utf8"), before);
      assert.equal(await readFile(installed.launchers.cli, "utf8"), launcherBefore);
      await writeFile(changedInput, original);
    }
    await writeFile(workspaceSource, "export const implementation = 2;\n");
    const execution = await execFileAsync(installed.launchers.cli, []);
    assert.match(execution.stdout, /cli:embedded/, "the old installation remains runnable after rejection");
    await writeMolisWorkBuildManifest(source);
    assert.equal((await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source })).status, "refreshed");
  });
});

test("upgrade failure rolls back the new release and leaves project data and current release intact", async () => {
  await withTemporaryDirectory(async (directory) => {
    const sourceOne = await fixtureSource(directory, "1.0.0");
    const sourceTwo = await fixtureSource(directory, "2.0.0");
    const home = join(directory, "home", ".molis-work");
    await installMolisWorkHome({ homeDirectory: home, sourceDirectory: sourceOne });
    const database = join(home, "projects", "existing.db");
    await writeFile(database, "existing-project-data");

    await assert.rejects(
      () =>
        installMolisWorkHome({
          homeDirectory: home,
          sourceDirectory: sourceTwo,
          beforeStep(step) {
            if (step === "before_write_install_manifest") throw new Error("injected failure");
          },
        }),
      /injected failure/,
    );

    const current = JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string };
    assert.equal(current.version, "1.0.0");
    assert.equal(await readFile(database, "utf8"), "existing-project-data");
    await assert.rejects(stat(join(home, "releases", "molis-work-2.0.0")));

    const upgraded = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: sourceTwo });
    assert.equal(upgraded.status, "upgraded");
    assert.match(upgraded.next_steps.message, /needs_repair/);
    assert.match(upgraded.next_steps.message, /service_install_command/);
    assert.match(upgraded.next_steps.message, /service_restart_command/);
    assert.equal(
      (JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string }).version,
      "2.0.0",
    );
  });
});

test("repair replaces a broken owned release without changing its current version", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const first = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    await rm(join(first.release_directory, "dist", "cli", "main.js"));

    const repaired = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(repaired.status, "repaired");
    assert.ok((await stat(join(repaired.release_directory, "dist", "cli", "main.js"))).isFile());
    assert.equal(
      (JSON.parse(await readFile(join(home, "config", "installation.json"), "utf8")) as { version: string }).version,
      "1.0.0",
    );
  });
});

test("repair upgrades the obsolete linked release layout in place", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const first = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    await rm(join(first.release_directory, "node_modules"), { recursive: true, force: true });
    await symlink(join(source, "node_modules"), join(first.release_directory, "node_modules"), "dir");
    await writeFile(
      join(first.release_directory, "release.json"),
      `${JSON.stringify({
        schema_version: 1,
        installer: "molis-work-home-install-v1",
        version: "1.0.0",
        source_directory: source,
        created_at: "2026-08-16T00:00:00.000Z",
      }, null, 2)}\n`,
    );

    const repaired = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.equal(repaired.status, "repaired");
    assert.equal((await lstat(join(repaired.release_directory, "node_modules"))).isSymbolicLink(), false);
    const manifest = JSON.parse(await readFile(join(repaired.release_directory, "release.json"), "utf8")) as {
      schema_version: number;
      dependencies: string;
      source_directory?: string;
    };
    assert.equal(manifest.schema_version, 4);
    assert.equal(manifest.dependencies, "embedded");
    assert.equal(manifest.source_directory, undefined);
  });
});

test("home install refuses to overwrite unknown launcher files", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const unknownLauncher = join(home, "bin", "molis-work-mcp");
    await mkdir(join(home, "bin"), { recursive: true });
    await writeFile(unknownLauncher, "user launcher");

    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: home, sourceDirectory: source }),
      (error: unknown) => error instanceof MolisWorkHomeInstallError && error.code === "home.unknown_file",
    );
    assert.equal(await readFile(unknownLauncher, "utf8"), "user launcher");
  });
});

test("home install rejects dependency links that would escape the installed release", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const externalDependency = join(directory, "external-dependency");
    await mkdir(externalDependency, { recursive: true });
    await symlink(
      externalDependency,
      join(
        source,
        "node_modules",
        ".pnpm",
        "fixture-dependency@1.0.0",
        "node_modules",
        "fixture-dependency",
        "external-dependency",
      ),
      "dir",
    );

    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: join(directory, "home", ".molis-work"), sourceDirectory: source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError &&
        error.code === "source.invalid" &&
        /指向安装 release 外部/.test(error.message),
    );
  });
});

test("home install flattens transitive workspace dependencies without copying package-manager links", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const dependencyDirectory = await realpath(join(source, "node_modules", "fixture-dependency"));
    const transitiveDirectory = join(
      source,
      "node_modules",
      ".pnpm",
      "fixture-transitive@1.0.0",
      "node_modules",
      "fixture-transitive",
    );
    await Promise.all([
      mkdir(join(dependencyDirectory, "node_modules"), { recursive: true }),
      mkdir(transitiveDirectory, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(dependencyDirectory, "package.json"),
        JSON.stringify({
          name: "fixture-dependency",
          version: "1.0.0",
          type: "module",
          exports: "./index.js",
          dependencies: { "fixture-transitive": "1.0.0" },
        }),
      ),
      writeFile(
        join(dependencyDirectory, "index.js"),
        "import { suffix } from 'fixture-transitive';\nexport const marker = 'embedded-' + suffix;\n",
      ),
      writeFile(
        join(transitiveDirectory, "package.json"),
        JSON.stringify({ name: "fixture-transitive", version: "1.0.0", type: "module", exports: "./index.js" }),
      ),
      writeFile(join(transitiveDirectory, "index.js"), "export const suffix = 'transitive';\n"),
    ]);
    await symlink(
      transitiveDirectory,
      join(dependencyDirectory, "node_modules", "fixture-transitive"),
      "dir",
    );

    const installed = await installMolisWorkHome({
      homeDirectory: join(directory, "home", ".molis-work"),
      sourceDirectory: source,
    });
    await assert.rejects(stat(join(installed.release_directory, "node_modules", "fixture-dependency", "node_modules")));
    assert.ok((await stat(join(installed.release_directory, "node_modules", "fixture-transitive", "index.js"))).isFile());
    const output = await execFileAsync(process.execPath, [installed.launchers.cli], { cwd: directory });
    assert.equal(output.stdout.trim(), "cli:embedded-transitive");
  });
});

test("home install resolves production dependencies from a standard ancestor node_modules", async () => {
  await withTemporaryDirectory(async (directory) => {
    const packageDirectory = join(directory, "runtime", "node_modules", "fixture-molis-work");
    const dependencyDirectory = join(directory, "runtime", "node_modules", "fixture-dependency");
    await Promise.all([
      mkdir(join(packageDirectory, "dist", "cli"), { recursive: true }),
      mkdir(join(packageDirectory, "dist", "mcp"), { recursive: true }),
      mkdir(join(packageDirectory, "dist", "web"), { recursive: true }),
      mkdir(join(packageDirectory, "skills", "goal-advance"), { recursive: true }),
      mkdir(join(packageDirectory, "skills", "molis-plugin-dev"), { recursive: true }),
      mkdir(dependencyDirectory, { recursive: true }),
    ]);
    const fixtureEntry = (name: string) =>
      `import { marker } from "fixture-dependency";\nconsole.log("${name}:" + marker);\n`;
    await Promise.all([
      writeFile(
        join(packageDirectory, "package.json"),
        JSON.stringify({
          name: "fixture-molis-work",
          version: "1.0.0",
          type: "module",
          dependencies: { "fixture-dependency": "1.0.0" },
        }),
      ),
      writeFile(join(packageDirectory, "dist", "cli", "main.js"), fixtureEntry("cli")),
      writeFile(join(packageDirectory, "dist", "mcp", "server.js"), fixtureEntry("mcp")),
      writeFile(join(packageDirectory, "dist", "web", "server.js"), fixtureEntry("web")),
      writeFile(join(packageDirectory, "skills", "goal-advance", "SKILL.md"), "# Fixture Skill\n"),
      writeFile(join(packageDirectory, "skills", "molis-plugin-dev", "SKILL.md"), "# Fixture Plugin Dev Skill\n"),
      writeFile(
        join(dependencyDirectory, "package.json"),
        JSON.stringify({ name: "fixture-dependency", version: "1.0.0", type: "module", exports: "./index.js" }),
      ),
      writeFile(join(dependencyDirectory, "index.js"), "export const marker = 'ancestor';\n"),
    ]);

    const home = join(directory, "home", ".molis-work");
    const installed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: packageDirectory });
    await rm(join(directory, "runtime"), { recursive: true, force: true });

    for (const [name, launcher] of Object.entries(installed.launchers)) {
      const output = await execFileAsync(process.execPath, [launcher], { cwd: directory });
      assert.equal(output.stdout.trim(), `${name}:ancestor`);
    }
  });
});

test("home install rejects a declared production dependency that cannot be resolved", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    await writeFile(
      join(source, "package.json"),
      JSON.stringify({
        name: "fixture-molis-work",
        version: "1.0.0",
        type: "module",
        dependencies: { "missing-fixture-dependency": "1.0.0" },
      }),
    );

    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: join(directory, "home", ".molis-work"), sourceDirectory: source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError &&
        error.code === "source.asset_missing" &&
        /missing-fixture-dependency/.test(error.message),
    );
  });
});

test("all installed launchers keep running after the installation source is deleted", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const result = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    await rm(source, { recursive: true, force: true });

    for (const [name, launcher] of Object.entries(result.launchers)) {
      const output = await execFileAsync(process.execPath, [launcher], { cwd: directory });
      assert.equal(output.stdout.trim(), `${name}:embedded`);
    }
  });
});

test("installed MCP launcher preserves the Runtime caller workspace", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "home", ".molis-work");
    const runtimeWorkspace = join(directory, "runtime-workspace");
    await mkdir(runtimeWorkspace, { recursive: true });
    await writeFile(
      join(source, "dist", "mcp", "server.js"),
      "console.log(JSON.stringify({ cwd: process.cwd(), pwd: process.env.PWD }));\n",
    );

    const installed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    const output = await execFileAsync(process.execPath, [installed.launchers.mcp], { cwd: runtimeWorkspace });

    assert.deepEqual(JSON.parse(output.stdout.trim()), {
      cwd: await realpath(runtimeWorkspace),
      pwd: await realpath(runtimeWorkspace),
    });
  });
});

test("only the bundled Web launcher exports its LaunchAgent process identity", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const bundledNode = join(source, "runtime", "node");
    await mkdir(join(source, "runtime"), { recursive: true });
    await copyFile(process.execPath, bundledNode);
    await chmod(bundledNode, 0o755);
    const result = await installMolisWorkHome({
      homeDirectory: join(directory, "home", ".molis-work"),
      sourceDirectory: source,
    });

    const webLauncher = await readFile(result.launchers.web, "utf8");
    assert.match(webLauncher, /exec \/usr\/bin\/env MOLIS_WORK_WEB_SERVICE_PROCESS_ID=\$\$/);
    assert.doesNotMatch(await readFile(result.launchers.cli, "utf8"), /MOLIS_WORK_WEB_SERVICE_PROCESS_ID/);
    assert.doesNotMatch(await readFile(result.launchers.mcp, "utf8"), /MOLIS_WORK_WEB_SERVICE_PROCESS_ID/);
  });
});

test("bundled Node launchers use the installed runtime when PATH has no Node", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const bundledNode = join(source, "runtime", "node");
    await mkdir(join(source, "runtime"), { recursive: true });
    const hostNode = `'${process.execPath.replaceAll("'", `'\"'\"'`)}'`;
    await writeFile(bundledNode, `#!/bin/sh\nexec ${hostNode} \"$@\"\n`);
    await chmod(bundledNode, 0o755);
    const home = join(directory, "home", ".molis-work");
    const result = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: source });
    assert.ok((await stat(join(result.release_directory, "runtime", "node"))).isFile());
    assert.match(await readFile(result.launchers.cli, "utf8"), /^#!\/bin\/sh\n# molis-work-home-launcher-v2/);
    const releaseManifest = JSON.parse(
      await readFile(join(result.release_directory, "release.json"), "utf8"),
    ) as { node_runtime?: string };
    assert.equal(releaseManifest.node_runtime, "embedded");

    await rm(source, { recursive: true, force: true });
    for (const [name, launcher] of Object.entries(result.launchers)) {
      const output = await execFileAsync(launcher, [], {
        cwd: directory,
        env: { ...process.env, PATH: "/usr/bin:/bin" },
      });
      assert.equal(output.stdout.trim(), `${name}:embedded`);
    }
  });
});

test("public install command is human-readable by default and JSON when requested", async () => {
  await withTemporaryDirectory(async (directory) => {
    const source = await fixtureSource(directory, "1.0.0");
    const home = join(directory, "custom-home", ".molis-work");
    const projectFile = join(directory, "project", "unchanged.txt");
    await mkdir(join(directory, "project"), { recursive: true });
    await writeFile(projectFile, "unchanged");

    const output = await execFileAsync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "install", "--home", home, "--source", source],
      { cwd: directory },
    );
    assert.match(output.stdout, /Molis Work 安装完成/);
    assert.match(output.stdout, /没有创建项目，也没有修改 Runtime 配置或用户项目文件/);
    assert.doesNotMatch(output.stdout, /^\s*\{/);

    const jsonOutput = await execFileAsync(
      process.execPath,
      [join(process.cwd(), "dist", "cli", "main.js"), "install", "--home", home, "--source", source, "--json"],
      { cwd: directory },
    );
    const result = JSON.parse(jsonOutput.stdout) as {
      home_directory: string;
      status: string;
      runtime_layout: string;
      next_steps: { web_command: string[] };
    };
    assert.equal(result.home_directory, home);
    assert.equal(result.status, "unchanged");
    assert.equal(result.runtime_layout, "self_contained");
    assert.deepEqual(result.next_steps.web_command, [join(home, "bin", "molis-work-web"), "--home", home]);
    assert.equal(await readFile(projectFile, "utf8"), "unchanged");
  });
});

test("home install copies declared workspace assets and native files, not excluded caches or nested payloads", async () => {
  await withTemporaryDirectory(async (directory) => {
    const fixture = await fixtureScopedRuntimeSource(directory, "1.0.0");
    const external = join(directory, "outside-cache");
    await mkdir(external, { recursive: true });
    await writeFile(join(external, "secret.txt"), "not-in-release");
    await symlink(external, join(fixture.workspacePackage, "src-tauri", "target", "escape"), "dir");
    const home = join(directory, "home", ".molis-work");
    const first = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixture.source });
    assert.equal(first.status, "installed");
    const installedDesktop = join(first.release_directory, "node_modules", "fixture-desktop");
    const installedNative = join(first.release_directory, "node_modules", "fixture-native");
    assert.equal(await readFile(join(installedDesktop, "dist", "index.js"), "utf8"), "export const shipped = 'workspace-dist';\n");
    assert.equal(await readFile(join(installedDesktop, "methods", "industry-developer-tools.md"), "utf8"), "# shipped method\n");
    assert.equal(await readFile(join(installedNative, "build", "Release", "addon.node"), "utf8"), "native-binary");
    assert.equal(await readFile(join(installedNative, "lib", "index.js"), "utf8"), "export const nativeMarker = 'native';\n");
    await assert.rejects(stat(join(installedDesktop, "src-tauri", "target", "cache.sentinel")));
    await assert.rejects(stat(join(installedDesktop, "resources", "molis-work-runtime", "old-payload.sentinel")));
    const output = await execFileAsync(process.execPath, [first.launchers.cli], { cwd: directory });
    assert.equal(output.stdout.trim(), "cli:embedded:workspace-dist:native");

    await writeFile(fixture.cacheSentinel, "changed-build-cache\n");
    await writeFile(fixture.payloadSentinel, "changed-nested-payload\n");
    assert.equal((await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixture.source })).status, "unchanged");
    assert.equal(await readFile(join(installedDesktop, "dist", "index.js"), "utf8"), "export const shipped = 'workspace-dist';\n");

    await writeFile(fixture.shippedModule, "export const shipped = 'workspace-refreshed';\n");
    const refreshed = await installMolisWorkHome({ homeDirectory: home, sourceDirectory: fixture.source });
    assert.equal(refreshed.status, "refreshed");
    assert.equal(
      await readFile(join(refreshed.release_directory, "node_modules", "fixture-desktop", "dist", "index.js"), "utf8"),
      "export const shipped = 'workspace-refreshed';\n",
    );
    const refreshedOutput = await execFileAsync(process.execPath, [refreshed.launchers.cli], { cwd: directory });
    assert.equal(refreshedOutput.stdout.trim(), "cli:embedded:workspace-refreshed:native");
  });
});

test("home install fails when a workspace package is missing declared files or uses unsupported globs", async () => {
  await withTemporaryDirectory(async (directory) => {
    const missing = await fixtureScopedRuntimeSource(directory, "1.0.0");
    await rm(join(missing.workspacePackage, "methods"), { recursive: true, force: true });
    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: join(directory, "home-missing"), sourceDirectory: missing.source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError
        && error.code === "source.asset_missing"
        && /Missing release asset in fixture-desktop: methods/.test(error.message),
    );

    const globs = await fixtureScopedRuntimeSource(directory, "1.0.1");
    await writeFile(
      join(globs.workspacePackage, "package.json"),
      JSON.stringify({
        name: "fixture-desktop",
        version: "1.0.0",
        type: "module",
        exports: "./dist/index.js",
        files: ["dist/**", "methods", "README.md"],
      }),
    );
    await assert.rejects(
      () => installMolisWorkHome({ homeDirectory: join(directory, "home-globs"), sourceDirectory: globs.source }),
      (error: unknown) =>
        error instanceof MolisWorkHomeInstallError
        && error.code === "source.invalid"
        && /Unsupported release files entry in fixture-desktop: dist\/\*\*/.test(error.message),
    );
  });
});
