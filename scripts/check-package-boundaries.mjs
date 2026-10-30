import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { catalogText } from "./gates/catalog-entries.mjs";
import { checkGoalsManagementWiring } from "./gates/goals-management-wiring.mjs";

import {
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
  unusedLayerExceptions,
} from "@molis-ai/molis-work-test-kit";

import { checkWorkspacePackages, REGISTERED_PLUGINS, WORKSPACE_PACKAGES } from "./workspace-packages.mjs";

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
/** The Web request dispatcher: the entry and its ordered route tables (W5-07). The checks on web-request.ts read all of them. */
export const WEB_DISPATCH_FILES = [
  "apps/local-host/src/web-request.ts",
  "apps/local-host/src/web-route-table.ts",
  "apps/local-host/src/web-catalog-index-routes.ts",
  "apps/local-host/src/web-project-context.ts",
  "apps/local-host/src/web-project-platform-routes.ts",
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function filesUnder(directory, predicate) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const name of fs.readdirSync(directory)) {
    if (name === "dist" || name === "node_modules") continue;
    const child = path.join(directory, name);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) result.push(...filesUnder(child, predicate));
    else if (predicate(child)) result.push(child);
  }
  return result;
}

/** The entry packages' files that may name a Goals contract: every JavaScript and TypeScript file under `apps/cli/src` and `apps/mcp/src`, with its path relative to `root`. */
export function readEntrySources(root) {
  return ["apps/cli/src", "apps/mcp/src"].flatMap(directory => filesUnder(path.join(root, directory), filePath => ENTRY_SOURCE_FILE.test(filePath))
    .map(filePath => ({ path: path.relative(root, filePath), source: fs.readFileSync(filePath, "utf8") })));
}

