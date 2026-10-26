import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { checkDevRequirements } from "./package-dev-requirements.mjs";
import { checkPackageOwners, packageOwner } from "./package-owners.mjs";

const REGISTRY_ERRORS = [];
/** The only words a package that exists may carry (docs/SSOT-MATRIX.md §2); `absent` is for rows of packages not created yet. */
export const PACKAGE_MATURITY = ["production", "experimental", "slice"];
/** The error for a maturity word a package may not carry (W5-15 vocabulary), or undefined when the word is allowed. */
export function maturityWordError(packagePath, maturity) {
  if (PACKAGE_MATURITY.includes(maturity)) return undefined;
  return `${packagePath}: package maturity must be one of ${PACKAGE_MATURITY.join("/")}, got ${JSON.stringify(maturity)}`;
}
function assertMaturity(packagePath, maturity) {
  const error = maturityWordError(packagePath, maturity);
  if (error) REGISTRY_ERRORS.push(error);
  return maturity;
}

const NATIVE_PLUGINS = "plugins/native";
const NATIVE_PLUGIN_KIND = "native-plugin";
const NATIVE_PLUGIN_CONTRACT = "@molis-ai/molis-work-contracts/platform/plugin";
/** The keys a built-in plugin may declare in its own "molis-work" block (W5-15); the registry derives path, name, kind and contract. */
const NATIVE_PLUGIN_BLOCK_KEYS = ["maturity", "capabilities", "registration", "extraWorkspaceDependencies", "extraDependencies"];

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The layer a package belongs to, decided by its path; the boundary rules and CODEOWNERS roles read it. */
function kindOfPath(packagePath) {
  if (packagePath === "server") return "module";
  if (packagePath.startsWith("apps/")) return "app";
  if (packagePath.startsWith("packages/")) return "foundation";
  if (packagePath.startsWith("modules/")) return "module";
  if (packagePath.startsWith("horizontal/")) return "horizontal";
  if (packagePath.startsWith("plugins/native/")) return "native-plugin";
  if (packagePath.startsWith("plugins/official-integrations/")) return "integration-plugin";
  if (packagePath.startsWith("tooling/")) return "tooling";
  throw new Error(`${packagePath}: no package layer for this path`);
}

function packageManifest(packagePath) {
  return readJson(path.join(REPOSITORY_ROOT, packagePath, "package.json"));
}

const entry = (packagePath, contract, status = {}) => {
  const kind = kindOfPath(packagePath);
  return {
    path: packagePath,
    name: packageManifest(packagePath).name,
    kind,
    contract,
    // Role and review accounts, from the rules in package-owners.mjs; they render the SSOT 归属 column and .github/CODEOWNERS.
    owner: packageOwner(packagePath, kind),
    maturity: assertMaturity(packagePath, status.maturity),
    capabilities: status.capabilities ?? [],
    // An app that takes every built-in plugin's registration (the two generated files, scripts/generate-plugin-registry.mjs) depends
    // on exactly those plugin packages; the generator writes them into its package.json, so they are not written here (PG-069).
    extraWorkspaceDependencies: [...(status.extraWorkspaceDependencies ?? []), ...(status.registeredPluginDependencies ? REGISTERED_PLUGINS.map(plugin => plugin.name) : [])],
    extraDependencies: status.extraDependencies ?? {},
  };
};

/**
 * The built-in plugins, each read from its own package.json "molis-work" block (W5-02 PR-C, PG-069): a new plugin writes its entry
 * in its own package, and nothing here names it. In directory order, which is code-point order. The block may only carry the keys
 * in NATIVE_PLUGIN_BLOCK_KEYS (W5-15): the layer comes from the path, and the contract from NATIVE_PLUGIN_CONTRACT.
 */
