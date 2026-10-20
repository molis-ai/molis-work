import {constants,existsSync,lstatSync,mkdirSync,openSync,closeSync,readFileSync,writeFileSync,readdirSync,realpathSync,fstatSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {isAbsolute,join,relative,resolve,dirname,sep} from 'node:path';
import {defineErrorCodes} from '@molis-ai/molis-work-contracts/platform/actions';

export interface BuilderPortableFile {path:string;size:number;digest:string;bytes:string}
export interface BuilderPortableDirectory {slot:string;files:BuilderPortableFile[]}
const errors=defineErrorCodes('plugin_builder',{sync_files_invalid:'invalid',sync_files_missing:'unavailable'});
function invalid():never{throw errors.sync_files_invalid('创作文件内容或路径无效，原内容已保留');}
const missing=():never=>{throw errors.sync_files_missing('完整创作文件暂不可用，原内容已保留');};
export const builderBytesDigest=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const slotPattern=/^(?:(?:current|history-[0-9]+)(?:-settled)?|release-[1-9][0-9]*)$/;
const included=(name:string,release:boolean)=>release?['plugin.mjs','manifest.json','contract.json','interface.json','prompts.json'].includes(name)
 :/^(?:src|tests)\//.test(name)||['contract.json','manifest.json','package.json','package-lock.json','dependency-lock.json','tsconfig.json','developer/sdk.d.ts'].includes(name);
function pathParts(path:string):string[]{
 if(typeof path!=='string'||path.length>500||path.includes('\\')||path.includes('\0')||isAbsolute(path))return invalid();
 const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||/[\u0000-\u001f\u007f\\:*?"<>|]/.test(p)))return invalid();return parts;
}
function beneath(root:string,path:string):string{
 const name=relative(root,path);if(!name||isAbsolute(name)||name.startsWith('..'))return invalid();return name;
}
function safeChain(root:string,path:string){
 const rel=beneath(root,path);let current=root;if(lstatSync(root).isSymbolicLink())invalid();
 for(const part of rel.split(sep)){current=join(current,part);if(lstatSync(current).isSymbolicLink())invalid();}
}
function fileBytes(root:string,path:string):Buffer{
 safeChain(root,path);let fd:number|undefined;
 try{
  fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);const before=fstatSync(fd);
  if(!before.isFile()||before.size>8*1024*1024)invalid();
  const bytes=readFileSync(fd),after=fstatSync(fd);safeChain(root,path);
  const named=lstatSync(path);if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||named.ino!==after.ino||named.dev!==after.dev||bytes.length!==before.size)invalid();
  return bytes;
 }finally{if(fd!==undefined)closeSync(fd);}
}
/** Public SDK types are build inputs, not grants: the target's unchanged G1 must compare them to its own SDK. */
export function captureBuilderDirectory(root:string,path:string,slot:string,release=false):BuilderPortableDirectory{
 if(!slotPattern.test(slot))invalid();
 if(!existsSync(path))return missing();const local=beneath(resolve(root),resolve(path));if(lstatSync(root).isSymbolicLink())invalid();root=realpathSync(root);path=join(root,local);safeChain(root,path);
 const base=realpathSync(path);beneath(root,base);const files:BuilderPortableFile[]=[];
 const walk=(directory:string)=>{
  for(const entry of readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
   const full=join(directory,entry.name),name=relative(base,full).split('\\').join('/');
   if(entry.isSymbolicLink())invalid();
   if(entry.isDirectory()){if(!release&&(name==='src'||name==='tests'||name==='developer'||/^(?:src|tests)\//.test(name)))walk(full);continue;}
   if(!included(name,release))continue;if(!entry.isFile())invalid();pathParts(name);
   const bytes=fileBytes(root,full);files.push({path:name,size:bytes.length,digest:builderBytesDigest(bytes),bytes:bytes.toString('base64')});
   if(files.length>2000||files.reduce((n,f)=>n+f.size,0)>100000000)invalid();
  }
 };
 walk(base);
 if(release&&files.length!==5)missing();
 return {slot,files};
}
export function validateBuilderDirectories(input:unknown):BuilderPortableDirectory[]{
 if(!Array.isArray(input)||input.length>1000)invalid();let total=0;const slots=new Set<string>();
 return input.map(value=>{
  if(!value||typeof value!=='object'||Object.keys(value).sort().join(',')!=='files,slot'||!slotPattern.test(value.slot)||slots.has(value.slot)||!Array.isArray(value.files)||value.files.length>2000)invalid();slots.add(value.slot);
  const seen=new Set<string>();const files=value.files.map((file:unknown)=>{
   if(!file||typeof file!=='object'||Array.isArray(file))return invalid();const f=file as Record<string,unknown>;
   if(Object.keys(f).sort().join(',')!=='bytes,digest,path,size'||typeof f.path!=='string'||typeof f.bytes!=='string'||typeof f.digest!=='string'||!Number.isSafeInteger(f.size)||Number(f.size)<0||Number(f.size)>8*1024*1024)invalid();
   pathParts(String(f.path));if(!included(String(f.path),String(value.slot).startsWith('release-'))||seen.has(String(f.path)))invalid();seen.add(String(f.path));const bytes=Buffer.from(String(f.bytes),'base64');
   if(bytes.toString('base64')!==f.bytes||bytes.length!==f.size||builderBytesDigest(bytes)!==f.digest)invalid();total+=bytes.length;if(total>100000000)invalid();
   return {path:String(f.path),bytes:String(f.bytes),digest:String(f.digest),size:Number(f.size)};
  });if(String(value.slot).startsWith('release-')&&files.length!==5)invalid();return {slot:String(value.slot),files};
 });
}
function directory(root:string,path:string){
 const parts=beneath(root,path).split(sep);let current=root;
 for(const part of parts){current=join(current,part);if(!existsSync(current))mkdirSync(current,{mode:0o700});const stat=lstatSync(current);if(stat.isSymbolicLink()||!stat.isDirectory())invalid();}
}
/** Immutable staging precedes the owner's SQL commit. No source path or executable permission is inherited. */
export function stageBuilderDirectories(root:string,input:readonly BuilderPortableDirectory[],authorize:()=>void):Map<string,string>{
 authorize();const entries=validateBuilderDirectories(input),tag=builderBytesDigest(Buffer.from(JSON.stringify(entries)));
 if(!existsSync(root))mkdirSync(root,{recursive:true,mode:0o700});if(lstatSync(root).isSymbolicLink())invalid();root=realpathSync(root);
 const base=join(root,'sync',tag);directory(root,base);const locations=new Map<string,string>();
 for(const entry of entries){
  authorize();const path=join(base,entry.slot.replace(/-settled$/,'.settled'));directory(root,path);locations.set(entry.slot,path);
  for(const file of entry.files){authorize();const full=join(path,...pathParts(file.path));directory(root,dirname(full));
   const bytes=Buffer.from(file.bytes,'base64');if(existsSync(full)){if(!fileBytes(root,full).equals(bytes))invalid();}
   else writeFileSync(full,bytes,{flag:'wx',mode:0o400});authorize();
  }
 }
 authorize();return locations;
}

/** Explicit local editing forks portable inputs; it never mutates an immutable received directory. */
export function copyEditableBuilderDirectories(root:string,buildId:string,input:readonly BuilderPortableDirectory[],authorize:()=>void):string{
 if(!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(buildId))invalid();authorize();const entries=validateBuilderDirectories(input),path=join(root,'builds',buildId,'local-'+randomUUID());directory(root,path);
 const frozen=new Set(['contract.json','manifest.json','src/index.ts','developer/sdk.d.ts']);
 for(const entry of entries){if(!['current','current-settled'].includes(entry.slot))invalid();const destination=entry.slot==='current'?path:path+'.settled';directory(root,destination);
  for(const file of entry.files){authorize();const target=join(destination,...pathParts(file.path));directory(root,dirname(target));writeFileSync(target,Buffer.from(file.bytes,'base64'),{flag:'wx',mode:entry.slot==='current'&&frozen.has(file.path)?0o444:0o600});}
 }
 authorize();return path;
}
