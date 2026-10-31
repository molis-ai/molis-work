#!/usr/bin/env node
// T-370 W6-04-v2: frozen Git-object measurement, no checkout or product imports.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { commitSnapshot } from './vendor/snapshot.mjs';
import { parseImports } from './vendor/parse.mjs';
import { createGraph, isTestFile } from './vendor/graph.mjs';
import { purityOf } from './vendor/contracts-purity.mjs';

const args=Object.fromEntries(process.argv.slice(2).reduce((a,x,i,v)=>{if(x.startsWith('--'))a.push([x.slice(2),v[i+1]]);return a},[]));
for(const k of ['repo','inputs','out']) if(!args[k]) throw Error(`missing --${k}`);
const input=JSON.parse(fs.readFileSync(args.inputs,'utf8'));
if(ts.version!==input.typescript) throw Error(`TypeScript ${ts.version} != ${input.typescript}`);
if(process.version!==input.node) throw Error(`Node ${process.version} != ${input.node}`);
const repo=args.repo, out=args.out;
fs.mkdirSync(out,{recursive:true});
const git=(...argv)=>execFileSync('git',argv,{cwd:repo,encoding:'utf8',maxBuffer:1<<29});
const gitB=(...argv)=>execFileSync('git',argv,{cwd:repo,maxBuffer:1<<29});
const get=(ref,file)=>{try{return execFileSync('git',['show',`${ref}:${file}`],{cwd:repo,encoding:'utf8',maxBuffer:1<<29,stdio:['ignore','pipe','ignore']})}catch{return null}};
const save=(file,obj)=>fs.writeFileSync(path.join(out,file),JSON.stringify(obj,null,2)+'\n');
const src=f=>/^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(f)&&/\.(ts|mts)$/.test(f)&&!f.endsWith('.d.ts')&&!/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(f)&&!/\.test\.(ts|mts)$/.test(f);
const extra=f=>/^(apps|horizontal|modules|packages|plugins|server|tooling)\//.test(f)&&/\.(tsx|js|jsx|mjs|cjs)$/.test(f)&&!/(^|\/)(tests?|dist|node_modules|fixtures)\//.test(f)&&!/\.test\.(tsx|js|jsx|mjs|cjs)$/.test(f);
const globRe=g=>new RegExp('^'+g.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*\*\/?/g,'\0').replace(/\*/g,'[^/]*').replace(/\0/g,'(?:.*/)?')+'$');
const treeCache=new Map();
function catBatch(ref,files){
 if(!files.length)return new Map();
 const data=execFileSync('git',['cat-file','--batch'],{cwd:repo,input:Buffer.from(files.map(f=>`${ref}:${f}\n`).join('')),maxBuffer:1<<29});
 const m=new Map();let at=0;
 for(const f of files){let e=data.indexOf(10,at);let h=data.toString('utf8',at,e).split(' ');at=e+1;if(h[1]==='missing')continue;let n=Number(h[2]);m.set(f,data.toString('utf8',at,at+n));at+=n+1}
 return m;
}
function tree(ref){
 if(treeCache.has(ref))return treeCache.get(ref);
 const files=git('ls-tree','-r','-z','--name-only',ref).split('\0').filter(Boolean);
 const manifestFiles=files.filter(f=>f.endsWith('/package.json'));
 const reads=catBatch(ref,['pnpm-workspace.yaml',...manifestFiles].filter(f=>files.includes(f)));
 const work=reads.get('pnpm-workspace.yaml')??'';
 const globs=[];let inside=false;
 for(const line of work.split('\n')){if(/^packages:\s*$/.test(line)){inside=true;continue}if(inside&&/^[^\s#-]/.test(line))break;const m=inside&&/^\s+-\s+['"]?([^'"#\s]+)['"]?/.exec(line);if(m)globs.push(m[1])}
 if(!globs.length)throw Error(`no workspace globs at ${ref}`);
 let dirs=new Set();
 for(const g of globs){const neg=g.startsWith('!'),re=globRe(neg?g.slice(1):g);for(const f of manifestFiles){const d=path.posix.dirname(f);if(re.test(d)){if(neg)dirs.delete(d);else dirs.add(d)}}}
 const packages=[];const names=new Set();
 for(const d of [...dirs].sort()){const f=d+'/package.json';let j;try{j=JSON.parse(reads.get(f))}catch{throw Error(`invalid ${ref}:${f}`)}if(typeof j.name!=='string'||names.has(j.name))throw Error(`missing/duplicate name ${ref}:${f}`);names.add(j.name);packages.push({dir:d,name:j.name,exports:j.exports??null})}
 packages.sort((a,b)=>b.dir.length-a.dir.length);
 const owner=f=>packages.find(p=>f===p.dir||f.startsWith(p.dir+'/'))??null;
 const obj={ref,files,known:new Set(files),packages,owner};treeCache.set(ref,obj);return obj;
}
const category=p=>!p?'nonworkspace':p.dir==='server'?'module':p.dir.startsWith('apps/')?'app':p.dir.startsWith('packages/')?'foundation':p.dir.startsWith('horizontal/')?'horizontal':p.dir.startsWith('modules/')?'module':p.dir.startsWith('plugins/native/')?'native-plugin':p.dir.startsWith('plugins/official-integrations/')?'integration-plugin':p.dir.startsWith('tooling/')?'tooling':'unclassified';
const nonOwner=f=>!f.includes('/')?'root':['tests','docs','specs','scripts','skills','vendor'].includes(f.split('/')[0])?f.split('/')[0]:'other';
const lineOf=(s,pos)=>s.getLineAndCharacterOfPosition(pos).line+1;
function unitMetrics(snap,ref){
 const exceptionsText=get(ref,'tooling/gates/giant-exceptions.json');let exceptions={};if(exceptionsText){try{exceptions=JSON.parse(exceptionsText).exceptions??{}}catch{}}
 const files=[],classes=[],functions=[],aux=[],diagnostics=[];
 for(const f of snap.files.filter(src)){
  const text=snap.read(f);if(text===null){diagnostics.push({path:f,reason:'missing snapshot text'});continue}
  const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true);
  for(const d of sf.parseDiagnostics)diagnostics.push({path:f,start:d.start,message:ts.flattenDiagnosticMessageText(d.messageText,' ') });
  const lines=text.split('\n').length;files.push({path:f,lines,blob:git('rev-parse',`${ref}:${f}`).trim(),over800:lines>800,over1000:lines>1000});
  const named=new Map(),groups=new Map(),callbacks={};
  const isFn=n=>ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n);
  const namedScope=n=>ts.isClassDeclaration(n)||ts.isClassExpression(n)||isFn(n)||ts.isVariableDeclaration(n)||ts.isPropertyAssignment(n)||ts.isPropertyDeclaration(n)||ts.isModuleDeclaration(n);
  const collect=n=>{
   if(isFn(n)){
    const sourceName=n.name&&ts.isIdentifier(n.name)?n:(n.parent&&(ts.isVariableDeclaration(n.parent)||ts.isPropertyAssignment(n.parent))&&ts.isIdentifier(n.parent.name)?n.parent:null);
    if(sourceName){const owner=[sourceName.name.text];for(let outer=sourceName.parent;outer;outer=outer.parent)if(namedScope(outer)&&outer.name&&ts.isIdentifier(outer.name))owner.unshift(outer.name.text);const list=groups.get(sourceName.name.text)??[];list.push({node:n,owner:owner.join('.')});groups.set(sourceName.name.text,list);named.set(n,sourceName.name.text)}
   }ts.forEachChild(n,collect)
  };collect(sf);
  for(const [name,list] of groups)if(list.filter(x=>x.node.body).length>=2)for(const x of list)named.set(x.node,x.owner);
  const functionKey=n=>{if(named.has(n))return `function ${f}#${named.get(n)}`;let outer=n.parent;while(outer&&!((ts.isFunctionDeclaration(outer)||ts.isMethodDeclaration(outer)||ts.isVariableDeclaration(outer))&&outer.name&&ts.isIdentifier(outer.name)))outer=outer.parent;const base=outer?outer.name.text:'(module)';callbacks[base]=(callbacks[base]??0)+1;return `function ${f}#${base} callback ${callbacks[base]}`};
  const visit=(n)=>{
   const span=lineOf(sf,n.getEnd())-lineOf(sf,n.getStart(sf))+1;
   const base={path:f,kind:ts.SyntaxKind[n.kind],start:n.getStart(sf),end:n.getEnd(),line:lineOf(sf,n.getStart(sf)),endLine:lineOf(sf,n.getEnd()),lines:span,name:n.name?.getText(sf)??null};
   if(ts.isClassDeclaration(n)||ts.isClassExpression(n)){
    const members=n.members.filter(m=>ts.isMethodDeclaration(m)||ts.isGetAccessor(m)||ts.isSetAccessor(m));
    classes.push({...base,gateKey:`class ${f}#${n.name?.text??'(anonymous)'}`,methods:members.length,methodsWithBody:members.filter(x=>x.body).length,constructors:n.members.filter(ts.isConstructorDeclaration).length,functionProperties:n.members.filter(m=>ts.isPropertyDeclaration(m)&&m.initializer&&(ts.isArrowFunction(m.initializer)||ts.isFunctionExpression(m.initializer))).length,over300:span>300,over25:members.length>25});
   }
   if((ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n))&&n.body)functions.push({...base,gateKey:span>150?functionKey(n):null,over150:span>150,over300:span>300});
   if((ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n))&&n.body)aux.push({...base,over150:span>150});
   ts.forEachChild(n,visit);
  };visit(sf);
 }
 const gateKey=x=>x.gateKey;
 const oversized=[...files.filter(x=>x.over800).map(x=>({key:`file ${x.path}`,size:x.lines,...x})),...classes.filter(x=>x.over300||x.over25).map(x=>({key:gateKey(x),size:{lines:x.lines,methods:x.methods},...x})),...functions.filter(x=>x.over150).map(x=>({key:gateKey(x),size:x.lines,...x}))];
 const keyCount=new Map();for(const x of oversized)keyCount.set(x.key,(keyCount.get(x.key)??0)+1);
 const registration=oversized.map(x=>{const e=exceptions[x.key];return {key:x.key,path:x.path,status:keyCount.get(x.key)>1?'ambiguous-key':!e?'unregistered':JSON.stringify(e.size)!==JSON.stringify(x.size)?'size-mismatch':!e.kind||typeof e.reason!=='string'||e.reason.length<20?'invalid-entry':'registered',entry:e??null}});
 const used=new Set(registration.map(x=>x.key));for(const key of Object.keys(exceptions))if(!used.has(key))registration.push({key,status:'orphan-entry',entry:exceptions[key]});
 return {files,classes,functions,aux,registration,parseDiagnostics:diagnostics,summary:{files:files.length,fileOver800:files.filter(x=>x.over800).length,fileOver1000:files.filter(x=>x.over1000).length,classes:classes.length,classOver300:classes.filter(x=>x.over300).length,classOver25:classes.filter(x=>x.over25).length,classUnion:classes.filter(x=>x.over300||x.over25).length,functions:functions.length,functionOver150:functions.filter(x=>x.over150).length,functionOver300:functions.filter(x=>x.over300).length,auxOver150:aux.filter(x=>x.over150).length,registration:Object.fromEntries([...new Set(registration.map(x=>x.status))].map(k=>[k,registration.filter(x=>x.status===k).length]))}};
}
function sample(ref){
 const records=git('log','--first-parent','--format=%H%x00%P%x00%cn <%ce>%x00%s%x00%cI',ref).trimEnd().split('\n').filter(Boolean).map(line=>line.split('\0'));
 const selected=[],excluded=[],seen=new Map();let visited=0;
 for(const [sha,parents,committer,subject,time] of records){
  if(selected.length>=70)break;if(!sha)continue;visited++;
  const ps=parents.trim().split(/\s+/).filter(Boolean);
  const gh=/GitHub/i.test(committer)&&/noreply@github\.com/i.test(committer);
  let m=null,format=null;
  if(gh&&ps.length===2){m=/^Merge pull request #(\d+) from (\S.+)$/.exec(subject);format='merge'}
  else if(gh&&ps.length===1){m=/ \(#(\d+)\)$/.exec(subject);format='squash'}
  if(!m){excluded.push({sha,parents:ps,subject,reason:ps.length===0?'root':!gh?'non-github-committer':ps.length>2?'octopus':'unrecognized-subject'});continue}
  const pr=Number(m[1]);if(seen.has(pr)){excluded.push({sha,pr,reason:'duplicate',kept:seen.get(pr)});continue}
  seen.set(pr,sha);selected.push({pr,sha,parent:ps[0],parents:ps,format,subject,committer,time});
 }
 return {selected,excluded,visited,complete:selected.length===70,reason:selected.length===70?null:'first-parent-history-exhausted'};
}
function diffs(parent,sha){const b=gitB('diff-tree','-r','--no-commit-id','--name-status','-z','-M50%','--no-ext-diff','--no-textconv',parent,sha);const p=b.toString('utf8').split('\0');const rows=[];for(let i=0;i<p.length-1;){const status=p[i++];if(!status)continue;const old=status.startsWith('R')?p[i++]:null;const next=p[i++];rows.push({status,oldPath:old,newPath:status[0]==='D'?null:next,path:status[0]==='D'?next:next})}return rows}
function statistics(v){if(!v.length)return {n:0,median:null,p90:null,max:null};const a=[...v].sort((x,y)=>x-y),n=a.length;return {n,median:n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2,p90:a[Math.ceil(.9*n)-1],max:a[n-1]}}
const fixed=['apps/workbench/src/i18n/en.ts','apps/workbench/src/scripts/client/initialization.ts','apps/workbench/src/scripts/client/assistant-island.ts','apps/workbench/src/immersive-shell.ts','apps/workbench/src/builtin-plugins.ts','apps/local-host/src/web-request.ts','apps/local-host/src/web-catalog.ts','apps/local-host/src/project-host.ts','apps/local-host/src/project-plugins.ts','packages/contracts/src/platform/actions.ts','packages/contracts/src/platform/plugin.ts','packages/design-system/src/styles/craft-finish.ts','scripts/workspace-packages.mjs'];
const countBy=(rows,key)=>Object.fromEntries([...new Set(rows.map(x=>x[key]))].sort().map(k=>[k,rows.filter(x=>x[key]===k).length]));
function packageAndPR(ref){
 const t=tree(ref),sampled=sample(ref),prFiles=[],prs=[],touch=new Map(),giantTouched=new Set();
 for(const rec of sampled.selected){
  const before=tree(rec.parent),after=tree(rec.sha),events=diffs(rec.parent,rec.sha),dirs=new Set(),nonworkspace={};
  const oldSource=[...new Set(events.map(e=>e.oldPath??(e.status[0]==='A'?null:e.path)).filter(p=>p&&src(p)&&before.known.has(p)))];
  const newSource=[...new Set(events.map(e=>e.newPath).filter(p=>p&&src(p)&&after.known.has(p)))];
  const oldTexts=catBatch(rec.parent,oldSource),newTexts=catBatch(rec.sha,newSource);
  for(const [p,text] of [...oldTexts,...newTexts])if(text.split('\n').length>800)giantTouched.add(p);
  const mapped=events.map(e=>{
   const old=e.oldPath??(e.status[0]==='A'?null:e.path),next=e.newPath;
   const a=old?before.owner(old):null,b=next?after.owner(next):null;
   if(a)dirs.add(a.dir);if(b)dirs.add(b.dir);
   if(!a&&old)nonworkspace[nonOwner(old)]=(nonworkspace[nonOwner(old)]??0)+1;
   if(!b&&next&&(!old||next!==old))nonworkspace[nonOwner(next)]=(nonworkspace[nonOwner(next)]??0)+1;
   const paths=[...new Set([old,next].filter(Boolean))];
   for(const p of paths)if(src(p)||fixed.includes(p)){
    if(!touch.has(p))touch.set(p,new Set());touch.get(p).add(rec.pr);
   }
   return {...e,oldPath:old,oldOwner:a?{dir:a.dir,name:a.name}:null,newOwner:b?{dir:b.dir,name:b.name}:null,oldNonworkspace:old&&!a?nonOwner(old):null,newNonworkspace:next&&!b?nonOwner(next):null};
  });
  prFiles.push({pr:rec.pr,sha:rec.sha,parent:rec.parent,files:mapped,packages:[...dirs].sort(),nonworkspace});
  prs.push({...rec,fileCount:events.length,packageCount:dirs.size,packageDirs:[...dirs].sort(),nonworkspace});
 }
 const publicDirect=new Set();for(const pkg of t.packages.filter(x=>['packages/contracts','packages/plugin-sdk'].includes(x.dir)))for(const value of Object.values(typeof pkg.exports==='string'?{'.':pkg.exports}:pkg.exports??{})){const raw=typeof value==='string'?value:value?.import??value?.default??value?.types;if(typeof raw==='string')publicDirect.add(path.posix.normalize(path.posix.join(pkg.dir,raw)).replace('/dist/','/src/').replace(/\.m?js$/,'.ts'))}
 const touched=[...touch].map(([p,prs])=>{const tags=[];if(giantTouched.has(p))tags.push('giant-file');if(publicDirect.has(p))tags.push('public-contract-direct');else if(p.startsWith('packages/contracts/src/')||p.startsWith('packages/plugin-sdk/src/'))tags.push('public-contract-unknown');if(fixed.includes(p)&&!['apps/workbench/src/builtin-plugins.ts','scripts/workspace-packages.mjs'].includes(p))tags.push('shell-aggregation');if(['apps/workbench/src/builtin-plugins.ts','scripts/workspace-packages.mjs'].includes(p))tags.push('registry');if(!tags.length)tags.push('other');return {path:p,count:prs.size,prs:[...prs].sort((a,b)=>a-b),fixed:fixed.includes(p),tags}}).sort((a,b)=>b.count-a.count||a.path.localeCompare(b.path));
 const fixedRows=fixed.map(p=>({path:p,present:t.known.has(p),count:touch.get(p)?.size??0,prs:[...(touch.get(p)??[])].sort((a,b)=>a-b)}));
 const any=new Set(fixedRows.flatMap(x=>x.prs));
 return {tree:t,sampled,prFiles,prs,hotspots:{all:touched,top20:touched.slice(0,20),fixed:fixedRows,anyFixedPRs:[...any].sort((a,b)=>a-b),anyFixedCount:any.size,denominator:prs.length,anyFixedShare:prs.length?any.size/prs.length:null},summary:{n:prs.length,files:statistics(prs.map(x=>x.fileCount)),packages:statistics(prs.map(x=>x.packageCount)),earliest:prs.at(-1)?.time??null,latest:prs[0]?.time??null,visited:sampled.visited,excluded:sampled.excluded.length}};
}
function boundaryMetrics(snap,t,ref){
 const g=createGraph(snap),internal=[],cross=[],external=[],unresolved=[],nonliteral=[];
 const classify=(f,im)=>{
  const spec=im.spec;
  if(spec.startsWith('.')){
   const p=path.posix.normalize(path.posix.join(path.posix.dirname(f),spec));
   const pkg=t.owner(p);const base=p.replace(/\.m?js$/,'');const twin=p.replace('/dist/','/src/').replace(/\.m?js$/,'');const exists=[p,base+'.ts',base+'.mts',p+'.ts',p+'/index.ts',twin+'.ts',twin+'.mts'].some(x=>t.known.has(x));return {pkg,path:p,kind:'relative',public:false,exists};
  }
  const pkg=t.packages.find(x=>spec===x.name||spec.startsWith(x.name+'/'));
  if(!pkg)return {pkg:null,path:null,kind:'external',public:null,exists:false};
  const sub=spec===pkg.name?'.':'./'+spec.slice(pkg.name.length+1);
  const pub=typeof pkg.exports==='string'?sub==='.'&&Boolean(pkg.exports):pkg.exports&&Object.hasOwn(pkg.exports,sub);
  return {pkg,path:pkg.dir+'/'+sub.slice(2),kind:'package',public:pub,exists:pub};
 };
 const add=(f,im,area)=>{
  const r=classify(f,im);const owner=t.owner(f);
  const common={path:f,line:im.line,start:im.start,spec:im.spec,form:im.form,typeOnly:im.typeOnly,names:im.names??null,target:r.path,targetOwner:r.pkg?.dir??null,targetName:r.pkg?.name??null,targetKind:r.kind,public:r.public,resolved:r.exists};
  if(r.kind==='external')external.push({...common,sourceArea:area});
  if(area==='tests'){
   const internalRelative=r.kind==='relative'&&/\/(?:src|dist)(?:\/|$)/.test(r.path??'')&&r.pkg;
   const internalPackage=r.kind==='package'&&r.pkg&&!r.public;
   if(internalRelative||internalPackage){internal.push({...common,mode:(r.path??'').includes('/dist/')?'dist':'src',internalKind:internalRelative?'relative':'package-deep'});if(!r.exists&&internalRelative)unresolved.push({...common,reason:'missing-internal-target'});}
   else if(r.kind==='relative'&&/\/(?:src|dist)(?:\/|$)/.test(r.path??'')&&!r.pkg)unresolved.push({...common,reason:'unowned-internal'});
  }else if(owner&&r.pkg){
   const from=category(owner),to=category(r.pkg);
   const fromPlugin=from.endsWith('plugin'),toPlugin=to.endsWith('plugin');
   const upward=from==='foundation'&&(['app','module','horizontal'].includes(to)||toPlugin)||from==='horizontal'&&(['app','module'].includes(to)||toPlugin)||from==='module'&&(['app','horizontal'].includes(to)||toPlugin)||fromPlugin&&['app','horizontal','module'].includes(to);
   const pluginPeer=fromPlugin&&toPlugin&&owner.dir!==r.pkg.dir;
   const core=owner.dir==='packages/contracts'&&owner.dir!==r.pkg.dir?'contracts-out':owner.dir==='packages/plugin-sdk'&&r.pkg.dir!==owner.dir&&r.pkg.dir!=='packages/contracts'?'sdk-out':null;
   const same=(from==='app'&&to==='app'||from==='module'&&to==='module')&&owner.dir!==r.pkg.dir;
   cross.push({...common,sourceOwner:owner.dir,sourceLayer:from,targetLayer:to,upward,pluginPeer,core,sameLayer:same,deep:r.kind==='relative'||r.public===false,sourceSet:src(f)?'main':'extra'});
  }else if(owner&&r.kind==='relative'&&!r.exists)unresolved.push({...common,reason:'unresolved-relative'});
 };
 for(const f of snap.files.filter(isTestFile)){
  const text=snap.read(f);if(text===null)continue;
  for(const im of parseImports(f,text,{deep:true,detail:true}))add(f,im,'tests');
  const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true);const walk=n=>{if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&(!n.arguments[0]||!ts.isStringLiteralLike(n.arguments[0])))nonliteral.push({path:f,line:lineOf(sf,n.getStart(sf)),kind:ts.SyntaxKind[n.kind]});ts.forEachChild(n,walk)};walk(sf);
 }
 for(const f of snap.files.filter(x=>src(x)||extra(x))){
  const text=snap.read(f);if(text===null){unresolved.push({path:f,reason:'missing-source-text'});continue}
  for(const im of parseImports(f,text,{deep:true,detail:true}))add(f,im,'source');
  const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true);
  const walk=n=>{if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||ts.isIdentifier(n.expression)&&n.expression.text==='require')&&(!n.arguments[0]||!ts.isStringLiteralLike(n.arguments[0])))nonliteral.push({path:f,line:lineOf(sf,n.getStart(sf)),kind:ts.SyntaxKind[n.kind]});ts.forEachChild(n,walk)};walk(sf);
 }
 const process=g.analyze();const splits=process.filter(x=>x.splits.length).map(x=>({file:x.file,kind:x.kind,splits:x.splits,chains:g.chains(x.file)}));
 const edgeKey=x=>`${x.sourceOwner}\0${x.targetOwner}`;
 return {internal,internalSummary:{occurrences:internal.length,files:new Set(internal.map(x=>x.path)).size,byMode:countBy(internal,'mode'),byTarget:countBy(internal,'targetOwner'),byType:countBy(internal,'typeOnly')},runtime:{processes:process.length,splits,splitProcesses:splits.length},cross,crossSummary:{occurrences:cross.length,ownerEdges:new Set(cross.map(edgeKey)).size,bySourceSet:countBy(cross,'sourceSet'),upward:cross.filter(x=>x.upward).length,pluginPeers:cross.filter(x=>x.pluginPeer).length,core:cross.filter(x=>x.core).length,sameLayer:cross.filter(x=>x.sameLayer).length},external,unresolved,nonliteral};
}
function exportMetrics(snap,t){
 const file='apps/local-host/src/index.ts',text=snap.read(file);
 if(text===null)return {status:'N/A',reason:'entry absent'};
 const sf=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 const decls=sf.statements.filter(ts.isExportDeclaration),valueNames=[],typeNames=[];
 let star=0,typeStar=0,namespaceStar=0;
 for(const n of decls){
  if(!n.exportClause){if(n.isTypeOnly)typeStar++;else star++}
  else if(ts.isNamespaceExport(n.exportClause))namespaceStar++;
  else if(ts.isNamedExports(n.exportClause))for(const x of n.exportClause.elements)(n.isTypeOnly||x.isTypeOnly?typeNames:valueNames).push(x.name.text);
 }
 return {path:file,physicalLines:text.split('\n').length,topLevelExportDeclarations:decls.length,exportStar:star,exportTypeStar:typeStar,namespaceStar,explicitValueNames:valueNames,explicitTypeNames:typeNames,resolvedUnique:'NOT RUN',resolvedReason:'Git virtual TypeChecker module resolution not implemented in one-shot script; declaration counts remain exact, symbol counts unknown'};
}
function contractMetrics(snap,t){
 const files=snap.files.filter(f=>src(f)&&f.startsWith('packages/contracts/src/'));
 const nodes=[],purity=[];let fn=0,cl=0,ns=0,en=0,call=0,top=0;
 for(const f of files){const text=snap.read(f);if(text===null)continue;const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true);purity.push({path:f,...purityOf(f,text)});
  const walk=n=>{
   if((ts.isFunctionDeclaration(n)||ts.isFunctionExpression(n)||ts.isArrowFunction(n)||ts.isMethodDeclaration(n)||ts.isConstructorDeclaration(n)||ts.isGetAccessor(n)||ts.isSetAccessor(n))&&n.body){fn++;nodes.push({path:f,kind:'function',line:lineOf(sf,n.getStart(sf)),name:n.name?.getText(sf)??null})}
   if(ts.isClassDeclaration(n)||ts.isClassExpression(n)){cl++;nodes.push({path:f,kind:'class',line:lineOf(sf,n.getStart(sf))})}
   if(ts.isModuleDeclaration(n)&&!(n.flags&ts.NodeFlags.Ambient)){ns++;nodes.push({path:f,kind:'namespace',line:lineOf(sf,n.getStart(sf))})}
   if(ts.isEnumDeclaration(n)&&!(n.modifiers??[]).some(x=>x.kind===ts.SyntaxKind.ConstKeyword)){en++;nodes.push({path:f,kind:'enum',line:lineOf(sf,n.getStart(sf))})}
   if(ts.isVariableDeclaration(n)&&n.initializer&&(ts.isCallExpression(n.initializer)||ts.isNewExpression(n.initializer))){call++;nodes.push({path:f,kind:'call-initializer',line:lineOf(sf,n.getStart(sf))})}
   ts.forEachChild(n,walk)
  };walk(sf);
  for(const n of sf.statements)if(ts.isExpressionStatement(n)||ts.isIfStatement(n)||ts.isForStatement(n)||ts.isWhileStatement(n)||ts.isTryStatement(n)||ts.isThrowStatement(n)){top++;nodes.push({path:f,kind:'top-level-executable',line:lineOf(sf,n.getStart(sf))})}
 }
 return {files:files.length,nodes,purity,summary:{functionsWithBody:fn,classes:cl,namespaces:ns,enums:en,callNewInitializers:call,topLevelExecutable:top},runtimeExports:'NOT RUN',runtimeExportsReason:'Git virtual TypeChecker module resolution not implemented in one-shot script; construction counts and purity are independently measured'};
}
function publicSymbols(snap,t){
 const contracts=t.packages.find(p=>p.dir==='packages/contracts');
 const entry='apps/local-host/src/index.ts';
 const ownFiles=new Set(snap.files);
 const possible=(p)=>{
  const base=p.replace(/\.(?:d\.ts|m?js|cjs)$/, '');
  return [p,base+'.ts',base+'.mts',base+'.tsx',p+'.ts',p+'.mts',p+'/index.ts',base+'/index.ts'].find(x=>ownFiles.has(x));
 };
 const exportTarget=(pkg,sub)=>{
  const value=typeof pkg.exports==='string'?(sub==='.'?pkg.exports:null):pkg.exports?.[sub];
  const raw=typeof value==='string'?value:value?.import??value?.default??value?.node??value?.types;
  if(typeof raw!=='string')return null;
  const direct=path.posix.normalize(path.posix.join(pkg.dir,raw));
  return possible(direct)??possible(direct.replace('/dist/','/src/'))??null;
 };
 const roots=[entry];
 const subpaths=[];
 if(contracts){for(const sub of Object.keys(typeof contracts.exports==='string'?{'.':contracts.exports}:contracts.exports??{})){const file=exportTarget(contracts,sub);subpaths.push({subpath:sub,file});if(file)roots.push(file)}}
 const unresolved=new Set();
 const resolve=(spec,from)=>{
  if(spec.startsWith('.'))return possible(path.posix.normalize(path.posix.join(path.posix.dirname(from),spec)));
  const pkg=t.packages.find(p=>spec===p.name||spec.startsWith(p.name+'/'));
  if(!pkg)return null;
  const sub=spec===pkg.name?'.':'./'+spec.slice(pkg.name.length+1);
  return exportTarget(pkg,sub);
 };
 const options={noLib:true,noResolve:false,allowJs:true,checkJs:false,target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.NodeNext,moduleResolution:ts.ModuleResolutionKind.NodeNext,skipLibCheck:true};
 const host=ts.createCompilerHost(options);
 host.getCurrentDirectory=()=>'/git';host.getCanonicalFileName=f=>f;host.useCaseSensitiveFileNames=()=>true;
 host.fileExists=f=>ownFiles.has(f.replace(/^\/git\//,''));
 host.readFile=f=>snap.read(f.replace(/^\/git\//,''))??undefined;
 host.getSourceFile=(file,languageVersion)=>{const key=file.replace(/^\/git\//,'');const text=snap.read(key);return text===null?undefined:ts.createSourceFile(file,text,languageVersion,true)};
 host.resolveModuleNames=(modules,containing)=>modules.map(spec=>{
  const from=containing.replace(/^\/git\//,'');const file=resolve(spec,from);
  if(!file){if(spec.startsWith('.')||t.packages.some(p=>spec===p.name||spec.startsWith(p.name+'/')))unresolved.add(`${from} -> ${spec}`);return undefined}
  return {resolvedFileName:file,extension:file.endsWith('.tsx')?ts.Extension.Tsx:file.endsWith('.mts')?ts.Extension.Mts:ts.Extension.Ts,isExternalLibraryImport:false};
 });
 const program=ts.createProgram([...new Set(roots.filter(x=>ownFiles.has(x)))],options,host),checker=program.getTypeChecker();
 if(typeof checker.getTypeOnlyAliasDeclaration!=='function')throw Error('fixed TS checker lacks alias visibility API');
 const visibilityCache=new Map();
 const runtimeVisible=(file,name,seen=new Set())=>{
  const key=file+'\0'+name;if(visibilityCache.has(key))return visibilityCache.get(key);if(seen.has(key))return null;
  seen=new Set(seen).add(key);const sf=program.getSourceFile(file);if(!sf)return null;
  let unknown=false;
  for(const n of sf.statements){
   if(ts.isExportDeclaration(n)){
    if(n.isTypeOnly)continue;
    const targetFile=n.moduleSpecifier?resolve(n.moduleSpecifier.text,file):null;
    if(n.exportClause&&ts.isNamespaceExport(n.exportClause)){if(n.exportClause.name.text===name)return true;continue}
    if(n.exportClause&&ts.isNamedExports(n.exportClause)){
     for(const e of n.exportClause.elements)if(e.name.text===name&&!e.isTypeOnly){
      if(n.moduleSpecifier){if(!targetFile){unknown=true;continue}const v=runtimeVisible(targetFile,(e.propertyName??e.name).text,seen);if(v===true)return true;if(v===null)unknown=true}
      else {const local=checker.getExportSpecifierLocalTargetSymbol(e);if(local){let target=local;if(target.flags&ts.SymbolFlags.Alias)target=checker.getAliasedSymbol(target);if(!checker.getTypeOnlyAliasDeclaration(local)&&Boolean(target.flags&ts.SymbolFlags.Value))return true}else unknown=true}
     }
    }else if(!n.exportClause&&name!=='default'){
     if(!targetFile){unknown=true;continue}const v=runtimeVisible(targetFile,name,seen);if(v===true)return true;if(v===null)unknown=true;
    }
   }else if(ts.isExportAssignment(n)&&name==='default')return true;
   else if((n.modifiers??[]).some(m=>m.kind===ts.SyntaxKind.ExportKeyword)){
    if(ts.isVariableStatement(n)){
     const collect=bind=>ts.isIdentifier(bind)?[bind.text]:bind.elements.flatMap(e=>ts.isOmittedExpression(e)?[]:collect(e.name));
     if(n.declarationList.declarations.some(d=>collect(d.name).includes(name)))return true;
    }else if((n.name?.text===name||(n.modifiers??[]).some(m=>m.kind===ts.SyntaxKind.DefaultKeyword)&&name==='default')&&(ts.isClassDeclaration(n)||ts.isFunctionDeclaration(n)||ts.isEnumDeclaration(n)||ts.isModuleDeclaration(n)))return true;
   }
  }
  const result=unknown?null:false;visibilityCache.set(key,result);return result;
 };
 const symbols=(file)=>{
  if(!file)return {status:'missing-entry',names:[],valueCount:0,typeOnlyCount:0};
  const sf=program.getSourceFile(file);if(!sf)return {status:'not-in-program',names:[],valueCount:0,typeOnlyCount:0};
  const mod=checker.getSymbolAtLocation(sf);if(!mod)return {status:'no-module-symbol',names:[],valueCount:0,typeOnlyCount:0};
  const names=[];
  for(const s of checker.getExportsOfModule(mod)){
   let target=s;try{if(s.flags&ts.SymbolFlags.Alias)target=checker.getAliasedSymbol(s)}catch{}
   const dec=target.declarations?.[0];const name=s.getName();const visible=runtimeVisible(file,name);const aliasTypeOnly=Boolean(checker.getTypeOnlyAliasDeclaration(s));
   const isValue=Boolean(target.flags&ts.SymbolFlags.Value)&&!aliasTypeOnly&&visible===true;
   const valueKind=dec?(ts.isFunctionDeclaration(dec)||ts.isFunctionExpression(dec)?'function':ts.isClassDeclaration(dec)||ts.isClassExpression(dec)?'class':ts.isVariableDeclaration(dec)||ts.isBindingElement(dec)?'variable':ts.isEnumDeclaration(dec)?'enum':ts.isModuleDeclaration(dec)||ts.isNamespaceExport(dec)?'namespace':'other'):'unknown';
   names.push({name,isValue,typeOnly:!isValue&&visible!==null,visibility:visible===null?'unknown':isValue?'runtime':'type-only',aliasTypeOnly,valueKind,origin:dec?{path:dec.getSourceFile().fileName,offset:dec.getStart()}:null,flags:target.flags});
  }
  names.sort((a,b)=>a.name.localeCompare(b.name));
  return {status:'resolved-lower-bound',names,valueCount:names.filter(x=>x.isValue).length,typeOnlyCount:names.filter(x=>x.typeOnly).length,unknownCount:names.filter(x=>x.visibility==='unknown').length,valueKinds:countBy(names.filter(x=>x.isValue),'valueKind')};
 };
 const hostSymbols=ownFiles.has(entry)?symbols(entry):{status:'missing-entry',names:[],valueCount:0,typeOnlyCount:0};
 const contractRows=subpaths.map(x=>({...x,...symbols(x.file)}));
 const runtimeNames=contractRows.flatMap(r=>r.names.filter(x=>x.isValue&&x.origin));
 const originKinds=Object.fromEntries([...new Set(runtimeNames.map(x=>x.valueKind))].sort().map(k=>[k,new Set(runtimeNames.filter(x=>x.valueKind===k).map(x=>`${x.origin.path}\0${x.origin.offset}`)).size]));
 const unique=new Set(contractRows.flatMap(r=>r.names.filter(x=>x.isValue&&x.origin).map(x=>`${x.origin.path}\0${x.origin.offset}`)));
 return {host:hostSymbols,contracts:{subpaths:contractRows,uniqueRuntimeOrigins:unique.size,uniqueOriginsByKind:originKinds,totalPublicValueNames:contractRows.reduce((n,r)=>n+r.valueCount,0)},unresolved:[...unresolved].sort(),diagnostics:program.getSyntacticDiagnostics().map(d=>({path:d.file?.fileName??null,start:d.start,message:ts.flattenDiagnosticMessageText(d.messageText,' ')}))};
}
function loadingUnknowns(snap){
 const createRequire=[],requireAliases=[],evalCalls=[];
 for(const f of snap.files.filter(x=>src(x)||extra(x)||isTestFile(x))){
  const text=snap.read(f);if(text===null)continue;const sf=ts.createSourceFile(f,text,ts.ScriptTarget.Latest,true),factories=new Set(),bindings=new Set();
  for(const n of sf.statements)if(ts.isImportDeclaration(n)&&['node:module','module'].includes(n.moduleSpecifier.text))for(const e of n.importClause?.namedBindings?.elements??[])if((e.propertyName??e.name).text==='createRequire')factories.add(e.name.text);
  const walk=n=>{if(ts.isCallExpression(n)){
   const factory=ts.isIdentifier(n.expression)&&factories.has(n.expression.text)||ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='createRequire';
   if(factory){const alias=ts.isVariableDeclaration(n.parent)&&ts.isIdentifier(n.parent.name)?n.parent.name.text:null;if(alias)bindings.add(alias);createRequire.push({path:f,line:lineOf(sf,n.getStart(sf)),start:n.getStart(sf),alias,reason:'created loader not followed'})}
   if(ts.isIdentifier(n.expression)&&n.expression.text==='eval')evalCalls.push({path:f,line:lineOf(sf,n.getStart(sf)),start:n.getStart(sf),reason:'generated/evaluated code not parsed'});
  }ts.forEachChild(n,walk)};walk(sf);
  const usage=n=>{if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&bindings.has(n.expression.text))requireAliases.push({path:f,line:lineOf(sf,n.getStart(sf)),alias:n.expression.text,spec:n.arguments[0]&&ts.isStringLiteralLike(n.arguments[0])?n.arguments[0].text:null,reason:'createRequire alias load not followed'});ts.forEachChild(n,usage)};usage(sf);
 }
 return {createRequire,requireAliasCalls:requireAliases,evalCalls,generatedSourceDetection:{status:'NOT RUN',reason:'tracked generated code remains in source; no reliable universal generator marker in frozen method'}};
}
function exclusionInventory(files){
 const groups={};for(const f of files){if(src(f))continue;let reason;
 if(/\.d\.(?:ts|mts|cts)$/.test(f))reason='declaration';else if(/(^|\/)(tests?|fixtures)\//.test(f)||/\.test\.(?:ts|mts|tsx|js|mjs)$/.test(f))reason='tests-fixtures';else if(/(^|\/)(dist|node_modules)\//.test(f))reason='build-dependency';else if(f.startsWith('vendor/'))reason='vendor';else if(extra(f))reason='js-tsx-production';else if(/\.(?:rs|swift)$/.test(f))reason='rust-swift';else if(/\.(?:ts|mts|tsx|js|jsx|mjs|cjs)$/.test(f))reason='outside-main-areas';else reason='other-tracked';(groups[reason]??=[]).push(f)}
 return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,{count:v.length,files:v}]));
}
const results={};
for(const [label,ref] of [['B',input.baseline],['M',input.intermediate]]){
 if(git('rev-parse',`${ref}^{commit}`).trim()!==ref)throw Error(`nonexistent or noncanonical ${label}`);
 const t=tree(ref),baseSnap=commitSnapshot(repo,ref),extraTexts=catBatch(ref,baseSnap.files.filter(extra));
 const snap={files:baseSnap.files,read:f=>baseSnap.read(f)??extraTexts.get(f)??null};
 const units=unitMetrics(snap,ref);save(`${label}-units.json`,units);
 const boundaries=boundaryMetrics(snap,t,ref);save(`${label}-boundaries.json`,boundaries);
 const pub=publicSymbols(snap,t);
 const exports={...exportMetrics(snap,t),resolvedUnique:pub.host,resolvedReason:null,virtualUnresolved:pub.unresolved,virtualDiagnostics:pub.diagnostics};save(`${label}-exports.json`,exports);
 const contracts={...contractMetrics(snap,t),runtimeExports:pub.contracts,runtimeExportsReason:null};save(`${label}-contracts.json`,contracts);
 const pr=packageAndPR(ref);
 save(`${label}-packages.json`,{ref,packages:t.packages.map(x=>({dir:x.dir,name:x.name,category:category(x),historicalServerCategory:x.dir==='server'?(label==='B'?'foundation':'module'):null})),nonworkspace:'root/tests/docs/specs/scripts/skills/vendor/other are not packages'});
 save(`${label}-samples.json`,{summary:pr.summary,selected:pr.prs});
 save(`${label}-excluded-commits.json`,{visited:pr.sampled.visited,complete:pr.sampled.complete,reason:pr.sampled.reason,excluded:pr.sampled.excluded});
 save(`${label}-pr-files.json`,pr.prFiles);
 save(`${label}-hotspots.json`,pr.hotspots);
 const unknowns={loadingForms:loadingUnknowns(snap),excludedFiles:exclusionInventory(baseSnap.files),parseDiagnostics:units.parseDiagnostics,unresolvedImports:boundaries.unresolved,externalImports:boundaries.external,nonliteralImports:boundaries.nonliteral,hostResolvedSymbols:pub.host.status,contractsRuntimeExports:pub.contracts.subpaths.some(x=>x.status!=='resolved-lower-bound')?'some subpaths unresolved':null,virtualModuleUnresolved:pub.unresolved,staticGraphLimits:['No build products executed','Static src/dist twins and conditional exports are approximations','Computed imports, createRequire, process spawning and lazy package imports are not followed'],excludedMainSourceFileCounts:{jsTsx:baseSnap.files.filter(extra).length,tests:baseSnap.files.filter(f=>/^(tests|.*\/tests?)\//.test(f)&&/\.(ts|mts|mjs|tsx|js)$/.test(f)).length}};
 save(`${label}-unknowns.json`,unknowns);
 results[label]={ref,units:units.summary,boundaries:{internal:boundaries.internalSummary,runtimeSplitProcesses:boundaries.runtime.splitProcesses,cross:boundaries.crossSummary},exports:{lines:exports.physicalLines??null,star:exports.exportStar??null,explicitValue:exports.explicitValueNames?.length??null,explicitType:exports.explicitTypeNames?.length??null,resolvedValue:pub.host.valueCount,resolvedTypeOnly:pub.host.typeOnlyCount},contracts:{...contracts.summary,runtimeUniqueOrigins:pub.contracts.uniqueRuntimeOrigins,publicValueNames:pub.contracts.totalPublicValueNames},pr:pr.summary,hotspots:{anyFixedCount:pr.hotspots.anyFixedCount,denominator:pr.hotspots.denominator,top20:pr.hotspots.top20.map(x=>({path:x.path,count:x.count}))},unknowns:{parseDiagnostics:units.parseDiagnostics.length,unresolvedImports:boundaries.unresolved.length,externalImports:boundaries.external.length,nonliteralImports:boundaries.nonliteral.length}};
 console.error(`${label} done: ${ref} ${pr.summary.n} PRs`);
}
save('summary.json',{method:'W6-04-v2',inputs:input,gitMode:'frozen objects, no checkout',typescript:ts.version,node:process.version,results});
