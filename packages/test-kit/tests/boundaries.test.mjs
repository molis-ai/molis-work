import assert from "node:assert/strict";
import test from "node:test";

import {
  APP_IMPORT_ALLOWLIST,
  PLUGIN_MODULE_IMPORT_ALLOWLIST,
  PRIVATE_UI_EXEMPT_PLUGINS,
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
  unusedLayerExceptions,
} from "@molis-ai/molis-work-test-kit";

function boundaryPackage(name, packagePath, kind, dependencies = [], exportedSubpaths = ["."]) {
  return {
    name,
    path: packagePath,
    kind,
    declaredDependencies: dependencies,
    exportedSubpaths,
  };
}

function violationCodes(observation) {
  return new Set(evaluateImportBoundary(observation).map((item) => item.code));
}

test("rejects an unpublished deep import", () => {
  const target = boundaryPackage("@molis-ai/molis-work-kernel", "packages/kernel", "foundation");
  const importer = boundaryPackage(
    "@molis-ai/molis-work-app-local-host",
    "apps/local-host",
    "app",
    [target.name],
  );

  assert.ok(
    violationCodes({
      importer,
      target,
      specifier: `${target.name}/src/registry.js`,
      sourceFile: "apps/local-host/src/index.ts",
    }).has("deep-import"),
  );
});

test("rejects a Module implementation or Store import from another Module", () => {
  const target = boundaryPackage("@molis-ai/molis-work-module-goals", "modules/goals", "module");
  const importer = boundaryPackage(
    "@molis-ai/molis-work-module-feed",
    "modules/feed",
    "module",
    [target.name],
  );

  const codes = violationCodes({
    importer,
    target,
    specifier: `${target.name}/store`,
    sourceFile: "modules/feed/src/promote.ts",
  });
  assert.ok(codes.has("cross-module-implementation"));
  assert.ok(codes.has("deep-import"));
});

test("rejects imports between Plugin implementations", () => {
  const target = boundaryPackage(
    "@molis-ai/molis-work-plugin-artifacts",
    "plugins/native/artifacts",
    "native-plugin",
  );
  const importer = boundaryPackage(
    "@molis-ai/molis-work-plugin-goals",
    "plugins/native/goals",
    "native-plugin",
    [target.name],
  );

  assert.ok(
    violationCodes({
      importer,
      target,
      specifier: target.name,
      sourceFile: "plugins/native/goals/src/index.ts",
    }).has("plugin-implementation-import"),
  );
});

test("rejects a Plugin's ./testing entry from production sources: another package's, or the Plugin's own modules", () => {
  const target = boundaryPackage("@molis-ai/molis-work-plugin-pages", "plugins/native/pages", "native-plugin", [], [".", "./testing"]);
  const importer = boundaryPackage("@molis-ai/molis-work-app-local-host", "apps/local-host", "app", [target.name]);

  assert.ok(
    violationCodes({ importer, target, specifier: `${target.name}/testing`, sourceFile: "apps/local-host/src/index.ts" })
      .has("plugin-testing-entry-import"),
  );
  assert.ok(
    violationCodes({ importer: target, specifier: "./testing.js", sourceFile: "plugins/native/pages/src/index.ts" })
      .has("plugin-testing-entry-import"),
  );
  // The public entry is not the test entry, and a foundation package's own `testing` subpath is another thing.
  assert.ok(!violationCodes({ importer, target, specifier: target.name, sourceFile: "apps/local-host/src/index.ts" }).has("plugin-testing-entry-import"));
  const contracts = boundaryPackage("@molis-ai/molis-work-contracts", "packages/contracts", "foundation", [], ["./platform/testing"]);
  assert.ok(!violationCodes({ importer, target: contracts, specifier: `${contracts.name}/platform/testing`, sourceFile: "apps/local-host/src/index.ts" })
    .has("plugin-testing-entry-import"));
});

test("rejects direct database drivers in Apps", () => {
  const importer = boundaryPackage(
    "@molis-ai/molis-work-app-workbench",
    "apps/workbench",
    "app",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "better-sqlite3",
      sourceFile: "apps/workbench/src/write.ts",
    }).has("app-direct-database"),
  );
});

