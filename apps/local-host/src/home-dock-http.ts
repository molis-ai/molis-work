import type { IncomingMessage, ServerResponse } from "node:http";
import { HOME_DOCK_SCENE_ID } from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "@molis-ai/molis-work-module-functions";
import { sendLocalWebJson as sendJson, readLocalWebBody as readBody } from "./web-http.js";
import {
  bindBoardFunctionScene,
  functionSceneHttpBody,
  parseSceneFunctionKey,
} from "./functions-host.js";

export interface HomeDockHttpOptions {
  readonly boardId: string;
  readonly homeDirectory?: string;
  readonly invalidateWebView: () => void;
}

export async function handleHomeDockJudgmentHttp(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  options: HomeDockHttpOptions,
): Promise<boolean> {
  if (url.pathname !== "/api/home/dock-judgment") return false;
  const method = request.method;
  if (method === "GET") {
    if (!options.homeDirectory) {
      sendJson(response, 200, { function_key: null, functions: [] });
      return true;
    }
    sendJson(response, 200, functionSceneHttpBody(options.homeDirectory, options.boardId, HOME_DOCK_SCENE_ID));
    return true;
  }
  if (method !== "POST") return false;
  if (!options.homeDirectory) {
    sendJson(response, 400, { error: "判断能力不可用" });
    return true;
  }
  try {
    const body = await readBody(request);
    const functionKey = parseSceneFunctionKey(body);
    if (functionKey === undefined) {
      sendJson(response, 400, { error: "请选择已发布函数，或留空" });
      return true;
    }
    const result = bindBoardFunctionScene(options.homeDirectory, HOME_DOCK_SCENE_ID, options.boardId, functionKey);
    options.invalidateWebView();
    sendJson(response, 200, {
      ...result,
      functions: functionSceneHttpBody(options.homeDirectory, options.boardId, HOME_DOCK_SCENE_ID).functions,
    });
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof FunctionsError ? error.code : undefined;
    sendJson(response, 400, { error: message, ...(code ? { code } : {}) });
    return true;
  }
}
