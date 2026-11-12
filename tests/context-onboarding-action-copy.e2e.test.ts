import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { standInKey } from "./fixtures/first-model-browser.js";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { startModelStandIn } from "./fixtures/model-stand-in.js";
import { reviewEvidenceUrl } from "./fixtures/review-evidence.js";

type Reference = { source_id: string; text: { sha256: string }; documents?: string[] };
type Journey = {
  phase: string;
  needs_model: boolean;
  model: string | null;
  sources: { selected: boolean; references?: Reference[] }[];
  summary?: { title: string; references: Reference[] };
  project_id: string;
  document_id: string;
};
type AXTree = { nodes: { ignored: boolean; role?: { value: string }; name?: { value: string } }[] };

test("ACTCOPY-01 ACTCOPY-02: first-use retry names the missing model, keeps the material and continues after connection", { timeout: 120_000 }, async t => {
  const b = await openGoalBrowser(t, "empty");
  if (!b) return;
  const { command, sessionId, evaluate, waitFor, click, web } = b;
  const material = "# Launch notes\nThe launch is on Friday.\n";
  const summary = "# Launch planning\nThe launch is on Friday. [S1]";
  const model = await startModelStandIn(standInKey, summary);
  t.after(() => model.close());
  const output = reviewEvidenceUrl("batch27-onboarding-action-copy/");
  await mkdir(output, { recursive: true });

  const go = (path: string) => b.navigate(() => command("Page.navigate", { url: b.origin + path }, sessionId));
  const screen = (name: string) => `document.querySelector('[data-ob-view=${name}]')`;
  const button = (action: string) => `[data-action=${action}]`;
  const retry = button("retry");
  const focus = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);
  const type = async (selector: string, text: string) => {
    await focus(selector);
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).select()`);
    await command("Input.insertText", { text }, sessionId);
  };
  const press = async (key: "Enter" | "Tab") => {
    const code = key === "Enter" ? 13 : 9;
    const input = { key, code: key, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code };
    await command("Input.dispatchKeyEvent", key === "Enter"
      ? { ...input, type: "keyDown", text: "\r", unmodifiedText: "\r" }
      : { ...input, type: "rawKeyDown" }, sessionId);
    await command("Input.dispatchKeyEvent", { ...input, type: "keyUp" }, sessionId);
  };
  const capture = async (name: string) => {
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(new URL(name + ".png", output), Buffer.from(data, "base64"));
  };

  await b.setViewport(1440, 900);
  await go("/");
  await waitFor("document.querySelector('.opening.is-done')");
  await click(button("intro-next"));
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
  await click(button("intro-next"));
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
  await click(button("intro-next"));
  await waitFor(screen("sources"));
  assert.equal(await evaluate("document.body.dataset.onboardingMode"), "first_run");

  const file = join(b.homeDirectory, "Launch notes.md");
  await writeFile(file, material);
  const { root } = await command<{ root: { nodeId: number } }>("DOM.getDocument", { depth: 0 }, sessionId);
  const { nodeId } = await command<{ nodeId: number }>("DOM.querySelector", { nodeId: root.nodeId, selector: "#cx-upload-files" }, sessionId);
  assert.ok(nodeId, "the real file input is present");
  await command("DOM.setFileInputFiles", { nodeId, files: [file] }, sessionId);
  await waitFor("document.querySelector('.ob-right')?.textContent.includes('Launch notes.md')");

  const path = await evaluate<string>("location.pathname + location.search");
  const id = new URL(path, b.origin).searchParams.get("journey");
  assert.ok(id);
  const journeyPath = `/api/onboarding/context/${id}`;
  const journey = () => web.get<Journey>(journeyPath);
  const requests = { files: 0, start: 0, adopt: 0, modelSave: 0 };
  b.server.on("request", request => {
    if (request.method !== "POST") return;
    const pathname = new URL(request.url ?? "/", b.origin).pathname;
    if (pathname === journeyPath + "/files") requests.files++;
    if (pathname === journeyPath + "/start") requests.start++;
    if (pathname === journeyPath + "/adopt") requests.adopt++;
    if (pathname.startsWith("/api/settings/models/")) requests.modelSave++;
  });
  const ready = screen("materials");
  const label = () => evaluate<string>(`document.querySelector('${retry}')?.textContent.trim()`);
  await click(button("prepare"));
  await waitFor(`${screen("model")} && document.querySelector('[data-action=start]:not(:disabled)')`);
  await click(button("start"));
  await waitFor(ready);
  const before = await journey();
  assert.deepEqual([before.phase, before.needs_model, before.model], ["failed", true, null]);
  const references = before.sources.filter(source => source.selected).flatMap(source => source.references ?? []);
  assert.equal(references.length, 1);
  const reference = references[0]!;
  const readText = () => web.get<{ text: string }>(journeyPath + "/text/" + reference.text.sha256);
  assert.match((await readText()).text, /The launch is on Friday\./u);

  for (const [locale, name] of [["zh", "连好后继续整理"], ["en", "Continue after connecting"]] as const) {
    if (locale === "en") {
      await go("/locale?lang=en&next=" + encodeURIComponent(path));
      await waitFor(`document.documentElement.lang === 'en' && ${ready}`);
    }
    assert.equal(await label(), name);
    for (const width of [1440, 1024, 390]) {
      await b.setViewport(width, 900);
      for (const theme of ["light", "dark"]) {
        await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`innerWidth === ${width} && document.documentElement.dataset.resolvedTheme === '${theme}'`);
        const { nodes } = await command<AXTree>("Accessibility.getFullAXTree", {}, sessionId);
        const names = nodes.filter(node => !node.ignored && node.role?.value === "button").map(node => node.name?.value);
        assert.equal(names.filter(value => value === name).length, 1, `${locale}/${theme}/${width} retry name`);
        assert.ok(!names.some(value => value === "已连接，继续整理" || value === "Connected — continue"));
        assert.equal(await evaluate(`(() => {
          const control = document.querySelector('${retry}'), box = control.getBoundingClientRect();
          return control.checkVisibility() && !control.disabled && box.left >= 0 && box.right <= innerWidth
            && control.scrollWidth <= control.clientWidth && document.documentElement.scrollWidth <= innerWidth;
        })()`), true, `${locale}/${theme}/${width} retry fits`);
        await capture(`missing-model-${locale}-${theme}-${width}`);
      }
    }
  }

  // The person can try the original action with the keyboard and can go back to their named materials.
  const projectName = "Friday launch review";
  await click(button("materials-only"));
  await waitFor("document.querySelector('#cx-blank-name')");
  await type("#cx-blank-name", projectName);
  await click(button("back"));
  await waitFor(ready);
  await focus(button("model"));
  await press("Tab");
  assert.equal(await evaluate(`document.activeElement.matches('${retry}')`), true);
  await press("Enter");
  await waitFor(screen("reading"));
  await waitFor(ready);
  const retryResult = await journey();
  assert.deepEqual([retryResult.phase, retryResult.needs_model, retryResult.sources.flatMap(source => source.references ?? [])], ["failed", true, references]);
  assert.deepEqual(requests, { files: 1, start: 2, adopt: 0, modelSave: 0 });
  assert.equal(model.requests.length, 0);
  await click(button("materials-only"));
  await waitFor("document.querySelector('#cx-blank-name')");
  assert.equal(await evaluate("document.querySelector('#cx-blank-name').value"), projectName);
  await click(button("back"));
  await waitFor(ready);

  // Only the provider reply is a fixture. The model settings, key validation, storage and the journey use the real Host.
  await b.setViewport(1024, 900);
  await click(button("model"));
  await waitFor("document.querySelector('[data-ob-template=openai-compatible]')");
  await click("[data-ob-template=openai-compatible]");
  await waitFor("document.querySelector('[data-ob-key]')");
  await type("[data-ob-base]", model.baseUrl);
  await type("[data-ob-model-id]", "launch-fixture");
  await type("[data-ob-key]", standInKey);
  await click(button("model-save"));
  await waitFor(`${ready} && !document.querySelector('[data-action=model]')`);
  assert.equal(await label(), "Continue");
  const connected = await web.get<{ model: string; ai_available: boolean }>("/api/onboarding/context");
  assert.ok(connected.model.includes("launch-fixture") && connected.ai_available);
  assert.equal((await journey()).phase, "failed", "connecting does not restart the journey");
  assert.equal(requests.start, 2);
  await capture("model-connected-en-dark-1024");
  await focus(retry);
  await press("Enter");
  await waitFor(screen("review"), 20_000);
  const reviewed = await journey();
  assert.equal(reviewed.summary?.title, "Launch planning");
  assert.equal(reviewed.summary?.references[0]?.source_id, reference.source_id);
  assert.equal(reviewed.summary?.references[0]?.text.sha256, reference.text.sha256);
  assert.ok(model.bodies.some(body => body.includes("The launch is on Friday.")), "the provider read the original material");
  await type("#cx-project-title", projectName);
  await b.navigate(() => click(button("adopt")));
  await waitFor("location.pathname.startsWith('/projects/')");
  const adopted = await journey();
  assert.equal(adopted.phase, "complete");
  assert.ok(adopted.document_id);
  const projects = await web.get<{ projects: { project_id: string; display_name: string }[] }>("/api/settings/projects");
  assert.equal(projects.projects.find(project => project.project_id === adopted.project_id)?.display_name, projectName);
  const pages = `/projects/${adopted.project_id}/api/plugins/io.molis.work.pages/pages/`;
  const imported = adopted.summary?.references[0]?.documents?.[0];
  assert.ok(imported);
  const saved = await web.get<unknown>(pages + imported);
  assert.match(JSON.stringify(saved), /The launch is on Friday\./u);
  assert.deepEqual(requests, { files: 1, start: 3, adopt: 1, modelSave: 1 });
  t.diagnostic("Onboarding owner retained the material after retry and saved it to Pages; uploads 1, starts 3, adoptions 1, model saves 1.");
});