test("rejects imports back into the legacy root implementation", () => {
  const importer = boundaryPackage(
    "@molis-ai/molis-work-app-local-host",
    "apps/local-host",
    "app",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "@molis-ai/molis-work/v1/store",
      sourceFile: "apps/local-host/src/index.ts",
    }).has("root-package-import"),
  );
});

test("rejects relative imports that escape a package owner", () => {
  const importer = boundaryPackage(
    "@molis-ai/molis-work-module-goals",
    "modules/goals",
    "module",
  );

  assert.ok(
    violationCodes({
      importer,
      specifier: "../../../src/v1/store.js",
      sourceFile: "modules/goals/src/index.ts",
      relativeCrossOwner: true,
    }).has("relative-cross-owner"),
  );
});

test("allows explicit public Contract subpaths", () => {
  const contracts = boundaryPackage(
    "@molis-ai/molis-work-contracts",
    "packages/contracts",
    "foundation",
    [],
    [".", "./modules/goals"],
  );
  const importer = boundaryPackage(
    "@molis-ai/molis-work-module-feed",
    "modules/feed",
    "module",
    [contracts.name],
  );

  assert.deepEqual(
    evaluateImportBoundary({
      importer,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/modules/goals",
      sourceFile: "modules/feed/src/index.ts",
    }),
    [],
  );
});

test("extracts static, dynamic, re-export, and CommonJS imports", () => {
  const source = `
    import type { Goal } from "@molis-ai/molis-work-contracts/modules/goals";
    export { capability } from "@molis-ai/molis-work-kernel";
    const lazy = import("@molis-ai/molis-work-plugin-goals/internal");
    const legacy = require("better-sqlite3");
    // import ignored from "@molis-ai/molis-work-module-feed";
    const example = 'import ignored from "@molis-ai/molis-work-module-actions"';
  `;

  assert.deepEqual(extractImportSpecifiers(source), [
    "@molis-ai/molis-work-contracts/modules/goals",
    "@molis-ai/molis-work-kernel",
    "@molis-ai/molis-work-plugin-goals/internal",
    "better-sqlite3",
  ]);
});

test("reports workspace dependency cycles", () => {
  const graph = new Map([
    ["a", ["b"]],
    ["b", ["c"]],
    ["c", ["a"]],
    ["d", []],
  ]);

  assert.deepEqual(findDependencyCycles(graph), [["a", "b", "c", "a"]]);
});

test("extracts aliases, import options, and template interpolations without string or comment false positives", () => {
  const source = [
    'import GoalAlias from "@scope/default";',
    'import "@scope/side-effect";',
    'import type { Goal as GoalContract } from "@scope/type-alias";',
    'import { Goal as GoalContract, type Feed as FeedContract } from "@scope/alias";',
    'import * as Kernel from "@scope/namespace";',
    'export { Scheduler as SchedulerPort } from "@scope/reexport";',
    'export type { Panel as DesktopPanel } from "@scope/type-reexport";',
    'const withOptions = import("@scope/dynamic-options", { with: { type: "json" } });',
    "const multiline = import(",
    '  "@scope/multiline",',
    '  { with: { type: "json" } },',
    ");",
    "const staticTemplate = import(`@scope/template-static`);",
    "const templateOptions = import(`@scope/template-options`, { with: { type: \"json\" } });",
    'const commented = import(/* import("@scope/inside-comment") */ "@scope/commented-dynamic");',
    'const wrapped = `before ${import("@scope/interpolated")} after ${import("@scope/interpolated-options", options)} tail`;',
    'const nested = `outer ${`inner ${import("@scope/nested")}`} end`;',
    "const hidden = `keep ${",
    '  // import("@scope/comment-in-interpolation")',
    '  import("@scope/after-comment-in-interpolation")',
    "}`;",
    'const required = `x ${require("@scope/required-in-interpolation")}`;',
    "const skipped = import(`${packageName}`);",
    'const text = "import(\'@scope/string\')";',
    'const templateText = `import("@scope/template-text") ${"import(\'@scope/quoted\')"}`;',
    '// import("@scope/line-comment");',
    '/* import("@scope/block-comment"); */',
    'type Events = import("../platform/storage.js").StoredModuleEvent[];',
    'const concatenated = import("@scope/prefix" + packageName);',
  ].join("\n");

  assert.deepEqual(extractImportSpecifiers(source), [
    "@scope/default",
    "@scope/side-effect",
    "@scope/type-alias",
    "@scope/alias",
    "@scope/namespace",
    "@scope/reexport",
    "@scope/type-reexport",
    "@scope/dynamic-options",
    "@scope/multiline",
    "@scope/template-static",
    "@scope/template-options",
    "@scope/commented-dynamic",
    "@scope/interpolated",
    "@scope/interpolated-options",
    "@scope/nested",
    "@scope/after-comment-in-interpolation",
    "@scope/required-in-interpolation",
    "../platform/storage.js",
  ]);
});

