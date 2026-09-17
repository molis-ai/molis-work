import { ProjectRecoveryError } from '../project-migrations.js';
import { parseProjectRecoveryDetails } from '../project-recovery-details.js';
import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { MolisWorkLocalHost } from '../project-host.js';
import { molisWorkHostProjectReference } from '../project-host.js';
import type { ResolvedWebRequest } from '../web-types.js';
import { sendLocalWebJson, readLocalWebBody } from '../web-http.js';
import { MolisWorkCasebookIntegration } from './integration.js';
import { CasebookError, exact, type AuthorizationRequest, type ReadRequest, type ContextRequest } from './contract.js';
import {receiptRuntime} from './receipts-observer.js';
import type {ReceiptReadRequest,ConnectionDiagnostics} from './receipts-contract.js';
export interface CasebookHttpOptions {
  /** Optional browser destination. HTTPS or loopback HTTP, without credentials/query/hash. */
  casebookUrl?: string;
  /** Server-only, project-scoped service credentials. Never use the browser control token. */
  grants: readonly {token:string;project_ref:string}[];
  /** Owner-provisioned directory access for one trusted Casebook member. Does not grant collection. */
  catalogConnections?: readonly {token:string;actor_ref:string}[];
  /** Default off. Owner-selected existing catalog project IDs, recovered lazily after credential checks. */
  restoreProjects?: readonly string[];
  /** Verify a live user action via the trusted caller's authority system; absent means deny writes. */
  verifyUserAction?:(request:AuthorizationRequest)=>boolean|Promise<boolean>;
}
export async function handleCasebookHttp(request:IncomingMessage,response:ServerResponse,url:URL,
  options:CasebookHttpOptions|undefined,host:MolisWorkLocalHost,
  resolve:(pathname:string)=>Promise<ResolvedWebRequest>):Promise<boolean> {
  if(!url.pathname.startsWith('/casebook/v1/')) return false;
  const fail=(code:string,status=403)=>{sendLocalWebJson(response,status,{code});return true;};
  if(!options) return fail('capability_unavailable',404);
  const match=url.pathname.match(/^\/casebook\/v1\/([^/]+)\/(authorization|set-authorization|facts|goal-contexts|operation-receipts|diagnostics)$/);
  const discovery=url.pathname==='/casebook/v1/projects';
  if((!match&&!discovery) || request.method!=='POST' || url.search || request.headers.origin) return fail('invalid_request',400);
  const token=request.headers.authorization;
  const matches=(g:{token:string})=>typeof token==='string'&&g.token.length>=32&&Buffer.byteLength(`Bearer ${g.token}`)===Buffer.byteLength(token)&&timingSafeEqual(Buffer.from(`Bearer ${g.token}`),Buffer.from(token));
  const grants=options.grants.filter(matches);
  const connection=options.catalogConnections?.find(matches);
  if(!grants.length&&!connection)return fail('not_authorized');
  if(discovery){
    try{
      const body=await readLocalWebBody(request);if(Object.keys(body).length)return fail('invalid_request',400);
      if(connection){
        const catalog=await resolve('/');
        if(catalog.kind!=='catalog_index')return fail('source_unavailable',503);
        // Only catalog identity: never open a project runtime, read facts, or manufacture consent.
        const projects=catalog.projects.map(p=>({project_ref:p.project_id,project_name:p.display_name}));
        sendLocalWebJson(response,200,{contract_id:'goalboard.casebook.projects',schema_version:'1.0.0',projects});return true;
      }
      const projects:{project_ref:string;project_name:string}[]=[];
      const ids=[...new Set(grants.map(g=>g.project_ref))];if(ids.length>100)return fail('invalid_request',400);
      for(const id of ids){const resolved=await resolve(`/projects/${encodeURIComponent(id)}/`);
        if(resolved.kind==='board'&&resolved.options.project?.project_id===id)projects.push({project_ref:id,project_name:resolved.options.project.display_name});
      }
      sendLocalWebJson(response,200,{contract_id:'goalboard.casebook.projects',schema_version:'1.0.0',projects});return true;
    }catch{return fail('source_unavailable',503);}
  }
  let project:string;
  try{project=decodeURIComponent(match![1]!);}catch{return fail('invalid_request',400);}
  if(!connection&&!grants.some(g=>g.project_ref===project))return fail('not_authorized');
  try {
    const body=await readLocalWebBody(request);
    // A directory credential must never sign a project action for another member.
    // Verify before project resolution/recovery, then the integration rechecks the exact action.
    if(connection&&match![2]==='set-authorization'&&(body.actor_ref!==connection.actor_ref||
      body.project_ref!==project||!await options.verifyUserAction?.(body as unknown as AuthorizationRequest)))return fail('not_authorized');
    if(match![2]==='diagnostics'){
      exact(body,['project_ref']);if(body.project_ref!==project)return fail('not_authorized');
      const result:ConnectionDiagnostics={contract_id:'goalboard.casebook.connection-diagnostics',schema_version:'1.0.0',project_ref:project,observed_at:new Date().toISOString(),historical_record:false,project_state:host.status().projects.some(p=>p.project_id===project&&p.state==='ready')?'ready':'not_open',runtime:receiptRuntime(),available_methods:['authorization','set-authorization','facts','goal-contexts','operation-receipts','diagnostics'],missing:['prior_connection_failures','client_transport_before_http','mcp_context_resolve_and_bootstrap','project_storage_compatibility_not_probed']};
      sendLocalWebJson(response,200,result);return true;
    }
    const resolved=await resolve(`/projects/${encodeURIComponent(project)}/`);
    if(resolved.kind!=='board') return fail('not_authorized');
    const ref=molisWorkHostProjectReference({databasePath:resolved.options.databasePath,boardId:resolved.options.boardId,
      projectId:resolved.options.project?.project_id ?? resolved.options.boardId});
    if(ref.project_id!==project) return fail('not_authorized');
    // The existing owner may recover only explicitly configured projects; no initialization/migration.
    if(!host.status().projects.some(p=>p.project_id===ref.project_id && p.board_id===ref.board_id && p.storage_key===ref.storage_key && p.state==='ready')) {
      if (!connection&&!options.restoreProjects?.includes(project)) return fail('source_unavailable',503);
      await host.restoreExistingProject(ref);
    }
    const api=new MolisWorkCasebookIntegration({client:host.client(ref),verifyUserAction:options.verifyUserAction});
    const result=match![2]==='operation-receipts'?await api.readOperationReceipts(body as unknown as ReceiptReadRequest):match![2]==='goal-contexts'?await api.readGoalContexts(body as unknown as ContextRequest):match![2]==='facts'?await api.readInteractionFacts(body as unknown as ReadRequest):
      match![2]==='authorization'?await api.readInteractionAuthorization(body as never):await api.setInteractionAuthorization(body as unknown as AuthorizationRequest);
    sendLocalWebJson(response,200,result);return true;
  } catch(error) {
    if(error instanceof ProjectRecoveryError) {
      const details=error.code==='project_recovery_requires_migration'?parseProjectRecoveryDetails(error.details):undefined;
      sendLocalWebJson(response,503,{code:error.code,...(details?{details}:{})});return true;
    }
    return fail(error instanceof CasebookError?error.code:'source_unavailable',error instanceof CasebookError?400:503);
  }
}
