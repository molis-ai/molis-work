import { build } from "esbuild";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PluginSupervisorEntry } from "@molis-ai/molis-work-plugin-runtime";

interface NativeReleaseBundle {
  schema_version: 1;
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
  restore: (factory: TFactory) => PluginDefinition,
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
      });
      const module_source = result.outputFiles[0]?.text;
      if (!module_source) throw new Error("Native 插件发行物构建没有输出代码");
      const bundle: NativeReleaseBundle = { schema_version: 1, export_name: exportName, module_source };
      return JSON.stringify(bundle);
    },
    async restore(value) {
      let bundle: NativeReleaseBundle;
      try {
        bundle = JSON.parse(value) as NativeReleaseBundle;
      } catch {
        throw new Error("Native 插件发行物无法解析");
      }
      if (bundle.schema_version !== 1 || bundle.export_name !== exportName || !bundle.module_source.trim()) {
        throw new Error("Native 插件发行物格式与工厂不匹配");
      }
      const imported = await import(`data:text/javascript;base64,${Buffer.from(bundle.module_source).toString("base64")}`) as {
        __native_plugin_factory?: TFactory;
      };
      if (typeof imported.__native_plugin_factory !== "function") throw new Error("Native 插件工厂未导出");
      return restore(imported.__native_plugin_factory);
    },
  };
}
