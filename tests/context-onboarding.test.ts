import { modelPromptText, type ModelPromptInput } from "@molis-ai/molis-work-contracts/platform/model-prompts";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, homeAgentDefinitions, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, symlink, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { createFileSecretStore, runWithMolisWorkHome } from "@molis-ai/molis-work-storage";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { pagesActions } from "@molis-ai/molis-work-plugin-pages";
import { asOAuthAnswer, oauthNetwork } from "./fixtures/oauth-network.js";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { TODO_ORGANIZE_BASIC } from "@molis-ai/molis-work-plugin-todo";
import { withContextJourneys } from "../apps/local-host/dist/context-onboarding-store.js";
import { readProjectArrival } from "../apps/local-host/dist/project-arrival.js";
import { contextReferenceText, selectContextSources, stageContextFile, startContextJourney, waitContextJourney, adoptContextJourney, parseContextSummary, readContextJourney, removeIdleJourneyStaging, reopenContextJourney, updateContextDraft } from "../apps/local-host/dist/context-onboarding-service.js";
import { contextSources, readContextSource, readOnboardingGmail } from "../apps/local-host/dist/context-onboarding-sources.js";
import { createContextOnboardingHttp } from "../apps/local-host/dist/web-context-onboarding.js";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { handleLocalConnectorsSettingsHttp } from "../apps/local-host/dist/web-connectors-settings.js";
import { serveTestHost } from "./fixtures/test-home.js";
import { recordingTextModel, wireText } from "./fixtures/recording-text-model.js";
import { storeGmailOAuthClient } from "../apps/local-host/dist/gmail-oauth.js";
import { authorizeLocalWebRequest, type LocalMutationState } from "@molis-ai/molis-work-app-local-host";

const withCatalog = withMolisWorkProjectCatalog;
const hosts = new Map<string, MolisWorkLocalHost>();
async function home(t: Parameters<Parameters<typeof test>[1]>[0]) {
  const dir = await mkdtemp(join(tmpdir(), 'molis-context-'));
  t.after(async () => { await hosts.get(dir)?.close(); hosts.delete(dir); await rm(dir, {recursive:true,force:true}); }); return dir;
}
function pagesPorts(dir: string) {
  return { withCatalog, actions: async (_home: string, projectId: string, original_file?: { path: string; install_id: string }) => {
    const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    let host = hosts.get(dir); if (!host) { host = new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }); hosts.set(dir, host); }
    return bindActionClient(host.actionClient(reference), () => ({ actor_id: "context-test", project_id: projectId, audience: "user", permissions: ["pages:read", "pages:write", "artifacts:read", "artifacts:write"], ...original_file ? { original_file } : {} }));
  } };
}
/** One chosen file, uploaded into the journey's staging the way the page does it; the selection names it by digest. */
async function staged(dir: string, id: string, path: string, content: string | Buffer) {
  const file = await stageContextFile(dir, id, path, Buffer.from(content)); return { path: file.path, staged: file.staged };
}
const refs = [{label:'S1',source_id:'m1',version:1 as const,original:{filename:'alpha.md',mime:'text/markdown',sha256:'a'.repeat(64),size_bytes:16},title:'Alpha',path:'alpha.md',text:{sha256:'b'.repeat(64),bytes:16,chars:16}}];

test('adoption resumes after the summary action fails without replacing imported material edits or accepted intent', async t => {
  const dir = await home(t), id = randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: 'browser', selected: true, text: 'Adopted source body' }] });
  const base = pagesPorts(dir);
  const ports = { ...base, model: async () => ({ completeText: async () => '# Accepted project\nAdopted source body [S1]' }) };
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id); assert.equal(ready.phase, 'review');
  const failed = await adoptContextJourney(dir, id, { title: ready.summary!.title, body: ready.summary!.body }, {
    ...ports,
    actions: async (home, projectId, original_file): Promise<BoundActionClient> => {
      const client = await base.actions(home, projectId, original_file);
      return { discover: () => client.discover(), invoke: async (definition, input) => {
        if ((input as { request_id?: string }).request_id === id + ':summary') throw new Error('Summary storage temporarily unavailable');
        return client.invoke(definition, input);
      } };
    },
  });
  assert.equal(failed.phase, 'failed'); assert.match(failed.error!, /temporarily unavailable/);
  const store = openPagesStore(dir);
  try {
    const [source] = store.list(failed.project_id); assert.ok(source); assert.equal(store.list(failed.project_id).length, 1);
    store.update(source.id, { title: 'User edited source' }, failed.project_id);
    const resumed = await adoptContextJourney(dir, id, { title: 'Ignored new title', body: 'Ignored new body' }, ports);
    assert.equal(resumed.phase, 'complete'); assert.equal(resumed.project_id, failed.project_id);
    assert.equal(store.list(resumed.project_id).length, 2);
    assert.equal(store.get(source.id, resumed.project_id).title, 'User edited source');
    const summary = store.get(resumed.document_id!, resumed.project_id);
    assert.match(JSON.stringify(summary.body), /Adopted source body/); assert.match(JSON.stringify(summary.body), new RegExp(source.id));
    assert.doesNotMatch(JSON.stringify(summary), /Ignored new/);
    const replay = await adoptContextJourney(dir, id, {}, ports); assert.equal(replay.document_id, summary.id);
  } finally { store.close(); }
});

test('large materials keep their ending and resume completed model batches after failure', async t => {
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const original='# Long material\n\n'+('Ordinary work context.\n'.repeat(9000))+'FINAL FACT: launch is postponed to October 10.\n';
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'long.md',original)]}]});
  const prompts:string[]=[],notePrompts:string[]=[];let readCalls=0,failed=false;
  const ports={...pagesPorts(dir),readSource:async(h:string,s:Parameters<typeof readContextSource>[1])=>{readCalls++;return readContextSource(h,s);},model:async()=>({runtimeLabel:'batch fixture',completeText:async(input:ModelPromptInput)=>{const prompt=modelPromptText(input);
    assert.ok(prompt.length<82_000,'each model call has a bounded serialized prompt');prompts.push(prompt);
    const note=typeof input!=='string'&&input.instruction.prompt_id==='onboarding.notes';if(note)notePrompts.push(prompt);
    if(prompts.length===2&&!failed){failed=true;throw Error('Temporary batch failure');}
    return note?'# Evidence\nWork facts retained [S1]':'# Work\nLaunch is postponed to October 10 [S1]';
  }})};
  startContextJourney(dir,id,ports);let j=await waitContextJourney(dir,id);assert.equal(j.phase,'failed');assert.equal(j.synthesis!.completed,1);assert.equal(Object.keys(j.synthesis!.notes).length,1);
  const firstBatch=prompts[0]!.split('\n').at(-2)!;
  startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);assert.equal(j.phase,'review');assert.equal(readCalls,1);assert.equal(prompts.filter(p=>p.split('\n').at(-2)===firstBatch).length,1);
  const uniqueBatches=[...new Set(notePrompts.map(p=>p.split('\n').at(-2)!))];
  const processed=uniqueBatches.flatMap(p=>JSON.parse(p) as {body:string}[]).map(p=>p.body).join('');
  assert.equal(processed,await contextReferenceText(dir,id,j.summary!.references[0]!.text.sha256));assert.match(processed,/FINAL FACT: launch is postponed to October 10/);
  assert.match(j.summary!.body,/October 10/);assert.equal(j.summary!.references.length,1);
});