test("rejects Contracts imports of databases, network clients, and implementation packages", () => {
  const contracts = boundaryPackage("@molis-ai/molis-work-contracts", "packages/contracts", "foundation");
  const forbiddenTechnology = [
    "node:sqlite",
    "better-sqlite3",
    "bun:sqlite",
    "undici",
    "undici/api",
    "node:https",
    "http",
    "ws",
  ];
  for (const specifier of forbiddenTechnology) {
    assert.deepEqual(
      [...violationCodes({
        importer: contracts,
        specifier,
        sourceFile: "packages/contracts/src/index.ts",
      })],
      ["contracts-implementation-dependency"],
      specifier,
    );
  }
  for (const specifier of ["node:fs", "node:path", "node:crypto", "node:util"]) {
    assert.deepEqual(
      evaluateImportBoundary({
        importer: contracts,
        specifier,
        sourceFile: "packages/contracts/src/index.ts",
      }),
      [],
      specifier,
    );
  }

  const dynamicDatabase = extractImportSpecifiers("export const open = import('node:sqlite', { with: { type: 'json' } });");
  const interpolatedClient = extractImportSpecifiers('const text = `open ${import("undici")} later`;');
  assert.deepEqual(dynamicDatabase, ["node:sqlite"]);
  assert.deepEqual(interpolatedClient, ["undici"]);
  assert.deepEqual(extractImportSpecifiers('const sample = "import(\'node:sqlite\')";'), []);
  assert.deepEqual(extractImportSpecifiers("// import('undici')\nexport const value = 1;\n"), []);

  const app = boundaryPackage("@molis-ai/molis-work-app-local-host", "apps/local-host", "app");
  const modulePackage = boundaryPackage("@molis-ai/molis-work-module-goals", "modules/goals", "module");
  const plugin = boundaryPackage("@molis-ai/molis-work-plugin-goals", "plugins/native/goals", "native-plugin");
  const kernel = boundaryPackage("@molis-ai/molis-work-kernel", "packages/kernel", "foundation");
  const horizontal = boundaryPackage("@molis-ai/molis-work-service-scheduler", "horizontal/scheduler", "horizontal");
  for (const target of [app, modulePackage, plugin, kernel, horizontal]) {
    assert.deepEqual(
      [...violationCodes({
        importer: boundaryPackage(contracts.name, contracts.path, contracts.kind, [target.name]),
        target,
        specifier: target.name,
        sourceFile: "packages/contracts/src/index.ts",
      })],
      ["contracts-implementation-dependency"],
      target.name,
    );
  }
});

