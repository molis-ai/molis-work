import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import type { PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import {
  DatasetError,
  datasetManifest,
  openDatasetStore,
  runDatasetMcpTool,
} from "@molis-ai/molis-work-plugin-dataset";
import {
  FormError,
  formManifest,
  openFormStore,
  runFormMcpTool,
} from "@molis-ai/molis-work-plugin-form";
import {
  PagesError,
  openPagesStore,
  pagesManifest,
  runPagesMcpTool,
} from "@molis-ai/molis-work-plugin-pages";
import {
  PptError,
  openPptStore,
  pptManifest,
  runPptMcpTool,
} from "@molis-ai/molis-work-plugin-ppt";
import type { NativeMcpAdapterPorts, NativeMcpPluginAdapter } from "./mcp-native-plugins.js";

/**
 * Personal native plugins whose records live in `{home}/…/*.db` and are
 * partitioned by the bound project. Host injects project_id; adapters do not
 * read it from tool arguments.
 */
export function createPagesMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return createBoundProjectStoreAdapter({
    plugin_id: pagesManifest.plugin_id,
    missingHome: "MCP 宿主没有提供本机目录，无法读取文档",
    openStore: openPagesStore,
    run: (store, request, projectId) => runPagesMcpTool(store, request, projectId, {
      publishArtifact: ports.publishPagesArtifact,
    }),
    mapError: (error) => error instanceof PagesError ? new MolisWorkV1Error(error.code, error.message) : error,
    ports,
  });
}

export function createFormMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return createBoundProjectStoreAdapter({
    plugin_id: formManifest.plugin_id,
    missingHome: "MCP 宿主没有提供本机目录，无法读取问卷",
    openStore: openFormStore,
    run: (store, request, projectId) => runFormMcpTool(store, request, projectId, {
      publishArtifact: ports.publishFormArtifact,
    }),
    mapError: (error) => error instanceof FormError ? new MolisWorkV1Error(error.code, error.message) : error,
    ports,
  });
}

export function createDatasetMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return createBoundProjectStoreAdapter({
    plugin_id: datasetManifest.plugin_id,
    missingHome: "MCP 宿主没有提供本机目录，无法读取数据表",
    openStore: openDatasetStore,
    run: (store, request, projectId) => runDatasetMcpTool(store, request, projectId, {
      publishArtifact: ports.publishDatasetArtifact,
    }),
    mapError: (error) => error instanceof DatasetError ? new MolisWorkV1Error(error.code, error.message) : error,
    ports,
  });
}

export function createPptMcpAdapter(ports: NativeMcpAdapterPorts): NativeMcpPluginAdapter {
  return createBoundProjectStoreAdapter({
    plugin_id: pptManifest.plugin_id,
    missingHome: "MCP 宿主没有提供本机目录，无法读取演示稿",
    openStore: openPptStore,
    run: (store, request, projectId) => runPptMcpTool(store, request, projectId, {
      publishArtifact: ports.publishPptArtifact,
    }),
    mapError: (error) => error instanceof PptError ? new MolisWorkV1Error(error.code, error.message) : error,
    ports,
  });
}

function createBoundProjectStoreAdapter<TStore extends { close(): void }>(input: {
  plugin_id: string;
  missingHome: string;
  openStore: (homeDirectory: string) => TStore;
  run: (store: TStore, request: PluginMcpHandleRequest, projectId: string) => string | Promise<string>;
  mapError: (error: unknown) => unknown;
  ports: NativeMcpAdapterPorts;
}): NativeMcpPluginAdapter {
  return {
    plugin_id: input.plugin_id,
    async handle(request: PluginMcpHandleRequest, context: McpToolCallContext) {
      const host = input.ports.requireHost(context);
      if (!host.homeDirectory) {
        throw new MolisWorkV1Error("mcp.context_host_missing", input.missingHome);
      }
      const projectId = input.ports.boundProjectId?.(context)?.trim() ?? "";
      if (!projectId) {
        throw new MolisWorkV1Error(
          "mcp.connection_incomplete",
          "MCP 尚未连接项目：请先由统一 Molis Work Skill 调用 molis_work_v1_context_resolve，或由宿主提供固定连接",
        );
      }
      const store = input.openStore(host.homeDirectory);
      try {
        return await input.run(store, request, projectId);
      } catch (error) {
        throw input.mapError(error);
      } finally {
        store.close();
      }
    },
  };
}
