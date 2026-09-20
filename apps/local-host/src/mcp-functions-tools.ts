import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { MolisWorkV1Error } from "@molis-ai/molis-work-plugin-goals";
import {
  FunctionsError,
  createFunctionsService,
  createHttpTypeSafeProvider,
  openFunctionsStore,
  type FunctionsSecretPort,
  type TypeSafeProvider,
} from "@molis-ai/molis-work-plugin-functions";
import type { McpToolCallContext } from "@molis-ai/molis-work-app-mcp";
import type { MolisWorkRuntimeContextHost } from "@molis-ai/molis-work-contracts/platform/app-host";

export interface McpFunctionsPorts {
  requireHost(context: McpToolCallContext): MolisWorkRuntimeContextHost;
  secrets?: FunctionsSecretPort;
  provider?: TypeSafeProvider;
  env?: NodeJS.Dict<string>;
}

export function createMcpFunctionsHandlers(ports: McpFunctionsPorts) {
  const withService = async <T>(context: McpToolCallContext, run: (service: ReturnType<typeof createFunctionsService>) => Promise<T> | T): Promise<T> => {
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
      });
      return await run(service);
    } catch (error) {
      throw mapFunctionsError(error);
    } finally {
      store.close();
    }
  };

  return {
    molis_work_v1_functions_list: async (_arguments: Record<string, unknown>, context: McpToolCallContext) => {
      return withService(context, (service) => JSON.stringify({ functions: service.listPublished() }, null, 2));
    },
    molis_work_v1_functions_describe: async (arguments_: Record<string, unknown>, context: McpToolCallContext) => {
      return withService(context, (service) => JSON.stringify({
        function: service.describePublished(stringField(arguments_.function_key)),
      }, null, 2));
    },
    molis_work_v1_functions_invoke: async (arguments_: Record<string, unknown>, context: McpToolCallContext) => {
      return withService(context, (service) => service.invokePublished(
        stringField(arguments_.function_key),
        stringField(arguments_.input),
      ).then((result) => JSON.stringify(result, null, 2)));
    },
  };
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mapFunctionsError(error: unknown): unknown {
  if (error instanceof FunctionsError) {
    return new MolisWorkV1Error(error.code, error.message);
  }
  return error;
}