test("rejects Horizontal and platform imports that point upward", () => {
  const app = boundaryPackage("@molis-ai/molis-work-app-workbench", "apps/workbench", "app");
  const modulePackage = boundaryPackage("@molis-ai/molis-work-module-goals", "modules/goals", "module");
  const plugin = boundaryPackage("@molis-ai/molis-work-plugin-feed", "plugins/native/feed", "native-plugin");
  const horizontal = boundaryPackage("@molis-ai/molis-work-service-scheduler", "horizontal/scheduler", "horizontal");
  const kernel = boundaryPackage("@molis-ai/molis-work-kernel", "packages/kernel", "foundation");

  for (const target of [app, modulePackage, plugin]) {
    assert.deepEqual(
      [...violationCodes({
        importer: boundaryPackage(horizontal.name, horizontal.path, horizontal.kind, [target.name]),
        target,
        specifier: target.name,
        sourceFile: "horizontal/scheduler/src/index.ts",
      })],
      ["horizontal-reverse-dependency"],
      target.name,
    );
  }
  for (const target of [app, modulePackage, plugin, horizontal]) {
    assert.deepEqual(
      [...violationCodes({
        importer: boundaryPackage(kernel.name, kernel.path, kernel.kind, [target.name]),
        target,
        specifier: target.name,
        sourceFile: "packages/kernel/src/index.ts",
      })],
      ["platform-reverse-dependency"],
      target.name,
    );
  }
});

test("allows Host composition, storage adapters, Contract subpaths, and colocated ports", () => {
  const contracts = boundaryPackage(
    "@molis-ai/molis-work-contracts",
    "packages/contracts",
    "foundation",
    [],
    [".", "./modules/goals", "./modules/artifacts", "./modules/signals", "./services/listener-host", "./platform/app-host", "./platform/kernel"],
  );
  const storage = boundaryPackage("@molis-ai/molis-work-storage", "packages/storage", "foundation");
  const goals = boundaryPackage("@molis-ai/molis-work-module-goals", "modules/goals", "module");
  const kernel = boundaryPackage(
    "@molis-ai/molis-work-kernel",
    "packages/kernel",
    "foundation",
    [contracts.name, storage.name],
  );
  const runtime = boundaryPackage(
    "@molis-ai/molis-work-plugin-runtime",
    "packages/plugin-runtime",
    "foundation",
    [contracts.name],
  );
  const host = boundaryPackage(
    "@molis-ai/molis-work-app-local-host",
    "apps/local-host",
    "app",
    [goals.name],
  );
  const desktop = boundaryPackage(
    "@molis-ai/molis-work-app-desktop",
    "apps/desktop",
    "app",
    [storage.name],
  );
  const scheduler = boundaryPackage(
    "@molis-ai/molis-work-service-scheduler",
    "horizontal/scheduler",
    "horizontal",
    [contracts.name],
  );
  const listener = boundaryPackage(
    "@molis-ai/molis-work-service-listener-host",
    "horizontal/listener-host",
    "horizontal",
    [contracts.name],
  );
  const runtimeHost = boundaryPackage(
    "@molis-ai/molis-work-service-runtime-host",
    "horizontal/runtime-host",
    "horizontal",
    [contracts.name],
  );
  const pages = boundaryPackage("@molis-ai/molis-work-plugin-pages", "plugins/native/pages", "native-plugin");
  const shelfModule = boundaryPackage("@molis-ai/molis-work-module-shelf", "modules/shelf", "module");
  const shelfPlugin = boundaryPackage(
    "@molis-ai/molis-work-plugin-shelf",
    "plugins/native/shelf",
    "native-plugin",
    [shelfModule.name],
  );
  const localHostApp = boundaryPackage("@molis-ai/molis-work-app-local-host", "apps/local-host", "app", [
    "@molis-ai/molis-work-app-workbench",
  ]);
  const workbenchApp = boundaryPackage("@molis-ai/molis-work-app-workbench", "apps/workbench", "app");

  const allowed = [
    {
      importer: storage,
      specifier: "node:sqlite",
      sourceFile: "packages/storage/src/home-sqlite.ts",
    },
    {
      importer: storage,
      specifier: "better-sqlite3",
      sourceFile: "packages/storage/src/sqlite.ts",
    },
    {
      importer: kernel,
      target: storage,
      specifier: storage.name,
      sourceFile: "packages/kernel/src/index.ts",
    },
    {
      importer: kernel,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/platform/kernel",
      sourceFile: "packages/kernel/src/index.ts",
    },
    {
      importer: runtime,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/modules/artifacts",
      sourceFile: "packages/plugin-runtime/src/wiring.ts",
    },
    {
      importer: host,
      target: goals,
      specifier: goals.name,
      sourceFile: "apps/local-host/src/index.ts",
    },
    {
      importer: desktop,
      target: storage,
      specifier: storage.name,
      sourceFile: "apps/desktop/src/adapters/sqlite-panels.ts",
    },
    {
      importer: desktop,
      specifier: "./adapters/sqlite-panels.js",
      sourceFile: "apps/desktop/src/project-catalog.ts",
    },
    {
      importer: desktop,
      specifier: "undici",
      sourceFile: "apps/desktop/src/shell.ts",
    },
    {
      importer: scheduler,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/platform/app-host",
      sourceFile: "horizontal/scheduler/src/index.ts",
    },
    {
      importer: listener,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/modules/signals",
      sourceFile: "horizontal/listener-host/src/index.ts",
    },
    {
      importer: listener,
      target: contracts,
      specifier: "@molis-ai/molis-work-contracts/services/listener-host",
      sourceFile: "horizontal/listener-host/src/index.ts",
    },
    {
      importer: runtimeHost,
      specifier: "./adapters/terminal-pty.js",
      sourceFile: "horizontal/runtime-host/src/index.ts",
    },
    {
      importer: runtimeHost,
      specifier: "node:fs",
      sourceFile: "horizontal/runtime-host/src/adapters/terminal-pty.ts",
    },
    {
      importer: runtimeHost,
      specifier: "node-pty",
      sourceFile: "horizontal/runtime-host/src/adapters/terminal-pty.ts",
    },
    {
      importer: pages,
      specifier: "node:sqlite",
      sourceFile: "plugins/native/pages/src/store.ts",
    },
    {
      importer: goals,
      specifier: "better-sqlite3",
      sourceFile: "modules/goals/src/planning/personal-methods.ts",
    },
    // The two listed layer exceptions (APP_IMPORT_ALLOWLIST, PLUGIN_MODULE_IMPORT_ALLOWLIST): debts that exist today.
    {
      importer: shelfPlugin,
      target: shelfModule,
      specifier: shelfModule.name,
      sourceFile: "plugins/native/shelf/src/recipes.ts",
    },
    {
      importer: localHostApp,
      target: workbenchApp,
      specifier: workbenchApp.name,
      sourceFile: "apps/local-host/src/web-server.ts",
    },
  ];

  for (const observation of allowed) {
    assert.deepEqual(evaluateImportBoundary(observation), [], observation.specifier);
  }
});

