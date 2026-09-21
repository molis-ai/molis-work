import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { MolisWorkV1Error } from "@molis-ai/molis-work-contracts/platform/errors";
import {
  FunctionsError,
  createFunctionsService,
  createHttpTypeSafeProvider,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-module-functions";
import {
  functionsManifest,
  runFunctionsMcpTool,
} from "@molis-ai/molis-work-plugin-functions";
import type { PluginMcpHandleRequest } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";
import { liveHostAllowedBehaviorIds } from "./behavior-catalog.js";

export interface McpFunctionsPorts {
  requireHost(context: McpToolCallContext): MolisWorkRuntimeContextHost;
  secrets?: FunctionsSecretPort;
  provider?: TypeSafeProvider;
  env?: NodeJS.Dict<string>;
}

/** Opens the local Functions store and forwards `{ tool_id, arguments }`. Do not branch on public MCP names. */
export function createFunctionsMcpAdapter(ports: McpFunctionsPorts) {
  const withService = async <T>(
    context: McpToolCallContext,
    run: (service: ReturnType<typeof createFunctionsService>) => Promise<T> | T,
  ): Promise<T> => {
    const host = ports.requireHost(context);
    if (!host.homeDirectory) {
      throw new MolisWorkV1Error("mcp.context_host_missing", "MCP 宿主没有提供本机目录，无法读取判断函数");
    }
    const store = openFunctionsStore(host.homeDirectory);
    try {
      const service = createFunctionsService({
        store,
        secrets: ports.secrets ?? createFileSecretStore(),
        env: ports.env ?? process.env,
        provider: ports.provider ?? createHttpTypeSafeProvider(),
        allowed_behavior_ids: liveHostAllowedBehaviorIds(),
      });
      return await run(service);
    } catch (error) {
      throw mapFunctionsError(error);
    } finally {
      store.close();
    }
  };

  return {
    plugin_id: functionsManifest.plugin_id,
    handle: (request: PluginMcpHandleRequest, context: McpToolCallContext) =>
      withService(context, async (service) => runFunctionsMcpTool(service, request)),
  };
}

function mapFunctionsError(error: unknown): unknown {
  if (error instanceof FunctionsError) {
    return new MolisWorkV1Error(error.code, error.message);
  }
  return error;
}