function isWithin(candidate, directory) {
  const relative = path.relative(directory, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function exportedSubpaths(manifest) {
  if (typeof manifest.exports === "string") return ["."];
  return Object.keys(manifest.exports ?? {});
}

function packageInfos(repositoryRoot) {
  return WORKSPACE_PACKAGES.map((item) => {
    const manifest = readJson(path.join(repositoryRoot, item.path, "package.json"));
    return {
      name: item.name,
      path: item.path,
      kind: item.kind,
      exportedSubpaths: exportedSubpaths(manifest),
      declaredDependencies: Object.keys(manifest.dependencies ?? {}),
      root: path.join(repositoryRoot, item.path),
      manifest,
    };
  });
}

function targetForSpecifier(specifier, packages) {
  return packages.find((item) => specifier === item.name || specifier.startsWith(`${item.name}/`));
}

function ownerForPath(candidate, packages) {
  return packages.find((item) => isWithin(candidate, item.root));
}

function formatViolation(violation) {
  return `${violation.sourceFile}: [${violation.code}] ${violation.message} (${violation.specifier})`;
}

function checkSourceImports(repositoryRoot, packages) {
  const errors = [];
  const edges = new Set();
  let sourceFileCount = 0;
  let importCount = 0;

  const productDirectories = ["apps/desktop/launchers"];
  const productManifest = readJson(path.join(repositoryRoot, "package.json"));
  const product = {
    name: productManifest.name, path: ".", root: repositoryRoot, kind: "app",
    declaredDependencies: Object.keys(productManifest.dependencies ?? {}),
  };
  for (const importer of [...packages, product]) {
    const directories = importer === product ? productDirectories : ["src", "tooling", "bin"];
    const sourceFiles = directories.flatMap(directory => filesUnder(path.join(importer.root, directory), (filePath) =>
      SOURCE_EXTENSIONS.has(path.extname(filePath)),
    ));
    sourceFileCount += sourceFiles.length;

    for (const sourceFile of sourceFiles) {
      const relativeSource = path.relative(repositoryRoot, sourceFile);
      for (const specifier of extractImportSpecifiers(fs.readFileSync(sourceFile, "utf8"))) {
        importCount += 1;
        let target = targetForSpecifier(specifier, packages);
        let relativeCrossOwner = false;

        if (specifier.startsWith(".")) {
          const resolvedTarget = path.resolve(path.dirname(sourceFile), specifier);
          const relativeOwner = importer === product && productDirectories.some(directory =>
            isWithin(resolvedTarget, path.join(repositoryRoot, directory)))
            ? product : ownerForPath(resolvedTarget, packages);
          if (relativeOwner && relativeOwner.name !== importer.name) target = relativeOwner;
          relativeCrossOwner = !isWithin(resolvedTarget, importer.root);
        }
        if (target && target.path !== importer.path) edges.add(`${importer.path} -> ${target.path}`);

        for (const violation of evaluateImportBoundary({
          importer,
          target,
          specifier,
          sourceFile: relativeSource,
          relativeCrossOwner,
        })) {
          errors.push(formatViolation(violation));
        }
      }
    }
  }

  return { errors, edges, importCount, sourceFileCount };
}

function checkDependencyGraph(packages) {
  const errors = [];
  const edges = new Set();
  const packageNames = new Set(packages.map((item) => item.name));
  const graph = new Map();

  for (const importer of packages) {
    const workspaceDependencies = importer.declaredDependencies.filter((name) => packageNames.has(name));
    graph.set(importer.name, workspaceDependencies);
    for (const dependency of importer.declaredDependencies) {
      const target = packages.find((item) => item.name === dependency);
      if (target) edges.add(`${importer.path} -> ${target.path}`);
      for (const violation of evaluateImportBoundary({
        importer,
        target,
        specifier: dependency,
        sourceFile: `${importer.path}/package.json`,
      })) {
        // A manifest declares the npm package; source code must still select an
        // explicit exported Contract subpath.
        if (violation.code === "contracts-root-import") continue;
        errors.push(formatViolation(violation));
      }
    }
  }

  for (const cycle of findDependencyCycles(graph)) {
    errors.push(`[workspace-dependency-cycle] ${cycle.join(" -> ")}`);
  }
  return { errors, edges, edgeCount: [...graph.values()].reduce((total, targets) => total + targets.length, 0) };
}

/**
 * APP_IMPORT_ALLOWLIST and PLUGIN_MODULE_IMPORT_ALLOWLIST (packages/test-kit/src/boundaries.ts) only ever shrink: an entry that
 * no import and no manifest dependency uses any more has to leave the list, or the edge could come back without a decision.
 */
function checkLayerExceptionsInUse(...observed) {
  return unusedLayerExceptions(observed.flatMap((edges) => [...edges])).map((edge) =>
    `[layer-exception-unused] "${edge}" is allowed in packages/test-kit/src/boundaries.ts but no import or declared dependency has that edge; remove it from the list and from the pinned list in packages/test-kit/tests/boundaries.test.mjs`);
}

/** The old root `src/` left the product (PACKAGE-BOUNDARIES.md); nothing may bring it back. */
function checkNoRootSource(repositoryRoot) {
  return fs.existsSync(path.join(repositoryRoot, "src")) ? ["root src/ is retired; put code in a workspace package"] : [];
}

function checkMigratedFeedOwnership(repositoryRoot) {
  const errors = [];
  for (const relativePath of [
    "src/feed/relay-import.ts",
    "plugins/native/feed/src/relay-import.ts",
    "plugins/native/feed/src/relay-import-sources.ts",
    "plugins/native/feed/src/relay-import-types.ts",
    "plugins/native/feed/src/relay-import-values.ts",
    "apps/local-host/src/relay-import.ts",
    "apps/local-host/src/adapters/relay-reader.ts",
    "packages/storage/src/adapters/relay-security.ts",
  ]) {
    if (fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: Relay import/compat must stay deleted`);
    }
  }
  return { errors };
}

export function checkMigratedIntegrationOwnership(repositoryRoot) {
  const errors = [];
  const servicePath = "plugins/native/feed/src/connector-sync.ts";
  const service = fs.readFileSync(path.join(repositoryRoot, servicePath), "utf8");
  for (const forbidden of [
    "legacy-adapter:",
    "RawEventAdapter",
    "ConnectorDriver",
    "createGithubConnector",
    "createGmailConnector",
  ]) {
    if (service.includes(forbidden)) {
      errors.push(`${servicePath}: ${forbidden} belongs to the official Plugin composition boundary`);
    }
  }
  // The Runtime Feed opens its Listener through the platform connector service (FI-5): Feed's `services.connector` is the
  // platform source-pull connector, and the Host backs that port with the Home's integration registry. The Feed names no
  // Provider and the Host keeps no Feed connector composition of its own.
  const runtimePath = "plugins/native/feed/src/runtime-connector.ts";
  const runtime = fs.readFileSync(path.join(repositoryRoot, runtimePath), "utf8");
  const pluginPath = "plugins/native/feed/src/plugin.ts";
  const plugin = fs.readFileSync(path.join(repositoryRoot, pluginPath), "utf8");
  const hostPath = "apps/local-host/src/plugin-source-pull-service.ts";
  const host = fs.readFileSync(path.join(repositoryRoot, hostPath), "utf8");
  const wiring = feedListenerWiringProblems({ service, runtime, plugin, host });
  if (wiring.length > 0) {
    errors.push(`${servicePath}: Feed must consume a Listener opened through the platform connector service, backed by the Home's integration registry (${wiring.join("; ")})`);
  }

  const listenerPath = "plugins/native/feed/src/store/listener.ts";
  const listener = fs.readFileSync(path.join(repositoryRoot, listenerPath), "utf8");
  if (/io\.molis\.work\.integration\.|\b(?:github|gmail|youtube)\b/iu.test(listener)) {
    errors.push(`${listenerPath}: Listener Host must remain Provider-neutral`);
  }

  for (const name of ["github", "gmail", "rss", "web-query", "youtube"]) {
    const pluginRoot = path.join(repositoryRoot, "plugins/official-integrations", name);
    const manifestPath = path.join(pluginRoot, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      errors.push(`plugins/official-integrations/${name}: missing manifest.json`);
      continue;
    }
    const manifest = readJson(manifestPath);
    if (
      (manifest.schema_version !== 1 && manifest.schema_version !== 2)
      || manifest.kind !== "integration"
      || !String(manifest.plugin_id ?? "").startsWith("io.molis.work.integration.")
      || !String(manifest.version ?? "").match(/^\d+\.\d+\.\d+/u)
      || !String(manifest.publisher?.signature ?? "").trim()
      || !Array.isArray(manifest.entrypoints)
      || manifest.entrypoints.length === 0
    ) {
      errors.push(`plugins/official-integrations/${name}/manifest.json: invalid install identity`);
    }
    const packageManifest = readJson(path.join(pluginRoot, "package.json"));
    if (!Array.isArray(packageManifest.files) || !packageManifest.files.includes("manifest.json")) {
      errors.push(`plugins/official-integrations/${name}/package.json: install package must include manifest.json`);
    }
    const entrypoint = fs.readFileSync(path.join(pluginRoot, "src/index.ts"), "utf8");
    for (const identity of [manifest.plugin_id, manifest.version, manifest.publisher?.signature]) {
      if (typeof identity === "string" && !hasInText(entrypoint, JSON.stringify(identity))) {
        errors.push(`plugins/official-integrations/${name}: source Manifest differs from manifest.json identity`);
      }
    }
  }

  for (const composition of [
    { provider: "github", packageName: "@molis-ai/molis-work-integration-github", forbidden: "api.github.com" },
    { provider: "gmail", packageName: "@molis-ai/molis-work-integration-gmail", forbidden: "gmail.googleapis.com" },
  ]) {
    const legacyPath = `src/feed/connectors/${composition.provider}.ts`;
    if (fs.existsSync(path.join(repositoryRoot, legacyPath))) {
      errors.push(`${legacyPath}: migrated Provider compatibility entrypoint must stay deleted`);
    }
    const hostPath = `apps/local-host/src/${composition.provider}-connector.ts`;
    const source = fs.readFileSync(path.join(repositoryRoot, hostPath), "utf8");
    if (!hasImportFrom(source, composition.packageName) || source.includes(composition.forbidden)) {
      errors.push(`${hostPath}: Host must compose the public Integration without owning Provider protocol`);
    }
  }
  return { errors };
}

export function checkMigratedFeedUiOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const renderer = read("apps/workbench/src/renderer.ts");
  const server = WEB_DISPATCH_FILES.map(read).join("\n");
  const uiAdapter = read("apps/workbench/src/feed-projection-ui.ts");
  for (const retired of ["src/web/feed-native-plugin-http.ts", "apps/local-host/src/feed-native-plugin-http.ts"]) {
    if (fs.existsSync(path.join(repositoryRoot, retired))) {
      errors.push(`${retired}: the Host's Feed HTTP edge was deleted (FI-7); Feed declares its routes under /api/plugins/<plugin_id>/ and must stay that way`);
    }
  }
  // The Host answers no /api/feed address of Feed's. The one /api/feed path left is the Gmail OAuth callback's, which is the Host's
  // connector settings (the address registered with Google), not Feed's edge.
  const gmailCallback = "/api/feed/connectors/gmail/oauth/callback";
  for (const filePath of filesUnder(path.join(repositoryRoot, "apps/local-host/src"), (candidate) => SOURCE_EXTENSIONS.has(path.extname(candidate)))) {
    const source = fs.readFileSync(filePath, "utf8");
    if (source.split(gmailCallback).join("").includes("/api/feed")) {
      errors.push(`${path.relative(repositoryRoot, filePath)}: the Host has no /api/feed route; the Feed Plugin declares its routes under /api/plugins/<plugin_id>/`);
    }
  }
  const feedPlugin = read("plugins/native/feed/src/plugin.ts");
  const feedManifestText = read("plugins/native/feed/src/manifest.ts");
  if (!hasInCode(feedManifestText, "routes: [") || !hasInCode(feedPlugin, "createFeedRouteHandlers") || !hasInCode(feedPlugin, "routes,")) {
    errors.push("plugins/native/feed: the Feed page routes must be declared in its Manifest and bound by createFeedPlugin");
  }
  const inboxPlugin = read("plugins/native/inbox/src/plugin.ts");
  const inboxManifestText = read("plugins/native/inbox/src/manifest.ts");
  const pluginUi = read("plugins/native/feed/src/ui.ts");
  const pluginRoutes = read("plugins/native/feed/src/routes.ts");
  const workbench = read("apps/workbench/src/index.ts") + read("apps/workbench/src/ui-composition.ts");
  const uiHost = read("packages/ui-host/src/index.ts");

  for (const forbidden of [
    "function renderFeedDirectory(",
    "function renderSourceDirectory(",
    "function renderSourceWorkbench(",
    "function renderPersistedFeedDetail(",
  ]) {
    if (renderer.includes(forbidden)) {
      errors.push(`apps/workbench/src/renderer.ts: ${forbidden} must be owned by the Feed UI Contribution`);
    }
  }
  if (!hasInCode(renderer, "renderFeedNativePluginSurface")) {
    errors.push("apps/workbench/src/renderer.ts: Feed caller must render through the Native Plugin adapter");
  }
  for (const forbidden of ["/api/feed", "handleFeedNativePluginHttp", "promoteFeedItemToGoal(", "sendFeedError("]) {
    if (server.includes(forbidden)) {
      errors.push(`apps/local-host/src/web-request.ts: ${forbidden} must be owned by the Feed Plugin's declared routes and actions`);
    }
  }
  if (server.includes("/api/inbox")) {
    errors.push("apps/local-host/src/web-request.ts: the Host has no /api/inbox route; the Inbox Plugin declares its routes under /api/plugins/<plugin_id>/");
  }
  if (!hasInCode(inboxManifestText, "routes: [") || !hasInCode(inboxPlugin, "createInboxRouteHandlers") || !hasInCode(inboxPlugin, "routes,")) {
    errors.push("plugins/native/inbox: the Inbox page routes must be declared in its Manifest and bound by createInboxPlugin");
  }
  if (pluginRoutes.includes("/api/inbox/")) {
    errors.push("plugins/native/feed/src/routes.ts: /api/inbox must be owned by the Inbox Plugin");
  }
  if (!hasInCode(uiAdapter, "renderFeedContribution") || !hasInCode(pluginUi, "feedUiContribution")) {
    errors.push("Feed UI must cross the Workbench public contribution entrypoint");
  }
  if (!hasWorkbenchUiContribution(workbench, read("apps/workbench/src/plugin-workbench.ts"), "feedUiContribution", builtinCatalogText(repositoryRoot))) {
    errors.push("Feed route/UI contributions must be registered by their declared public hosts");
  }
  if (!hasInCode(uiHost, "class UiHost") || !hasInCode(uiHost, "render<TModel>(request")) {
    errors.push("packages/ui-host: real contribution registry/render behavior is missing");
  }
  return { errors };
}

/** The Host's Goals coordinator (`GoalProjectApplication`) was deleted in PG-094 S12: Goals is a plugin of the project and its actions are the only way in. */
const RETIRED_COORDINATOR_PATH = "apps/local-host/src/goal-project-application.ts";
function checkCoordinatorStaysDeleted(repositoryRoot) {
  return fs.existsSync(path.join(repositoryRoot, RETIRED_COORDINATOR_PATH))
    ? [`${RETIRED_COORDINATOR_PATH}: the Host's Goals coordinator was deleted (PG-094 S12) and must stay deleted; Goals' application is composed by its plugin`]
    : [];
}

/**
 * Goals' declared routes (PG094-09) are mounted by the plugin's own runtime registration, handed the person's BoundActionClient per
 * request, and see it as `actions` in their context; no port, as a field or as a method, is a domain one. A route context's `query` is
 * the request's query string (a string map), not the Goals query port (BL-386).
 *
 * The Host does not dispatch those routes itself any more: it must not mount the retired declared-route dispatcher, and must not keep
 * `goalsRoutes` around at all — importing it or handing it on is enough to bring the old address back. The rule is a pure function so the
 * boundary test can drive it with restored and mutated sources.
 */
export function checkGoalsCommandOwnership({ goalsPlugin, httpContext, hostSources }) {
  const errors = [];
  if (!matchesInCode(goalsPlugin, /routes:\s*goalsRoutes\s*\(\{/u)
    || !matchesInCode(goalsPlugin, /actions:\s*request\s*=>/u)
    || !matchesInCode(goalsPlugin, /actions\.invoke\(definition,\s*input,\s*request\.execution\)/u)) {
    errors.push("plugins/native/goals/src/plugin.ts: Goals' declared routes must be mounted by the plugin runtime (`routes: goalsRoutes({ … })`) and given the request's BoundActionClient (`actions: request =>`, `actions.invoke(definition, input, request.execution)`)");
  }
  if (!hasInCode(httpContext, "actions(request: PluginRouteRequest): BoundActionClient") || !hasInCode(httpContext, "actions: BoundActionClient")
    || /\b(?:commands|query|lifecycle|planning)\s*\(|\b(?:commands|lifecycle|planning)\??:|\bquery\??:(?!\s*Readonly<Record<string, string>>)/u.test(httpContext)) {
    errors.push("plugins/native/goals/src/http/types.ts: Goals HTTP business operations must consume BoundActionClient without direct domain ports");
  }
  if (hostSources.length === 0) {
    errors.push("apps/local-host/src: no Host source files were read while checking that Goals' declared routes are only mounted by the plugin");
  }
  for (const { file, source } of hostSources) {
    if (/\bgoalsRoutes\b/u.test(source)) {
      errors.push(`${file}: the Host must not mount, import or pass on Goals' declared routes (BL-386); the plugin's runtime mount is the only one`);
    }
    if (/\bdispatchDeclaredPluginRoutes\b/u.test(source)) {
      errors.push(`${file}: the retired declared-route dispatcher must stay removed from the Host (BL-386)`);
    }
  }
  return errors;
}

/** Every Host source file (`apps/local-host/src`, `.ts`, never `dist`) with its text: the declared-route mount must stay inside the plugin. */
export function hostSourceFiles(repositoryRoot) {
  return filesUnder(path.join(repositoryRoot, "apps/local-host/src"), filePath => filePath.endsWith(".ts")).map(filePath => ({
    file: path.relative(repositoryRoot, filePath), source: fs.readFileSync(filePath, "utf8"),
  }));
}

export function checkMigratedGoalsCommandOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  errors.push(...checkCoordinatorStaysDeleted(repositoryRoot));
  const requiredOwnerFiles = [
    "plugins/native/goals/src/module/goal-commands.ts",
    "plugins/native/goals/src/module/guidance-commands.ts",
    "plugins/native/goals/src/module/lifecycle-archive.ts",
    "plugins/native/goals/src/module/lifecycle-commands.ts",
    "plugins/native/goals/src/module/planning/engine.ts",
    "plugins/native/goals/src/module/planning/goal-graph.ts",
    "plugins/native/goals/src/module/planning/method-catalog.ts",
    "plugins/native/goals/src/module/planning/method-packs.ts",
    "plugins/native/goals/src/module/query.ts",
    "plugins/native/goals/src/module/repository.ts",
    "plugins/native/goals/src/contract/goals.ts",
    "plugins/native/goals/src/goal-query-application.ts",
  ];
  for (const relativePath of [
    "plugins/native/goals/src/module/risk-commands.ts",
    "plugins/native/goals/src/module/lifecycle-completion.ts",
    "plugins/native/goals/src/module/lifecycle-reasons.ts",
    "plugins/native/goals/src/module/lifecycle-revalidation.ts",
    "plugins/native/goals/src/module/lifecycle-revisions.ts",
    "plugins/native/goals/src/module/planning/decomposition-coverage.ts",
    "plugins/native/goals/src/module/planning/decomposition-validation.ts",
  ]) {
    if (fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: retired Goals write owner must stay deleted`);
    }
  }
  for (const relativePath of requiredOwnerFiles) {
    if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: missing Goals command owner boundary`);
    }
  }
  const goalsPackage = WORKSPACE_PACKAGES.find((item) => item.path === "plugins/native/goals");
  if (goalsPackage?.maturity !== "production") {
    errors.push("plugins/native/goals: migrated Goal commands require production maturity");
  }
  for (const capability of ["goals.lifecycle.v1", "goals.planning.v1", "goals.query.v1"]) {
    if (!goalsPackage?.capabilities.includes(capability)) {
      errors.push(`plugins/native/goals: migrated Goal commands require ${capability} capability`);
    }
  }
  const moduleManifest = readJson(path.join(repositoryRoot, "plugins/native/goals/package.json"));
  if (!moduleManifest.files?.includes("methods")) {
    errors.push("plugins/native/goals/package.json: Planning method assets must ship with the Goals package");
  }
  const planningMethodAssets = filesUnder(
    path.join(repositoryRoot, "plugins/native/goals/methods"),
    (filePath) => path.extname(filePath) === ".md",
  );
  if (planningMethodAssets.length !== 37) {
    errors.push(`plugins/native/goals/methods: expected 37 owned Planning method assets, found ${planningMethodAssets.length}`);
  }
  const legacyPlanningMethodAssets = filesUnder(
    path.join(repositoryRoot, "skills/goal-advance/methods"),
    (filePath) => path.extname(filePath) === ".md",
  );
  if (legacyPlanningMethodAssets.length > 0) {
    errors.push("skills/goal-advance/methods: source assets must not duplicate Goals-owned Planning methods");
  }
  const homeInstaller = read("apps/local-host/src/installer/home-release.ts");
  if (
    !hasInText(homeInstaller, '"molis-work-plugin-goals"')
    || !hasInCode(homeInstaller, "skillMethodsDirectory")
    || !hasInCode(homeInstaller, "fs.symlink(")
  ) {
    errors.push("apps/local-host/src/installer/home-release.ts: installed Molis Work Skill must link to packaged Goals method assets");
  }

  const factMaterializerPath = "plugins/native/goals/src/goal-tree-fact-materializer.ts";
  const factMaterializer = read(factMaterializerPath);
  if (!hasInCode(factMaterializer, "this.createIntent(")
      || factMaterializer.includes("applyAcceptedContractRevision(")
      || /\bthis\.store\b|\b(?:INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/iu.test(factMaterializer)) {
    errors.push(`${factMaterializerPath}: confirmed Goal materialization must create event-owned Goal intent, not legacy lifecycle or SQL`);
  }
  const decideContractPath = "plugins/native/goals/src/legacy-contract-decision.ts";
  if (fs.existsSync(path.join(repositoryRoot, decideContractPath))) {
    errors.push(`${decideContractPath}: retired contract decision owner must stay deleted`);
  }
  const reconciliationPath = "plugins/native/goals/src/lifecycle-application.ts";
  if (fs.existsSync(path.join(repositoryRoot, reconciliationPath))) {
    errors.push(`${reconciliationPath}: retired lifecycle reconciliation owner must stay deleted`);
  }
  // S8 (PG-020): Goals' tables are Goals' own. The baseline no longer composes them; the platform makes them from the Manifest.
  const baselineSchema = read("apps/local-host/src/project-database-schema.ts");
  if (!hasInCode(read("apps/local-host/src/project-database.ts"), "PROJECT_DATABASE_BASELINE")
      || /GOALS_PROJECT_DATABASE|GOAL_BOARDS_SCHEMA_SQL|GOALS_SCHEMA_SQL|GOAL_INPUT_BINDINGS_SCHEMA_SQL|GOAL_EVENT_FACTS_SCHEMA_SQL|GOAL_EVENT_STATE_SCHEMA_SQL|GOVERNANCE_SCHEMA_SQL|molis-work-module-goals|molis-work-plugin-goals|molis-work-module-governance-collaboration/u.test(baselineSchema)) {
    errors.push("apps/local-host/src/project-database-schema.ts: the project database baseline must not compose Goals' or Governance's schema; Goals declares its tables in its Manifest (databases.project)");
  }
  if (!matchesInCode(read("plugins/native/goals/src/manifest.ts"), /databases:\s*\{\s*project:\s*GOALS_PROJECT_DATABASE\s*(?:,\s*home:\s*GOALS_HOME_DATABASE\s*)?\}/u)) {
    errors.push("plugins/native/goals/src/manifest.ts: Goals' Manifest must declare its project library tables (databases.project: GOALS_PROJECT_DATABASE, and its Home library as databases.home)");
  }

  for (const relativePath of [
    "src/planning/goal-graph.ts",
    "src/planning/method-catalog.ts",
    "src/planning/method-packs.ts",
    "src/v1/goal-decomposition-validation.ts",
  ]) {
    if (fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: GW4 requires the zero-caller Planning compatibility entrypoint to stay deleted`);
    }
  }

  const planningTest = read("tests/planning-engine.test.ts");
  if (!hasImportFrom(planningTest, "./fixtures/goals-modules.js")) {
    errors.push("tests/planning-engine.test.ts: Planning behavior must be tested through the Goals public API");
  }

  const queryTest = read("tests/goals-query-module.test.ts");
  if (
    !hasImportFrom(queryTest, "./fixtures/goals-modules.js")
    || !hasInCode(queryTest, "goals.query.readGoal")
    || !hasInCode(queryTest, "goals.query.snapshot")
  ) {
    errors.push("tests/goals-query-module.test.ts: Goal facts and parity must be tested through the public Query API");
  }

  const goalReadApplicationPath = "plugins/native/goals/src/goal-query-application.ts";
  const goalReadApplication = read(goalReadApplicationPath);
  if (
    !hasInCode(goalReadApplication, "GoalsQueryApi")
    || !hasInCode(goalReadApplication, "this.goals.readGoal")
  ) {
    errors.push(`${goalReadApplicationPath}: Goal-owned facts must come from the public Goals Query API`);
  }
  if (
    goalReadApplication.includes("GoalsRepository")
    || /\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/iu.test(goalReadApplication)
    || /\bthis\.(?:db|store)\b/u.test(goalReadApplication)
  ) {
    errors.push(`${goalReadApplicationPath}: compatibility composition must not own Goal persistence or bypass Goals Query`);
  }
  for (const relativePath of ["apps/local-host/src/demo-feed-library.ts", ...["application-assembly.ts", "plugin.ts", "goal-promotion.ts"].map(file => `plugins/native/feed/src/${file}`)]) {
    errors.push(...checkGoalReadOwnerSql(read(relativePath)).map(error => `${relativePath}: ${error}`));
  }
  errors.push(...checkNoGoalTypedAdapters(["apps", "horizontal", "modules", "packages", "plugins", "server"]
    .flatMap(directory => filesUnder(path.join(repositoryRoot, directory), file => /\.(?:ts|tsx|mts)$/u.test(file) && !/[\\/](?:tests?|__tests__)[\\/]/u.test(file)))
    .map(file => ({ path: path.relative(repositoryRoot, file).split(path.sep).join("/"), source: fs.readFileSync(file, "utf8") }))));
  for (const relativePath of [...WEB_DISPATCH_FILES, "apps/mcp/src/tool-dispatch.ts", "apps/cli/src/command-dispatch.ts"]) {
    const source = read(relativePath);
    errors.push(...checkGoalReadOwnerSql(source).map(error => `${relativePath}: ${error}`));
    if (
      /\bcoordinator(?:ForResume)?\.(?:readGoalContract|readProjectGuidance|listTrashedGoals|getResolvedGoalPolicy)\b/u.test(source)
    ) {
      errors.push(`${relativePath}: Goal read callers must use the public Goal query application boundary`);
    }
    // web-request.ts used to be required to call goalQueries: its only call was the Goal-title port it injected into Coding. Coding now
    // reads titles through Goals' public read action (C2, PG-091), so no entry or dispatcher reads a Goal through goalQueries any more.
    if (source.includes(".goalQueries.")) errors.push(`${relativePath}: migrated Goal reads must not bypass the Host Client`);
  }

  // Transport entrypoints consume Host clients / actions. The old pass-through
  // GoalsApplicationApi factories had no callers and exposed bypass commands.
  for (const relativePath of ["apps/workbench/src/ui-composition.ts", "apps/mcp/src/index.ts", "apps/cli/src/index.ts"]) {
    const app = read(relativePath);
    if (/GoalsApplicationApi|create(?:Workbench|Mcp|Cli)GoalsAdapter/u.test(app)) {
      errors.push(`${relativePath}: retired direct Goals application adapters must stay removed`);
    }
    if (/molis-work-module-goals|molis-work-plugin-goals\/(?:module|governance)|\b(?:SqliteMolisWorkStore|GoalsRepository|MolisWorkCoordinator)\b/u.test(app)) {
      errors.push(`${relativePath}: App composition must not own Goal business implementations`);
    }
  }
  errors.push(...checkGoalTransportCallers({
    cli: { dispatcher: read("apps/cli/src/command-dispatch.ts"), project: read("apps/local-host/src/cli-project.ts") },
    mcp: { dispatcher: read("apps/mcp/src/tool-dispatch.ts"), host: read("apps/local-host/src/mcp-v1-tool.ts") },
    entries: readEntrySources(repositoryRoot),
  }));
  for (const app of ["mcp", "cli"]) {
    if (fs.existsSync(path.join(repositoryRoot, `apps/${app}/src/goal-commands.ts`))) {
      errors.push(`apps/${app}/src/goal-commands.ts: retired duplicate Goal command handler must stay removed`);
    }
  }
  errors.push(...checkGoalsCommandOwnership({
    goalsPlugin: read("plugins/native/goals/src/plugin.ts"),
    httpContext: read("plugins/native/goals/src/http/types.ts"),
    hostSources: hostSourceFiles(repositoryRoot),
  }));
  // `relations` left the retired list when the workbench redesign brought Goal
  // relation editing back as a product feature. It stays here so it still has to
  // consume public operation ports instead of owning Store, SQL or Module rules.
  for (const file of ["create", "policy-guidance", "lifecycle", "decisions", "events", "relations"]) {
    const nativePath = `plugins/native/goals/src/http/${file}.ts`;
    const source = read(nativePath);
    errors.push(...checkGoalStorageOwnership(source).map(error => `${nativePath}: ${error}`));
    if (/molis-work-app-|molis-work-module-|node:http|\b(?:LocalProjectDatabase|GoalProjectApplication|SqliteMolisWorkStore|GoalsRepository)\b/u.test(source)) {
      errors.push(`${nativePath}: Native Goal requests must consume public operation ports without Host or Module implementations`);
    }
  }
  for (const file of ["draft", "risk-impact", "verification", "input"]) {
    const nativePath = `plugins/native/goals/src/http/${file}.ts`;
    if (fs.existsSync(path.join(repositoryRoot, nativePath))) {
      errors.push(`${nativePath}: retired old protocol HTTP write adapter must stay removed`);
    }
  }
  const removedFacadeCall = /\bcoordinator(?:ForResume)?\.(?:addProjectGuidance|updateProjectGuidance|createGoal|updateDraftGoal|addRelation|deactivateRelation|setPolicy|addRisk|updateRisk|setRiskState|setGoalArchived|setGoalTrashed|revalidateGoal|evaluateLeafCompletion|effectivePlanningMethods|projectPlanningComposition|saveProjectPlanningMethod|analyzePlanningChange|validatePlanningGraph)\b/u;
  for (const relativePath of [
    ...WEB_DISPATCH_FILES,
    "apps/mcp/src/tool-dispatch.ts",
    "apps/cli/src/command-dispatch.ts",
    "apps/local-host/src/demo-seed.ts",
    "plugins/native/feed/src/plugin.ts",
    "plugins/native/feed/src/goal-promotion.ts",
  ]) {
    if (removedFacadeCall.test(read(relativePath))) {
      errors.push(`${relativePath}: GW4 caller still uses a removed MolisWorkCoordinator Goal facade`);
    }
  }

  for (const relativePath of filesUnder(path.join(repositoryRoot, "plugins/native/goals/src/module"), (filePath) =>
    SOURCE_EXTENSIONS.has(path.extname(filePath)))) {
    const source = fs.readFileSync(relativePath, "utf8");
    const lineCount = source.split(/\r?\n/u).length;
    if (lineCount > 700) {
      errors.push(`${path.relative(repositoryRoot, relativePath)}: ${lineCount} lines exceeds the migrated owner limit; split by responsibility`);
    }
    if (
      /\b(?:FROM|INTO|UPDATE|DELETE FROM)\s+(claims|runs|review_obligations)\b/iu.test(source)
    ) {
      errors.push(`${path.relative(repositoryRoot, relativePath)}: lifecycle code must use explicit cross-owner ports`);
    }
  }
  return { errors };
}

export function checkMigratedGovernanceOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const requiredOwnerFiles = [
    "plugins/native/goals/src/contract/governance-collaboration.ts",
    "plugins/native/goals/src/governance/index.ts",
    "plugins/native/goals/src/governance/repository.ts",
    "plugins/native/goals/src/governance/record-store.ts",
    "plugins/native/goals/src/governance/goal-tree-records.ts",
    "plugins/native/goals/src/governance/state-machine.ts",
    "tests/governance-collaboration-module.test.ts",
  ];
  for (const relativePath of requiredOwnerFiles) {
    if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: missing Governance owner boundary`);
    }
  }
  if (fs.existsSync(path.join(repositoryRoot, "plugins/native/goals/src/governance/review-lifecycle.ts"))) {
    errors.push("plugins/native/goals/src/governance/review-lifecycle.ts: retired review write owner must stay deleted");
  }

  const governancePackage = WORKSPACE_PACKAGES.find((item) => item.path === "plugins/native/goals");
  if (governancePackage?.maturity !== "production") {
    errors.push("plugins/native/goals: EX3 requires production maturity");
  }
  for (const capability of ["governance.proposals.v1", "governance.decisions.v1", "governance.event-decisions.v1"]) {
    if (!governancePackage?.capabilities.includes(capability)) {
      errors.push(`plugins/native/goals: missing ${capability} capability`);
    }
  }

  const contractPath = "plugins/native/goals/src/contract/governance-collaboration.ts";
  const contract = read(contractPath);
  for (const publicApi of [
    "GovernanceQueryApi",
    "GovernanceRecordsApi",
    "GovernanceDecisionApi",
    "GovernanceEventDecisionApi",
    "GovernanceApplicationApi",
  ]) {
    if (!hasInCode(contract, `interface ${publicApi}`)) {
      errors.push(`${contractPath}: missing public ${publicApi}`);
    }
  }

  const governanceTables = "review_obligations|reviews|candidates|contract_proposals|rewires|goal_tree_proposals|goal_tree_proposal_items|goal_tree_proposal_decisions";
  const directGovernanceSql = new RegExp(
    `\\b(?:CREATE TABLE IF NOT EXISTS|FROM|INTO|UPDATE|DELETE FROM)\\s+(?:${governanceTables})\\b`,
    "giu",
  );
  for (const filePath of filesUnder(
    path.join(repositoryRoot, "plugins/native/goals/src/governance"),
    (candidate) => SOURCE_EXTENSIONS.has(path.extname(candidate)),
  )) {
    const lineCount = fs.readFileSync(filePath, "utf8").split(/\r?\n/u).length;
    if (lineCount > 400) {
      errors.push(`${path.relative(repositoryRoot, filePath)}: ${lineCount} lines exceeds the Governance owner limit; split by responsibility`);
    }
  }

  const testPath = "tests/governance-collaboration-module.test.ts";
  const test = read(testPath);
  for (const [requiredBehavior, has] of [
    ["authority_source", hasInCode],
    ["conversation_ref", hasInCode],
    ["materializeAtomically", hasInCode],
    ["assert.throws", hasInCode],
    ["runtime_dialogue", hasInText],
  ]) {
    if (!has(test, requiredBehavior)) {
      errors.push(`${testPath}: missing EX3 coverage for ${requiredBehavior}`);
    }
  }
  return { errors };
}

function checkExecutionValidationOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const requiredFiles = [
    "plugins/native/goals/src/execution-validation-contract.ts",
    "plugins/native/goals/src/action-projection.ts",
    "plugins/native/goals/src/action-projection-index.ts",
    "plugins/native/goals/src/action-projection-factory.ts",
    "plugins/native/goals/src/execution-validation-application.ts",
    "plugins/native/goals/src/execution-validation-claim-commands.ts",
    "plugins/native/goals/src/execution-validation-run-commands.ts",
    "plugins/native/goals/src/execution-validation-verification-commands.ts",
    "plugins/native/goals/src/execution-validation-ports.ts",
    "plugins/native/goals/src/work-state-queries.ts",
    "plugins/native/goals/src/draft-dialogue-application.ts",
    "apps/workbench/src/execution-validation-ui.ts",
  ];
  for (const relativePath of requiredFiles) {
    if (fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: retired execution-validation/draft owner must stay deleted`);
    }
  }

  for (const relativePath of [
    "src/v1/action-projection.ts",
    "src/v1/contract-revisions.ts",
    "src/v1/human-review.ts",
    "src/v1/parent-completion.ts",
  ]) {
    if (fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: zero-caller execution compatibility implementation must stay deleted`);
    }
  }

  const appAdapters = [
    {
      appPath: "apps/workbench/src/index.ts",
      callerPath: "apps/local-host/src/web-request.ts",
      factory: "createWorkbenchExecutionValidationAdapter",
      capability: "workbench.execution-validation-adapter.v1",
    },
    {
      appPath: "apps/mcp/src/index.ts",
      callerPath: "apps/mcp/src/tool-dispatch.ts",
      factory: "createMcpExecutionValidationAdapter",
      capability: "mcp.execution-validation-adapter.v1",
    },
    {
      appPath: "apps/cli/src/index.ts",
      callerPath: "apps/cli/src/command-dispatch.ts",
      factory: "createCliExecutionValidationAdapter",
      capability: "cli.execution-validation-adapter.v1",
    },
  ];
  for (const { appPath, callerPath, factory, capability } of appAdapters) {
    const app = read(appPath) + (appPath === "apps/workbench/src/index.ts" ? read("apps/workbench/src/ui-composition.ts") : "");
    const caller = read(callerPath);
    if (
      app.includes("ExecutionValidationApplicationApi")
      || app.includes(`function ${factory}`)
      || app.includes(`"${capability}"`)
    ) {
      errors.push(`${appPath}: retired ${factory} public adapter must stay deleted`);
    }
    if (
      app.includes("@molis-ai/molis-work-plugin-goals/governance")
      || /\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/iu.test(app)
      || /\b(?:SqliteMolisWorkStore|MolisWorkCoordinator)\b/u.test(app)
    ) {
      errors.push(`${appPath}: execution adapter must not import Module implementations, Store, or copied rules`);
    }
    if (
      caller.includes("createExecutionEntryClient(client)")
      || caller.includes("createWorkbenchExecutionValidationAdapter")
      || caller.includes("executionAdapter.")
      || /coordinator(?:ForResume)?\.executionValidation\.(?:query|commands)\./u.test(caller)
    ) {
      errors.push(`${callerPath}: retired public execution-validation entry wiring must stay removed`);
    }
  }

  const renderer = read("apps/workbench/src/renderer.ts");
  for (const functionName of [
    "renderClaimCell",
    "renderRunCell",
    "renderEvidenceRecord",
    "renderEvidenceForm",
    "renderEvidenceSubmitForm",
    "renderEvidenceCell",
    "renderReviewCell",
  ]) {
    if (renderer.includes(`function ${functionName}(`)) {
      errors.push(`apps/workbench/src/renderer.ts: retired ${functionName} must not return as a Workbench renderer`);
    }
  }

  return { errors };
}

export function checkArtifactsOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const contractPath = "packages/contracts/src/modules/artifacts.ts";
  const contract = read(contractPath);
  for (const [required, has] of [
    ['maturity: "partial"', hasInText],
    ["ArtifactReference", hasInCode],
    ["ArtifactVersionRecord", hasInCode],
    ["RegisterArtifactVersionInput", hasInCode],
    ["ArtifactsApplicationApi", hasInCode],
    ["team_share_authorized", hasInCode],
  ]) {
    if (!has(contract, required)) {
      errors.push(`${contractPath}: AR1 public Contract is missing ${required}`);
    }
  }

  const entryPath = "modules/artifacts/src/index.ts";
  if (!hasInCode(read(entryPath), "class ArtifactsModule")) {
    errors.push(`${entryPath}: AR1 public Module entrypoint is missing class ArtifactsModule`);
  }
  const artifactsPackage = WORKSPACE_PACKAGES.find((item) => item.path === "modules/artifacts");
  if (artifactsPackage?.maturity !== "production") {
    errors.push("modules/artifacts: AR1 owner requires production maturity");
  }
  for (const capability of ["artifacts.identity.v1", "artifacts.version-repository.v1", "artifacts.opaque-content.v1", "artifacts.compatibility.v1"]) {
    if (!artifactsPackage?.capabilities.includes(capability)) {
      errors.push(`modules/artifacts: AR1 owner requires ${capability}`);
    }
  }

  const repository = read("modules/artifacts/src/repository.ts");
  for (const [required, has] of [
    // One engine, two stores: the 成果库 and the process items plugins hand to each other (artifact-positioning A2).
    ["export const ARTIFACT_TABLES", hasInCode],
    ["export const PROCESS_ITEM_TABLES", hasInCode],
    ["CREATE TABLE IF NOT EXISTS ${t.identities}", hasInText],
    ["CREATE TABLE IF NOT EXISTS ${t.versions}", hasInText],
    ["PRIMARY KEY (artifact_id, version)", hasInText],
    ["producer_binding_signature", hasInCode],
    ["content_digest", hasInCode],
  ]) {
    if (!has(repository, required)) {
      errors.push(`modules/artifacts/src/repository.ts: Artifact Repository is missing ${required}`);
    }
  }

  // The lifecycle rules live in the service and in the registration it checks a version with (service.ts, registration.ts).
  const service = read("modules/artifacts/src/service.ts") + read("modules/artifacts/src/registration.ts");
  for (const required of [
    "artifacts.artifact.version_not_increasing",
    "artifacts.artifact.version_conflict",
    "artifacts.artifact.producer_mismatch",
    "artifacts.artifact.hash_mismatch",
    "artifacts.artifact.team_share_not_authorized",
    '"consumer_missing"',
  ]) {
    if (!hasInText(service, required)) {
      errors.push(`modules/artifacts/src/{service,registration}.ts: Artifact lifecycle is missing ${required}`);
    }
  }
  if (/plugins\/(?:native|official-integrations)\//u.test(service + repository)) {
    errors.push("modules/artifacts: Artifact owner must not import producer or consumer Plugin implementations");
  }

  if (fs.existsSync(path.join(repositoryRoot, "src/web/artifact-native-plugin-http.ts"))) {
    errors.push("src/web/artifact-native-plugin-http.ts: migrated Artifact HTTP entry must stay deleted");
  }
  if (fs.existsSync(path.join(repositoryRoot, "src/web/onboarding.ts"))) {
    errors.push("src/web/onboarding.ts: local onboarding state must remain owned by Local Host");
  }
  if (/export function (?:buildMolisWorkWebView|cachedMolisWorkWebView)/u.test(WEB_DISPATCH_FILES.map(read).join("\n"))) {
    errors.push("apps/local-host/src/web-request.ts: Goal read projection and cache must remain outside HTTP routing");
  }
  const artifactHttp = read("apps/local-host/src/artifact-native-plugin-http.ts");
  if (!hasInCode(artifactHttp, "createLocalArtifactHttp") || artifactHttp.includes("@molis-ai/molis-work-app-desktop")) {
    errors.push("Artifact HTTP composition must receive Desktop bootstrap through its Host factory");
  }

  const pluginPath = "plugins/native/artifacts/src/index.ts";
  const nativePlugin = read(pluginPath);
  if (!REGISTERED_PLUGINS.some((plugin) => plugin.path === "plugins/native/artifacts")) {
    errors.push("plugins/native/artifacts: protected Artifact Plugin must declare a registration");
  }
  if (/modules\/artifacts|ArtifactsModule|ArtifactRepository/u.test(nativePlugin)) {
    errors.push(`${pluginPath}: Native Plugin entrypoint must not own Artifact facts or construct its Repository`);
  }

  const projectSchema = read("apps/local-host/src/project-database-schema.ts");
  if (!hasInCode(read("apps/local-host/src/project-database.ts"), "PROJECT_DATABASE_BASELINE") || !hasInCode(projectSchema, "ARTIFACTS_SCHEMA_SQL") || !hasInCode(projectSchema, "PROCESS_ITEMS_SCHEMA_SQL")) {
    errors.push("apps/local-host/src/project-database-schema.ts: the project database baseline must compose the Artifact owner schema");
  }
  // D3: the project's runtime opens the one pair of version stores (the Artifacts module's `projectVersionStores`, RAC-410), and no other host file opens a second.
  const versionStores = read("apps/local-host/src/project-version-stores.ts");
  if (!hasInCode(versionStores, "projectVersionStores") || !hasInCode(versionStores, "readonly artifacts: ArtifactsApplicationApi")) {
    errors.push("apps/local-host/src/project-version-stores.ts: the project's version stores must expose the public Artifacts API");
  }
  const directArtifactSql = /\b(?:CREATE TABLE(?: IF NOT EXISTS)?|FROM|INTO|UPDATE|DELETE FROM)\s+(artifacts|artifact_versions)\b/giu;
  for (const relativePath of ["apps/local-host/src/project-version-stores.ts"]) {
    const source = read(relativePath);
    for (const match of source.matchAll(directArtifactSql)) {
      errors.push(`${relativePath}: direct ${match[1]} SQL must stay inside modules/artifacts`);
    }
  }

  const testPath = "tests/artifacts-module.test.ts";
  const test = read(testPath);
  for (const required of [
    "opaque content, scope and producer binding",
    "artifacts.artifact.version_not_increasing",
    "artifacts.artifact.producer_mismatch",
    "artifacts.artifact.hash_mismatch",
    "artifacts.artifact.team_share_not_authorized",
    "consumer_missing",
    "artifact_unavailable",
  ]) {
    if (!hasInText(test, required)) {
      errors.push(`${testPath}: missing AR1 coverage for ${required}`);
    }
  }

  for (const relativePath of [
    contractPath,
    "modules/artifacts/src/repository.ts",
    "modules/artifacts/src/service.ts",
    pluginPath,
    testPath,
  ]) {
    const lineCount = read(relativePath).split(/\r?\n/u).length;
    if (lineCount > 500) {
      errors.push(`${relativePath}: ${lineCount} lines exceeds the AR1 owner limit; split by responsibility`);
    }
  }
  return { errors };
}

