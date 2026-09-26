import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import Database from "better-sqlite3";
import { PluginHostExecutor } from "@molis-ai/molis-work-app-local-host";
import { PluginRuntime, PluginRuntimeError, SqlitePluginPrivateStorage } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule } from "@molis-ai/molis-work-module-artifacts";
import { createActionMcpPorts, handleMcpMessage, actionMcpToolName } from "@molis-ai/molis-work-app-mcp";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("clean developer project uses packed public SDK from CLI scaffold through installation and a real private Artifact/UI result", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-sample-"));
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const project = join(directory, "sample");
  const cli = join(root, "tooling/plugin-cli/bin/molis-work-plugin.mjs");
  let store: LocalProjectDatabase | undefined;
  let privateDb: Database.Database | undefined;
  try {
    const invalid = spawnSync(process.execPath, [cli, "create", project, "invalid", "developer", "local-binding"], { encoding: "utf8" });
    assert.equal(invalid.status, 1);
    execFileSync(process.execPath, [cli, "create", project, "io.molis.work.example.notes", "developer", "local-binding"]);
    const original = readFileSync(join(project, "index.mjs"), "utf8");
    const repeat = spawnSync(process.execPath, [cli, "create", project, "io.molis.work.example.other", "developer", "local-binding"], { encoding: "utf8" });
    assert.equal(repeat.status, 1);
    assert.equal(readFileSync(join(project, "index.mjs"), "utf8"), original);
    const validated = JSON.parse(execFileSync(process.execPath, [cli, "validate", join(project, "manifest.json")], { encoding: "utf8" }));
    assert.equal(validated.plugin_id, "io.molis.work.example.notes");
    for (const name of ["contracts", "plugin-sdk"]) {
      execFileSync("pnpm", ["--dir", join(root, "packages", name), "pack", "--pack-destination", directory, "--json"], { encoding: "utf8" });
    }
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(directory, "npm-cache"),
      join(directory, "molis-ai-molis-work-contracts-0.0.0.tgz"), join(directory, "molis-ai-molis-work-plugin-sdk-0.0.0.tgz")],
    { cwd: project, encoding: "utf8" });
    const definition = (await import(pathToFileURL(join(project, "index.mjs")).href)).default as PluginDefinition;
    assert.equal(definition.manifest.plugin_id, validated.plugin_id);
    assert.equal(definition.manifest.schema_version, 2);
    const action = (suffix: string) => definition.manifest.actions!.find(value => value.capability_id === definition.manifest.plugin_id + "." + suffix)!;
    const publicHealth = action("health"), readResult = action("results.read"), publishResult = action("results.publish");
    assert.ok(publicHealth && readResult && publishResult);

    // Exercise the shipped application command, not just the in-process test assembly below.
    const appCli = join(root, "dist/cli/main.js");
    const state = join(directory, "development-state");
    const grants = definition.manifest.permissions.map(permission => permission.permission).join(",");
    // Node prints an ExperimentalWarning for node:sqlite on stderr; silence it so the
    // assertions read the CLI's own JSON contract rather than the runtime's chatter.
    const dev = (target: string, permissions: string, flag = "--allow-unsigned-development", source = project) =>
      spawnSync(
        process.execPath,
        ["--disable-warning=ExperimentalWarning", appCli, "plugin", "dev", source, target, permissions, flag],
        { encoding: "utf8" },
      );
    const unauthorized = dev(state, grants, "--not-authorized");
    assert.equal(unauthorized.status, 1, unauthorized.stderr);
    assert.equal(existsSync(state), false, "missing execution authority must not create development data");
    const ordinary = join(directory, "ordinary-project");
    mkdirSync(ordinary);
    writeFileSync(join(ordinary, "user-data.txt"), "keep me");
    const refusedDirectory = dev(ordinary, grants);
    assert.equal(refusedDirectory.status, 1, refusedDirectory.stderr);
    assert.deepEqual(readdirSync(ordinary), ["user-data.txt"]);
    assert.equal(readFileSync(join(ordinary, "user-data.txt"), "utf8"), "keep me");
    const denied = dev(state, "");
    assert.equal(denied.status, 1, denied.stderr);
    assert.equal(JSON.parse(denied.stderr).code, "plugin_grant_denied");
    for (const sequence of [1, 2]) {
      const execution = dev(state, grants);
      assert.equal(execution.status, 0, execution.stderr);
      const result = JSON.parse(execution.stdout);
      assert.equal(result.installation.state, "uninstalled");
      assert.equal(result.health.ok, true);
      assert.equal(result.poll.ok, true);
      assert.equal(result.artifacts.length, sequence, "previous Artifact versions must remain available");
      for (let version = 1; version <= sequence; version += 1) {
        const artifact = result.artifacts.find((value: { version: number }) => value.version === version);
        assert.equal(artifact.scope, "personal");
        assert.deepEqual(artifact.payload, { title: "Local sample result", sequence: version });
      }
      assert.match(result.rendered_ui[0].html, new RegExp(`Saved results: ${sequence}`));
    }
    const manifestPath = join(project, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf8");
    const incompatibleManifest = JSON.parse(originalManifest);
    incompatibleManifest.host_api_version = 999;
    writeFileSync(manifestPath, JSON.stringify(incompatibleManifest));
    const incompatible = dev(state, grants);
    assert.equal(incompatible.status, 1, incompatible.stderr);
    assert.match(incompatible.stderr, /version|版本/);
    writeFileSync(manifestPath, originalManifest);

    const repositorySample = join(directory, "repository-sample");
    mkdirSync(repositorySample);
    for (const file of ["index.mjs", "manifest.json", "package.json", "README.md"]) {
      writeFileSync(join(repositorySample, file), readFileSync(join(root, "examples/plugin-sample", file)));
    }
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(directory, "npm-cache"),
      join(directory, "molis-ai-molis-work-contracts-0.0.0.tgz"), join(directory, "molis-ai-molis-work-plugin-sdk-0.0.0.tgz")],
    { cwd: repositorySample, encoding: "utf8" });
    const repositoryRun = dev(join(directory, "repository-state"), grants, "--allow-unsigned-development", repositorySample);
    assert.equal(repositoryRun.status, 0, repositoryRun.stderr);
    const repositoryResult = JSON.parse(repositoryRun.stdout);
    assert.equal(repositoryResult.installation.state, "uninstalled");
    assert.deepEqual(repositoryResult.artifacts[0].payload, { title: "Local sample result", sequence: 1 });
    assert.match(repositoryResult.rendered_ui[0].html, /Saved results: 1/);

    const boardPath = join(directory, "board.db");
    seedDemoBoard(boardPath);
    store = new LocalProjectDatabase(boardPath);
    privateDb = new Database(join(directory, "private.db"));
    const privateOwner = new SqlitePluginPrivateStorage(privateDb);
    const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store!.appendEvent(event) });
    const ui = new UiHost();
    const actions = pluginActions(store, DEMO_BOARD_ID);
    let registeredPublications = 0;
    const invoke = actions.client.invoke.bind(actions.client);
    actions.client.invoke = async (caller, reference, input) => {
      const result = await invoke(caller, reference, input);
      if (reference.capability_id === publishResult.capability_id) registeredPublications++;
      return result;
    };
    const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, board_id: DEMO_BOARD_ID, actor_id: "developer",
      artifacts, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest) }), { actions });
    const installed = runtime.install({ definition, deployment: "local" });
    const installId = installed.install.install_id;
    await assert.rejects(runtime.start(installId), (error: unknown) => error instanceof PluginRuntimeError && error.code === "plugin_grant_denied");
    assert.equal(artifacts.query.listArtifacts(DEMO_BOARD_ID).length, 0);
    assert.deepEqual(ui.list(), []);
    runtime.grant(installId, definition.manifest.permissions.map(permission => permission.permission));
    await runtime.start(installId);
    const caller: ActionCallContext = { actor_id: "developer", project_id: DEMO_BOARD_ID, audience: "user",
      permissions: definition.manifest.permissions.map(permission => permission.permission) };
    const actionDirectory = await actions.client.discover(caller);
    assert.ok([publicHealth, readResult, publishResult].every(definition => actionDirectory.some(row => row.capability_id === definition.capability_id && row.provider.provider_id === installId && row.availability.available)));
    assert.deepEqual(await actions.client.invoke(caller, readResult, {}), { count: 0, latest: null });
    await assert.rejects(actions.client.invoke({ ...caller, actor_id: "other-user" }, publishResult, {}), { code: "actions.owner_mismatch" });
    await assert.rejects(actions.client.invoke({ ...caller, permissions: [] }, publishResult, {}), { code: "actions.forbidden" });
    await assert.rejects(actions.client.invoke(caller, publishResult, { actor_id: "developer" }), { code: "actions.input_invalid" });
    const mcp = createActionMcpPorts({ service: actions.client, context: () => ({ actor_id: "external-client", project_id: DEMO_BOARD_ID, audience: "mcp", permissions: [],
      allowed_actions: [{ ...publicHealth, provider_id: installId }] }), serverInfo: { name: "generated-plugin", version: "1" } });
    const mcpList = await handleMcpMessage({ id: 1, method: "tools/list", params: {} }, mcp);
    assert.deepEqual((mcpList!.result as { tools: { name: string }[] }).tools.map(tool => tool.name), [actionMcpToolName(publicHealth)]);
    const mcpHealth = await handleMcpMessage({ id: 2, method: "tools/call", params: { name: actionMcpToolName(publicHealth), arguments: {} } }, mcp);
    const healthResult = mcpHealth!.result as { isError: boolean; content: { text: string }[] };
    assert.equal(healthResult.isError, false); assert.deepEqual(JSON.parse(healthResult.content[0]!.text), { ok: true, status: "connected", message: "Local sample is ready" });
    const mcpPrivate = await handleMcpMessage({ id: 3, method: "tools/call", params: { name: actionMcpToolName(publishResult), arguments: {} } }, mcp);
    assert.equal((mcpPrivate!.result as { isError: boolean }).isError, true);
    const contribution = runtime.contribution(installId)!;
    assert.ok(contribution.kind === "integration");
    const first = await contribution.connector_driver.poll({ cursor: null });
    assert.equal(first.ok, true);
    assert.equal(first.events.length, 1);
    const reference = { artifact_id: installId + ":sample-result", version: 1 };
    assert.deepEqual(artifacts.query.getArtifactVersion(DEMO_BOARD_ID, reference)!.payload,
      { title: "Local sample result", sequence: 1 });
    const render = () => ui.mount({ slot: { slot_id: "plugin.main", version: 1, accepts: ["html"] },
      contribution: { contribution_id: definition.manifest.ui.contributions[0]!, surface: "main", model: null } }).html;
    assert.match(render(), /Saved results: 1/);
    assert.equal(registeredPublications, 1, "the real connector poll invoked the registered publishing action");
    assert.deepEqual(await actions.client.invoke(caller, readResult, {}), { count: 1, latest: { ...reference, payload: { title: "Local sample result", sequence: 1 } } });
    await runtime.reportCrash(installId);
    assert.deepEqual(ui.list(), []);
    await runtime.recover(installId);
    assert.match(render(), /Saved results: 1/);
    const recovered = runtime.contribution(installId)!; assert.ok(recovered.kind === "integration");
    assert.equal((await recovered.connector_driver.poll({ cursor: first.cursor_after })).ok, true);
    assert.match(render(), /Saved results: 2/);
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, reference.artifact_id).length, 2);
    assert.deepEqual(await actions.client.invoke(caller, publishResult, {}), { artifact_id: reference.artifact_id, version: 3, payload: { title: "Local sample result", sequence: 3 } });
    assert.equal(registeredPublications, 3); assert.match(render(), /Saved results: 3/);
    assert.equal(artifacts.query.listArtifactVersions(DEMO_BOARD_ID, reference.artifact_id).length, 3);
    await runtime.uninstall(installId);
    assert.equal((await actions.client.discover(caller)).some(row => row.provider.provider_id === installId), false);
    await assert.rejects(actions.client.invoke(caller, publicHealth, {}), { code: "actions.missing" });
    const stopped = await handleMcpMessage({ id: 4, method: "tools/list", params: {} }, mcp);
    assert.deepEqual((stopped!.result as { tools: unknown[] }).tools, []);
    assert.deepEqual(ui.list(), []);
    assert.equal(artifacts.query.getArtifactVersion(DEMO_BOARD_ID, reference)!.scope, "personal");
  } finally { privateDb?.close(); store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
