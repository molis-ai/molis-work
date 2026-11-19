import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { asideReply } from "./fixtures/ending-review.js";
import { openCoding } from "./fixtures/coding-browser.js";
import { CODING_BOX, CODING_COMPOSER, CODING_SEND, codingControl } from "./fixtures/coding-composer.js";

// Coding A2 (docs/design/coding-daily-basics scheme A): typing / lists every command in three groups — built-in, this project's
// (.molis/commands, .claude/commands read too) and the person's own; a file that cannot be read is listed and marked, the others
// still work. A chosen command sits at the start of the box as a chip: what is typed after it is the argument, the whole prompt it
// makes can be opened under the box, and the round's task is that prompt.

const MENU = `${CODING_COMPOSER} .mw-compose__menu:not([hidden]) .mw-menu`;

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

test("Coding A2 the / menu groups the project's and the person's commands; a chosen one is a chip whose prompt is the round's task", { timeout: 300_000 }, async t => {
  // The person's own commands, in a home directory of the test's own (never the real one).
  const home = await mkdtemp(join(tmpdir(), "coding-commands-home-"));
  t.after(() => rm(home, { recursive: true, force: true }));
  await mkdir(join(home, ".claude", "commands"), { recursive: true });
  await writeFile(join(home, ".claude", "commands", "review-ui.md"), "---\ndescription: 按 DESIGN.md 看一遍界面\n---\n按 DESIGN.md 看一遍界面，列出不一致的地方。");
  // A local model, so the round really starts; the task it is given is the command's prompt.
  const { withMolisWorkProjectCatalog } = await import("@molis-ai/molis-work-app-desktop");
  const { runWithMolisWorkHome, resetSecretStoreCache } = await import("@molis-ai/molis-work-storage");
  const backend = process.env.MOLIS_WORK_SECRET_BACKEND; process.env.MOLIS_WORK_SECRET_BACKEND = "file";
  t.after(() => { if (backend === undefined) delete process.env.MOLIS_WORK_SECRET_BACKEND; else process.env.MOLIS_WORK_SECRET_BACKEND = backend; resetSecretStoreCache(); });
  const calls: string[] = [];
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString("utf8"), aside = asideReply(raw);
    res.writeHead(200, { "content-type": "text/event-stream" });
    if (aside) { res.end(turn(aside)); return; }
    calls.push(raw); res.end(turn("补好了。"));
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
  // Set once the browser is up (it is started with the real one); the Host reads the person's commands from here on.
  const prior = process.env.HOME; process.env.HOME = home;
  t.after(() => { if (prior === undefined) delete process.env.HOME; else process.env.HOME = prior; });
  const { owner, evaluate, waitFor, command, sessionId, homeDirectory, type } = opened;
  /** Types `text` into the bar's box one character at a time, as a keyboard does (the composer opens / on the typed character). */
  const keys = async (text: string) => {
    for (const one of text) await owner.evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(CODING_BOX)});node.focus();node.setRangeText(${JSON.stringify(one)},node.selectionStart,node.selectionEnd,'end');
      node.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:${JSON.stringify(one)}}));})()`);
  };
  const shot = async (name: string) => {
    const directory = join(process.cwd(), ".impeccable/qa/review/35-coding-commands"); await mkdir(directory, { recursive: true });
    const image = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(join(directory, `${name}.png`), Buffer.from(image.data, "base64"));
  };
  await opened.start("");
  await owner.waitFor(`document.querySelector(${JSON.stringify(codingControl("model"))})?.value.includes('fixture-plain')`, 30_000);

  // The project's commands, added while the session is open: typing / reads them again.
  const commands = join(homeDirectory, "coding-first-read", ".molis", "commands");
  await mkdir(commands, { recursive: true });
  await writeFile(join(commands, "补测试.md"), "---\ndescription: 给一个文件补测试\nargument-hint: 文件\nallowed-tools: Bash(rm:*)\n---\n给 $ARGUMENTS 补测试：覆盖每个分支和空状态；跑 pnpm test，不改被测代码。");
  await writeFile(join(commands, "发版检查.md"), "---\ndescription: 发版前检查一遍\n");
  await new Promise(resolve => setTimeout(resolve, 3_100));
  await type("");
  await keys("/");
  const menu = () => owner.evaluate<{ groups: string[]; rows: Array<{ name: string; hint: string; badge: string }>; note: string } | null>(`(()=>{const m=document.querySelector(${JSON.stringify(MENU)});if(!m)return null;
    return {groups:[...m.querySelectorAll('.mw-menu__label')].map(n=>n.textContent.trim()),rows:[...m.querySelectorAll('[data-composer-command]')].map(r=>({name:r.querySelector('.mw-menu__shortcut')?.textContent.trim()??'',
      hint:r.querySelector('.mw-menu__desc')?.textContent.trim()??'',badge:r.querySelector('.mw-badge')?.textContent.trim()??''})),note:m.querySelector('.mw-composer__menu-note')?.textContent.trim()??''};})()`);
  // Read again when / is typed: the menu, open, is drawn again with them.
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command] .mw-menu__shortcut`)})].some(n=>n.textContent==='/补测试')`, 15_000);
  const shown = (await menu())!;
  assert.deepEqual(shown.groups, ["内置", "这个项目的 · .molis/commands", "我的 · 所有项目"]);
  const row = (name: string) => shown.rows.find(one => one.name === name);
  assert.ok(row("/new"), `the built-in commands are listed first: ${JSON.stringify(shown.rows)}`);
  assert.deepEqual(row("/补测试"), { name: "/补测试", hint: "要一个参数：文件", badge: "" }, JSON.stringify(shown));
  assert.deepEqual(row("/发版检查"), { name: "/发版检查", hint: "读不了：开头的设置写错了（缺结尾的 ---）", badge: "读不了" });
  assert.deepEqual(row("/review-ui"), { name: "/review-ui", hint: "也读 .claude/commands", badge: "" });
  assert.equal(shown.note, "命令只是一段提示文字，不带任何权限。同名时项目的优先。");
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(`zh-light-${width}-menu`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // 补测试: its chip at the start of the box; what is typed after it is the argument, and the prompt under the box follows it.
  await type("");
  await keys("/补测");
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command]`)})].length===1`, 10_000);
  await owner.click(`${MENU} [data-composer-command]`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)})?.textContent.includes('/补测试')`, 10_000);
  assert.equal(await owner.evaluate<string>(`document.querySelector(${JSON.stringify(CODING_BOX)}).value`), "", "the /words are taken out of the box");
  assert.equal(await owner.evaluate<string>(`(()=>{const chip=document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)});return chip.className+'|'+chip.nextElementSibling?.className+'|'+chip.querySelector('[data-command-remove]').getAttribute('aria-label');})()`),
    "mw-cmdchip|mw-composer__text|去掉 /补测试", "the board's chip, above the words, its × naming the command");
  assert.equal(await owner.evaluate<boolean>(`!document.querySelector(${JSON.stringify(CODING_SEND)}).disabled`), true, "a command alone can be sent");
  await type("src/components/Hero.tsx");
  const filled = "给 src/components/Hero.tsx 补测试：覆盖每个分支和空状态；跑 pnpm test，不改被测代码。";
  await owner.waitFor(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-prompt] > pre`)})?.textContent===${JSON.stringify(filled)}`, 10_000);
  await owner.click(`${CODING_COMPOSER} [data-composer-prompt] > summary`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-prompt]`)}).open`, 5_000);
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await command("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 }, sessionId);
    await new Promise(resolve => setTimeout(resolve, 300));
    await shot(`zh-light-${width}-chip`);
    const spill = await owner.evaluate<boolean>(`(()=>{const chip=document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)}).getBoundingClientRect(),box=document.querySelector(${JSON.stringify(`${CODING_COMPOSER} .mw-composer__box`)}).getBoundingClientRect();return chip.right>box.right+1;})()`);
    assert.equal(spill, false, `${width}: the chip stays inside the box`);
  }
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);

  // Sent: the round's task is the filled prompt, and nothing from the file's front matter goes with it; the chip goes.
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).click()`);
  await waitFor(`posts.some(one=>/\\/runs$/.test(one.path))`, 30_000);
  const body = await evaluate<Record<string, unknown>>(`JSON.parse(posts.find(one=>/\\/runs$/.test(one.path)).body)`);
  assert.equal(body.task, filled);
  assert.ok(!JSON.stringify(body).includes("Bash(rm"), "the file's allowed-tools are not read");
  await owner.waitFor(`!document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)})`, 10_000);
  await waitFor(`document.querySelector('.coding-turn[data-kind=user]')?.textContent.includes('给 src/components/Hero.tsx 补测试')`, 60_000);
  assert.ok(calls.some(raw => raw.includes("给 src/components/Hero.tsx 补测试")), "the model is given the command's prompt");

  // ⌫ in an empty box takes a chosen command off again.
  await type("");
  await keys("/review-ui");
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command] .mw-menu__shortcut`)})].some(n=>n.textContent==='/review-ui')`, 10_000);
  await owner.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command]`)})].find(r=>r.querySelector('.mw-menu__shortcut')?.textContent==='/review-ui').click()`);
  await owner.waitFor(`Boolean(document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)}))`, 10_000);
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_BOX)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}))`);
  await owner.waitFor(`!document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)})`, 10_000);

  // A1 /init: a built-in prompt command. It takes the first way of working that writes, so its draft reaches the repository only
  // through the review card; the round's task is the drafting prompt, shown under the words before it goes.
  // The first round has ended (its pill goes): /init is not offered while one runs.
  await waitFor(`document.querySelector('[data-coding-phase]')?.hidden===true`, 60_000);
  await type("");
  await keys("/init");
  await owner.waitFor(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command] .mw-menu__shortcut`)})].some(n=>n.textContent==='/init')`, 10_000);
  const init = await owner.evaluate<{ hint: string; group: string; disabled: boolean }>(`(()=>{const r=[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command]`)})].find(r=>r.querySelector('.mw-menu__shortcut')?.textContent==='/init');
    return {hint:r.querySelector('.mw-menu__desc')?.textContent.trim()??'',group:r.closest('.mw-menu__group')?.querySelector('.mw-menu__label')?.textContent.trim()??'',disabled:r.matches(':disabled,[aria-disabled=true]')};})()`);
  assert.deepEqual(init, { hint: "读仓库后起草；写进仓库前先给你审", group: "内置", disabled: false });
  const before = await evaluate<number>(`posts.filter(one=>/\\/runs$/.test(one.path)).length`);
  await owner.evaluate(`[...document.querySelectorAll(${JSON.stringify(`${MENU} [data-composer-command]`)})].find(r=>r.querySelector('.mw-menu__shortcut')?.textContent==='/init').click()`);
  await owner.waitFor(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip]`)})?.textContent.includes('/init')`, 10_000);
  assert.match(await owner.evaluate<string>(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-chip] .mw-cmdchip__source`)}).textContent`), /^内置$/);
  const intent = await owner.evaluate<string>(`document.querySelector(${JSON.stringify(codingControl("intent"))}).value`);
  assert.ok(["execute", "edit"].includes(intent), `/init takes a way of working that writes: ${intent}`);
  assert.match(await owner.evaluate<string>(`document.querySelector(${JSON.stringify(`${CODING_COMPOSER} [data-composer-prompt] > pre`)}).textContent`), /^读这个仓库，在工作区根目录起草一份 AGENTS\.md/);
  await owner.evaluate(`document.querySelector(${JSON.stringify(CODING_SEND)}).click()`);
  await waitFor(`posts.filter(one=>/\\/runs$/.test(one.path)).length>${before}`, 30_000);
  const drafted = await evaluate<Record<string, unknown>>(`JSON.parse(posts.filter(one=>/\\/runs$/.test(one.path)).at(-1).body)`);
  assert.equal(drafted.intent, intent);
  assert.match(String(drafted.task), /^读这个仓库，在工作区根目录起草一份 AGENTS\.md[\s\S]*写进仓库之前会先给人审。$/);
});
