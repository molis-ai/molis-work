import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkRuntimePayload } from "@molis-ai/molis-work-app-local-host";
import { verifyPluginPackageSignature } from "@molis-ai/molis-work-plugin-runtime";
import { checkNativePtyPrereqs, checkNodeVersion, runPreflight } from "../scripts/preflight-env.mjs";
import { newPublisher } from "./fixtures/sandbox-package.js";

const exec = promisify(execFile);

// CSL-03: both the Desktop payload and the installed release must be self-contained.
async function assertLicenseMaterials(directory: string): Promise<void> {
  const license = await readFile(join(process.cwd(), "LICENSE"), "utf8");
  const scope = join(directory, "node_modules", "@molis-ai");
  const packages = (await readdir(scope)).filter(name => name.startsWith("molis-work-"));
  assert.ok(packages.includes("molis-work-plugin-sdk"));
  for (const target of [directory, ...packages.map(name => join(scope, name))]) {
    const metadata = JSON.parse(await readFile(join(target, "package.json"), "utf8"));
    assert.equal(metadata.license, "SEE LICENSE IN LICENSE", target);
    assert.equal(await readFile(join(target, "LICENSE"), "utf8"), license, target);
    assert.ok((await lstat(join(target, "LICENSE"))).isFile(), target);
  }
}

test("real workspace payload installs offline from an unrelated directory and preserves vendor sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-payload-"));
  try {
    const payload = join(directory, "payload");
    const publisher = newPublisher();
    const keyFile = join(directory, "fixture-publisher.pem");
    await writeFile(keyFile, publisher.keys.privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600 });
    await exec(process.execPath, [
      join(process.cwd(), "apps", "desktop", "tooling", "prepare-runtime-payload.mjs"),
      process.cwd(), payload, process.execPath,
    ], { env: { ...process.env, MOLIS_WORK_RELEASE_PROFILE: "dev", MOLIS_WORK_DEV_PUBLISHER_KEY_FILE: keyFile } });
    const provenance = "vendor/intelligence-client/adeptify-intelligence-client-0.2.2.tgz.provenance.json";
    const sbom = "vendor/intelligence-client/sbom.cdx.json";
    for (const relative of [provenance, sbom, "LICENSE"]) {
      assert.deepEqual(await readFile(join(payload, relative)), await readFile(join(process.cwd(), relative)));
    }
    for (const [folder, archive] of [
      ["intelligence-client", "adeptify-intelligence-client-0.2.2.tgz"],
      ["search-evidence-layer", "adeptify-search-evidence-layer-0.4.1.tgz"],
    ]) {
      const vendor = join(payload, "vendor", folder!);
      const origin = JSON.parse(await readFile(join(vendor, `${archive}.provenance.json`), "utf8"));
      const bill = JSON.parse(await readFile(join(vendor, "sbom.cdx.json"), "utf8"));
      const bytes = await readFile(join(vendor, archive!));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), origin.artifact.sha256);
      assert.equal(bill.metadata.component.name, origin.package.name);
      assert.equal(bill.metadata.component.version, origin.package.version);
    }
    const marker = await readFile(join(payload, "release.json"));
    await assertLicenseMaterials(payload);
    await assert.rejects(createMolisWorkRuntimePayload({ sourceDirectory: process.cwd(), destinationDirectory: payload, nodeExecutablePath: process.execPath }), /输出已存在/);
    assert.deepEqual(await readFile(join(payload, "release.json")), marker);
    const home = join(directory, "home");
    const node = join(payload, "runtime", "node");
    const output = await exec(node, [join(payload, "dist", "cli", "main.js"), "install", "--source", payload, "--home", home, "--json"], {
      cwd: directory, env: { ...process.env, PATH: "/usr/bin:/bin", NODE_PATH: "" },
    });
    const installed = JSON.parse(output.stdout);
    assert.equal(installed.status, "installed");
    assert.deepEqual(await readFile(join(installed.release_directory, provenance)), await readFile(join(payload, provenance)));
    const bundledPlugin = "io.molis.work.content.design-accessibility";
    const installedPack = await readFile(join(installed.release_directory,
      "node_modules", "@molis-ai", "molis-work-app-local-host", "dist", "bundled-plugins", bundledPlugin + ".json"), "utf8");
    const { bundle, key_id } = verifyPluginPackageSignature(JSON.parse(installedPack));
    assert.equal(bundle.payload.manifest.plugin_id, bundledPlugin);
    assert.equal(key_id, publisher.identity);
    // The actual installed launcher must no longer need its source payload.
    await rm(payload, { recursive: true, force: true });
    await assertLicenseMaterials(installed.release_directory);
    const help = await exec(installed.launchers.cli, ["--help"], { cwd: directory, env: { ...process.env, PATH: "/usr/bin:/bin", NODE_PATH: "" } });
    assert.match(help.stdout, /molis-work plugin/);
    const moduleResult = await exec(join(installed.release_directory, "runtime", "node"), ["--input-type=module", "-e", `
      const { openSqliteConnection } = await import('@molis-ai/molis-work-storage');
      const db = openSqliteConnection(':memory:'); db.exec('CREATE TABLE probe(value TEXT)'); db.close();
      await import('node-pty');
      const { ProjectsModule } = await import('@molis-ai/molis-work-module-projects');
      console.log(JSON.stringify({ projectType: typeof ProjectsModule }));
    `], { cwd: installed.release_directory, env: { ...process.env, NODE_PATH: "" } });
    assert.deepEqual(JSON.parse(moduleResult.stdout), { projectType: "function" });
    assert.ok((await stat(join(installed.skill_directory, "molis-plugin-dev", "SKILL.md"))).isFile());
  } finally { await rm(directory, { recursive: true, force: true }); }
});