// The page shows the summary's calls as a bar and times the rest by the calls done (user 2026-10-22). The count of every call, later
// rounds included, is known from the first batch on and is the same on a restart, which counts staged notes as done without a call.
test('ONB-LIM-10 the summary counts all its calls from the start, times each one, and a restart neither counts a batch twice nor times a cached one', async t => {
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  const original='# Long material\n\n'+('Ordinary work context.\n'.repeat(9000))+'FINAL FACT.\n';
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'long.md',original)]}]});
  const seen:{done:number;all:number;calls:number}[]=[];let calls=0;
  const ports={...pagesPorts(dir),model:async()=>({runtimeLabel:'timing fixture',completeText:async(input:ModelPromptInput)=>{
    const s=withContextJourneys(dir,store=>store.get(id)).synthesis!;seen.push({...s.batches,calls:s.timing.calls});
    if(++calls===3)throw Error('Temporary batch failure');
    await new Promise(resolve=>setTimeout(resolve,15));
    return typeof input!=='string'&&input.instruction.prompt_id==='onboarding.notes'?'# Evidence\nWork facts retained [S1]':'# Work\nFinal fact [S1]';
  }})};
  startContextJourney(dir,id,ports);let j=await waitContextJourney(dir,id);assert.equal(j.phase,'failed');
  assert.deepEqual(seen,[{done:0,all:4,calls:0},{done:1,all:4,calls:1},{done:2,all:4,calls:2}],'three batches, then one call for the proposal');
  assert.equal(j.synthesis!.timing.calls,2,'a failed call is not timed');assert.ok(j.synthesis!.timing.ms>=25);
  seen.length=0;startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);assert.equal(j.phase,'review',j.error??'');
  assert.deepEqual(seen,[{done:2,all:4,calls:2},{done:3,all:4,calls:3}],'the two staged notes count as done, untimed');
  assert.deepEqual(j.synthesis!.batches,{done:4,all:4});assert.equal(j.synthesis!.timing.calls,4);
  assert.deepEqual(j.reading_bytes,{done:Buffer.byteLength(original),total:Buffer.byteLength(original)});
});

// Before B1 onboarding borrowed Cognia's port: its calls ran under Cognia's role and were recorded as Cognia's use of the onboarding
// instructions. The served Host's real path (register, configured model, HTTP) now runs them as onboarding's own.
test('the person\'s versions of both onboarding instructions are what the model reads, with no other owner\'s role, recorded as onboarding\'s use', { timeout: 60_000 }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'molis-context-')), id = randomUUID();
  const model = await recordingTextModel(t, dir, request => /PERSON_NOTES_EDIT/.test(wireText(request)) ? '# 笔记\n要点 [S1]' : '# 项目\n要点 [S1]');
  const definitions = homeAgentDefinitions(dir);
  definitions.save('system:onboarding/onboarding.notes', 'PERSON_NOTES_EDIT 只记要点。', null, 'person');
  definitions.save('system:onboarding/onboarding.proposal', 'PERSON_PROPOSAL_EDIT 写成项目建议。', null, 'person');
  const served = await serveTestHost(t, { home: dir });
  t.after(() => rm(dir, { recursive: true, force: true })); // after the served Host has closed
  const post = async (path: string, body: unknown) => {
    const response = await fetch(served.origin + path, { method: 'POST', headers: { origin: served.origin, 'content-type': 'application/json', 'x-molis-work-control-token': served.controlToken, 'x-molis-work-idempotency-key': randomUUID() }, body: JSON.stringify(body) });
    assert.ok(response.ok, `${path}: ${response.status} ${await response.clone().text()}`); return response;
  };
  const long = '# Long material\n\n' + 'Ordinary work context.\n'.repeat(9000);
  await post('/api/onboarding/context', { id });
  // The page uploads each chosen file as the raw body, then names it by the digest it got back.
  const upload = await fetch(`${served.origin}/api/onboarding/context/${id}/files?path=long.md`, { method: 'POST', headers: { origin: served.origin, 'content-type': 'application/octet-stream', 'x-molis-work-control-token': served.controlToken, 'x-molis-work-idempotency-key': randomUUID() }, body: Buffer.from(long) });
  assert.equal(upload.status, 201, await upload.clone().text()); const file = await upload.json() as { path: string; staged: string; size_bytes: number };
  assert.equal(file.size_bytes, Buffer.byteLength(long));
  await post(`/api/onboarding/context/${id}/selection`, { sources: [{ kind: 'files', selected: true, files: [{ path: file.path, staged: file.staged }] }] });
  await post(`/api/onboarding/context/${id}/start`, {});
  let journey: { phase: string; error: string | null } = { phase: 'reading', error: null };
  for (let i = 0; i < 300 && ['selecting', 'reading'].includes(journey.phase); i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    journey = await (await fetch(`${served.origin}/api/onboarding/context/${id}`)).json() as typeof journey;
  }
  assert.equal(journey.phase, 'review', journey.error ?? journey.phase);
  const notes = model.requests.filter(request => wireText(request).startsWith('PERSON_NOTES_EDIT'));
  const proposals = model.requests.filter(request => wireText(request).startsWith('PERSON_PROPOSAL_EDIT'));
  assert.ok(notes.length >= 2, 'the long material went through batch notes'); assert.equal(proposals.length, 1);
  // Beside them, Todo's organizer drafts todos from the same material under its own instruction (its own owner).
  const todo = model.requests.filter(request => wireText(request).includes(TODO_ORGANIZE_BASIC.body.slice(0, 80)));
  assert.equal(notes.length + proposals.length + todo.length, model.requests.length, 'every onboarding call opens with the person\'s version of its instruction');
  for (const request of model.requests.filter(request => !todo.includes(request))) {
    assert.equal(request.system, undefined, 'onboarding sends no system role of its own or another owner\'s');
    assert.doesNotMatch(wireText(request), /这是完整材料中的一批|这份项目建议是/, 'the shipped default does not run beside the person\'s version');
  }
  for (const key of ['system:onboarding/onboarding.notes', 'system:onboarding/onboarding.proposal']) {
    assert.equal(definitions.prompt(key).last_used?.caller, 'system:onboarding', `${key} is recorded as onboarding's use`);
    assert.ok(definitions.prompt(key).last_used?.user_revision, `${key} ran with the person's revision`);
  }
});

test('a batch cannot cite a source outside its input or pass invented evidence to final synthesis',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'long.md','Work facts\n'.repeat(11000))]}]});
  let calls=0;startContextJourney(dir,id,{...pagesPorts(dir),model:async()=>({completeText:async()=>{calls++;return '# Invalid\nInvented evidence [S99]';}})});
  const j=await waitContextJourney(dir,id);assert.equal(j.phase,'failed');assert.match(j.error!,/有效来源/);assert.equal(calls,1);assert.equal(Object.keys(j.synthesis!.notes).length,0);assert.equal(j.summary,null);
});

test('local scope → grounded summary → one real project and editable source documents; retries preserve edits', async t => {
  const dir=await home(t), folder=join(dir,'selected');
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  await mkdir(folder);await writeFile(join(folder,'brief.md'),'# Brief\nLaunch October 8');await writeFile(join(folder,'.secret.txt'),'private hidden');await symlink(join(folder,'brief.md'),join(folder,'link.md'));
  const id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'directory',selected:true,files:[await staged(dir,id,'brief.md','# Brief\nLaunch October 8')]},{kind:'gmail',selected:true,days:7}]});
  let calls=0;
  const ports={...pagesPorts(dir),model:async()=>({runtimeLabel:'test model',completeText:async(input:ModelPromptInput)=>{const prompt=modelPromptText(input);calls++;assert.match(prompt,/Launch October 8/);assert.doesNotMatch(prompt,/private hidden/);return '# 秋季发布\n## 当前进展\n计划于 10 月 8 日发布。[S1]\n## 下一步\n建议核对发布物料。[S1]';}})};
  startContextJourney(dir,id,ports);startContextJourney(dir,id,ports);
  const ready=await waitContextJourney(dir,id);assert.equal(ready.phase,'review');assert.equal(calls,1);assert.equal(ready.summary?.references.length,1);updateContextDraft(dir,id,{title:'已修改的草稿',body:ready.summary!.body});assert.equal(readContextJourney(dir,id).summary!.title,'已修改的草稿');assert.match(ready.sources[1]!.error!,/连接 Google/);
  const [a,b]=await Promise.all([adoptContextJourney(dir,id,{title:'用户确认的发布',body:ready.summary!.body},ports),adoptContextJourney(dir,id,{title:'用户确认的发布'},ports)]);
  assert.equal(a.phase,'complete');assert.equal(a.project_id,b.project_id);
  // The chooser introduces the new project in the words the person accepted: the summary's first paragraph, without its headings or [S1] marks.
  const introduced=readProjectArrival(dir).projects[a.project_id]?.description;assert.match(introduced??'',/10 月 8 日/);assert.doesNotMatch(introduced??'',/\[S\d+\]|^#/);
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.ok(!catalog.projectPluginMembership(a.project_id).hidden.includes('pages'));});
  const pages=openPagesStore(dir);try{assert.equal(pages.list(a.project_id).length,2);const summary=pages.get(a.document_id!,a.project_id);assert.match(JSON.stringify(summary.body),/openPlugin=pages/);pages.update(summary.id,{title:'手动修改后'});}finally{pages.close();}
  await adoptContextJourney(dir,id,{title:'重复请求'},ports);
  const reopened=openPagesStore(dir);try{assert.equal(reopened.get(a.document_id!).title,'手动修改后');assert.equal(reopened.list(a.project_id).length,2);}finally{reopened.close();}
  assert.equal(a.artifact_references!.length,2);
  const actions=await ports.actions(dir,a.project_id);
  const stored=await actions.invoke(artifactsActions.read,{reference:a.artifact_references![0]!});
  assert.ok(stored.selected);const payload=stored.selected!.payload as any;
  assert.match(payload.content,/Launch October 8/);assert.equal(Buffer.from(payload.original_file.data_base64,'base64').toString(),'# Brief\nLaunch October 8');
  const versions=await actions.invoke(artifactsActions.browser,{});assert.equal(versions.versions.length,2);

});

