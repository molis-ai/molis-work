import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { withConnectorConnections } from "@molis-ai/molis-work-app-local-host";
import { openBoardBrowser } from "./fixtures/board-browser.js";
import { standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { assertLayoutClean } from "./fixtures/layout-audit.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

async function seedStandInModel(home: string, endpoint: string): Promise<void> {
  process.env.MOLIS_WORK_SECRET_BACKEND ??= "file";
  await withMolisWorkProjectCatalog({ homeDirectory: home }, catalog => {
    const connection = withConnectorConnections(home, store => store.createToken({ serviceId: "model-api", displayName: "Stand-in OpenAI", token: standInKey }));
    withConnectorConnections(home, store => store.assertTarget(connection.connection_id, "model-api", endpoint));
    catalog.models.upsert({
      credential_ref: connection.credential_ref!,
      provider_id: "standin",
      display_name: "Gemini 2.5 Pro",
      base_url: endpoint,
      api_format: "openai-chat-completions",
      models: [{ model_id: "gemini-2.5-pro", enabled: true }],
    });
  });
}

async function openRecoveryBrowser(t: TestContext, options: { board?: boolean; reply?: string } = {}) {
  const reply = options.reply ?? "# 项目启动背景\n已核对主说明与构建脚本 [S1]。";
  const model = await startModelStandIn(standInKey, reply);
  t.after(() => model.close());
  const open = options.board ? openBoardBrowser : openGoalBrowser;
  const browser = await open(t, "empty", undefined, async () => reply, undefined, undefined, {
    prepareHome: (dir) => seedStandInModel(dir, model.baseUrl),
  });
  if (!browser) return null;
  const { command, sessionId, evaluate, waitFor } = browser;
  const setView = async (width: number, theme: "light" | "dark") => {
    await browser.setViewport(width, 900, width < 600);
    await command("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }, { name: "prefers-color-scheme", value: theme }],
    }, sessionId);
    await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
    await waitFor(`innerWidth === ${width} && document.documentElement.dataset.resolvedTheme === '${theme}'`);
  };
  return { ...browser, model, setView };
}

test("Batch 33 component catalog specimens (#recovery-closures) pass layout audit across 1440/1024/390/320 and light/dark", { timeout: 120_000 }, async t => {
  // CHO-11, CHO-12, CHO-13, CHO-35, ONB-38, C12, C14
  const b = await openRecoveryBrowser(t, { board: true });
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, setView } = b;
  const output = reviewEvidenceUrl("batch33-recovery-catalog/");
  await mkdir(output, { recursive: true });

  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/__ui/catalog?lang=zh#recovery-closures` }, sessionId));
  await waitFor("Boolean(document.getElementById('recovery-closures')) && Boolean(document.querySelector('[data-primitive=\"coding-round-materials\"]'))");
  await evaluate("document.getElementById('recovery-closures').setAttribute('data-audit-scope', '')");

  for (const width of [1440, 1024, 390, 320]) {
    for (const theme of ["light", "dark"] as const) {
      await setView(width, theme);
      await evaluate("document.getElementById('recovery-closures').scrollIntoView({ block: 'start' })");
      await assertLayoutClean(evaluate, `catalog #recovery-closures ${width}/${theme}`, {
        allow: (finding) => finding.kind === "page-overflow-y",
      });
      if (width === 1440 || width === 390) {
        const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
        await writeFile(new URL(`catalog-${width}-${theme}.png`, output), Buffer.from(data, "base64"));
      }
    }
  }
});