async function fixtureScopedRuntimeSource(root: string, version: string): Promise<{
  source: string;
  workspacePackage: string;
}> {
  const source = join(root, `source-${version}`);
  const dependencyDirectory = join(
    source,
    "node_modules",
    ".pnpm",
    "fixture-dependency@1.0.0",
    "node_modules",
    "fixture-dependency",
  );
  const workspacePackage = join(source, "apps", "desktop");
  const nativeDirectory = join(
    source,
    "node_modules",
    ".pnpm",
    "fixture-native@1.0.0",
    "node_modules",
    "fixture-native",
  );
  await Promise.all([
    mkdir(join(source, "dist", "cli"), { recursive: true }),
    mkdir(join(source, "dist", "mcp"), { recursive: true }),
    mkdir(join(source, "dist", "web"), { recursive: true }),
    mkdir(join(source, "skills", "molis-plugin-dev"), { recursive: true }),
    mkdir(dependencyDirectory, { recursive: true }),
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
    writeFile(join(source, "skills", "molis-plugin-dev", "SKILL.md"), "# Fixture Plugin Dev Skill\n"),
    writeFile(
      join(dependencyDirectory, "package.json"),
      JSON.stringify({ name: "fixture-dependency", version: "1.0.0", type: "module", exports: "./index.js" }),
    ),
    writeFile(join(dependencyDirectory, "index.js"), "export const marker = 'embedded';\n"),
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
    writeFile(join(workspacePackage, "dist", "index.js"), "export const shipped = 'workspace-dist';\n"),
    writeFile(join(workspacePackage, "methods", "industry-developer-tools.md"), "# shipped method\n"),
    writeFile(join(workspacePackage, "README.md"), "# desktop\n"),
    writeFile(join(workspacePackage, "src-tauri", "target", "cache.sentinel"), "build-cache\n"),
    writeFile(join(workspacePackage, "resources", "molis-work-runtime", "old-payload.sentinel"), "nested-old-payload\n"),
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
    writeFile(join(nativeDirectory, "build", "Release", "addon.node"), "native-binary"),
    writeFile(join(nativeDirectory, "src", "addon.cpp"), "// source\n"),
  ]);
  await symlink(".pnpm/fixture-dependency@1.0.0/node_modules/fixture-dependency", join(source, "node_modules", "fixture-dependency"), "dir");
  await symlink("../apps/desktop", join(source, "node_modules", "fixture-desktop"), "dir");
  await symlink(".pnpm/fixture-native@1.0.0/node_modules/fixture-native", join(source, "node_modules", "fixture-native"), "dir");
  return { source, workspacePackage };
}

