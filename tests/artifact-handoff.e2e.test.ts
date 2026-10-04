import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_BOARD_ID, GoalProjectApplication } from "@molis-ai/molis-work-app-local-host";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { pinnedArtifact } from "./fixtures/artifacts.js";

type Heard = { purpose: string; object?: { kind: string; id: string; title?: string; version?: number }; materials?: Array<{ title: string; text: string }>; executor?: string };

// 「交给助理 / Coding」 on a 成果 version (artifact-positioning 五.1): the person's click hands the version to a new work.
test("a 成果 version is handed to the Assistant or to Coding as material of a new work", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "seeded", undefined, null); if (!b) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, store, projectId } = b;
  const coordinator = new GoalProjectApplication(store);
  coordinator.artifacts.commands.registerVersion({ board_id: DEMO_BOARD_ID, actor_id: "web-user", artifact_id: "pages-brief", version: 1,
    artifact_type_id: "io.molis.work.pages.document", schema_version: 1,
    producer: { plugin_id: "io.molis.work.pages", plugin_version: "1.0.0", binding_signature: "official-pages-binding" },
    content: { kind: "inline", payload: { title: "需求说明", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "范围与验收" }] }] } } },
    ...pinnedArtifact("需求说明", { kind: "pages_document", id: "brief" }, "1") });
  await command("Page.addScriptToEvaluateOnNewDocument", { source: "window.__heard = []; addEventListener('molis:assistant-message', event => window.__heard.push(event.detail));" }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${b.origin}/projects/${projectId}/artifacts/pages-brief/versions/1` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-artifact-handoff]')) && Boolean(document.querySelector('[data-artifact-business-preview]'))", 15_000);
  // This project has Coding, so both are offered.
  await waitFor("!document.querySelector('[data-artifact-hand=coding]').hidden", 10_000);

  await click("[data-artifact-hand=assistant]");
  await waitFor("window.__heard.some(message => message.purpose === 'delegate')");
  const [toAssistant] = (await evaluate<Heard[]>("window.__heard")).filter(message => message.purpose === "delegate");
  assert.deepEqual([toAssistant!.object!.kind, toAssistant!.object!.id, toAssistant!.object!.version, toAssistant!.executor], ["artifact", JSON.stringify(["pages-brief", 1]), 1, undefined]);
  assert.equal(toAssistant!.materials![0]!.title, "成果「需求说明」第 1 版");
  assert.match(toAssistant!.materials![0]!.text, /范围与验收/);
  // The Assistant takes it as material of a new work and waits for the person to say what to do with it.
  await waitFor("(document.querySelector('[data-assistant-materials]')?.getAttribute('aria-label') || '').includes('成果「需求说明」第 1 版')", 10_000);
  assert.equal(await evaluate("document.querySelector('[data-assistant-work-title]').textContent"), "新工作");

  if (await evaluate("Boolean(document.querySelector('[data-assistant-panel-close]')?.getClientRects().length)")) await click("[data-assistant-panel-close]");
  await evaluate("window.__heard = []");
  await click("[data-artifact-hand=coding]");
  await waitFor("window.__heard.some(message => message.purpose === 'delegate')");
  assert.equal((await evaluate<Heard[]>("window.__heard")).find(message => message.purpose === "delegate")!.executor, "coding");
  // The new work is Coding's.
  await waitFor("document.querySelector('[data-assistant-executor]')?.hasAttribute('data-chosen')", 10_000);
});