test("ONB-36, ONB-38, ONB-39, ONB-40, ONB-42, C2, C3, C6: real browser upload persistence, secret-hold choice, 5-cell funnel, and scope-delta layout", { timeout: 150_000 }, async t => {
  const b = await openRecoveryBrowser(t);
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, click, setView } = b;
  const output = reviewEvidenceUrl("batch33-onboarding-recovery/");
  await mkdir(output, { recursive: true });

  await b.navigate(() => command("Page.navigate", { url: `${b.origin}/` }, sessionId));
  await setView(1440, "light");
  await waitFor("document.querySelector('.opening.is-done')");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('[data-ob-view=sources]')");

  const readmePath = join(b.homeDirectory, "README.md");
  const dockerfilePath = join(b.homeDirectory, "Dockerfile");
  const envPath = join(b.homeDirectory, ".env.local");
  const extraPath = join(b.homeDirectory, "CHANGELOG.md");
  const browserSecret = ["sk", "live", "browsersecret9988776655443322"].join("-");
  await writeFile(readmePath, "# 项目说明\n周五发布新版构建流。\n", "utf8");
  await writeFile(dockerfilePath, "FROM node:24-alpine\nCMD [\"node\", \"index.js\"]\n", "utf8");
  await writeFile(envPath, `${["OPENAI", "API", "KEY"].join("_")}=${browserSecret}\nPORT=3000\n`, "utf8");
  await writeFile(extraPath, "# 变更记录\n补充增量范围核对。\n", "utf8");

  const setInputFiles = async (files: string[]) => {
    const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 }, sessionId);
    const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: "#cx-upload-files" }, sessionId);
    assert.ok(nodeId);
    await command("DOM.setFileInputFiles", { nodeId, files }, sessionId);
  };

  await setInputFiles([readmePath, dockerfilePath, envPath]);
  await waitFor("document.querySelector('.ob-right')?.textContent.includes('Dockerfile') && document.querySelector('.ob-right')?.textContent.includes('.env.local')");

  // C6 & ONB-36: reload BEFORE starting; IndexedDB restores chosen uploads so the person does not have to re-pick!
  await b.navigate(() => command("Page.reload", {}, sessionId));
  await waitFor("document.querySelector('[data-ob-view=sources]') && document.querySelector('.ob-right')?.textContent.includes('Dockerfile')");

  await click("[data-action=prepare]");
  await waitFor("document.querySelector('[data-ob-view=model]') && document.querySelector('[data-action=start]:not(:disabled)')");
  await click("[data-action=start]");

  // C2 & ONB-38: .env.local is held for explicit user decision while README + Dockerfile finish; 5-number funnel & 5-cell track render!
  await waitFor("Boolean(document.querySelector('[data-action=adopt]:not(:disabled)')) && Boolean(document.querySelector('[data-slot=\"materials-verification\"]')) && Boolean(document.querySelector('[data-secret-decision=\"strip\"]'))", 20_000);

  for (const width of [1440, 1024, 390, 320]) {
    for (const theme of ["light", "dark"] as const) {
      await setView(width, theme);
      await assertLayoutClean(evaluate, `onboarding verification + secret hold ${width}/${theme}`);
    }
  }
  await setView(1440, "light");
  const { data: heldShot } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(new URL("onboarding-secret-hold-1440.png", output), Buffer.from(heldShot, "base64"));

  // Choose "strip" (去掉秘密值再发) -> re-runs without raw secret and reaches review!
  await click("[data-secret-decision=\"strip\"]");
  await waitFor("!document.querySelector('[data-secret-decision=\"strip\"]') && Boolean(document.querySelector('[data-action=adopt]:not(:disabled)'))", 20_000);
  assert.equal(b.model.bodies.some(body => body.includes(browserSecret)), false, "raw secret never sent to model");

  // ONB-40 & ONB-42: reopen ("调整范围") and add CHANGELOG.md -> scope-delta card ("这次只做这些") + stale-summary card appear cleanly!
  await click("[data-action=restart]");
  await waitFor("document.querySelector('[data-ob-view=sources]')");
  await setInputFiles([extraPath]);
  await waitFor("document.querySelector('.ob-right')?.textContent.includes('CHANGELOG.md')");
  await click("[data-action=prepare]");
  await waitFor("Boolean(document.querySelector('[data-slot=\"scope-delta-card\"]')) && Boolean(document.querySelector('[data-slot=\"stale-summary\"]'))");
  await click("[data-action=model-back]");
  await waitFor("Boolean(document.querySelector('[data-ob-view=preview]')) && Boolean(document.querySelector('[data-slot=\"scope-delta-card\"]')) && Boolean(document.querySelector('[data-slot=\"stale-summary\"]'))");

  for (const width of [1440, 390, 320]) {
    await setView(width, "light");
    await assertLayoutClean(evaluate, `onboarding scope-delta ${width}/light`);
  }
  const { data: deltaShot } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
  await writeFile(new URL("onboarding-scope-delta-320.png", output), Buffer.from(deltaShot, "base64"));
});
