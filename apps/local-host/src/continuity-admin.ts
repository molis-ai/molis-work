import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import type { ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { memberClientId } from "@molis-ai/molis-work-server";
import { isLoopbackHttpOrigin } from "@molis-ai/molis-work-contracts/platform/loopback";
import { hostContinuityActions } from "./continuity-gateway.js";
import { changeMcpClientCredential } from "./mcp-client-credentials.js";
import { registeredHostAction } from "./plugin-registry.js";

/** Local administrator operation. Delegates to the existing protected Host grant owner. Never a mobile endpoint. */
export async function configureMemberActions(input:{hostUrl:string;homeDirectory:string;controlTokenFile:string;memberId:string;projectId:string;role:"owner"|"editor"|"viewer"|"revoked";actions?:readonly ActionReference[]}) {
  const url=new URL(input.hostUrl);
  if(!isLoopbackHttpOrigin(url,{numeric:true}))throw Error("Host URL must be a numeric loopback HTTP origin");
  const token=(await readFile(input.controlTokenFile,"utf8")).trim();
  if(token.length<32 || token.length>512 || /[\r\n\0]/.test(token))throw Error("Invalid Host control token file");
  // This is an explicit local administrator operation, not a request by the forwarding client.
  const clientId=memberClientId(input.memberId);
  if(input.role!=="revoked")changeMcpClientCredential(input.homeDirectory,clientId,"connect");
  const endpoint=new URL("/api/settings/mcp/actions",url);
  const query=new URLSearchParams({client_id:clientId,project_id:input.projectId});
  const read=await fetch(new URL(`?${query}`,endpoint),{redirect:"error",signal:AbortSignal.timeout(30000),headers:{"x-molis-work-control-token":token}});
  if(!read.ok)throw new Error(`Host could not read current grants: ${read.status}`);
  const {grants}=await read.json() as {grants:ReadonlyArray<{capability_id:string;version:number;provider_id:string;generation:string}>};
  const results:{capability_id:string;enabled:boolean;status:string}[]=[];
  const actions = input.actions ?? hostContinuityActions();
  for(const action of actions){
    const enabled=input.role!=="revoked" && (input.role!=="viewer" || registeredHostAction(action.capability_id,action.version)?.operation!=="command");
    const previous=grants.find(row=>row.capability_id===action.capability_id && row.version===action.version && row.provider_id===action.provider_id);
    const expected=previous ? {expected_generation:previous.generation} : {expected_absent:true};
    const response=await fetch(endpoint,{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),headers:{origin:url.origin,"content-type":"application/json","x-molis-work-control-token":token,"x-molis-work-idempotency-key":randomUUID()},
      body:JSON.stringify({client_id:clientId,project_id:input.projectId,...action,enabled,expected})});
    const result=await response.json() as {code?:string};
    if(!response.ok && !(enabled===false && result.code==="mcp.grant_missing"))throw new Error(`Host rejected ${action.capability_id}: ${result.code ?? response.status}. ${results.length} preceding grants applied; rerun after resolving the Host error.`);
    results.push({capability_id:action.capability_id,enabled,status:response.ok?"saved":"already absent"});
  }
  return results;
}
