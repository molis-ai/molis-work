import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginDefinition, PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { definitionOrigin, pluginLocaleFilePaths, pluginLocaleReader, type PluginLocaleRead, type PluginLocaleReader, type PluginSupervisorEntry } from "@molis-ai/molis-work-plugin-runtime";
import { registeredPluginLocaleFiles } from "./registered-plugin-files.js";

interface NativeReleaseBundle {
  schema_version: /* @version format.plugin.native-release */ 1;
  export_name: string;
  module_source: string;
}

/**
 * Preserve a trusted built-in factory without capturing project ports or data.
 * Its implementation is bundled as one ESM module in the same project's
 * Runtime database; the Host injects the current ports again when restoring it.
 */
export function nativePluginReleaseArtifact<TFactory>(
  packageName: string,
  exportName: string,
  restore: (factory: TFactory, read: PluginLocaleRead) => PluginDefinition,
  words?: { manifest: PluginManifest; read: PluginLocaleRead },
): NonNullable<PluginSupervisorEntry["releaseArtifact"]> {
  const wrapper = `export { ${exportName} as __native_plugin_factory } from ${JSON.stringify(packageName)};`;
  return {
    async capture() {
      const result = await build({
        stdin: {
          contents: wrapper,
          resolveDir: dirname(fileURLToPath(import.meta.url)),
          sourcefile: "native-plugin-release.mjs",
          loader: "js",
        },
        absWorkingDir: dirname(fileURLToPath(import.meta.url)),
        bundle: true,
        write: false,
        format: "esm",
        platform: "node",
        packages: "bundle",
        target: "node24",
        // Bundled CommonJS can still require Node builtins. Resolve those inside the
        // archived ESM module without consulting the current installation's packages.
        banner: { js: `function require(id) {
          const builtin = process.getBuiltinModule(id);
          if (builtin === undefined) throw new Error("Native plugin release cannot load " + id);
          return builtin;
        }` },
      });
      const output = result.outputFiles[0]?.text;
      if (!output) throw new Error("Native 插件发行物构建没有输出代码");
      // Archive the selected release's files in the trusted module source. The saved release envelope stays the same.
      const files = words && Object.fromEntries(pluginLocaleFilePaths(words.manifest).map(path => {
        const content = words.read(path);
        if (content === null) throw new Error(`插件发行物缺少 ${path}`);
        return [path, content];
      }));
      const module_source = files && Object.keys(files).length ? output + "\nexport const __native_plugin_locales = " + JSON.stringify(files) + ";\n" : output;
      const bundle: NativeReleaseBundle = { schema_version: /* @version format.plugin.native-release */ 1, export_name: exportName, module_source };
      return JSON.stringify(bundle);
    },
    async restore(value) {
      let bundle: NativeReleaseBundle;
      try {
        bundle = JSON.parse(value) as NativeReleaseBundle;
      } catch {
        throw new Error("Native 插件发行物无法解析");
      }
      if (bundle.schema_version !== /* @version format.plugin.native-release */ 1 || bundle.export_name !== exportName || !bundle.module_source.trim()) {
        throw new Error("Native 插件发行物格式与工厂不匹配");
      }
      const imported = await import(`data:text/javascript;base64,${Buffer.from(bundle.module_source).toString("base64")}`) as {
        __native_plugin_factory?: TFactory;
        __native_plugin_locales?: Readonly<Record<string, string>>;
      };
      if (typeof imported.__native_plugin_factory !== "function") throw new Error("Native 插件工厂未导出");
      const files = imported.__native_plugin_locales ?? {};
      return restore(imported.__native_plugin_factory, path => Object.hasOwn(files, path) ? files[path]! : null);
    },
  };
}

/** The entry's Runtime definition is the only way to reach its released files. An archived module never looks up current files. */
export function registeredNativePlugin(entry: { create: () => PluginDefinition; package_name: string; factory_export: string },
  afterRestore?: (definition: PluginDefinition) => void) {
  const definition = entry.create(), manifest = definition.manifest, read = registeredPluginLocaleFiles(entry.package_name, manifest);
  const readers = new WeakMap<PluginDefinition, PluginLocaleReader | null>([[definition, pluginLocaleReader(manifest, read)]]);
  const releaseArtifact = nativePluginReleaseArtifact<() => PluginDefinition>(entry.package_name, entry.factory_export, (factory, saved) => {
    const restored = factory();
    readers.set(restored, pluginLocaleReader(restored.manifest, saved));
    afterRestore?.(restored);
    return restored;
  }, { manifest, read });
  return { definition, releaseArtifact, localePacks: (current: PluginDefinition) => readers.get(definitionOrigin(current)) ?? null };
}
