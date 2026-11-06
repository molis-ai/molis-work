import {readdirSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import type {PluginOwnerFilesDeclaration} from '@molis-ai/molis-work-contracts/platform/plugin';
import type {SyncDocumentStorage} from '@molis-ai/molis-work-contracts/platform/plugin-registration';
import {openPluginOwnerFiles} from './plugin-owner-files.js';
import {ownerFilePaths,ownerFileNode,ownerFileHasCode} from './plugin-owner-files-paths.js';

/** Reuse the owner-file boundary; a document binding never accepts an absolute destination. */
export function syncDocumentFiles(home:string,declaration:PluginOwnerFilesDeclaration,read:()=>void,write:()=>void):NonNullable<SyncDocumentStorage['files']>{
 const paths=ownerFilePaths(home,declaration),files=openPluginOwnerFiles(home,declaration);
 return Object.freeze({
  stat(relative:string){read();const {stat}=paths.inspect(relative);return stat?{kind:stat.isFile()?'file' as const:'directory' as const,size:stat.size,modifiedAt:stat.mtimeMs}:null;},
  read(relative:string){read();return files.read(relative);},
  list(relative:string){read();const target=paths.inspect(relative,'directory');if(!target.stat)return [];
   return readdirSync(target.path).sort().map(name=>{read();try{const stat=ownerFileNode(join(target.path,name));return {name,kind:stat?.isDirectory()?'directory' as const:stat?.isFile()?'file' as const:'unsafe' as const};}
    catch(error){if(ownerFileHasCode(error,'host.owner_file_unsafe'))return {name,kind:'unsafe' as const};throw error;}});},
  create(relative:string,bytes:Uint8Array){write();files.writeFile(relative,bytes,'create');},
  removeFile(relative:string){write();const target=paths.inspect(relative,'file');if(target.stat){write();unlinkSync(paths.inspect(relative,'file').path);}},
 });
}