function nativePluginEntries(root) {
  const directory = path.join(root, NATIVE_PLUGINS);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).sort().flatMap((name) => {
    const packagePath = `${NATIVE_PLUGINS}/${name}`;
    const file = path.join(root, packagePath, "package.json");
    if (!fs.existsSync(file)) return [];
    const manifest = readJson(file), block = manifest["molis-work"];
    if (block === undefined) {
      REGISTRY_ERRORS.push(`${packagePath}: missing molis-work block; a built-in plugin declares maturity, capabilities and registration there`);
    }
    const declared = Object.keys(block ?? {}).filter((key) => !NATIVE_PLUGIN_BLOCK_KEYS.includes(key));
    if (declared.length > 0) {
      REGISTRY_ERRORS.push(`${packagePath}: molis-work block may only declare ${NATIVE_PLUGIN_BLOCK_KEYS.join("/")}; it declares ${declared.join("/")}`);
    }
    if (block?.registration !== "./registration") {
      REGISTRY_ERRORS.push(`${packagePath}: molis-work.registration must be "./registration"`);
    }
    return [{
      path: packagePath,
      name: manifest.name,
      kind: NATIVE_PLUGIN_KIND,
      contract: NATIVE_PLUGIN_CONTRACT,
      owner: packageOwner(packagePath, NATIVE_PLUGIN_KIND),
      maturity: assertMaturity(packagePath, block?.maturity),
      capabilities: block?.capabilities ?? [],
      extraWorkspaceDependencies: block?.extraWorkspaceDependencies ?? [],
      extraDependencies: block?.extraDependencies ?? {},
      registration: block?.registration,
    }];
  });
}

const NATIVE_PLUGIN_ENTRIES = nativePluginEntries(REPOSITORY_ROOT);
/** The built-in plugins that declare a registration: what the two generated files import, so what the two apps depend on. */
export const REGISTERED_PLUGINS = NATIVE_PLUGIN_ENTRIES.filter((entry) => entry.registration !== undefined);