const layerPackages = () => ({
  contracts: boundaryPackage("@molis-ai/molis-work-contracts", "packages/contracts", "foundation"),
  app: boundaryPackage("@molis-ai/molis-work-app-workbench", "apps/workbench", "app"),
  modulePackage: boundaryPackage("@molis-ai/molis-work-module-goals", "modules/goals", "module"),
  otherModule: boundaryPackage("@molis-ai/molis-work-module-artifacts", "modules/artifacts", "module"),
  nativePlugin: boundaryPackage("@molis-ai/molis-work-plugin-feed", "plugins/native/feed", "native-plugin"),
  integration: boundaryPackage("@molis-ai/molis-work-integration-github", "plugins/official-integrations/github", "integration-plugin"),
  horizontal: boundaryPackage("@molis-ai/molis-work-service-scheduler", "horizontal/scheduler", "horizontal"),
  kernel: boundaryPackage("@molis-ai/molis-work-kernel", "packages/kernel", "foundation"),
  sdk: boundaryPackage("@molis-ai/molis-work-plugin-sdk", "packages/plugin-sdk", "foundation"),
});

test("rejects a Module importing a Horizontal Service, an App or a Plugin", () => {
  const { app, modulePackage, nativePlugin, integration, horizontal, kernel, contracts, otherModule } = layerPackages();
  for (const target of [app, nativePlugin, integration, horizontal]) {
    assert.deepEqual(
      [...violationCodes({
        importer: boundaryPackage(modulePackage.name, modulePackage.path, modulePackage.kind, [target.name]),
        target,
        specifier: target.name,
        sourceFile: "modules/goals/src/index.ts",
      })],
      ["module-upward-dependency"],
      target.name,
    );
  }
  // The same rule covers a manifest dependency, which check-package-boundaries.mjs feeds through the same function.
  const declared = evaluateImportBoundary({
    importer: boundaryPackage(modulePackage.name, modulePackage.path, modulePackage.kind, [horizontal.name]),
    target: horizontal,
    specifier: horizontal.name,
    sourceFile: "modules/goals/package.json",
  });
  assert.deepEqual(declared.map((item) => item.code), ["module-upward-dependency"]);
  // Not this rule: platform packages stay legal, and another Module has its own, older rule.
  for (const target of [kernel, contracts]) {
    assert.ok(!violationCodes({
      importer: boundaryPackage(modulePackage.name, modulePackage.path, modulePackage.kind, [target.name]),
      target,
      specifier: target.name,
      sourceFile: "modules/goals/src/index.ts",
    }).has("module-upward-dependency"), target.name);
  }
  assert.ok(violationCodes({
    importer: boundaryPackage(modulePackage.name, modulePackage.path, modulePackage.kind, [otherModule.name]),
    target: otherModule,
    specifier: otherModule.name,
    sourceFile: "modules/goals/src/index.ts",
  }).has("cross-module-implementation"));
});

