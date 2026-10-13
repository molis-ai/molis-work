import assert from "node:assert/strict";
import test from "node:test";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openPagesStore } from "@molis-ai/molis-work-plugin-pages";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

type Browser = NonNullable<Awaited<ReturnType<typeof openGoalBrowser>>>;
type Download = { name: string; content: string };
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const open = async (b: Browser, plugin: string, id: string) => {
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?openPlugin=${plugin}&${plugin === 'form' ? 'openRecord' : 'openItem'}=${id}` }, b.sessionId));
  await b.waitFor(`document.querySelector('[data-${plugin}=workbench]')?.dataset.expanded === 'true'`);
};
// Capture only the download sink: the page still creates its actual Blob and runs its own export/submit handler.
const captureDownloads = (b: Browser) => b.evaluate(`(() => { const urls=new Map();window.contentDownloads=[];const create=URL.createObjectURL,click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{const url=create.call(URL,blob);urls.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){if(!this.download)return click.call(this);const file={name:this.download,content:null};window.contentDownloads.push(file);urls.get(this.href).text().then(text=>file.content=text);};window.restoreContentDownloads=()=>{URL.createObjectURL=create;HTMLAnchorElement.prototype.click=click;};})()`);
const downloads = (b: Browser) => b.evaluate<Download[]>("window.contentDownloads");
async function assertQuestionNames(b: Browser) {
  const { nodes } = await b.command<{ nodes: { ignored: boolean; role?: { value: string }; name?: { value: string }; properties?: { name: string; value: { value: unknown } }[] }[] }>("Accessibility.getFullAXTree", {}, b.sessionId);
  const active = nodes.filter(node => !node.ignored);
  for (const [role, name] of [["textbox", "Required words"], ["combobox", "Choose team"], ["radiogroup", "Choose one"], ["group", "Choose several"]] as const) {
    const question = active.find(node => node.role?.value === role && node.name?.value.includes(name));
    assert.ok(question, `${role}: ${name}`);
    if (role !== "group") assert.ok(question.properties?.some(property => property.name === "required" && property.value.value === true), `${name}: required`);
  }
}

test("W2-18-FORM-ANSWER-01 / W2-18-FORM-LABEL-01: exported HTML creates an importable 4000 answer once; oversized text/multichoice retain input without a file, with browser question names", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const store = openFormStore(b.homeDirectory);
  const form = (() => { try { return store.receive(b.projectId!, "portable-form", "Portable answers", [
    { id: "words", title: "Required words", type: "text", required: true },
    { id: "one", title: "Choose one", type: "singleChoice", required: true, options: [{ id: "a", label: "Alpha" }, { id: "b", label: "Beta" }] },
    { id: "several", title: "Choose several", type: "multiChoice", options: Array.from({ length: 21 }, (_, index) => ({ id: `o${index}`, label: String(index).padStart(2, "0") + "x".repeat(198) })) },
    { id: "team", title: "Choose team", type: "dropdown", required: true, options: [{ id: "a", label: "Design" }, { id: "b", label: "Engineering" }] },
    { id: "date", title: "Answer date", type: "date", required: true },
  ]); } finally { store.close(); } })();
  await open(b, "form", form.id); await b.click('[data-form-tab="preview"]');
  await assertQuestionNames(b);
  await b.click('[data-form-preview] [data-answer-id="words"]');
  await b.command("Input.insertText", { text: "Keyboard answer" }, b.sessionId);
  assert.equal(await b.evaluate('document.querySelector(\'[data-form-preview] [data-answer-id="words"]\').value'), "Keyboard answer");
  await captureDownloads(b); await b.click("[data-form-export-fill]");
  await b.waitFor("window.contentDownloads[0]?.content");
  const html = (await downloads(b))[0]!.content;
  await b.navigate(() => b.command("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) }, b.sessionId));
  await b.waitFor("document.querySelector('#qs input[name=words]')"); await captureDownloads(b);
  await assertQuestionNames(b);
  await b.click('input[name="words"]'); await b.command("Input.insertText", { text: "Keyboard offline" }, b.sessionId);
  assert.equal(await b.evaluate('document.querySelector(\'input[name="words"]\').value'), "Keyboard offline");
  await b.evaluate(`(() => { document.querySelector('input[name=one]').checked=true;document.querySelector('select[name=team]').value='Design';document.querySelector('input[name=date]').value='2026-11-03';document.querySelector('input[name=words]').value='';document.querySelector('#f').requestSubmit(); })()`);
  assert.match(await b.evaluate<string>("document.querySelector('#e').textContent"), /Required words/);
  assert.equal((await downloads(b)).length, 0);
  await b.evaluate(`(() => { document.querySelector('input[name=words]').value='x'.repeat(4001);document.querySelector('#f').requestSubmit(); })()`);
  assert.match(await b.evaluate<string>("document.querySelector('#e').textContent"), /4000/);
  assert.equal(await b.evaluate("document.querySelector('input[name=words]').value.length"), 4001);
  assert.equal((await downloads(b)).length, 0);
  await b.evaluate(`(() => { document.querySelector('input[name=words]').value='x'.repeat(4000);document.querySelectorAll('input[name=several]').forEach(input=>input.checked=true);document.querySelector('#f').requestSubmit(); })()`);
  assert.match(await b.evaluate<string>("document.querySelector('#e').textContent"), /Choose several/);
  assert.equal((await downloads(b)).length, 0);
  await b.evaluate(`(() => { document.querySelectorAll('input[name=several]').forEach((input,index)=>input.checked=index<2);document.querySelector('#f').requestSubmit(); })()`);
  await b.waitFor("window.contentDownloads[0]?.content && document.querySelector('#ok').classList.contains('on')");
  const answer = (await downloads(b))[0]!;
  const parsed = JSON.parse(answer.content) as { answers: Record<string, string> };
  assert.equal(parsed.answers.words, "x".repeat(4000)); assert.equal(parsed.answers.date, "2026-11-03"); assert.equal(parsed.answers.one, "Alpha"); assert.equal(parsed.answers.team, "Design");
  await open(b, "form", form.id); await b.click('[data-form-tab="results"]');
  const importAnswer = () => b.evaluate(`(() => { const data=new DataTransfer();data.items.add(new File([${JSON.stringify(answer.content)}],${JSON.stringify(answer.name)},{type:'application/json'}));const input=document.querySelector('[data-form-import-files]');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true})); })()`);
  await importAnswer(); await b.waitFor("document.querySelector('[data-form-note]').textContent.includes('导入 1 份')");
  await importAnswer(); await b.waitFor("document.querySelector('[data-form-note]').textContent.includes('已导入过')");
  const after = openFormStore(b.homeDirectory);
  try { const submissions = after.listSubmissions(form.id, b.projectId!); assert.equal(submissions.length, 1); assert.deepEqual(submissions[0]!.answers, parsed.answers); } finally { after.close(); }
});

test("W2-18-PAGES-EXPORT-01: real Markdown/HTML download and print-frame document preserve independent rich facts", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, null); if (!b) return;
  const store = openPagesStore(b.homeDirectory);
  const page = (() => { try { return store.create({ project_id: b.projectId!, title: "Rich portable page", body: { type: "doc", content: [
    { type: "table", content: [{ type: "table_row", content: [{ type: "table_cell", content: [paragraph("Cell first"), paragraph("Cell second")] }] }] },
    { type: "task_card", attrs: { title: "Call Alice", description: "Keep details", status: "doing", due: "2026-11-03" } },
    { type: "event_card", attrs: { title: "Launch meeting", at: "2026-11-05" } },
    { type: "page_ref", attrs: { title: "Source page", page_id: "source" } },
    { type: "paragraph", content: [{ type: "page_mention", attrs: { title: "Another page", page_id: "another" } }] },
  ] } }); } finally { store.close(); } })();
  await open(b, "pages", page.id); await captureDownloads(b);
  for (const format of ["md", "html"]) { await b.click("[data-pages-more]"); await b.click(`[data-pages-export="${format}"]`); }
  await b.waitFor("window.contentDownloads.length===2 && window.contentDownloads.every(file=>file.content)");
  const expected = ["Cell first", "Cell second", "Call Alice", "Keep details", "进行中", "2026-11-03", "Launch meeting", "2026-11-05", "Source page", "Another page"];
  const exported = await downloads(b);
  for (const file of exported) for (const fact of expected) assert.ok(file.content.includes(fact), `${file.name}: ${fact}`);
  assert.match(exported.find(file => file.name.endsWith(".md"))!.content, /Cell first<br>Cell second/);
  // Intercept the native print dialog after the actual iframe has loaded, and inspect the document passed to it.
  await b.evaluate(`(() => { const append=Element.prototype.append;Element.prototype.append=function(...nodes){for(const node of nodes)if(node instanceof HTMLIFrameElement)node.addEventListener('load',()=>{node.contentWindow.print=()=>window.contentPrint=node.contentDocument.body.innerText;},{once:true});return append.apply(this,nodes);};window.restoreContentPrint=()=>Element.prototype.append=append;})()`);
  await b.click("[data-pages-more]"); await b.click("[data-pages-print]"); await b.waitFor("window.contentPrint");
  const printed = await b.evaluate<string>("window.contentPrint");
  for (const fact of expected) assert.ok(printed.includes(fact), `print frame: ${fact}`);
  await b.evaluate("window.restoreContentDownloads();window.restoreContentPrint()");
  const after = openPagesStore(b.homeDirectory); try { assert.deepEqual(after.get(page.id, b.projectId!), page); } finally { after.close(); }
});

test("W2-18-PAGES-SOURCES-01: actual multi-selection focus and Host prepare keep the 1500 prefixes marked as excerpts", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, true, undefined, async () => "# Combined\nAdopted evidence."); if (!b) return;
  const store = openPagesStore(b.homeDirectory);
  const pages = (() => { try { return ["A", "B"].map(letter => store.create({ project_id: b.projectId!, title: `Page ${letter}`, body: { type: "doc", content: [paragraph(`Prefix ${letter} ` + letter.repeat(1700) + ` OMITTED_${letter}`)] } })); } finally { store.close(); } })();
  await open(b, "pages", pages[0]!.id);
  await b.evaluate(`(() => { document.addEventListener('molis:surface-focus',event=>window.contentObjectsFocus=event.detail);document.querySelector('button[data-page-id="${pages[1]!.id}"]').dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}));})()`);
  await b.waitFor("window.contentObjectsFocus?.granularity==='objects'");
  const focus = await b.evaluate<SurfaceFocus>("window.contentObjectsFocus");
  assert.equal(focus.targets.length, 2);
  for (const target of focus.targets) { assert.equal(target.text.length, 1500); assert.equal(target.truncated, true); assert.doesNotMatch(target.text, /OMITTED_/); }
  const prepared = await b.evaluate<{ input: { inputs: { body: string; provenance: { truncated: boolean; snapshot_scope: string; id: string }[] }[] } }>(`(async()=>{const request={pane_id:'content-sources',focus:window.contentObjectsFocus};const post=async(path,body)=>{const response=await fetch('/projects/${b.projectId}/api/contextual/'+path,{method:'POST',headers:molisWorkControlHeaders(),body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw Error(JSON.stringify(result));return result;};const candidates=await post('candidates',request);const candidate=candidates.plan.candidates.find(item=>item.offer_id==='synthesize');if(!candidate)throw Error('Missing actual synthesis offer');return post('prepare',{...request,key:candidate.key,request_id:'content-sources-confirmed'});})()`);
  assert.equal(prepared.input.inputs.length, 2);
  for (const source of prepared.input.inputs) { assert.equal(source.provenance[0]!.truncated, true); assert.equal(source.provenance[0]!.snapshot_scope, "selection"); assert.ok(pages.some(page => page.id === source.provenance[0]!.id)); assert.doesNotMatch(source.body, /OMITTED_/); }
  const after = openPagesStore(b.homeDirectory); try { for (const page of pages) assert.deepEqual(after.get(page.id, b.projectId!), page); assert.equal(after.list(b.projectId!).length, 2); } finally { after.close(); }
});
