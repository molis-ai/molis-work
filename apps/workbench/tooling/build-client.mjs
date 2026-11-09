import {writeFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import {UI_REQUEST_CLIENT_SCRIPT} from '@molis-ai/molis-work-ui-host';
import {workbenchClientSource} from '../dist/page-assets.js';
import {ACCOUNT_CLIENT_SCRIPT} from '../dist/scripts/account.js';
import {poolClientLiterals} from './client-literals.mjs';

// Keep the request bootstrap byte-for-byte first. Local bindings and equivalent syntax may be shortened;
// property names, public globals, event names and literal contents stay intact.
const source=workbenchClientSource();
if(!source.startsWith(UI_REQUEST_CLIENT_SCRIPT))throw new Error('Workbench request bootstrap must be first');
const compact=(script, pooling)=>transformSync(poolClientLiterals(script,pooling),{
  loader:'js',target:'es2022',charset:'utf8',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:true,legalComments:'none',
}).code;
const body=compact(source.slice(UI_REQUEST_CLIENT_SCRIPT.length));
// Keep the account IIFE in the same asset, with its own short identifiers.
writeFileSync(new URL('../dist/workbench-client.js',import.meta.url),UI_REQUEST_CLIENT_SCRIPT+body+compact(ACCOUNT_CLIENT_SCRIPT,{byBytes:true}));