export function checkPrivateWorkContextOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const requiredOwnerFiles = [
    "modules/private-work-context/src/context-bindings.ts",
    "modules/private-work-context/src/runtime-context-module.ts",
    "packages/contracts/src/modules/private-work-context.ts",
    "tests/runtime-binding-ledger.test.ts",
  ];
  for (const relativePath of requiredOwnerFiles) {
    if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: missing Private Work Context owner boundary`);
    }
  }

  const contract = read("packages/contracts/src/modules/private-work-context.ts");
  for (const [required, has] of [
    ['maturity: "partial"', hasInText],
    ["RuntimeContextBindingRecord", hasInCode],
  ]) {
    if (!has(contract, required)) {
      errors.push(`packages/contracts/src/modules/private-work-context.ts: missing ${required}`);
    }
  }

  const entry = read("modules/private-work-context/src/index.ts");
  if (!hasInCode(entry, "createRuntimeContextModule")) {
    errors.push("modules/private-work-context/src/index.ts: missing createRuntimeContextModule");
  }
  const privateWorkContextPackage = WORKSPACE_PACKAGES.find((item) => item.path === "modules/private-work-context");
  if (privateWorkContextPackage?.maturity !== "slice") {
    errors.push("modules/private-work-context: owner requires slice maturity");
  }
  if (!privateWorkContextPackage?.capabilities.includes("runtime-context-bindings")) {
    errors.push("modules/private-work-context: owner requires runtime-context-bindings capability");
  }

  if (entry.includes("RuntimeContextBindingRepository")) {
    errors.push("modules/private-work-context/src/index.ts: Runtime binding Repository must remain private");
  }

  for (const retired of ["src/sessions/registry.ts","src/sessions/content-store.ts"]) {
    if (fs.existsSync(path.join(repositoryRoot, retired))) {
      errors.push(`${retired}: retired after WK3 caller cutover; use the public owner entrypoint`);
    }
  }
  for (const retired of ["src/sessions/types.ts", "src/sessions/compatibility.ts"]) {
    if (fs.existsSync(path.join(repositoryRoot, retired))) errors.push(`${retired}: retired; use the public Session owner`);
  }

  const catalog = read("apps/local-host/src/project-catalog.ts");
  if (!hasInCode(catalog, "createRuntimeContextModule")) {
    errors.push("apps/local-host/src/project-catalog.ts: Runtime binding composition must use the Private Work Context public entrypoint");
  }
  if (catalog.includes("RuntimeContextBindingRepository")) {
    errors.push("apps/local-host/src/project-catalog.ts: Runtime binding Repository must remain private");
  }
  const directContextSql = /\b(?:CREATE TABLE(?: IF NOT EXISTS)?|FROM|INTO|UPDATE|DELETE FROM)\s+(runtime_context_bindings|runtime_context_binding_events|runtime_context_setup_requests|runtime_context_suggestion_rejections)\b/giu;
  for (const match of catalog.matchAll(directContextSql)) {
    errors.push(`apps/local-host/src/project-catalog.ts: direct ${match[1]} SQL must stay inside modules/private-work-context`);
  }

  for (const relativePath of requiredOwnerFiles.filter((file) => file.endsWith(".ts"))) {
    const lineCount = read(relativePath).split(/\r?\n/u).length;
    if (lineCount > 500) {
      errors.push(`${relativePath}: ${lineCount} lines exceeds the WK1 owner limit; split by responsibility`);
    }
  }
  return { errors };
}

export function checkRuntimeHostOwnership(repositoryRoot) {
  const errors = [];
  const read = (relativePath) => fs.readFileSync(path.join(repositoryRoot, relativePath), "utf8");
  const ownerFiles = [
    "horizontal/runtime-host/src/adapters/terminal-pty.ts",
  ];
  for (const relativePath of [
    ...ownerFiles,
    "packages/contracts/src/services/runtime-host.ts",
    "tests/runtime-host.test.ts",
  ]) {
    if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
      errors.push(`${relativePath}: missing Runtime Host owner boundary`);
    }
  }
  if (errors.length > 0) return { errors };

  const contract = read("packages/contracts/src/services/runtime-host.ts");
  for (const [required, has] of [
    ['maturity: "partial"', hasInText],
    ["PtySpawnRequest", hasInCode],
    ["PtySpawnResult", hasInCode],
    ["PtyHostHandlers", hasInCode],
  ]) {
    if (!has(contract, required)) {
      errors.push(`packages/contracts/src/services/runtime-host.ts: missing ${required}`);
    }
  }

  const entry = read("horizontal/runtime-host/src/index.ts");
  if (!hasInCode(entry, "MolisWorkPtyHost")) {
    errors.push("horizontal/runtime-host/src/index.ts: missing MolisWorkPtyHost");
  }
  const runtimeHostPackage = WORKSPACE_PACKAGES.find((item) => item.path === "horizontal/runtime-host");
  if (runtimeHostPackage?.maturity !== "slice") {
    errors.push("horizontal/runtime-host: owner requires slice maturity");
  }
  for (const capability of ["runtime.host.v1", "runtime.terminal-pty.v1"]) {
    if (!runtimeHostPackage?.capabilities.includes(capability)) {
      errors.push(`horizontal/runtime-host: owner requires ${capability}`);
    }
  }

  const ownerSource = ownerFiles.map(read).join("\n");
  for (const forbidden of [
    "MolisWorkSessionRegistry",
    "@molis-ai/molis-work-module-private-work-context",
    "better-sqlite3",
    "SqliteMolisWorkStore",
    "src/web/server",
  ]) {
    if (ownerSource.includes(forbidden)) {
      errors.push(`horizontal/runtime-host: ${forbidden} belongs to a business owner or caller`);
    }
  }

  for (const retired of ["src/sessions/adapters.ts", "src/sessions/codex-transport.ts", "src/web/pty-host.ts", "src/web/desktop-shell.ts", "src/web/visual-foundation.ts", "src/web/pty-socket.ts", "src/web/capsule.ts"]) {
    if (fs.existsSync(path.join(repositoryRoot, retired))) {
      errors.push(`${retired}: retired after WK3 caller cutover; use the public owner entrypoint`);
    }
  }
  if (!hasImportFrom(read("apps/local-host/src/web-request.ts"), "@molis-ai/molis-work-service-runtime-host")) {
    errors.push("apps/local-host/src/web-request.ts: Runtime composition must consume the public Runtime Host entrypoint");
  }
  if (!hasImportFrom(read("apps/local-host/src/pty-socket.ts"), "@molis-ai/molis-work-service-runtime-host")) {
    errors.push("apps/local-host/src/pty-socket.ts: PTY socket must consume the public Runtime Host entrypoint");
  }

  for (const relativePath of ownerFiles) {
    const lineCount = read(relativePath).split(/\r?\n/u).length;
    if (lineCount > 500) {
      errors.push(`${relativePath}: ${lineCount} lines exceeds the WK2 owner limit; split by responsibility`);
    }
  }
  return { errors };
}

/** W3-07-5-01 / W3-07-9-01: no definition, registration, export or caller may restore a retired Goals or development protocol. */
export function checkNoGoalTypedAdapters(files) {
  const retiredModules = new Set(["board-entry-capabilities", "goal-event-entry-capabilities", "proposal-capabilities"]);
  const retiredNames = new Set(["initializeBoardCapability", "snapshotBoardCapability", "createGoalIntentCapability",
    "recordGoalUserDecisionCapability", "goalTreeCapabilities", "createGoalProposalClients", "readProjectGuidanceCapability", "setActiveGoalCapability",
    "InitializeBoardInput", "GoalEventEntryApi", "GoalEventDecideEvidence", "GoalEventDecideEntryInput",
    "GoalTreeCheckEntryInput", "GoalTreeSubmitEntryInput", "GoalTreeDecideEvidence", "GoalTreeDecideEntryInput", "GoalTreeEntryApi", "goalContextCapabilities", "goalProgressCapabilities", "GoalProgressActor", "pluginDevelopmentCapability"]);
  const retiredIds = new Set(["io.molis.work.local-host.board.initialize", "io.molis.work.local-host.board.snapshot",
    "io.molis.work.goals.events.create-intent", "io.molis.work.goals.events.decide", "io.molis.work.goals.submit-goal-tree-proposal",
    "io.molis.work.goals.list-goal-tree-proposals", "io.molis.work.goals.check-goal-tree-proposal", "io.molis.work.goals.decide-goal-tree-proposal",
    "io.molis.work.local-host.project.guidance", "io.molis.work.local-host.goals.set-active", "goals.context.list.v1", "goals.context.read.v1", "goals.progress.record.v1", "goals.progress.receipt.v1", "io.molis.work.local-host.plugin.development"]);
  const errors = [];
  for (const { path: relativePath, source } of files) {
    const moduleName = value => value.replace(/\.(?:[cm]?[jt]s|tsx)$/u, "").split("/").at(-1);
    const named = new Set();
    if (retiredModules.has(moduleName(relativePath))) named.add(relativePath);
    const file = ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true);
    const literalText = node => {
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isParenthesizedExpression(node)) return literalText(node.expression);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const left = literalText(node.left), right = literalText(node.right);
        return left === undefined || right === undefined ? undefined : left + right;
      }
      return undefined;
    };
    const visit = node => {
      if (ts.isIdentifier(node) && retiredNames.has(node.text)) named.add(node.text);
      const literal = literalText(node);
      if (literal !== undefined && (retiredIds.has(literal) || retiredNames.has(literal) || retiredModules.has(moduleName(literal)))) named.add(literal);
      ts.forEachChild(node, visit);
    };
    visit(file);
    for (const name of named) errors.push(`${relativePath}: ${name} is ${name === "pluginDevelopmentCapability" || name === "io.molis.work.local-host.plugin.development"
      ? "a retired private development protocol; use developInPrivateHost" : "a retired Goals typed adapter; use the registered Goals action"}`);
  }
  return errors;
}

/** The entry packages' source files the `entries` part reads: TypeScript and JavaScript in any module flavour or with JSX, not only `.ts`. */
export const ENTRY_SOURCE_FILE = /\.(?:tsx?|jsx?|[cm][tj]s)$/u;
/**
 * How the platform's entries call a Goals action (PG-031, tightened by PG-111): by the id and version Goals registers it under,
 * out of a table the dispatcher declares itself, never by a descriptor taken from a Goals contract. The table's name in each dispatcher.
 */
const CLI_GOALS_TABLE = "GOALS";
const MCP_GOALS_TABLE = "MANAGEMENT_GOAL_ACTIONS";
/** The modules the CLI dispatcher may reach: the action contract and its own protocol file. */
const CLI_DISPATCHER_MODULES = new Set(["@molis-ai/molis-work-contracts/platform/actions", "./protocol.js"]);
/** The modules the MCP dispatcher may reach: the action contract and the presentation error type. */
const MCP_DISPATCHER_MODULES = new Set(["@molis-ai/molis-work-contracts/platform/actions", "./goal-presentation.js"]);
/**
 * A specifier that reaches Goals' contract: the Goals plugin package (its `/contract` subpath included), its source tree by path, or one of the
 * platform contracts' old Goals subpaths (`modules/goals`, `modules/goal-*`, `modules/governance-collaboration`, moved into the plugin by PG-111).
 */
const GOALS_CONTRACT_SPECIFIER = /molis-work-plugin-goals|plugins\/native\/goals\/|modules\/(?:goals|goal-[a-z-]+|governance-collaboration)(?:\.js)?$/u;
/** The ways the Host opens a project or reaches Goals; the dispatcher is handed the management port and holds none of them. */
const HOST_CLIENT_NAMES = new Set(["LocalHostProjectClient", "actionClient", "client", "withProject", "withScope", "coordinator"]);

/**
 * Every module a file reaches, whatever the syntax: import and `export … from` declarations, `import x = require()`, `import()` and
 * `require()` calls, import types. `specifier` is undefined when it is not a string literal (the gate cannot read where it goes).
 */
function moduleReferences(file) {
  const found = [];
  const add = (node, kind, literal) => found.push({ node, kind, specifier: literal && ts.isStringLiteralLike(literal) ? literal.text : undefined });
  const visit = node => {
    if (ts.isImportDeclaration(node)) add(node, "import", node.moduleSpecifier);
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node, "re-export", node.moduleSpecifier);
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) add(node, "require()", node.moduleReference.expression);
    else if (ts.isImportTypeNode(node)) add(node, "import type", ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined);
    else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, "import()", node.arguments[0]);
    else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") add(node, "require()", node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/**
 * The transport entries reach Goals through the platform, not through a Host client of their own, and name no Goals contract. `entries`: no
 * file of the CLI or MCP package references a Goals contract or the Goals package under any syntax. `cli`: the dispatcher is handed the
 * management port the Host builds (`CliManagementActions`), reaches only the action contract and its protocol file, calls each Goals action
 * by a `GOALS.<name>` entry of the id-and-version table it declares, holds no Host client under any spelling and reads the snapshot through
 * Goals' own action; `cli-project.ts` builds that port with
 * `bindGoalsManagementActions(<host>.actionClient(reference), reference)`, over the project's client (it starts the project's
 * plugins, Goals among them) and the very reference the command is bound to, and hands the dispatcher what it returned. `mcp`: the dispatcher takes only
 * the Host's management port or null; mcp-v1-tool builds it only for management over the same client/reference. Each part is the source text of the file it names; a comment or a
 * string is not a caller.
 */
export function checkGoalTransportCallers({ cli, mcp, entries }) {
  // A caller that forgets the entries must not pass the rule by skipping it.
  if (!Array.isArray(entries)) throw new TypeError("checkGoalTransportCallers: entries (the entry packages' source files) are required");
  const errors = [];
  const dispatcherPath = "apps/cli/src/command-dispatch.ts";
  const dispatcher = ts.createSourceFile(dispatcherPath, cli.dispatcher, ts.ScriptTarget.Latest, true);
  for (const { path: entryPath, source } of entries) {
    for (const { kind, specifier } of moduleReferences(ts.createSourceFile(entryPath, source, ts.ScriptTarget.Latest, true))) {
      if (specifier !== undefined && GOALS_CONTRACT_SPECIFIER.test(specifier)) {
        errors.push(`${entryPath}: a ${kind} of ${specifier} is a Goals contract; the CLI and MCP call Goals' actions by id and version from the action directory and name no Goals contract (PG-111)`);
      }
    }
  }
  for (const { kind, specifier } of moduleReferences(dispatcher)) {
    if (specifier === undefined) {
      errors.push(`${dispatcherPath}: a ${kind} of a module the gate cannot read (not a string literal); the CLI dispatcher reaches only the action contract and its protocol file`);
    } else if (!CLI_DISPATCHER_MODULES.has(specifier)) {
      errors.push(`${dispatcherPath}: imports ${specifier} (${kind}); the CLI dispatcher reaches only the action contract and its protocol file, and takes no Goals descriptor from any Goals contract`);
    }
  }
  const names = new Set(), held = new Set(), called = new Set();
  let snapshot = false;
  const visit = node => {
    if (ts.isIdentifier(node)) {
      names.add(node.text);
      if (HOST_CLIENT_NAMES.has(node.text)) held.add(node.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && HOST_CLIENT_NAMES.has(node.argumentExpression.text)) held.add(node.argumentExpression.text);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "invoke") {
      const action = node.arguments[0];
      if (action && ts.isPropertyAccessExpression(action) && ts.isIdentifier(action.expression) && action.expression.text === CLI_GOALS_TABLE) {
        called.add(action.name.text);
        if (action.name.text === "snapshot") snapshot = true;
      } else errors.push(`${dispatcherPath}: invoke must name a Goals action of the ${CLI_GOALS_TABLE} table, never a descriptor taken from elsewhere`);
    }
    ts.forEachChild(node, visit);
  };
  visit(dispatcher);
  if (!tableDeclared(dispatcher, CLI_GOALS_TABLE)) errors.push(`${dispatcherPath}: declare the ${CLI_GOALS_TABLE} table of Goals action ids and versions the commands call`);
  if (!names.has("CliManagementActions")) errors.push(`${dispatcherPath}: the CLI dispatcher must take the management port the Host builds (CliManagementActions)`);
  for (const name of held) {
    errors.push(`${dispatcherPath}: ${name} is how the Host opens a project or reaches Goals; the CLI calls Goals' actions through the management port and holds no Host client (LocalHostProjectClient, client, withProject, withScope, actionClient, coordinator.goals)`);
  }
  if (!snapshot) errors.push(`${dispatcherPath}: the CLI snapshot must be read through ${CLI_GOALS_TABLE}.snapshot`);

  errors.push(...checkGoalsManagementWiring(cli.project, "cli"));
  errors.push(...checkMcpGoalTransportCallers(mcp));
  return errors;
}

