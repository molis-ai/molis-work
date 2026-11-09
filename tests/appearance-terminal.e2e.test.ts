import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { openCharacters } from "@molis-ai/molis-work-module-characters";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { deferred } from "./fixtures/home-runtime.js";
import { setProjectOutputFolder } from "./fixtures/project-directories-http.js";

test("FSS-18 changing the mono role remeasures the attached terminal without starting it again", { timeout: 75_000 }, async t => {
  const b = await openGoalBrowser(t, true);
  if (!b) return;
  const bin = join(b.homeDirectory, "test-bin"), config = join(b.homeDirectory, "test-config");
  await Promise.all([mkdir(bin), mkdir(config)]);
  await writeFile(join(bin, "codex"), "#!/bin/sh\nprintf 'ISOLATED_TERMINAL_READY\\n'\nexec /bin/cat\n", { mode: 0o700 });
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path ?? ""}`;
  t.after(() => { if (path === undefined) delete process.env.PATH; else process.env.PATH = path; });

  const workspace = await setProjectOutputFolder(b.web, b.projectId, config);
  const characters = openCharacters(b.homeDirectory, "web-user");
  const rule = join(config, "AGENTS.md");
  const { draft } = characters.service.import({ runtime_id: "codex", config_root: config, captured_at: new Date().toISOString(),
    rules: [{ path: rule, scope: "global", content: "Use only this isolated terminal fixture." }], skills: [] }, { rule_paths: [rule], skill_ids: [] });
  characters.close();
  const api = `/projects/${b.projectId}/api/plugins/io.molis.work.characters`;
  const { reference } = await b.web.post<{ reference: { artifact_id: string; version: number } }>(api + `/drafts/${draft.character_id}/publish`, { expected_revision: draft.revision });
  const prepared = await b.web.post<{ executable: string }>(api + "/execution", { reference });
  assert.equal(prepared.executable, await realpath(join(bin, "codex")));
  const { run } = await b.web.post<{ run: { panel_id: string; status: string } }>(api + "/execution/native", {
    reference, workspace_id: workspace.workspace_id, task: "Open the isolated PTY", request_id: randomUUID(),
  });
  assert.equal(run.status, "dispatched");

  const resized = deferred();
  let armed = false;
  const attachments: unknown[] = [];
  await b.command("Network.enable", {}, b.sessionId);
  t.after(b.on("Network.webSocketFrameSent", params => {
    const payload = (params.response as { payloadData?: string }).payloadData;
    if (!payload) return;
    const frame = JSON.parse(payload) as { panelId?: string; type?: string; attachOnly?: boolean };
    if (frame.panelId !== run.panel_id || !frame.type) return;
    if (frame.type === "spawn") attachments.push(frame.attachOnly);
    if (armed && frame.type === "resize") resized.resolve();
  }));
  await b.setViewport(1440, 1000);
  await b.navigate(() => b.command("Page.navigate", { url: `${b.origin}/projects/${b.projectId}/?settings=characters` }, b.sessionId));
  await b.surfaceReady("characters");
  await b.waitFor("document.querySelector('[data-character-id]')");
  await b.click("[data-character-id]");
  await b.waitFor("document.querySelector('[data-character-native-runs] button')");
  await b.click("[data-character-native-runs] button");
  await b.evaluate("document.querySelector('[data-character-terminal]').scrollIntoView({block:'center',behavior:'instant'})");
  const rows = "document.querySelector('[data-character-terminal] .xterm-rows')";
  await b.waitFor(`${rows}?.textContent.includes('ISOLATED_TERMINAL_READY')`);
  const before = await b.evaluate<string>(`getComputedStyle(${rows}).fontFamily`);
  assert.match(before, /^ui-monospace/u);
  await b.evaluate(`window.appearanceTerminal = ${rows}.closest('.xterm')`);
  armed = true;
  await b.evaluate(`molisWorkRequest('/api/ui/appearance', ${JSON.stringify({ body: {
    request_id: randomUUID(), expected_revision: 0, choice: { kind: "selection", selection: {
      skin: { id: "soft-workbench", revision: 1 }, font: { policy: "follow-skin" }, mono: { id: "system-menlo", revision: 1 },
    } },
  } })})`);
  await b.waitFor(`/^Menlo,/u.test(getComputedStyle(${rows}).fontFamily)`);
  await Promise.race([resized.promise, delay(5000, undefined, { ref: false }).then(() => { throw new Error("the attached PTY was not resized"); })]);
  assert.equal(await b.evaluate(`${rows}.closest('.xterm') === appearanceTerminal`), true);
  assert.deepEqual(attachments, [true], "only the initial attach reached the PTY channel");

  await b.click("[data-character-terminal] .xterm-screen");
  await b.command("Input.insertText", { text: "AFTER_MONO_SWITCH" }, b.sessionId);
  await b.command("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, text: "\r" }, b.sessionId);
  await b.waitFor(`${rows}.textContent.includes('AFTER_MONO_SWITCH')`);
  assert.equal(await b.evaluate(`${rows}.textContent.match(/ISOLATED_TERMINAL_READY/g)?.length`), 1);
  await b.click("[data-character-terminal-stop]");
  await b.waitFor("document.querySelector('[data-character-terminal-status]').textContent.includes('进程已结束')");
});
