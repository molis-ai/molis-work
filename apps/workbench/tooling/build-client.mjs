import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {UI_REQUEST_CLIENT_SCRIPT} from '@molis-ai/molis-work-ui-host';
import {workbenchClientSource} from '../dist/page-assets.js';
import {ACCOUNT_CLIENT_SCRIPT} from '../dist/scripts/account.js';
const compactor=fileURLToPath(new URL('../../../scripts/client-literals.mjs',import.meta.url));
const compactClientScript=source=>execFileSync(process.execPath,[compactor],{
  input:source,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','inherit'],
});

const [frame]=buildSync({
  entryPoints:['src/browser/plugin-frame/entry.ts'],bundle:true,platform:'browser',format:'iife',minify:true,charset:'utf8',
  outfile:'dist/plugin-frame-client.js',write:false,
}).outputFiles;
writeFileSync(frame.path,compactClientScript(frame.text));
const kit=new URL('../dist/kit-client.js',import.meta.url);
writeFileSync(kit,compactClientScript(readFileSync(kit,'utf8')));

// Keep the request bootstrap byte-for-byte first. Local bindings and equivalent syntax may be shortened;
// property names, public globals, event names and literal contents stay intact.
const source=workbenchClientSource();
if(!source.startsWith(UI_REQUEST_CLIENT_SCRIPT))throw new Error('Workbench request bootstrap must be first');
const body=compactClientScript(source.slice(UI_REQUEST_CLIENT_SCRIPT.length));
// Keep the account IIFE in the same asset, with its own short identifiers.
writeFileSync(new URL('../dist/workbench-client.js',import.meta.url),UI_REQUEST_CLIENT_SCRIPT+body+compactClientScript(ACCOUNT_CLIENT_SCRIPT));
buildSync({entryPoints:['src/browser/language-entry.ts'],bundle:true,platform:'browser',format:'iife',target:'es2022',minify:true,charset:'utf8',outfile:'dist/language-client.js'});
