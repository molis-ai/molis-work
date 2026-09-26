import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { clearShelfRuntimeCache, openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Shelf DropAgent parity: full copies, reading, comparison, actions and client bridges", { timeout: 180_000 }, async (t) => {
  const bin = await mkdtemp(join(tmpdir(), "shelf-parity-agent-"));
  const previous = { agent: process.env.MOLIS_WORK_SHELF_AGENT, path: process.env.MOLIS_WORK_SHELF_AGENT_PATH };
  // The only executable selected by either the HTTP host or the explicit store
  // is this shell fixture. It writes the recipe's expected result in its workdir.
  await writeFile(join(bin, "claude"), `#!/bin/sh
if [ "$1" = "--help" ]; then
  printf '%s\\n' 'Usage: claude [options] [prompt]' '  --print Print response and exit'
  exit 0
fi
printf '%s\\n' '# 合稿' '' '两份材料经过受控执行，来源可切换。' > brief.md
`);
  await chmod(join(bin, "claude"), 0o755);
  process.env.MOLIS_WORK_SHELF_AGENT = "claude";
  process.env.MOLIS_WORK_SHELF_AGENT_PATH = bin;
  clearShelfRuntimeCache();
  t.after(async () => {
    if (previous.agent === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT;
    else process.env.MOLIS_WORK_SHELF_AGENT = previous.agent;
    if (previous.path === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT_PATH;
    else process.env.MOLIS_WORK_SHELF_AGENT_PATH = previous.path;
    clearShelfRuntimeCache();
    await rm(bin, { recursive: true, force: true });
  });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId, homeDirectory } = browser;
  const shelf = openShelfStore(homeDirectory, { pathEnvironment: bin, home: homeDirectory, preferred: "claude" });
  assert.equal(shelf.runtime().executable, join(bin, "claude"));
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=shelf]')");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-item]')", 8_000);

  const row = (id: string) => `[data-shelf-list=materials] [data-shelf-item="${id}"]`;
  const select = async (id: string) => {
    await click(row(id));
    await waitFor(`document.querySelector(${JSON.stringify(row(id))})?.classList.contains('is-on')`);
  };
  const refresh = async () => {
    await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-refresh'))");
  };
  const admit = async (filename: string, text: string, mime = "text/markdown") => {
    const item = await evaluate<{ item_id: string; relative_path: string }>(`(async () => {
      const response = await fetch('/api/shelf/items', { method: 'POST', headers: molisWorkControlHeaders(),
        body: JSON.stringify({ filename: ${JSON.stringify(filename)}, bytes_base64: ${JSON.stringify(Buffer.from(text).toString("base64"))}, mime: ${JSON.stringify(mime)} }) });
      const body = await response.json(); if (!response.ok) throw new Error(JSON.stringify(body)); return body.item;
    })()`);
    await refresh();
    await waitFor(`document.querySelector(${JSON.stringify(row(item.item_id))})`, 8_000);
    return item;
  };
  const editAppend = async (suffix: string) => {
    await evaluate(`(() => { const editor=document.querySelector('[data-shelf-editor]');
      editor.value += ${JSON.stringify(suffix)}; editor.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  };

  await t.test("the browser file picker imports bytes from a real local file before resetting the input", async () => {
    await evaluate(`window.parityPickerClicks=0; window.parityPreventPicker=(event)=>{event.preventDefault();window.parityPickerClicks+=1;};
      document.querySelector('[data-shelf-file]').addEventListener('click',window.parityPreventPicker);`);
    await click("[data-shelf=directory] [data-shelf-pick]");
    assert.equal(await evaluate("window.parityPickerClicks"), 1, "directory click must open the picker once despite the enclosing workbench");
    await evaluate(`document.querySelector('[data-shelf=directory] [data-shelf-pick]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));`);
    assert.equal(await evaluate("window.parityPickerClicks"), 2, "keyboard activation must also open the picker only once");
    await evaluate("document.querySelector('[data-shelf-file]').removeEventListener('click',window.parityPreventPicker)");
    const filename = "选择器导入.md";
    const file = join(homeDirectory, filename);
    const text = "# 真实文件选择器\n" + "通过 File.arrayBuffer 读入完整本地副本。\n".repeat(1200) + "PICKER_END_SENTINEL\n";
    await writeFile(file, text);
    const document = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const input = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: document.root.nodeId, selector: "[data-shelf-file]" }, sessionId);
    assert.ok(input.nodeId);
    // CDP supplies a real disk file to Chrome's native FileList; this does not
    // construct a synthetic File or call the Shelf admission API directly.
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, sessionId);
    await waitFor(`document.querySelector('[data-shelf-item][data-shelf-name="${filename}"]') && document.querySelector('[data-shelf-file]').value === ''`, 8_000);
    const item = shelf.snapshot().materials.find(item => item.name === filename);
    assert.ok(item);
    assert.equal(shelf.readFile(item.item_id).bytes.toString("utf8"), text);
    assert.equal(await evaluate(`document.querySelector('[data-shelf-item][data-shelf-name="${filename}"]').classList.contains('is-on')`), true);
    await waitFor("document.querySelector('[data-shelf-preview]').textContent.includes('PICKER_END_SENTINEL')");
  });

  const markdown = ["# 完整长文", "", "| 名称 | 状态 |", "| --- | --- |", "| 一骏 | 待处理 |", "", "```js", "const safe = '<script>window.parityInjected = true</script>';", "```", "", "<img src=x onerror=\"window.parityInjected=true\">", "[危险链接](javascript:alert(1))", "", ...Array.from({ length: 900 }, (_, i) => `第 ${i} 段：完整副本中的正文应在编辑与保存之后继续保留。`), "", "MARKDOWN_END_SENTINEL"].join("\n");
  const code = Array.from({ length: 950 }, (_, i) => `export const value${i} = '完整代码-${i}';`).join("\n") + "\n// CODE_END_SENTINEL\n";
  assert.ok(markdown.length > 20_000 && code.length > 20_000);
  const first = await admit("完整长文.md", markdown);
  const second = await admit("完整代码.ts", code, "text/plain");
  const json = await admit("结构.json", '{"team":"一骏","items":[1,2],"safe":"<script>not executable</script>"}', "application/json");
  const broken = await admit("无法读取.md", "# 无法读取\n这份副本将被移除，以验证实际 HTTP 读取失败。");

  await t.test("long Markdown and code edits load and save the entire copy; failed reads stay out of edit mode", async () => {
    for (const [item, original, sentinel] of [[first, markdown, "MARKDOWN_END_SENTINEL"], [second, code, "CODE_END_SENTINEL"]] as const) {
      await select(item.item_id);
      await click("[data-shelf-edit]");
      await waitFor("document.querySelector('[data-shelf-editor]')");
      assert.equal(await evaluate("document.querySelector('[data-shelf-editor]').value"), original);
      const suffix = "\n已修改且保留全文。";
      await editAppend(suffix);
      await click("[data-shelf-edit]");
      await waitFor("!document.querySelector('[data-shelf-editor]')");
      const saved = shelf.readFile(item.item_id).bytes.toString("utf8");
      assert.equal(saved, original + suffix);
      assert.ok(saved.includes(sentinel));
    }
    await unlink(join(shelf.root, broken.relative_path));
    await select(broken.item_id);
    await click("[data-shelf-edit]");
    await waitFor("document.querySelector('[data-shelf-bar-hint]')?.textContent.includes('无法读取这份副本') && !document.querySelector('[data-shelf-edit]').disabled");
    assert.equal(await evaluate("document.querySelector('[data-shelf-editor]')"), null);
    assert.equal(await evaluate("document.querySelector('[data-shelf-edit]').textContent"), "编辑副本");
    const failedRead = await fetch(`${origin}/api/shelf/items/${broken.item_id}/file`);
    assert.equal(failedRead.status, 400);
    await failedRead.text();
  });

  await t.test("Markdown renders heading, table and fenced code without activating HTML; JSON is formatted", async () => {
    await select(first.item_id);
    await waitFor("document.querySelector('.shelf-reading h1') && document.querySelector('.shelf-reading table') && document.querySelector('.shelf-reading pre code')");
    assert.equal(await evaluate("document.querySelector('.shelf-reading h1').textContent"), "完整长文");
    assert.equal(await evaluate("document.querySelector('.shelf-reading tbody td').textContent"), "一骏");
    assert.match(await evaluate<string>("document.querySelector('.shelf-reading pre code').textContent"), /<script>window.parityInjected/);
    assert.equal(await evaluate("document.querySelector('.shelf-reading script, .shelf-reading img, .shelf-reading a[href^=\"javascript:\"]')"), null);
    assert.equal(await evaluate("Boolean(window.parityInjected)"), false);
    await select(json.item_id);
    await waitFor("document.querySelector('.shelf-reading pre code')");
    assert.equal(await evaluate("document.querySelector('.shelf-reading pre code').textContent"), JSON.stringify({ team: "一骏", items: [1, 2], safe: "<script>not executable</script>" }, null, 2));
  });

  const outcome = await shelf.runJob({ recipe: "combine", item_ids: [first.item_id, second.item_id] });
  assert.equal(outcome.job.status, "succeeded");
  assert.ok(outcome.result);
  assert.deepEqual(outcome.result.source_item_ids, [first.item_id, second.item_id]);
  await refresh();
  const resultRow = `[data-shelf-list=results] [data-shelf-item="${outcome.result.item_id}"]`;
  await waitFor(`document.querySelector(${JSON.stringify(resultRow)})`, 8_000);

  await t.test("a real controlled combine result compares both sources in light, dark and narrow layouts", async () => {
    await click(resultRow);
    await click("[data-shelf-compare]");
    await waitFor("document.querySelectorAll('[data-shelf-source]').length === 2");
    await click(`[data-shelf-source="${first.item_id}"]`);
    await waitFor("document.querySelector('[data-shelf-compare-pane=source]').textContent.includes('MARKDOWN_END_SENTINEL')");
    assert.match(await evaluate<string>("document.querySelector('[data-shelf-compare-pane=result]').textContent"), /两份材料经过受控执行/);
    await click(`[data-shelf-source="${second.item_id}"]`);
    await waitFor("document.querySelector('[data-shelf-compare-pane=source]').textContent.includes('CODE_END_SENTINEL')");
    assert.doesNotMatch(await evaluate<string>("document.querySelector('[data-shelf-compare-pane=source]').textContent"), /MARKDOWN_END_SENTINEL/);
    await click(`[data-shelf-source="${first.item_id}"]`);
    const evidence = "specs/shelf-dropagent-parity/evidence";
    await mkdir(evidence, { recursive: true });
    for (const [name, theme, width] of [["browser-compare-light", "light", 1440], ["browser-compare-dark", "dark", 1440], ["browser-compare-narrow", "light", 880]] as const) {
      await command("Emulation.setDeviceMetricsOverride", { width, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
      await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
      await evaluate(`document.documentElement.dataset.resolvedTheme = ${JSON.stringify(theme)}`);
      await waitFor(`getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--content-side').trim() === ${JSON.stringify(theme === "dark" ? "#111112" : "#F5F5F4")}`);
      if (width === 880) await waitFor("document.querySelector('[data-shelf-stage]').classList.contains('is-narrow')");
      await evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
      const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
      await writeFile(`${evidence}/${name}.png`, Buffer.from(shot.data, "base64"));
    }
    await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  });

  await t.test("new actions save from the menu and arranging never starts a recipe", async () => {
    await select(first.item_id);
    await click("[data-shelf-more]");
    await click("[data-shelf-new-action]");
    await waitFor("document.querySelector('[data-shelf-create-action]')");
    await evaluate(`(() => { const form=document.querySelector('[data-shelf-create-action]');
      form.elements.name.value='抽取待办'; form.elements.prompt.value='把材料里的待办整理成列表。'; })()`);
    await click("[data-shelf-create-action] button[type=submit]");
    await waitFor("!document.querySelector('[data-shelf-create-action]') && [...document.querySelectorAll('[data-shelf-act]')].some(node => node.textContent.includes('抽取待办'))");
    const action = shelf.settings().shortcuts.find(action => action.name === "抽取待办");
    assert.ok(action);
    assert.equal(action.prompt, "把材料里的待办整理成列表。");
    assert.equal(await evaluate(`document.querySelector('[data-shelf-act="shortcut:${action.id}"]')?.getAttribute('aria-disabled')`), null);
    const resultsBefore = shelf.snapshot().results.length;
    await click("[data-shelf-more]");
    await click("[data-shelf-arrange]");
    await waitFor("document.querySelector('[data-shelf-hide-act=summarize]')");
    await click("[data-shelf-act=summarize]");
    assert.equal(await evaluate("document.querySelector('[data-shelf-stage]').classList.contains('is-confirm')"), false);
    assert.equal(shelf.snapshot().results.length, resultsBefore);
    assert.equal(shelf.snapshot().running_jobs.length, 0);
    await click("[data-shelf-more]");
    await click("[data-shelf-arrange]");
    await click(`[data-shelf-act="shortcut:${action.id}"]`);
    await waitFor("document.querySelector('[data-shelf-stage]').classList.contains('is-confirm')");
    assert.match(await evaluate<string>("document.querySelector('[data-shelf-confirm-title]').textContent"), /抽取待办/);
    await click("[data-shelf-back]");
  });

  await t.test("native copy client contract sends full selected paths only after pending edits are persisted", async () => {
    // This records the client/native invocation contract, not the macOS pasteboard.
    await evaluate(`window.parityNativeCalls=[]; window.__TAURI__={core:{invoke:async (name,payload)=>{
      if(name!=='shelf_copy_files') return;
      const response=await fetch(${JSON.stringify(`/api/shelf/items/${first.item_id}/file`)},{cache:'no-store'});
      window.parityNativeCalls.push({name,payload,saved:await response.text()});
    }}}`);
    await select(first.item_id);
    await click("[data-shelf-edit]");
    await waitFor("document.querySelector('[data-shelf-editor]')");
    const suffix = "\n复制前立即保存的尾行。";
    // Both events share a turn, so the 400 ms autosave cannot complete first.
    await evaluate(`(() => { const editor=document.querySelector('[data-shelf-editor]'); editor.value += ${JSON.stringify(suffix)};
      editor.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('[data-shelf-copy-file]').click(); })()`);
    await waitFor("window.parityNativeCalls.length === 1");
    const single = await evaluate<{ payload: { paths: string[] }; saved: string }>("window.parityNativeCalls[0]");
    assert.deepEqual(single.payload.paths, [join(shelf.root, first.relative_path)]);
    assert.equal(single.saved, markdown + "\n已修改且保留全文。" + suffix);
    assert.equal(shelf.readFile(first.item_id).bytes.toString("utf8"), single.saved);
    await click("[data-shelf-edit]");
    await waitFor("!document.querySelector('[data-shelf-editor]')");
    await evaluate(`document.querySelector(${JSON.stringify(row(second.item_id))}).dispatchEvent(new MouseEvent('click',{bubbles:true,ctrlKey:true}))`);
    await waitFor("document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item].is-on').length === 2");
    await evaluate("document.body.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,code:'KeyC',key:'c',metaKey:true}))");
    await waitFor("window.parityNativeCalls.length === 2");
    const multi = await evaluate<string[]>("window.parityNativeCalls[1].payload.paths");
    assert.deepEqual([...multi].sort(), [join(shelf.root, first.relative_path), join(shelf.root, second.relative_path)].sort());
  });

  await t.test("wheel send reopens a dead terminal while its pane remains open (client contract)", async () => {
    // No actual PTY or agent is opened here. The existing terminal integration
    // has separate native checks; this regression verifies the client handoff.
    await evaluate(`window.parityTerminalCalls=[];window.molisWorkShelfTui={isLive:()=>false,
      open:options=>window.parityTerminalCalls.push({kind:'open',options}),
      send:text=>window.parityTerminalCalls.push({kind:'send',text})};
      document.querySelector('[data-shelf-stage]').classList.add('is-talk')`);
    for (const text of ["继续第一轮", "退出后第二轮 https://example.com/中文"]) {
      await evaluate(`window.dispatchEvent(new CustomEvent('molis-shelf-send-tui',{detail:{item_ids:[${JSON.stringify(first.item_id)}],text:${JSON.stringify(text)}}}))`);
      await waitFor(`window.parityTerminalCalls.filter(call=>call.kind==='send').some(call=>call.text===${JSON.stringify(text)})`);
    }
    const calls = await evaluate<Array<{ kind: string; options?: { command: string }; text?: string }>>("window.parityTerminalCalls");
    assert.deepEqual(calls.map(call => call.kind), ["open", "send", "open", "send"]);
    assert.equal(calls[0].options?.command, join(bin, "claude"));
    assert.equal(calls[2].options?.command, join(bin, "claude"));
    assert.equal(calls[3].text, "退出后第二轮 https://example.com/中文");
  });

  await t.test("a missing terminal bridge preserves typed input and recovered queued lines appear before the draft", async () => {
    await evaluate(`delete window.molisWorkShelfTui; const field=document.querySelector('[data-shelf-tty-input]');
      field.value='桥接尚未就绪时的输入'; field.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));`);
    assert.equal(await evaluate("document.querySelector('[data-shelf-tty-input]').value"), "桥接尚未就绪时的输入");
    assert.match(await evaluate<string>("document.querySelector('[data-shelf-bar-hint]').textContent"), /终端尚未连接，输入已保留/);
    await evaluate("window.dispatchEvent(new CustomEvent('molis-shelf-tui-unsent',{detail:{texts:['失败后恢复的输入'],message:'fixture spawn failed'}}))");
    assert.equal(await evaluate("document.querySelector('[data-shelf-tty-input]').value"), "失败后恢复的输入 桥接尚未就绪时的输入");
  });
});