test('long source and project titles fit Pages while full titles, original bodies and retry identity survive',async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const sourceTitle='A'.repeat(73)+'🙂'+'B'.repeat(40),projectTitle='项目'.repeat(50);
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'message.md','# '+sourceTitle+'\n\nOriginal mail body.')]}]});
  const ports={...pagesPorts(dir),model:async()=>({completeText:async()=> '# Work\nOriginal mail body. [S1]'})};
  startContextJourney(dir,id,ports);const ready=await waitContextJourney(dir,id);assert.equal(ready.summary!.references[0]!.title,sourceTitle);
  const saved=await adoptContextJourney(dir,id,{title:projectTitle,body:ready.summary!.body},ports);assert.equal(saved.phase,'complete',saved.error??'');
  const pages=openPagesStore(dir);try{
    const docs=pages.list(saved.project_id);assert.equal(docs.length,2);assert.ok(docs.every(d=>[...d.title].length<=80&&d.title.isWellFormed()));
    const source=docs.find(d=>d.id!==saved.document_id)!;assert.equal(source.title,'[S1] '+'A'.repeat(73)+'🙂…');
    const sourceBody=JSON.stringify(pages.get(source.id).body);assert.ok(sourceBody.includes(sourceTitle));assert.match(sourceBody,/Original mail body/);
    assert.ok(JSON.stringify(pages.get(saved.document_id!).body).includes(projectTitle));
    await adoptContextJourney(dir,id,{title:'Ignored retry'},ports);assert.equal(pages.list(saved.project_id).length,2);
  }finally{pages.close();}
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,projectTitle);});
});

/**
 * A round over files that read as "# heading" and one line of body, adopted as `project`: the titles of the Pages documents it made (the source
 * documents in label order, [S1], [S2]…; the summary), and the summary's body as JSON, where "项目：" marks the project's name leading it.
 */
async function adoptedTitles(t: Parameters<Parameters<typeof test>[1]>[0], headings: string[], project: string) {
  const dir = await home(t), id = randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir, s => s.create(id));
  const files: { path: string; staged: string }[] = [];
  for (const [index, heading] of headings.entries()) files.push(await staged(dir, id, `m-${index + 1}.md`, `# ${heading}\n\nOriginal mail body.`));
  selectContextSources(dir, id, { sources: [{ kind: "files", selected: true, files }] });
  const ports = { ...pagesPorts(dir), model: async () => ({ completeText: async () => "# Work\nOriginal mail body. [S1]" }) };
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id);
  assert.equal(ready.phase, "review", ready.error ?? "");
  const saved = await adoptContextJourney(dir, id, { title: project, body: ready.summary!.body }, ports);
  assert.equal(saved.phase, "complete", saved.error ?? "");
  const pages = openPagesStore(dir);
  try {
    const documents = pages.list(saved.project_id), summary = documents.find(document => document.id === saved.document_id)!;
    return { sources: headings.map((_, index) => documents.find(document => document.title.startsWith(`[S${index + 1}] `))?.title),
      summary: summary.title, body: JSON.stringify(pages.get(summary.id).body) };
  } finally { pages.close(); }
}

// A source document's title in Pages is "[S<n>] " and the material's title, cut to the 80 whole characters Pages holds (a 🙂 is one, though two UTF-16 units).
const SOURCE_TITLES = [
  { name: "a 🙂 is the 79th character: kept, then …", heading: "A".repeat(73) + "🙂" + "B".repeat(40), rest: "A".repeat(73) + "🙂…" },
  { name: "75 🙂 and the label are exactly 80 characters: kept whole", heading: "🙂".repeat(75), rest: "🙂".repeat(75) },
  { name: "76 🙂 are one too many: cut to 74, then …", heading: "🙂".repeat(76), rest: "🙂".repeat(74) + "…" },
  { name: "75 one-unit characters and the label are exactly 80: kept whole", heading: "题".repeat(75), rest: "题".repeat(75) },
  { name: "76 one-unit characters are one too many: cut to 74, then …", heading: "题".repeat(76), rest: "题".repeat(74) + "…" },
];

test("RAC-2107 a source document's title in Pages is counted and cut in whole characters, 80 at most with its label", async t => {
  const { sources } = await adoptedTitles(t, SOURCE_TITLES.map(c => c.heading), "Titles");
  for (const [index, c] of SOURCE_TITLES.entries()) await t.test(c.name, () => assert.equal(sources[index], `[S${index + 1}] ${c.rest}`));
});

// The summary document is titled "<project> · 工作摘要" (the suffix is 7 characters). A project name is at most 120 UTF-16 units, so at most 60 🙂.
const SUMMARY_FITS = [
  { name: "60 🙂 and the suffix are 67 characters, 127 units: kept whole", project: "🙂".repeat(60) },
  { name: "26 A, 47 🙂 and the suffix are exactly 80 characters: kept whole", project: "A".repeat(26) + "🙂".repeat(47) },
  { name: "73 one-unit characters and the suffix are exactly 80: kept whole", project: "A".repeat(73) },
];
const SUMMARY_CUTS = [
  { name: "74 characters of one and two units and the suffix are 81: cut to 79, then …", project: "A".repeat(50) + "🙂".repeat(24), title: "A".repeat(50) + "🙂".repeat(24) + " · 工作…" },
  { name: "the 79th character is a 🙂: kept, then …", project: "A".repeat(78) + "🙂", title: "A".repeat(78) + "🙂…" },
  { name: "74 one-unit characters and the suffix are 81: cut to 79, then …", project: "A".repeat(74), title: "A".repeat(74) + " · 工作…" },
];

test("RAC-2108 a summary title of 80 whole characters or fewer is the Pages title whole, and the body does not repeat the project's name", { timeout: 120_000 }, async t => {
  for (const c of SUMMARY_FITS) await t.test(c.name, async st => {
    const { summary, body } = await adoptedTitles(st, ["Brief"], c.project);
    assert.equal(summary, `${c.project} · 工作摘要`);
    assert.ok(!body.includes("项目："), "the title is whole, so the project's name does not lead the body");
  });
});

test("RAC-2109 a summary title over 80 whole characters is cut to 79, then …, and the body opens with the project's name instead", { timeout: 120_000 }, async t => {
  for (const c of SUMMARY_CUTS) await t.test(c.name, async st => {
    const { summary, body } = await adoptedTitles(st, ["Brief"], c.project);
    assert.equal(summary, c.title);
    assert.ok(body.includes("项目：" + c.project), "the project's name leads the body");
  });
});