export const WORKSPACE_PACKAGES = [
  entry("apps/server", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "experimental",
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-server",
      "@molis-ai/molis-work-storage",
      "@molis-ai/molis-work-app-local-host",
      "@molis-ai/molis-work-im-ui",
      "@molis-ai/molis-work-app-desktop",
      "@molis-ai/molis-work-plugin-runtime"
    ]
  }),
  entry("server", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-storage",
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("packages/im-ui", "@molis-ai/molis-work-contracts/services/im", {
    maturity: "production",
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-design-system",
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("packages/plugin-sandbox", "@molis-ai/molis-work-contracts/platform/plugin-sandbox", {
    maturity: "production",
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("apps/desktop", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    capabilities: [
      "desktop.shell.v1",
      "desktop.runtime-launch.v1",
      "desktop.advance-prompt.v1",
      "desktop.panels.v1",
      "desktop.capsule-shell.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-service-runtime-host",
      "@molis-ai/molis-work-storage",
      "@molis-ai/molis-work-plugin-sdk",
      "@molis-ai/molis-work-app-local-host",
      "@molis-ai/molis-work-design-system"
    ]
  }),
  entry("apps/workbench", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    capabilities: [
      "workbench.shell.v1",
      "workbench.ui-slots.v1",
      "workbench.feed-composition.v1",
      "workbench.work-composition.v1",
      "workbench.goals-policy-composition.v1",
      "workbench.goals-safety-composition.v1",
      "workbench.goals-relation-composition.v1",
      "workbench.goals-tree-composition.v1",
      "workbench.goals-momentum-composition.v1",
      "workbench.goals-document-composition.v1",
      "workbench.goals-context-composition.v1",
      "workbench.goals-planning-composition.v1",
      "workbench.goals-status-composition.v1",
      "workbench.goals-factors-composition.v1",
      "workbench.goals-dialogs-composition.v1",
      "workbench.goals-document-routes.v1"
    ],
    registeredPluginDependencies: true,
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-im-ui",
      "@molis-ai/molis-work-ui-host",
      "@molis-ai/molis-work-design-system",
      "@molis-ai/molis-work-integration-rss",
      "@molis-ai/molis-work-integration-gmail",
      "@molis-ai/molis-work-plugin-sdk"
    ],
    extraDependencies: {
      marked: "^18.0.11",
      "sanitize-html": "^2.17.7",
      "@xterm/xterm": "^6.0.0",
      "@xterm/addon-fit": "^0.11.0"
    }
  }),
  entry("apps/local-host", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    capabilities: [
      "local-host.client.v1",
      "local-host.single-writer.v1"
    ],
    registeredPluginDependencies: true,
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-server",
      "@molis-ai/molis-work-im-ui",
      "@molis-ai/molis-work-plugin-sandbox",
      "@molis-ai/molis-work-app-cli",
      "@molis-ai/molis-work-app-mcp",
      "@molis-ai/molis-work-app-workbench",
      "@molis-ai/molis-work-design-system",
      "@molis-ai/molis-work-integration-catalog",
      "@molis-ai/molis-work-integration-github",
      "@molis-ai/molis-work-integration-gmail",
      "@molis-ai/molis-work-integration-rss",
      "@molis-ai/molis-work-integration-youtube",
      "@molis-ai/molis-work-kernel",
      "@molis-ai/molis-work-module-artifacts",
      "@molis-ai/molis-work-module-attention-resumption",
      "@molis-ai/molis-work-module-characters",
      "@molis-ai/molis-work-module-context-ledger",
      "@molis-ai/molis-work-module-feed",
      "@molis-ai/molis-work-module-functions",
      "@molis-ai/molis-work-module-goals",
      "@molis-ai/molis-work-module-governance-collaboration",
      "@molis-ai/molis-work-module-private-work-context",
      "@molis-ai/molis-work-module-projects",
      "@molis-ai/molis-work-module-shelf",
      "@molis-ai/molis-work-module-signals",
      "@molis-ai/molis-work-module-sources",
      "@molis-ai/molis-work-plugin-runtime",
      "@molis-ai/molis-work-plugin-sdk",
      "@molis-ai/molis-work-service-agent-host",
      "@molis-ai/molis-work-service-connector-host",
      "@molis-ai/molis-work-service-listener-host",
      "@molis-ai/molis-work-service-runtime-host",
      "@molis-ai/molis-work-service-scheduler",
      "@molis-ai/molis-work-service-placement",
      "@molis-ai/molis-work-service-search",
      "@molis-ai/molis-work-service-knowledge",
      "@molis-ai/molis-work-service-memory",
      "@molis-ai/molis-work-storage",
      "@molis-ai/molis-work-ui-host"
    ],
    extraDependencies: {
      "node-pty": "^1.1.0",
      "@modelcontextprotocol/sdk": "^1.31.0",
      typescript: "^5.8.0",
      "pdfjs-dist": "6.3.289",
      fflate: "0.8.2",
      mammoth: "1.11.0",
      officeparser: "8.1.1",
      esbuild: "^0.28.2",
      ws: "^8.21.3",
      "@adeptify/search-evidence-layer": "file:../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz",
      "@adeptify/intelligence-client": "file:../../vendor/intelligence-client/adeptify-intelligence-client-0.2.2.tgz",
      "@larksuiteoapi/lark-mcp": "0.5.1"
    }
  }),
  entry("apps/cli", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    capabilities: []
  }),
  entry("apps/mcp", "@molis-ai/molis-work-contracts/platform/app-host", {
    maturity: "production",
    capabilities: [],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("packages/contracts", "@molis-ai/molis-work-contracts/platform/package", {
    maturity: "production"
  }),
  entry("packages/kernel", "@molis-ai/molis-work-contracts/platform/kernel", {
    maturity: "production",
    capabilities: [
      "kernel.capability-registry.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ],
    extraDependencies: {
      ajv: "^8.20.0",
      "ajv-formats": "^3.0.1"
    }
  }),
  entry("packages/plugin-runtime", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "plugin.lifecycle.v1",
      "plugin.grants.v1",
      "plugin.recovery.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("packages/plugin-sdk", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "plugin.define.v1",
      "integration.polling.v1"
    ]
  }),
  entry("packages/storage", "@molis-ai/molis-work-contracts/platform/storage", {
    maturity: "production",
    extraDependencies: {
      "@adeptify/search-evidence-layer": "file:../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz",
      "better-sqlite3": "12.8.0"
    }
  }),
  entry("packages/ui-host", "@molis-ai/molis-work-contracts/platform/ui", {
    maturity: "slice",
    capabilities: [
      "ui.contribution.registry.v1",
      "ui.surface.render.v1",
      "ui.slot.mount.v1"
    ]
  }),
  entry("packages/design-system", "@molis-ai/molis-work-contracts/platform/ui", {
    maturity: "production",
    capabilities: [
      "design-system.theme.v1",
      "design-system.tokens.v1",
      "design-system.accessibility.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ],
    extraDependencies: {
      lucide: "^1.31.0"
    }
  }),
  entry("packages/test-kit", "@molis-ai/molis-work-contracts/platform/testing", {
    maturity: "slice",
    capabilities: [
      "workspace-boundary-policy",
      "headless-chrome-driver",
      "local-host-http-client"
    ]
  }),
  entry("modules/projects", "@molis-ai/molis-work-contracts/modules/projects", {
    maturity: "production",
    capabilities: [
      "project-identity",
      "project-catalog",
      "workspace-membership",
      "project-deletion-receipts"
    ]
  }),
  entry("modules/context-ledger", "@molis-ai/molis-work-contracts/modules/context-ledger", {
    maturity: "slice",
    capabilities: [
      "context.edges.v1"
    ]
  }),
  entry("modules/sources", "@molis-ai/molis-work-contracts/modules/sources", {
    maturity: "production",
    capabilities: [
      "sources.query.v1",
      "sources.command.v1"
    ]
  }),
  entry("modules/signals", "@molis-ai/molis-work-contracts/modules/signals", {
    maturity: "production",
    capabilities: [
      "signals.query.v1",
      "signals.command.v1"
    ]
  }),
  entry("modules/feed", "@molis-ai/molis-work-contracts/modules/feed", {
    maturity: "production",
    capabilities: [
      "feed.query.v1",
      "feed.command.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-storage"
    ]
  }),
  entry("modules/attention-resumption", "@molis-ai/molis-work-contracts/modules/attention-resumption", {
    maturity: "slice",
    capabilities: [
      "attention.query.v1",
      "attention.command.v1"
    ]
  }),
  entry("modules/goals", "@molis-ai/molis-work-contracts/modules/goals", {
    maturity: "production",
    capabilities: [
      "goals.command.v1",
      "goals.repository.v1",
      "goals.lifecycle.v1",
      "goals.planning.v1",
      "goals.query.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ],
    extraDependencies: {
      "better-sqlite3": "12.8.0"
    }
  }),
  entry("modules/private-work-context", "@molis-ai/molis-work-contracts/modules/private-work-context", {
    maturity: "slice",
    capabilities: [
      "runtime-context-bindings"
    ]
  }),
  entry("modules/artifacts", "@molis-ai/molis-work-contracts/modules/artifacts", {
    maturity: "production",
    capabilities: [
      "artifacts.identity.v1",
      "artifacts.version-repository.v1",
      "artifacts.opaque-content.v1",
      "artifacts.compatibility.v1"
    ]
  }),
  entry("modules/shelf", "@molis-ai/molis-work-contracts/platform/package", {
    maturity: "slice",
    capabilities: [
      "shelf.store.v1",
      "shelf.jobs.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("modules/characters", "@molis-ai/molis-work-contracts/modules/characters", {
    maturity: "slice",
    capabilities: [
      "characters.query.v1",
      "characters.command.v1",
      "characters.actions.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-storage"
    ]
  }),
  entry("modules/functions", "@molis-ai/molis-work-contracts/modules/functions", {
    maturity: "production",
    capabilities: [
      "functions.query.v1",
      "functions.command.v1",
      "functions.evaluate"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-storage"
    ]
  }),
  entry("modules/governance-collaboration", "@molis-ai/molis-work-contracts/modules/governance-collaboration", {
    maturity: "production",
    capabilities: [
      "governance.proposals.v1",
      "governance.decisions.v1",
      "governance.event-decisions.v1"
    ]
  }),
  entry("horizontal/agent-host", "@molis-ai/molis-work-contracts/services/agent-host", {
    maturity: "production",
    capabilities: [
      "agent.host.v1",
      "agent.review-queue.v1",
      "agent.runtimes.v1",
      "agent.run.start.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-storage"
    ],
    extraDependencies: {
      "@prologue/sdk": "file:../../vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-memory-p0.tgz"
    }
  }),
  entry("horizontal/connector-host", "@molis-ai/molis-work-contracts/services/connector-host", {
    maturity: "production",
    capabilities: [
      "connector.host.v1"
    ]
  }),
  entry("horizontal/listener-host", "@molis-ai/molis-work-contracts/services/listener-host", {
    maturity: "production",
    capabilities: [
      "listener.host.v1"
    ]
  }),
  entry("horizontal/runtime-host", "@molis-ai/molis-work-contracts/services/runtime-host", {
    maturity: "slice",
    capabilities: [
      "runtime.host.v1",
      "runtime.terminal-pty.v1"
    ],
    extraDependencies: {
      "node-pty": "1.1.0"
    }
  }),
  entry("horizontal/scheduler", "@molis-ai/molis-work-contracts/services/scheduler", {
    maturity: "production",
    capabilities: [
      "scheduler.wakeup.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("horizontal/memory", "@molis-ai/molis-work-contracts/services/memory", {
    maturity: "production",
    capabilities: [
      "memory.recall.v1",
      "memory.manage.v1"
    ]
  }),
  entry("horizontal/knowledge", "@molis-ai/molis-work-contracts/services/knowledge", {
    maturity: "production",
    capabilities: [
      "knowledge.recall.v1"
    ]
  }),
  entry("horizontal/search", "@molis-ai/molis-work-contracts/services/search", {
    maturity: "production",
    capabilities: [
      "search.query.v1",
      "search.index.v1"
    ]
  }),
  entry("horizontal/placement", "@molis-ai/molis-work-contracts/services/placement", {
    maturity: "production",
    capabilities: [
      "placement.describe.v1",
      "placement.links.v1"
    ]
  }),
  entry("plugins/official-integrations/catalog", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "connector.catalog.v1",
      "signal-adapter.catalog.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("plugins/official-integrations/github", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "connector.github.v1",
      "signal-adapter.github.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("plugins/official-integrations/gmail", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "connector.gmail.v1",
      "signal-adapter.gmail.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("plugins/official-integrations/rss", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "connector.rss.v1",
      "signal-adapter.rss.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ],
    extraDependencies: {
      "@adeptify/search-evidence-layer": "file:../../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz"
    }
  }),
  entry("plugins/official-integrations/web-query", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "experimental",
    capabilities: [
      "connector.web-query.v1",
      "signal-adapter.web-query.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("plugins/official-integrations/youtube", "@molis-ai/molis-work-contracts/platform/plugin", {
    maturity: "production",
    capabilities: [
      "connector.youtube.v1",
      "signal-adapter.youtube.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  entry("tooling/plugin-cli", "@molis-ai/molis-work-contracts/platform/tooling", {
    maturity: "production",
    capabilities: [
      "plugin.manifest.validate.v1"
    ],
    extraWorkspaceDependencies: [
      "@molis-ai/molis-work-plugin-runtime",
      "@molis-ai/molis-work-plugin-sdk"
    ]
  }),
  ...NATIVE_PLUGIN_ENTRIES.map(({ registration: _registration, ...entry }) => entry),
];

export const WORKSPACE_GLOBS = [
  "server",
  "apps/*",
  "packages/*",
  "modules/*",
  "horizontal/*",
  "plugins/native/*",
  "plugins/official-integrations/*",
  "tooling/plugin-cli",
];

const CONTRACT_SUBPATHS = [
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "module").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "horizontal").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.map((item) => item.contract).filter((value) => value.includes("/platform/")),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function filesUnder(directory, filename) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const name of fs.readdirSync(directory)) {
    if (name === "node_modules" || name === "dist" || name === "target" || name === "gen") continue;
    if (path.basename(directory) === "src-tauri" && name === "resources") continue;
    const child = path.join(directory, name);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) result.push(...filesUnder(child, filename));
    else if (name === filename) result.push(child);
  }
  return result;
}

