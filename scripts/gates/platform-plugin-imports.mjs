import fs from "node:fs";
import path from "node:path";
import { extractImportSpecifiers } from "@molis-ai/molis-work-test-kit";

const SOURCE_EXTENSIONS = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const PLATFORM_ROOTS = ["apps", "packages", "horizontal", "modules", "server"];

/** Generated plugin registries may import only `/registration` subpaths. */
export const GENERATED_PLUGIN_REGISTRIES = new Set([
  "apps/local-host/src/plugin-registry.generated.ts",
  "apps/workbench/src/builtin-plugins.ts",
]);

/**
 * Spec §3 (specs/plugin-equal-standing/spec.md) whitelist: the native plugins still wired from the Host (the studio left in 47-1:
 * it is the platform's `horizontal/plugin-studio`, not a plugin),
 * locked to their existing platform entry files so no accidental new platform imports grow.
 */
export const SPEC_SECTION3_WHITELIST = {
  "@molis-ai/molis-work-plugin-alchemist": new Set([
    "apps/local-host/src/alchemist-native-plugin-http.ts",
    "apps/local-host/src/alchemist-prologue.ts",
    "apps/local-host/src/alchemist-search.ts",
    "apps/local-host/src/alchemist-service-host.ts",
    "apps/local-host/src/web-request.ts",
  ]),
  "@molis-ai/molis-work-plugin-shelf": new Set([
    "apps/local-host/src/demo-plugin-seed.ts",
  ]),
};

/**
 * Separate migration-only exception list (PEQ-03). Every entry carries its removal condition
 * and is checked for staleness so retired upgrades leave the list with their code.
 * Empty after the pre-release v1 baseline reset.
 */
export const MIGRATION_PLUGIN_IMPORT_EXCEPTIONS = [];

function collectPlatformFiles(repositoryRoot) {
  const result = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const name of fs.readdirSync(directory)) {
      if (name === "dist" || name === "node_modules" || name === "tests" || name === "__tests__") continue;
      const child = path.join(directory, name);
      const stat = fs.lstatSync(child);
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        walk(child);
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(child))) continue;
      const rel = path.relative(repositoryRoot, child).split(path.sep).join("/");
      if (rel === "apps/sync-worker/test.mjs" || /\.test\.[cm]?[jt]sx?$/u.test(rel)) continue;
      result.push({ rel, full: child });
    }
  };
  for (const root of PLATFORM_ROOTS) walk(path.join(repositoryRoot, root));
  return result;
}

/**
 * PEQ-03: Platform directories (`apps/`, `packages/`, `horizontal/`, `modules/`, `server/`) must not import
 * native plugin packages (`plugins/native/*`), whether by package name, relative path, or dynamic import/require,
 * outside the two generated registries, the spec §3 whitelist, and the explicit migration-only exception list.
 */
const DYNAMIC_PLUGIN_TEMPLATE = /\b(?:import|require)\s*\(\s*`([^`]*?(?:@molis-ai\/molis-work-plugin-|plugins\/native\/)[^`]*)`/gu;

export function checkPlatformNoPluginPackageImports(repositoryRoot, packages, overrides = {}) {
  const nativePlugins = packages.filter((pkg) => pkg.path.startsWith("plugins/native/"));
  const nativePluginNames = nativePlugins.map((pkg) => pkg.name);
  const nativePluginByPath = new Map(nativePlugins.map((pkg) => [pkg.path, pkg.name]));
  const findNativePlugin = (specifier, file) => {
    const byName = nativePluginNames.find((name) => specifier === name || specifier.startsWith(`${name}/`));
    if (byName) return byName;
    if (specifier.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
      const match = /^plugins\/native\/([^/]+)(?:\/|$)/u.exec(resolved);
      if (match) return nativePluginByPath.get(`plugins/native/${match[1]}`) ?? `plugins/native/${match[1]}`;
    }
    return undefined;
  };
  const migrationByFile = new Map(MIGRATION_PLUGIN_IMPORT_EXCEPTIONS.map((entry) => [entry.file, new Set(entry.packages)]));
  const usedMigrations = new Map();
  const files = overrides.files ?? collectPlatformFiles(repositoryRoot).map(({ rel, full }) => ({
    file: rel,
    source: fs.readFileSync(full, "utf8"),
  }));
  const errors = [];

  for (const { file, source } of files) {
    for (const specifier of extractImportSpecifiers(source)) {
      const target = findNativePlugin(specifier, file);
      if (!target) continue;
      if (GENERATED_PLUGIN_REGISTRIES.has(file)) {
        if (specifier !== `${target}/registration`) {
          errors.push(`${file}: generated registry may only import ${target}/registration, got ${specifier}`);
        }
        continue;
      }
      if (SPEC_SECTION3_WHITELIST[target]?.has(file)) continue;
      const allowedMigration = migrationByFile.get(file);
      if (allowedMigration?.has(target)) {
        let seen = usedMigrations.get(file);
        if (!seen) { seen = new Set(); usedMigrations.set(file, seen); }
        seen.add(target);
        continue;
      }
      errors.push(`${file}: platform code must not import native plugin package ${specifier} (PEQ-03)`);
    }
    for (const match of source.matchAll(DYNAMIC_PLUGIN_TEMPLATE)) {
      const template = match[1] ?? "";
      if (!template.includes("${")) continue;
      errors.push(`${file}: platform code must not dynamically import native plugin via template \`${template}\` (PEQ-03)`);
    }
  }

  if (!overrides.files) {
    for (const entry of MIGRATION_PLUGIN_IMPORT_EXCEPTIONS) {
      const seen = usedMigrations.get(entry.file);
      for (const pkg of entry.packages) {
        if (!seen?.has(pkg)) {
          errors.push(`${entry.file}: stale PEQ-03 migration exception for ${pkg} (removeWhen: ${entry.removeWhen})`);
        }
      }
    }
  }

  return errors;
}
