// Temporary, local-only inputs. This does not register or install product resources.
import {mkdir,writeFile} from 'node:fs/promises';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';
const out=process.env.FOLIO_FONT_DIR??'/private/tmp/folio16-fonts';await mkdir(out,{recursive:true});
const sources=[['rhr.7z','https://github.com/CyanoHao/Resource-Han-Rounded/releases/download/v1.910/RHR-CFF2-CN-1.910.7z'],['OFL-RHR.txt','https://raw.githubusercontent.com/CyanoHao/Resource-Han-Rounded/master/OFL-License.txt'],['nunito.tgz','https://registry.npmjs.org/@fontsource-variable/nunito/-/nunito-5.3.0.tgz']];
for(const[file,url]of sources){const response=await fetch(url);if(!response.ok)throw Error(`${url}: ${response.status}`);await writeFile(resolve(out,file),Buffer.from(await response.arrayBuffer()));}
execFileSync('tar',['-xf',resolve(out,'rhr.7z'),'-C',out]);execFileSync('tar',['-xzf',resolve(out,'nunito.tgz'),'-C',out]);await writeFile(resolve(out,'sources.json'),JSON.stringify({purpose:'Local Folio visual prototype only',sources},null,2));console.log(out);