test("rejects a Plugin importing an App, a Horizontal Service or a Module, except the listed Shelf import", () => {
  const { app, modulePackage, nativePlugin, integration, horizontal, sdk, kernel } = layerPackages();
  // `server` (identity, devices, continuity and the chat domain) is a business package, so it counts as a Module here.
  const serverModule = boundaryPackage("@molis-ai/molis-work-server", "server", "module");
  for (const importerBase of [nativePlugin, integration]) {
    for (const target of [app, modulePackage, horizontal, serverModule]) {
      assert.ok(
        violationCodes({
          importer: boundaryPackage(importerBase.name, importerBase.path, importerBase.kind, [target.name]),
          target,
          specifier: target.name,
          sourceFile: `${importerBase.path}/src/index.ts`,
        }).has("plugin-upward-dependency"),
        `${importerBase.name} -> ${target.name}`,
      );
    }
    for (const target of [sdk, kernel]) {
      assert.deepEqual(
        evaluateImportBoundary({
          importer: boundaryPackage(importerBase.name, importerBase.path, importerBase.kind, [target.name]),
          target,
          specifier: target.name,
          sourceFile: `${importerBase.path}/src/index.ts`,
        }),
        [],
        `${importerBase.name} -> ${target.name}`,
      );
    }
  }
  // The Goals plugin declared the Goals Module without importing it; the decision is that it declares nothing upward.
  const goalsPlugin = boundaryPackage("@molis-ai/molis-work-plugin-goals", "plugins/native/goals", "native-plugin", [modulePackage.name]);
  assert.ok(violationCodes({
    importer: goalsPlugin,
    target: modulePackage,
    specifier: modulePackage.name,
    sourceFile: "plugins/native/goals/package.json",
  }).has("plugin-upward-dependency"));
  // Listed: Shelf's Module. Any other Module, and the Shelf plugin importing a different Module, stay rejected.
  const shelfModule = boundaryPackage("@molis-ai/molis-work-module-shelf", "modules/shelf", "module");
  const shelfPlugin = boundaryPackage("@molis-ai/molis-work-plugin-shelf", "plugins/native/shelf", "native-plugin", [shelfModule.name, modulePackage.name]);
  assert.deepEqual(violationCodes({ importer: shelfPlugin, target: shelfModule, specifier: shelfModule.name, sourceFile: "plugins/native/shelf/src/index.ts" }), new Set());
  assert.ok(violationCodes({ importer: shelfPlugin, target: modulePackage, specifier: modulePackage.name, sourceFile: "plugins/native/shelf/src/index.ts" }).has("plugin-upward-dependency"));
});

