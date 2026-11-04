import { AgentBuilderWorkflow } from '@molis-ai/molis-work-plugin-builder';
import { publicationAuthority, publicationPorts, publicationStorage } from './studio-publishing.js';

const [home, root, statePath, buildId] = process.argv.slice(2);
if (!home || !root || !statePath || !buildId) throw new Error('Missing crash fixture arguments');
const workflow = new AgentBuilderWorkflow(publicationStorage(statePath), publicationPorts(home, root));
// PUB-3: the real publisher has renamed the complete directory when it reaches this store call.
// Exiting here simulates process loss; no catch/finally can clean up or invent a release fact.
workflow.store.release = () => { process.exit(91); };
await workflow.action(buildId, { action: 'publish', revision: workflow.store.require(buildId).revision }, publicationAuthority());
throw new Error('The publication did not reach the crash boundary');
