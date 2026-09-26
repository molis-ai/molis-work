import { LocalActionGatewayClient } from "@molis-ai/molis-work-app-local-host";
import { memberClientId } from "@molis-ai/molis-work-server";
import { CONTINUITY_ACTIONS } from "@molis-ai/molis-work-server";
import type { ActionFactory } from "@molis-ai/molis-work-server";
/** No model runtime: dispatches only to the already-running local Action Host. */
export function gatewayFactory(options: {url:string;homeDirectory:string}): ActionFactory {
  return ({projectId,memberId,validate,signal}) => {
    const clientId = memberClientId(memberId);
    return {client:new LocalActionGatewayClient({...options,clientId,projectId}),caller:{actor_id:clientId,project_id:projectId,audience:"mcp",
      permissions:[],allowed_actions:CONTINUITY_ACTIONS,validate_authority:validate,signal}};
  };
}