test('missing model preserves imported bodies, restart/retry does not re-read, invalid citations cannot be adopted',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Only October 8 is confirmed',url:'https://example.com/brief'}]});
  const ports={...pagesPorts(dir),model:async()=>({})};startContextJourney(dir,id,ports);let result=await waitContextJourney(dir,id);assert.equal(result.phase,'failed');assert.match(result.error!,/文字模型/);assert.equal(result.needs_model,true);const materialId=result.sources[0]!.references![0]!.source_id;
  startContextJourney(dir,id,{...pagesPorts(dir),readSource:async()=>{throw Error('must not read twice');},model:async()=>({completeText:async()=> '# Confirmed launch\nOctober 8 [S1]'})});result=await waitContextJourney(dir,id);assert.equal(result.phase,'review');assert.equal(result.summary!.references[0]!.source_id,materialId);
  assert.throws(()=>parseContextSummary('# Bad\nNo citations',refs),/有效来源/);assert.throws(()=>parseContextSummary('# Bad\nWrong [S2]',refs),/有效来源/);
  assert.throws(()=>contextSources([{kind:'browser',selected:true,url:'javascript:alert(1)',text:'x'}]),/网址/);
  const cancelled=randomUUID();withContextJourneys(dir,s=>{const j=s.create(cancelled);j.phase='reading';s.save(j);});assert.equal(readContextJourney(dir,cancelled).phase,'failed');
});

test('empty project is real, idempotent, and has no implicit root Goal',async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const result=await adoptContextJourney(dir,id,{title:'从空白开始',blank:true},{...pagesPorts(dir)});assert.equal(result.phase,'complete');
  assert.equal(readProjectArrival(dir).projects[result.project_id]?.description??null,null,'a blank start has no introduction to show');
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,'从空白开始');});
  // There is no goal command in the new flow; inspect the actual project database.
  const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(join(dir,'projects',result.project_id,'molis-work.db'));try{const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='goals'").get();assert.ok(table);assert.equal((db.prepare('SELECT COUNT(*) AS n FROM goals').get() as {n:number}).n,0);}finally{db.close();}
});

test('failed source read retains input and retry stages exactly one immutable snapshot',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Preserved across restart'}]});
  const ports={...pagesPorts(dir),model:async()=>({completeText:async()=> '# Recovered\nPreserved across restart [S1]'})};
  startContextJourney(dir,id,{...ports,readSource:async()=>{throw Error('Temporary read failure');}});
  const failed=await waitContextJourney(dir,id);assert.equal(failed.phase,'failed');assert.equal(failed.sources[0]!.text,'Preserved across restart');
  startContextJourney(dir,id,ports);const recovered=await waitContextJourney(dir,id);assert.equal(recovered.phase,'review');assert.equal(recovered.summary!.references.length,1);
  assert.equal(recovered.summary!.references[0]!.original.sha256,createHash('sha256').update('# 网页内容\n\nPreserved across restart').digest('hex'));
});

test('Gmail reads only chosen account/time with real MIME body parsing; network requests stay on Gmail',async t=>{
  const dir=await home(t);
  await runWithMolisWorkHome(dir,async()=>{
    const connection=withConnectorConnections(dir,s=>s.createToken({serviceId:'gmail',displayName:'Fixture account',token:'fixture-token',accountLabel:'fixture@example.com'}));
    const calls:string[]=[];
    const result=await readOnboardingGmail(dir,{kind:'gmail',selected:true,connection_id:connection.connection_id,days:7},async(input,init)=>{
      const url=new URL(String(input));calls.push(url.href);assert.equal(url.origin,'https://gmail.googleapis.com');assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer fixture-token');
      if(url.pathname.endsWith('/messages')){assert.equal(url.searchParams.get('q'),'newer_than:7d -in:spam -in:trash');assert.equal(url.searchParams.get('maxResults'),'20');return Response.json({messages:[{id:'abc123'}]});}
      assert.equal(url.searchParams.get('format'),'full');return Response.json({payload:{mimeType:'multipart/mixed',headers:[{name:'Subject',value:'Launch details'}],parts:[{mimeType:'text/plain',body:{data:Buffer.from('Real full body content').toString('base64url')}},{mimeType:'text/plain',filename:'secret.txt',body:{data:Buffer.from('Attachment excluded').toString('base64url')}}]}});
    });
    assert.equal(calls.length,2);const body=result.files[0]!.bytes!.toString();assert.match(body,/Real full body content/);assert.doesNotMatch(body,/Attachment excluded/);
  });
});

for (const mode of ["expired", "401", "401-repeated", "disconnect"] as const) {
  test(`W2-18-ONBOARDING-GMAIL-01 generic OAuth ${mode} stays on the selected account and stops on disconnect`, async t => {
    const dir = await home(t), served = await serveTestHost(t, { home: dir }), origin = served.origin;
    const localFetch = globalThis.fetch.bind(globalThis);
    const gmail: Array<{ url: string; authorization: string }> = [];
    const refreshes: string[] = [];
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    t.after(() => release.resolve());
    let rejected = false;
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(String(input)), authorization = new Headers(init?.headers).get("authorization") ?? "";
      if (url.origin === origin) return localFetch(input, init);
      if (url.origin === "https://oauth2.googleapis.com") {
        const form = new URLSearchParams(String(init?.body));
        const account = (form.get("refresh_token") ?? form.get("code") ?? "").slice(-1);
        assert.ok(["a", "b"].includes(account));
        assert.equal(form.get("client_id"), `fixture-app-${account}`);
        if (form.get("grant_type") === "refresh_token") {
          refreshes.push(account);
          return Response.json({ access_token: `fresh-${account}`, refresh_token: `refresh-${account}`, expires_in: 3600 });
        }
        return Response.json({ access_token: `access-${account}`, refresh_token: `refresh-${account}`, expires_in: 3600 });
      }
      if (url.origin === "https://openidconnect.googleapis.com") return Response.json({ sub: `account-${authorization.slice(-1)}`, email: `${authorization.slice(-1)}@example.test` });
      assert.equal(url.origin, "https://gmail.googleapis.com");
      if (url.pathname.endsWith("/profile")) return Response.json({ emailAddress: `${authorization.slice(-1)}@example.test` });
      gmail.push({ url: url.href, authorization });
      if (url.pathname.endsWith("/messages")) {
        if (mode === "401" && !rejected || mode === "401-repeated") { rejected = true; return Response.json({}, { status: 401 }); }
        assert.equal(url.searchParams.get("q"), "newer_than:7d -in:spam -in:trash");
        return Response.json({ messages: mode === "disconnect" ? [{ id: "one" }, { id: "two" }] : [{ id: "one" }] });
      }
      if (mode === "disconnect") { entered.resolve(); await release.promise; }
      return Response.json({ payload: { mimeType: "text/plain", body: { data: Buffer.from("Selected account mail").toString("base64url") } } });
    };
    t.mock.method(globalThis, "fetch", transport);
    // The generic flow's authorization and renewal leave by `sendPublicHttps` (W5-11 slice 4); the Gmail reads use `transport`.
    oauthNetwork(t, asOAuthAnswer(transport));
    const authorize = async (account: string) => {
      const begun = await served.web.post<{ authorization_url: string; connection_id: string }>("/api/settings/connectors/methods/oauth/start",
        { service_id: "gmail", display_name: account, client_id: `fixture-app-${account}`, client_secret: "fixture-only" });
      const returned = new URL("/api/settings/connectors/methods/oauth/callback", origin);
      returned.searchParams.set("state", new URL(begun.authorization_url).searchParams.get("state")!); returned.searchParams.set("code", `code-${account}`);
      await served.web.post("/api/settings/connectors/methods/oauth/complete", { returned_url: returned.href });
      return withConnectorConnections(dir, store => store.require(begun.connection_id, "gmail"));
    };
    const a = await authorize("a"), b = await authorize("b");
    if (mode === "expired") runWithMolisWorkHome(dir, () => createFileSecretStore().put(b.expires_ref!, "1"));
    const source = { kind: "gmail" as const, selected: true, connection_id: b.connection_id, days: 7 as const };
    if (mode === "disconnect") {
      const pending = readOnboardingGmail(dir, source, transport);
      await entered.promise;
      withConnectorConnections(dir, store => store.disconnect(b.connection_id));
      release.resolve();
      await assert.rejects(pending, /连接已改变|断开/);
      assert.equal(gmail.length, 2, "the second message was never requested");
      await assert.rejects(readOnboardingGmail(dir, source, transport), /连接|断开/);
      assert.equal(gmail.length, 2);
    } else if (mode === "401-repeated") {
      await assert.rejects(readOnboardingGmail(dir, source, transport), /无读取权限/);
      assert.deepEqual(refreshes, ["b"]);
      assert.equal(gmail.length, 2, "a second 401 is surfaced rather than refreshed again");
    } else {
      const read = await readOnboardingGmail(dir, source, transport);
      assert.equal(read.name, "Gmail · b@example.test");
      assert.match(read.files[0]!.bytes!.toString(), /Selected account mail/);
      assert.deepEqual(refreshes, ["b"]);
      assert.equal(gmail.at(-1)!.authorization, "Bearer fresh-b");
    }
    assert.ok(gmail.every(call => call.authorization.endsWith("-b")), "no other saved account is used");
    assert.equal(runWithMolisWorkHome(dir, () => createFileSecretStore().get(a.credential_ref!)), "access-a");
  });
}

