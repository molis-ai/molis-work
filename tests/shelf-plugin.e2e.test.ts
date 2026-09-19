import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { SAMPLE_PDF_TEXT } from "@molis-ai/molis-work-module-shelf";
import { openGoalBrowser } from "./fixtures/goal-browser.js";

test("Shelf opens in the workbench, extracts the sample PDF, and keeps DropAgent tokens", { timeout: 120_000 }, async (t) => {
  const agentSetting = process.env.MOLIS_WORK_SHELF_AGENT;
  process.env.MOLIS_WORK_SHELF_AGENT = "off";
  t.after(() => {
    if (agentSetting === undefined) delete process.env.MOLIS_WORK_SHELF_AGENT;
    else process.env.MOLIS_WORK_SHELF_AGENT = agentSetting;
  });
  const browser = await openGoalBrowser(t, true);
  if (!browser) return;
  const { evaluate, waitFor, click, command, sessionId, navigate, origin, projectId } = browser;
  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await navigate(() => command("Page.navigate", { url: `${origin}/projects/${projectId}/` }, sessionId));
  await waitFor("document.documentElement.dataset.resolvedTheme === 'light'");
  await waitFor("document.querySelector('[data-plugin-strip] [data-plugin-id=shelf]')");
  await click('[data-plugin-strip] [data-plugin-id="shelf"]');
  await waitFor("document.body.dataset.desktopSurface === 'shelf' && document.querySelector('[data-shelf-stage-shell]') && document.querySelector('[data-workspace]').classList.contains('is-plugin-directory-empty')", 8_000);
  assert.equal(await evaluate("document.querySelector('[data-plugin-section=shelf]')"), null);
  assert.equal(await evaluate("document.querySelector('[data-directory-panel=shelf]')"), null);
  await waitFor("[...document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]')].some(row => row.dataset.shelfName === '试用示例.pdf')", 8_000);
  await click('[data-shelf-list="materials"] [data-shelf-item][data-shelf-name="试用示例.pdf"]');
  await waitFor("document.querySelector('[data-shelf-stage-shell]')?.dataset.expanded === 'true' && document.querySelector('[data-shelf-act=extract]') && document.querySelector('[data-shelf-act=extract]').getAttribute('aria-disabled') !== 'true'");
  assert.equal(await evaluate("document.querySelector('[data-shelf-item][data-shelf-name=\"试用示例.pdf\"]')?.classList.contains('is-on')"), true);
  // DropAgent's row is a tinted kind glyph and the name; the kind itself rides in the preview header.
  const row = await evaluate<{
    glyphColor: string; glyphWidth: number; gap: number; caps: number; name: string; tag: string;
  }>(`(() => {
    const row = document.querySelector('[data-shelf-list=materials] [data-shelf-item][data-shelf-name="试用示例.pdf"]');
    const glyph = row?.querySelector(".shelf-glyph");
    const name = row?.querySelector(".shelf-name");
    if (!row || !glyph || !name) return { glyphColor: "", glyphWidth: -1, gap: -1, caps: -1, name: "", tag: "" };
    const glyphBox = glyph.getBoundingClientRect();
    const nameBox = name.getBoundingClientRect();
    return {
      glyphColor: getComputedStyle(glyph).color,
      glyphWidth: Math.round(glyphBox.width),
      gap: Math.round(nameBox.left - glyphBox.right),
      caps: document.querySelectorAll("[data-shelf=directory] .shelf-cap").length,
      name: name.textContent.trim(),
      tag: document.querySelector("[data-shelf-chrome-tag]")?.textContent.trim() || "",
    };
  })()`);
  assert.equal(row.name, "试用示例.pdf");
  assert.equal(row.caps, 0, JSON.stringify(row));
  assert.equal(row.glyphColor, "rgb(178, 116, 96)");
  assert.equal(row.glyphWidth, 16, JSON.stringify(row));
  assert.ok(row.gap >= 6 && row.gap <= 10, JSON.stringify(row));
  assert.match(row.tag, /PDF/);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--content-side').trim()"), "#F5F5F4");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--hue-slate').trim()"), "#66709e");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--mark-clay').trim()"), "#B27460");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--da-accent').trim()"), "#66709e");
  assert.equal(await evaluate("document.querySelector('[data-shelf-act=summarize]')?.getAttribute('aria-disabled')"), "true");
  assert.equal(await evaluate("document.querySelector('[data-shelf-act=summarize]')?.getAttribute('title')"), "未发现终端 Agent。");
  // 整合 stays on the bar and greys out until a second material joins.
  assert.equal(await evaluate("document.querySelector('[data-shelf-act=combine]')?.getAttribute('aria-disabled')"), "true");
  assert.equal(await evaluate("document.querySelector('[data-shelf-act=combine]')?.getAttribute('title')"), "「整合」至少要两份材料");
  assert.equal(await evaluate("Boolean(document.querySelector('[data-shelf-act-rule]'))"), true);
  assert.equal(await evaluate("document.querySelector('[data-shelf-bar-hint]')?.hidden"), false);
  await click("[data-shelf-more]");
  await waitFor("document.querySelector('[data-shelf-more-menu]') && !document.querySelector('[data-shelf-more-menu]').hidden");
  await click("[data-shelf-arrange]");
  await waitFor("document.querySelector('[data-shelf-hide-act=extract_text]')");
  await click("[data-shelf-hide-act=extract_text]");
  await waitFor("!document.querySelector('[data-shelf-act=extract]') && document.querySelector('[data-shelf-restore-act=extract_text]')");
  await click("[data-shelf-restore-act=extract_text]");
  await waitFor("document.querySelector('[data-shelf-act=extract]')");
  await click("[data-shelf-more]");
  await waitFor("document.querySelector('[data-shelf-more-menu]') && !document.querySelector('[data-shelf-more-menu]').hidden");
  await click("[data-shelf-arrange]");
  await waitFor("!document.querySelector('[data-shelf-hide-act=extract_text]') && document.querySelector('[data-shelf-act=extract]')");
  await click('[data-shelf-act="talk"]');
  await waitFor("document.querySelector('[data-shelf-stage]')?.classList.contains('is-talk')");
  await waitFor("document.querySelector('[data-shelf-tty-screen] .xterm')", 8_000);
  assert.match(await evaluate<string>("document.querySelector('[data-shelf-tty-actor]')?.textContent || ''"), /未发现终端 Agent|发给终端不是副本沙箱/);
  await click('[data-shelf-act="extract"]');
  await waitFor("document.querySelector('[data-shelf-stage]')?.classList.contains('is-confirm')");
  assert.match(await evaluate<string>("document.querySelector('[data-shelf-confirm-title]')?.textContent || ''"), /提取 PDF 文字/);
  assert.match(await evaluate<string>("document.querySelector('[data-shelf-confirm-out]')?.textContent || ''"), /pdf\.md/);
  assert.equal(await evaluate("document.querySelector('[data-shelf-fact=read]')?.textContent"), "1 份材料的副本");
  assert.equal(await evaluate("document.querySelector('[data-shelf-fact=write]')?.textContent"), "仅任务目录");
  assert.equal(await evaluate("document.querySelector('[data-shelf-fact=isolation]')?.textContent"), "本机提取，不发送");
  assert.equal(await evaluate("document.querySelector('[data-shelf-actor]')?.textContent"), "本机提取，不发送。");
  assert.equal(await evaluate("document.querySelector('[data-shelf-choice]')?.hidden"), true);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.shelf-tty')).height"), "72px");
  const dir = ".impeccable/review/shelf-plugin";
  await mkdir(dir, { recursive: true });
  const confirmLight = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/confirm-light.png`, Buffer.from(confirmLight.data, "base64"));
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme = 'dark'");
  await waitFor("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--content-side').trim() === '#111112'");
  const confirmDark = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/confirm-dark.png`, Buffer.from(confirmDark.data, "base64"));
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme = 'light'");
  await waitFor("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--content-side').trim() === '#F5F5F4'");
  await click("[data-shelf-run]");
  await waitFor("[...document.querySelectorAll('[data-shelf-list=results] [data-shelf-item]')].some(row => row.dataset.shelfName === 'pdf.md')", 8_000);
  const preview = await evaluate<string>("document.querySelector('[data-shelf-preview]')?.innerText || ''");
  assert.match(preview, new RegExp(SAMPLE_PDF_TEXT));
  await waitFor("document.querySelector('[data-shelf-stage]')?.classList.contains('is-result')");
  await click("[data-shelf-compare]");
  await waitFor("document.querySelector('[data-shelf-compare-pane=source]') && document.querySelector('[data-shelf-stage]')?.classList.contains('is-compare')");
  const compareText = await evaluate<string>("document.querySelector('[data-shelf-compare-pane=source]')?.innerText || ''");
  assert.match(compareText, /原文/);
  assert.match(compareText, /试用示例/);
  const compareResult = await evaluate<string>("document.querySelector('[data-shelf-compare-pane=result]')?.innerText || ''");
  assert.match(compareResult, new RegExp(SAMPLE_PDF_TEXT));
  assert.equal(await evaluate("document.querySelector('[data-shelf-compare]')?.getAttribute('aria-pressed')"), "true");
  await waitFor("document.querySelector('[data-shelf-edit]') && !document.querySelector('[data-shelf-edit]').hidden");
  await click("[data-shelf-edit]");
  await waitFor("document.querySelector('[data-shelf-editor]') && document.querySelector('[data-shelf-edit]')?.textContent === '完成编辑'");
  assert.equal(await evaluate("document.querySelector('[data-shelf-compare-pane=source] [data-shelf-editor]') === null"), true);
  await evaluate(`(() => {
    const editor = document.querySelector("[data-shelf-editor]");
    if (!editor) throw new Error("missing shelf editor");
    editor.value = editor.value + "\\n编辑过的副本";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  })()`);
  await click("[data-shelf-edit]");
  await waitFor("!document.querySelector('[data-shelf-editor]') && (document.querySelector('[data-shelf-compare-pane=result]')?.innerText || '').includes('编辑过的副本')");
  const sourceAfterEdit = await evaluate<string>("document.querySelector('[data-shelf-compare-pane=source]')?.innerText || ''");
  assert.doesNotMatch(sourceAfterEdit, /编辑过的副本/);
  await click('[data-shelf-list="materials"] [data-shelf-item][data-shelf-name="试用示例.pdf"]');
  await waitFor("document.querySelector('[data-shelf-edit]')?.hidden === true");
  await click('[data-shelf-list="results"] [data-shelf-item][data-shelf-name="pdf.md"]');
  await waitFor("document.querySelector('[data-shelf-compare]')");
  await click("[data-shelf-compare]");
  await waitFor("document.querySelector('[data-shelf-compare-pane=source]') && document.querySelector('[data-shelf-stage]')?.classList.contains('is-compare')");
  const snapshot = await evaluate<{
    materials: Array<{ origin_hash: string; origin_realpath?: string }>;
    results: Array<{ name: string; preview_text: string }>;
    recipes: Array<{ recipe: string; available: boolean }>;
  }>("fetch('/api/shelf',{cache:'no-store'}).then(response => response.json())");
  assert.equal(snapshot.materials[0]?.origin_realpath, undefined);
  assert.equal(snapshot.results[0]?.name, "pdf.md");
  assert.match(snapshot.results[0]?.preview_text ?? "", /编辑过的副本/);
  assert.equal(snapshot.recipes.find((item) => item.recipe === "summarize")?.available, false);
  const clipBody = "本周待办：完善文件预览与结果对照。";
  const beforeMaterials = await evaluate<number>("document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]').length");
  await evaluate(`(async () => {
    await fetch("/api/shelf/clipboard", { method: "POST", headers: molisWorkControlHeaders(), body: JSON.stringify({ text: ${JSON.stringify(clipBody)} }) });
    const current = document.body.dataset.desktopSurface;
    document.body.dataset.desktopSurface = current === "shelf" ? "home" : "shelf";
    document.body.dataset.desktopSurface = "shelf";
  })()`);
  await waitFor(`[...document.querySelectorAll('[data-shelf-clip]')].some(row => row.dataset.shelfName === ${JSON.stringify("本周待办：完善文件预览与结果对照。")})`, 8_000);
  assert.equal(await evaluate("document.querySelector('[data-shelf-current]')?.textContent"), "当前");
  await click('[data-shelf-list="clipboard"] [data-shelf-clip]');
  await waitFor("document.querySelector('[data-shelf-preview]')?.innerText?.includes('点选只预览')");
  assert.equal(await evaluate("document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]').length"), beforeMaterials);
  await click('[data-shelf-act="join"]');
  await waitFor(`document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]').length === ${beforeMaterials + 1}`, 8_000);
  await click('[data-shelf-list="results"] [data-shelf-item][data-shelf-name="pdf.md"]');
  await waitFor("document.querySelector('[data-shelf-compare]')");
  await click("[data-shelf-compare]");
  await waitFor("document.querySelector('[data-shelf-compare-pane=source]') && document.querySelector('[data-shelf-stage]')?.classList.contains('is-compare')");
  const light = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/workbench-light.png`, Buffer.from(light.data, "base64"));
  const overlayOn = await evaluate<boolean>(`(() => {
    const file = new File(["# dropped\\n"], "dropped.md", { type: "text/markdown" });
    const dt = new DataTransfer();
    dt.items.add(file);
    const workbench = document.querySelector("[data-shelf=workbench]");
    workbench.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return workbench.classList.contains("is-drop") && document.querySelector("[data-shelf=directory]").classList.contains("is-drop");
  })()`);
  assert.equal(overlayOn, true);
  assert.match(await evaluate<string>("document.querySelector('[data-shelf=workbench] [data-shelf-drop]')?.innerText || ''"), /加入材料/);
  assert.match(await evaluate<string>("document.querySelector('[data-shelf=directory] [data-shelf-drop]')?.innerText || ''"), /发给终端请拖到轮盘/);
  const dropLight = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/drop-light.png`, Buffer.from(dropLight.data, "base64"));
  await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] }, sessionId);
  await evaluate("document.documentElement.dataset.resolvedTheme = 'dark'");
  await waitFor("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--content-side').trim() === '#111112'");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=directory]')).getPropertyValue('--hue-slate').trim()"), "#a6afd5");
  const dropDark = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/drop-dark.png`, Buffer.from(dropDark.data, "base64"));
  await evaluate(`(() => {
    for (const node of document.querySelectorAll("[data-shelf=workbench], [data-shelf-stage], [data-shelf=directory]")) node.classList.remove("is-drop");
    document.querySelectorAll("[data-shelf-drop]").forEach((node) => node.setAttribute("aria-hidden", "true"));
  })()`);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf=workbench]')).getPropertyValue('--content-paper').trim()"), "#19191B");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-shelf-search]')).backgroundColor === 'rgb(255, 255, 255)'"), false);
  const dark = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
  await writeFile(`${dir}/workbench-dark.png`, Buffer.from(dark.data, "base64"));
  const internalDrag = await evaluate<boolean>(`(() => {
    const dt = new DataTransfer();
    const row = document.querySelector("[data-shelf-item]");
    row.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }));
    document.querySelector("[data-shelf=workbench]").dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
    return document.querySelector("[data-shelf=workbench]").classList.contains("is-drop");
  })()`);
  assert.equal(internalDrag, false);
  const beforeDrop = await evaluate<number>("document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]').length");
  await evaluate(`(async () => {
    const file = new File(["# dropped copy\\n"], "dropped.md", { type: "text/markdown" });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.querySelector("[data-shelf=workbench]").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  })()`);
  await waitFor(`document.querySelectorAll('[data-shelf-list=materials] [data-shelf-item]').length === ${beforeDrop + 1}`, 8_000);
  await waitFor("document.querySelector('[data-shelf-item][data-shelf-name=\"dropped.md\"]')?.classList.contains('is-on')");
  await click('[data-shelf-item][data-shelf-name="dropped.md"] [data-shelf-row-action="hide"]');
  await waitFor("!document.querySelector('[data-shelf-item][data-shelf-name=\"dropped.md\"]')", 8_000);
  await evaluate(`(async () => {
    const file = new File(["# gone\\n"], "gone.md", { type: "text/markdown" });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.querySelector("[data-shelf=workbench]").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
  })()`);
  await waitFor("document.querySelector('[data-shelf-item][data-shelf-name=\"gone.md\"]')", 8_000);
  const goneId = await evaluate<string>("document.querySelector('[data-shelf-item][data-shelf-name=\"gone.md\"]').dataset.shelfItem");
  await click('[data-shelf-item][data-shelf-name="gone.md"] [data-shelf-row-action="delete"]');
  await waitFor("!document.querySelector('[data-shelf-item][data-shelf-name=\"gone.md\"]')", 8_000);
  const deleted = await evaluate<number>(`fetch("/api/shelf/items/" + encodeURIComponent(${JSON.stringify(goneId)}) + "/file").then(response => response.status)`);
  assert.equal(deleted, 404);

  // The settings page is part of the Shelf surface, so it gets the same review
  // shots. Each theme renders from a fresh load: switching mid-page leaves the
  // shot half-way between two palettes.
  for (const theme of ["light", "dark"] as const) {
    await command("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: theme }] }, sessionId);
    await navigate(() => command("Page.navigate", { url: `${origin}/settings/shelf` }, sessionId));
    await waitFor(`document.documentElement.dataset.resolvedTheme === '${theme}'`);
    await waitFor("document.querySelector('[data-shelf-settings-tab=machine]')", 8_000);
    assert.equal(await evaluate("document.querySelectorAll('[data-shelf-settings-tab]').length"), 6);
    assert.equal(await evaluate("document.querySelectorAll('[data-shelf-panel-slot]').length"), 4);
    // The settings surface carries DropAgent's own tokens, not the Coss ones.
    const press = await evaluate<string>("getComputedStyle(document.querySelector('[data-shelf=settings]')).getPropertyValue('--da-press').trim()");
    assert.equal(press, theme === "light" ? "#E8E9EE" : "#28282F");
    // Let the compositor land on the new palette before the shot is taken.
    await evaluate("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))");
    const shot = await command<{ data: string }>("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await writeFile(`${dir}/settings-${theme}.png`, Buffer.from(shot.data, "base64"));
  }
});