export function checkWorkspacePackages(repositoryRoot) {
  const errors = [...REGISTRY_ERRORS];
  const names = new Set();
  const expectedPaths = new Set(WORKSPACE_PACKAGES.map((item) => item.path));
  const contractsPath = path.join(repositoryRoot, "packages/contracts/package.json");
  const contractsManifest = fs.existsSync(contractsPath) ? readJson(contractsPath) : null;

  for (const item of WORKSPACE_PACKAGES) {
    const packageRoot = path.join(repositoryRoot, item.path);
    const requiredFiles = ["package.json", "tsconfig.json", "README.md", "src/index.ts"];
    for (const relativeFile of requiredFiles) {
      if (!fs.existsSync(path.join(packageRoot, relativeFile))) {
        errors.push(`${item.path}: missing ${relativeFile}`);
      }
    }
    if (!fs.existsSync(path.join(packageRoot, "package.json"))) continue;

    const manifest = readJson(path.join(packageRoot, "package.json"));
    if (manifest.name !== item.name) errors.push(`${item.path}: package name mismatch`);
    if (names.has(manifest.name)) errors.push(`${item.path}: duplicate package name ${manifest.name}`);
    names.add(manifest.name);
    if (manifest.private !== true) errors.push(`${item.path}: package must remain private in F2`);
    if (manifest.version !== "0.0.0") errors.push(`${item.path}: package version must be 0.0.0 in F2`);
    // The registry is the only writer of a non-plugin package's metadata (W5-15); a built-in plugin writes its own narrow block.
    if (!item.path.startsWith(`${NATIVE_PLUGINS}/`) && manifest["molis-work"] !== undefined) {
      errors.push(`${item.path}: non-plugin package must not declare molis-work metadata; scripts/workspace-packages.mjs is its only writer`);
    }
    const dependencies = Object.entries(manifest.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right));
    const expectedDependencies = item.path === "packages/contracts"
      ? []
      : [
          ...["@molis-ai/molis-work-contracts", ...item.extraWorkspaceDependencies]
            .map((name) => [name, "workspace:*"]),
          ...Object.entries(item.extraDependencies),
        ].sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) {
      errors.push(`${item.path}: workspace dependency boundary does not match its declared migration slice`);
    }
    if (!manifest.scripts?.build || !manifest.scripts?.typecheck) {
      errors.push(`${item.path}: missing build/typecheck scripts`);
    }
    if (!manifest.exports?.["."]?.types || !manifest.exports?.["."]?.import) {
      errors.push(`${item.path}: missing public export entrypoint`);
    } else if (
      !manifest.exports["."].types.startsWith("./dist/") ||
      !manifest.exports["."].import.startsWith("./dist/")
    ) {
      errors.push(`${item.path}: public export must resolve through dist, not a source deep import`);
    }

    const readmePath = path.join(packageRoot, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf8");
      errors.push(...checkDevRequirements(repositoryRoot, item, readme, manifest));
    }
  }

  errors.push(...checkPackageOwners(repositoryRoot, WORKSPACE_PACKAGES));

  const packageJsonFiles = [
    ...filesUnder(path.join(repositoryRoot, "server"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "apps"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "packages"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "modules"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "horizontal"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "plugins"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "tooling"), "package.json"),
  ];
  for (const packageJson of packageJsonFiles) {
    const relativePackage = path.relative(repositoryRoot, path.dirname(packageJson));
    if (!expectedPaths.has(relativePackage)) errors.push(`unexpected workspace package ${relativePackage}`);
  }

  if (contractsManifest) {
    for (const contract of new Set(CONTRACT_SUBPATHS)) {
      const subpath = contract.replace("@molis-ai/molis-work-contracts", ".");
      if (!contractsManifest.exports?.[subpath]) errors.push(`contracts: missing export ${subpath}`);
    }
  }

  const workspaceFile = path.join(repositoryRoot, "pnpm-workspace.yaml");
  if (fs.existsSync(workspaceFile)) {
    const workspace = fs.readFileSync(workspaceFile, "utf8");
    for (const glob of WORKSPACE_GLOBS) {
      if (!workspace.includes(`'${glob}'`) && !workspace.includes(`\"${glob}\"`)) {
        errors.push(`pnpm-workspace.yaml: missing ${glob}`);
      }
    }
  } else {
    errors.push("missing pnpm-workspace.yaml");
  }

  return {
    packageCount: WORKSPACE_PACKAGES.length,
    uniquePackageNames: names.size,
    contractSubpaths: Object.keys(contractsManifest?.exports ?? {}).filter((key) => key !== ".").length,
    errors,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkWorkspacePackages(repositoryRoot);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