test('HTTP control gate, persisted selection, Google PKCE start, cancellation and callback resume correct journey',async t=>{
  const dir=await home(t),id=randomUUID(),token='onboarding-control-test';const handle=createContextOnboardingHttp({...pagesPorts(dir),model:async()=>({})});
  const keys=new Map<string,LocalMutationState>();
  const server=createServer((req,res)=>{const url=new URL(req.url!,'http://127.0.0.1');if(!authorizeLocalWebRequest(req,res,url,token,keys))return;void runWithMolisWorkHome(dir,async()=>{if(await handle(req,res,url,dir))return;if(await handleLocalConnectorsSettingsHttp(req,res,url,dir))return;res.writeHead(404);res.end();}).catch(error=>{res.writeHead(500);res.end(JSON.stringify({error:error.message}));});});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise<void>(resolve=>server.close(()=>resolve())));const address=server.address() as {port:number};const origin='http://127.0.0.1:'+address.port;
  const post=async(path:string,body:unknown)=>fetch(origin+path,{method:'POST',headers:{origin,'content-type':'application/json','x-molis-work-control-token':token,'x-molis-work-idempotency-key':randomUUID()},body:JSON.stringify(body)});
  assert.equal((await fetch(origin+'/api/onboarding/context',{method:'POST',body:'{}'})).status,403);
  await post('/api/onboarding/context',{id});await post('/api/onboarding/context/'+id+'/selection',{sources:[{kind:'gmail',selected:true,days:7}],auto_start:true});
  runWithMolisWorkHome(dir,()=>storeGmailOAuthClient({clientId:'fixture.apps.googleusercontent.com'}));
  const metadata=await(await fetch(origin+'/api/onboarding/context')).json();assert.equal(metadata.resume.id,id);assert.equal(metadata.resume.title,'未完成的整理');
  const begun=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const consent=new URL(begun.authorizationUrl);assert.equal(consent.hostname,'accounts.google.com');assert.equal(consent.searchParams.get('code_challenge_method'),'S256');assert.equal(begun.redirectUri,origin+'/api/feed/connectors/gmail/oauth/callback');
  const cancelled=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?error=access_denied&state='+begun.state,{redirect:'manual'});assert.equal(cancelled.status,302);assert.match(cancelled.headers.get('location')!,new RegExp('journey='+id+'&oauth=cancelled'));assert.equal(readContextJourney(dir,id).auto_start,false);/* A late code for a finished state is refused before any exchange; the browser returns to settings with the reason. */const late=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=late-code&state='+begun.state,{redirect:'manual'});assert.equal(late.status,302);assert.match(late.headers.get('location')!,/connection_error=failed/);assert.equal(readContextJourney(dir,id).auto_start,false);assert.equal(readContextJourney(dir,id).oauth_status,'cancelled');
  const begun2=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const realFetch=globalThis.fetch;
  globalThis.fetch=(async(input,init)=>{const url=String(input);if(url.startsWith('https://oauth2.googleapis.com/'))return Response.json({access_token:'test-access',refresh_token:'test-refresh',expires_in:3600});if(url.endsWith('/gmail/v1/users/me/profile'))return Response.json({emailAddress:'test@example.com'});return realFetch(input,init);}) as typeof fetch;
  try {const done=await realFetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=fixture-code&state='+begun2.state,{redirect:'manual'});assert.equal(done.status,302);assert.match(done.headers.get('location')!,/oauth=connected/);assert.equal(readContextJourney(dir,id).sources[0]!.connection_id,begun2.connection_id);}
  finally{globalThis.fetch=realFetch;}
  // Replaying a completed callback exchanges nothing and keeps the connection it already made.
  const replay=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=fixture-code&state='+begun2.state,{redirect:'manual'});assert.equal(replay.status,302);assert.match(replay.headers.get('location')!,/connection_error=failed/);assert.equal(readContextJourney(dir,id).sources[0]!.connection_id,begun2.connection_id);
  const expired=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  runWithMolisWorkHome(dir,()=>{const store=createFileSecretStore(),ref='connector:gmail:oauth:connection-target:'+expired.state,pending=JSON.parse(store.get(ref)!);pending.createdAt=Date.now()-11*60_000;store.put(ref,JSON.stringify(pending));});
  const timedOut=await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=unused&state='+expired.state,{redirect:'manual'});
  assert.equal(timedOut.status,302);assert.match(timedOut.headers.get('location')!,new RegExp('journey='+id+'&oauth=failed'));assert.match(readContextJourney(dir,id).error!,/过期/);
  const older=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  const newer=await(await post('/api/settings/connectors/gmail/oauth/start',{onboarding_id:id,manage_connection:true})).json();
  await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?error=access_denied&state='+older.state,{redirect:'manual'});
  assert.equal(readContextJourney(dir,id).oauth_state,newer.state);assert.equal(readContextJourney(dir,id).oauth_status,'pending');
  await post('/api/onboarding/context/'+id+'/selection',{sources:[{kind:'gmail',selected:false,days:7}],auto_start:false});
  await fetch(origin+'/api/feed/connectors/gmail/oauth/callback?code=unused&state='+newer.state,{redirect:'manual'});
  assert.equal(readContextJourney(dir,id).oauth_status,'cancelled');assert.equal(readContextJourney(dir,id).sources[0]!.selected,false);
});

test('abandoned OAuth expires on resume without losing selected materials',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>{const j=s.create(id);j.sources=[{kind:'browser',selected:true,text:'Retained work'}];j.oauth_status='pending';j.oauth_expires_at=Date.now()-1;j.auto_start=true;s.save(j);});
  const resumed=readContextJourney(dir,id);assert.equal(resumed.oauth_status,'failed');assert.equal(resumed.auto_start,false);assert.match(resumed.error!,/过期/);assert.equal(resumed.sources[0]!.text,'Retained work');
  assert.equal(withContextJourneys(dir,s=>s.get(id)).oauth_status,'failed');
});

test('creation failure after project registration resumes exactly that project, and materials-only remains usable without AI',async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'Fixture preserved body'}]});
  startContextJourney(dir,id,{...pagesPorts(dir),model:async()=>({})});await waitContextJourney(dir,id);
  const failAfterCreate:typeof withCatalog=async(options,operation)=>{await withCatalog(options,operation);throw new Error('Simulated response loss after project creation');};
  const first=await adoptContextJourney(dir,id,{title:'Without AI',materials_only:true},{...pagesPorts(dir),withCatalog:failAfterCreate});assert.match(first.error!,/response loss/);
  const second=await adoptContextJourney(dir,id,{title:'retry ignored',materials_only:true},{...pagesPorts(dir)});assert.equal(second.phase,'complete');assert.equal(second.error,null);
  await withCatalog({homeDirectory:dir},catalog=>{assert.equal(catalog.listProjects().length,1);assert.equal(catalog.listProjects()[0]!.display_name,'Without AI');});
  const pages=openPagesStore(dir);try{assert.equal(pages.list(second.project_id).length,2);assert.match(JSON.stringify(pages.list(second.project_id)),/Fixture preserved body/);}finally{pages.close();}
});

