import assert from "node:assert/strict";
import test from "node:test";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";

test("actual Artifact import, fixed version, Goal embed and disabled reader survive the shared action path", { timeout: 90_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, store, projectId } = b;
  const prefix = `/projects/${projectId}`;
  const visit = (path: string) => navigate(() => command("Page.navigate", { url: b.origin + prefix + path }, sessionId));
  const file = join(b.homeDirectory, "动作导入.md"), content = "# 浏览器原始文档\n通过同一能力保存与读取。";
  await writeFile(file, content);
  await mkdir(".impeccable/review/action-service/artifacts", { recursive: true });
  let exact: { artifact_id: string; version: number } | undefined;
  for (const width of [1440, 390]) {
    await command("Emulation.setDeviceMetricsOverride", { width, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
    await visit("/artifacts/import");
    await evaluate("document.querySelector('[data-import-source]').value='file';document.querySelector('[data-import-source]').dispatchEvent(new Event('change',{bubbles:true}))");
    const root = await command<{ root: { nodeId: number } }>("DOM.getDocument", {}, sessionId);
    const input = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.root.nodeId, selector: "input[type=file]" }, sessionId);
    await command("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [file] }, sessionId);
    await click("[data-import-submit]");
    await waitFor("!document.querySelector('[data-import-result]').hidden || !document.querySelector('[data-import-error]').hidden", 10_000);
    assert.equal(await evaluate("document.querySelector('[data-import-error]').hidden"), true);
    const href = await evaluate<string>("document.querySelector('[data-import-result-link]').getAttribute('href')");
    const match = new URL(href, b.origin).pathname.match(/\/artifacts\/([^/]+)\/versions\/(\d+)$/)!;
    const reference = { artifact_id: decodeURIComponent(match[1]!), version: Number(match[2]) };
    if (exact) assert.deepEqual(reference, exact, "repeated import keeps the same stored version");
    exact = reference;
    await navigate(() => click("[data-import-result-link]"));
    assert.match(await evaluate<string>("document.body.innerText"), /浏览器原始文档/);
    assert.match(await evaluate<string>("document.body.innerText"), /通过同一能力保存与读取/);
    const exported = await evaluate<any>(`fetch(${JSON.stringify(prefix + `/api/artifacts/${encodeURIComponent(exact.artifact_id)}/versions/1/export`)}).then(r=>r.json())`);
    assert.equal(exported.payload.content, content); assert.equal(exported.version, 1);
    const screenshot = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`.impeccable/review/action-service/artifacts/read-${width}.png`, Buffer.from(screenshot.data, "base64"));
  }
  const board = store.goalsQuery.listBoardIds()[0]!, scope = { kind: "personal" as const, id: board };
  const ledger = createContextLedger(store.db, { authorize: () => true });
  ledger.commands.put({ actor_id: "browser-owner", scope }, { key: "artifact-action-input", type: "goal.input", cause: "Explicit browser fixture",
    source: { module: "goals", id: "V1", version: null, scope }, target: { module: "artifacts", id: exact!.artifact_id, version: exact!.version, scope } });
  await visit("/goals/V1");
  assert.equal(await evaluate(`Boolean(document.querySelector('[data-artifact-version="1"]'))`), true);
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: b.homeDirectory });
  try {
    catalog.removeProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" });
    await visit("/goals/V1");
    assert.match(await evaluate<string>("document.querySelector('[data-artifact-unavailable]').textContent"), /未启用/);
    const denied = await fetch(b.origin + prefix + "/artifacts");
    assert.equal(denied.status, 404); await denied.text();
    catalog.addProjectPlugin({ project_id: projectId!, plugin_id: "artifacts", actor_id: "browser-owner" });
    await visit("/goals/V1");
    assert.equal(await evaluate(`Boolean(document.querySelector('[data-artifact-version="1"]'))`), true);
  } finally { catalog.close(); }
});
