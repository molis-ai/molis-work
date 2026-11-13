import type { IncomingMessage, ServerResponse } from "node:http";
import { observationActions, type ObservationReportInput } from "@molis-ai/molis-work-contracts/services/observation";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { readNativePluginJsonBody } from "./native-plugin-http.js";
import { sendLocalWebJson as json } from "./web-http.js";
import { webEntryDoor } from "./web-entry-actions.js";
import type { MolisWorkLocalHost } from "./project-host.js";

/**
 * The shell's only way to report its UI stages (specs/observation-collection/contract-design.md §4): the workbench's own route issues one
 * entry credential per request, and `observation.report@1` serves a `user` call only with it. A plugin page, another route or a hand-made
 * `user` call carries none and is refused (`S-observation-records`).
 */
export const observationShellDoor = webEntryDoor<null>("observation:ui", () => uiText.text("workbench.observation.entry-refused"));

const ROUTE = "/api/observation/ui";
/** The route reads at most one report's worth of body; the action's own limits still apply. */
const MAX_BODY_BYTES = 1_200_000;

export async function handleObservationShellHttp(request: IncomingMessage, response: ServerResponse, url: URL, host: MolisWorkLocalHost): Promise<boolean> {
  if (url.pathname !== ROUTE) return false;
  if (request.method !== "POST") { json(response, 405, { error: "method_not_allowed" }); return true; }
  try {
    // The action checks the shape against its schema before its handler runs; only `facts` is taken from the body.
    const body = await readNativePluginJsonBody(request, MAX_BODY_BYTES), input = { facts: body.facts } as ObservationReportInput;
    json(response, 200, await observationShellDoor.invoke({ host, request, entry: null }, observationActions.report, input));
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : "report_failed" });
  }
  return true;
}