// RAC-661 (PG-031): the Host saves materials into the Pages that ships with it, found in the directory, never into a same-named
// capability of another plugin; without it nothing is written and adoption says why.
test('RAC-661 adoption writes no document when the shipped Pages is not in the directory, even if another provider has its actions', async t => {
  const dir = await home(t), id = randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir, store => store.create(id));
  selectContextSources(dir, id, { sources: [{ kind: 'browser', selected: true, text: 'A body for no Pages' }] });
  const base = pagesPorts(dir);
  const ports = { ...base, model: async () => ({ completeText: async () => '# No Pages\nA body for no Pages [S1]' }) };
  startContextJourney(dir, id, ports);
  const ready = await waitContextJourney(dir, id); assert.equal(ready.phase, 'review');
  const invoked: string[] = [];
  const adopted = await adoptContextJourney(dir, id, { title: ready.summary!.title, body: ready.summary!.body }, { ...ports,
    actions: async (home, projectId, original_file): Promise<BoundActionClient> => {
      const client = await base.actions(home, projectId, original_file);
      // The directory shows Pages' actions only under another provider's id.
      return { discover: async () => (await client.discover()).map(view => view.capability_id.startsWith('pages.') ? { ...view, provider: { ...view.provider, provider_id: 'com.example.pages' } } : view),
        invoke: async (definition, input, control) => { invoked.push(definition.capability_id); return client.invoke(definition, input, control); } };
    },
  });
  assert.equal(adopted.phase, 'failed'); assert.match(adopted.error!, /pages\.documents\.body_from_markdown@1 未在当前项目登记或未获授权/);
  assert.ok(!invoked.some(capability => capability.startsWith('pages.')), invoked.join(', '));
  const store = openPagesStore(dir);
  try { assert.equal(store.list(adopted.project_id).length, 0); } finally { store.close(); }
});

test('ordinary entry can discover unfinished work without empty or completed attempts hiding it',async t=>{
  const dir=await home(t),active=randomUUID(),empty=randomUUID(),completed=randomUUID();
  withContextJourneys(dir,s=>s.create(active));
  selectContextSources(dir,active,{sources:[{kind:'browser',selected:true,text:'Unsummarized work'}]});
  withContextJourneys(dir,s=>{s.create(empty);const j=s.create(completed);j.phase='complete';s.save(j);assert.equal(s.latestIncomplete()!.id,active);});
  const other=await home(t);assert.equal(withContextJourneys(other,s=>s.latestIncomplete()),null);
});

test('partial failure can be adjusted and retried while successful material snapshots stay fixed',async t=>{
  const dir=await home(t),id=randomUUID();withContextJourneys(dir,s=>s.create(id));
  selectContextSources(dir,id,{sources:[{kind:'browser',selected:true,text:'First confirmed fact'},{kind:'chat',selected:true,files:[await staged(dir,id,'chat.txt','Second confirmed fact')]}]});
  let browserReads=0,chatReads=0;
  const ports={...pagesPorts(dir),readSource:async(h:string,s:Parameters<typeof readContextSource>[1])=>{if(s.kind==='browser')browserReads++;if(s.kind==='chat'&&++chatReads===1)throw Error('Temporary chat import failure');return readContextSource(h,s);},model:async()=>({completeText:async()=> '# Work\nConfirmed fact [S1]'})};
  startContextJourney(dir,id,ports);let j=await waitContextJourney(dir,id);assert.equal(j.phase,'review');assert.match(j.sources[1]!.error!,/Temporary/);const savedId=j.sources[0]!.references![0]!.source_id;
  j=reopenContextJourney(dir,id);assert.ok(j.summary,'existing draft survives until user starts again');selectContextSources(dir,id,{sources:j.sources});
  startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);assert.equal(j.summary!.references.length,2);assert.equal(browserReads,1);assert.equal(chatReads,2);assert.equal(j.sources[0]!.references![0]!.source_id,savedId);
  j=reopenContextJourney(dir,id);j.sources[0]!.text='Changed scope';j.sources[1]!.selected=false;
  selectContextSources(dir,id,{sources:j.sources});startContextJourney(dir,id,ports);j=await waitContextJourney(dir,id);
  assert.equal(browserReads,2);assert.equal(chatReads,2,'unselected chat must not be read');assert.equal(j.summary!.references.length,1);assert.match(await contextReferenceText(dir,id,j.summary!.references[0]!.text.sha256),/Changed scope/);assert.notEqual(j.summary!.references[0]!.source_id,savedId);
});

test('interrupted blank adoption resumes persisted acceptance without requiring a nonexistent summary',async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const failAfterCreate:typeof withCatalog=async(options,operation)=>{await withCatalog(options,operation);throw Error('Lost creation response');};
  const accepted=await adoptContextJourney(dir,id,{title:'Accepted blank project',blank:true},{...pagesPorts(dir),withCatalog:failAfterCreate});assert.equal(accepted.phase,'failed');assert.equal(accepted.summary,null);
  withContextJourneys(dir,s=>{const j=s.get(id);j.phase='adopting';s.save(j);});
  const recovered=readContextJourney(dir,id);assert.equal(recovered.phase,'failed');assert.equal(recovered.adoption!.title,'Accepted blank project');
  assert.throws(()=>reopenContextJourney(dir,id),/不能更改来源/);assert.throws(()=>startContextJourney(dir,id,{...pagesPorts(dir)}),/继续保存/);
  const saved=await adoptContextJourney(dir,id,{}, {...pagesPorts(dir)});assert.equal(saved.phase,'complete');assert.equal(saved.project_id,accepted.project_id);
  await withCatalog({homeDirectory:dir},catalog=>assert.equal(catalog.listProjects().length,1));
  const pages=openPagesStore(dir);try{assert.equal(pages.list(saved.project_id).length,1);assert.equal(pages.get(saved.document_id!).title,'Accepted blank project · 工作摘要');}finally{pages.close();}
});


test('blank start after a prior summary never adopts old sources, including a failed-save retry',async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>{const j=s.create(id);j.phase='review';j.summary={title:'Old summary',body:'Old facts [S1]',references:refs};s.save(j);});
  reopenContextJourney(dir,id);
  const failAfterCreate:typeof withCatalog=async(options,operation)=>{await withCatalog(options,operation);throw Error('Response lost');};
  const failed=await adoptContextJourney(dir,id,{title:'Blank after summary',blank:true},{...pagesPorts(dir),withCatalog:failAfterCreate});assert.equal(failed.phase,'failed');
  const result=await adoptContextJourney(dir,id,{},pagesPorts(dir));assert.equal(result.phase,'complete');assert.deepEqual(result.artifact_references,[]);
  const pages=openPagesStore(dir);try{assert.equal(pages.list(result.project_id).length,1);assert.doesNotMatch(JSON.stringify(pages.get(result.document_id!).body),/Old facts|Alpha/);}finally{pages.close();}
});

test('old unfinished Cognia identities remain intact and cannot become undefined Artifact identities',async t=>{
  const dir=await home(t),id=randomUUID();
  withContextJourneys(dir,s=>{const j=s.create(id);j.phase='review';j.summary={title:'Historical',body:'Fact [S1]',references:[{label:'S1',material_id:'old-1',revision:1,title:'Old',body:'Historical body',path:'old.md'} as any]};s.save(j);});
  const result=readContextJourney(dir,id);assert.equal(result.requires_reselection,true);assert.match(result.error!,/旧版存储/);
  assert.throws(()=>startContextJourney(dir,id,pagesPorts(dir)),/重新选择/);
  await assert.rejects(adoptContextJourney(dir,id,{title:'Unsafe adoption'},pagesPorts(dir)),/重新选择/);
  assert.equal((withContextJourneys(dir,s=>s.get(id)).summary!.references[0] as any).material_id,'old-1');
});