test("rejects an App importing another App unless the edge is listed", () => {
  const apps = Object.fromEntries(["desktop", "local-host", "cli", "mcp", "workbench", "server"].map((name) => [name,
    boundaryPackage(`@molis-ai/molis-work-app-${name}`, `apps/${name}`, "app")]));
  const root = boundaryPackage("@molis-ai/molis-work", ".", "app");
  const edge = (from, to) => violationCodes({
    importer: boundaryPackage(from.name, from.path, from.kind, [to.name]),
    target: to,
    specifier: to.name,
    sourceFile: `${from.path}/src/index.ts`,
  });
  for (const [from, to] of [[apps.workbench, apps.cli], [apps.cli, apps["local-host"]], [apps.mcp, apps.workbench], [apps["local-host"], apps.desktop], [apps.desktop, apps.server], [root, apps.workbench], [root, apps.cli]]) {
    assert.ok(edge(from, to).has("app-dependency-not-allowed"), `${from.name} -> ${to.name}`);
  }
  for (const entry of APP_IMPORT_ALLOWLIST) {
    const [from, to] = entry.split(" -> ");
    const importer = from === root.path ? root : Object.values(apps).find((item) => item.path === from);
    const target = Object.values(apps).find((item) => item.path === to);
    assert.ok(importer && target, entry);
    assert.deepEqual(edge(importer, target), new Set(), entry);
  }
  // Only App → App is covered: an App may use any Module, Horizontal Service, Plugin or platform package it declares.
  const { modulePackage, horizontal, nativePlugin, kernel } = layerPackages();
  for (const target of [modulePackage, horizontal, nativePlugin, kernel]) {
    assert.ok(!edge(apps["local-host"], target).has("app-dependency-not-allowed"), target.name);
  }
});

test("the layer exceptions are exactly the edges that exist today", () => {
  // A change here is a decision that shows up in review: the lists only shrink as the debts are paid. Keyed by package path.
  assert.deepEqual([...PLUGIN_MODULE_IMPORT_ALLOWLIST], [
    "plugins/native/shelf -> modules/shelf",
  ]);
  assert.deepEqual([...APP_IMPORT_ALLOWLIST], [
    ". -> apps/desktop",
    ". -> apps/local-host",
    ". -> apps/mcp",
    "apps/desktop -> apps/local-host",
    "apps/local-host -> apps/cli",
    "apps/local-host -> apps/mcp",
    "apps/local-host -> apps/workbench",
    "apps/server -> apps/desktop",
    "apps/server -> apps/local-host",
  ]);
});

test("a listed layer exception that no import or dependency uses is reported, so the lists cannot keep dead edges", () => {
  const listed = [...APP_IMPORT_ALLOWLIST, ...PLUGIN_MODULE_IMPORT_ALLOWLIST];
  assert.deepEqual(unusedLayerExceptions(listed), []);
  // Edges the repository has beyond the lists are judged by the layer rules, not here.
  assert.deepEqual(unusedLayerExceptions([...listed, "apps/cli -> apps/mcp", "plugins/native/goals -> modules/goals"]), []);
  // Each entry is needed on its own: an edge the repository stopped using is named, and nothing else.
  for (const entry of listed) {
    assert.deepEqual(unusedLayerExceptions(listed.filter((edge) => edge !== entry)), [entry], entry);
  }
  assert.deepEqual(unusedLayerExceptions([]), listed);
  // Any iterable of observed edges works (the checker passes sets).
  assert.ok(!unusedLayerExceptions(new Set(["apps/server -> apps/desktop"])).includes("apps/server -> apps/desktop"));
});

// The Plugin SDK is what an author installs next to the contracts. Anything else it depends on would be missing on the author's
// machine (it broke once: the SDK re-exported the private Kernel's lifetime helper, and the packed sample could not install), so
// the SDK may depend on the contracts only. The same rule runs on declared dependencies in package.json
// (scripts/check-package-boundaries.mjs evaluates those edges too).
const sdkImporting = (target, specifier = target.name) => {
  const { sdk } = layerPackages();
  return {
    importer: boundaryPackage(sdk.name, sdk.path, sdk.kind, [target.name]),
    target,
    specifier,
    sourceFile: "packages/plugin-sdk/src/index.ts",
  };
};

