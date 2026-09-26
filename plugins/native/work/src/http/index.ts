import { handleSessionMessageHttp } from "./messages.js";
import type { WorkSessionHttpContext } from "./types.js";
import { handleSessionCreateHttp } from "./create.js";
import { handleSessionHandoffHttp } from "./handoff.js";
import { handleSessionAssociationHttp } from "./associations.js";
import { handleSessionContentHttp } from "./content.js";
import { handleWorkspaceHttp } from "./workspaces.js";

export async function handleWorkSessionHttp(context: WorkSessionHttpContext): Promise<boolean> {
  if (!/^\/api\/(?:sessions(?:\/|$)|session-messages(?:\/|$)|session-handoffs(?:\/|$)|workspaces(?:\/|$))/.test(context.pathname)) return false;
  return await handleSessionMessageHttp(context)
    || await handleWorkspaceHttp(context)
    || await handleSessionCreateHttp(context)
    || await handleSessionHandoffHttp(context)
    || await handleSessionAssociationHttp(context)
    || await handleSessionContentHttp(context);
}