/** Whether the file declares `const <name> = { … }` itself (an import of the same name is another module's and is refused elsewhere). */
function tableDeclared(file, name) {
  let found = false;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      let initializer = node.initializer;
      while (ts.isAsExpression(initializer) || ts.isParenthesizedExpression(initializer)) initializer = initializer.expression;
      if (ts.isObjectLiteralExpression(initializer)) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** The MCP transport holds no Host client; only its Host composition can build the management port. */
function checkMcpGoalTransportCallers({ dispatcher: source, host: hostSource }) {
  const errors = [], toolPath = "apps/mcp/src/tool-dispatch.ts";
  const file = ts.createSourceFile(toolPath, source, ts.ScriptTarget.Latest, true);
  for (const { kind, specifier } of moduleReferences(file)) {
    if (!MCP_DISPATCHER_MODULES.has(specifier)) errors.push(`${toolPath}: imports ${specifier ?? "a module that is not a string literal"} (${kind}); only the action contract and the presentation error type belong to the transport, and no Goals contract`);
  }
  const actions = new Set(); let port = false;
  const visit = node => {
    if (ts.isInterfaceDeclaration(node) && node.name.text === "McpManagementActions") port = true;
    if (ts.isIdentifier(node) && HOST_CLIENT_NAMES.has(node.text)) errors.push(`${toolPath}: ${node.text} is a Host client; use McpManagementActions`);
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && HOST_CLIENT_NAMES.has(node.argumentExpression.text)) errors.push(`${toolPath}: ${node.argumentExpression.text} is a Host client`);
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "invoke") {
      const action = node.arguments[0];
      if (action && ts.isPropertyAccessExpression(action) && ts.isIdentifier(action.expression) && action.expression.text === MCP_GOALS_TABLE) actions.add(action.name.text);
      else errors.push(`${toolPath}: invoke must name a Goals action, never a typed descriptor or caller`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (!port) errors.push(`${toolPath}: declare the Host's McpManagementActions port`);
  if (!tableDeclared(file, MCP_GOALS_TABLE)) errors.push(`${toolPath}: declare the ${MCP_GOALS_TABLE} table of Goals action ids and versions the management tools call`);
  for (const action of ["initialize", "decide", "treeDecide"]) if (!actions.has(action)) errors.push(`${toolPath}: the management tool must invoke ${MCP_GOALS_TABLE}.${action}`);

  errors.push(...checkGoalsManagementWiring(hostSource, "mcp"));
  return errors;
}

/** The tokens whose text is data, not code: a quoted string, a regular expression and every piece of a template's text. */
const LITERAL_TEXT_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);
const REGULAR_EXPRESSION_KINDS = new Set([ts.SyntaxKind.RegularExpressionLiteral]);

/**
 * The source with every comment, and every token in `kinds`, blanked to spaces (offsets and line breaks kept). A literal is blanked
 * whole: its quotes or backticks, a regular expression's slashes and flags, and the `${` and `}` around a template's pieces go with it.
 * The code inside a template's `${ … }` is code and stays.
 */
function blankedSource(source, kinds) {
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  // TypeScript's offsets count UTF-16 code units, which is what split("") gives.
  const text = source.split("");
  const blank = ({ pos, end }) => {
    for (let index = pos; index < end; index += 1) if (text[index] !== "\n") text[index] = " ";
  };
  const visit = node => {
    for (const child of node.getChildren(file)) {
      if (child.kind < ts.SyntaxKind.FirstNode || child.kind === ts.SyntaxKind.EndOfFileToken) {
        for (const range of ts.getLeadingCommentRanges(source, child.getFullStart()) ?? []) blank(range);
        for (const range of ts.getTrailingCommentRanges(source, child.getEnd()) ?? []) blank(range);
        if (kinds.has(child.kind)) blank({ pos: child.getStart(file), end: child.getEnd() });
      } else visit(child);
    }
  };
  visit(file);
  return text.join("");
}

/** The source's code: every comment, and every string, regular expression and piece of template text, blanked, so a comment or a quoted text that names the wiring does not count as it. */
function withoutCommentsAndLiterals(source) {
  return blankedSource(source, LITERAL_TEXT_KINDS);
}

/** The source's code and its quoted text: only comments and regular expressions blanked, so what is left is what the file really says. */
function withoutCommentsAndRegexes(source) {
  return blankedSource(source, REGULAR_EXPRESSION_KINDS);
}

/**
 * The ways a "must contain" check reads a file's text. Each is the old plain `source.includes(…)` (or `regex.test(…)`) AND the same
 * look at a blanked copy, so what was refused before is still refused and only what a comment, a string or a regular expression stood in
 * for is refused now.
 * - `hasInCode`: for a name or a piece of syntax (`class X`, `this.f(`, an identifier). It must be in the code: not in a comment, a
 *   string, a regular expression or template text.
 * - `hasInText`: for text that is the content, an error code, a test title, SQL in a template, `maturity: "partial"`. It must be in the
 *   file's code or in a string or template, not in a comment or a regular expression.
 * - `hasImportFrom`: `from "<specifier>"` must close a real `import` or `export … from` statement, written with double quotes.
 * - `matchesInCode`: a pattern over code, as `hasInCode` is for a name. `matchesStatementInCode` (below): a pattern that holds a quoted
 *   path, which must start in code.
 * Not checked by any of them: that the text sits where it is used. A name that is declared and never used, or a string nobody reads,
 * satisfies its check; aliases and renamed imports are not followed.
 */
export const hasInCode = (source, needle) => source.includes(needle) && withoutCommentsAndLiterals(source).includes(needle);
export const hasInText = (source, needle) => source.includes(needle) && withoutCommentsAndRegexes(source).includes(needle);
export const matchesInCode = (source, pattern) => pattern.test(source) && pattern.test(withoutCommentsAndLiterals(source));
export function hasImportFrom(source, specifier) {
  const ending = `from "${specifier}"`;
  if (!source.includes(ending)) return false;
  const file = ts.createSourceFile("source.ts", source, ts.ScriptTarget.Latest, true);
  return file.statements.some(statement => (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
    && statement.moduleSpecifier !== undefined && statement.getText(file).replace(/;$/u, "").endsWith(ending));
}
/**
 * For a pattern whose text holds a quoted path (`import { X } from "./y.js"`): the old `pattern.test(source)` AND a match, on the source
 * without comments and regular expressions, that STARTS in code. A comment, a regular expression, or a string or template that holds the
 * statement does not start in code (its first character is inside the literal), so it does not count. Only the start is looked at: the
 * rest of the match is the pattern's own business, so a literal after a code start is not told apart, and a statement that is real
 * code but never used satisfies it. `matchAll` does not overlap matches, so a string that holds a run starting like the real statement
 * can swallow the start of the real one after it; that only refuses more than needed, never accepts more than it should.
 */
export function matchesStatementInCode(source, pattern) {
  if (!pattern.test(source)) return false;
  const text = withoutCommentsAndRegexes(source), code = withoutCommentsAndLiterals(source);
  const every = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  return [...text.matchAll(every)].some(found => code[found.index] !== " " && code[found.index] !== "\n");
}

function unwrapped(node) {
  while (node && ts.isParenthesizedExpression(node)) node = node.expression;
  return node;
}

/** `() => homeIntegrationRegistry(home)`, parentheses aside. */
function isHomeRegistryThunk(node) {
  node = unwrapped(node);
  if (!ts.isArrowFunction(node) || node.parameters.length > 0) return false;
  const body = unwrapped(node.body);
  return ts.isCallExpression(body) && ts.isIdentifier(body.expression) && body.expression.text === "homeIntegrationRegistry"
    && body.arguments.length === 1 && ts.isIdentifier(body.arguments[0]) && body.arguments[0].text === "home";
}

const propertyNamed = (property, name) => property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name;
/** A spread or a computed name (`[key]: …`) could be the property that was checked, written again: the name is not read, so it is refused. */
const opaqueProperty = property => ts.isSpreadAssignment(property) || Boolean(property.name && ts.isComputedPropertyName(property.name));

/** Why one `createConnectorSourcePort(…)` call does not take the Home's registry: one options object, no spread, exactly one `registry`. */
function connectorPortProblems(call) {
  const options = unwrapped(call.arguments[0]);
  if (call.arguments.length !== 1 || !options || !ts.isObjectLiteralExpression(options)) {
    return ["the Host's `createConnectorSourcePort` does not take one options object"];
  }
  if (options.properties.some(opaqueProperty)) return ["the Host's `createConnectorSourcePort` options have a spread or a computed name, which could replace `registry`"];
  const registries = options.properties.filter(property => propertyNamed(property, "registry"));
  if (registries.length !== 1 || !ts.isPropertyAssignment(registries[0])) {
    return ["the Host's `createConnectorSourcePort` options do not have exactly one `registry: …`"];
  }
  const value = unwrapped(registries[0].initializer);
  const fallback = ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ? value.right : value;
  return isHomeRegistryThunk(fallback) ? [] : ["the Host's `createConnectorSourcePort` registry is not `() => homeIntegrationRegistry(home)` (alone, or after `??`)"];
}

const isConnectorPortCall = node => {
  node = unwrapped(node);
  return node && ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "createConnectorSourcePort";
};

/** The object `createSourcePullPort` returns: the one site where the Host wires the Feed's Listener connector, or why there is not one. */
function sourcePullPortObject(file) {
  const ports = file.statements.filter(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === "createSourcePullPort" && statement.body);
  const returns = [];
  const visit = node => {
    if (ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node)) returns.push(unwrapped(node.expression));
    ts.forEachChild(node, visit);
  };
  if (ports.length === 1) ts.forEachChild(ports[0].body, visit);
  return ports.length === 1 && returns.length === 1 && returns[0] && ts.isObjectLiteralExpression(returns[0]) ? returns[0] : undefined;
}

/**
 * Why the Feed's Listener wiring is not the platform connector service backed by the Home's integration registry (BL-802). Two kinds
 * of check are made, and nothing else is read.
 *
 * Text checks, one on each of three Feed files. The file's code (`withoutCommentsAndLiterals`: comments, strings, regular expressions
 * and the text of templates blanked, the code inside a template's `${ … }` kept) must contain this text, as plain text:
 * - the Feed service: `this.ports.createListener`;
 * - the Runtime Feed: `services.connector.open(`;
 * - the Feed plugin: `connector = sourcePull?.connector`.
 * This is a substring match, not a reading of the syntax: it does not see what the line does, and a longer name that begins with the
 * same text (`this.ports.createListenerOther`) matches too.
 *
 * Syntax checks on the Host file, read from the syntax tree, so a comment or a quoted text cannot stand in for them:
 * - the file has exactly one top-level `function createSourcePullPort`, its body (nested functions not counted) has exactly one
 *   `return`, and that returns an object literal, parentheses aside;
 * - that object has no spread and no computed name, and exactly one property named `connector`, written
 *   `connector: createConnectorSourcePort({ … })`;
 * - every `connector: createConnectorSourcePort({ … })` property in the file, that one included, passes one options object with no
 *   spread and no computed name and exactly one `registry: …` property, whose value is `() => homeIntegrationRegistry(home)`, or
 *   `<any expression> ?? (() => homeIntegrationRegistry(home))`, parentheses aside.
 *
 * Not checked: the left of `??` is not read at all (T-125 ruling 3: a test may inject any registry there), so
 * `fixtureRegistry ?? (() => homeIntegrationRegistry(home))` passes, and the check does not see which registry runs when the left has
 * a value; it only makes the Home's registry the fallback. Nor is it checked that `createSourcePullPort` is the function the Host
 * builds its source-pull port with, or that `home` and `homeIntegrationRegistry` are what the names say (aliases, shadowing and renamed
 * imports are not followed).
 */
export function feedListenerWiringProblems({ service, runtime, plugin, host }) {
  const problems = [];
  for (const [source, needle, owner] of [
    [service, "this.ports.createListener", "the Feed service"],
    [runtime, "services.connector.open(", "the Runtime Feed"],
    [plugin, "connector = sourcePull?.connector", "the Feed plugin"],
  ]) {
    if (!withoutCommentsAndLiterals(source).includes(needle)) problems.push(`${owner} no longer has \`${needle}\` in its code (a comment, a string, a regular expression or template text does not count)`);
  }
  const file = ts.createSourceFile("host.ts", host, ts.ScriptTarget.Latest, true);
  const port = sourcePullPortObject(file);
  let wired;
  if (!port) problems.push("the Host has no single `createSourcePullPort` returning one object literal");
  else if (port.properties.some(opaqueProperty)) problems.push("the source-pull port `createSourcePullPort` returns has a spread or a computed name, which could replace its `connector`");
  else {
    const connectors = port.properties.filter(property => propertyNamed(property, "connector"));
    if (connectors.length !== 1) problems.push("the source-pull port `createSourcePullPort` returns does not have exactly one `connector`");
    else if (!ts.isPropertyAssignment(connectors[0]) || !isConnectorPortCall(connectors[0].initializer)) {
      problems.push("the source-pull port `createSourcePullPort` returns has no `connector: createConnectorSourcePort({ … })`");
    } else {
      wired = unwrapped(connectors[0].initializer);
      problems.push(...connectorPortProblems(wired));
    }
  }
  const others = [];
  const visit = node => {
    if (ts.isPropertyAssignment(node) && propertyNamed(node, "connector") && isConnectorPortCall(node.initializer) && unwrapped(node.initializer) !== wired) {
      others.push(unwrapped(node.initializer));
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  for (const call of others) problems.push(...connectorPortProblems(call));
  return [...new Set(problems)];
}

export function checkGoalReadOwnerSql(source) {
  return /\b(?:FROM|JOIN|UPDATE|INTO)\s+["`\[]?(?:goals|goal_relations|policy_bindings|project_guidance_entries|project_guidance_revisions|planning_method_packs|acceptance_criteria|goal_trash_records|goal_trash_relation_records)\b/iu.test(source)
    ? ["Goal-owned fact SQL must remain behind the public Goals Query/Command API"] : [];
}

export function checkGoalStorageOwnership(source) {
  const tables = "(?:goals|goal_relations|policy_bindings|project_guidance_entries|project_guidance_revisions|planning_method_packs|acceptance_criteria|goal_trash_records|goal_trash_relation_records|input_bindings)";
  const ddl = new RegExp(`\\b(?:CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?|ALTER\\s+TABLE\\s+|DROP\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?)["\x60\\[]?${tables}\\b`, "iu");
  const index = new RegExp(`\\bCREATE\\s+(?:UNIQUE\\s+)?INDEX\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?\\S+\\s+ON\\s+["\x60\\[]?${tables}\\b`, "iu");
  return [...checkGoalReadOwnerSql(source), ...(ddl.test(source) || index.test(source)
    ? ["Goal schema and migration SQL must remain in the Goals owner; Host only composes public migrations"] : [])];
}

export function checkDraftDialogueOwnership(host) {
  const errors = [];
  for (const method of ["startDraftDialogue", "recordDraftDialogueTurn", "resumeDraftDialogue"]) {
    if (host.includes(`coordinator.${method}(`) || host.includes("coordinator.draftDialogue.")) {
      errors.push(`apps/local-host/src/project-capabilities.ts: retired ${method} Host registration must stay removed`);
    }
  }
  return errors;
}

/** DD2: a tree proposal step is composed by Goals from its Module owners (the Host holds no application of it since PG-094 S12). */
export function checkGoalTreeApplicationOwnership(application, method = "submitGoalTreeProposal") {
  const errors = [];
  if (/\b(?:store|repository|coordinator)\s*[.:]|\b(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b/u.test(application)) {
    errors.push(`plugins/native/goals: ${method} must compose Module owners without SQL or legacy callbacks`);
  }
  return errors;
}

// The built-in catalog's entries as one array text, whether the catalog writes them in place or lists each plugin's own
// src/registration.ts (W5-02, scripts/gates/catalog-entries.mjs).
export function builtinCatalogText(repositoryRoot) {
  const native = path.join(repositoryRoot, "plugins/native");
  const files = fs.existsSync(native) ? fs.readdirSync(native).map(directory => `plugins/native/${directory}/package.json`) : [];
  return catalogText({ files, read: (file) => { try { return fs.readFileSync(path.join(repositoryRoot, file), "utf8"); } catch { return null; } } });
}

// Check both registration styles. An import alone is not a registered contribution:
// the pack must list it and the composition root must register that pack's entries.
// `descriptors` is the catalog's entries as one array text (builtinCatalogText).
//
// `hasWorkbenchUiContribution` is for a registration that must be there: the wiring is read on the code (a comment, a string, a regular
// expression or template text that shows it does not count), the quoted import paths on the code too (`matchesStatementInCode`), and the
// catalog's `contributions` on its code (a registration file's comment does not list a contribution). `mentionsWorkbenchUiContribution`
// is the same look at the plain text, for a registration that must NOT be there: a comment that names it still refuses, as before.
// Not checked: that the pack's `workbench` is what the registry hands on, or that a listed contribution is the one registered under
// that name; the check follows the names, not the values.
export function hasWorkbenchUiContribution(workbench, registry, name, descriptors = "") {
  return workbenchContributionRegistered(workbench, registry, name, descriptors, {
    has: hasInCode, matches: matchesInCode, statement: matchesStatementInCode, code: withoutCommentsAndLiterals,
  });
}

export function mentionsWorkbenchUiContribution(workbench, registry, name, descriptors = "") {
  return workbenchContributionRegistered(workbench, registry, name, descriptors, {
    has: (source, needle) => source.includes(needle), matches: (source, pattern) => pattern.test(source),
    statement: (source, pattern) => pattern.test(source), code: source => source,
  });
}

function workbenchContributionRegistered(workbench, registry, name, descriptors, { has, matches, statement, code }) {
  if (has(workbench, `host.register(${name})`)) return true;
  const importsRegistry = statement(workbench, /import\s*\{\s*BUILTIN_PLUGIN_WORKBENCH(?:\s*,[^}]+)?\s*\}\s*from\s*["']\.\/plugin-workbench\.js["']/u);
  const registersPacks = matches(workbench, /function createWorkbenchUiHost\(packs:[^=]+?=\s*BUILTIN_PLUGIN_WORKBENCH\)/u)
    && matches(workbench, /for\s*\(const pack of packs\)\s*\{\s*for\s*\(const contribution of pack\.contributions\)\s*host\.register\(contribution\)/u);
  const derivesPacks = statement(registry, /import\s*\{\s*BUILTIN_PLUGIN_CATALOG[^}]*\}\s*from\s*["']\.\/builtin-plugins\.js["']/u)
    && matches(registry, /export const BUILTIN_PLUGIN_WORKBENCH[^=]*=\s*pluginWorkbenchPacks\(\)/u)
    && matches(registry, /function pluginWorkbenchPacks\(catalog:[^=]+?=\s*BUILTIN_PLUGIN_CATALOG\)/u)
    && matches(registry, /return catalog\.flatMap\(entry => entry\.workbench \? \[\{ project_plugin_id: entry\.project_plugin_id, \.\.\.entry\.workbench \}\] : \[\]\)/u);
  const packs = derivesPacks ? code(descriptors).match(/export const BUILTIN_PLUGIN_CATALOG[^=]*=\s*\[([\s\S]*?)\n\];/u)?.[1] ?? "" : "";
  const contributions = [...packs.matchAll(/contributions:\s*\[([^\]]*)\]/gu)]
    .flatMap(match => match[1].split(",").map(value => value.trim()));
  return importsRegistry && registersPacks && contributions.includes(name);
}

export function checkProposalUiOwnership(renderer, workbench, proposalMount, legacyMount, clientDispatch, registry = "", descriptors = "") {
  const errors = [];
  for (const name of ["proposedGoalName", "goalTreeProposalItemCopy", "goalTreeDecompositionIssueCopy", "renderGoalTreeProposalDecision", "renderRewireDecision", "renderContractProposal", "renderCandidateDecision", "buildDecisionGroups", "recentDecisionResults"]) {
    if (new RegExp(`function\\s+${name}\\s*\\(`, "u").test(renderer)) errors.push(`apps/workbench/src/renderer.ts: DD2 ${name} belongs to the Goals contribution`);
  }
  for (const name of ["goalsProposalUiContribution", "goalsDecisionResultsUiContribution"]) {
    if (!hasWorkbenchUiContribution(workbench, registry, name, descriptors)) errors.push(`apps/workbench: DD2 ${name} must be registered with UiHost`);
  }
  if (mentionsWorkbenchUiContribution(workbench, registry, "goalsLegacyProposalUiContribution", descriptors)) {
    errors.push("apps/workbench: retired goalsLegacyProposalUiContribution must stay unregistered");
  }
  // W5-06: the shell builds the proposal renderer from the plugin's own surface map; each method mounts a declared surface.
  if (!matchesInCode(proposalMount, /createSurfaceRenderers<[^>]+>\(workbenchUiHost, GOALS_PROPOSAL_UI_CONTRIBUTION_ID, GOALS_PROPOSAL_UI_SURFACES\)/u)) {
    errors.push("apps/workbench: proposal renderers must mount the native contributions");
  }
  void legacyMount;
  // The client script is a browser script written in a template string, so its calls are template text: `hasInText`, not `hasInCode`.
  if (/const (?:goalTreeDecisionForm|contractDecisionForm|candidateDecisionForm|rewireDecisionForm) =/u.test(clientDispatch)
      || !hasInText(clientDispatch, "handleGoalProposalSubmit(submittedForm, event)")) errors.push("apps/workbench: proposal submission behavior belongs to the Goals client factory");
  return errors;
}

/** `checkProposalUiOwnership` on the tree: the four Workbench files and the registration files it reads. */
export function checkProposalUiOwnershipInTree(repositoryRoot) {
  const read = file => fs.readFileSync(path.join(repositoryRoot, file), "utf8");
  const [renderer, workbench, proposalMount, clientDispatch] = [
    "apps/workbench/src/renderer.ts",
    "apps/workbench/src/index.ts",
    "apps/workbench/src/ui-composition.ts",
    "apps/workbench/src/scripts/client/events-accessibility.ts",
  ].map(file => read(file) + (file === "apps/workbench/src/index.ts" ? read("apps/workbench/src/ui-composition.ts") : ""));
  return checkProposalUiOwnership(renderer, workbench, proposalMount, "", clientDispatch,
    read("apps/workbench/src/plugin-workbench.ts"), builtinCatalogText(repositoryRoot));
}

export function checkPackageBoundaries(repositoryRoot) {
  const inventory = checkWorkspacePackages(repositoryRoot);
  const packages = packageInfos(repositoryRoot);
  const sourceImports = checkSourceImports(repositoryRoot, packages);
  const dependencyGraph = checkDependencyGraph(packages);
  const rootSource = checkNoRootSource(repositoryRoot);
  const migratedFeedOwnership = checkMigratedFeedOwnership(repositoryRoot);
  const migratedIntegrationOwnership = checkMigratedIntegrationOwnership(repositoryRoot);
  const migratedFeedUiOwnership = checkMigratedFeedUiOwnership(repositoryRoot);
  const migratedGoalsCommandOwnership = checkMigratedGoalsCommandOwnership(repositoryRoot);
  const migratedGovernanceOwnership = checkMigratedGovernanceOwnership(repositoryRoot);
  const executionValidationOwnership = checkExecutionValidationOwnership(repositoryRoot);
  const artifactsOwnership = checkArtifactsOwnership(repositoryRoot);
  const privateWorkContextOwnership = checkPrivateWorkContextOwnership(repositoryRoot);
  const runtimeHostOwnership = checkRuntimeHostOwnership(repositoryRoot);
  const dialogueOwnership = checkDraftDialogueOwnership(...[
    "apps/local-host/src/project-capabilities.ts",
  ].map(file => fs.readFileSync(path.join(repositoryRoot, file), "utf8")));
  const errors = [
    ...checkCoordinatorStaysDeleted(repositoryRoot),
    ...checkProposalUiOwnershipInTree(repositoryRoot).map(message => `[proposal-ui-owner] ${message}`),
    ...[
      ["submitGoalTreeProposal", "goal-tree-submission", "proposal-submission-owner"],
      ["checkGoalTreeProposal", "goal-tree-check", "proposal-check-owner"],
      ["decideGoalTreeProposal", "goal-tree-decision", "proposal-decision-owner"],
    ].flatMap(([method, file, label]) => checkGoalTreeApplicationOwnership(fs.readFileSync(path.join(repositoryRoot, `plugins/native/goals/src/${file}.ts`), "utf8"), method)
      .map(message => `[${label}] ${message}`)),
    ...[
      ["decideContractProposal", "legacyContractDecision"],
      ["decideCandidate", "legacyCandidateDecision"],
      ["confirmRewire", "legacyRewireDecision"],
      ["submitContractProposal", "legacyProposalSubmission"],
      ["submitCandidate", "legacyProposalSubmission"],
      ["submitDependencyProposal", "legacyProposalSubmission"],
    ].flatMap(([method, port]) => {
      const host = fs.readFileSync(path.join(repositoryRoot, "apps/local-host/src/project-capabilities.ts"), "utf8");
      const errors = [];
      if (host.includes(`coordinator.${port}.${method}(`) || host.includes(`coordinator.${method}(`)) {
        errors.push(`apps/local-host/src/project-capabilities.ts: retired public ${method} Host registration must stay removed`);
      }
      return errors.map(message => `[proposal-decision-owner] ${message}`);
    }),
    ...inventory.errors.map((message) => `[workspace-inventory] ${message}`),
    ...sourceImports.errors,
    ...dependencyGraph.errors,
    ...checkLayerExceptionsInUse(sourceImports.edges, dependencyGraph.edges),
    ...rootSource.map((message) => `[root-source] ${message}`),
    ...migratedFeedOwnership.errors.map((message) => `[feed-owner] ${message}`),
    ...migratedIntegrationOwnership.errors.map((message) => `[integration-owner] ${message}`),
    ...migratedFeedUiOwnership.errors.map((message) => `[feed-ui-owner] ${message}`),
    ...migratedGoalsCommandOwnership.errors.map((message) => `[goals-command-owner] ${message}`),
    ...migratedGovernanceOwnership.errors.map((message) => `[governance-owner] ${message}`),
    ...executionValidationOwnership.errors.map((message) => `[execution-validation-owner] ${message}`),
    ...artifactsOwnership.errors.map((message) => `[artifacts-owner] ${message}`),
    ...privateWorkContextOwnership.errors.map((message) => `[private-work-context-owner] ${message}`),
    ...runtimeHostOwnership.errors.map((message) => `[runtime-host-owner] ${message}`),
    ...dialogueOwnership.map(message => `[draft-dialogue-owner] ${message}`),
  ];

  return {
    packageCount: packages.length,
    sourceFileCount: sourceImports.sourceFileCount,
    importCount: sourceImports.importCount,
    dependencyEdgeCount: dependencyGraph.edgeCount,
    contractSubpaths: inventory.contractSubpaths,
    errors,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkPackageBoundaries(repositoryRoot);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
