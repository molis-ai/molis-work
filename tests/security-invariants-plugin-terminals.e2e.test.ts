import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";
import { pluginFrameBrowser } from "./fixtures/plugin-frame-browser.js";

test("SYS-15 integration preserves the CHR-1 Host terminal output, keyboard input and reattachment without relaunch", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = browser; // CHR-1 moved Characters into the trusted Host; only actual plugins are isolated.
  const bin = join(browser.homeDirectory, "test-bin"), config = join(browser.homeDirectory, "test-config");
  await mkdir(bin); await mkdir(config);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'ISOLATED_TERMINAL_READY\\n'\nexec /bin/cat\n", { mode: 0o700 });
  const priorPath = process.env.PATH; process.env.PATH = bin + ":" + priorPath;
  t.after(() => { if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath; });
  const workspace = await withMolisWorkProjectCatalog({ homeDirectory: browser.homeDirectory }, catalog => catalog.addWorkspaceProject({
    canonical_path: config, project_id: browser.projectId!, actor_id: "web-user", user_confirmed: true,
  }));
  const characters = openCharacters(browser.homeDirectory, "web-user");
  const { draft } = characters.service.import({ runtime_id: "codex", config_root: config, captured_at: new Date().toISOString(),
    rules: [{ path: join(config, "AGENTS.md"), scope: "global", content: "Use only this isolated fixture." }], skills: [] },
    { rule_paths: [join(config, "AGENTS.md")], skill_ids: [] });
  characters.close();
  const api = `/projects/${browser.projectId}/api/plugins/io.molis.work.characters`;
  const published = await browser.web.post<{ reference: { artifact_id: string; version: number } }>(api + `/drafts/${draft.character_id}/publish`, { expected_revision: draft.revision });
  const prepared = await browser.web.post<{ executable: string }>(api + "/execution", { reference: published.reference });
  assert.equal(prepared.executable, await realpath(join(bin, "codex")), "the native process must use this test fixture");
  const input = { reference: published.reference, workspace_id: workspace.workspace_id, task: "Verify the isolated terminal", request_id: randomUUID() };
  const launched = await browser.web.post<{ run: { run_id: string; panel_id: string; status: string }; spawn: Record<string, unknown> }>(api + "/execution/native", input);
  // SC-2: the page gets the panel to attach to and nothing it could start a process with.
  assert.deepEqual(launched.spawn, { panelId: launched.run.panel_id, attachOnly: true }); assert.equal(launched.run.status, "dispatched");
  const received: Record<string, unknown>[] = [];
  await browser.command("Network.enable", {}, browser.sessionId);
  t.after(browser.on("Network.webSocketFrameReceived", params => {
    if (received.length >= 20) return;
    const payload = (params.response as { payloadData?: string }).payloadData;
    if (!payload) return;
    const message = JSON.parse(payload) as Record<string, unknown>;
    if (message.panelId === launched.run.panel_id) received.push({ type: message.type, attached: message.attached, started: message.started,
      replay: typeof message.replay === "string" ? message.replay.slice(0,200) : undefined,
      data: typeof message.data === "string" ? message.data.slice(0,200) : undefined });
  }));
  const open = async (running = true) => {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?settings=characters` }, browser.sessionId));
    await browser.surfaceReady("characters");
    await child.waitFor("document.querySelector('[data-character-id]')");
    await child.click('[data-character-id]'); await child.waitFor("document.querySelector('[data-character-native-runs] button')");
    await child.click('[data-character-native-runs] button');
    // xterm pauses its renderer outside the viewport. Read and type in the visible terminal, as a person does.
    await child.evaluate("document.querySelector('[data-character-terminal]').scrollIntoView({block:'center',behavior:'instant'})");
    if (running) {
      try { await child.waitFor("document.querySelector('[data-character-terminal] .xterm-rows')?.textContent.includes('ISOLATED_TERMINAL_READY')"); }
      catch (error) { throw new Error(JSON.stringify({ received, page: await child.evaluate("({ output: document.querySelector('[data-character-terminal] .xterm-rows')?.textContent, status: document.querySelector('[data-character-terminal-status]')?.textContent, viewport: [innerWidth,innerHeight], terminal: document.querySelector('[data-character-terminal]')?.getBoundingClientRect().toJSON(), rows: [...document.querySelectorAll('.xterm-rows')].map(node=>({text:node.textContent,box:node.getBoundingClientRect().toJSON()})) })") }), { cause: error }); }
    }
  };
  await open();
  assert.equal(await browser.evaluate("document.querySelector('[data-work-surface=characters] iframe') === null"), true, "Characters retains the Host surface from CHR-1");
  // RAC-2852: both viewports still size the actual attached xterm, using only this file's isolated CLI.
  const evidence = join(REVIEW_EVIDENCE, "pg070-current"); await mkdir(evidence, { recursive: true });
  for (const [width, height, terminalHeight] of [[1440, 1000, "420px"], [390, 844, "350px"]] as const) {
    await browser.setViewport(width, height);
    await child.evaluate("document.querySelector('[data-character-terminal]').scrollIntoView({block:'center',behavior:'instant'})");
    assert.equal(await child.evaluate("getComputedStyle(document.querySelector('[data-character-terminal]')).height"), terminalHeight);
    await child.waitFor("document.querySelector('[data-character-terminal] .xterm-screen')?.getBoundingClientRect().width>0");
    await child.evaluate("document.querySelector('[data-character-terminal] .xterm-rows > div').scrollIntoView({block:'center',behavior:'instant'})");
    await child.waitFor("(()=>{const r=document.querySelector('[data-character-terminal] .xterm-rows > div').getBoundingClientRect();return r.top>96 && r.bottom<innerHeight-100 && !!document.elementFromPoint(r.left+8,r.top+r.height/2)?.closest('[data-character-terminal]')})()");
    const image = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
    await writeFile(join(evidence, "characters-terminal-" + width + ".png"), Buffer.from(image.data, "base64"));
  }
  await browser.setViewport(1440, 1000);
  await child.click('[data-character-use]'); await child.waitFor("document.querySelector('[data-character-run-dialog]')?.open===true");
  assert.equal(await child.evaluate("getComputedStyle(document.querySelector('.characters-run-modes')).display"), "grid");
  const runImage = await browser.command<{ data: string }>("Page.captureScreenshot", { format: "png" }, browser.sessionId);
  await writeFile(join(evidence, "characters-run-dialog.png"), Buffer.from(runImage.data, "base64"));
  await child.click('[data-character-run-close]'); await child.waitFor("!document.querySelector('[data-character-run-dialog]')?.open");
  await child.evaluate("document.querySelector('[data-character-terminal]').scrollIntoView({block:'center',behavior:'instant'})");
  await child.click('[data-character-terminal] .xterm-screen');
  await browser.command("Input.insertText", { text: "TYPED_THROUGH_RESTRICTED_CHANNEL" }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, browser.sessionId);
  await child.waitFor("document.querySelector('[data-character-terminal] .xterm-rows').textContent.includes('TYPED_THROUGH_RESTRICTED_CHANNEL')");
  await open();
  await child.waitFor("document.querySelector('[data-character-terminal] .xterm-rows').textContent.includes('TYPED_THROUGH_RESTRICTED_CHANNEL')");
  const replay = await browser.web.post<{ run: { run_id: string } }>(api + "/execution/native", input);
  assert.equal(replay.run.run_id, launched.run.run_id);
  await child.click('[data-character-terminal-stop]');
  await child.waitFor("document.querySelector('[data-character-terminal-status]').textContent.includes('进程已结束')");
  await open(false);
  await child.waitFor("document.querySelector('[data-character-terminal-status]').textContent.includes('进程未运行')");
  // SC-2 (D3): the terminal's output is not kept; the run itself stays listed.
  assert.equal(await child.evaluate<boolean>("document.querySelector('[data-character-run-output]') === null"), true);
  assert.equal(await child.evaluate<boolean>("document.querySelector('[data-characters]').textContent.includes('TYPED_THROUGH_RESTRICTED_CHANNEL')"), false);
});

test("SYS-15-F2/F3 Shelf isolated page copies owned files through the shell and reopens its actual terminal", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "shelf"), bin = join(browser.homeDirectory, "shelf-test-bin"); await mkdir(bin);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'SHELF_TERMINAL_READY\\n'\nexec /bin/cat\n", { mode: 0o700 });
  const priorPath = process.env.MOLIS_WORK_LOCAL_TOOLS_PATH;
  process.env.MOLIS_WORK_LOCAL_TOOLS_PATH = bin;
  t.after(() => { if (priorPath === undefined) delete process.env.MOLIS_WORK_LOCAL_TOOLS_PATH; else process.env.MOLIS_WORK_LOCAL_TOOLS_PATH = priorPath; });
  // Only the final desktop IPC is captured. Real page authorization, owner-file resolution and trusted mouse activation run.
  await browser.command("Page.addScriptToEvaluateOnNewDocument", { source: "if(parent===window){globalThis.nativeCalls=[];globalThis.__TAURI__={core:{invoke:async(name,input)=>{nativeCalls.push({name,input})}}}}" }, browser.sessionId);
  const api = `/projects/${browser.projectId}/api/plugins/io.molis.work.shelf`;
  const added = await browser.web.post<{ item: { item_id: string; relative_path: string } }>(api + "/items", { filename: "frame-copy.txt", bytes_base64: Buffer.from("owned file handed off through the shell").toString("base64") });
  const open = async () => {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/side/shelf/side` }, browser.sessionId));
    await child.waitFor(`document.querySelector('[data-shelf-item="${added.item.item_id}"]') && globalThis.molisWorkShelfTui`);
    await child.click(`[data-shelf-item="${added.item.item_id}"]`);
    await child.waitFor("document.querySelector('[data-shelf-preview]')?.textContent.includes('owned file handed off')");
  };
  await open(); assert.equal(await child.evaluate("typeof globalThis.__TAURI__"), "undefined");
  await child.click(`[data-shelf-item="${added.item.item_id}"] [data-shelf-row-action="copy"]`); await browser.waitFor("globalThis.nativeCalls.some(call=>call.name==='files_copy')");
  const copied = await browser.evaluate<{ name: string; input: { paths: string[] } }>("globalThis.nativeCalls.find(call=>call.name==='files_copy')");
  assert.equal(copied.name, "files_copy"); assert.deepEqual(copied.input.paths, [added.item.relative_path], "the window hands the shell the relative path, not a file path");
  await child.click('[data-shelf-act="talk"]');
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_TERMINAL_READY')");
  await child.click("[data-shelf-tty-input]");
  await browser.command("Input.insertText", { text: "SHELF_KEYBOARD_INPUT" }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, browser.sessionId);
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_KEYBOARD_INPUT')");
  await open(); await child.click('[data-shelf-act="talk"]');
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_KEYBOARD_INPUT')");
});
