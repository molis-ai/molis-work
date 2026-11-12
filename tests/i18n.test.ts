import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { htmlLang, installHostUiText, localeSetCookie, registeredBuiltinText, resolveWebLocale, runWithLocale, runWithRegisteredText, safeNextPath } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import { renderImagesWorkbench } from "@molis-ai/molis-work-plugin-images";
import { createGoalStateExplainer, type GoalPresentationState } from "@molis-ai/molis-work-plugin-goals";
import { t } from "@molis-ai/molis-work-plugin-sdk/ui";
import { isProductSource, scanTree, summarise, workingTreeSnapshot } from "../scripts/gates/translations.mjs";
import { pagePack, pageTextScript } from "./fixtures/page-text.js";

installHostUiText();
const builtin = (id: string) => {
  const reader = registeredBuiltinText(BUILTIN_PLUGIN_CATALOG.find(entry => entry.project_plugin_id === id)!.manifest);
  assert.ok(reader, id);
  return reader;
};
const asOwner = <T>(id: string, render: () => T) => runWithRegisteredText(builtin(id), render);
const browserWords = (locale: string, ...owners: string[]) => {
  const browser = { document: { documentElement: {} }, t: undefined as typeof t | undefined };
  runInNewContext(pageTextScript(locale, ...owners), browser);
  assert.ok(browser.t);
  return browser.t.text;
};
const SETTINGS = "workbench.shell.settings";
const { explainWorkState } = createGoalStateExplainer(t.text);

