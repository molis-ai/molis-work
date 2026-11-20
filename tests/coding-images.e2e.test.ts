import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";
import { openCoding } from "./fixtures/coding-browser.js";
import { CODING_BOX, CODING_COMPOSER, CODING_COMPOSER_STATUS, CODING_SEND, codingControl } from "./fixtures/coding-composer.js";

// Coding A3 (docs/design/coding-daily-basics scheme A): pictures pasted into the bar while a Coding session is on show sit in the
// composer's row of thumbnails with their size and 「已存一份」; one over 5 MB says so and the line above the box offers to shrink it;
// a model marked as not seeing pictures holds the send until the person switches model or sends the words alone; an unmarked model
// gets them with a note (decision 51). The round names the pictures by the platform's references, never their bytes.

const ROWS = `${CODING_COMPOSER} .mw-composer__files.is-pictures [data-composer-file]`;
const NOTICE = `${CODING_COMPOSER} .mw-composer__notice`;

/** One streamed Anthropic-format model turn of text. */
function turn(text: string): string {
  const events: string[] = [];
  const emit = (type: string, value: object) => events.push(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  emit("message_start", { message: { id: "m", type: "message", role: "assistant", model: "fixture", content: [], stop_reason: null, usage: { input_tokens: 20, output_tokens: 0 } } });
  emit("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  emit("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
  emit("content_block_stop", { index: 0 });
  emit("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  emit("message_stop", {});
  return events.join("");
}

/** A script that pastes or drops a PNG into the box. Noise makes it too large to send. */
const putPicture = (name: string, side: number, noise = false, drop = false) => `(async()=>{const canvas=document.createElement('canvas');canvas.width=${side};canvas.height=${side};
  const g=canvas.getContext('2d');if(${noise}){const data=g.createImageData(${side},${side});crypto.getRandomValues(new Uint8Array(data.data.buffer).subarray(0,65536));
  for(let i=0;i<data.data.length;i+=65536)crypto.getRandomValues(data.data.subarray(i,Math.min(i+65536,data.data.length)));for(let i=3;i<data.data.length;i+=4)data.data[i]=255;g.putImageData(data,0,0);}
  else{g.fillStyle='#4a7';g.fillRect(0,0,${side},${side});g.fillStyle='#fff';g.fillRect(4,4,${side}/2,${side}/3);}
  const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));const dt=new DataTransfer();dt.items.add(new File([blob],${JSON.stringify(name)},{type:'image/png'}));
  document.querySelector(${JSON.stringify(CODING_BOX)}).dispatchEvent(${drop
    ? "new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true})"
    : "new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})"});return blob.size;})()`;

/** A script (the Coding frame) that answers the page's state reads with these models from now on; the seeded Home has none. */
const modelsAre = (models: ReadonlyArray<Record<string, unknown>>) => `(async()=>{const made=posts.find(one=>one.path.endsWith('/api/plugins/io.molis.work.coding/sessions')).path.replace(/\\/sessions$/,'');
  const state=await (await fetch(made+'/state')).json();state.models=${JSON.stringify(models)}.map(one=>({provider_id:'local-only',reasoning_effort:false,...one}));
  for(let i=fakes.length-1;i>=0;i--)if(fakes[i].path==='/api/plugins/io.molis.work.coding/state')fakes.splice(i,1);
  fakes.push({method:'GET',path:'/api/plugins/io.molis.work.coding/state',body:state});})()`;
const UNMARKED = [{ model_id: "fixture", label: "本机 · fixture" }];

test("A3 pictures in Coding's composer: thumbnails, the too-large shrink, the viewer, the model's sight, and a send by reference", { timeout: 300_000 }, async t => {
  const opened = await openCoding(t); if (!opened) return;
  const { owner, evaluate, waitFor, command, sessionId } = opened;
  await opened.start("照这张图改首屏");
  await evaluate(modelsAre(UNMARKED));
  await owner.waitFor(`document.querySelector(${JSON.stringify(codingControl("model"))})?.value.includes('fixture')`, 30_000);
  const shot = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/35-coding-images"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  const rows = () => owner.evaluate<Array<{ state: string; name: string; meta: string; thumb: boolean }>>(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].map(row=>({
    state:row.classList.contains('is-failed')?'failed':row.querySelector('[data-composer-remove]')&&!row.getAttribute('aria-busy')?'attached':'reading',
    name:row.querySelector('.mw-composer__name')?.textContent.trim()??'',meta:row.querySelector('small')?.textContent.trim()??'',thumb:Boolean(row.querySelector('img'))}))`);
  const notice = () => owner.evaluate<{ text: string; buttons: string[] } | null>(`(()=>{const n=document.querySelector(${JSON.stringify(NOTICE)});
    return n?{text:n.querySelector('.mw-composer__notice-text').textContent,buttons:[...n.querySelectorAll('[data-composer-notice]')].map(b=>b.textContent.trim())}:null;})()`);

  // Two screenshots pasted: each kept by the platform, shown as a thumbnail with its size and 「已存一份」.
  await owner.evaluate(putPicture("登录页-现在.png", 64));
  await owner.evaluate(putPicture("登录页-设计稿.png", 80));
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].filter(row=>row.querySelector('small')?.textContent.includes('已存一份')).length===2`, 30_000);
  const kept = await rows();
  assert.deepEqual(kept.map(row => row.thumb), [true, true], "each row shows its picture");
  assert.ok(kept.every(row => / KB · 已存一份$/.test(row.meta)), JSON.stringify(kept));
  const uploads = await evaluate<string[]>(`posts.filter(one=>one.path.endsWith('/attachments')).map(one=>JSON.parse(one.body).name)`);
  assert.deepEqual(uploads, ["登录页-现在.png", "登录页-设计稿.png"]);
  // The seeded model has no mark either way: the pictures go, and the line says it may not see them.
  await owner.waitFor(`document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('可能看不到')`, 15_000);
  assert.deepEqual((await notice())!.buttons, [], "an unmarked model holds nothing");
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(`zh-light-${width}-attached`);
    const spill = await owner.evaluate<boolean>(`(()=>{const list=document.querySelector(${JSON.stringify(`${CODING_COMPOSER} .mw-composer__files`)}),box=document.querySelector(${JSON.stringify(CODING_COMPOSER)}).getBoundingClientRect(),r=list.getBoundingClientRect();return r.left<box.left-1||r.right>box.right+1;})()`);
    assert.equal(spill, false, `${width}: the row of thumbnails stays inside the composer`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // A thumbnail opens larger in the board's dialog, named by the picture; Esc gives the focus back to it.
  await owner.click(`${ROWS}:first-child [data-composer-open]`);
  await owner.waitFor("document.querySelector('dialog.mw-picture')?.open === true", 10_000);
  const dialog = await owner.evaluate<{ title: string; alt: string }>(`(()=>{const d=document.querySelector('dialog.mw-picture');return {title:document.getElementById(d.getAttribute('aria-labelledby'))?.textContent.trim()??'',alt:d.querySelector('img').alt};})()`);
  assert.equal(dialog.title, kept[0]!.name); assert.equal(dialog.alt, kept[0]!.name);
  await shot("zh-light-1440-viewer");
  await owner.evaluate(`document.querySelector('dialog.mw-picture').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));document.querySelector('dialog.mw-picture').close()`);
  await owner.waitFor(`!document.querySelector('dialog.mw-picture') && document.activeElement?.matches('[data-composer-open]')`, 10_000);

  // One over 5 MB: its row says so, the send waits, and 「缩小到 5 MB 内」 puts a smaller copy in its place.
  const size = await owner.evaluate<number>(putPicture("设计稿-首屏.png", 1800, true));
  assert.ok(size > 5 * 1024 * 1024, `the noise picture is ${size} bytes`);
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].some(row=>row.classList.contains('is-failed')&&row.textContent.includes('超过 5 MB'))`, 30_000);
  await owner.waitFor(`document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('超过 5 MB 上限')`, 15_000);
  assert.deepEqual((await notice())!.buttons, ["缩小到 5 MB 内"]);
  assert.equal(await owner.evaluate<boolean>(`Boolean(document.querySelector(${JSON.stringify(`${ROWS}.is-failed img`)}))`), true, "the refused picture shows which it is");
  await shot("zh-light-1440-too-large");
  await owner.click(`${NOTICE} [data-composer-notice]`);
  await owner.waitFor(`!document.querySelector(${JSON.stringify(`${ROWS}.is-failed`)}) && [...document.querySelectorAll(${JSON.stringify(ROWS)})].filter(row=>row.querySelector('small')?.textContent.includes('已存一份')).length===3`, 60_000);
  const shrunk = (await rows())[2]!;
  assert.match(shrunk.meta, /MB · 已存一份$|KB · 已存一份$/);
  const shrunkSize = await evaluate<number>(`(()=>{const one=posts.filter(p=>p.path.endsWith('/attachments')).at(-1);return Math.floor(JSON.parse(one.body).data.length*3/4);})()`);
  assert.ok(shrunkSize <= 5 * 1024 * 1024, `the copy sent is under 5 MB (${shrunkSize})`);

  // A model marked as not seeing pictures: the line says so, offers a model that sees them or the words alone, and the send waits.
  await evaluate(modelsAre([{ model_id: "fixture", label: "本机 · fixture", vision: false }, { model_id: "sighted", label: "本机 · 看得见", vision: true }]));
  await owner.waitFor(`document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('看不到图片')`, 30_000);
  assert.deepEqual((await notice())!.buttons, ["换成能看图的模型", "不带图发"]);
  await shot("zh-light-1440-no-vision");
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).click()`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(CODING_COMPOSER_STATUS)})?.textContent.includes('先选一种')`, 10_000);
  assert.equal((await evaluate<string[]>(`posts.filter(one=>/\\/runs$/.test(one.path)).map(one=>one.path)`)).length, 0, "nothing was sent");
  // 换成能看图的模型 chooses the one marked as seeing them, and the line goes.
  await owner.click(`${NOTICE} [data-composer-notice]:not([data-composer-notice=also])`);
  // (the session is in 「讨论」, so the read-only line is what stays)
  await owner.waitFor(`JSON.parse(document.querySelector(${JSON.stringify(codingControl("model"))}).value)[1]==='sighted' && !document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('看不到图片')`, 10_000);
  // Back on the model that cannot see: 不带图发 sends the words with no picture.
  await owner.evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(codingControl("model"))});s.value=[...s.options].find(o=>!o.value.includes('sighted')).value;s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('看不到图片')`, 10_000);
  await owner.click(`${NOTICE} [data-composer-notice=also]`);
  await owner.waitFor(`!document.querySelector(${JSON.stringify(NOTICE)})?.textContent.includes('看不到图片')`, 10_000);
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).click()`);
  await waitFor(`posts.some(one=>/\\/runs$/.test(one.path))`, 30_000);
  const words = await evaluate<Record<string, unknown>>(`JSON.parse(posts.find(one=>/\\/runs$/.test(one.path)).body)`);
  assert.equal(words.task, "照这张图改首屏");
  assert.equal(words.images, undefined, "不带图发: the round carries no picture");
});

test("A3 B35-R6 a round forwards the exact pasted and dropped pictures and reads both back", { timeout: 300_000 }, async t => {
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const prior = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = prior; resetSecretStoreCache(); });
  // A local model with no mark either way (decision 51: it is sent the pictures); it answers each call with one line.
  const calls: string[] = [];
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8");
    const aside = asideReply(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (aside) { res.end(turn(aside)); return; }
    calls.push(raw);
    res.end(turn("看到了首屏，按图改。"));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve));
  t.after(async () => { model.closeAllConnections(); await new Promise<void>(resolve => model.close(() => resolve())); });
  const address = model.address(); assert.ok(address && typeof address !== "string");
  const prepareHome = async (homeDirectory: string) => {
    await runWithMolisWorkHome(homeDirectory, () => withMolisWorkProjectCatalog({ homeDirectory }, catalog => {
      const connection = withConnectorConnections(homeDirectory, store => { const created = store.createToken({ serviceId: "model-api", displayName: "local-only", token: "fixture-local-model-key" }); store.assertTarget(created.connection_id, "model-api", `http://127.0.0.1:${address.port}`); return created; });
      catalog.models.upsert({ credential_ref: connection.credential_ref!, provider_id: "local-only", display_name: "本机", base_url: `http://127.0.0.1:${address.port}`, api_format: "anthropic-messages",
        models: [{ model_id: "fixture-plain", enabled: true }] });
    }));
  };
  const opened = await openCoding(t, "", prepareHome); if (!opened) return;
  const { owner, evaluate, waitFor } = opened;
  await opened.start("照这张图改首屏");
  await owner.waitFor(`document.querySelector(${JSON.stringify(codingControl("model"))})?.value.includes('fixture-plain')`, 30_000);
  await owner.evaluate(putPicture("首屏.png", 48));
  await owner.evaluate(putPicture("参考稿.png", 96, false, true));
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(ROWS)})].filter(row=>row.querySelector('small')?.textContent.includes('已存一份')).length===2`, 30_000);
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).click()`);
  await waitFor(`posts.some(one=>/\\/runs$/.test(one.path))`, 30_000);
  const body = await evaluate<{ images: Array<{ title: string; media_type: string; attachment: { subject: { kind: string }; pin: { read_revision: string } } }> }>(`JSON.parse(posts.find(one=>/\\/runs$/.test(one.path)).body)`);
  assert.deepEqual(body.images.map(image => image.title), ["首屏.png", "参考稿.png"]);
  assert.ok(body.images.every(image => image.media_type === "image/png" && image.attachment.subject.kind === "conversation_attachment" && !("data" in image)));
  assert.ok(!JSON.stringify(body).includes("data:image"), "no bytes in the round's request");
  await waitFor(`document.querySelectorAll('.coding-turn[data-kind=user] .coding-turn__pictures .coding-turn__picture img').length===2`, 60_000);
  const first = JSON.parse(calls[0] ?? "{}") as { messages?: Array<{ content?: unknown }> };
  const blocks = (first.messages ?? []).flatMap(message => Array.isArray(message.content) ? message.content as Array<{ type?: string; source?: { media_type?: string; data?: string } }> : []);
  const actual = blocks.filter(block => block.type === "image" && block.source?.media_type === "image/png" && block.source.data)
    .map(block => createHash("sha256").update(Buffer.from(block.source!.data!, "base64")).digest("hex"));
  assert.deepEqual(actual, body.images.map(image => image.attachment.pin.read_revision), "the model gets the platform's exact bytes");
  // The round's first message shows the picture, read back from the platform; it opens in the same dialog.
  assert.equal(await evaluate<string>(`document.querySelector('.coding-turn__picture').getAttribute('aria-label')`), "放大看 " + body.images[0]!.title);
  await evaluate(`document.querySelector('.coding-turn__picture').click()`);
  await waitFor(`document.querySelector('dialog.mw-picture')?.open === true`, 10_000);
});