// No limits on a round (user 2026-10-22, replaces slice 90's 200 files / 50 MB / 20 MB): the selection names staged files by digest,
// however many; a file's bytes never travel in the selection, and reading queues the files one at a time.
test('ONB-LIM-02 a round has no file count or size limit, and its selection carries only staged digests',()=>{
  const many=Array.from({length:1000},(_,i)=>({path:'f-'+i+'.md',staged:createHash('sha256').update(String(i)).digest('hex')}));
  assert.equal(contextSources([{kind:'files',selected:true,files:many}])[0]!.files!.length,1000);
  assert.throws(()=>contextSources([{kind:'files',selected:true,files:[{path:'inline.md',data:Buffer.from('x').toString('base64')}]}]),/重新选择/);
  assert.throws(()=>contextSources([{kind:'files',selected:true,files:[{path:'other.md',staged:'../files/'+'a'.repeat(55)}]}]),/重新选择/);
});

test('ONB-LIM-03 a round of 300 files is read one by one and adopted whole: every material in Pages and the 成果库, staging cleared',{timeout:240_000},async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const files=[];for(let i=0;i<300;i++)files.push(await staged(dir,id,'notes/n-'+i+'.md','# Note '+i+'\n\nFact number '+i+'.'));
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files}]});
  const seen:number[]=[],bytes:{done:number;total:number}[]=[];const ports={...pagesPorts(dir),model:async()=>({})};
  const timer=setInterval(()=>{const j=withContextJourneys(dir,s=>s.get(id)),r=j.sources[0]?.reading;if(r){seen.push(r.done);bytes.push(j.reading_bytes!);}},5);t.after(()=>clearInterval(timer));
  startContextJourney(dir,id,ports);const read=await waitContextJourney(dir,id);clearInterval(timer);
  assert.equal(read.phase,'failed');assert.equal(read.needs_model,true);assert.equal(read.sources[0]!.references!.length,300);assert.equal(read.sources[0]!.reading,undefined);
  assert.ok(seen.some(n=>n>0&&n<300),'the checkpoint says how far reading has come');
  // ONB-LIM-10: how far by bytes, of a total known before the first file is read.
  const sizes=read.sources[0]!.references!.reduce((n,r)=>n+r.original.size_bytes,0);
  assert.ok(bytes.length&&bytes.every(b=>b.total===sizes&&b.done<=b.total),JSON.stringify(bytes.slice(0,3)));assert.ok(bytes.some(b=>b.done>0&&b.done<sizes),'bytes read part-way are counted');
  assert.deepEqual(read.reading_bytes,{done:sizes,total:sizes});
  assert.ok(JSON.stringify(withContextJourneys(dir,s=>s.get(id))).length<300*1_000,'the journey row names materials by digest, without their text');
  const adopted=await adoptContextJourney(dir,id,{title:'Three hundred',materials_only:true},ports);assert.equal(adopted.phase,'complete',adopted.error??'');
  const pages=openPagesStore(dir);try{assert.equal(pages.list(adopted.project_id).length,301);}finally{pages.close();}
  assert.equal(adopted.artifact_references!.length,301);
  await assert.rejects(stat(join(dir,'context-onboarding','journeys',id)),{code:'ENOENT'});
});

// RAC-660 (PG-031): Pages makes each part's body and saves it (its body_from_markdown and documents.import, found in the directory);
// the Host builds no Pages body.
test('ONB-LIM-04 a file over 6 MB with over 2 MB of text reaches adoption whole: its original in the 成果库\'s store, its whole text in Pages parts',{timeout:240_000},async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const big='# Big notes\n\n'+Array.from({length:120_000},(_,i)=>'Line '+i+' of the long record, with ordinary work context.').join('\n')+'\nEND OF BIG FILE\n';
  assert.ok(Buffer.byteLength(big)>6_000_000);
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'big.md',big)]}]});
  const ports={...pagesPorts(dir),model:async()=>({})};
  startContextJourney(dir,id,ports);const read=await waitContextJourney(dir,id);assert.equal(read.sources[0]!.references!.length,1);
  assert.equal(read.sources[0]!.references![0]!.text.chars,big.trim().length,'the whole text is read, not its first 2 MB');
  const adopted=await adoptContextJourney(dir,id,{title:'Big',materials_only:true},ports);assert.equal(adopted.phase,'complete',adopted.error??'');
  const pages=openPagesStore(dir);try{
    const parts=pages.list(adopted.project_id).filter(d=>d.id!==adopted.document_id).sort((a,b)=>a.title.localeCompare(b.title,'en',{numeric:true}));
    assert.ok(parts.length>1);assert.ok(parts.every((d,i)=>d.title.endsWith(` · 第 ${i+1} / ${parts.length} 部分`)),parts.map(d=>d.title).join(', '));
    const text=parts.map(d=>JSON.stringify(pages.get(d.id).body)).join('');
    assert.match(text,/原标题：Big notes/);assert.match(text,/Line 119999 of the long record/);assert.match(text,/END OF BIG FILE/);
  }finally{pages.close();}
  const actions=await ports.actions(dir,adopted.project_id);
  const stored=await actions.invoke(artifactsActions.read,{reference:adopted.artifact_references![0]!});const payload=stored.selected!.payload as {original_file:{data_base64?:string;sha256?:string;size_bytes?:number}};
  assert.equal(payload.original_file.data_base64,undefined,'over 6 MB, the original is kept by reference');
  assert.equal(payload.original_file.size_bytes,Buffer.byteLength(big));assert.equal(payload.original_file.sha256,createHash('sha256').update(big).digest('hex'));
});

