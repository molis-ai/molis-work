import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { openGoalBrowser } from "./fixtures/goal-browser.js";
import { REVIEW_EVIDENCE } from "./fixtures/review-evidence.js";

// A person types the new project's name and clicks "创建项目" with the mouse. Leaving the field fires `change`
// before the click submits; that must not save the source selection and re-render the form empty.
test("Onboarding blank start: a typed name survives the mouse click on 创建项目 and the project opens", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project` }, sessionId));
  await waitFor("Boolean(document.querySelector('[data-action=blank]'))");
  await click("[data-action=blank]");
  await waitFor("Boolean(document.getElementById('cx-blank-name'))");

  await evaluate("document.getElementById('cx-blank-name').focus()");
  await command("Input.insertText", { text: "秋季内容计划" }, sessionId);
  assert.equal(await evaluate("document.querySelector('.ob-project-name')?.textContent"), "秋季内容计划", "the preview card names the project as it is typed");

  await navigate(() => click("button[form=cx-blank-form]"));
  await waitFor("location.pathname.startsWith('/projects/')");
  assert.match(String(await evaluate("document.title")), /秋季内容计划/);
});

test("B27-AC03: first use explains a missing project name and can create the corrected project", { timeout: 90_000 }, async t => {
  const browser = await openGoalBrowser(t, "empty");
  if (!browser) return;
  const { command, sessionId, evaluate, waitFor, navigate, click, origin } = browser;
  await browser.setViewport(390, 850);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] }, sessionId);
  await command("Network.setCookie", { name: "molis_work_locale", value: "zh", url: origin }, sessionId);
  await command("Network.enable", {}, sessionId);
  const adoptions: string[] = [];
  t.after(browser.on("Network.requestWillBeSent", (event, session) => {
    const request = event.request as { url: string; method: string };
    if (session === sessionId && request.method === "POST" && /\/api\/onboarding\/context\/[^/]+\/adopt$/.test(new URL(request.url).pathname)) {
      adoptions.push(request.url);
    }
  }));
  await navigate(() => command("Page.navigate", { url: origin + "/" }, sessionId));
  await waitFor("document.body.dataset.onboardingMode === 'first_run' && document.querySelector('.opening')");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'language'");
  await click("[data-action=intro-next]");
  await waitFor("document.querySelector('.welcome')?.dataset.step === 'appearance'");
  await click("[data-theme-option=dark]");
  await click("[data-action=intro-next]");
  await waitFor("Boolean(document.querySelector('[data-action=blank]'))");
  await click("[data-action=blank]");
  await waitFor("Boolean(document.getElementById('cx-blank-name'))");

  const readProjects = async () => (await browser.web.get<{ projects: { project_id: string; display_name: string }[] }>("/api/settings/projects")).projects
    .map(project => ({ id: project.project_id, name: project.display_name }));
  const before = await readProjects();
  const name = "#cx-blank-name", submit = "button[form=cx-blank-form]";
  const enter = async () => {
    const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
    await command("Input.dispatchKeyEvent", { ...key, type: "keyDown", text: "\r", unmodifiedText: "\r" }, sessionId);
    await command("Input.dispatchKeyEvent", { ...key, type: "keyUp" }, sessionId);
  };
  const directory = process.env.MOLIS_CONTENT_CAPTURE || `${REVIEW_EVIDENCE}/batch27-onboarding-name`;
  await mkdir(directory, { recursive: true });
  const capture = async (state: string) => {
    const { data } = await command<{ data: string }>("Page.captureScreenshot", { format: "png" }, sessionId);
    await writeFile(`${directory}/onboarding-name-${state}.png`, Buffer.from(data, "base64"));
  };
  const error = "#cx-blank-name-error";
  const observeInvalid = () => evaluate("window.invalidNames = 0; document.querySelector('#cx-blank-name').addEventListener('invalid', () => window.invalidNames++)");
  const invalid = async (count: number, message: string) => {
    assert.deepEqual(await evaluate(`(() => {
      const field = document.querySelector('${name}'), error = document.querySelector('${error}');
      const rect = error.getBoundingClientRect();
      return [window.invalidNames, document.activeElement === field, field.validity.valueMissing, field.getAttribute('aria-invalid'),
        field.getAttribute('aria-describedby') === error.id, error.checkVisibility() && rect.top >= 0 && rect.bottom <= innerHeight, error.textContent];
    })()`), [count, true, true, "true", true, true, message]);
  };
  const captureMissing = async (locale: string, message: string, count: number) => {
    for (const width of [1440, 1024, 390]) {
      await browser.setViewport(width, 850);
      for (const theme of ["light", "dark"]) {
        await evaluate(`localStorage.setItem('molis-work:theme','${theme}'); dispatchEvent(new StorageEvent('storage',{key:'molis-work:theme',newValue:'${theme}'}))`);
        await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
        await invalid(count, message);
        await capture(`empty-${locale}-${theme}-${width}`);
      }
    }
  };
  await observeInvalid();
  assert.equal(await evaluate(`document.querySelector('${error}').checkVisibility()`), false, "the error does not appear before submission");
  await evaluate("document.querySelector('button[form=cx-blank-form]').focus()");
  await click(submit);
  await invalid(1, "请填写项目名称");
  assert.deepEqual(adoptions, []);
  assert.deepEqual(await readProjects(), before);
  await command("Input.insertText", { text: "秋" }, sessionId);
  assert.deepEqual(await evaluate(`[document.querySelector('${error}').checkVisibility(), document.querySelector('${name}').hasAttribute('aria-invalid')]`), [false, false]);
  await evaluate(`document.querySelector('${name}').select()`);
  await command("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await command("Input.dispatchKeyEvent", { type: "keyUp", key: "Backspace", code: "Backspace", windowsVirtualKeyCode: 8 }, sessionId);
  await enter();
  await invalid(2, "请填写项目名称");
  assert.deepEqual(adoptions, []);
  assert.deepEqual(await readProjects(), before);
  await captureMissing("zh", "请填写项目名称", 2);

  // Spaces pass HTML's required check, but the real Host refuses the trimmed name.
  await command("Input.insertText", { text: "秋" }, sessionId);
  await evaluate(`document.querySelector('${name}').select()`);
  await command("Input.insertText", { text: "   " }, sessionId);
  await click(submit);
  await waitFor(`document.querySelector('${error}')?.textContent.includes('项目名称') && document.querySelector('${error}').checkVisibility()`);
  assert.equal(await evaluate("document.getElementById('cx-blank-name').value"), "   ", "what was typed is still there to correct");
  assert.equal(await evaluate("document.activeElement.id"), "cx-blank-name");
  assert.equal(await evaluate("location.pathname"), "/onboarding");
  assert.equal(adoptions.length, 1);
  assert.deepEqual(await readProjects(), before);
  await capture("spaces-zh-dark-390");

  await command("Input.insertText", { text: "秋季内容计划" }, sessionId);
  assert.deepEqual(await evaluate(`[document.activeElement.id, document.querySelector('${name}').value.trim()]`), ["cx-blank-name", "秋季内容计划"]);
  await navigate(enter);
  await waitFor("location.pathname.startsWith('/projects/')");
  assert.equal(adoptions.length, 2);
  const after = await readProjects();
  const added = after.filter(project => !before.some(old => old.id === project.id));
  assert.deepEqual(added.map(project => project.name), ["秋季内容计划"]);
  assert.equal(await evaluate("decodeURIComponent(location.pathname.split('/')[2])"), added[0]?.id);

  await command("Network.setCookie", { name: "molis_work_locale", value: "en", url: origin }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/onboarding?mode=new-project&start=blank` }, sessionId));
  await waitFor(`document.documentElement.lang === 'en' && document.querySelector('${name}')`);
  await observeInvalid();
  await click(submit);
  await captureMissing("en", "Enter a project name", 1);
  assert.equal(adoptions.length, 2);
  assert.deepEqual(await readProjects(), after);
});
