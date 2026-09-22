import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
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
    }).has("legacy-root-import"),
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
  const goalsPlugin = boundaryPackage(
    "@molis-ai/molis-work-plugin-goals",
    "plugins/native/goals",
    "native-plugin",
    [goals.name],
  );

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
    {
      importer: goalsPlugin,
      target: goals,
      specifier: goals.name,
      sourceFile: "plugins/native/goals/src/index.ts",
    },
  ];

  for (const observation of allowed) {
    assert.deepEqual(evaluateImportBoundary(observation), [], observation.specifier);
  }
});