test('RAC-617 PG-088 a real Pages body_too_large refusal is halved by onboarding and all source text is saved in order',{timeout:240_000},async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({homeDirectory:dir,completeText:null}).close();
  withContextJourneys(dir,s=>s.create(id));
  // Below the unchanged 400,000-character first part and 1,000,000-character action input bounds, but the many headings expand
  // past Pages' real 1,500,000-character body bound. Distinct facts reveal any lost, repeated or reordered passage after halving.
  const facts=Array.from({length:25_000},(_,i)=>'fact-'+String(i).padStart(5,'0'));
  const markdown=facts.map(fact=>'# '+fact).join('\n\n')+'\n';
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'dense.md',markdown)]}]});
  const base=pagesPorts(dir),conversions:{markdown:string;result:'ok'|'too_large'}[]=[];
  const ports={...base,model:async()=>({}),actions:async(h:string,p:string,o?:{path:string;install_id:string}):Promise<BoundActionClient>=>{
    const client=await base.actions(h,p,o);
    return {discover:()=>client.discover(),invoke:async(definition,input)=>{
      if(definition.capability_id!==pagesActions.bodyFromMarkdown.capability_id)return client.invoke(definition,input);
      const markdown=(input as {markdown:string}).markdown;
      try{
        const result=await client.invoke(definition,input);
        conversions.push({markdown,result:'ok'});return result;
      }catch(error){
        assert.equal((error as {code?:string}).code,'pages.body_too_large');
        conversions.push({markdown,result:'too_large'});throw error;
      }
    }};
  }};
  startContextJourney(dir,id,ports);const read=await waitContextJourney(dir,id);
  const ref=read.sources[0]!.references![0]!;
  const source=await contextReferenceText(dir,id,ref.text.sha256);
  assert.equal(source,markdown.trim(),'the complete Markdown reached staging');
  const whole=`原标题：${ref.title}\n\n来源：${ref.path} · 版本 ${ref.version}\n\n${source}`;
  assert.ok(whole.length<400_000,'one original part reaches the real converter');
  const adopted=await adoptContextJourney(dir,id,{title:'Real conversion recovery',materials_only:true},ports);
  assert.equal(adopted.phase,'complete',adopted.error??'');
  const half=Math.ceil(whole.length/2);
  assert.deepEqual(conversions.slice(0,3),[
    {markdown:whole,result:'too_large'},
    {markdown:whole.slice(0,half),result:'ok'},
    {markdown:whole.slice(half),result:'ok'},
  ],'the real rejected input is retried as its two original halves');
  assert.equal(conversions.filter(call=>call.result==='too_large').length,1);
  const textOf=(value:unknown):string=>{
    const node=value as {text?:string;content?:unknown[]};
    return node.text??(node.content??[]).map(textOf).join('');
  };
  const pages=openPagesStore(dir);try{
    const parts=pages.list(adopted.project_id).filter(d=>d.id!==adopted.document_id).sort((a,b)=>a.title.localeCompare(b.title,'en',{numeric:true}));
    assert.equal(parts.length,2);
    assert.ok(parts.every((d,i)=>d.title.endsWith(` · 第 ${i+1} / 2 部分`)),parts.map(d=>d.title).join(', '));
    const restored=parts.map(part=>{
      const body=pages.get(part.id,adopted.project_id).body;
      assert.ok(JSON.stringify(body).length<=1_400_000,'the persisted part fits onboarding and Pages');
      return textOf(body);
    }).join('');
    const metadata=`原标题：${ref.title}来源：${ref.path} · 版本 ${ref.version}`;
    assert.ok(restored.startsWith(metadata));
    assert.deepEqual(restored.slice(metadata.length).match(/fact-\d{5}/gu),facts,'all source facts survive in their original order');
    const expected=metadata+facts.join('');
    assert.equal(restored.replace(/[#\s]/gu,''),expected.replace(/\s/gu,''),'the entire visible text survives, including source metadata');
  }finally{pages.close();}
});

// W5-06 remainder slice 4 (PG-088, RAC-617): Pages converts the text through its public action; a part it refuses as too large is halved.
test('RAC-617 PG-088 a part Pages refuses with pages.body_too_large is halved until each part fits; when a part of one character is refused the error is thrown',{timeout:240_000},async t=>{
  const dir=await home(t),id=randomUUID();
  await new MolisWorkLocalHost({ homeDirectory: dir, completeText: null }).close();
  withContextJourneys(dir,s=>s.create(id));
  const text='# Long record\n\n'+Array.from({length:7_000},(_,i)=>'Line '+i+' of the record, with ordinary work context.').join('\n')+'\nEND OF RECORD\n';
  assert.ok(text.length>300_000&&text.length<400_000);
  selectContextSources(dir,id,{sources:[{kind:'files',selected:true,files:[await staged(dir,id,'long.md',text)]}]});
  const base=pagesPorts(dir),limit={chars:100_000};
  const refusing={...base,model:async()=>({}),actions:async(h:string,p:string,o?:{path:string;install_id:string}):Promise<BoundActionClient>=>{
    const client=await base.actions(h,p,o);
    return {discover:()=>client.discover(),invoke:async(definition,input)=>{
      if(definition.capability_id==='pages.documents.body_from_markdown'&&(input as {markdown:string}).markdown.length>limit.chars)
        throw Object.assign(new Error('too large'),{code:'pages.body_too_large'});
      return client.invoke(definition,input);
    }};
  }};
  startContextJourney(dir,id,refusing);await waitContextJourney(dir,id);
  const adopted=await adoptContextJourney(dir,id,{title:'Halved',materials_only:true},refusing);assert.equal(adopted.phase,'complete',adopted.error??'');
  const pages=openPagesStore(dir);try{
    const parts=pages.list(adopted.project_id).filter(d=>d.id!==adopted.document_id).sort((a,b)=>a.title.localeCompare(b.title,'en',{numeric:true}));
    assert.equal(parts.length,4,'a 330,000-character text refused above 100,000 halves to four parts');
    assert.ok(parts.every((d,i)=>d.title.endsWith(` · 第 ${i+1} / 4 部分`)),parts.map(d=>d.title).join(', '));
    const joined=parts.map(d=>JSON.stringify(pages.get(d.id).body)).join('');
    assert.match(joined,/原标题：Long record/);assert.match(joined,/Line 6999 of the record/);assert.match(joined,/END OF RECORD/);
  }finally{pages.close();}
  // Refused whatever its size, a part is halved down to one character and then the error comes out (no endless halving).
  const id2=randomUUID();withContextJourneys(dir,s=>s.create(id2));
  selectContextSources(dir,id2,{sources:[{kind:'files',selected:true,files:[await staged(dir,id2,'short.md','A short note, refused all the same.\n')]}]});
  limit.chars=0;
  startContextJourney(dir,id2,refusing);await waitContextJourney(dir,id2);
  const failed=await adoptContextJourney(dir,id2,{title:'Refused',materials_only:true},refusing);
  assert.equal(failed.phase,'failed');assert.match(failed.error!,/too large/);
});

// A full disk is the machine's failure, not a file's (review 2026-10-22): the round stops at that file with a plain reason instead of
// marking it and every later file skipped, and 继续整理 goes on from it once there is room.
test('ONB-LIM-07 a full disk stops the round at the file it hit, and continuing reads on from that file with nothing skipped', async t => {
  const dir = await home(t), id = randomUUID();
  withContextJourneys(dir, s => s.create(id));
  selectContextSources(dir, id, { sources: [{ kind: 'browser', selected: true, text: 'unused: readSource answers' }] });
  let full = true;
  const files = () => [{ path: 'a.md', bytes: Buffer.from('# A\n\nFirst fact.') },
    { path: 'b.md', get bytes() { if (full) throw Object.assign(new Error('ENOSPC: no space left on device, write'), { code: 'ENOSPC' }); return Buffer.from('# B\n\nSecond fact.'); } },
    { path: 'c.md', bytes: Buffer.from('# C\n\nThird fact.') }];
  const ports = { ...pagesPorts(dir), readSource: async () => ({ name: 'test', locator: 'upload', files: files() }), model: async () => ({ completeText: async () => '# Work\nFirst fact. [S1]' }) };
  startContextJourney(dir, id, ports);
  const stopped = await waitContextJourney(dir, id);
  assert.equal(stopped.phase, 'failed'); assert.match(stopped.error!, /磁盘空间不足/);
  assert.equal(stopped.sources[0]!.reading?.done, 1, 'the checkpoint stands at the file the disk stopped');
  assert.equal(stopped.sources[0]!.issues, undefined, 'no file is marked skipped for the disk');
  full = false;
  startContextJourney(dir, id, ports);
  const done = await waitContextJourney(dir, id);
  assert.equal(done.phase, 'review', done.error ?? '');
  assert.deepEqual(done.sources[0]!.references!.map(ref => ref.path), ['a.md', 'b.md', 'c.md']);
  assert.deepEqual(done.sources[0]!.issues, []);
});

// Staging of rounds that will not use it goes (user 2026-10-22): a round left unfinished for 30 days, a finished one whose cleanup did
// not go through; a round still within 30 days and a directory that is no round's are left alone, and the idle round asks to choose again.
test('ONB-LIM-09 staging of a round left for 30 days or already finished is removed; a recent round keeps it and an idle one asks to choose again', async t => {
  const dir = await home(t), idle = randomUUID(), done = randomUUID();
  const roundDir = (id: string) => join(dir, 'context-onboarding', 'journeys', id);
  for (const id of [idle, done]) { withContextJourneys(dir, s => s.create(id)); await stageContextFile(dir, id, 'a.md', Buffer.from('# A\n\nFact.')); }
  withContextJourneys(dir, s => s.save({ ...s.get(done), phase: 'complete' }));
  const stranger = join(dir, 'context-onboarding', 'journeys', 'not-a-round'); await mkdir(stranger);
  assert.equal(await removeIdleJourneyStaging(dir), 1, 'only the finished round today');
  await assert.rejects(stat(roundDir(done)), { code: 'ENOENT' });
  assert.ok((await stat(roundDir(idle))).isDirectory(), 'a round within 30 days keeps its files');
  assert.equal(readContextJourney(dir, idle).requires_reselection, undefined);
  assert.equal(await removeIdleJourneyStaging(dir, Date.now() + 31 * 24 * 60 * 60_000), 1);
  await assert.rejects(stat(roundDir(idle)), { code: 'ENOENT' });
  const reopened = readContextJourney(dir, idle);
  assert.equal(reopened.requires_reselection, true); assert.match(reopened.error!, /30 天/);
  assert.ok((await stat(stranger)).isDirectory(), 'a directory that is no round is not this cleanup\'s');
});
