// Explicit release check: node tests/npm-distribution-smoke.mjs /absolute/npm-consumer
// The consumer must have installed the real tgz with normal npm install scripts.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const consumer = path.resolve(process.argv[2]);
const product = path.join(consumer, "node_modules", "@molis-ai", "molis-work");
const temporary = await mkdtemp(path.join(tmpdir(), "molis-work-npm-smoke-"));
const home = path.join(temporary, "home");
const environment = { ...process.env, HOME: temporary, MOLIS_WORK_HOME: home, NODE_PATH: "" };
const cli = path.join(consumer, "node_modules", ".bin", "molis-work");
const run = (command, args, cwd = temporary) => exec(command, args, { cwd, env: environment, timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
try {
  assert.match((await run(cli, ["--help"])).stdout, /molis-work plugin/);
  const manifest = JSON.parse(await readFile(path.join(product, "package.json"), "utf8"));
  assert.ok(!manifest.bundledDependencies.includes("better-sqlite3"));
  assert.ok(!manifest.bundledDependencies.includes("node-pty"));
  for (const directory of [product, ...manifest.bundledDependencies.map(name => path.join(product, "node_modules", name))]) {
    const metadata = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
    for (const spec of Object.values({ ...metadata.dependencies, ...metadata.optionalDependencies })) {
      assert.doesNotMatch(spec, /^(workspace|file):/);
    }
  }
  const probe = `
    import assert from 'node:assert/strict';
    import Database from 'better-sqlite3';
    import { MolisWorkPtyHost } from '@molis-ai/molis-work-service-runtime-host';
    import { loadBuiltinPlanningMethodPacks } from '@molis-ai/molis-work-module-goals';
    const file = process.env.MOLIS_WORK_HOME + '-native.db';
    let db = new Database(file);
    db.exec('CREATE TABLE probe(value TEXT)');
    db.prepare('INSERT INTO probe VALUES (?)').run('persisted'); db.close();
    db = new Database(file); assert.equal(db.prepare('SELECT value FROM probe').get().value, 'persisted'); db.close();
    const output = await new Promise((resolve, reject) => {
      let text = '';
      const host = new MolisWorkPtyHost({ onData: (_id, value) => { text += value; },
        onExit: () => { clearTimeout(timer); resolve(text); } });
      const timer = setTimeout(() => { host.killAll(); reject(new Error('PTY timed out')); }, 5000);
      try { host.spawn({ panelId: 'release-smoke', command: '/bin/sh', args: ['-c', 'printf molis-work-pty-ok'], cwd: process.cwd() }); }
      catch (error) { clearTimeout(timer); reject(error); }
    });
    assert.match(output, /molis-work-pty-ok/);
    assert.equal(loadBuiltinPlanningMethodPacks().find(item => item.method_id === 'industry-developer-tools').name, '开发者工具');
    console.log('native persistence, real PTY and planning assets passed');
  `;
  await run(process.execPath, ["--input-type=module", "-e", probe], product);
  const installed = JSON.parse((await run(cli, ["install", "--home", home, "--json"])).stdout);
  assert.equal(installed.status, "installed");
  const repeat = JSON.parse((await run(cli, ["install", "--home", home, "--json"])).stdout);
  assert.equal(repeat.status, "unchanged");
  const demo = JSON.parse((await run(cli, ["demo", "create", "--confirm", "--home", home, "--json"])).stdout);
  const databaseBefore = await readFile(demo.project.database_path);
  const upgraded = JSON.parse((await run(cli, ["install", "--home", home, "--version", `${manifest.version}-npm-smoke`, "--json"])).stdout);
  assert.equal(upgraded.status, "upgraded");
  assert.deepEqual(await readFile(demo.project.database_path), databaseBefore);
  await run(process.execPath, ["--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { installMolisWorkHome } from '@molis-ai/molis-work-app-local-host';
    const launcher = ${JSON.stringify(installed.launchers.cli)};
    const before = await readFile(launcher);
    await assert.rejects(installMolisWorkHome({ sourceDirectory: process.cwd(), homeDirectory: ${JSON.stringify(home)},
      version: 'npm-smoke-failure', beforeStep(step) { if (step === 'before_write_install_manifest') throw new Error('release-test-failure'); }
    }), /release-test-failure/);
    assert.deepEqual(await readFile(launcher), before);
  `], product);
  assert.deepEqual(await readFile(demo.project.database_path), databaseBefore);
  const restored = JSON.parse((await run(cli, ["install", "--home", home, "--version", manifest.version, "--json"])).stdout);
  assert.equal(restored.version, manifest.version);
  assert.deepEqual(await readFile(demo.project.database_path), databaseBefore);
  const moved = `${product}-temporarily-unavailable`;
  await rename(product, moved);
  try {
    assert.match((await run(installed.launchers.cli, ["--help"])).stdout, /molis-work plugin/);
    await run(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import { validateMolisWorkMcpLauncher } from '@molis-ai/molis-work-app-mcp';
      assert.equal(await validateMolisWorkMcpLauncher({
        runtime_id: 'codex', launcher_path: ${JSON.stringify(installed.launchers.mcp)},
        home_directory: ${JSON.stringify(home)}, plan_id: 'npm-release-smoke'
      }), true);
    `], installed.release_directory);
    assert.deepEqual(await readFile(path.join(installed.release_directory, "vendor/intelligence-client/sbom.cdx.json")),
      await readFile(path.join(moved, "vendor/intelligence-client/sbom.cdx.json")));
  } finally { await rename(moved, product); }
  const preview = JSON.parse((await run(cli, ["uninstall", "--home", home, "--json"])).stdout);
  assert.equal(preview.status, 'ready');
  assert.equal(preview.demo_project_count, 1);
  assert.deepEqual(await readFile(demo.project.database_path), databaseBefore);
  const removed = JSON.parse((await run(cli, ["uninstall", "--home", home, "--confirm", "--json"])).stdout);
  assert.equal(removed.status, 'uninstalled');
  await assert.rejects(readFile(installed.launchers.cli), { code: 'ENOENT' });
  await assert.rejects(readFile(demo.project.database_path), { code: 'ENOENT' });
  console.log('PASS: npm CLI/native modules/planning, Home install/repeat/upgrade/failure rollback/version restore, source-independent MCP, uninstall preview and confirmation');
} finally { await rm(temporary, { recursive: true, force: true }); }
