import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
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
  const launched = await browser.web.post<{ run: { session_id: string; panel_id: string }; spawn: Record<string, unknown> }>(api + "/execution/native", input);
  assert.equal(launched.spawn.command, undefined); assert.equal(launched.spawn.cwd, undefined);
  const open = async (running = true) => {
    await browser.navigate(() => browser.command("Page.navigate", { url: `${browser.origin}/projects/${browser.projectId}/?settings=characters` }, browser.sessionId));
    await browser.surfaceReady("characters");
    await child.waitFor("document.querySelector('[data-character-id]')");
    await child.click('[data-character-id]'); await child.waitFor("document.querySelector('[data-character-native-runs] button')");
    await child.click('[data-character-native-runs] button');
    if (running) {
      try { await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('ISOLATED_TERMINAL_READY')"); }
      catch (error) { throw new Error(JSON.stringify(await child.evaluate("({ output: document.querySelector('.xterm-rows')?.textContent, status: document.querySelector('[data-character-terminal-status]')?.textContent, saved: document.querySelector('[data-character-run-output]')?.textContent, width: document.querySelector('.xterm-rows')?.clientWidth })")), { cause: error }); }
    }
  };
  await open();
  assert.equal(await browser.evaluate("document.querySelector('[data-work-surface=characters] iframe') === null"), true, "Characters retains the Host surface from CHR-1");
  await browser.command("Input.insertText", { text: "TYPED_THROUGH_RESTRICTED_CHANNEL" }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, browser.sessionId);
  await child.waitFor("document.querySelector('.xterm-rows').textContent.includes('TYPED_THROUGH_RESTRICTED_CHANNEL')");
  await open();
  await child.waitFor("document.querySelector('.xterm-rows').textContent.includes('TYPED_THROUGH_RESTRICTED_CHANNEL')");
  const replay = await browser.web.post<{ run: { session_id: string } }>(api + "/execution/native", input);
  assert.equal(replay.run.session_id, launched.run.session_id);
  await child.click('[data-character-terminal-stop]');
  await child.waitFor("document.querySelector('[data-character-terminal-status]').textContent.includes('进程已结束')");
  await open(false);
  await child.waitFor("document.querySelector('[data-character-terminal-status]').textContent.includes('进程未运行')");
  assert.match(await child.evaluate<string>("document.querySelector('[data-character-run-output]').textContent"), /TYPED_THROUGH_RESTRICTED_CHANNEL/);
});

test("SYS-15-F2/F3 Shelf isolated page copies owned files through the shell and reopens its actual terminal", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true); if (!browser) return;
  const child = await pluginFrameBrowser(t, browser, "shelf"), bin = join(browser.homeDirectory, "shelf-test-bin"); await mkdir(bin);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'SHELF_TERMINAL_READY\\n'\nexec /bin/cat\n", { mode: 0o700 });
  const prior = process.env.MOLIS_WORK_SHELF_AGENT, priorPath = process.env.MOLIS_WORK_SHELF_AGENT_PATH;
  process.env.MOLIS_WORK_SHELF_AGENT = "codex"; process.env.MOLIS_WORK_SHELF_AGENT_PATH = bin;
  t.after(() => {
    if (prior === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT; else process.env.MOLIS_WORK_SHELF_AGENT = prior;
    if (priorPath === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT_PATH; else process.env.MOLIS_WORK_SHELF_AGENT_PATH = priorPath;
  });
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
  await child.click(`[data-shelf-item="${added.item.item_id}"] [data-shelf-row-action="copy"]`); await browser.waitFor("globalThis.nativeCalls.some(call=>call.name==='shelf_copy_files')");
  const copied = await browser.evaluate<{ name: string; input: { paths: string[] } }>("globalThis.nativeCalls.find(call=>call.name==='shelf_copy_files')");
  assert.equal(copied.name, "shelf_copy_files"); assert.equal(copied.input.paths.length, 1);
  assert.ok(copied.input.paths[0]!.endsWith("/shelf/" + added.item.relative_path));
  await child.click('[data-shelf-act="talk"]');
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_TERMINAL_READY')");
  await child.click("[data-shelf-tty-input]");
  await browser.command("Input.insertText", { text: "SHELF_KEYBOARD_INPUT" }, browser.sessionId);
  await browser.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, browser.sessionId);
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_KEYBOARD_INPUT')");
  await open(); await child.click('[data-shelf-act="talk"]');
  await child.waitFor("document.querySelector('.xterm-rows')?.textContent.includes('SHELF_KEYBOARD_INPUT')");
});
