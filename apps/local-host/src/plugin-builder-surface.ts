import {createPrologueTypeSafeProvider} from './typesafe-prologue.js';
import {FUNCTIONS_DEFAULT_MODEL,type FunctionRecord} from '@molis-ai/molis-work-contracts/modules/functions';
import {typeSafeCredential,typeSafeConfiguration} from './typesafe-connection.js';
import {renderStudioStage,type AgentBuilderPorts} from '@molis-ai/molis-work-plugin-builder';
import type {CodingSurfacePorts} from './coding-surface.js';
import {L} from './web-locale.js';
/** The question the studio's designer asks Jev: pick one legal part for a function. */
type ChoiceQuestion=Parameters<NonNullable<AgentBuilderPorts['choose']>>[0];
/** The query a builder frame document is asked for with; without it the page is a direct visit and opens the workbench. */
export const FRAME_QUERY='frame=workbench';
export function selectionPorts(homeDirectory?:string){
 const key=()=>process.env.TYPESAFE_API_KEY?.trim()||(homeDirectory?typeSafeCredential(homeDirectory,'functions'):null);
 return {selectionAvailable:()=>Boolean(key()),async choose(question:ChoiceQuestion){
  const credential=key();if(!credential)throw new Error('请在 Functions 设置中配置 TypeSafe Key');
  const provider=createPrologueTypeSafeProvider(homeDirectory,{resolveCredential:key,configuration:()=>process.env.TYPESAFE_API_KEY?.trim()?'env':homeDirectory?typeSafeConfiguration(homeDirectory,'functions'):null});const started=performance.now(),now=new Date().toISOString();
  // A transient choice question: never listed, published or stored as a user function.
  const record:FunctionRecord={id:question.key,name:'插件创作零件选择',status:'draft',version:null,instructions:question.instructions,scene_id:null,subject_kinds:[],scene_map:{},config_hash:'',last_preview:null,samples:[],published_at:null,created_at:now,updated_at:now,function_key:question.key,primitive:'choice',model:FUNCTIONS_DEFAULT_MODEL,criteria:question.candidates.map(c=>({key:c.key,description:c.description}))};
  const result=await provider.evaluate(credential,record,question.state);
  return {choice:result.choice,model:result.model,elapsedMs:Math.round(performance.now()-started),confidence:result.confidence};
 }};
}

/**
 * The workbench entry is the agent-built plugin studio, drawn in the plugin's own stage (specs/artifact-positioning S4):
 * no frame and no page of its own. Its client comes with the plugin's workbench pack and starts when the stage is opened;
 * only the generated plugin's trial and an installed plugin still run in sandboxed frames. The studio is Chinese only
 * except for the sentences that go through `L`, which today is the note about what the build check sends to npm (its English is in the workbench's gap-en.ts).
 */
export async function builderWorkbenchPanel(_ports:CodingSurfacePorts):Promise<string>{
 return renderStudioStage(L);
}
