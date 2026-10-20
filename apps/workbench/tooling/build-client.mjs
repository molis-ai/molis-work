import {writeFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {UI_REQUEST_CLIENT_SCRIPT} from '@molis-ai/molis-work-ui-host';
import {workbenchClientSource} from '../dist/page-assets.js';
import {poolClientLiterals} from './client-literals.mjs';

// Keep the request bootstrap byte-for-byte first. Local bindings and equivalent syntax may be shortened;
// property names, public globals, event names and literal contents stay intact.
const source=workbenchClientSource();
if(!source.startsWith(UI_REQUEST_CLIENT_SCRIPT))throw new Error('Workbench request bootstrap must be first');
const body=transformSync(poolClientLiterals(source.slice(UI_REQUEST_CLIENT_SCRIPT.length)),{
  loader:'js',target:'es2022',charset:'utf8',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:true,legalComments:'none',
}).code;
writeFileSync(new URL('../dist/workbench-client.js',import.meta.url),UI_REQUEST_CLIENT_SCRIPT+body);