test("locale defaults to Chinese, then cookie, then Accept-Language", () => {
  assert.equal(resolveWebLocale(undefined, undefined), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=en", "zh-CN"), "en");
  assert.equal(resolveWebLocale("theme=light; molis_work_locale=zh", "en-US"), "zh");
  assert.equal(resolveWebLocale(undefined, "en-US,en;q=0.9"), "en");
  assert.equal(resolveWebLocale(undefined, "zh-CN,zh;q=0.9,en;q=0.8"), "zh");
  assert.equal(resolveWebLocale("molis_work_locale=de", "fr-FR"), "zh");
  assert.equal(runWithLocale("en", htmlLang), "en");
  assert.equal(runWithLocale("zh", htmlLang), "zh-CN");
  assert.match(localeSetCookie("en"), /molis_work_locale=en/);
});

test("safe next path only allows same-origin relative locations", () => {
  assert.equal(safeNextPath("/settings/runtimes"), "/settings/runtimes");
  assert.equal(safeNextPath("%2Fprojects%2Fdemo%2F"), "/projects/demo/");
  assert.equal(safeNextPath("//evil.example"), "/");
  assert.equal(safeNextPath("https://evil.example"), "/");
  assert.equal(safeNextPath("/ok\nLocation: https://evil.example"), "/");
  assert.equal(safeNextPath(undefined), "/");
});

test("RAC-1317 market relationships format the actual plugin names", () => runWithLocale("en", () => {
  const words = [
    ["workbench.plugin-workbench.removing-also-removes-list", "Removing also removes: Author’s plugin"],
    ["workbench.plugin-workbench.plugins-that-depend-not-added-list", "Plugins that depend on it are not added with it: Author’s plugin"],
    ["workbench.immersive-shell.plugins-that-depend-not-added-list", "; plugins that depend on it are not added with it: Author’s plugin"],
  ];
  for (const [key, expected] of words) assert.equal(t.text(key!, { list: "Author’s plugin" }), expected);
  assert.equal(t.text(SETTINGS), "Settings");
  assert.equal(t.text("workbench.account-menu.not-signed"), "Not signed in");
  assert.equal(t.text("workbench.pane.bound-goal"), "Bound to Goal");
}));

test("every translator call in the product source has a registered English word", () => {
  const repoRoot = fileURLToPath(new URL("..", import.meta.url));
  const scan = scanTree(workingTreeSnapshot(repoRoot), isProductSource);
  const { calls } = summarise(scan), callFiles = scan.files.filter(file => file.calls.length).length;
  assert.ok(calls > 7000 && callFiles > 150, `read ${calls} translator calls in ${callFiles} files`);
  assert.deepEqual(scan.problems, []);
});

test("FSS-36 Goal work states have complete explanations and keep concise Chinese labels", () => {
  const states: [GoalPresentationState, string][] = [
    ["waiting_for_human", "需要你决定"], ["executing", "正在推进"], ["execution_blocked", "可记录，尚不可完成"], ["execution_pending", "可记录"],
    ["satisfied", "已完成"], ["invalidated", "已取消"], ["trashed", "回收站"], ["archived", "已归档"],
  ];
  for (const [state, label] of states) {
    const explain = (locale: string) => runWithLocale(locale, () => asOwner("goals", () => explainWorkState(state)));
    const zh = explain("zh"), en = explain("en");
    assert.equal(zh.label, label, state);
    assert.equal(zh.actionKind, en.actionKind, state);
    for (const field of ["label", "meaning", "nextAction", "howToContinue"] as const) {
      assert.ok(zh[field] && en[field], state);
      assert.notEqual(en[field], zh[field], state);
    }
  }
});

test("FSS-69 Host request locales stay isolated across interleaved async rendering and rejection", async () => {
  let entered!: () => void, finished!: () => void;
  const chineseReady = new Promise<void>(resolve => { entered = resolve; });
  const englishChecked = new Promise<void>(resolve => { finished = resolve; });
  const english = runWithLocale("en", () => asOwner("images", async () => {
    try {
      assert.equal(t.text(SETTINGS), "Settings");
      await chineseReady;
      assert.equal(t.text("images.compose.generate"), "Generate image");
      await assert.rejects(runWithLocale("zh", async () => {
        await Promise.resolve();
        assert.equal(t.text(SETTINGS), "设置");
        throw new Error("render rejected");
      }), /render rejected/);
      assert.equal(t.text(SETTINGS), "Settings");
      assert.equal(htmlLang(), "en");
    } finally { finished(); }
  }));
  const chinese = runWithLocale("zh", () => asOwner("images", async () => {
    entered();
    await englishChecked;
    assert.equal(t.text("images.compose.generate"), "生成图片");
    assert.equal(t.text(SETTINGS), "设置");
    assert.equal(htmlLang(), "zh-CN");
  }));
  await Promise.all([english, chinese]);
});

test("SYS-48 clipboard Copy and Pages Duplicate stay distinct; their exact owner projection is isolated", () => {
  for (const locale of ["zh", "en"] as const) runWithLocale(locale, () => {
    const english = locale === "en", shown = browserWords(locale, "pages");
    for (const read of [t.text, shown]) assert.equal(read("common.control.copy"), english ? "Copy" : "复制");
    assert.equal(asOwner("pages", () => t.text("pages.editor.duplicate")), english ? "Duplicate" : "创建副本");
    assert.equal(shown("pages.editor.duplicate"), english ? "Duplicate" : "创建副本");
    assert.equal(browserWords(locale)("pages.editor.duplicate"), t.text("common.text.unavailable"));
  });
});

test("RAC-56 RAC-57 images words reach their renderer and browser reader in both languages", () => {
  for (const locale of ["zh", "en"] as const) runWithLocale(locale, () => asOwner("images", () => {
    const shown = browserWords(locale, "images"), english = locale === "en";
    const messages = pagePack("images", locale).messages;
    for (const [key, word] of Object.entries(messages)) if (typeof word === "string" && !word.includes("{")) {
      assert.equal(t.text(key), word, key);
      assert.equal(shown(key), word, key);
    }
    assert.equal(t.text("images.result.title"), english ? "Results" : "生成结果");
    const page = renderImagesWorkbench({ primitives: { text: t.text, escape: String } });
    assert.doesNotMatch(page, /images\.(?:compose|service|history|account|result)\./);
    assert.ok(page.includes(english ? "Describe your image" : "描述你想要的图片"));
  }));
});

test("VUX-40 the Pause control is a verb and the paused state is a state in the Host and the browser", () => {
  for (const [locale, verb, state] of [["en", "Pause", "Paused"], ["zh", "暂停", "已暂停"]] as const) runWithLocale(locale, () => {
    for (const read of [t.text, browserWords(locale)]) {
      assert.equal(read("workbench.assistant-dock.pause"), verb);
      assert.equal(read("workbench.assistant-island.paused"), state);
    }
  });
});
