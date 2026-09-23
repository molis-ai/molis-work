import type {PluginDefinition} from '@molis-ai/molis-work-contracts/platform/plugin';
import {builderManifest} from './manifest.js';
import {builderPrompts} from './roles.js';
import {builderUiContribution} from './ui.js';
import {BuilderWorkflow,type BuilderPorts} from './workflow.js';
import {builderRoutes} from './routes.js';
export function createBuilderPlugin(ports:BuilderPorts,onReady:(workflow:BuilderWorkflow)=>void):PluginDefinition{
 return {manifest:builderManifest,agent_prompts:builderPrompts,async start(context){context.requireGrant('storage:private');const workflow=new BuilderWorkflow(context,ports);onReady(workflow);return {kind:'app',views:[builderUiContribution],routes:builderRoutes(context,workflow)};}};
}
