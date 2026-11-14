import { openPluginTestDatabase } from "./fixtures/plugin-test-database.js";
import { connectorControl } from "./fixtures/connector-control.js";
import { ISOLATED_HOST_IDS } from "./fixtures/isolated-host.js";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { pluginActions } from "./fixtures/plugin-actions.js";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import { type SqliteDatabase } from "@molis-ai/molis-work-test-kit/sqlite";
import { PluginHostExecutor, installHostUiText, runWithLocale, runWithPluginText } from "@molis-ai/molis-work-app-local-host";
import { registerPluginText } from "@molis-ai/molis-work-ui-host";
import { t as hostT } from "@molis-ai/molis-work-plugin-sdk/ui";
import { build } from "esbuild";
import { PluginRuntime, SqlitePluginPrivateStorage, pluginLocaleReader } from "@molis-ai/molis-work-plugin-runtime";
import { UiHost } from "@molis-ai/molis-work-ui-host";
import { ArtifactsModule, ProcessItemsModule } from "@molis-ai/molis-work-module-artifacts";
import { createActionMcpPorts, handleMcpMessage, actionMcpToolName } from "@molis-ai/molis-work-app-mcp";
import type { ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import { seedDemoBoard, DEMO_PROJECT_ID } from "@molis-ai/molis-work-app-local-host";
import { LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("clean developer project uses packed public SDK from CLI scaffold through installation and a real private Artifact/UI result", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-sample-"));
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const project = join(directory, "sample");
  const cli = join(root, "tooling/plugin-cli/bin/molis-work-plugin.mjs");
  let store: LocalProjectDatabase | undefined;
  let privateDb: SqliteDatabase | undefined;
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
    // FSS-62: the language files are checked too; a placeholder broken in one language fails the check, and fixing it passes again.
    const zhPath = join(project, "locales/zh.json"), zhSource = readFileSync(zhPath, "utf8");
    writeFileSync(zhPath, zhSource.replace("已保存的结果：{count}", "已保存的结果：{count"));
    const brokenPlaceholder = spawnSync(process.execPath, [cli, "validate", join(project, "manifest.json")], { encoding: "utf8" });
    assert.equal(brokenPlaceholder.status, 1, brokenPlaceholder.stdout);
    assert.equal(JSON.parse(brokenPlaceholder.stderr).valid, false);
    writeFileSync(zhPath, zhSource);
    // FSS-62: business code has no branch on a language or a skin: the scaffold's and the repository sample's source alike.
    for (const source of [original, readFileSync(join(root, "examples/plugin-sample/index.mjs"), "utf8")]) {
      for (const word of ["currentLocale", "navigator.language", "data-resolved-theme", "data-skin"]) assert.equal(source.includes(word), false, word);
    }
    for (const name of ["contracts", "plugin-sdk"]) {
      execFileSync("pnpm", ["--dir", join(root, "packages", name), "pack", "--pack-destination", directory, "--json"], { encoding: "utf8" });
    }
    // FSS-62: both the generated project and the repository sample carry their own language files in the author archive.
    for (const authorDirectory of [project, join(root, "examples/plugin-sample")]) {
      const packed = JSON.parse(execFileSync("pnpm", ["--dir", authorDirectory, "pack", "--pack-destination", directory, "--json"], { encoding: "utf8" })) as { filename: string };
      const files = execFileSync("tar", ["-tf", resolve(directory, packed.filename)], { encoding: "utf8" }).split("\n");
      for (const lang of ["zh", "en"]) assert.ok(files.includes("package/locales/" + lang + ".json"), files.join(", "));
    }
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(directory, "npm-cache"),
      join(directory, "molis-ai-molis-work-contracts-0.0.0.tgz"), join(directory, "molis-ai-molis-work-plugin-sdk-0.0.0.tgz")],
    { cwd: project, encoding: "utf8" });
    // SDK-1: the author has installed only contracts + SDK, including the sandbox Manifest owner.
    const sandbox = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { effectsFromContract, sandboxPluginManifest, parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
      const effects=effectsFromContract({operations:[{effects:{storage:["read"]}},{effects:{storage:["write","read"]}}]});
      const manifest=parsePluginManifest(sandboxPluginManifest({pluginId:"io.molis.work.example.sandbox",name:"Sandbox author",version:"1.0.0",publisher:{publisher_id:"author",signature:"author-binding"},presentation:true,effects,runtime:{scope:"home"}}));
      console.log(JSON.stringify({effects,entry:manifest.entrypoints[0].entrypoint,scope:manifest.runtime.scope,requires:manifest.requires.map(x=>[x.capability_id,x.version])}));
    `], { cwd: project, encoding: "utf8" });
    assert.equal(sandbox.status, 0, sandbox.stderr);
    assert.deepEqual(JSON.parse(sandbox.stdout), { effects: { storage: ["read", "write"] }, entry: "./plugin.mjs", scope: "home", requires: [["ui.plugin-presentation", 1]] });
    // B27SRC-03: /highlight loads from the same offline install (a CR ends a line comment); /rich-text needs the optional peers it names.
    const subpaths = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { codeTokens } from "@molis-ai/molis-work-plugin-sdk/highlight";
      let richText = "loaded"; try { await import("@molis-ai/molis-work-plugin-sdk/rich-text"); } catch (error) { richText = error.code; }
      console.log(JSON.stringify({ comment: codeTokens("// a\\rb", "ts")[0], richText }));
    `], { cwd: project, encoding: "utf8" });
    assert.equal(subpaths.status, 0, subpaths.stderr);
    assert.deepEqual(JSON.parse(subpaths.stdout), { comment: ["comment", "// a"], richText: "ERR_MODULE_NOT_FOUND" });
    const definition = (await import(pathToFileURL(join(project, "index.mjs")).href)).default as PluginDefinition;
    assert.equal(definition.manifest.plugin_id, validated.plugin_id);
    assert.equal(definition.manifest.schema_version, 1);
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
    assert.equal(JSON.parse(denied.stderr).code, "plugin.grant_denied");
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
      // FSS-60: no --locale is the plugin's default language, en, with its plural forms.
      assert.match(result.rendered_ui[0].html, sequence === 1 ? /1 result saved/ : /2 results saved/);
    }
    // FSS-60 FSS-62: the real `molis-work plugin dev` command draws in the language it is given, from the plugin's own files.
    const devIn = (locale: string, target: string) => spawnSync(process.execPath,
      ["--disable-warning=ExperimentalWarning", appCli, "plugin", "dev", project, join(directory, target), grants, "--allow-unsigned-development", "--locale", locale], { encoding: "utf8" });
    const inEnglish = devIn("en", "state-en"), inChinese = devIn("zh", "state-zh");
    assert.equal(inEnglish.status, 0, inEnglish.stderr);
    assert.equal(inChinese.status, 0, inChinese.stderr);
    const english = JSON.parse(inEnglish.stdout).rendered_ui[0].html as string, chinese = JSON.parse(inChinese.stdout).rendered_ui[0].html as string;
    assert.match(english, /Local Plugin Sample/);
    assert.match(english, /Saved results: 1/);
    assert.match(english, /1 result saved/);
    assert.match(chinese, /本地插件样例/);
    assert.match(chinese, /已保存的结果：1/);
    assert.match(chinese, /已保存 1 个结果/);
    // A name with ' and & is escaped once, by `t`: never left raw, never twice.
    assert.ok(english.includes("Source: Tom&#039;s R&amp;D notes"), english);
    assert.ok(chinese.includes("来源：Tom&#039;s R&amp;D notes"), chinese);
    for (const html of [english, chinese]) assert.equal(/&amp;(?:amp|#039);/u.test(html), false, html);
    const undeclared = devIn("fr", "state-fr");
    assert.equal(undeclared.status, 1, undeclared.stderr);
    assert.equal(JSON.parse(undeclared.stderr).code, "actions.input_invalid");
    assert.match(undeclared.stderr, /fr/);
    assert.match(undeclared.stderr, /en、zh/, "the error lists the languages it can draw in");
    // BL-plugin-dev-state-dir-before-locale-check: the language is checked before the state directory is made, so a refusal leaves none behind.
    assert.equal(existsSync(join(directory, "state-fr")), false, "a refused --locale makes no state directory");
    // FSS-60 FSS-62 (#1976 review ① item 4): dev compares the language it draws in with the default, as validate does. Arguments that differ
    // would leave `{name}` on the page, so the run stops and names both files; a language short of a key only shows the default's word.
    writeFileSync(zhPath, zhSource.replace("来源：{name}", "来源：{who}"));
    const differingArgs = devIn("zh", "state-zh-args");
    assert.equal(differingArgs.status, 1, differingArgs.stderr);
    assert.equal(JSON.parse(differingArgs.stderr).code, "plugin.package_invalid");
    assert.match(differingArgs.stderr, /locales\/zh\.json notes\.main\.source/);
    assert.match(differingArgs.stderr, /locales\/en\.json/);
    assert.equal(existsSync(join(directory, "state-zh-args")), false, "a broken language file makes no state directory");
    writeFileSync(zhPath, zhSource.replace(/\n\s*"notes\.main\.title": "[^"]*"/u, "").replace(/,(\s*\})/u, "$1"));
    const shortOfOne = devIn("zh", "state-zh-short");
    assert.equal(shortOfOne.status, 0, shortOfOne.stderr);
    assert.match(JSON.parse(shortOfOne.stdout).rendered_ui[0].html as string, /Local Plugin Sample/);
    writeFileSync(zhPath, zhSource);
    const manifestPath = join(project, "manifest.json");
    const originalManifest = readFileSync(manifestPath, "utf8");
    const incompatibleManifest = JSON.parse(originalManifest);
    incompatibleManifest.host_api_version = 999;
    writeFileSync(manifestPath, JSON.stringify(incompatibleManifest));
    const incompatible = dev(state, grants);
    assert.equal(incompatible.status, 1, incompatible.stderr);
    assert.match(incompatible.stderr, /version|版本/);
    // FSS-60: a plugin that declares no languages has none to pick; asking for one says what to write first.
    const unlocalized = JSON.parse(originalManifest);
    delete unlocalized.ui.locales;
    delete unlocalized.name_text;
    delete unlocalized.summary_text;
    writeFileSync(manifestPath, JSON.stringify(unlocalized));
    const noLanguages = devIn("en", "state-unlocalized");
    assert.equal(noLanguages.status, 1, noLanguages.stderr);
    assert.equal(JSON.parse(noLanguages.stderr).code, "actions.input_invalid");
    assert.match(noLanguages.stderr, /ui\.locales/);
    assert.equal(existsSync(join(directory, "state-unlocalized")), false);
    writeFileSync(manifestPath, originalManifest);

    const repositorySample = join(directory, "repository-sample");
    mkdirSync(repositorySample);
    for (const file of ["index.mjs", "manifest.json", "package.json", "README.md", "locales/en.json", "locales/zh.json"]) {
      mkdirSync(dirname(join(repositorySample, file)), { recursive: true });
      writeFileSync(join(repositorySample, file), readFileSync(join(root, "examples/plugin-sample", file)));
    }
    execFileSync("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--cache", join(directory, "npm-cache"),
      join(directory, "molis-ai-molis-work-contracts-0.0.0.tgz"), join(directory, "molis-ai-molis-work-plugin-sdk-0.0.0.tgz")],
    { cwd: repositorySample, encoding: "utf8" });
    // RAC-553 (PG-055): an author who installed only the contracts and the SDK draws with the SDK's public UI parts.
    const drawing = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { icon, renderButton, renderPluginStageShell } from "@molis-ai/molis-work-plugin-sdk/ui";
      import { placeFloating } from "@molis-ai/molis-work-plugin-sdk/browser";
      import "@molis-ai/molis-work-plugin-sdk/page-globals";
      console.log(JSON.stringify({ icon: icon("folder"), button: renderButton({ label: "Go" }),
        shell: renderPluginStageShell({ surface: "demo", label: "Demo", dataset: "demo", body: "<p>x</p>" }), placed: typeof placeFloating }));`],
    { cwd: repositorySample, encoding: "utf8" });
    assert.equal(drawing.status, 0, drawing.stderr);
    const drawn = JSON.parse(drawing.stdout) as { icon: string; button: string; shell: string; placed: string };
    assert.match(drawn.icon, /<use href="#icon-folder">/u);
    assert.match(drawn.button, /class="mw-btn mw-btn--primary/u);
    assert.match(drawn.shell, /data-work-surface="demo"/u);
    assert.equal(drawn.placed, "function");
    // FSS-62 (RAC-553): the same author reads language files, words and appearance files with the two packages alone. The spec is a minimal one
    // written inline: an author has no private design-system.
    const texts = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import { readFileSync } from "node:fs";
      import { installTextForTest, parseLocalePack, parseSkinFile, resolveUiEnvironment, t } from "@molis-ai/molis-work-plugin-sdk/ui";
      const pack = parseLocalePack(readFileSync("locales/zh.json", "utf8"), { file: "locales/zh.json" });
      let before = null; try { t("notes.main.title"); } catch (error) { before = error.code; }
      const spec = { format_version: 1, id: "author-spec", revision: 1, baseline_skin: { id: "author-skin", revision: 1 }, baseline_font: { id: "author-font", revision: 1 }, groups: [], font_roles: [] };
      const skinFile = { format_version: 1, id: "author-skin", revision: 1, spec: { id: "author-spec", revision: 1 }, name: { literal: "Author" }, recommended_font: { id: "author-font", revision: 1 }, light: {}, dark: {}, shared: {}, terminal: {} };
      const skin = parseSkinFile(JSON.stringify(skinFile), spec, { file: "skin.json" });
      const environment = resolveUiEnvironment({ spec, skin: skinFile, locale: { tag: "zh", source: "explicit" } });
      const withLanguage = installTextForTest({ packs: [pack.value], locale: "zh" });
      const title = t("notes.main.saved", { count: 2 });
      withLanguage();
      const withoutLanguage = installTextForTest({ packs: [pack.value], locale: null });
      let none = null; try { t("notes.main.title"); } catch (error) { none = { code: error.code, key: error.message.includes("notes.main.title") }; }
      withoutLanguage();
      console.log(JSON.stringify({ pack: pack.ok, owner: pack.value.owner, before, skin: skin.ok ? true : skin.problems, locale: environment.locale.tag, title, none }));`],
    { cwd: repositorySample, encoding: "utf8" });
    assert.equal(texts.status, 0, texts.stderr);
    assert.deepEqual(JSON.parse(texts.stdout), { pack: true, owner: "io.molis.work.example.notes", before: "ui.text_no_context", skin: true, locale: "zh",
      title: "已保存的结果：2", none: { code: "ui.text_no_context", key: true } });
    // The SDK's `/ui` goes into a browser page: bundled for the browser it reaches no Node built-in module.
    const forBrowser = await build({ stdin: { contents: 'export * from "@molis-ai/molis-work-plugin-sdk/ui";', resolveDir: repositorySample, loader: "js" },
      bundle: true, write: false, format: "esm", platform: "browser", metafile: true, logLevel: "silent" });
    assert.deepEqual(Object.keys(forBrowser.metafile.inputs).filter(input => input.startsWith("node:") || !input.includes("node_modules") && input !== "<stdin>"), []);
    // FSS-69: the sample bundled into one module, with a copy of the SDK of its own, loaded from `data:` as a built-in plugin's release is: its `t` reads
    // the context the Host installed in this process (`Symbol.for`), not a variable of its copy.
    installHostUiText();
    const single = await build({ stdin: { contents: 'export { default } from "./index.mjs"; export { t } from "@molis-ai/molis-work-plugin-sdk/ui";', resolveDir: repositorySample, loader: "js" },
      bundle: true, write: false, format: "esm", platform: "node", packages: "bundle", target: "node24", logLevel: "silent" });
    const copy = await import(`data:text/javascript;base64,${Buffer.from(single.outputFiles[0]!.text).toString("base64")}`) as { default: PluginDefinition; t: typeof hostT };
    assert.notEqual(copy.t, hostT, "a copy of its own");
    const activation = { install_id: "bundled-example", installation_generation: "test" };
    const copyWords = registerPluginText(pluginLocaleReader(copy.default.manifest, path => existsSync(join(repositorySample, path)) ? readFileSync(join(repositorySample, path), "utf8") : null)!, { t: true, activation });
    try {
      assert.equal(runWithLocale("zh", () => runWithPluginText(activation, () => copy.t("notes.main.title"))), "本地插件样例");
      assert.equal(runWithLocale("en", () => runWithPluginText(activation, () => copy.t("notes.main.source", { name: "Tom's" }))), "Source: Tom&#039;s");
    } finally { copyWords(); }
    assert.ok(existsSync(join(repositorySample, "node_modules/@molis-ai/molis-work-plugin-sdk/dist/page-globals.d.ts")));
    const repositoryRun = dev(join(directory, "repository-state"), grants, "--allow-unsigned-development", repositorySample);
    assert.equal(repositoryRun.status, 0, repositoryRun.stderr);
    const repositoryResult = JSON.parse(repositoryRun.stdout);
    assert.equal(repositoryResult.installation.state, "uninstalled");
    assert.deepEqual(repositoryResult.artifacts[0].payload, { title: "Local sample result", sequence: 1 });
    assert.match(repositoryResult.rendered_ui[0].html, /Saved results: 1/);

    const boardPath = join(directory, "board.db");
    seedDemoBoard(boardPath);
    store = new LocalProjectDatabase(boardPath);
    privateDb = openPluginTestDatabase(join(directory, "private.db"));
    const privateOwner = new SqlitePluginPrivateStorage(privateDb);
    const artifacts = new ArtifactsModule({ db: store.db, appendEvent: event => store!.appendEvent(event), eventCursor: projectId => store!.eventCursor(projectId) }), processItems = new ProcessItemsModule({ db: store.db, appendEvent: event => store!.appendEvent(event), eventCursor: projectId => store!.eventCursor(projectId) });
    const ui = new UiHost();
    const actions = pluginActions(store, DEMO_PROJECT_ID);
    let registeredPublications = 0;
    const invoke = actions.client.invoke.bind(actions.client);
    actions.client.invoke = async (caller, reference, input) => {
      const result = await invoke(caller, reference, input);
      if (reference.capability_id === publishResult.capability_id) registeredPublications++;
      return result;
    };
    // The Host's text context and the plugin's own words, as `createPluginPlatform` gives them (§8.3): the page the Host mounts says them.
    const runtime = new PluginRuntime(undefined, new PluginHostExecutor({ actions, project_id: DEMO_PROJECT_ID, actor_id: "developer",
      artifacts, processItems, ui, privateStorageFor: (context, manifest) => privateOwner.forPlugin(context, manifest),
      localePacks: given => pluginLocaleReader(given.manifest, path => existsSync(join(project, path)) ? readFileSync(join(project, path), "utf8") : null) }), { hostIds: ISOLATED_HOST_IDS, actions });
    const installed = runtime.install({ trust: { level: "unsigned" }, definition, deployment: "local" });
    const installId = installed.install.install_id;
    await assert.rejects(runtime.start(installId), (error: unknown) => (error instanceof ActionError && error.kind === "invalid") && error.code === "plugin.grant_denied");
    assert.equal(artifacts.query.listArtifacts(DEMO_PROJECT_ID).length, 0);
    assert.deepEqual(ui.list(), []);
    runtime.grant(installId, definition.manifest.permissions.map(permission => permission.permission));
    await runtime.start(installId);
    const caller: ActionCallContext = { actor_id: "developer", project_id: DEMO_PROJECT_ID, audience: "user",
      permissions: definition.manifest.permissions.map(permission => permission.permission) };
    const actionDirectory = await actions.client.discover(caller);
    assert.ok([publicHealth, readResult, publishResult].every(definition => actionDirectory.some(row => row.capability_id === definition.capability_id && row.provider.provider_id === installId && row.availability.available)));
    assert.deepEqual(await actions.client.invoke(caller, readResult, {}), { count: 0, latest: null });
    await assert.rejects(actions.client.invoke({ ...caller, actor_id: "other-user" }, publishResult, {}), { code: "actions.owner_mismatch" });
    await assert.rejects(actions.client.invoke({ ...caller, permissions: [] }, publishResult, {}), { code: "actions.forbidden" });
    await assert.rejects(actions.client.invoke(caller, publishResult, { actor_id: "developer" }), { code: "actions.input_invalid" });
    const mcp = createActionMcpPorts({ service: actions.client, context: () => ({ actor_id: "external-client", project_id: DEMO_PROJECT_ID, audience: "mcp", permissions: [],
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
    const binding = { source_id: "sample", connection_id: null, credential_ref: null, config: {} };
    const first = await contribution.bind(binding).connector_driver.poll({ cursor: null }, connectorControl());
    assert.equal(first.ok, true);
    assert.equal(first.events.length, 1);
    const reference = { artifact_id: installId + ":sample-result", version: 1 };
    assert.deepEqual(artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, reference)!.payload,
      { title: "Local sample result", sequence: 1 });
    // The type the sample pins declares a preview of its own (artifact-positioning A1/A7): the version just published reads as text.
    const previewResult = action("results.preview");
    assert.ok((await actions.client.discover(caller)).some(row => row.capability_id === previewResult.capability_id && row.provider.provider_id === installId && row.availability.available));
    const previewed = await actions.client.invoke(caller, previewResult, { artifact: artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, reference) }) as { media_type: string; data: string };
    assert.equal(previewed.media_type, "text/markdown");
    assert.equal(previewed.data, "# Local sample result\n\nResult 1\n");
    const render = () => ui.mount({ slot: { slot_id: "plugin.main", accepts: ["html"] },
      contribution: { contribution_id: definition.manifest.ui.contributions[0]!, surface: "main", model: null } }).html;
    assert.match(render(), /Saved results: 1/);
    assert.equal(registeredPublications, 1, "the real connector poll invoked the registered publishing action");
    assert.deepEqual(await actions.client.invoke(caller, readResult, {}), { count: 1, latest: { ...reference, payload: { title: "Local sample result", sequence: 1 } } });
    await runtime.reportCrash(installId);
    assert.deepEqual(ui.list(), []);
    await runtime.recover(installId);
    assert.match(render(), /Saved results: 1/);
    const recovered = runtime.contribution(installId)!; assert.ok(recovered.kind === "integration");
    assert.equal((await recovered.bind(binding).connector_driver.poll({ cursor: first.cursor_after }, connectorControl())).ok, true);
    assert.match(render(), /Saved results: 2/);
    assert.equal(artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, reference.artifact_id).length, 2);
    assert.deepEqual(await actions.client.invoke(caller, publishResult, {}), { artifact_id: reference.artifact_id, version: 3, payload: { title: "Local sample result", sequence: 3 } });
    assert.equal(registeredPublications, 3); assert.match(render(), /Saved results: 3/);
    assert.equal(artifacts.query.listArtifactVersions(DEMO_PROJECT_ID, reference.artifact_id).length, 3);
    await runtime.uninstall(installId);
    assert.equal((await actions.client.discover(caller)).some(row => row.provider.provider_id === installId), false);
    await assert.rejects(actions.client.invoke(caller, publicHealth, {}), { code: "actions.missing" });
    const stopped = await handleMcpMessage({ id: 4, method: "tools/list", params: {} }, mcp);
    assert.deepEqual((stopped!.result as { tools: unknown[] }).tools, []);
    assert.deepEqual(ui.list(), []);
    assert.equal(artifacts.query.getArtifactVersion(DEMO_PROJECT_ID, reference)!.scope, "personal");
  } finally { privateDb?.close(); store?.close(); rmSync(directory, { recursive: true, force: true }); }
});