test("runtime payload keeps declared workspace assets and native files, not desktop caches or nested payloads", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-payload-scope-"));
  try {
    const fixture = await fixtureScopedRuntimeSource(directory, "1.0.0");
    const payload = join(directory, "payload");
    const created = await createMolisWorkRuntimePayload({
      sourceDirectory: fixture.source,
      destinationDirectory: payload,
      nodeExecutablePath: process.execPath,
    });
    assert.equal(created.directory, payload);
    // CSL-03: a fixture without a declared license must not gain an invented grant.
    assert.equal(JSON.parse(await readFile(join(payload, "package.json"), "utf8")).license, undefined);
    const desktop = join(payload, "node_modules", "fixture-desktop");
    const native = join(payload, "node_modules", "fixture-native");
    assert.equal(await readFile(join(desktop, "dist", "index.js"), "utf8"), "export const shipped = 'workspace-dist';\n");
    assert.equal(await readFile(join(desktop, "methods", "industry-developer-tools.md"), "utf8"), "# shipped method\n");
    assert.equal(await readFile(join(native, "build", "Release", "addon.node"), "utf8"), "native-binary");
    await assert.rejects(stat(join(desktop, "src-tauri", "target", "cache.sentinel")));
    await assert.rejects(stat(join(desktop, "resources", "molis-work-runtime", "old-payload.sentinel")));
    const output = await exec(process.execPath, [join(payload, "dist", "cli", "main.js")], { cwd: payload });
    assert.equal(output.stdout.trim(), "cli:embedded:workspace-dist:native");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("failed payload preparation leaves an existing Desktop resource untouched", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-resource-"));
  try {
    const resources = join(directory, "resources");
    await mkdir(resources);
    await writeFile(join(resources, "existing"), "old working payload");
    await assert.rejects(exec(process.execPath, [
      join(process.cwd(), "apps", "desktop", "tooling", "prepare-runtime-payload.mjs"),
      join(directory, "missing-source"), resources, process.execPath,
    ]));
    assert.equal(await readFile(join(resources, "existing"), "utf8"), "old working payload");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("AC-T1-01 rejects Node outside the pinned minor version", async () => {
  const { engines } = JSON.parse(await readFile("package.json", "utf8"));
  const wrong = checkNodeVersion("24.22.0", engines.node);
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "node_version_mismatch");
  assert.match(wrong.message, /24\.22\.0.*24\.15\.x/);
  assert.deepEqual(checkNodeVersion("24.15.0", engines.node), { ok: true });
  assert.deepEqual(checkNodeVersion("24.15.11", engines.node), { ok: true });
  assert.equal(checkNodeVersion("24.16.0", engines.node).ok, false);
});

test("AC-T1-02 startup can warn on missing terminal tools or refuse strict mode", async () => {
  const repoRoot = await mkdtemp(join(tmpdir(), "molis-work-preflight-"));
  try {
    const missingTools = {
      platform: "linux",
      arch: "x64",
      repoRoot,
      hasCommand: (name: string) => name === "python3",
    };
    const missing = checkNativePtyPrereqs(missingTools);
    assert.equal(missing.ok, false);
    assert.deepEqual(missing.missing, ["make", "g++"]);
    await copyFile("package.json", join(repoRoot, "package.json"));
    const messages: string[] = [];
    const report = (message: string) => messages.push(message);
    assert.equal(runPreflight({ ...missingTools, report }), 0);
    assert.equal(runPreflight({ ...missingTools, strictNative: true, report }), 1);
    assert.deepEqual(messages.map(message => message.match(/^\[(.*?)\]/)?.[1]), [
      "native_toolchain_missing",
      "native_toolchain_missing",
    ]);

    await mkdir(join(repoRoot, "scripts"));
    for (const name of ["start.mjs", "preflight-env.mjs", "script-paths.mjs"]) {
      await copyFile(join("scripts", name), join(repoRoot, "scripts", name));
    }
    await assert.rejects(exec(process.execPath, [join(repoRoot, "scripts/start.mjs"), "--strict-native"], {
      cwd: repoRoot,
      env: { ...process.env, PATH: "" },
    }), { code: 1, stderr: /\[native_toolchain_missing\]/ });

    const prebuilt = join(repoRoot, "node_modules", "node-pty", "prebuilds", "linux-x64");
    await mkdir(prebuilt, { recursive: true });
    await writeFile(join(prebuilt, "pty.node"), "");
    assert.deepEqual(checkNativePtyPrereqs({
      ...missingTools,
      hasCommand: () => assert.fail("A prebuilt native module must bypass tool probes"),
    }), { ok: true, mode: "prebuilt" });
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("AC-T1-03 and AC-T1-04 load without node-pty and report its absence at terminal and CLI login use", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-without-node-pty-"));
  try {
    // Only resolve this executable; no CLI login process should be spawned.
    await writeFile(join(home, "gh"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await exec(process.execPath, ["--input-type=module", "-e", `
      import assert from "node:assert/strict";
      import { registerHooks } from "node:module";
      let loaded = 0;
      registerHooks({
        resolve(specifier, context, nextResolve) {
          if (specifier === "node-pty" || specifier === "node-pty/package.json") {
            loaded++;
            throw Object.assign(new Error("Fixture has no node-pty"), { code: "MODULE_NOT_FOUND" });
          }
          return nextResolve(specifier, context);
        },
      });
      await import("@molis-ai/molis-work-app-local-host");
      const { MolisWorkPtyHost } = await import("@molis-ai/molis-work-service-runtime-host");
      const { isPtyNativeAvailable } = await import("./horizontal/runtime-host/dist/adapters/terminal-pty.js");
      const terminal = new MolisWorkPtyHost({ onData() {}, onExit() {} });
      assert.equal(terminal.alive("demo"), false);
      assert.throws(() => terminal.spawn({ panelId: "demo" }), /缺少启动命令/);
      assert.equal(loaded, 0);
      assert.throws(() => terminal.spawn({
        panelId: "demo",
        command: process.execPath,
        cwd: process.env.MOLIS_WORK_HOME,
      }), /缺少终端原生组件/);
      assert.deepEqual(isPtyNativeAvailable(), {
        available: false,
        reason: "当前环境缺少终端原生组件，工作台的其他功能仍可使用。如需打开终端，请安装编译工具后重新构建，或使用预构建安装包。",
      });
      assert.equal(loaded, 1);

      const { ConnectorCliError, startCliLogin } = await import("./apps/local-host/dist/connector-cli.js");
      await assert.rejects(startCliLogin(process.env.MOLIS_WORK_HOME, "github"), error => {
        assert.ok(error instanceof ConnectorCliError);
        assert.match(error.message, /缺少终端原生组件.*交互式 CLI 登录/);
        return true;
      });
      assert.equal(loaded, 2);
    `], { env: { ...process.env, MOLIS_WORK_HOME: home, PATH: home, NODE_PATH: "" } });
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("AC-T1-05 pins the native terminal module as optional in all three manifests", async () => {
  for (const file of ["package.json", "apps/local-host/package.json", "horizontal/runtime-host/package.json"]) {
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (file === "package.json") {
      assert.deepEqual(manifest.devEngines.runtime, {
        name: "node",
        version: ">=24.15.0 <24.16.0",
        onFail: "error",
      });
    }
    assert.equal(manifest.optionalDependencies["node-pty"], "1.1.0", file);
    assert.equal(manifest.dependencies["node-pty"], undefined, file);
  }
});
