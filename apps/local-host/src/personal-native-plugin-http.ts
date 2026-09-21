import { handleExperimentsNativePluginHttp } from "./experiments-native-plugin-http.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { PagesRoutePorts } from "@molis-ai/molis-work-plugin-pages";
import { handleShelfNativePluginHttp } from "./shelf-native-plugin-http.js";
import { handleFunctionsNativePluginHttp } from "./functions-native-plugin-http.js";
import { handlePagesNativePluginHttp } from "./pages-native-plugin-http.js";
import { handleFormNativePluginHttp } from "./form-native-plugin-http.js";
import { handleDatasetNativePluginHttp } from "./dataset-native-plugin-http.js";
import { handlePptNativePluginHttp } from "./ppt-native-plugin-http.js";
import { handleLingguangNativePluginHttp } from "./lingguang-native-plugin-http.js";
import { withRewrittenPluginApi } from "./native-plugin-api.js";
import { hostCompleteText } from "./host-complete-text.js";

export interface PersonalNativePluginHttpPorts {
  readonly publishArtifact?: PagesRoutePorts["publishArtifact"];
  readonly completeText?: PagesRoutePorts["completeText"];
}

export async function handlePersonalNativePluginHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  homeDirectory: string,
  ports: PersonalNativePluginHttpPorts = {},
): Promise<boolean> {
  const routed = withRewrittenPluginApi(url);
  const completeText = ports.completeText ?? hostCompleteText();
  for (const handle of [
    () => handleExperimentsNativePluginHttp(request, response, routed, homeDirectory),
    () => handleShelfNativePluginHttp(request, response, routed, homeDirectory),
    () => handleFunctionsNativePluginHttp(request, response, routed, homeDirectory),
    () => handlePagesNativePluginHttp(request, response, routed, homeDirectory, {
      publishArtifact: ports.publishArtifact,
      completeText,
    }),
    () => handleFormNativePluginHttp(request, response, routed, homeDirectory, { completeText }),
    () => handleDatasetNativePluginHttp(request, response, routed, homeDirectory, { completeText }),
    () => handlePptNativePluginHttp(request, response, routed, homeDirectory),
    () => handleLingguangNativePluginHttp(request, response, routed, homeDirectory, { completeText }),
  ]) {
    if (await handle()) return true;
  }
  return false;
}
