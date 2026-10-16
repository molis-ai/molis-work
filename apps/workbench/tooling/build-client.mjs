import {writeFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {UI_REQUEST_CLIENT_SCRIPT} from '@molis-ai/molis-work-ui-host';
import {workbenchClientSource} from '../dist/page-assets.js';

// Keep the request bootstrap byte-for-byte first. Local bindings may be shortened;
// property names, public globals, event names and literal contents stay intact.
const source=workbenchClientSource();
if(!source.startsWith(UI_REQUEST_CLIENT_SCRIPT))throw new Error('Workbench request bootstrap must be first');
const body=transformSync(source.slice(UI_REQUEST_CLIENT_SCRIPT.length),{
  loader:'js',target:'es2022',charset:'utf8',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:false,legalComments:'none',
}).code;
writeFileSync(new URL('../dist/workbench-client.js',import.meta.url),UI_REQUEST_CLIENT_SCRIPT+body);
