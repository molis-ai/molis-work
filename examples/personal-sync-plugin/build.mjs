import {readFileSync,writeFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
// The author only needs Node and the two public packages. No workspace/private imports or bundler.
writeFileSync(new URL('./plugin.js',import.meta.url),stripTypeScriptTypes(readFileSync(new URL('./plugin.ts',import.meta.url),'utf8'),{mode:'strip'}));
const {default:definition}=await import('./plugin.js');
writeFileSync(new URL('./manifest.json',import.meta.url),JSON.stringify(definition.manifest,null,2)+'\n');
