import {createHash,randomUUID} from 'node:crypto';
import {closeSync,constants,fstatSync,lstatSync,mkdirSync,openSync,readFileSync,readdirSync,realpathSync,renameSync,rmdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {syncError} from './sync-errors.js';

const MAX_PART_SIZE=4*1024*1024+4096;
const HEX=/^[a-f0-9]{64}$/u;
const PART=/^(?:[0-9]|1[0-9]|2[0-3])$/u;
const TEMP=/^\.[a-f0-9-]{36}$/u;
const missing=(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code==='ENOENT';

function safePath(home:string,segments:readonly string[],create:boolean){
  let path=realpathSync(home);
  for(const segment of segments){
    path=join(path,segment);
    if(create){
      try{mkdirSync(path,{mode:0o700});}catch(error){
        if(!(typeof error==='object'&&error!==null&&'code' in error&&error.code==='EEXIST'))throw error;
      }
    }
    const info=lstatSync(path,{throwIfNoEntry:false});
    if(!info)return null;
    if(!info.isDirectory()||info.isSymbolicLink()||realpathSync(path)!==path)throw syncError('scope','同步暂存目录无效');
  }
  return path;
}

export function blobFiles(home:string,namespace:string,authorize:()=>void){
  const namespaceKey=createHash('sha256').update(namespace).digest('hex');
  const prefix=['sync','staging','v1',namespaceKey];
  const root=(digest:string,create=false)=>{
    authorize();
    if(!HEX.test(digest))throw syncError('invalid','同步附件摘要无效');
    return safePath(home,[...prefix,digest],create);
  };
  const parts=(digest:string):number[]=>{
    const directory=root(digest);
    return directory?readdirSync(directory).filter(name=>PART.test(name)).map(Number).sort((a,b)=>a-b):[];
  };
  const read=(digest:string,part:number)=>{
    const directory=root(digest);
    if(!directory||!PART.test(String(part)))return null;
    let fd:number;
    try{fd=openSync(join(directory,String(part)),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);}
    catch(error){if(missing(error))return null;throw error;}
    try{
      const stat=fstatSync(fd);
      if(!stat.isFile()||stat.size<=64||stat.size>64+MAX_PART_SIZE)return null;
      const stored=readFileSync(fd);
      const checksum=stored.subarray(0,64).toString('ascii'),bytes=stored.subarray(64);
      authorize();
      return HEX.test(checksum)?{checksum,bytes}:null;
    }finally{closeSync(fd);}
  };
  const release=(digest:string,includeTemporary=false)=>{
    const directory=root(digest);
    if(!directory)return;
    const names=readdirSync(directory).filter(name=>PART.test(name)||(includeTemporary&&TEMP.test(name)));
    for(const name of names){
      authorize();
      try{unlinkSync(join(directory,name));}catch(error){if(!missing(error))throw error;}
    }
    try{rmdirSync(directory);}catch(error){
      // Leave a concurrent writer's temporary file and retry on a later pass.
      if(!missing(error)&&!(typeof error==='object'&&error!==null&&'code' in error&&error.code==='ENOTEMPTY'))throw error;
    }
  };
  return {
    parts,
    read,
    digests(){
      authorize();
      const directory=safePath(home,prefix,false);
      return directory?readdirSync(directory).filter(name=>HEX.test(name)).sort():[];
    },
    write(digest:string,part:number,checksum:string,bytes:Uint8Array){
      if(!PART.test(String(part))||!HEX.test(checksum)||bytes.length===0||bytes.length>MAX_PART_SIZE)throw syncError('invalid','同步暂存格式无效');
      const directory=root(digest,true)!;
      const temp=join(directory,'.'+randomUUID());
      const fd=openSync(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
      try{
        try{writeFileSync(fd,checksum,'ascii');writeFileSync(fd,bytes);}finally{closeSync(fd);}
        authorize();
        renameSync(temp,join(directory,String(part)));
      }finally{
        try{unlinkSync(temp);}catch(error){if(!missing(error))throw error;}
      }
    },
    release,
    reap(except:string,olderThan:number){
      const directory=safePath(home,prefix,false);
      if(!directory)return;
      const entries=readdirSync(directory,{withFileTypes:true});
      let checked=0;
      for(const entry of entries){
        if(entry.name===except||!entry.isDirectory()||!HEX.test(entry.name))continue;
        authorize();
        const candidate=join(directory,entry.name),info=lstatSync(candidate,{throwIfNoEntry:false});
        if(info?.isDirectory()&&info.mtimeMs<olderThan)release(entry.name,true);
        if(++checked===32)break;
      }
    },
  };
}
