import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createMolisWorkRuntimePayload } from "@molis-ai/molis-work-app-local-host";

const exec = promisify(execFile);

test("real workspace payload installs offline from an unrelated directory and preserves vendor sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "molis-work-runtime-payload-"));
  try {
    const payload = join(directory, "payload");
    await exec(process.execPath, [
      join(process.cwd(), "apps", "desktop", "tooling", "prepare-runtime-payload.mjs"),
      process.cwd(), payload, process.execPath,
    ]);
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
    // The actual installed launcher must no longer need its source payload.
    await rm(payload, { recursive: true, force: true });
    const help = await exec(installed.launchers.cli, ["--help"], { cwd: directory, env: { ...process.env, PATH: "/usr/bin:/bin", NODE_PATH: "" } });
    assert.match(help.stdout, /molis-work plugin/);
    const moduleResult = await exec(join(installed.release_directory, "runtime", "node"), ["--input-type=module", "-e", `
      const { default: Database } = await import('better-sqlite3');
      const db = new Database(':memory:'); db.exec('CREATE TABLE probe(value TEXT)'); db.close();
      await import('node-pty');
      const { ProjectsModule } = await import('@molis-ai/molis-work-module-projects');
      const { loadBuiltinPlanningMethodPacks } = await import('@molis-ai/molis-work-module-goals');
      const developerMethod = loadBuiltinPlanningMethodPacks().find(method => method.method_id === 'industry-developer-tools');
      console.log(JSON.stringify({ projectType: typeof ProjectsModule, method: developerMethod?.name }));
    `], { cwd: installed.release_directory, env: { ...process.env, NODE_PATH: "" } });
    assert.deepEqual(JSON.parse(moduleResult.stdout), { projectType: "function", method: "开发者工具" });
    const methodPath = "industries/industry-developer-tools.md";
    assert.deepEqual(await readFile(join(installed.skill_directory, "goal-advance", "methods", methodPath)),
      await readFile(join(process.cwd(), "modules", "goals", "methods", methodPath)));
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
    mkdir(join(source, "skills", "goal-advance"), { recursive: true }),
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
    writeFile(join(source, "skills", "goal-advance", "SKILL.md"), "# Fixture Skill\n"),
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