test("rejects the Plugin SDK importing the Kernel", () => {
  const { kernel } = layerPackages();
  assert.ok(violationCodes(sdkImporting(kernel)).has("public-sdk-private-dependency"));
});

test("rejects the Plugin SDK importing Plugin Runtime", () => {
  const runtime = boundaryPackage("@molis-ai/molis-work-plugin-runtime", "packages/plugin-runtime", "foundation");
  assert.ok(violationCodes(sdkImporting(runtime)).has("public-sdk-private-dependency"));
});

test("rejects the Plugin SDK importing the Local Host, whichever other rule also applies", () => {
  const localHost = boundaryPackage("@molis-ai/molis-work-app-local-host", "apps/local-host", "app");
  const codes = violationCodes(sdkImporting(localHost));
  assert.ok(codes.has("public-sdk-private-dependency"));
  assert.ok(codes.has("platform-reverse-dependency"));
});

test("allows the Plugin SDK importing the contracts through a subpath", () => {
  const contracts = boundaryPackage("@molis-ai/molis-work-contracts", "packages/contracts", "foundation", [], [".", "./platform/plugin"]);
  assert.deepEqual(evaluateImportBoundary(sdkImporting(contracts, `${contracts.name}/platform/plugin`)), []);
  // Only the SDK is held to this: the Kernel and Plugin Runtime depend on the SDK and on each other's lower layers freely.
  const { sdk, kernel } = layerPackages();
  const kernelImportingSdk = { importer: boundaryPackage(kernel.name, kernel.path, kernel.kind, [sdk.name]), target: sdk, specifier: sdk.name, sourceFile: "packages/kernel/src/action-service.ts" };
  assert.deepEqual(evaluateImportBoundary(kernelImportingSdk), []);
});

// RAC-549 RAC-550
test("rejects a Plugin importing a private UI package, and lets only Plugin Studio keep it", () => {
  const designSystem = boundaryPackage("@molis-ai/molis-work-design-system", "packages/design-system", "foundation");
  const importing = (path, name, target = designSystem) => ({
    importer: boundaryPackage(name, path, "native-plugin", [target.name]),
    target,
    specifier: target.name,
    sourceFile: `${path}/src/ui.ts`,
  });
  assert.ok(violationCodes(importing("plugins/native/files", "@molis-ai/molis-work-plugin-files")).has("plugin-private-ui-dependency"));
  for (const other of [
    boundaryPackage("@molis-ai/molis-work-im-ui", "packages/im-ui", "foundation"),
    boundaryPackage("@molis-ai/molis-work-ui-host", "packages/ui-host", "foundation"),
  ]) {
    assert.ok(violationCodes(importing("plugins/native/files", "@molis-ai/molis-work-plugin-files", other)).has("plugin-private-ui-dependency"), other.name);
  }
  assert.deepEqual(PRIVATE_UI_EXEMPT_PLUGINS, ["plugins/native/plugin-builder"]);
  assert.ok(!violationCodes(importing("plugins/native/plugin-builder", "@molis-ai/molis-work-plugin-builder")).has("plugin-private-ui-dependency"));
  // An integration plugin is held to it too, and an App or the design system's own users are not.
  const integration = { ...importing("plugins/integrations/gmail", "@molis-ai/molis-work-integration-gmail"), importer: boundaryPackage("@molis-ai/molis-work-integration-gmail", "plugins/integrations/gmail", "integration-plugin", [designSystem.name]) };
  assert.ok(violationCodes(integration).has("plugin-private-ui-dependency"));
  const workbench = { importer: boundaryPackage("@molis-ai/molis-work-app-workbench", "apps/workbench", "app", [designSystem.name]), target: designSystem, specifier: designSystem.name, sourceFile: "apps/workbench/src/renderer.ts" };
  assert.ok(!violationCodes(workbench).has("plugin-private-ui-dependency"));
});
