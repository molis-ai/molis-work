import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { CONTINUITY_ACTIONS, memberClientId } from "@molis-ai/molis-work-server";

/** Local administrator operation. Delegates to the existing protected Host grant owner. Never a mobile endpoint. */
export async function configureMemberActions(input:{hostUrl:string;controlTokenFile:string;memberId:string;projectId:string;role:"owner"|"editor"|"viewer"|"revoked"}) {
  const url=new URL(input.hostUrl);
  if(url.protocol!=="http:" || !["127.0.0.1","[::1]"].includes(url.hostname) || url.pathname!=="/" || url.username || url.password || url.search || url.hash)throw Error("Host URL must be a numeric loopback HTTP origin");
  const token=(await readFile(input.controlTokenFile,"utf8")).trim();
  if(token.length<32 || token.length>512 || /[\r\n\0]/.test(token))throw Error("Invalid Host control token file");
  const results:{capability_id:string;enabled:boolean;status:string}[]=[];
  for(const action of CONTINUITY_ACTIONS){
    const enabled=input.role!=="revoked" && (input.role!=="viewer" || action.capability_id!=="goals.progress.record");
    const response=await fetch(url.origin+"/api/settings/mcp/actions",{method:"POST",redirect:"error",signal:AbortSignal.timeout(30000),headers:{origin:url.origin,"content-type":"application/json","x-molis-work-control-token":token,"x-molis-work-idempotency-key":randomUUID()},
      body:JSON.stringify({client_id:memberClientId(input.memberId),project_id:input.projectId,...action,enabled})});
    const result=await response.json() as {code?:string};
    if(!response.ok && !(enabled===false && result.code==="mcp.grant_missing"))throw new Error(`Host rejected ${action.capability_id}: ${result.code ?? response.status}. ${results.length} preceding grants applied; rerun after resolving the Host error.`);
    results.push({capability_id:action.capability_id,enabled,status:response.ok?"saved":"already absent"});
  }
  return results;
}
