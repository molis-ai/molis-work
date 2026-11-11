import {writeFileSync} from 'node:fs';
import {buildSync,transformSync} from 'esbuild';
import {UI_REQUEST_CLIENT_SCRIPT} from '@molis-ai/molis-work-ui-host';
import {workbenchClientSource} from '../dist/page-assets.js';
import {ACCOUNT_CLIENT_SCRIPT} from '../dist/scripts/account.js';
import {poolClientLiterals} from './client-literals.mjs';

const compact=(script, pooling)=>transformSync(poolClientLiterals(script,pooling),{
  loader:'js',target:'es2022',charset:'utf8',minifyWhitespace:true,minifyIdentifiers:true,minifySyntax:true,legalComments:'none',
}).code;

const [frame]=buildSync({
  entryPoints:['src/browser/plugin-frame/entry.ts'],bundle:true,platform:'browser',format:'iife',minify:true,charset:'utf8',
  outfile:'dist/plugin-frame-client.js',write:false,
}).outputFiles;
writeFileSync(frame.path,compact(frame.text,{byBytes:true}));

// Keep the request bootstrap byte-for-byte first. Local bindings and equivalent syntax may be shortened;
// property names, public globals, event names and literal contents stay intact.
const source=workbenchClientSource();
if(!source.startsWith(UI_REQUEST_CLIENT_SCRIPT))throw new Error('Workbench request bootstrap must be first');
const body=compact(source.slice(UI_REQUEST_CLIENT_SCRIPT.length),{byBytes:true});
// Keep the account IIFE in the same asset, with its own short identifiers.
writeFileSync(new URL('../dist/workbench-client.js',import.meta.url),UI_REQUEST_CLIENT_SCRIPT+body+compact(ACCOUNT_CLIENT_SCRIPT,{byBytes:true}));
buildSync({entryPoints:['src/browser/language-entry.ts'],bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,charset:'utf8',outfile:'dist/language-client.js'});
